import { useState, useEffect } from 'react';
import { useSettings } from './use-settings';

/**
 * Hook to get the currency from settings
 * Falls back to 'IQD' if not found
 */
export function useCurrency(): string {
  const { settings } = useSettings();
  const [currency, setCurrency] = useState<string>('IQD');

  useEffect(() => {
    if (settings?.general?.defaultCurrency) {
      setCurrency(settings.general.defaultCurrency);
    } else {
      setCurrency('IQD');
    }
  }, [settings?.general?.defaultCurrency]);

  return currency;
}

