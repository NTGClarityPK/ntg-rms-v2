import enTranslations from '@/locales/en.json';
import arTranslations from '@/locales/ar.json';
import { Language } from '../store/language-store';

type TranslationKey = keyof typeof enTranslations;
type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

type TranslationKeys = NestedKeyOf<typeof enTranslations>;

const translations = {
  en: enTranslations,
  ar: arTranslations,
};

export const getTranslation = (
  key: TranslationKeys,
  language: Language = 'en'
): string => {
  const keys = key.split('.');
  
  // Try current language first
  let value: any = translations[language];
  let found = true;
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      found = false;
      break;
    }
  }

  // If not found in current language, fallback to English
  if (!found || value === undefined || (typeof value === 'object' && value !== null)) {
    value = translations.en;
    found = true;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        found = false;
        break;
      }
    }
  }

  // If we have a valid string translation, return it
  if (found && typeof value === 'string' && value.length > 0) {
    return value;
  }

  // Last resort: format the key nicely (e.g., "saveChanges" -> "Save Changes")
  const lastKey = keys[keys.length - 1];
  return lastKey
    .replace(/([A-Z])/g, ' $1') // Add space before capital letters
    .split(/[\s_]+/) // Split on spaces and underscores
    .filter(word => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
};

export const t = (key: TranslationKeys, language?: Language): string => {
  return getTranslation(key, language);
};

