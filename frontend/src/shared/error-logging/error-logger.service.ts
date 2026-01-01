/**
 * Error Logging Service
 * 
 * Centralized error logging service for tracking and reporting errors
 */

export const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

export type ErrorSeverityType = typeof ErrorSeverity[keyof typeof ErrorSeverity];

export interface ErrorLog {
  id: string;
  timestamp: string;
  message: string;
  stack?: string;
  severity: ErrorSeverityType;
  context?: Record<string, any>;
  userAgent?: string;
  url?: string;
  userId?: string;
  tenantId?: string;
}

class ErrorLoggerService {
  private logs: ErrorLog[] = [];
  private readonly MAX_LOGS = 100; // Keep last 100 errors in memory
  private readonly STORAGE_KEY = 'rms_error_logs';

  constructor() {
    // Load persisted logs from localStorage
    this.loadPersistedLogs();
  }

  /**
   * Log an error
   */
  logError(
    error: Error | string,
    severity: ErrorSeverityType = ErrorSeverity.MEDIUM,
    context?: Record<string, any>
  ): void {
    const errorLog: ErrorLog = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'string' ? undefined : error.stack,
      severity,
      context: {
        ...context,
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
        url: typeof window !== 'undefined' ? window.location.href : undefined,
      },
    };

    // Add to in-memory logs
    this.logs.push(errorLog);
    
    // Keep only last MAX_LOGS
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(-this.MAX_LOGS);
    }

    // Persist to localStorage
    this.persistLogs();

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error logged:', errorLog);
    }

    // In production, you might want to send to an error tracking service
    // e.g., Sentry, LogRocket, etc.
    if (process.env.NODE_ENV === 'production') {
      this.sendToErrorTracking(errorLog);
    }
  }

  /**
   * Log API error
   */
  logApiError(
    error: any,
    endpoint: string,
    method: string = 'GET',
    requestData?: any
  ): void {
    this.logError(
      error instanceof Error ? error : new Error(error?.message || 'API Error'),
      ErrorSeverity.HIGH,
      {
        type: 'api_error',
        endpoint,
        method,
        statusCode: error?.response?.status,
        responseData: error?.response?.data,
        requestData,
      }
    );
  }

  /**
   * Get all error logs
   */
  getLogs(): ErrorLog[] {
    return [...this.logs];
  }

  /**
   * Get error logs by severity
   */
  getLogsBySeverity(severity: ErrorSeverityType): ErrorLog[] {
    return this.logs.filter((log) => log.severity === severity);
  }

  /**
   * Clear all error logs
   */
  clearLogs(): void {
    this.logs = [];
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.STORAGE_KEY);
    }
  }

  /**
   * Send error to external error tracking service (e.g., Sentry)
   */
  private sendToErrorTracking(errorLog: ErrorLog): void {
    // TODO: Integrate with error tracking service
    // Example: Sentry.captureException(error)
    // For now, just log to console
    if (errorLog.severity === ErrorSeverity.CRITICAL || errorLog.severity === ErrorSeverity.HIGH) {
      console.error('Critical/High severity error:', errorLog);
    }
  }

  /**
   * Load persisted logs from localStorage
   */
  private loadPersistedLogs(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.logs = parsed.slice(-this.MAX_LOGS); // Only keep last MAX_LOGS
      }
    } catch (error) {
      console.warn('Failed to load persisted error logs:', error);
    }
  }

  /**
   * Persist logs to localStorage
   */
  private persistLogs(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.logs));
    } catch (error) {
      console.warn('Failed to persist error logs:', error);
      // If storage is full, clear old logs
      if (error instanceof DOMException && error.code === 22) {
        this.logs = this.logs.slice(-Math.floor(this.MAX_LOGS / 2));
        try {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.logs));
        } catch (e) {
          // If still fails, clear all
          this.logs = [];
        }
      }
    }
  }

  /**
   * Generate unique ID for error log
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const errorLogger = new ErrorLoggerService();

