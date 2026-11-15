import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompanySegment } from '@prisma/client';

const digits = ({ value }: any) => (value ? String(value).replace(/\D/g, '') : value);

export class CreateCompanyDto {
  @ApiProperty({ example: 'Padaria Pão Dourado Ltda.' })
  @IsString()
  @MinLength(3, { message: 'Informe a razão social.' })
  @MaxLength(160)
  legalName: string;

  @ApiProperty({ example: 'Pão Dourado' })
  @IsString()
  @MinLength(2, { message: 'Informe o nome fantasia.' })
  @MaxLength(120)
  tradeName: string;

  @ApiPropertyOptional({ example: '12345678000199' })
  @IsOptional()
  @Transform(digits)
  @Matches(/^\d{14}$/, { message: 'O CNPJ deve conter 14 dígitos (ou deixe em branco).' })
  cnpj?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  stateRegistration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cityRegistration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  zipCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  street?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  complement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail válido para a empresa.' })
  email?: string;

  @ApiProperty({ enum: CompanySegment, example: 'COMERCIO' })
  @IsEnum(CompanySegment, { message: 'Ramo de atividade inválido.' })
  segment: CompanySegment;

  @ApiPropertyOptional({ example: 'Comércio varejista de alimentos' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  activity?: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString({}, { message: 'Informe a data de abertura.' })
  openingDate: string;

  @ApiProperty({ example: 'Ana Souza' })
  @IsString()
  @MinLength(3, { message: 'Informe o responsável pela empresa.' })
  @MaxLength(120)
  responsibleName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(14)
  responsibleCpf?: string;

  @ApiProperty({ example: 50000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'O capital social não pode ser negativo.' })
  initialCapital: number;
}

export class UpdateCompanyDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  legalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  tradeName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(digits)
  @Matches(/^\d{14}$/, { message: 'O CNPJ deve conter 14 dígitos.' })
  cnpj?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  stateRegistration?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  zipCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  complement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email?: string;

  @ApiPropertyOptional({ enum: CompanySegment })
  @IsOptional()
  @IsEnum(CompanySegment)
  segment?: CompanySegment;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  activity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  openingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsibleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(14)
  responsibleCpf?: string;
}

export class OpeningPeriodDto {
  @ApiProperty({ example: 'Exercício 2026' })
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  endDate: string;
}

export class OpeningItemDto {
  @ApiProperty({ enum: ['BEM', 'DIREITO', 'OBRIGACAO'] })
  @IsIn(['BEM', 'DIREITO', 'OBRIGACAO'], { message: 'Tipo de item inválido.' })
  kind: 'BEM' | 'DIREITO' | 'OBRIGACAO';

  @ApiProperty({ example: 'Mesa de escritório' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  description: string;

  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiProperty({ example: 2500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Informe um valor maior que zero.' })
  value: number;
}

export class OpeningExtraLineDto {
  @ApiProperty()
  @IsString()
  accountId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  credit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  description?: string;
}

export class CompleteOpeningDto {
  @ApiProperty({ type: OpeningPeriodDto })
  @ValidateNested()
  @Type(() => OpeningPeriodDto)
  period: OpeningPeriodDto;

  @ApiProperty({ example: 50000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'O capital social deve ser maior que zero.' })
  capital: number;

  @ApiPropertyOptional({ description: 'Conta que recebeu a integralização (Caixa ou Banco).' })
  @IsOptional()
  @IsString()
  capitalAccountId?: string;

  @ApiPropertyOptional({ type: [OpeningItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => OpeningItemDto)
  items?: OpeningItemDto[];

  @ApiPropertyOptional({ type: [OpeningExtraLineDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => OpeningExtraLineDto)
  extraLines?: OpeningExtraLineDto[];
}

export class AddMemberDto {
  @ApiProperty()
  @IsEmail({}, { message: 'Informe o e-mail do usuário.' })
  email: string;
}
