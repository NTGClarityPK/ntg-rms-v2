import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { transformToStandardError } from '../utils/error-handler.util';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Use standardized error transformation
    const errorResponse = transformToStandardError(
      exception instanceof HttpException
        ? exception
        : new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR),
    );

    response.status(status).json(errorResponse);
  }
}

