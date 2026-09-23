import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * 当日の負荷を見積もるための計測だけを走らせる設定。
 * 通常の `npm test` には含めない（結果を表に出すだけで、合否を決めないため）。
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['scripts/**/*.report.ts'],
  },
});
