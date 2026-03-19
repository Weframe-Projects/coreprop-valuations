import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@sparticuz/chromium-min'],
};

export default nextConfig;
