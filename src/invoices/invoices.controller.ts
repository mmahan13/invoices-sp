import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';

import { InvoicesService } from './invoices.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Auth } from 'src/auth/decorators';
import { User } from 'src/auth/entities/user.entity';
import { InvoicePdfService, InvoiceWithSummary } from './invoice-pdf.service';
import { YearDto } from 'src/common/dto/year.dto';
import express from 'express';
import { Invoice } from './entities/invoice.entity';

@Controller('invoices')
@UseInterceptors(ClassSerializerInterceptor) //activa los excludes en product entity y client entity
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  @Get()
  @Auth()
  findAll(
    @GetUser() user: User,
    @Query() yearDto?: YearDto,
  ): Promise<Invoice[]> {
    return this.invoicesService.findAll(user, yearDto);
  }

  @Get('years')
  @Auth()
  getAvailableYears(@GetUser() user: User): Promise<number[]> {
    return this.invoicesService.getAvailableYears(user);
  }

  @Get(':id')
  @Auth()
  findOne(@Param('id', ParseUUIDPipe) id: string, @GetUser() user: User) {
    return this.invoicesService.findOne(id, user);
  }

  @Get(':id/pdf')
  @Auth()
  async getPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
    @Res() res: express.Response, // <--- Usamos el alias aquí
  ) {
    try {
      // 1. Obtenemos la factura "vitaminada" (ya trae el summary)
      // Tipamos explícitamente para que el linter sepa qué estamos pasando al PDF
      const invoice: InvoiceWithSummary = await this.invoicesService.findOne(
        id,
        user,
      );

      // 2. Generamos el buffer
      const buffer = await this.invoicePdfService.generatePdf(invoice);

      // 3. Configuramos las cabeceras
      // Es buena práctica usar nombres de archivo limpios (sin espacios raros)
      const fileName = invoice.invoiceNumber
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}.pdf"`,
        'Content-Length': buffer.length,
      });

      // 4. Enviamos y cerramos
      res.end(buffer);
    } catch (error) {
      // Si el error es un 404 (de findOne), lo dejamos pasar tal cual
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error('PDF Generation Error:', error);
      throw new InternalServerErrorException(
        'Error interno al generar el documento PDF',
      );
    }
  }

  @Get('reports/taxes/sales/:year')
  @Auth() // Protegido con JWT
  async getSalesTaxReport(
    @Param('year', ParseIntPipe) year: number,
    @GetUser() user: User,
  ) {
    try {
      const report = await this.invoicesService.getSalesTaxReport(year, user);
      return {
        message: `Informe de impuestos de ventas para el año ${year}`,
        year: year,
        data: report,
      };
    } catch (error) {
      console.error('Error:', error);
      throw new InternalServerErrorException(
        'Error al generar el informe de impuestos',
      );
    }
  }

  @Get('reports/traceability/data/:year')
  @Auth()
  async getTraceabilityData(
    @Param('year', ParseIntPipe) year: number,
    @GetUser() user: User,
  ) {
    try {
      const data = await this.invoicesService.getTraceabilityData(year, user);
      return {
        year,
        totalRows: data.length,
        data: data,
      };
    } catch (error) {
      console.error('Error:', error);
      throw new InternalServerErrorException(
        'Error al obtener datos de trazabilidad',
      );
    }
  }
}
