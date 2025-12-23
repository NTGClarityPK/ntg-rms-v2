'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Stack,
  Text,
  Image,
  Group,
  Button,
  NumberInput,
  Textarea,
  Checkbox,
  Divider,
  Badge,
  ScrollArea,
  Chip,
} from '@mantine/core';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { db } from '@/lib/indexeddb/database';
import { CartItem } from '@/lib/indexeddb/database';
import { FoodItem } from '@/lib/api/menu';
import { useThemeColor, useThemeColorShade } from '@/lib/hooks/use-theme-color';
import { getErrorColor, getSuccessColor, getBadgeColorForText } from '@/lib/utils/theme';
import { useCurrency } from '@/lib/hooks/use-currency';
import { formatCurrency } from '@/lib/utils/currency-formatter';

interface ItemSelectionModalProps {
  opened: boolean;
  onClose: () => void;
  foodItem: FoodItem;
  onItemSelected: (item: any) => void;
  existingCartItem?: CartItem; // For editing existing cart items
}

export function ItemSelectionModal({
  opened,
  onClose,
  foodItem,
  onItemSelected,
  existingCartItem,
}: ItemSelectionModalProps) {
  const { language } = useLanguageStore();
  const primaryColor = useThemeColor();
  const primaryShade = useThemeColorShade(6);
  const currency = useCurrency();
  const [quantity, setQuantity] = useState(existingCartItem?.quantity || 1);
  const [selectedVariation, setSelectedVariation] = useState<any>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<Record<string, string[]>>({});
  const [addOnGroups, setAddOnGroups] = useState<any[]>([]);
  const [variations, setVariations] = useState<any[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState(existingCartItem?.specialInstructions || '');
  const [loading, setLoading] = useState(true);
  const [activeDiscount, setActiveDiscount] = useState<any>(null);
  const [allActiveDiscounts, setAllActiveDiscounts] = useState<any[]>([]);

  useEffect(() => {
    if (opened && foodItem) {
      loadItemData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, foodItem]);

  const loadItemData = async () => {
    try {
      setLoading(true);

      // Load variations
      const itemVariations = await db.foodItemVariations
        .where('foodItemId')
        .equals(foodItem.id)
        .toArray();
      setVariations(itemVariations);

      // Load add-on groups for this food item
      const foodItemAddOnGroups = await db.foodItemAddOnGroups
        .where('foodItemId')
        .equals(foodItem.id)
        .toArray();

      const groupIds = foodItemAddOnGroups.map((g) => g.addOnGroupId);
      const groups = await db.addOnGroups
        .where('id')
        .anyOf(groupIds)
        .filter((g) => g.isActive && !g.deletedAt)
        .toArray();

      // Load add-ons for each group
      const groupsWithAddOns = await Promise.all(
        groups.map(async (group) => {
          const addOns = await db.addOns
            .where('addOnGroupId')
            .equals(group.id)
            .filter((a) => a.isActive && !a.deletedAt)
            .sortBy('displayOrder');
          return { ...group, addOns };
        }),
      );

      setAddOnGroups(groupsWithAddOns);

      // Load active discounts for this food item
      const now = new Date().toISOString();
      const nowDate = new Date(now);
      const allDiscounts = await db.foodItemDiscounts
        .where('foodItemId')
        .equals(foodItem.id)
        .filter((d) => d.isActive)
        .toArray();
      
      // Find all active discounts (within date range)
      const activeDiscounts = allDiscounts.filter((d) => {
        const startDate = d.startDate ? new Date(d.startDate) : null;
        const endDate = d.endDate ? new Date(d.endDate) : null;
        
        if (startDate && endDate) {
          return nowDate >= startDate && nowDate <= endDate;
        } else if (startDate) {
          return nowDate >= startDate;
        } else if (endDate) {
          return nowDate <= endDate;
        }
        return true; // No date restrictions
      });
      
      // Store all active discounts to find the best one
      setAllActiveDiscounts(activeDiscounts);
      
      // We'll determine the best discount in calculatePrice based on actual price
      // For now, set to null and calculate best discount dynamically
      setActiveDiscount(null);

      // Load existing cart item data if editing
      if (existingCartItem) {
        setQuantity(existingCartItem.quantity);
        setSpecialInstructions(existingCartItem.specialInstructions || '');

        // Load selected variation
        if (existingCartItem.variationId) {
          const variation = itemVariations.find((v) => v.id === existingCartItem.variationId);
          if (variation) {
            setSelectedVariation(variation);
          }
        }

        // Load selected add-ons
        if (existingCartItem.addOns && existingCartItem.addOns.length > 0) {
          const addOnsByGroup: Record<string, string[]> = {};
          existingCartItem.addOns.forEach((addOn) => {
            // Find which group this add-on belongs to
            groupsWithAddOns.forEach((group) => {
              if (group.addOns?.some((a: any) => a.id === addOn.addOnId)) {
                if (!addOnsByGroup[group.id]) {
                  addOnsByGroup[group.id] = [];
                }
                addOnsByGroup[group.id].push(addOn.addOnId);
              }
            });
          });
          setSelectedAddOns(addOnsByGroup);
        }
      } else {
        // Reset selections for new item
        setQuantity(1);
        setSelectedVariation(null);
        setSelectedAddOns({});
        setSpecialInstructions('');
      }
    } catch (error) {
      console.error('Failed to load item data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOnChange = (groupId: string, addOnId: string, checked: boolean) => {
    setSelectedAddOns((prev) => {
      const groupAddOns = prev[groupId] || [];
      if (checked) {
        const group = addOnGroups.find((g) => g.id === groupId);
        if (group?.selectionType === 'single') {
          // Single selection - replace
          return { ...prev, [groupId]: [addOnId] };
        } else {
          // Multiple selection - add
          return { ...prev, [groupId]: [...groupAddOns, addOnId] };
        }
      } else {
        // Remove
        return { ...prev, [groupId]: groupAddOns.filter((id) => id !== addOnId) };
      }
    });
  };

  const handleSingleAddOnChange = (groupId: string, value: string | string[]) => {
    setSelectedAddOns((prev) => {
      const selectedValue = Array.isArray(value) ? value[0] : value;
      return { ...prev, [groupId]: selectedValue ? [selectedValue] : [] };
    });
  };

  // Calculate base price (before discount) based on current selections
  const basePriceBeforeDiscount = useMemo(() => {
    let price = foodItem.basePrice;

    // Add variation price adjustment
    if (selectedVariation) {
      price += selectedVariation.priceAdjustment || 0;
    }

    // Add add-on prices
    Object.values(selectedAddOns).forEach((addOnIds) => {
      addOnIds.forEach((addOnId) => {
        addOnGroups.forEach((group) => {
          const addOn = group.addOns?.find((a: any) => a.id === addOnId);
          if (addOn) {
            price += addOn.price;
          }
        });
      });
    });

    return price;
  }, [foodItem.basePrice, selectedVariation, selectedAddOns, addOnGroups]);

  // Calculate the best discount based on current base price
  const bestDiscount = useMemo(() => {
    if (allActiveDiscounts.length === 0) {
      return null;
    }

    let best = null;
    let bestFinalPrice = basePriceBeforeDiscount;

    // Calculate final price for each discount and pick the best one
    for (const discount of allActiveDiscounts) {
      let discountedPrice = basePriceBeforeDiscount;
      
      if (discount.discountType === 'percentage') {
        discountedPrice = basePriceBeforeDiscount * (1 - discount.discountValue / 100);
      } else if (discount.discountType === 'fixed') {
        discountedPrice = Math.max(0, basePriceBeforeDiscount - discount.discountValue);
      }

      // Pick the discount that gives the lowest final price (best for customer)
      if (discountedPrice < bestFinalPrice) {
        bestFinalPrice = discountedPrice;
        best = discount;
      }
    }

    return best;
  }, [allActiveDiscounts, basePriceBeforeDiscount]);

  // Update activeDiscount when bestDiscount changes
  useEffect(() => {
    setActiveDiscount(bestDiscount);
  }, [bestDiscount]);

  const calculatePrice = () => {
    // Apply the best discount if available
    if (bestDiscount) {
      if (bestDiscount.discountType === 'percentage') {
        return Math.max(0, basePriceBeforeDiscount * (1 - bestDiscount.discountValue / 100));
      } else if (bestDiscount.discountType === 'fixed') {
        return Math.max(0, basePriceBeforeDiscount - bestDiscount.discountValue);
      }
    }

    return Math.max(0, basePriceBeforeDiscount); // Ensure price is never negative
  };

  const handleAddToCart = () => {
    const unitPrice = calculatePrice();
    const subtotal = unitPrice * quantity;

    // Build add-ons array
    const addOnsArray: any[] = [];
    Object.entries(selectedAddOns).forEach(([groupId, addOnIds]) => {
      addOnIds.forEach((addOnId) => {
        addOnGroups.forEach((group) => {
          const addOn = group.addOns?.find((a: any) => a.id === addOnId);
          if (addOn) {
            addOnsArray.push({
              addOnId: addOn.id,
              addOnName: addOn.name,
              price: addOn.price,
              quantity: 1,
            });
          }
        });
      });
    });

    const cartItem = {
      foodItemId: foodItem.id,
      foodItemName: foodItem.name,
      foodItemImageUrl: foodItem.imageUrl,
      variationId: selectedVariation?.id,
      variationGroup: selectedVariation?.variationGroup,
      variationName: selectedVariation?.variationName,
      variationPriceAdjustment: selectedVariation?.priceAdjustment || 0,
      addOns: addOnsArray,
      quantity,
      unitPrice,
      subtotal,
      specialInstructions: specialInstructions.trim() || undefined,
      createdAt: new Date().toISOString(),
    };

    onItemSelected(cartItem);
  };

  const canAddToCart = () => {
    // Check variations - if variations exist, at least one must be selected
    if (variations.length > 0 && !selectedVariation) {
      return false;
    }

    // Check all add-on groups for validation
    for (const group of addOnGroups) {
      const selected = selectedAddOns[group.id] || [];
      const selectedCount = selected.length;
      const minSelections = typeof group.minSelections === 'number' ? group.minSelections : null;
      const maxSelections = typeof group.maxSelections === 'number' ? group.maxSelections : null;

      // Check required groups - must have at least minSelections (or 1 if no minSelections)
      if (group.isRequired) {
        const minRequired = minSelections !== null ? minSelections : 1;
        if (selectedCount < minRequired) {
          return false;
        }
      }

      // Check minimum selections
      // If minSelections is set and any items are selected, must meet minimum
      // (For optional groups: can select 0, or must select at least minSelections)
      if (minSelections !== null && selectedCount > 0 && selectedCount < minSelections) {
        return false;
      }

      // Check maximum selections (applies to all groups with maxSelections)
      if (maxSelections !== null && selectedCount > maxSelections) {
        return false;
      }
    }
    return true;
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={600} size="lg">
          {foodItem.name}
        </Text>
      }
      size="lg"
      centered
    >
      <Stack gap="md">
        {foodItem.imageUrl && (
          <div
            style={{
              width: '100%',
              height: '250px',
              borderRadius: 'var(--mantine-radius-md)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <Image 
              src={foodItem.imageUrl} 
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center',
              }}
              alt={foodItem.name || ''}
            />
          </div>
        )}

        {foodItem.description && (
          <Text size="sm" c="dimmed">
            {foodItem.description}
          </Text>
        )}

        <Divider />

        {/* Variations */}
        {variations.length > 0 && (
          <Stack gap="xs">
            <Text fw={500} size="sm">
              {t('pos.variation', language)}
            </Text>
            <Chip.Group value={selectedVariation?.id || ''} onChange={(value) => {
              const variation = variations.find((v) => v.id === value);
              setSelectedVariation(variation || null);
            }}>
              <Group gap="xs" wrap="wrap">
                {variations.map((variation) => {
                  const label = `${variation.variationName}${variation.variationGroup ? ` (${variation.variationGroup})` : ''}`;
                  const priceText = variation.priceAdjustment !== 0
                    ? ` ${variation.priceAdjustment > 0 ? '+' : ''}${formatCurrency(variation.priceAdjustment, currency)}`
                    : '';
                  
                  return (
                    <Chip
                      key={variation.id}
                      value={variation.id}
                      variant="filled"
                    >
                      {label}{priceText}
                    </Chip>
                  );
                })}
              </Group>
            </Chip.Group>
          </Stack>
        )}

        {/* Add-ons */}
        {addOnGroups.length > 0 && (
          <ScrollArea.Autosize >
            <Stack gap="md">
              {addOnGroups.map((group) => {
                const selected = selectedAddOns[group.id] || [];
                const isRequired = group.isRequired;
                const isSingle = group.selectionType === 'single';

                return (
                  <Stack key={group.id} gap="xs">
                    <Group justify="space-between">
                      <Text fw={500} size="sm">
                        {group.name}
                        {isRequired && <Text component="span" c={getErrorColor()}> *</Text>}
                      </Text>
                      <Badge size="xs" variant="light">
                        {isRequired ? t('pos.required', language) : t('pos.optional', language)}
                      </Badge>
                    </Group>

                    {isSingle ? (
                      <Chip.Group
                        value={selected[0] || ''}
                        onChange={(value) => handleSingleAddOnChange(group.id, value)}
                      >
                        <Group gap="xs" wrap="wrap">
                          {group.addOns?.map((addOn: any) => {
                            const label = addOn.name || '';
                            const priceText = addOn.price > 0 ? ` +${formatCurrency(addOn.price, currency)}` : '';
                            
                            return (
                              <Chip
                                key={addOn.id}
                                value={addOn.id}
                                variant="filled"
                              >
                                {label}{priceText}
                              </Chip>
                            );
                          })}
                        </Group>
                      </Chip.Group>
                    ) : (
                      <Stack gap="xs">
                        {group.addOns?.map((addOn: any) => (
                          <Checkbox
                            key={addOn.id}
                            checked={selected.includes(addOn.id)}
                            onChange={(e) => handleAddOnChange(group.id, addOn.id, e.currentTarget.checked)}
                            label={
                              <Group justify="space-between" style={{ flex: 1 }}>
                                <Text>
                                  {addOn.name || ''}
                                </Text>
                                {addOn.price > 0 && (
                                  <Text fw={500} c={primaryColor}>
                                    +{addOn.price.toFixed(2)} {currency}
                                  </Text>
                                )}
                              </Group>
                            }
                          />
                        ))}
                      </Stack>
                    )}

                    {(group.minSelections != null && group.minSelections > 0) && (
                      <Text size="xs" c="dimmed">
                        {t('menu.minSelections', language)}: {group.minSelections}
                        {group.maxSelections != null && group.maxSelections > 0 && ` - ${t('menu.maxSelections', language)}: ${group.maxSelections}`}
                      </Text>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          </ScrollArea.Autosize>
        )}

        <Divider />

        {/* Quantity */}
        <Group justify="space-between">
          <Text fw={500}>{t('pos.quantity', language)}</Text>
          <NumberInput
            value={quantity}
            onChange={(value) => setQuantity(typeof value === 'number' ? value : 1)}
            min={1}
            max={99}
            style={{ width: 100 }}
          />
        </Group>

        {/* Special Instructions */}
        <Textarea
          label={t('pos.specialInstructions', language)}
          placeholder={t('pos.specialInstructions', language)}
          value={specialInstructions}
          onChange={(e) => setSpecialInstructions(e.target.value)}
          rows={3}
        />

        {/* Price Summary */}
        <Stack gap="xs" p="md" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: 'var(--mantine-radius-md)' }}>
          {activeDiscount && (() => {
            // Calculate original price without discount
            let originalPrice = foodItem.basePrice;
            if (selectedVariation) {
              originalPrice += selectedVariation.priceAdjustment || 0;
            }
            Object.values(selectedAddOns).forEach((addOnIds) => {
              addOnIds.forEach((addOnId) => {
                addOnGroups.forEach((group) => {
                  const addOn = group.addOns?.find((a: any) => a.id === addOnId);
                  if (addOn) {
                    originalPrice += addOn.price;
                  }
                });
              });
            });
            const discountedPrice = calculatePrice();
            const discountAmount = originalPrice - discountedPrice;
            
            return (
              <>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed" td="line-through">
                    {t('pos.originalPrice', language) || 'Original Price'}:
                  </Text>
                  <Text size="sm" c="dimmed" td="line-through">
                    {formatCurrency(originalPrice, currency)}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Badge color={getBadgeColorForText(activeDiscount.discountType === 'percentage'
                    ? `${activeDiscount.discountValue}% ${t('pos.discount', language) || 'OFF'}`
                    : `${formatCurrency(discountAmount, currency)} ${t('pos.discount', language) || 'OFF'}`)} variant="light">
                    {activeDiscount.discountType === 'percentage'
                      ? `${activeDiscount.discountValue}% ${t('pos.discount', language) || 'OFF'}`
                      : `${formatCurrency(discountAmount, currency)} ${t('pos.discount', language) || 'OFF'}`}
                  </Badge>
                  <Text size="sm" c={getSuccessColor()} fw={600}>
                    -{formatCurrency(discountAmount, currency)}
                  </Text>
                </Group>
              </>
            );
          })()}
          <Group justify="space-between">
            <Text fw={600} size="lg">
              {t('pos.total', language)}:
            </Text>
            <Text fw={700} size="xl" c={primaryColor}>
              {formatCurrency(calculatePrice(), currency)} × {quantity} = {formatCurrency(calculatePrice() * quantity, currency)}
            </Text>
          </Group>
        </Stack>

        {/* Add to Cart Button */}
        <Button
          fullWidth
          size="lg"
          onClick={handleAddToCart}
          disabled={!canAddToCart()}
          style={{ backgroundColor: primaryShade }}
        >
          {t('pos.addToCart', language)}
        </Button>
      </Stack>
    </Modal>
  );
}

