/**
 * Utility function to sanitize Select/Combobox data arrays
 * Ensures all labels are strings to prevent toLowerCase() errors
 */
export function sanitizeSelectData<T extends { value: string; label?: any }>(
  data: T[]
): Array<{ value: string; label: string }> {
  return data.map((item) => ({
    value: String(item.value || ''),
    label: String(item.label ?? ''),
  }));
}

