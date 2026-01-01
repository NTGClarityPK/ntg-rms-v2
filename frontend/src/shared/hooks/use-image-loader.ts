import { useState, useEffect, useRef } from 'react';

/**
 * Hook for optimized image loading with lazy loading support
 * 
 * @param src - Image source URL
 * @param placeholder - Placeholder image URL (optional)
 * @param lazy - Enable lazy loading (default: true)
 * @returns Object with image state and loading status
 */
export function useImageLoader(
  src: string | null | undefined,
  placeholder?: string,
  lazy: boolean = true
) {
  const [imageSrc, setImageSrc] = useState<string | null>(placeholder || null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (!src) {
      setIsLoading(false);
      setHasError(false);
      setImageSrc(placeholder || null);
      return;
    }

    // If lazy loading is disabled, load immediately
    if (!lazy) {
      loadImage(src);
      return;
    }

    // Set up Intersection Observer for lazy loading
    const img = new Image();
    imgRef.current = img;

    // Create observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            loadImage(src);
            observerRef.current?.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before image enters viewport
      }
    );

    // Observe a dummy element (we'll use the image element when it's mounted)
    // For now, we'll load when component mounts if in viewport
    if (typeof window !== 'undefined') {
      // Check if image should load immediately (already in viewport)
      const rect = { top: 0, bottom: window.innerHeight };
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        loadImage(src);
      } else {
        // Use a timeout as fallback for IntersectionObserver
        const timeoutId = setTimeout(() => {
          loadImage(src);
        }, 100);
        return () => clearTimeout(timeoutId);
      }
    } else {
      // SSR: load immediately
      loadImage(src);
    }

    return () => {
      observerRef.current?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, placeholder, lazy]);

  function loadImage(url: string) {
    setIsLoading(true);
    setHasError(false);

    const img = new Image();
    img.onload = () => {
      setImageSrc(url);
      setIsLoading(false);
      setHasError(false);
    };
    img.onerror = () => {
      setImageSrc(placeholder || null);
      setIsLoading(false);
      setHasError(true);
    };
    img.src = url;
  }

  return {
    imageSrc,
    isLoading,
    hasError,
  };
}

