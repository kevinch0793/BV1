import type { NextConfig } from "next";

const TUNNEL_ORIGINS = [
  "*.trycloudflare.com",
  "*.loca.lt",
  "*.ngrok-free.dev",
  "*.ngrok-free.app",
  "*.ngrok.dev",
  "*.ngrok.app",
  "*.ngrok.io",
];

const nextConfig: NextConfig = {
  // Keep the headless-browser dep out of the bundler — it ships native binaries.
  serverExternalPackages: ["puppeteer"],
  // Allow the app to be reached through a dev tunnel: let those origins hit dev
  // assets (HMR) and pass the Server Action CSRF origin check. Covers ngrok,
  // Cloudflare Tunnel (*.trycloudflare.com), and localtunnel (*.loca.lt).
  allowedDevOrigins: TUNNEL_ORIGINS,
  experimental: {
    serverActions: { allowedOrigins: TUNNEL_ORIGINS },
  },
};

export default nextConfig;
