import type { CapacitorConfig } from "@capacitor/cli";

// IMPORTANT: server.url must point to the permanent production deployment URL
// before publishing to the Play Store. The dev domain is ephemeral and will
// stop working after the Replit dev environment changes. Use the stable
// production URL (e.g. https://lumina.replit.app) for all Play Store builds.
const config: CapacitorConfig = {
  appId: "com.lumina.app",
  appName: "Lumina",
  webDir: "dist/public",
  server: {
    url: "https://lumina.replit.app",
    cleartext: false,
  },
  android: {
    backgroundColor: "#0f0a1a",
  },
};

export default config;
