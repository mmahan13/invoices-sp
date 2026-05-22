import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTaxDto } from './dto/create-tax.dto';
import { UpdateTaxDto } from './dto/update-tax.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tax } from './entities/tax.entity';

@Injectable()
export class TaxesService {
  constructor(
    @InjectRepository(Tax)
    private readonly taxRepository: Repository<Tax>,
  ) {}

  create(createTaxDto: CreateTaxDto) {
    return 'This action adds a new tax';
  }

  // Devuelve todos los impuestos activos para el selector de productos
  async findAll(): Promise<Tax[]> {
    return await this.taxRepository.find({
      where: { isActive: true },
      order: { iva: 'ASC' }, // Los ordenamos de menor a mayor IVA
    });
  }

  async findOne(id: string): Promise<Tax> {
    const tax = await this.taxRepository.findOneBy({ id });

    // Si no existe, lanzamos una excepción de NestJS
    if (!tax) {
      throw new NotFoundException(
        `El impuesto con ID ${id} no existe en la base de datos`,
      );
    }

    // Ahora TypeScript sabe que si llega aquí, 'tax' NO es null
    return tax;
  }

  update(id: number, updateTaxDto: UpdateTaxDto) {
    return `This action updates a #${id} tax`;
  }

  remove(id: number) {
    return `This action removes a #${id} tax`;
  }
}
