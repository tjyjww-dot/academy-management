import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: '..',
  },
    typescript: {
          ignoreBuildErrors: true,
    },
};

export default nextConfig;
