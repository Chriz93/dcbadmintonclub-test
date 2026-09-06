import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "dev-csp",
      apply: "serve",
      transformIndexHtml(html) {
        return html.replace(
          /<meta http-equiv="Content-Security-Policy"[^>]*>/,
          "",
        );
      },
    },
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/services/config.ts"],
    },
  },
});
