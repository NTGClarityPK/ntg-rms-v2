import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Language = 'en' | 'ar' | 'ku' | 'fr';

export interface LanguageInfo {
  code: Language;
  name: string;
  nativeName: string;
  rtl: boolean;
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'en', name: 'English', nativeName: 'English', rtl: false },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'ku', name: 'Kurdish', nativeName: 'کوردی', rtl: true },
  { code: 'fr', name: 'French', nativeName: 'Français', rtl: false },
];

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  getLanguageInfo: () => LanguageInfo;
  isRTL: () => boolean;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: 'en',
      setLanguage: (lang) => set({ language: lang }),
      toggleLanguage: () => {
        const current = get().language;
        const currentIndex = SUPPORTED_LANGUAGES.findIndex(l => l.code === current);
        const nextIndex = (currentIndex + 1) % SUPPORTED_LANGUAGES.length;
        set({ language: SUPPORTED_LANGUAGES[nextIndex].code });
      },
      getLanguageInfo: () => {
        const current = get().language;
        return SUPPORTED_LANGUAGES.find(l => l.code === current) || SUPPORTED_LANGUAGES[0];
      },
      isRTL: () => {
        const info = get().getLanguageInfo();
        return info.rtl;
      },
    }),
    {
      name: 'rms-language-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

