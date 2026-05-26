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

  async create(createTaxDto: CreateTaxDto) {
    const tax = this.taxRepository.create(createTaxDto);
    return await this.taxRepository.save(tax);
  }

  async toggleStatus(id: string) {
    const tax = await this.taxRepository.findOneBy({ id });
    if (!tax) throw new NotFoundException('Impuesto no encontrado');

    tax.isActive = !tax.isActive;
    return await this.taxRepository.save(tax);
  }

  async findAll(activeOnly: boolean = false): Promise<Tax[]> {
    const whereCondition = activeOnly ? { isActive: true } : {};

    return await this.taxRepository.find({
      where: whereCondition, // Si activeOnly es false, el objeto es {}, trae TODO
      order: { iva: 'ASC' },
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
    console.log(updateTaxDto);
    return `This action updates a #${id} tax`;
  }

  remove(id: number) {
    return `This action removes a #${id} tax`;
  }
}
