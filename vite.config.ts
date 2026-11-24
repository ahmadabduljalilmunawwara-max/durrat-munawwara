import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function disableHmrClientSocketPlugin(): Plugin {
  let isHmrDisabled = false;
  return {
    name: 'disable-hmr-client-socket',
    configResolved(config) {
      isHmrDisabled = config.server.hmr === false || config.server.ws === false;
    },
    transform(code, id) {
      if (!isHmrDisabled) return null;
      const normalizedId = id.replace(/\\/g, '/');
      if (!normalizedId.endsWith('vite/dist/client/client.mjs')) return null;

      let transformed = code.replace(
        'console.debug("[vite] connecting...");',
        'console.debug("[vite] HMR disabled.");'
      );

      const startMarker = 'const transport = normalizeModuleRunnerTransport(';
      const endMarker = 'let willUnload = false;';
      const startIdx = transformed.indexOf(startMarker);
      const endIdx = transformed.indexOf(endMarker);

      if (startIdx !== -1 && endIdx > startIdx) {
        transformed =
          transformed.slice(0, startIdx) +
          `const transport = normalizeModuleRunnerTransport({\n  async connect() {},\n  async disconnect() {},\n  async send() {},\n});\n` +
          transformed.slice(endIdx);
      }

      return {
        code: transformed,
        map: null,
      };
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: '/',
    plugins: [
      disableHmrClientSocketPlugin(),
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        manifest: false,
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
          'offline.html',
          'manifest.webmanifest',
        ],
        injectManifest: {
          globPatterns: ['**/*.{js,css,ico,png,svg,woff,woff2}'],
          globIgnores: ['**/assets/aistudio/**'],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'recharts',
        'lucide-react',
        'motion/react',
        'date-fns',
        'xlsx',
      ],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});