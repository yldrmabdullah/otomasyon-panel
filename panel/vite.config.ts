import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vercel: build çıktısı panel/dist, panel/api/ serverless function olarak sunulur
// (yapılandırma repo kökündeki vercel.json'da — core/ bundle'a girsin diye orada).
//
// Local: /api/* istekleri araclar/panelSunucu.ts'e proxy'lenir (npm run panel:api).
// Statik snapshot dosyaları ARTIK KULLANILMIYOR: /api/bayiler sunucu-taraflı
// sayfalama yapıyor (query parametresi) ve statik JSON buna cevap veremez.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PANEL_API_PORT ?? 5178}`,
        changeOrigin: true,
        // Çerez Domain'i localhost olarak kalsın (oturum akışı local'de de çalışsın)
        cookieDomainRewrite: 'localhost',
      },
    },
  },
});
