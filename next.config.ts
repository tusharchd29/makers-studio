import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Force all pages/routes to be dynamic — prevents build-time static analysis
  // of server-side env vars (SUPABASE_URL, etc.)
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js'],
  },
};

export default nextConfig;
