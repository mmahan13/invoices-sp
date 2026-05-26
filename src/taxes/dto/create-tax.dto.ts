import {
  IsString,
  IsNumber,
  IsNotEmpty,
  Min,
  IsOptional,
  IsBoolean,
  MaxLength,
} from 'class-validator';

export class CreateTaxDto {
  @IsString()
  @IsNotEmpty({ message: 'La etiqueta del impuesto es obligatoria' })
  @MaxLength(50, { message: 'La etiqueta es demasiado larga' })
  label: string;

  @IsNumber({}, { message: 'El valor del IVA debe ser un número' })
  @Min(0, { message: 'El IVA no puede ser negativo' })
  iva: number;

  @IsNumber({}, { message: 'El recargo debe ser un número' })
  @Min(0, { message: 'El recargo no puede ser negativo' })
  @IsOptional()
  surcharge: number = 0;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean = true;
}
