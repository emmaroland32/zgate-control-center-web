import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_NAME: "ZGATE Control Center",
    NEXT_PUBLIC_APP_VERSION: "1.0.0",
  },
};

export default nextConfig;
