/**
 * Logger utility for development and production environments
 * 
 * In development: logs to console
 * In production: only logs errors and warnings
 */

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Logs debug information (only in development)
 */
export const logger = {
  /**
   * Debug log (development only)
   */
  debug: (...args: any[]) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Info log (development only)
   */
  info: (...args: any[]) => {
    if (isDevelopment) {
      console.log('[INFO]', ...args);
    }
  },

  /**
   * Warning log (always logged)
   */
  warn: (...args: any[]) => {
    console.warn('[WARN]', ...args);
  },

  /**
   * Error log (always logged)
   */
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
  },
};


