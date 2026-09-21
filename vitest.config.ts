import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` existe para romper el build si un modulo de servidor se
      // cuela en el cliente. En los tests de integracion no hay cliente, asi
      // que se sustituye por un modulo vacio.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Carga `.env` antes de los tests: los de integracion deciden si se
    // saltan segun haya o no DATABASE_URL, y sin esto nunca la verian.
    setupFiles: ['./tests/entorno.ts'],
    include: ['tests/**/*.test.ts'],
  },
});
