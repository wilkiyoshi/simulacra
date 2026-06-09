import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base: './'` gera caminhos relativos, então o build funciona tanto em
// localhost quanto sob o subcaminho do GitHub Pages (ex.: /simulacra/).
// A simulação roda 100% no navegador, então não há mais proxy para backend.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
