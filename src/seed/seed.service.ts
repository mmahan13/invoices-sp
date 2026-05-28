import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from '../auth/entities/user.entity';
import { Tax } from '../taxes/entities/tax.entity';
import { Product } from '../products/entities/product.entity';
import { Client } from '../clients/entities/client.entity';
import { Company } from 'src/company/entities/company.entity';
import {
  SEED_CLIENTS,
  SEED_COMPANY,
  SEED_PRODUCTS,
  SEED_TAXES,
  SEED_USERS,
} from './seed-data';
import { OrderItem } from 'src/orders-items/entities/orders-item.entity';
import { Order } from 'src/orders/entities/order.entity';

// Importamos nuestros datos de prueba

@Injectable()
export class SeedService {
  private readonly logger = new Logger('SeedService');

  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Tax) private readonly taxRepository: Repository<Tax>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
  ) {}

  async runSeed() {
    this.logger.log('Iniciando proceso de Seed...');

    await this.deleteDatabase();

    // 1. Insertar Usuarios
    const users = await this.insertUsers();
    const manuelUser = users.find(
      (u) => u.email === 'mielfuentesburgos@gmail.com',
    );

    // 2. Insertar Empresa (vinculada a Manuel)
    await this.insertCompany(manuelUser!);

    // 3. Insertar Impuestos
    const taxes = await this.insertTaxes();

    // 4. Insertar Productos y Clientes (vinculados a Manuel)
    await this.insertProducts(manuelUser!, taxes);
    await this.insertClients(manuelUser!);

    this.logger.log('Seed ejecutado con éxito!');
    return { message: 'Seed ejecutado con éxito' };
  }

  private async deleteDatabase() {
    // 1. Borramos el nivel más profundo (Las líneas de los pedidos)
    await this.orderItemRepository.createQueryBuilder().delete().execute();
    // 2. Borramos las cabeceras de los pedidos (Ya no tienen líneas)
    await this.orderRepository.createQueryBuilder().delete().execute();

    // 3. Borramos el catálogo y el negocio (Productos, Clientes, Empresas)
    await this.productRepository.createQueryBuilder().delete().execute();
    await this.clientRepository.createQueryBuilder().delete().execute();
    await this.companyRepository.createQueryBuilder().delete().execute();

    // 4. Por último, destruimos los cimientos (Usuarios e Impuestos)
    await this.userRepository.createQueryBuilder().delete().execute();
    await this.taxRepository.createQueryBuilder().delete().execute();

    this.logger.log('Base de datos limpiada');
  }

  private async insertUsers(): Promise<User[]> {
    const usersToInsert = SEED_USERS.map((user) => ({
      ...user,
      password: bcrypt.hashSync(user.password, 10),
    }));

    const users = this.userRepository.create(usersToInsert);
    return await this.userRepository.save(users);
  }

  private async insertCompany(owner: User) {
    const company = this.companyRepository.create({
      ...SEED_COMPANY,
      owner,
    });
    await this.companyRepository.save(company);
  }

  private async insertTaxes(): Promise<Tax[]> {
    const taxes = this.taxRepository.create(SEED_TAXES);
    return await this.taxRepository.save(taxes);
  }

  private async insertProducts(owner: User, taxes: Tax[]) {
    // Buscamos el impuesto del 10%
    const iva10 = taxes.find((tax) => tax.iva === 10 && tax.surcharge === 0);

    if (!iva10) {
      throw new Error(
        'No se ha encontrado el impuesto del 10% en la base de datos',
      );
    }

    // Mapeamos los productos
    const productsToInsert = SEED_PRODUCTS.map((product) => ({
      ...product,
      tax: iva10,
      user: owner,
      createdBy: owner.id, // <-- ¡Añadimos esto para tu columna created_by!
    }));

    const products = this.productRepository.create(productsToInsert);
    await this.productRepository.save(products);
  }

  private async insertClients(owner: User) {
    // Mapeamos los clientes para inyectarles el usuario dueño
    const clientsToInsert = SEED_CLIENTS.map((client) => ({
      ...client,
      user: owner,
    }));

    const clients = this.clientRepository.create(clientsToInsert);
    await this.clientRepository.save(clients);
  }
}
