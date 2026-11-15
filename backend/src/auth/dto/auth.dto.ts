import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Ana Souza' })
  @IsString()
  @MinLength(3, { message: 'Informe seu nome completo (mínimo 3 caracteres).' })
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'ana@escola.com' })
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;

  @ApiProperty({ example: 'senhaSegura123' })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter no mínimo 8 caracteres.' })
  @MaxLength(72, { message: 'A senha deve ter no máximo 72 caracteres.' })
  password: string;

  @ApiPropertyOptional({ enum: ['ALUNO', 'PROFESSOR'], default: 'ALUNO' })
  @IsOptional()
  @IsString()
  @Matches(/^(ALUNO|PROFESSOR)$/, { message: 'Perfil inválido. Use ALUNO ou PROFESSOR.' })
  role?: 'ALUNO' | 'PROFESSOR';

  @ApiPropertyOptional({ example: 'PROF-2026' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  teacherCode?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'ana@escola.com' })
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;

  @ApiProperty({ example: 'senhaSegura123' })
  @IsString()
  @MinLength(1, { message: 'Informe a senha.' })
  password: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ana Souza' })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Informe seu nome completo (mínimo 3 caracteres).' })
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'ana@escola.com' })
  @IsOptional()
  @Transform(({ value }) => (value ? String(value).trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'Informe a senha atual.' })
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(8, { message: 'A nova senha deve ter no mínimo 8 caracteres.' })
  @MaxLength(72)
  newPassword: string;
}
