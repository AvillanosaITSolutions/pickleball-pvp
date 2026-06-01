import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_GAME=rage|sabong builds a single-game bundle into dist-<game>/.
// Unset (or 'all') keeps the combined lobby — used for local dev.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const game = env.VITE_GAME || 'all'
  return {
    plugins: [react()],
    resolve: {
      alias: {
        // colyseus.js's CJS H3Transport requires tslib (not installed by the
        // package). We use WebSocket only, so redirect to the ESM build which
        // has __awaiter inlined and needs no extra deps.
        'colyseus.js/build/cjs/transport/H3Transport.js':
          'colyseus.js/lib/transport/H3Transport.js',
      },
    },
    build: {
      outDir: game === 'all' ? 'dist' : `dist-${game}`,
    },
  }
})
