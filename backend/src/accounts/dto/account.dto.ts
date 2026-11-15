import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AccountClassification,
  AccountNature,
  AccountType,
  DreGroup,
  StatementGroup,
} from '@prisma/client';

const toBool = ({ value }: any) => (value === 'true' ? true : value === 'false' ? false : value);

export class CreateAccountDto {
  @ApiProperty({ example: '1.1.1.04' })
  @IsString()
  @Matches(/^\d+(\.\d+)*$/, { message: 'O código deve conter apenas números e pontos (ex.: 1.1.1.04).' })
  @MaxLength(30)
  code: string;

  @ApiProperty({ example: 'Caixa Filial' })
  @IsString()
  @MinLength(2, { message: 'Informe o nome da conta.' })
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @ApiProperty({ enum: AccountClassification })
  @IsEnum(AccountClassification, { message: 'Classificação inválida.' })
  classification: AccountClassification;

  @ApiProperty({ enum: AccountNature })
  @IsEnum(AccountNature, { message: 'Natureza inválida.' })
  nature: AccountNature;

  @ApiProperty({ enum: AccountType })
  @IsEnum(AccountType, { message: 'Tipo inválido.' })
  type: AccountType;

  @ApiPropertyOptional({ enum: StatementGroup })
  @IsOptional()
  @IsEnum(StatementGroup)
  statementGroup?: StatementGroup;

  @ApiPropertyOptional({ enum: DreGroup })
  @IsOptional()
  @IsEnum(DreGroup)
  dreGroup?: DreGroup;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9_]*$/, { message: 'O código de referência deve usar letras maiúsculas, números e _.' })
  referenceCode?: string;
}

export class UpdateAccountDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @ApiPropertyOptional({ enum: AccountNature })
  @IsOptional()
  @IsEnum(AccountNature)
  nature?: AccountNature;

  @ApiPropertyOptional({ enum: AccountType })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @ApiPropertyOptional({ enum: StatementGroup })
  @IsOptional()
  @IsEnum(StatementGroup)
  statementGroup?: StatementGroup;

  @ApiPropertyOptional({ enum: DreGroup })
  @IsOptional()
  @IsEnum(DreGroup)
  dreGroup?: DreGroup;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  active?: boolean;
}

export class ListAccountsDto {
  @ApiPropertyOptional({ description: 'Pesquisa por código ou nome' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: AccountClassification })
  @IsOptional()
  @IsEnum(AccountClassification)
  classification?: AccountClassification;

  @ApiPropertyOptional({ enum: AccountType })
  @IsOptional()
  @IsEnum(AccountType)
  type?: AccountType;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  active?: boolean;
}
