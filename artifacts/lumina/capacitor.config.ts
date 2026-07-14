import type { CapacitorConfig } from "@capacitor/cli";

// IMPORTANT: server.url must point to the permanent production deployment URL
// before publishing to the Play Store. The dev domain is ephemeral and will
// stop working after the Replit dev environment changes. Use the stable
// production URL for all Play Store builds.
//
// Set the LUMINA_PRODUCTION_URL environment variable before building to
// override the default. Example:
//   LUMINA_PRODUCTION_URL=https://my-custom-domain.com npx cap sync android
const productionUrl =
  process.env.LUMINA_PRODUCTION_URL ?? "https://lumina.replit.app";

const config: CapacitorConfig = {
  appId: "com.lumina.app",
  appName: "Lumina",
  webDir: "dist/public",
  server: {
    url: productionUrl,
    cleartext: false,
  },
  android: {
    backgroundColor: "#0f0a1a",
  },
};

export default config;
