import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.lumina.app",
  appName: "Lumina",
  webDir: "artifacts/lumina/dist",
  server: {
    url: "https://creative-writing-assistant.replit.app"
  },
  android: {
    backgroundColor: "#0f0a1a"
  }
};

export default config;