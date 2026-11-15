import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const logoPath = fileURLToPath(new URL('./public/favicon.svg', import.meta.url));

export default defineConfig(() => {
  const logoVersion = createHash('sha256').update(readFileSync(logoPath)).digest('hex').slice(0, 12);
  return {
    define: { __LOGO_VERSION__: JSON.stringify(logoVersion) },
    plugins: [
      react(),
      {
        name: 'office-logo-version',
        transformIndexHtml: html => html.replace('__LOGO_VERSION__', logoVersion),
        configureServer(server) {
          server.watcher.add(logoPath);
          const refreshLogo = (path: string) => { if (path === logoPath) void server.restart(); };
          server.watcher.on('change', refreshLogo);
          server.httpServer?.once('close', () => server.watcher.off('change', refreshLogo));
        },
      },
    ],
    build: { chunkSizeWarningLimit: 900 },
  };
});
