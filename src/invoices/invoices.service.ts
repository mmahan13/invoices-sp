import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner, Between } from 'typeorm';
import { Invoice } from './entities/invoice.entity';
import { Order } from '../orders/entities/order.entity';
import { User } from '../auth/entities/user.entity';
// 1. Importamos dayjs y sus plugins de zona horaria
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { YearDto } from 'src/common/dto/year.dto';
import { YearResult } from 'src/interfaces/year.model';
import { calculateDocumentSummary } from 'src/common/utilities/calculate-document-summary';

// Activamos los plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Configuramos la zona horaria por defecto para España
const TZ_SPAIN = 'Europe/Madrid';

export interface TraceabilityRow {
  lote: string;
  unidades: number;
  producto: string;
  fecha: string;
  cliente: string;
  nif: string;
  numFactura: string;
}

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
  ) {}

  // Este método será llamado DESDE el OrdersService dentro de su transacción
  async createFromOrder(
    order: Order,
    user: User,
    queryRunner: QueryRunner,
    notes?: string,
  ): Promise<Invoice> {
    const currentYear = new Date().getFullYear();
    if (!order.client) {
      // Si el pedido no trae el cliente, a veces es porque no se cargó la relación en el servicio de pedidos
      throw new Error(
        'El pedido debe tener un cliente asignado para generar la factura',
      );
    }

    // 1. Buscamos el número de la última factura de este usuario en este año
    const lastInvoice = await queryRunner.manager.findOne(Invoice, {
      where: {
        user: { id: user.id },
        year: currentYear,
      },
      order: { sequenceNumber: 'DESC' },
    });

    const nextNumber = lastInvoice ? lastInvoice.sequenceNumber + 1 : 1;

    // 2. Formateamos el número legal (ej: F-2026-001)
    // El .padStart(3, '0') hace que el 1 sea 001
    const formattedNumber = `F-${currentYear}-${nextNumber.toString().padStart(3, '0')}`;

    // 3. Creamos la factura usando el manager de la transacción
    const invoice = queryRunner.manager.create(Invoice, {
      invoiceNumber: formattedNumber,
      sequenceNumber: nextNumber,
      year: currentYear,
      totalAmount: order.totalAmount,
      order: order,
      user: user,
      client: order.client,
      notes: notes,
    });

    return await queryRunner.manager.save(invoice);
  }

  // Listar todas las facturas del usuario (ordenadas de más nueva a más vieja)
  async findAll(user: User, yearDto?: YearDto): Promise<Invoice[]> {
    const filterYear = yearDto?.year ?? new Date().getFullYear();

    return await this.invoiceRepository
      .createQueryBuilder('invoice')
      // Usamos innerJoinAndSelect para filtrar y cargar al mismo tiempo
      .innerJoinAndSelect('invoice.order', 'order')
      // Al usar innerJoin aquí, si el cliente está soft-deleted,
      // TypeORM no lo encontrará y la factura completa se excluirá del resultado.
      .innerJoinAndSelect('order.client', 'client')
      .where('invoice.user_id = :userId', { userId: user.id })
      .andWhere('invoice.year = :year', { year: filterYear })
      .orderBy('invoice.issueDate', 'DESC')
      .getMany();
  }

  async getAvailableYears(user: User): Promise<number[]> {
    const result = await this.invoiceRepository
      .createQueryBuilder('invoice')
      .select('DISTINCT invoice.year', 'year')
      .where('invoice.user = :userId', { userId: user.id })
      .orderBy('year', 'DESC')
      // 1. Le pasamos la interfaz al getRawMany
      .getRawMany<YearResult>();

    // 2. Ahora 'item' ya no es any, es de tipo YearResult
    return result.map((item) => item.year);
  }

  // Ver el detalle completo de una factura
  async findOne(id: string, user: User) {
    const invoice = await this.invoiceRepository.findOne({
      where: { id, user: { id: user.id } },
      relations: [
        'order',
        'order.client',
        'order.items',
        'order.items.product',
        'user',
        'user.company',
      ],
    });

    if (!invoice) {
      throw new NotFoundException(`Factura con ID ${id} no encontrada`);
    }

    // Calculamos el summary solo para esta factura
    const summary = calculateDocumentSummary(invoice.order.items);

    return {
      ...invoice,
      summary,
    };
  }

  /*  async getSalesTaxReport(year: number, user: User) {
    // 2. CREAMOS LAS FECHAS BASADAS EN LA HORA DE MADRID (No en UTC crudo)
    // Así el 1 de enero a las 00:00 de España será exacto.
    const startDate = dayjs.tz(`${year}-01-01 00:00:00`, TZ_SPAIN).toDate();
    const endDate = dayjs.tz(`${year}-12-31 23:59:59`, TZ_SPAIN).toDate();

    const invoices = await this.invoiceRepository.find({
      where: {
        user: { id: user.id },
        issueDate: Between(startDate, endDate),
      },
      relations: ['order', 'order.items'],
    });

    const createEmptyQuarter = () => ({
      totBase: 0,
      totFactura: 0,
      recargo: 0,
      totIva4: 0,
      totIva10: 0,
      totIva21: 0,
      totalIva: 0,
      baseR: 0,
      bi4: 0,
      bi10: 0,
      bi21: 0,
      biT: 0,
    });

    const report = {
      '1T': createEmptyQuarter(),
      '2T': createEmptyQuarter(),
      '3T': createEmptyQuarter(),
      '4T': createEmptyQuarter(),
      ANU: createEmptyQuarter(),
    };

    for (const invoice of invoices) {
      // 3. EXTRAEMOS EL MES CONVIRTIENDO LA FECHA A HORA DE MADRID
      // Ahora, si la BD dice 31 de marzo a las 23:00 UTC, dayjs lo convertirá
      // a 1 de abril 01:00 AM Madrid, y el .month() devolverá Abril (el correcto).
      const month = dayjs(invoice.issueDate).tz(TZ_SPAIN).month();
      const quarter = Math.floor(month / 3) + 1;
      const qKey = `${quarter}T` as '1T' | '2T' | '3T' | '4T';

      for (const item of invoice.order.items) {
        const qty = Number(item.quantity);
        const price = Number(item.priceAtTime);
        let taxRate = Number(item.taxAtTime || 0);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        let reRate = Number((item as any).reAtTime || 0);

        if (taxRate === 11.4 && reRate === 0) {
          taxRate = 10;
          reRate = 1.4;
        } else if (taxRate === 26.2 && reRate === 0) {
          taxRate = 21;
          reRate = 5.2;
        } else if (taxRate === 4.5 && reRate === 0) {
          taxRate = 4;
          reRate = 0.5;
        }

        const baseLinea = price * qty;
        const ivaLinea = baseLinea * (taxRate / 100);
        const reLinea = baseLinea * (reRate / 100);
        const totalLinea = baseLinea + ivaLinea + reLinea;

        const addValues = (key: '1T' | '2T' | '3T' | '4T' | 'ANU') => {
          report[key].totBase += baseLinea;
          report[key].biT += baseLinea;
          report[key].totFactura += totalLinea;
          if (reRate > 0) {
            report[key].recargo += reLinea;
            report[key].baseR += baseLinea;
          }
          report[key].totalIva += ivaLinea + reLinea;

          if (taxRate === 4) {
            report[key].totIva4 += ivaLinea;
            report[key].bi4 += baseLinea;
          } else if (taxRate === 10) {
            report[key].totIva10 += ivaLinea;
            report[key].bi10 += baseLinea;
          } else if (taxRate === 21) {
            report[key].totIva21 += ivaLinea;
            report[key].bi21 += baseLinea;
          }
        };

        addValues(qKey);
        addValues('ANU');
      }
    }

    for (const key of Object.keys(report)) {
      const q = report[key as keyof typeof report];
      for (const prop of Object.keys(q)) {
        q[prop as keyof typeof q] = Number(
          q[prop as keyof typeof q].toFixed(2),
        );
      }
    }

    return report;
  }
 */
  async getTraceabilityData(year: number, user: User) {
    const startDate = dayjs.tz(`${year}-01-01 00:00:00`, TZ_SPAIN).toDate();
    const endDate = dayjs.tz(`${year}-12-31 23:59:59`, TZ_SPAIN).toDate();

    const invoices = await this.invoiceRepository.find({
      where: {
        user: { id: user.id },
        issueDate: Between(startDate, endDate),
      },
      relations: [
        'order',
        'order.client',
        'order.items',
        'order.items.product',
      ],
      order: { issueDate: 'ASC' },
    });

    // Aplanamos los datos: 1 factura con 3 productos -> se convierte en 3 filas de JSON
    const rows: TraceabilityRow[] = [];

    for (const invoice of invoices) {
      const fecha = dayjs(invoice.issueDate).tz(TZ_SPAIN).format('DD/MM/YYYY');

      for (const item of invoice.order.items) {
        rows.push({
          lote: '', // Campo vacío para rellenar
          unidades: Number(item.quantity),
          producto: item.product.productName,
          fecha: fecha,
          cliente: invoice.order.client.businessName,
          nif: invoice.order.client.taxId,
          numFactura: invoice.invoiceNumber,
        });
      }
    }

    return rows;
  }
}
