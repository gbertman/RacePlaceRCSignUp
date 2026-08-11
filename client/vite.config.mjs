import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
  },
  server: {
    host: true,
    port: 3000,
    proxy: {
      '/socket.io': {
        target: apiTarget,
        ws: true,
      },
      '^/(classes|track|drivers|backup|restore|registrations|register|download|reset)(/|$)': {
        target: apiTarget,
      },
      '^/admin/(session|login|logout|users|sheet-import)(/|$)': {
        target: apiTarget,
      },
    },
  },
});
