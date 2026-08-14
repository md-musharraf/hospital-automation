import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      // Point at the shared SOURCE, not its compiled dist.
      //
      // The backend consumes `shared/dist` because Node needs JavaScript; the
      // browser build does not, and aliasing to source means editing a
      // normalization rule hot-reloads the form that uses it instead of
      // silently serving a stale `dist` until someone remembers to rebuild.
      // Both paths are the same TypeScript file, so the two runtimes cannot
      // disagree about what a phone number is.
      '@careeai/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url))
    }
  },

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
      clientFiles: ['./src/App.tsx', './src/components/HospitalHub.tsx']
    }
  }
});
