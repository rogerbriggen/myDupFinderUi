import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // Tree builder / row filter / format helpers are pure TS — no DOM needed.
    environment: 'node',
    // Skip Angular component .spec files: v1 only covers pure logic with vitest.
    exclude: ['node_modules/**', 'dist/**', 'src-tauri/**', '**/*.component.spec.ts'],
  },
});
