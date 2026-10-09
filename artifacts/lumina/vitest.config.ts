import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Deliberately separate from Vite's live-server config: no PORT, API, or Firebase
// credentials are needed and no Playwright account setup is run.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    include: ["tests/tier/**/*.test.{ts,tsx}"],
    clearMocks: true,
  },
});
