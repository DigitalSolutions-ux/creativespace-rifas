/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ignora las advertencias de código sin usar (ESLint)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Ignora advertencias estrictas de tipado (TypeScript)
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default nextConfig;