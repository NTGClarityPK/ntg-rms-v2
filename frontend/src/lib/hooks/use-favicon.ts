import { useEffect } from 'react';
import { useRestaurantStore } from '@/lib/store/restaurant-store';

/**
 * Hook to update favicon based on restaurant logo
 * Converts logo (base64) to favicon or uses default icon
 */
export function useFavicon() {
  const { restaurant } = useRestaurantStore();

  useEffect(() => {
    const updateFavicon = () => {
      if (typeof document === 'undefined') return;

      // Remove existing favicon links
      const existingLinks = document.querySelectorAll("link[rel*='icon']");
      existingLinks.forEach((link) => link.remove());

      if (restaurant?.logoUrl) {
        // Logo is now stored in Supabase Storage as a URL
        // Convert it to favicon by loading the image and drawing to canvas
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              // Clear canvas with white background
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, 32, 32);
              
              // Draw logo on canvas, centered and scaled to fit
              const scale = Math.min(32 / img.width, 32 / img.height);
              const x = (32 - img.width * scale) / 2;
              const y = (32 - img.height * scale) / 2;
              ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
              
              // Convert canvas to data URL
              const dataUrl = canvas.toDataURL('image/png');
              
              // Create favicon link
              const link = document.createElement('link');
              link.rel = 'icon';
              link.type = 'image/png';
              link.href = dataUrl;
              document.head.appendChild(link);
            }
          } catch (err) {
            console.warn('Failed to create favicon from logo:', err);
            setDefaultFavicon();
          }
        };
        img.onerror = () => {
          // If image fails to load, use default
          setDefaultFavicon();
        };
        img.src = restaurant.logoUrl;
      } else {
        // Use default favicon (fork & knife icon as SVG)
        setDefaultFavicon();
      }
    };

    const setDefaultFavicon = () => {
      // Create SVG favicon with fork & knife icon (simplified version)
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#2196f3">
          <path d="M8.5 2L9 22M15.5 2L15 22M8.5 12H15.5M12 2V22" stroke="#2196f3" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      `;
      const svgBlob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);
      
      const link = document.createElement('link');
      link.rel = 'icon';
      link.type = 'image/svg+xml';
      link.href = url;
      document.head.appendChild(link);
    };

    updateFavicon();
  }, [restaurant?.logoUrl]);
}

