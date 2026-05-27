import {
  Controller,
  Post,
  Body,
  Get,
  ParseUUIDPipe,
  Param,
  UseInterceptors,
  ClassSerializerInterceptor,
  Patch,
  Query,
  Res,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Auth } from '../auth/decorators/auth.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/entities/user.entity';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { YearDto } from 'src/common/dto/year.dto';
import { Order } from './entities/order.entity';
import express from 'express';
import { OrderPdfService, OrderWithSummary } from './order-pdf.service';
@Controller('orders')
@UseInterceptors(ClassSerializerInterceptor) //activa los excludes en product entity y client entity
@Auth()
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly orderPdfService: OrderPdfService,
  ) {}

  @Post()
  @Auth() // Protege la ruta (se necesita Token JWT)
  create(
    @Body() createOrderDto: CreateOrderDto,
    @GetUser() user: User, // Extrae al usuario automáticamente del token
  ) {
    return this.ordersService.create(createOrderDto, user);
  }

  @Get('years')
  @Auth()
  getAvailableYears(@GetUser() user: User): Promise<number[]> {
    return this.ordersService.getAvailableYears(user);
  }

  @Get(':id')
  @Auth()
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.ordersService.findOne(id, user);
  }

  @Get()
  @Auth()
  findAll(@GetUser() user: User, @Query() yearDto?: YearDto): Promise<Order[]> {
    return this.ordersService.findAll(user, yearDto);
  }

  @Patch(':id/status')
  @Auth()
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
    @GetUser() user: User,
  ) {
    return this.ordersService.updateStatus(id, updateOrderStatusDto, user);
  }

  @Patch(':id')
  @Auth()
  updateOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateOrderDto: CreateOrderDto, // Reutilizamos el DTO de creación
    @GetUser() user: User,
  ): Promise<Order> {
    return this.ordersService.updateOrder(id, updateOrderDto, user);
  }

  @Get('client/:clientId/history')
  @Auth()
  getClientPriceHistory(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.ordersService.getClientPriceHistory(clientId);
  }

  @Get(':id/pdf')
  @Auth() // Protegemos la ruta
  async getPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User, // Obtenemos el usuario autenticado
    @Res() res: express.Response,
  ) {
    try {
      // 1. Obtenemos el presupuesto "vitaminado" filtrando por usuario
      // El findOne debe recibir el ID y el USER para validar la propiedad
      const order: OrderWithSummary = await this.ordersService.findOne(
        id,
        user,
      );

      // 2. Generamos el buffer con el servicio de PDF
      const buffer = await this.orderPdfService.generatePdf(order);
      // 3. Configuramos las cabeceras con un nombre de archivo limpio
      // Usamos la referencia del presupuesto (ej: PR_2026_013)
      const rawFileName: string = String(
        order.orderNumber || order.id || 'presupuesto',
      );
      const fileName: string = rawFileName
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="presupuesto_${fileName}.pdf"`,
        'Content-Length': buffer.length,
      });

      // 4. Enviamos el buffer y cerramos la respuesta
      res.end(buffer);
    } catch (error) {
      // Si es un 404 lo lanzamos tal cual
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error('Order PDF Generation Error:', error);
      throw new InternalServerErrorException(
        'Error interno al generar el documento PDF del presupuesto',
      );
    }
  }
}
