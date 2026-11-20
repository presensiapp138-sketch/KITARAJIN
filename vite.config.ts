import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const pwaManifest = {
  id: '/',
  name: 'KITARAJIN - Presensi & Penugasan Sekolah',
  short_name: 'KITARAJIN',
  description: 'Sistem Presensi Wajah, Lokasi GPS, dan Penugasan Terpadu Civitas Sekolah.',
  theme_color: '#059669',
  background_color: '#0f172a',
  display: 'standalone' as const,
  orientation: 'portrait-primary' as const,
  start_url: '/',
  scope: '/',
  categories: ['education', 'productivity'],
  lang: 'id-ID',
  icons: [
    {
      src: '/pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: '/pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
    },
    {
      src: '/pwa-maskable-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
    {
      src: '/apple-touch-icon.png',
      sizes: '180x180',
      type: 'image/png',
    },
  ],
};

function devManifestFallbackPlugin(isHmrDisabled: boolean): Plugin | null {
  return {
    name: 'kitarajin-dev-endpoints',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (isHmrDisabled && req.url === '/manifest.webmanifest') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(JSON.stringify(pwaManifest));
          return;
        }
        if (req.url === '/api/gas-config') {
          const webAppUrl = String(
            process.env.APPS_SCRIPT_URL || process.env.VITE_APPS_SCRIPT_URL || ''
          ).trim();
          const apiToken = String(
            process.env.APPS_SCRIPT_TOKEN || process.env.VITE_APPS_SCRIPT_TOKEN || ''
          ).trim();
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(
            JSON.stringify({
              configured: Boolean(webAppUrl && apiToken),
              webAppUrl,
              apiToken,
              isLocked: Boolean(webAppUrl && apiToken),
            })
          );
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  const isHmrDisabled = process.env.DISABLE_HMR === 'true';

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: !isHmrDisabled,
        },
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: pwaManifest,
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp}'],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
      devManifestFallbackPlugin(isHmrDisabled),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: !isHmrDisabled,
      watch: isHmrDisabled ? null : {},
    },
  };
});
