import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // 打包进桌面壳时由 FastAPI 在 /app/ 下伺服（同源，不需要 proxy）
  base: process.env.VITE_BASE ?? "/",
  server: {
    // 手机要从局域网连进来（ADR 0021 三端同源）
    host: true,
    proxy: { "/api": { target: "http://127.0.0.1:8787", changeOrigin: true,
                       rewrite: (p) => p.replace(/^\/api/, "") } },
  },
});
