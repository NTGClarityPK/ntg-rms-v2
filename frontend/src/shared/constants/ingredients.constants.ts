/**
 * Ingredient-related constants
 * Extracted from components to centralize configuration
 */

export const INGREDIENT_CATEGORIES = [
  { value: 'vegetables', label: 'Vegetables' },
  { value: 'meats', label: 'Meats' },
  { value: 'dairy', label: 'Dairy' },
  { value: 'spices', label: 'Spices' },
  { value: 'beverages', label: 'Beverages' },
  { value: 'other', label: 'Other' },
] as const;

export const MEASUREMENT_UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'liter', label: 'liter' },
  { value: 'ml', label: 'ml' },
  { value: 'piece', label: 'piece' },
  { value: 'box', label: 'box' },
  { value: 'pack', label: 'pack' },
] as const;

export type IngredientCategory = typeof INGREDIENT_CATEGORIES[number]['value'];
export type MeasurementUnit = typeof MEASUREMENT_UNITS[number]['value'];

