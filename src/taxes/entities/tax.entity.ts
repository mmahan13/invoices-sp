import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { ColumnNumericTransformer } from 'src/common/utils/numeric-transformer';

@Entity('taxes')
export class Tax {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  label: string; // Ej: "IVA General + RE"

  @Column('decimal', {
    precision: 5,
    scale: 2,
    default: 0, // <--- Añadir esto por seguridad
    transformer: new ColumnNumericTransformer(),
  })
  iva: number; // Ej: 21.00

  @Column('decimal', {
    precision: 5,
    scale: 2,
    default: 0, // <--- Añadir esto por seguridad
    transformer: new ColumnNumericTransformer(),
  })
  surcharge: number; // El Recargo de Equivalencia. Ej: 5.20

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Relación inversa: Un impuesto puede estar en muchos productos
  @OneToMany(() => Product, (product) => product.tax)
  products: Product[];
}
