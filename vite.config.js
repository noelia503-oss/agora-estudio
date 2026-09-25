import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages sirve los proyectos bajo /<nombre-del-repositorio>/.
  // En local se conserva la ruta raíz.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  server: {
    fs: {
      deny: ['**/material/**', '**/material'],
    },
  },
});
