import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the headless-browser dep out of the bundler — it ships native binaries.
  serverExternalPackages: ["puppeteer"],
  // Allow the app to be reached through an ngrok tunnel: let those origins hit
  // dev assets (HMR) and pass the Server Action CSRF origin check. ngrok's free
  // domain is now *.ngrok-free.dev (older tunnels used *.ngrok-free.app).
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.dev", "*.ngrok.app", "*.ngrok.io"],
  experimental: {
    serverActions: {
      allowedOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.dev", "*.ngrok.app", "*.ngrok.io"],
    },
  },
};

export default nextConfig;
