/**
 * Customer-related constants
 * Extracted from components to centralize configuration
 */

export const LOYALTY_TIERS = {
  regular: { label: 'Regular', color: 'gray', discount: 0 },
  silver: { label: 'Silver', color: 'gray', discount: 5 },
  gold: { label: 'Gold', color: 'yellow', discount: 10 },
  platinum: { label: 'Platinum', color: 'blue', discount: 15 },
} as const;

export type LoyaltyTier = keyof typeof LOYALTY_TIERS;

