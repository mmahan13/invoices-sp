import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { Tax } from '../taxes/entities/tax.entity'; // Asegúrate de que la ruta coincida
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { User } from 'src/auth/entities/user.entity';
import { PaginatedResponse } from 'src/interfaces/paginate-response.model';
import { getTenantWhere } from 'src/common/utils/tenant.util';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger('ProductsService');
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    // Inyectamos el repositorio de Tax para comprobar que el ID es real
    @InjectRepository(Tax)
    private readonly taxRepository: Repository<Tax>,
  ) {}

  async create(
    createProductDto: CreateProductDto,
    user: User,
  ): Promise<Product> {
    const { taxId, productName, ...productDetails } = createProductDto;

    const normalizedName = productName.toUpperCase().trim();

    // 1. Verificamos el impuesto (Esto lo mantenemos para dar un 404 claro si falla)
    const tax = await this.taxRepository.findOneBy({ id: taxId });
    if (!tax) {
      throw new NotFoundException(
        `El impuesto con ID ${taxId} no existe en la base de datos`,
      );
    }

    // 2. Preparamos el producto
    const product = this.productRepository.create({
      ...productDetails,
      productName: normalizedName,
      user,
      tax: tax,
    });
    try {
      return await this.productRepository.save(product);
    } catch (error) {
      this.handlerDBExceptions(error);
    }
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    user: User,
  ): Promise<Product> {
    const { taxId, ...baseData } = updateProductDto;
    const product = await this.findOne(id, user);

    this.productRepository.merge(product, baseData);

    if (taxId) {
      const tax = await this.taxRepository.findOneBy({ id: taxId });
      if (!tax) {
        throw new NotFoundException(
          `El impuesto con ID ${taxId} no existe en la base de datos`,
        );
      }
      product.tax = tax;
    }
    product.updatedBy = user.id;

    try {
      return await this.productRepository.save(product);
    } catch (error) {
      this.handlerDBExceptions(error);
    }
  }

  async findOne(id: string, user: User): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: getTenantWhere<Product>(user, { id }),
    });
    if (!product) {
      throw new NotFoundException(`El producto con ID ${id} no existe`);
    }
    return product;
  }

  async findAll(
    paginationDto: PaginationDto,
    user: User,
  ): Promise<PaginatedResponse<Product>> {
    const { page = 1, limit = 60 } = paginationDto;
    const skip = (page - 1) * limit;

    const [products, total] = await this.productRepository.findAndCount({
      skip,
      take: limit,
      where: getTenantWhere<Product>(user),
      relations: ['tax'], // <--- Traemos el impuesto, pero NO el usuario
      order: { productName: 'ASC' }, // Mejor ordenarlos por nombre para Manuel
    });

    return {
      data: products,
      meta: {
        totalItems: total,
        itemCount: products.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }
  async remove(id: string, user: User): Promise<void> {
    await this.findOne(id, user);
    await this.productRepository.softDelete(id);
  }

  private handlerDBExceptions(error: any): never {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (error.code === '23505') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      throw new BadRequestException(error.detail);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (error.code === '23503') {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      throw new BadRequestException(error.detail);
    }
    this.logger.error(error);
    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );
  }
}
