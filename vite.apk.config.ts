import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 打包 APK 用的构建配置：输出 IIFE 单包，便于内联成一个 index.html，
 * 在安卓 WebView 的 file:// 协议下不会触发模块跨域限制。
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2018',
    outDir: 'dist-mobile',
    // 输出目录由 scripts/clean-out.mjs 预先清空（递归删除会被本机安全删除钩子拦下）
    emptyOutDir: false,
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
