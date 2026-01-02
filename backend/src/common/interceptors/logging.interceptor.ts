import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const responseTime = Date.now() - startTime;
          const apiName = `${method} ${url}`;
          
          this.logger.log(
            `${apiName} - Status: ${statusCode} - Response Time: ${responseTime}ms`,
          );
        },
        error: () => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const responseTime = Date.now() - startTime;
          const apiName = `${method} ${url}`;
          
          this.logger.error(
            `${apiName} - Status: ${statusCode} - Response Time: ${responseTime}ms`,
          );
        },
      }),
    );
  }
}

