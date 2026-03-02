import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/koedaviz_kemporates/",
  plugins: [react()],
});
