import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // caminhos relativos: o mesmo build roda na web, no Electron (file://) e no Capacitor
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@nevoeiro/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  server: { host: true, port: 5173 },
  preview: { port: 4173 },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          r3f: ['@react-three/fiber', '@react-three/drei', '@react-three/rapier'],
          voice: ['livekit-client'],
        },
      },
    },
  },
});
