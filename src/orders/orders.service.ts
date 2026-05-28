import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Order } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { User } from '../auth/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { Client } from '../clients/entities/client.entity';
import { OrderItem } from 'src/orders-items/entities/orders-item.entity';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus } from './enum/order-status.enum';
import { InvoicesService } from 'src/invoices/invoices.service';
import { YearResult } from 'src/interfaces/year.model';
import { YearDto } from 'src/common/dto/year.dto';
import { calculateDocumentSummary } from 'src/common/utilities/calculate-document-summary';
import { OrderWithSummary } from './order-pdf.service';
import { Invoice } from 'src/invoices/entities/invoice.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Client)
    private readonly orderItemRepository: Repository<OrderItem>,

    // Inyectamos el DataSource para manejar transacciones manuales
    private readonly dataSource: DataSource,

    private readonly invoicesService: InvoicesService,
  ) {}

  async create(createOrderDto: CreateOrderDto, user: User) {
    const { clientId, items } = createOrderDto;

    // 1. Validaciones previas (fuera de la transacción para no bloquear la DB)
    const client = await this.validateClient(clientId, user.id);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let totalAmount = 0;
      const orderItemsToInsert: OrderItem[] = [];
      const year = new Date().getFullYear();
      // 1. Buscamos el último número de pedido de este usuario en el año actual
      const lastOrder = await queryRunner.manager.findOne(Order, {
        where: {
          year: year,
          user: { id: user.id },
        },
        order: { orderNumber: 'DESC' }, // Traemos el más alto
      });

      // 2. Calculamos el siguiente número
      const nextNumber = lastOrder ? lastOrder.orderNumber + 1 : 1;

      // 3. Generamos la referencia formateada (Ej: PR-2026-001)
      // padStart añade ceros a la izquierda para que siempre tenga 3 dígitos
      const reference = `PR-${year}-${String(nextNumber).padStart(3, '0')}`;

      for (const item of items) {
        const product = await this.validateProduct(item.productId, user.id);

        // --- LE PASAMOS EL PRECIO CUSTOM DE MANUEL ---
        const lineDetails = this.calculateLineDetails(
          product,
          item.quantity,
          item.price, // <--- NUEVO: Pasamos el precio del DTO
          client.hasEquivalenceSurcharge,
        );

        const orderItem = queryRunner.manager.create(OrderItem, {
          quantity: item.quantity,
          priceAtTime: lineDetails.priceAtTime,
          ivaAtTime: lineDetails.ivaAtTime,
          surchargeAtTime: lineDetails.surchargeAtTime,
          product: product,
        });

        orderItemsToInsert.push(orderItem);
        totalAmount += lineDetails.totalLinea;
      }

      const order = queryRunner.manager.create(Order, {
        client,
        user,
        totalAmount: Number(totalAmount.toFixed(2)),
        items: orderItemsToInsert,
        year: year,
        orderNumber: nextNumber, // Guardamos el número (1, 2, 3...)
        reference: reference,
      });

      const savedOrder = await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();
      return savedOrder;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error; // Re-lanzamos para que Nest gestione la respuesta
    } finally {
      await queryRunner.release();
    }
  }

  // --- MÉTODOS PRIVADOS DE APOYO ---

  private async validateClient(clientId: string, userId: string) {
    const client = await this.clientRepository.findOne({
      where: { id: clientId, user: { id: userId } },
    });
    if (!client) throw new NotFoundException(`Cliente no encontrado`);
    return client;
  }

  private async validateProduct(productId: string, userId: string) {
    const product = await this.productRepository.findOne({
      where: { id: productId, user: { id: userId } },
      relations: ['tax'],
    });
    if (!product)
      throw new BadRequestException(`Producto ${productId} no válido`);
    return product;
  }

  private calculateLineDetails(
    product: Product,
    quantity: number,
    customPrice: number, // <--- Este es el precio BASE (ej: 9€) que envía Angular
    hasEquivalenceSurcharge: boolean,
  ) {
    // 1. Obtenemos los porcentajes
    const ivaPercentage = product.tax ? product.tax.iva : 0;
    const surchargePercentage =
      product.tax && hasEquivalenceSurcharge ? product.tax.surcharge : 0;

    // 2. EL PRECIO BASE YA ES EL QUE VIENE DEL FRONT (¡Sin fórmula inversa!)
    const basePrice = customPrice;

    // 3. Calculamos el subtotal de la línea (Base * Cantidad)
    const subtotalBase = basePrice * quantity; // Ej: 9 * 10 = 90€

    // 4. Calculamos los impuestos
    const ivaAmount = subtotalBase * (ivaPercentage / 100); // Ej: 90 * 10% = 9€
    const surchargeAmount = subtotalBase * (surchargePercentage / 100);

    // 5. Sumamos todo para el total de la línea
    const totalLinea = subtotalBase + ivaAmount + surchargeAmount; // Ej: 90 + 9 = 99€

    return {
      priceAtTime: Number(basePrice.toFixed(4)), // Guardamos los 9€ intactos
      ivaAtTime: ivaPercentage,
      surchargeAtTime: surchargePercentage,
      totalLinea: totalLinea,
    };
  }

  async findAll(user: User, yearDto?: YearDto): Promise<Order[]> {
    const filterYear = yearDto?.year ?? new Date().getFullYear();

    // Cambiamos find() por createQueryBuilder
    const orders = await this.orderRepository
      .createQueryBuilder('order')
      // El INNER JOIN es la clave: si el cliente está "borrado",
      // la orden entera se descarta de los resultados.
      .innerJoinAndSelect('order.client', 'client')
      .where('order.user_id = :userId', { userId: user.id })
      .andWhere('order.year = :year', { year: filterYear })
      .orderBy('order.createdAt', 'DESC')
      .getMany();

    return orders;
  }

  async getAvailableYears(user: User): Promise<number[]> {
    const result = await this.orderRepository
      .createQueryBuilder('order')
      .select('DISTINCT order.year', 'year')
      .where('order.user = :userId', { userId: user.id })
      .orderBy('year', 'DESC')
      // 1. Le pasamos la interfaz al getRawMany
      .getRawMany<YearResult>();

    // 2. Ahora 'item' ya no es any, es de tipo YearResult
    return result.map((item) => item.year);
  }

  async findOne(id: string, user: User) {
    const order = await this.orderRepository.findOne({
      where: {
        id,
        user: { id: user.id },
      },
      relations: [
        'client',
        'items',
        'items.product', // Anidamos para ver la información del producto dentro de cada línea
        'user.company',
      ],
    });

    if (!order) {
      throw new NotFoundException(`Pedido con id ${id} no encontrado`);
    }

    const summary = calculateDocumentSummary(order.items);
    // Añadimos el objeto summary dinámicamente
    return {
      ...order,
      summary,
    } as OrderWithSummary;
  }

  async updateStatus(
    id: string,
    updateOrderStatusDto: UpdateOrderStatusDto,
    user: User,
  ) {
    const { status, notes } = updateOrderStatusDto;

    // 1. Buscamos el pedido
    const order = await this.orderRepository.findOne({
      where: { id, user: { id: user.id } },
      relations: ['items', 'items.product', 'client'],
    });

    if (!order) {
      throw new NotFoundException(`Pedido con id ${id} no encontrado`);
    }

    // --- REGLAS DE NEGOCIO BÁSICAS ---
    if (order.status === status) return order;

    if (order.status === OrderStatus.PAID) {
      throw new BadRequestException(
        'Un pedido ya pagado no puede cambiar de estado.',
      );
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException(
        'No se puede reactivar un pedido cancelado.',
      );
    }

    if (order.status === OrderStatus.VOIDED) {
      throw new BadRequestException(
        'No se puede modificar una factura que ya ha sido anulada.',
      );
    }

    // NUEVA REGLA: No puedes cobrar algo que no has facturado
    if (status === OrderStatus.PAID && order.status === OrderStatus.PENDING) {
      throw new BadRequestException(
        'Debe emitir la factura (INVOICED) antes de poder cobrarla.',
      );
    }

    // --- TRANSACCIÓN ---
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 2. Actualizamos el estado del pedido
      order.status = status;
      const updatedOrder = await queryRunner.manager.save(order);

      // --- LA MAGIA ESTÁ AQUÍ ---

      // CASO A: Manuel acaba de confirmar y emite la factura a 90 días
      if (status === OrderStatus.INVOICED) {
        // 1. Verificamos que no exista ya una factura (por seguridad)
        const existingInvoice = await queryRunner.manager.findOne(Invoice, {
          where: { order: { id: order.id } },
        });

        if (!existingInvoice) {
          // 2. Creamos la factura pasándole la nota (ej: "Pago a 90 días")
          await this.invoicesService.createFromOrder(
            updatedOrder,
            user,
            queryRunner,
            notes,
          );
        }
      }

      // CASO B: Manuel cobra 3 meses después
      if (status === OrderStatus.PAID) {
        // No hacemos NADA en Invoices.
        // ¿Por qué? Porque la vista o frontend de Facturas mirará a invoice.order.status
        // para pintar si está pagada o pendiente.
        // TODO Futuro:
        // - Apuntar el ingreso en un módulo de Contabilidad.
        // - Enviar email automático de "Gracias por su pago" al cliente.
        // - Aquí podrías restar el stock si decides hacerlo al cobrar y no al facturar.
      }

      await queryRunner.commitTransaction();
      return updatedOrder;
    } catch (error) {
      console.log('ERROR REAL:', error);
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException(
        'Error al cambiar el estado del pedido',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async getClientPriceHistory(clientId: string) {
    // 1. Buscamos los últimos 5 pedidos de este cliente (con sus items)
    const orders = await this.dataSource.manager.find(Order, {
      where: { client: { id: clientId } },
      relations: ['items', 'items.product'],
      order: { orderDate: 'DESC' }, // Los más recientes primero
      take: 5, // Miramos en los últimos 5 pedidos
    });

    // 2. Extraemos los productos únicos con su último precio
    const historyMap = new Map();

    for (const order of orders) {
      for (const item of order.items) {
        // Como vamos del pedido más nuevo al más viejo, el primero que encontremos es el más reciente
        if (!historyMap.has(item.product.id)) {
          historyMap.set(item.product.id, {
            id: item.product.id,
            productName: item.product.productName,
            lastPrice: item.priceAtTime,
            date: order.orderDate,
          });
        }
      }
    }

    // Devolvemos solo la lista de los últimos 5 productos distintos comprados
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return Array.from(historyMap.values()).slice(0, 5);
  }

  async updateOrder(
    id: string,
    updateOrderDto: CreateOrderDto,
    user: User,
  ): Promise<Order> {
    const { clientId, items } = updateOrderDto;

    // 1. Validaciones previas (fuera de transacción)
    const client = await this.validateClient(clientId, user.id);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 2. Buscamos el presupuesto existente
      const order = await queryRunner.manager.findOne(Order, {
        where: { id, user: { id: user.id } },
        relations: ['items'],
      });

      if (!order) throw new NotFoundException(`Presupuesto no encontrado`);

      // 3. El Candado: Solo editar si está en PENDING
      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          'Solo se pueden editar presupuestos en estado PENDING',
        );
      }

      // 4. Borramos las líneas antiguas
      if (order.items && order.items.length > 0) {
        await queryRunner.manager.remove(order.items);
      }

      let totalAmount = 0;
      const orderItemsToInsert: OrderItem[] = [];

      // 5. Procesamos las nuevas líneas usando tus métodos privados
      for (const item of items) {
        const product = await this.validateProduct(item.productId, user.id);

        const lineDetails = this.calculateLineDetails(
          product,
          item.quantity,
          item.price, // Precio que viene de Angular
          client.hasEquivalenceSurcharge,
        );

        const orderItem = queryRunner.manager.create(OrderItem, {
          quantity: item.quantity,
          priceAtTime: lineDetails.priceAtTime,
          ivaAtTime: lineDetails.ivaAtTime,
          surchargeAtTime: lineDetails.surchargeAtTime,
          product: product,
          order: order, // Importante vincular a la cabecera
        });

        orderItemsToInsert.push(orderItem);
        totalAmount += lineDetails.totalLinea;
      }

      // 6. Actualizamos la cabecera existente
      order.client = client;
      order.totalAmount = Number(totalAmount.toFixed(2));
      order.items = orderItemsToInsert;
      order.updatedBy = user.id;

      // Guardamos todo (el cascade: true se encarga de los items)
      const savedOrder = await queryRunner.manager.save(order);

      await queryRunner.commitTransaction();
      return savedOrder;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
