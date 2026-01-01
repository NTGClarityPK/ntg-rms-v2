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
  Paper,
  Box,
} from '@mantine/core';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';
import { CartItem } from '@/shared/types/cart.types';
import { FoodItem, ComboMeal } from '@/lib/api/menu';
import { menuApi } from '@/lib/api/menu';
import { useThemeColor, useThemeColorShade } from '@/lib/hooks/use-theme-color';
import { getErrorColor, getSuccessColor, getBadgeColorForText } from '@/lib/utils/theme';
import { useCurrency } from '@/lib/hooks/use-currency';
import { formatCurrency } from '@/lib/utils/currency-formatter';
import { menuPricingService } from '@/features/menu/domain';
import { Skeleton } from '@mantine/core';
import NextImage from 'next/image';

interface ItemSelectionModalProps {
  opened: boolean;
  onClose: () => void;
  foodItem: FoodItem | ComboMeal;
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
  const [comboMealItems, setComboMealItems] = useState<FoodItem[]>([]);
  const [loadingComboItems, setLoadingComboItems] = useState(false);

  // Check if the item is a combo meal
  const isComboMeal = 'foodItemIds' in foodItem && !('stockType' in foodItem) && !('pricePerPerson' in foodItem);
  const comboMeal = isComboMeal ? (foodItem as ComboMeal) : null;
  const actualFoodItem = isComboMeal ? null : (foodItem as FoodItem);

