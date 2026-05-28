import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { DocumentSummary } from 'src/common/utilities/calculate-document-summary';
import { Order } from './entities/order.entity';

export type OrderWithSummary = Order & { summary: DocumentSummary };

@Injectable()
export class OrderPdfService {
  async generatePdf(order: OrderWithSummary): Promise<Buffer> {
    // Reemplaza 'any' por tu tipo OrderWithSummary
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: Error) => reject(err));

        // 1. Cabecera
        this.drawHeader(doc, order);

        // 2. Datos del cliente
        doc.font('Helvetica-Bold').fontSize(11).text('Presupuesto a:', 50, 155);
        doc
          .font('Helvetica')
          .fontSize(10)
          .text(order.client.businessName, 50, 170)
          .text(`NIF: ${order.client.taxId}`, 50, 185)
          .text(order.client.address, 50, 200);
        let currentY = 240;
        this.drawTableHeaders(doc, currentY);
        currentY += 25;

        // 3. Filas de productos
        doc.font('Helvetica').fontSize(10);
        order.items.forEach((item) => {
          const baseLinea = item.priceAtTime * item.quantity;
          const totalLinea =
            baseLinea * (1 + (item.ivaAtTime + item.surchargeAtTime) / 100);

          if (currentY > 700) {
            doc.addPage();
            currentY = 50;
            this.drawTableHeaders(doc, currentY);
            currentY += 25;
          }

          doc.text(item.quantity.toString(), 50, currentY, {
            width: 60,
            align: 'center',
          });
          doc.text(item.product.productName, 120, currentY);
          doc.text(`${item.priceAtTime.toFixed(2)} €`, 330, currentY, {
            width: 70,
            align: 'right',
          });

          const taxText =
            item.surchargeAtTime > 0
              ? `${item.ivaAtTime}% / ${item.surchargeAtTime}%`
              : `${item.ivaAtTime}%`;

          doc.text(taxText, 410, currentY, { width: 60, align: 'right' });
          doc.text(`${totalLinea.toFixed(2)} €`, 480, currentY, {
            width: 70,
            align: 'right',
          });

          currentY += 20;
        });

        // 4. Bloque de impuestos y totales
        if (currentY > 640) doc.addPage();
        this.drawFooter(doc, order);

        doc.end();
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  // --- MÉTODOS PRIVADOS ---

  private drawHeader(d: PDFKit.PDFDocument, order: OrderWithSummary): void {
    // Si tienes los datos de la empresa en el payload del Order, cámbialo.
    // Si no, pon los genéricos de Sabor a Miel.
    const company = order.user.company;
    d.font('Helvetica-Bold')
      .fontSize(14)
      .text(`${order.user.company.businessName}`, 50, 50);

    d.font('Helvetica').fontSize(10);
    d.text(`NIF: ${company.taxId}`, 50, 68);
    d.text(`Domicilio: ${company.address}`, 50, 82);
    d.text(`Teléfono: ${company.phone}`, 50, 96);
    d.text(`IBAN: ${company.bankAccount}`, 50, 110);

    d.font('Helvetica-Bold')
      .fontSize(12)
      .text(`PRESUPUESTO: ${order.reference}`, 300, 50, {
        // Usamos el campo reference (Ej: PR-2026-013)
        width: 250,
        align: 'right',
      });

    d.font('Helvetica')
      .fontSize(10)
      .text(
        `Fecha: ${new Date(order.orderDate).toLocaleDateString('es-ES')}`,
        300,
        68,
        { width: 250, align: 'right' },
      );

    d.moveTo(50, 135).lineTo(550, 135).stroke();
  }

  private drawTableHeaders(d: PDFKit.PDFDocument, yPos: number): void {
    d.font('Helvetica-Bold').fontSize(10);
    d.text('Uds.', 50, yPos, { width: 60, align: 'center' });
    d.text('Producto', 120, yPos);
    d.text('Precio U.', 330, yPos, { width: 70, align: 'right' });
    d.text('IVA / R.E.', 410, yPos, { width: 60, align: 'right' });
    d.text('Total', 480, yPos, { width: 70, align: 'right' });
    d.moveTo(50, yPos + 15)
      .lineTo(550, yPos + 15)
      .stroke();
  }

  private drawFooter(doc: PDFKit.PDFDocument, order: OrderWithSummary): void {
    let summaryY = 680;
    const hasRE = order.summary.reTotal > 0;

    doc
      .moveTo(50, summaryY - 15)
      .lineTo(550, summaryY - 15)
      .stroke();
    doc.font('Courier-Bold').fontSize(10);
    doc.text('BASE IMP.', 50, summaryY, { width: 110, align: 'center' });
    doc.text('% IVA', 170, summaryY, { width: 60, align: 'center' });
    doc.text('CUOTA IVA', 240, summaryY, { width: 80, align: 'center' });

    if (hasRE) {
      doc.text('% R.E.', 330, summaryY, { width: 60, align: 'center' });
      doc.text('CUOTA R.E.', 400, summaryY, { width: 80, align: 'center' });
    }

    doc
      .moveTo(50, summaryY + 15)
      .lineTo(550, summaryY + 15)
      .stroke();
    summaryY += 25;

    doc.font('Courier').fontSize(10);
    // Quitamos el ": any". Ahora TypeScript sabe que "group" es de tipo "TaxBreakdown"
    order.summary.taxGroups.forEach((group) => {
      doc.text(`${group.base.toFixed(2)} €`, 50, summaryY, {
        width: 110,
        align: 'center',
      });
      doc.text(`${group.taxRate}%`, 170, summaryY, {
        width: 60,
        align: 'center',
      });
      doc.text(`${group.iva.toFixed(2)} €`, 240, summaryY, {
        width: 80,
        align: 'center',
      });

      if (hasRE) {
        doc.text(
          `${group.reRate > 0 ? group.reRate + '%' : '-'}`,
          330,
          summaryY,
          { width: 60, align: 'center' },
        );
        doc.text(
          `${group.re > 0 ? group.re.toFixed(2) + ' €' : '-'}`,
          400,
          summaryY,
          { width: 80, align: 'center' },
        );
      }
      summaryY += 15;
    });

    summaryY += 15;
    doc.font('Helvetica-Bold').fontSize(14);
    doc.text('TOTAL:', 200, summaryY, { width: 200, align: 'right' });
    doc.text(`${order.summary.totalFinal.toFixed(2)} €`, 420, summaryY, {
      width: 130,
      align: 'right',
    });
  }
}
