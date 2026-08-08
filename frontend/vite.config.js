import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: {
    // Split the vendor libraries out of the app bundle. React, the router and
    // socket.io barely change between releases, so giving them their own chunks
    // means a normal deploy only invalidates the app chunk — returning staff get
    // the dashboard from cache instead of re-downloading everything.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          realtime: ['socket.io-client'],
          icons: ['lucide-react']
        }
      }
    },
    // The portals are genuinely large; warn at a threshold that flags real
    // regressions instead of crying wolf on every build.
    chunkSizeWarningLimit: 700
  },

  server: {
    // A reception desk on a slow LAN benefits from the dev server not
    // re-resolving these on every cold start.
    warmup: {
      clientFiles: ['./src/App.jsx', './src/components/HospitalHub.jsx']
    }
  }
});
