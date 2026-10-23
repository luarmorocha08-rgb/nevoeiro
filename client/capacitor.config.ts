import type { CapacitorConfig } from '@capacitor/cli';

/**
 * App Android/iOS. Antes de `npx cap sync`, gere o build com VITE_SERVER_URL apontando
 * para o servidor público (wss://...). Veja o README.
 */
const config: CapacitorConfig = {
  appId: 'com.nevoeiro.game',
  appName: 'Nevoeiro',
  webDir: 'dist',
  backgroundColor: '#07090a',
  server: {
    androidScheme: 'https',
    // permite ws:// sem TLS durante testes na rede local
    cleartext: true,
  },
  android: { allowMixedContent: true },
  ios: { contentInset: 'never' },
};

export default config;
