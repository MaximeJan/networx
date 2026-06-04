import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// On importe `defineConfig` depuis `vitest/config` (pas `vite`) pour avoir la clé
// `test` typée : un seul fichier de config pour le dev, le build ET les tests.
export default defineConfig({
  // base = '/' en local. Sur GitHub Actions (déploiement GitHub Pages), on
  // préfixe par le nom du repo pour que les assets se chargent sous /<repo>/.
  base: process.env.GITHUB_REPOSITORY ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/` : '/',
  plugins: [react()],
  server: {
    port: 5191,
    strictPort: true,
    open: true,
  },
  test: {
    // La logique pure ne dépend pas du DOM → environnement `node` (rapide).
    environment: 'node',
    include: ['tests/**/*.test.{ts,mts,mjs}', 'src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/domain/types.ts', 'src/vite-env.d.ts'],
    },
  },
});
