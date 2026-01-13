'use client';

import { ReactNode } from 'react';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { useLanguageStore } from '@/lib/store/language-store';
import { useFavicon } from '@/lib/hooks/use-favicon';
import { ThemeProvider } from './ThemeProvider';
import { DynamicThemeProvider } from './DynamicThemeProvider';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';

interface ProvidersProps {
  children: ReactNode;
}

function FaviconProvider({ children }: { children: ReactNode }) {
  useFavicon(); // Initialize dynamic favicon
  return <>{children}</>;
}

export function Providers({ children }: ProvidersProps) {
  const { language, isRTL } = useLanguageStore();
  const dir = isRTL() ? 'rtl' : 'ltr';

  return (
    <ThemeProvider>
      <ModalsProvider>
        <DynamicThemeProvider>
          <Notifications 
            position="top-right" 
            zIndex={10000}
            containerWidth={400}
          />
          <FaviconProvider>
            <div dir={dir} lang={language} suppressHydrationWarning>
              {children}
            </div>
          </FaviconProvider>
        </DynamicThemeProvider>
      </ModalsProvider>
    </ThemeProvider>
  );
}

