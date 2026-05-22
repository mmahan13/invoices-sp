import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEmail,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty({ message: 'La razón social o nombre es obligatorio' })
  @MinLength(3, {
    message: 'La razón social debe tener un mínimo de 4 caracteres',
  })
  @MaxLength(150, {
    message: 'La razón social no puede tener más de 150 caracteres',
  })
  businessName: string;

  @IsString()
  @IsOptional()
  @MinLength(9, { message: 'El teléfono debe tener 9 caracteres' })
  @MaxLength(9, { message: 'El teléfono no puede exceder los 9 caracteres' })
  phone?: string;

  @IsString()
  @IsNotEmpty({ message: 'El NIF/CIF es obligatorio' })
  @MaxLength(20, { message: 'El NIF/CIF no puede tener más de 20 caracteres' })
  taxId: string;

  @IsString()
  @IsOptional()
  @MinLength(5, { message: 'La dirección debe tener minimo 5 caracteres' })
  @MaxLength(200, {
    message: 'La dirección no puede tener más de 200 caracteres',
  })
  address?: string;

  @IsEmail({}, { message: 'El formato del email no es válido' })
  @IsOptional()
  @MaxLength(50, { message: 'El email no puede tener más de 50 caracteres' })
  email?: string;

  @IsBoolean({
    message: 'El recargo de equivalencia debe ser verdadero o falso',
  })
  @IsOptional()
  hasEquivalenceSurcharge?: boolean;
}
