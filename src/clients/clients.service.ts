import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { User } from 'src/auth/entities/user.entity';
import { getTenantWhere } from 'src/common/utils/tenant.util';
import { OrderStatus } from 'src/orders/enum/order-status.enum';
import {
  ClientDetailResponse,
  StatusLabelEnum,
} from './models/client-detail-response.model';

@Injectable()
export class ClientsService {
  private readonly logger = new Logger('ClientsService');

  constructor(
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async create(createClientDto: CreateClientDto, user: User): Promise<Client> {
    try {
      // Instanciamos el cliente y le asignamos directamente su dueño
      const client = this.clientRepository.create({
        ...createClientDto,
        user,
      });
      return await this.clientRepository.save(client);
    } catch (error) {
      this.handlerDBExceptions(error);
    }
  }

  async findAll(user: User): Promise<Client[]> {
    return await this.clientRepository
      .createQueryBuilder('client')
      // 1. Filtramos por el usuario logueado
      .where('client.user = :userId', { userId: user.id })

      // 2. Esta es la magia: cuenta las facturas y las mete en 'invoicesCount'
      // 'client.invoices' debe ser el nombre de la relación @OneToMany
      .loadRelationCountAndMap('client.invoicesCount', 'client.invoices')

      // 3. Ordenamos como tenías antes
      .orderBy('client.createdAt', 'DESC')

      .getMany();
  }

  async findOne(id: string, user: User): Promise<Client> {
    const client = await this.clientRepository.findOne({
      // Le pasamos el user y las condiciones extra que necesitamos (el id del cliente)
      where: getTenantWhere<Client>(user, { id }),
      relations: ['invoices', 'orders'],
    });

    if (!client) {
      throw new NotFoundException(`El cliente con ID ${id} no existe`);
    }
    // Llamamos al método de transformación antes de devolverlo
    return client;
  }

  async findOneByClientDetail(
    id: string,
    user: User,
  ): Promise<ClientDetailResponse> {
    const client = await this.clientRepository.findOne({
      // Le pasamos el user y las condiciones extra que necesitamos (el id del cliente)
      where: getTenantWhere<Client>(user, { id }),
      relations: ['invoices', 'orders'],
    });

    if (!client) {
      throw new NotFoundException(`El cliente con ID ${id} no existe`);
    }
    // Llamamos al método de transformación antes de devolverlo
    return this.prepareClientResponse(client);
  }

  private prepareClientResponse(client: Client): ClientDetailResponse {
    let totalInvoiced = 0;
    let totalPendingOrders = 0;

    // 1. Procesar Órdenes (Presupuestos)
    const formattedOrders = (client.orders || []).map((order) => {
      // Cálculo de totales basado en el estado de la orden
      if (
        order.status === OrderStatus.PAID ||
        order.status === OrderStatus.INVOICED
      ) {
        totalInvoiced += Number(order.totalAmount);
      } else if (order.status === OrderStatus.PENDING) {
        totalPendingOrders += Number(order.totalAmount);
      }

      // Mapeo de etiquetas según tus reglas
      let statusLabel = StatusLabelEnum.PRESUPUESTO;
      if (order.status === OrderStatus.PENDING)
        statusLabel = StatusLabelEnum.PRESUPUESTO;
      else if (
        order.status === OrderStatus.PAID ||
        order.status === OrderStatus.INVOICED
      )
        statusLabel = StatusLabelEnum.FACTURADO;
      else if (
        order.status === OrderStatus.CANCELLED ||
        order.status === OrderStatus.VOIDED
      )
        statusLabel = StatusLabelEnum.ANULADO;

      return {
        ...order,
        statusLabel, // Enviamos la etiqueta ya cocinada
      };
    });

    // 2. Procesar Facturas
    // Como dices que el status real vive en la Orden, si la factura no lo tiene,
    // buscamos la orden asociada o usamos el mapeo contable
    const formattedInvoices = (client.invoices || []).map((invoice) => {
      // Buscamos la orden que generó esta factura para saber su estado de cobro
      const relatedOrder = client.orders.find(
        (o) => o.totalAmount === invoice.totalAmount,
      ); // O por ID si tienes la relación
      const orderStatus = relatedOrder?.status || OrderStatus.PAID;

      let statusLabel = StatusLabelEnum.FACTURADA;
      if (orderStatus === OrderStatus.PAID)
        statusLabel = StatusLabelEnum.COBRADA;
      else if (orderStatus === OrderStatus.INVOICED)
        statusLabel = StatusLabelEnum.FACTURADA_PEND_COBRO;
      else if (
        orderStatus === OrderStatus.CANCELLED ||
        orderStatus === OrderStatus.VOIDED
      )
        statusLabel = StatusLabelEnum.CANCELADA;

      return {
        ...invoice,
        statusLabel,
      };
    });

    // Retornamos el objeto plano con los extras
    return {
      ...client,
      totalInvoiced,
      totalPendingOrders,
      orders: formattedOrders,
      invoices: formattedInvoices,
    };
  }

  async update(
    id: string,
    updateClientDto: UpdateClientDto,
    user: User,
  ): Promise<Client> {
    // 1. Buscamos el cliente (el findOne ya comprueba que le pertenece o si es Admin)
    const client = await this.findOne(id, user);

    // 2. Mezclamos los datos
    this.clientRepository.merge(client, updateClientDto);

    // 3. Dejamos rastro de quién hizo la actualización (Incluso si fue un Admin)
    client.updatedBy = user.id;

    try {
      return await this.clientRepository.save(client);
    } catch (error) {
      this.handlerDBExceptions(error);
    }
  }

  async remove(id: string, user: User): Promise<void> {
    // Reutilizamos el findOne para asegurarnos de que el cliente existe y es suyo (o es Admin) antes de borrarlo
    await this.findOne(id, user);
    await this.clientRepository.softDelete(id);
  }

  private handlerDBExceptions(error: any): never {
    // Error 23505: NIF/CIF duplicado
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (error.code === '23505') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      throw new BadRequestException(error.detail);
    }

    this.logger.error(error);
    throw new InternalServerErrorException(
      'Error inesperado, revisa los logs del servidor',
    );
  }
}
