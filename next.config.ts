import type { NextConfig } from "next";

const TUNNEL_ORIGINS = [
  "bestmarts.biz",
  "*.bestmarts.biz",
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
  // Allow the app to be reached through a tunnel: let those origins hit dev
  // assets (HMR) and pass the Server Action CSRF origin check. Covers the named
  // Cloudflare tunnel on the app's own domain (bestmarts.biz), quick tunnels
  // (*.trycloudflare.com), ngrok, and localtunnel (*.loca.lt).
  allowedDevOrigins: TUNNEL_ORIGINS,
  experimental: {
    serverActions: { allowedOrigins: TUNNEL_ORIGINS },
  },
};

export default nextConfig;