  useEffect(() => {
    if (opened && foodItem) {
      if (isComboMeal) {
        loadComboMealItems();
      } else {
        loadItemData();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, foodItem, isComboMeal]);

  const loadComboMealItems = async () => {
    if (!comboMeal) return;

    setLoadingComboItems(true);
    try {
      // If foodItems are already populated, use them
      if (comboMeal.foodItems && comboMeal.foodItems.length > 0) {
        setComboMealItems(comboMeal.foodItems);
        setLoadingComboItems(false);
        setLoading(false);
        return;
      }

      // Otherwise, load from foodItemIds
      if (!comboMeal.foodItemIds || comboMeal.foodItemIds.length === 0) {
        setComboMealItems([]);
        setLoadingComboItems(false);
        setLoading(false);
        return;
      }

      // Load from API
      const itemsFromAPI = await Promise.all(
        comboMeal.foodItemIds.map(async (id) => {
          try {
            return await menuApi.getFoodItemById(id);
          } catch (error) {
            console.error(`Failed to load food item ${id}:`, error);
            return null;
          }
        })
      );
      
      const validApiItems = itemsFromAPI.filter((item): item is FoodItem => item !== null);
      setComboMealItems(validApiItems);
    } catch (error) {
      console.error('Failed to load combo meal items:', error);
      setComboMealItems([]);
    } finally {
      setLoadingComboItems(false);
      setLoading(false);
    }
  };

  const loadItemData = async () => {
    if (!actualFoodItem) return;

    try {
      setLoading(true);

      // Load full food item from API to get variations, add-ons, and discounts
      const fullFoodItem = await menuApi.getFoodItemById(actualFoodItem.id);

      // Load variations from food item
      const itemVariations = fullFoodItem.variations || [];
      
      // Load all variation groups to resolve names
      const allVariationGroupsResponse = await menuApi.getVariationGroups();
      const allVariationGroups = Array.isArray(allVariationGroupsResponse) 
        ? allVariationGroupsResponse 
        : allVariationGroupsResponse.data || [];
      
      // Resolve variation group names
      const variationsWithResolvedNames = itemVariations.map((variation) => {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(variation.variationGroup || '');
        if (isUUID && variation.variationGroup) {
          const group = allVariationGroups.find((g) => g.id === variation.variationGroup);
          if (group) {
            return { ...variation, variationGroup: group.name };
          }
        }
        return variation;
      });
      
      setVariations(variationsWithResolvedNames);

      // Load add-on groups for this food item
      const groupIds = fullFoodItem.addOnGroupIds || [];
      
      if (groupIds.length > 0) {
        // Load each add-on group from API
        const groupsWithAddOns = await Promise.all(
          groupIds.map(async (groupId) => {
            try {
              const group = await menuApi.getAddOnGroupById(groupId);
              const addOns = await menuApi.getAddOns(groupId);
              return { ...group, addOns: addOns.filter(a => a.isActive) };
            } catch (error) {
              console.error(`Failed to load add-on group ${groupId}:`, error);
              return null;
            }
          })
        );
        
        const validGroups = groupsWithAddOns.filter((g): g is any => g !== null && g.isActive);
        setAddOnGroups(validGroups);
      } else {
        setAddOnGroups([]);
      }

      // Load active discounts from food item
      const allDiscounts = fullFoodItem.discounts || [];
      const now = new Date();
      
      // Find all active discounts (within date range)
      const activeDiscounts = allDiscounts.filter((d) => {
        if (!d.isActive) return false;
        const startDate = d.startDate ? new Date(d.startDate) : null;
        const endDate = d.endDate ? new Date(d.endDate) : null;
        
        if (startDate && endDate) {
          return now >= startDate && now <= endDate;
        } else if (startDate) {
          return now >= startDate;
        } else if (endDate) {
          return now <= endDate;
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
            addOnGroups.forEach((group) => {
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

  // Calculate pricing using MenuPricingService (only for food items, not combo meals)
  const pricingResult = useMemo(() => {
    if (isComboMeal || !actualFoodItem) {
      return null;
    }
    return menuPricingService.calculatePricing(
      actualFoodItem,
      selectedVariation,
      selectedAddOns,
      addOnGroups,
      allActiveDiscounts
    );
  }, [isComboMeal, actualFoodItem, selectedVariation, selectedAddOns, addOnGroups, allActiveDiscounts]);

  // Update activeDiscount when pricing result changes
  useEffect(() => {
    if (pricingResult) {
      setActiveDiscount(pricingResult.appliedDiscount);
    }
  }, [pricingResult]);

  const calculatePrice = () => {
    if (isComboMeal && comboMeal) {
      return comboMeal.basePrice;
    }
    return pricingResult?.finalPrice || 0;
  };

  const handleAddToCart = () => {
    const unitPrice = calculatePrice();
    const subtotal = unitPrice * quantity;

    if (isComboMeal && comboMeal) {
      // Handle combo meal
      const cartItem = {
        comboMealId: comboMeal.id,
        foodItemId: undefined,
        foodItemName: comboMeal.name,
        foodItemImageUrl: comboMeal.imageUrl,
        quantity,
        unitPrice,
        subtotal,
        specialInstructions: specialInstructions.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      onItemSelected(cartItem);
      return;
    }

    // Build add-ons array (only for food items)
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

    // Handle food item
    if (!actualFoodItem) return;

    const cartItem = {
      foodItemId: actualFoodItem.id,
      comboMealId: undefined,
      foodItemName: actualFoodItem.name,
      foodItemImageUrl: actualFoodItem.imageUrl,
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

        {/* Combo Meal Items */}
        {isComboMeal && comboMeal && (
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              {t('menu.itemsIncluded', language) || 'Items Included'} ({comboMeal.foodItemIds?.length || 0})
            </Text>
            {loadingComboItems ? (
              <Stack gap="xs">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} height={40} radius="md" />
                ))}
              </Stack>
            ) : comboMealItems.length > 0 ? (
              <Paper p="sm" withBorder radius="md">
                <Stack gap="xs">
                  {comboMealItems.map((item) => (
                    <Group key={item.id} justify="space-between" wrap="nowrap">
                      <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                        <Box
                          w={40}
                          h={40}
                          style={{
                            flexShrink: 0,
                            borderRadius: 'var(--mantine-radius-sm)',
                            overflow: 'hidden',
                            backgroundColor: item.imageUrl ? 'transparent' : 'var(--mantine-color-gray-2)',
                          }}
                        >
                          {item.imageUrl ? (
                            <NextImage
                              src={item.imageUrl}
                              alt={item.name}
                              width={40}
                              height={40}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                              }}
                            />
                          ) : null}
                        </Box>
                        <Text size="sm" fw={500} style={{ flex: 1, minWidth: 0 }} lineClamp={1}>
                          {item.name}
                        </Text>
                      </Group>
                      <Text size="sm" c="dimmed">
                        {formatCurrency(item.basePrice, currency)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Paper>
            ) : (
              <Text size="sm" c="dimmed">
                {t('menu.itemsIncluded', language) ? 'No items included' : 'No items included in this combo'}
              </Text>
            )}
          </Stack>
        )}

        <Divider />

        {/* Variations - Only for food items, not combo meals */}
        {!isComboMeal && variations.length > 0 && (
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

        {/* Add-ons - Only for food items, not combo meals */}
        {!isComboMeal && addOnGroups.length > 0 && (
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
        <Paper p="md" radius="md" withBorder>
          <Stack gap="xs">
          {pricingResult?.appliedDiscount && (() => {
            const originalPrice = pricingResult.priceBeforeDiscount;
            const discountedPrice = pricingResult.finalPrice;
            const discountAmount = pricingResult.discountAmount;
            
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
                  <Badge variant="light" color={getBadgeColorForText(pricingResult.appliedDiscount?.discountType === 'percentage'
                    ? `${pricingResult.appliedDiscount.discountValue}% ${t('pos.discount', language) || 'OFF'}`
                    : `${formatCurrency(discountAmount, currency)} ${t('pos.discount', language) || 'OFF'}`)}>
                    {pricingResult.appliedDiscount?.discountType === 'percentage'
                      ? `${pricingResult.appliedDiscount.discountValue}% ${t('pos.discount', language) || 'OFF'}`
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
        </Paper>

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


