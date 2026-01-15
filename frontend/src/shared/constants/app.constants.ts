/**
 * Application-wide constants
 * Centralized configuration values
 */

export const DEFAULT_PAGINATION = {
  page: 1,
  limit: 10,
  limits: [10, 20, 50, 100] as const,
} as const;

export const API_TIMEOUT = 30000; // 30 seconds

export const API_TIMEOUT_CONFIG = {
  DEFAULT: 30000, // 30 seconds
  REFRESH_TOKEN: 60000, // 60 seconds for slow connections
  BULK_IMPORT: 600000, // 10 minutes for bulk import operations
} as const;

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'rms_access_token',
  REFRESH_TOKEN: 'rms_refresh_token',
} as const;

