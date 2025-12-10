/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mantine/core', '@mantine/hooks'],
  output: 'standalone',
};

module.exports = nextConfig;

