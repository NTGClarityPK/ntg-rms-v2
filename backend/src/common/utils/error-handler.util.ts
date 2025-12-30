import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';

/**
 * Standardized error response structure
 */
export interface StandardErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
}

/**
 * Transform NestJS exceptions to standardized error format
 */
export function transformToStandardError(
  exception: HttpException | Error,
): StandardErrorResponse {
  const timestamp = new Date().toISOString();

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const message = typeof response === 'string' 
      ? response 
      : (response as any)?.message || exception.message;

    return {
      success: false,
      error: {
        code: getErrorCode(status, exception),
        message: Array.isArray(message) ? message.join(', ') : message,
        details: typeof response === 'object' ? response : undefined,
        timestamp,
      },
    };
  }

  // Handle non-HTTP errors
  return {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: exception.message || 'Internal server error',
      timestamp,
    },
  };
}

/**
 * Get error code from HTTP status
 */
function getErrorCode(status: number, exception: HttpException): string {
  // Use exception name if available
  if (exception.name) {
    const name = exception.name.replace('Exception', '').toUpperCase();
    if (name !== 'HTTPEXCEPTION') {
      return name;
    }
  }

  // Map status codes to error codes
  const statusCodeMap: Record<number, string> = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_ERROR',
    500: 'INTERNAL_ERROR',
    503: 'SERVICE_UNAVAILABLE',
  };

  return statusCodeMap[status] || `HTTP_${status}`;
}

/**
 * Create standardized error exception
 */
export function createStandardException(
  message: string,
  status: HttpStatus = HttpStatus.BAD_REQUEST,
  code?: string,
): HttpException {
  const exception = new HttpException(message, status);
  if (code) {
    (exception as any).code = code;
  }
  return exception;
}

/**
 * Handle Supabase errors consistently
 */
export function handleSupabaseError(error: any, context?: string): never {
  const contextMsg = context ? `${context}: ` : '';
  
  if (!error) {
    throw new InternalServerErrorException(`${contextMsg}Unknown database error`);
  }

  // Check for specific Supabase error codes
  if (error.code === '23505') {
    // Unique constraint violation
    throw new ConflictException(`${contextMsg}Record already exists`);
  }

  if (error.code === '23503') {
    // Foreign key violation
    throw new BadRequestException(`${contextMsg}Referenced record does not exist`);
  }

  if (error.code === 'PGRST116') {
    // Not found
    throw new NotFoundException(`${contextMsg}Record not found`);
  }

  // Generic error
  const errorMessage = error.message || 'Database operation failed';
  throw new BadRequestException(`${contextMsg}${errorMessage}`);
}

/**
 * Validate tenant ID format
 */
export function validateTenantId(tenantId: string | undefined): void {
  if (!tenantId) {
    throw new BadRequestException('Tenant ID is required');
  }

  // UUID format validation (basic)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    throw new BadRequestException('Invalid tenant ID format');
  }
}

