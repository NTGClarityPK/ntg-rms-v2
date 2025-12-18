/**
 * Currency formatting utilities
 * Formats currency values with proper spacing and comma separators
 */

/**
 * Format a number with comma separators for thousands
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with comma separators
 */
export function formatNumber(value: number | string | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || value === '') {
    return '0.00';
  }
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return '0.00';
  }
  
  // Format with fixed decimals and add comma separators
  return numValue.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format a currency value with currency symbol, space, and comma separators
 * @param value - The number to format
 * @param currency - The currency symbol (e.g., 'IQD', 'USD')
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string: "currency formattedNumber" (e.g., "IQD 1,234.56")
 */
export function formatCurrency(value: number | string | null | undefined, currency: string, decimals: number = 2): string {
  const formattedNumber = formatNumber(value, decimals);
  return `${currency} ${formattedNumber}`;
}

