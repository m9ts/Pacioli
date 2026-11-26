import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AcquisitionMethod,
  AssetCategory,
  DepreciationMethod,
  PaymentMethod,
} from '@prisma/client';

export class CreateAssetDto {
  @ApiProperty({ example: 'ATV-001' })
  @IsString()
  @MinLength(2, { message: 'Informe o código de identificação do ativo.' })
  @MaxLength(30)
  code: string;

  @ApiProperty({ example: 'Notebook Dell Inspiron' })
  @IsString()
  @MinLength(2, { message: 'Informe o nome do ativo.' })
  @MaxLength(140)
  name: string;

  @ApiProperty({ enum: AssetCategory })
  @IsEnum(AssetCategory, { message: 'Categoria inválida.' })
  category: AssetCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @ApiProperty({ example: '2026-03-01' })
  @IsDateString()
  acquisitionDate: string;

  @ApiProperty({ example: 4500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Informe o valor de aquisição.' })
  acquisitionValue: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(140)
  supplierName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(140)
  location?: string;

  @ApiPropertyOptional({ description: 'Conta do imobilizado (derivada da categoria se omitida).' })
  @IsOptional()
  @IsString()
  assetAccountId?: string;

  @ApiProperty({ enum: AcquisitionMethod })
  @IsEnum(AcquisitionMethod, { message: 'Forma de aquisição inválida.' })
  acquisitionMethod: AcquisitionMethod;

  @ApiPropertyOptional({ enum: PaymentMethod, default: 'DINHEIRO' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiProperty({ example: 48, description: 'Vida útil estimada em meses' })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'A vida útil deve ser de pelo menos 1 mês.' })
  @Max(1200, { message: 'A vida útil deve ser de no máximo 1200 meses.' })
  usefulLifeMonths: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  residualValue?: number;

  @ApiPropertyOptional({ enum: DepreciationMethod, default: 'LINEAR' })
  @IsOptional()
  @IsEnum(DepreciationMethod, { message: 'Método de depreciação inválido.' })
  depreciationMethod?: DepreciationMethod;
}

export class UpdateAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(140)
  supplierName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(140)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetAccountId?: string;
}

export class TransferAssetDto {
  @ApiProperty({ example: 'Filial Centro' })
  @IsString()
  @MinLength(2, { message: 'Informe a nova localização.' })
  @MaxLength(140)
  location: string;
}

export class DisposeAssetDto {
  @ApiProperty({ example: '2026-08-20' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 800, description: 'Valor recebido na venda/baixa (0 para doação ou perda).' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value: number;

  @ApiPropertyOptional({ enum: PaymentMethod, default: 'DINHEIRO' })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class DepreciateDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year: number;

  @ApiProperty({ example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'Informe o mês (1 a 12).' })
  @Max(12, { message: 'Mês inválido (1 a 12).' })
  month: number;

  @ApiPropertyOptional({ description: 'Restringe a ativos específicos' })
  @IsOptional()
  @IsString()
  assetId?: string;
}
