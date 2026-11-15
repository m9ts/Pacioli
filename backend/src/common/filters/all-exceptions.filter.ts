import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

/**
 * Tratamento centralizado de erros: devolve mensagens claras em português
 * e traduz erros conhecidos do Prisma.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno inesperado. Tente novamente.';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const payload = body as any;
        message = payload.message ?? message;
        details = payload.details;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const target = Array.isArray(exception.meta?.target)
            ? (exception.meta?.target as string[]).join(', ')
            : String(exception.meta?.target ?? '');
          message = `Já existe um registro com este valor${target ? ` (${target})` : ''}.`;
          break;
        }
        case 'P2003':
          status = HttpStatus.CONFLICT;
          message = 'Este registro está vinculado a outros dados e não pode ser excluído.';
          break;
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'Registro não encontrado.';
          break;
        case 'P2014':
          status = HttpStatus.CONFLICT;
          message = 'A operação viola um relacionamento obrigatório entre os dados.';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'Não foi possível concluir a operação no banco de dados.';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Dados inválidos enviados ao banco de dados.';
    }

    const errorName =
      exception instanceof HttpException
        ? (exception as any).name
        : exception instanceof Error
          ? exception.name
          : 'Error';

    if (status >= 500) {
      this.logger.error(
        `${errorName}: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}
