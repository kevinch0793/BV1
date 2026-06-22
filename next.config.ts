import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the headless-browser dep out of the bundler — it ships native binaries.
  serverExternalPackages: ["puppeteer"],
};

export default nextConfig;
