import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

const toBool = ({ value }: any) => (value === 'true' ? true : value === 'false' ? false : value);

export class PeriodQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Período contábil (substitui from/to)' })
  @IsOptional()
  @IsString()
  periodId?: string;
}

export class BalanceSheetQueryDto {
  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class DreQueryDto extends PeriodQueryDto {
  @ApiPropertyOptional({ description: 'Comparar com o período anterior de mesma duração' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  compare?: boolean;
}

export class LedgerQueryDto extends PeriodQueryDto {
  @IsString({ message: 'Selecione a conta contábil.' })
  accountId: string;
}

export class ClosingDto {
  @IsString()
  periodId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;
}
