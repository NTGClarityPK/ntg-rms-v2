/**
 * Generates a UUID v4. Uses crypto.randomUUID() if available,
 * otherwise falls back to a polyfill implementation.
 * 
 * This ensures compatibility across different environments,
 * including older browsers and production environments where
 * crypto.randomUUID() might not be available.
 */
export function generateUUID(): string {
  // Check if crypto.randomUUID is available
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Fall through to polyfill if randomUUID fails
    }
  }

  // Polyfill for UUID v4 generation
  // This is a simplified version that generates RFC4122 compliant UUIDs
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}




