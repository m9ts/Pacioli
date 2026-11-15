import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JournalSource } from '@prisma/client';

export class JournalLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiPropertyOptional({ description: 'Código de referência da conta (ex.: CAIXA)' })
  @IsOptional()
  @IsString()
  accountRef?: string;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'O débito deve ter no máximo 2 casas decimais.' })
  @Min(0)
  debit?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'O crédito deve ter no máximo 2 casas decimais.' })
  @Min(0)
  credit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class CreateJournalEntryDto {
  @ApiProperty({ example: '2026-01-15' })
  @IsDateString({}, { message: 'Informe uma data válida.' })
  date: string;

  @ApiProperty({ example: 'Compra de materiais de escritório à vista' })
  @IsString()
  @MinLength(3, { message: 'Descreva o histórico do lançamento.' })
  @MaxLength(300)
  history: string;

  @ApiProperty({ type: [JournalLineDto] })
  @IsArray()
  @ArrayMinSize(2, { message: 'Um lançamento precisa de pelo menos duas linhas.' })
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}

export class ReverseEntryDto {
  @ApiProperty({ example: 'Valor lançado incorretamente.' })
  @IsString()
  @MinLength(5, { message: 'Descreva o motivo do estorno (mínimo 5 caracteres).' })
  @MaxLength(300)
  reason: string;

  @ApiPropertyOptional({ example: '2026-02-01' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class ListJournalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  number?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiPropertyOptional({ enum: JournalSource })
  @IsOptional()
  @IsEnum(JournalSource)
  source?: JournalSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

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
