/**
 * Retry utility functions for handling failed API requests
 * 
 * Provides exponential backoff retry logic for API calls and other async operations.
 * Useful for handling transient network errors and server errors.
 */

/**
 * Options for configuring retry behavior
 */
export interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number; // in milliseconds
  retryCondition?: (error: any) => boolean;
  exponentialBackoff?: boolean;
  maxDelay?: number; // maximum delay in milliseconds
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  retryDelay: 1000,
  retryCondition: (error: any) => {
    // Retry on network errors or 5xx server errors
    if (!error.response) return true; // Network error
    const status = error.response?.status;
    return status >= 500 && status < 600; // Server errors
  },
  exponentialBackoff: true,
  maxDelay: 10000,
};

/**
 * Calculate delay for retry with exponential backoff
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  if (!options.exponentialBackoff) {
    return options.retryDelay;
  }

  const delay = options.retryDelay * Math.pow(2, attempt);
  return Math.min(delay, options.maxDelay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * 
 * @param fn - Function to retry
 * @param options - Retry options
 * @returns Promise that resolves with the function result
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts: Required<RetryOptions> = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if we've reached max retries
      if (attempt >= opts.maxRetries) {
        break;
      }

      // Check if we should retry this error
      if (!opts.retryCondition(error)) {
        throw error;
      }

      // Calculate delay before next retry
      const delay = calculateDelay(attempt, opts);
      
      // Wait before retrying
      await sleep(delay);
    }
  }

  // If we get here, all retries failed
  throw lastError;
}

/**
 * Retry a function with custom retry condition logic
 * 
 * Allows custom logic to determine whether to retry based on error and attempt number.
 * 
 * @param fn - Function to retry
 * @param shouldRetry - Function that determines if retry should occur based on error and attempt number
 * @param options - Retry options (excluding retryCondition)
 * @returns Promise that resolves with the function result
 * 
 * @example
 * ```typescript
 * await retryWithCondition(
 *   () => api.fetchData(),
 *   (error, attempt) => attempt < 3 && error.status !== 404,
 *   { maxRetries: 5 }
 * );
 * ```
 */
export async function retryWithCondition<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: any, attempt: number) => boolean,
  options: Omit<RetryOptions, 'retryCondition'> = {}
): Promise<T> {
  const opts: Required<Omit<RetryOptions, 'retryCondition'>> & { retryCondition: (error: any, attempt: number) => boolean } = {
    maxRetries: options.maxRetries ?? DEFAULT_OPTIONS.maxRetries,
    retryDelay: options.retryDelay ?? DEFAULT_OPTIONS.retryDelay,
    retryCondition: shouldRetry,
    exponentialBackoff: options.exponentialBackoff ?? DEFAULT_OPTIONS.exponentialBackoff,
    maxDelay: options.maxDelay ?? DEFAULT_OPTIONS.maxDelay,
  };
  
  let lastError: any;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt >= opts.maxRetries || !opts.retryCondition(error, attempt)) {
        throw error;
      }
      const delay = calculateDelay(attempt, opts as Required<RetryOptions>);
      await sleep(delay);
    }
  }
  throw lastError;
}

