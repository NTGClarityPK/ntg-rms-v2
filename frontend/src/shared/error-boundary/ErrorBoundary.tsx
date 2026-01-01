'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Button, Stack, Text, Title, Paper } from '@mantine/core';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { useLanguageStore } from '@/lib/store/language-store';
import { t } from '@/lib/utils/translations';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary component to catch React errors and display a fallback UI
 * 
 * This component catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the entire app.
 * 
 * @example
 * ```tsx
 * <ErrorBoundary
 *   onError={(error, errorInfo) => {
 *     errorLogger.logError(error, ErrorSeverity.HIGH);
 *   }}
 * >
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 * 
 * @param children - React children to wrap
 * @param fallback - Optional custom fallback component
 * @param onError - Optional error handler callback
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  onReset: () => void;
}

function ErrorFallback({ error, onReset }: ErrorFallbackProps) {
  const { language } = useLanguageStore();

  return (
    <Box
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        padding: '2rem',
      }}
    >
      <Paper p="xl" radius="md" withBorder style={{ maxWidth: '600px', width: '100%' }}>
        <Stack gap="md" align="center">
          <IconAlertCircle size={48} color="red" />
          <Title order={3} ta="center">
            {t('error.somethingWentWrong', language) || 'Something went wrong'}
          </Title>
          <Text c="dimmed" ta="center" size="sm">
            {t('error.errorBoundaryMessage', language) || 
              'An unexpected error occurred. Please try refreshing the page.'}
          </Text>
          
          {process.env.NODE_ENV === 'development' && error && (
            <Box
              p="md"
              style={{
                backgroundColor: 'var(--mantine-color-gray-0)',
                borderRadius: 'var(--mantine-radius-sm)',
                width: '100%',
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                overflow: 'auto',
                maxHeight: '200px',
              }}
            >
              <Text size="xs" fw={600} mb="xs">
                Error Details (Development Only):
              </Text>
              <Text size="xs" c="red">
                {error.toString()}
              </Text>
              {error.stack && (
                <Text size="xs" c="dimmed" mt="xs" style={{ whiteSpace: 'pre-wrap' }}>
                  {error.stack}
                </Text>
              )}
            </Box>
          )}

          <Button
            leftSection={<IconRefresh size={16} />}
            onClick={onReset}
            variant="light"
          >
            {t('common.tryAgain', language) || 'Try Again'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

