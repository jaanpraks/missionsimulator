import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'path';

// Cesium needs static assets (Workers, Assets, Widgets) served at runtime.
// This copies them into /dist/cesium and sets CESIUM_BASE_URL accordingly.
export default defineConfig({
  base: '/missionsimulator/',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Workers', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Assets', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Widgets', dest: 'cesium' },
      ]
    })
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify('/missionsimulator/cesium')
  },
  resolve: {
    alias: {
      cesium: path.resolve(__dirname, 'node_modules/cesium')
    }
  },
  optimizeDeps: {
    include: ['cesium']
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          cesium: ['cesium']
        }
      }
    }
  }
});
