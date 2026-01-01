'use client';

import { Image, ImageProps, Skeleton } from '@mantine/core';
import { useImageLoader } from '../hooks/use-image-loader';
import { useState } from 'react';

interface OptimizedImageProps extends Omit<ImageProps, 'src'> {
  src: string | null | undefined;
  placeholder?: string;
  lazy?: boolean;
  fallback?: string;
  showSkeleton?: boolean;
}

/**
 * Optimized Image component with lazy loading and error handling
 * 
 * Features:
 * - Lazy loading with Intersection Observer
 * - Automatic placeholder/fallback handling
 * - Loading skeleton
 * - Error state handling
 */
export function OptimizedImage({
  src,
  placeholder,
  lazy = true,
  fallback,
  showSkeleton = true,
  ...props
}: OptimizedImageProps) {
  const { imageSrc, isLoading, hasError } = useImageLoader(src, placeholder, lazy);
  const [imageError, setImageError] = useState(false);

  // Use fallback if image fails to load
  const finalSrc = imageError && fallback ? fallback : imageSrc;

  if (isLoading && showSkeleton) {
    const skeletonHeight = (props as any).h || (props as any).height || 200;
    const skeletonWidth = (props as any).w || (props as any).width || '100%';
    return <Skeleton height={skeletonHeight} width={skeletonWidth} />;
  }

  if (!finalSrc) {
    return null;
  }

  return (
    <Image
      {...props}
      src={finalSrc}
      alt={(props as any).alt || ''}
      onError={() => {
        if (!imageError && fallback) {
          setImageError(true);
        }
      }}
      loading={lazy ? 'lazy' : 'eager'}
    />
  );
}

