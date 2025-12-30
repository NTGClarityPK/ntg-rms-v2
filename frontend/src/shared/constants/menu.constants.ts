/**
 * Menu-related constants
 * Extracted from components to centralize configuration
 */

export const FOOD_ITEM_LABELS = [
  { value: 'spicy', label: 'Spicy' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten_free', label: 'Gluten Free' },
  { value: 'halal', label: 'Halal' },
  { value: 'new', label: 'New' },
  { value: 'popular', label: 'Popular' },
  { value: 'chefs_special', label: "Chef's Special" },
] as const;

export const MENU_TYPES = [
  { value: 'all_day', label: 'All Day' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'kids_special', label: "Kids' Special" },
] as const;

export const STOCK_TYPES = [
  { value: 'unlimited', label: 'Unlimited' },
  { value: 'limited', label: 'Limited' },
  { value: 'daily_limited', label: 'Daily Limited' },
] as const;

export const DISCOUNT_TYPES = [
  { value: 'percentage', label: 'Percentage' },
  { value: 'fixed', label: 'Fixed Amount' },
] as const;

export type FoodItemLabel = typeof FOOD_ITEM_LABELS[number]['value'];
export type MenuType = typeof MENU_TYPES[number]['value'];
export type StockType = typeof STOCK_TYPES[number]['value'];
export type DiscountType = typeof DISCOUNT_TYPES[number]['value'];

