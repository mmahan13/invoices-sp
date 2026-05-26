import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { DocumentSummary } from 'src/common/utilities/calculate-document-summary';
import { Invoice } from './entities/invoice.entity';
export type InvoiceWithSummary = Invoice & { summary: DocumentSummary };

@Injectable()
export class InvoicePdfService {
  async generatePdf(invoice: InvoiceWithSummary): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: Error) => reject(err));

        // 1. Cabecera (Tipada)
        this.drawHeader(doc, invoice);

        // 2. Datos del cliente
        doc.font('Helvetica-Bold').fontSize(11).text('Facturar a:', 50, 155);
        doc
          .font('Helvetica')
          .fontSize(10)
          .text(invoice.order.client.businessName, 50, 170)
          .text(`NIF: ${invoice.order.client.taxId}`, 50, 185)
          .text(invoice.order.client.address, 50, 200);

        let currentY = 240;
        this.drawTableHeaders(doc, currentY);
        currentY += 25;

        // 3. Filas de productos (Tipadas mediante la relación de Invoice)
        doc.font('Helvetica').fontSize(10);
        invoice.order.items.forEach((item) => {
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
        this.drawFooter(doc, invoice, currentY);

        doc.end();
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  // --- MÉTODOS PRIVADOS TIPADOS ---

  private drawHeader(d: PDFKit.PDFDocument, inv: InvoiceWithSummary): void {
    const company = inv.user.company;

    d.font('Helvetica-Bold')
      .fontSize(14)
      .text(company?.businessName || 'Sabor a Miel S.L.', 50, 50);

    d.font('Helvetica').fontSize(10);
    d.text(`NIF: ${company?.taxId || 'B12345678'}`, 50, 68);
    d.text(`Domicilio: ${company?.address || 'C/ Abejas 12, Mijas'}`, 50, 82);
    d.text(`Teléfono: ${company?.phone || '600123456'}`, 50, 96);
    d.text(`IBAN: ${company?.bankAccount || 'ES91...'}`, 50, 110);

    d.font('Helvetica-Bold')
      .fontSize(12)
      .text(`FACTURA: ${inv.invoiceNumber}`, 300, 50, {
        width: 250,
        align: 'right',
      });

    d.font('Helvetica')
      .fontSize(10)
      .text(
        `Fecha: ${new Date(inv.issueDate).toLocaleDateString('es-ES')}`,
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

  private drawFooter(
    doc: PDFKit.PDFDocument,
    inv: InvoiceWithSummary,
    currentY: number,
  ): void {
    // Si queda poco espacio al final, saltamos de página para el bloque de firmas/totales
    let summaryY = currentY + 30;
    if (summaryY > 650) {
      doc.addPage();
      summaryY = 50;
    }

    const hasRE = inv.summary.reTotal > 0;

    // Línea separadora
    doc
      .moveTo(50, summaryY - 10)
      .lineTo(550, summaryY - 10)
      .stroke();

    // Encabezados del desglose (Usa inv.summary directamente)
    doc.font('Courier-Bold').fontSize(9);
    doc.text('BASE IMPONIBLE', 50, summaryY, { width: 100, align: 'left' });
    doc.text('IVA', 160, summaryY, { width: 50, align: 'center' });
    doc.text('CUOTA IVA', 220, summaryY, { width: 80, align: 'right' });

    if (hasRE) {
      doc.text('RE', 310, summaryY, { width: 50, align: 'center' });
      doc.text('CUOTA RE', 370, summaryY, { width: 80, align: 'right' });
    }

    summaryY += 15;

    // Dibujamos los grupos que YA vienen calculados del backend
    doc.font('Courier').fontSize(9);
    inv.summary.taxGroups.forEach((group) => {
      doc.text(`${group.base.toFixed(2)} €`, 50, summaryY, {
        width: 100,
        align: 'left',
      });
      doc.text(`${group.taxRate}%`, 160, summaryY, {
        width: 50,
        align: 'center',
      });
      doc.text(`${group.iva.toFixed(2)} €`, 220, summaryY, {
        width: 80,
        align: 'right',
      });

      if (hasRE) {
        doc.text(`${group.reRate}%`, 310, summaryY, {
          width: 50,
          align: 'center',
        });
        doc.text(`${group.re.toFixed(2)} €`, 370, summaryY, {
          width: 80,
          align: 'right',
        });
      }
      summaryY += 12;
    });

    // TOTAL FINAL (El que manda)
    summaryY += 20;
    doc.rect(350, summaryY, 200, 40).fill('#f8fafc').stroke('#e2e8f0');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(12);
    doc.text('TOTAL FACTURA:', 360, summaryY + 12, { width: 100 });
    doc.text(`${inv.summary.totalFinal.toFixed(2)} €`, 460, summaryY + 12, {
      width: 80,
      align: 'right',
    });
  }
}
