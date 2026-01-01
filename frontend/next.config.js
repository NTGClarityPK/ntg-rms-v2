/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mantine/core', '@mantine/hooks'],
  output: 'standalone',
  
  // Performance optimizations
  compress: true,
  
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },
  
  // Enable SWC minification
  swcMinify: true,
  
  // Optimize production builds
  productionBrowserSourceMaps: false,
  
  // Webpack optimizations
  webpack: (config, { isServer }) => {
    // Only optimize client-side bundles
    if (!isServer) {
      // Optimize bundle splitting for better caching
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // Mantine UI chunk - large library, should be separate
            mantine: {
              name: 'mantine',
              chunks: 'all',
              test: /[\\/]node_modules[\\/]@mantine[\\/]/,
              priority: 30,
              reuseExistingChunk: true,
            },
            // Icons chunk
            icons: {
              name: 'icons',
              chunks: 'all',
              test: /[\\/]node_modules[\\/]@tabler[\\/]/,
              priority: 25,
              reuseExistingChunk: true,
            },
            // Common vendor chunk
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /[\\/]node_modules[\\/]/,
              priority: 10,
              reuseExistingChunk: true,
            },
          },
        },
      };
    }
    return config;
  },
};

module.exports = nextConfig;

