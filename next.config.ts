import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 是 native 模块，不能被 webpack bundle
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
