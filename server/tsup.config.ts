import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // CommonJS: o pacote colyseus 0.15 é CJS e não expõe exports nomeados para ESM
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // o pacote compartilhado é TypeScript puro: entra no bundle
  noExternal: ['@nevoeiro/shared'],
});
