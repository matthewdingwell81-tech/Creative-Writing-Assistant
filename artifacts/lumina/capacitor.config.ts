import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.lumina.app",
  appName: "Lumina",
  webDir: "dist/public",
  server: {
    // Points the Android app to your deployed Lumina URL so it always loads
    // the latest version without needing to rebuild or re-release the APK.
    // Update this to your published Replit app URL after deploying.
    url: "https://603f1633-0ade-4928-a254-85e9b83970cc-00-2ga6s5lxazaan.picard.replit.dev",
    cleartext: true,
  },
  android: {
    backgroundColor: "#0f0f23",
  },
};

export default config;
