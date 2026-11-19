import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  envDir: "../..",
  server: {
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3000",
    },
  },
  plugins: [react(), tailwindcss()],
});
