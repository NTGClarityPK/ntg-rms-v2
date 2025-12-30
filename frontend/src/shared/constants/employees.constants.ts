/**
 * Employee-related constants
 * Extracted from components to centralize configuration
 */

export const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
] as const;

export type EmploymentType = typeof EMPLOYMENT_TYPES[number]['value'];

