/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@pactintel/shared-types', '@pactintel/ui'],
  experimental: {
    // React 19 support
  },
};

module.exports = nextConfig;
