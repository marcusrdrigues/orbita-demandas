import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['./tests/globalSetup.ts'],
    // Os testes compartilham o mesmo banco; arquivos rodam um de cada vez.
    fileParallelism: false,
  },
});
