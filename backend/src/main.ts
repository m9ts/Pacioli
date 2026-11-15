import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PrismaService } from './common/prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({
    origin: [config.get('WEB_URL', 'http://localhost:3000')],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validateCustomDecorators: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const prisma = app.get(PrismaService);

  // Bootstrap: garante os perfis de acesso básicos.
  const roles = [
    { name: 'ADMIN', label: 'Administrador', description: 'Gerencia o sistema e todas as empresas.' },
    { name: 'PROFESSOR', label: 'Professor', description: 'Consulta as empresas vinculadas às atividades.' },
    { name: 'ALUNO', label: 'Aluno', description: 'Gerencia suas próprias empresas simuladas.' },
  ] as const;
  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { label: role.label, description: role.description },
      create: { ...role },
    });
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Pacioli — API de Contabilidade Educacional')
    .setDescription(
      'API REST do simulador educacional de contabilidade empresarial. ' +
        'Autenticação via cookie httpOnly (ou Bearer). Envie o cabeçalho `x-company-id` nas rotas de empresa.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);
  console.log(`🚀 API do Pacioli disponível em http://localhost:${port}/api (Swagger: /api/docs)`);
}

bootstrap();
