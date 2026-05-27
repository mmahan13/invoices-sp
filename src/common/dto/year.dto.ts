import { IsInt, IsOptional, IsPositive, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
export class YearDto {
  @IsOptional()
  @IsPositive()
  @Type(() => Number)
  year?: number;

  // NUEVO: Añadimos el trimestre al DTO
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  quarter?: number;
}
