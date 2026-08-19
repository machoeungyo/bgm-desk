import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 상대 경로 base: GitHub Pages의 프로젝트 하위 경로(예: /repo-name/)에서도,
  // Vercel/Netlify의 루트 경로에서도 그대로 동작합니다.
  base: "./",
});
