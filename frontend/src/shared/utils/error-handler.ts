import { AxiosError } from 'axios';
import { notifications } from '@mantine/notifications';
import { getErrorColor } from '@/lib/utils/theme';
import { t } from '@/lib/utils/translations';
import { useLanguageStore, Language } from '@/lib/store/language-store';
import { errorLogger, ErrorSeverity } from '@/shared/error-logging';

/**
 * Standardized error response structure
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp?: string;
  };
}

/**
 * Extract error message from Axios error
 * Handles various error response formats consistently
 */
export function extractErrorMessage(error: AxiosError | Error | unknown): string {
  // Handle Axios errors
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as AxiosError;
    const data = axiosError.response?.data;

    // Check for standardized error format
    if (data && typeof data === 'object') {
      if ('error' in data && data.error && typeof data.error === 'object') {
        const errorObj = data.error as { message?: string; code?: string };
        if (errorObj.message) {
          return errorObj.message;
        }
      }

      // Check for direct message property
      if ('message' in data && typeof data.message === 'string') {
        return data.message;
      }
    }

    // Check if data is a string
    if (typeof data === 'string') {
      return data;
    }

    // Fallback to status text or generic message
    if (axiosError.response?.statusText) {
      return axiosError.response.statusText;
    }
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    return error.message;
  }

  // Fallback
  return 'An unexpected error occurred';
}

/**
 * Extract error code from Axios error
 */
export function extractErrorCode(error: AxiosError | Error | unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as AxiosError;
    const data = axiosError.response?.data;

    if (data && typeof data === 'object' && 'error' in data) {
      const errorObj = data.error as { code?: string };
      if (errorObj?.code) {
        return errorObj.code;
      }
    }

    // Use HTTP status code as fallback
    if (axiosError.response?.status) {
      return `HTTP_${axiosError.response.status}`;
    }
  }

  return 'UNKNOWN_ERROR';
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: AxiosError | Error | unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const axiosError = error as AxiosError;
    return (
      axiosError.code === 'ECONNABORTED' ||
      axiosError.code === 'ERR_NETWORK' ||
      axiosError.message?.includes('timeout') ||
      axiosError.message?.includes('Network Error')
    );
  }
  return false;
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: AxiosError | Error | unknown): boolean {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as AxiosError;
    return axiosError.response?.status === 401 || axiosError.response?.status === 403;
  }
  return false;
}

/**
 * Handle API error with standardized notification
 * This is a convenience function that combines error extraction and notification
 */
export function handleApiError(
  error: AxiosError | Error | unknown,
  options?: {
    showNotification?: boolean;
    defaultMessage?: string;
    language?: string;
    errorColor?: string;
    endpoint?: string;
    method?: string;
    requestData?: any;
  }
): string {
  const { 
    showNotification = true, 
    defaultMessage, 
    language,
    errorColor,
    endpoint,
    method,
    requestData,
  } = options || {};
  
  const { language: storeLanguage } = useLanguageStore.getState();
  const currentLanguage: Language = (language as Language) || storeLanguage || 'en';
  const color = errorColor || getErrorColor();

  const errorMessage = extractErrorMessage(error) || defaultMessage || t('common.error' as any, currentLanguage) || 'An error occurred';

  // Determine error severity
  let severity: typeof ErrorSeverity[keyof typeof ErrorSeverity] = ErrorSeverity.MEDIUM;
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    if (status === 401 || status === 403) {
      severity = ErrorSeverity.HIGH;
    } else if (status && status >= 500) {
      severity = ErrorSeverity.HIGH;
    } else if (isNetworkError(error)) {
      severity = ErrorSeverity.MEDIUM;
    }
  }

  // Log error using error logger
  if (endpoint && method) {
    errorLogger.logApiError(error, endpoint, method, requestData);
  } else {
    errorLogger.logError(
      error instanceof Error ? error : new Error(errorMessage),
      severity,
      {
        type: 'api_error',
        endpoint,
        method,
        requestData,
      }
    );
  }

  if (showNotification) {
    notifications.show({
      title: t('common.error' as any, currentLanguage) || 'Error',
      message: errorMessage,
      color: color,
    });
  }

  return errorMessage;
}

/**
 * Log error for debugging (in development)
 * Now also uses the centralized error logger
 */
export function logError(error: AxiosError | Error | unknown, context?: string): void {
  // Always log to error logger
  errorLogger.logError(
    error instanceof Error ? error : new Error(String(error)),
    ErrorSeverity.LOW,
    { context }
  );

  // Also log to console in development
  if (process.env.NODE_ENV === 'development') {
    const contextMsg = context ? `[${context}] ` : '';
    console.error(`${contextMsg}Error:`, error);

    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as AxiosError;
      console.error('Response:', axiosError.response?.data);
      console.error('Status:', axiosError.response?.status);
    }
  }
}

