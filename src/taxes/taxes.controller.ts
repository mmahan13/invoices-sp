import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { TaxesService } from './taxes.service';
import { CreateTaxDto } from './dto/create-tax.dto';
import { UpdateTaxDto } from './dto/update-tax.dto';
import { Auth } from 'src/auth/decorators';

@Controller('taxes')
export class TaxesController {
  constructor(private readonly taxesService: TaxesService) {}

  @Post()
  @Auth() // Si tienes protección de rutas
  create(@Body() createTaxDto: CreateTaxDto) {
    return this.taxesService.create(createTaxDto);
  }

  @Patch(':id/toggle')
  @Auth()
  toggleStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxesService.toggleStatus(id);
  }

  @Get()
  @Auth() // Si tienes protección de rutas
  findAll(@Query('activeOnly') activeOnly?: string) {
    // Convertimos el string de la query a booleano
    const isFilterActive = activeOnly === 'true';
    return this.taxesService.findAll(isFilterActive);
  }

  @Get(':id')
  @Auth() // Si tienes protección de rutas
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTaxDto: UpdateTaxDto) {
    return this.taxesService.update(+id, updateTaxDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.taxesService.remove(+id);
  }
}
