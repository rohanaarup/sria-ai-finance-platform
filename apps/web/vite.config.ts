import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { ProxyOptions } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // DEV-SERVER ONLY: the proxy `configure` hook never runs in `vite build`,
  // so no credentials are ever embedded in production bundles.
  // CAP mocked-auth dev users share the password "dev" (non-secret, local only).
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const devUser = env.VITE_DEV_USER || 'manager';
  const devAuth = 'Basic ' + Buffer.from(`${devUser}:dev`).toString('base64');

  const proxy = (): ProxyOptions => ({
    target: 'http://localhost:4004',
    changeOrigin: true,
    configure: (p) => {
      p.on('proxyReq', (proxyReq) => {
        proxyReq.setHeader('Authorization', devAuth);
      });
    },
  });

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/health': proxy(),
        '/api': proxy(),
      },
    },
  };
});
