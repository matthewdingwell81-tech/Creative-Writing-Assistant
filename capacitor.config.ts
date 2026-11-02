import type { CapacitorConfig } from "@capacitor/cli";

const previewUrl = process.env.LUMINA_PREVIEW_URL;
let serverUrl = "https://creative-writing-assistant.replit.app";

if (previewUrl) {
  const parsedPreviewUrl = new URL(previewUrl);
  if (
    parsedPreviewUrl.protocol !== "https:" ||
    !parsedPreviewUrl.hostname.endsWith(".replit.dev") ||
    parsedPreviewUrl.username ||
    parsedPreviewUrl.password ||
    parsedPreviewUrl.search ||
    parsedPreviewUrl.hash
  ) {
    throw new Error("LUMINA_PREVIEW_URL must be an HTTPS Replit development URL.");
  }
  serverUrl = parsedPreviewUrl.origin;
}

const config: CapacitorConfig = {
  appId: "com.lumina.app",
  appName: "Lumina",
  webDir: "artifacts/lumina/dist/public",
  server: {
    url: serverUrl
  },
  android: {
    backgroundColor: "#0f0a1a"
  }
};

export default config;