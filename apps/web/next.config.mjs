/** @type {import('next').NextConfig} */
const nextConfig = {
  // Consume workspace packages as source (no prebuild step in dev).
  transpilePackages: ["@productivity/shared", "@productivity/supabase"],
};

export default nextConfig;
