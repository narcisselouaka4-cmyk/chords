import { defineConfig } from 'vite';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [tailwindcss()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    // strictPort : si 5173 est déjà pris (ancien serveur Vite zombie), Vite
    // doit ÉCHOUER bruyamment au lieu de basculer silencieusement sur 5174 —
    // electron/main.js charge http://localhost:5173/ en dur : un Vite qui
    // déporte rendrait au renderer un code d'une autre session (blocage du
    // genre « les clics ne font plus rien », rapporté le 03/09/2026).
    strictPort: true,
  },
});
