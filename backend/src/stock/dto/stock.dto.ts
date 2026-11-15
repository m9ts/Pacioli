import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentMethod,
  StockMovementType,
} from '@prisma/client';

const ACTIVE_MOVEMENT_TYPES = [
  StockMovementType.COMPRA,
  StockMovementType.VENDA,
  StockMovementType.ENTRADA,
  StockMovementType.SAIDA,
  StockMovementType.DEVOLUCAO_VENDA,
  StockMovementType.DEVOLUCAO_COMPRA,
] as const;

export class CreateProductDto {
  @ApiProperty({ example: 'PRD-001' })
  @IsString()
  @MinLength(2, { message: 'Informe o código do produto.' })
  @MaxLength(30)
  code: string;

  @ApiProperty({ example: 'Cadeira de escritório' })
  @IsString()
  @MinLength(2, { message: 'Informe o nome do produto.' })
  @MaxLength(140)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @ApiProperty({ example: 'Mobiliário' })
  @IsString()
  @MinLength(2, { message: 'Informe a categoria do produto.' })
  @MaxLength(80)
  category: string;

  @ApiProperty({ example: 'UN' })
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  unit: string;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumStock: number;

  @ApiProperty({ example: 250 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice: number;

  @ApiProperty({ description: 'Conta contábil de estoque (ex.: Mercadorias para Revenda)' })
  @IsString()
  inventoryAccountId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  revenueAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cmvAccountId?: string;
}

export class UpdateProductDto {
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
  @MinLength(2)
  @MaxLength(80)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inventoryAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  revenueAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cmvAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  active?: any;
}

export class ListProductsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  active?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class CreateStockMovementDto {
  @ApiProperty()
  @IsString()
  productId: string;

  @ApiProperty({ enum: ACTIVE_MOVEMENT_TYPES })
  @IsEnum(ACTIVE_MOVEMENT_TYPES, {
    message: 'Tipo de movimentação inválido para criação.',
  })
  type: StockMovementType;

  @ApiProperty({ example: '2026-03-10' })
  @IsDateString()
  date: string;

  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'A quantidade deve ter no máximo 3 casas decimais.' })
  @IsPositive({ message: 'A quantidade deve ser maior que zero.' })
  quantity: number;

  @ApiPropertyOptional({
    example: 80,
    description:
      'Valor unitário. Em compras/entradas é o custo unitário; em vendas/devoluções é o valor de venda.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  unitValue?: number;

  @ApiPropertyOptional({ description: 'Valor total da operação (opcional; calculado se omitido).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  totalValue?: number;

  @ApiProperty({ enum: PaymentMethod, example: 'DINHEIRO' })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional({ example: 'NF-1001' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  documentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;
}

export class ReverseStockDto {
  @ApiProperty({ example: 'Compra lançada com valor incorreto.' })
  @IsString()
  @MinLength(5, { message: 'Descreva o motivo do estorno.' })
  @MaxLength(300)
  reason: string;
}

export class ListMovementsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
