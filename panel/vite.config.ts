import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vercel: build çıktısı dist/, api/ klasörü serverless function olarak sunulur.
// Local'de /api/* isteklerini public/api/ altındaki statik snapshot dosyaları
// karşılar (araclar/panelSnapshot.ts üretir) — proxy gerekmiyor.
export default defineConfig({
  plugins: [react()],
});
