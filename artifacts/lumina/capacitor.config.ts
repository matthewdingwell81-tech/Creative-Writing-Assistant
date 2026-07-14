import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.lumina.app",
  appName: "Lumina",
  webDir: "dist/public",
  server: {
    url: "https://603f1633-0ade-4928-a254-85e9b83970cc-00-2ga6s5lxazaan-bolhoabm.picard.replit.dev",
    cleartext: false,
  },
  android: {
    backgroundColor: "#0f0a1a",
  },
};

export default config;
