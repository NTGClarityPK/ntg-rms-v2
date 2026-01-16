/**
 * Hook to get current language for API calls
 * Ensures all API calls use the current user's language setting
 */
import { useLanguageStore } from '../store/language-store';

export function useApiLanguage() {
  const { language } = useLanguageStore();
  return language;
}

/**
 * Get language directly from store (useful in non-component contexts)
 */
export function getApiLanguage(): string {
  return useLanguageStore.getState().language;
}








