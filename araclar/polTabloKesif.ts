// POL/EPDK modülü Excel çıktılarını KEŞFET — kolon yapısı, satır sayısı, örnek veri.
//
// NEDEN: POL'ün "EPDK 2020" menüsünde A1a/A1b/A1c/A2/A3/A4/A5, UE-1, Bilgi Sistemi (E)
// ve İstasyon Dönemleri gibi tablolar var. Bunların ne olduğunu ve ASIS SOAP'tan
// çekilip çekilemeyeceğini anlamak için ÖNCE gerçek çıktılarını görmek gerekiyor —
// ekran görüntüsü kolon adlarını kesip gösteriyor, Excel tamamını veriyor.
//
// Çalıştır:
//   node --import tsx araclar/polTabloKesif.ts "<klasor>"
//   node --import tsx araclar/polTabloKesif.ts "<klasor>" --ornek 3   (örnek satır sayısı)

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { xlsxOku } from '../core/xlsx.js';

/** Kolonun dolu olup olmadığını anlamak için taranan azami satır. */
const TARAMA = 400;

function ornekDeger(satirlar: string[][], basIdx: number, kolIdx: number): string {
  for (let i = basIdx + 1; i < Math.min(satirlar.length, basIdx + TARAMA); i++) {
    const v = (satirlar[i]?.[kolIdx] ?? '').trim();
    if (v) return v.length > 22 ? v.slice(0, 22) + '…' : v;
  }
  return '';
}

async function main() {
  const klasor = process.argv[2];
  if (!klasor) {
    console.error('Kullanım: polTabloKesif.ts "<klasor>" [--ornek N]');
    process.exit(1);
  }
  const ornekSayi = Number(process.argv[process.argv.indexOf('--ornek') + 1]) || 2;

  const dosyalar = readdirSync(klasor).filter((d) => d.toLowerCase().endsWith('.xlsx')).sort();
  console.log(`${dosyalar.length} dosya bulundu\n${'='.repeat(78)}`);

  for (const d of dosyalar) {
    const yol = join(klasor, d);
    let satirlar: string[][];
    try {
      satirlar = await xlsxOku(yol);
    } catch (e) {
      console.log(`\n### ${d}\n  ✗ OKUNAMADI: ${e instanceof Error ? e.message : e}`);
      continue;
    }

    // Başlık satırı bulma.
    // ⚠️ POL çıktılarının ilk satırları BİRLEŞTİRİLMİŞ HÜCRE (rapor başlığı,
    // "Günün Tarihi…") ve okuyucu bunu her sütuna kopyalıyor → o satır "en çok
    // dolu" görünüp yanlış seçiliyordu. Gerçek başlık satırı, hücrelerin BİRBİRİNDEN
    // FARKLI olduğu ilk satırdır.
    let basIdx = 0;
    let enIyi = 0;
    for (let i = 0; i < Math.min(15, satirlar.length); i++) {
      const h = (satirlar[i] ?? []).map((x) => (x ?? '').trim()).filter(Boolean);
      if (h.length < 3) continue;
      const tekil = new Set(h).size;
      // Tekil oran yüksek + hücre sayısı fazla → başlık satırı
      const skor = tekil >= h.length * 0.8 ? tekil : 0;
      if (skor > enIyi) { enIyi = skor; basIdx = i; }
    }
    const basliklar = (satirlar[basIdx] ?? []).map((h) => (h ?? '').trim());
    const veriSatir = satirlar.length - basIdx - 1;

    console.log(`\n### ${d}`);
    console.log(`    ${veriSatir} veri satırı · ${basliklar.filter(Boolean).length} kolon (başlık satır ${basIdx + 1})`);
    console.log('    KOLONLAR:');
    basliklar.forEach((b, i) => {
      if (!b) return;
      const o = ornekDeger(satirlar, basIdx, i);
      console.log(`      ${String(i + 1).padStart(2)}. ${b.padEnd(30)} ${o ? '→ ' + o : '(boş)'}`);
    });

    if (ornekSayi > 0 && veriSatir > 0) {
      console.log('    ÖRNEK SATIR:');
      for (let i = basIdx + 1; i <= Math.min(basIdx + ornekSayi, satirlar.length - 1); i++) {
        const s = (satirlar[i] ?? []).map((v) => (v ?? '').trim()).filter(Boolean).slice(0, 8);
        if (s.length) console.log(`      ${s.join(' | ').slice(0, 150)}`);
      }
    }
  }
}

main().catch((e) => {
  console.error('Keşif hatası:', e instanceof Error ? e.message : e);
  process.exit(1);
});
