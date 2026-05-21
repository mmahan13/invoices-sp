import { Invoice } from 'src/invoices/entities/invoice.entity';
import { Order } from 'src/orders/entities/order.entity';
import { Client } from '../entities/client.entity';

// Construimos la respuesta de detalle basada en la Entidad Client
export type ClientDetailResponse = Omit<
  Client,
  'upperCaseInfoClient' | 'orders' | 'invoices'
> & {
  // Sobrescribimos las relaciones con nuestros tipos "limpios" con Label
  orders: OrderResponse[];
  invoices: InvoiceResponse[];

  // Añadimos los campos calculados que no existen en la DB
  totalInvoiced: number;
  totalPendingOrders: number;
};

export enum StatusLabelEnum {
  PRESUPUESTO = 'PRESUPUESTO',
  FACTURADO = 'FACTURADO',
  ANULADO = 'ANULADO',
  FACTURADA = 'FACTURADA',
  FACTURADA_PEND_COBRO = 'FACTURADA (Pend. Cobro)',
  COBRADA = 'COBRADA',
  CANCELADA = 'CANCELADA',
}

// Omitimos los métodos que dan guerra y añadimos el label
export type OrderResponse = Omit<Order, 'setYearAndNumber'> & {
  statusLabel: StatusLabelEnum;
};
export type InvoiceResponse = Invoice & { statusLabel: StatusLabelEnum };
