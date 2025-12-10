'use client';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { theme } from '@/styles/theme';
import { useLanguageStore } from '@/lib/store/language-store';
import { useDynamicTheme } from '@/lib/hooks/use-dynamic-theme';
import { useFavicon } from '@/lib/hooks/use-favicon';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';

interface ProvidersProps {
  children: React.ReactNode;
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  useDynamicTheme(); // Initialize dynamic theme
  useFavicon(); // Initialize dynamic favicon
  return <>{children}</>;
}

export function Providers({ children }: ProvidersProps) {
  const { language } = useLanguageStore();
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <ModalsProvider>
        <Notifications 
          position="top-right" 
          zIndex={10000}
          containerWidth={400}
        />
        <ThemeProvider>
          <div dir={dir} lang={language}>
            {children}
          </div>
        </ThemeProvider>
      </ModalsProvider>
    </MantineProvider>
  );
}

