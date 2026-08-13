// Kullanıcı yönetimi — YALNIZ admin. Yetki kontrolü korumali({rol:'admin'}) ile.
//
//   GET    /api/kullanicilar                → liste + tumEkranlar
//   POST   /api/kullanicilar {ad, sifre?, rol?, adSoyad?, ekranlar?}
//                                            → ekle (sifre boşsa otomatik üretilir)
//   PATCH  /api/kullanicilar {ad, rol?, yeniSifre?, ekranlar?}
//                                            → rol / şifre / ekran yetkisi güncelle
//   DELETE /api/kullanicilar?ad=x            → sil
//
// `ekranlar`: gönderilmezse DOKUNULMAZ, null → hepsi, dizi → yalnız o ekranlar.
//
// Üretilen/sıfırlanan şifre yanıtta BİR KEZ döner (hash'lenmiş hali saklanır);
// admin onu kullanıcıya iletir. Kullanıcı ilk girişte değiştirmeye zorlanır.
import { db, hataYanit } from './_db.js';
import { korumali } from './_oturum.js';
import {
  kullaniciListesi, kullaniciEkle, kullaniciSil, rolDegistir, sifreDegistir,
  ekranlariGuncelle, sifreUret, adNormal, type Rol,
} from '../core/kullanicilar.js';
import { EKRANLAR } from '../core/ekranlar.js';

const rolGecerli = (r: unknown): r is Rol => r === 'admin' || r === 'izleyici';

function govdeOku(req: any): any {
  if (!req.body) return {};
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
}

export default korumali(
  async (req, res, benKim) => {
    try {
      const p = db();
      res.setHeader('Cache-Control', 'private, no-store');

      if (req.method === 'GET') {
        res.status(200).json({
          kullanicilar: await kullaniciListesi(p),
          benKim: benKim.kullanici_ad,
          // Yetki seçicisinin kutularını bu listeden çizer — panelde ikinci bir
          // ekran listesi tutulmaz (kayma riski).
          tumEkranlar: EKRANLAR,
        });
        return;
      }

      if (req.method === 'POST') {
        const g = govdeOku(req);
        // Şifre verilmediyse üret ve yanıtta bir kez döndür.
        const uretildi = !g.sifre;
        const sifre = uretildi ? sifreUret() : String(g.sifre);
        const k = await kullaniciEkle(p, {
          ad: String(g.ad ?? ''),
          sifre,
          rol: rolGecerli(g.rol) ? g.rol : 'izleyici',
          adSoyad: g.adSoyad ? String(g.adSoyad) : undefined,
          olusturan: benKim.kullanici_ad,
          sifreDegistir: true, // ilk girişte değiştirmeye zorla
          // Alan hiç gönderilmediyse undefined → NULL (hepsi). Gönderildiyse
          // temizlenir; uydurma ekran adları sessizce atılır.
          ekranlar: 'ekranlar' in g ? g.ekranlar : undefined,
        });
        res.status(201).json({ kullanici: k, sifre, uretildi });
        return;
      }

      if (req.method === 'PATCH') {
        const g = govdeOku(req);
        const hedef = adNormal(String(g.ad ?? ''));
        if (!hedef) throw new Error('Kullanıcı adı gerekli.');

        let yeniSifre: string | undefined;
        if (g.sifreSifirla || g.yeniSifre) {
          yeniSifre = g.yeniSifre ? String(g.yeniSifre) : sifreUret();
          await sifreDegistir(p, { ad: hedef, yeniSifre, adminAtlama: true });
        }
        if (rolGecerli(g.rol)) {
          // Kendi yönetici rolünü düşürmeyi engelle (kilitlenme riski).
          if (hedef === benKim.kullanici_ad && g.rol !== 'admin')
            throw new Error('Kendi yönetici rolünü düşüremezsin.');
          await rolDegistir(p, hedef, g.rol);
        }
        // Ekran yetkisi. Alan gönderilmediyse DOKUNULMAZ (rol değişimi yetkileri
        // sıfırlamasın); null gönderilirse sınırlama kalkar, dizi ise o liste yazılır.
        if ('ekranlar' in g) await ekranlariGuncelle(p, hedef, g.ekranlar);
        res.status(200).json({ tamam: true, sifre: yeniSifre });
        return;
      }

      if (req.method === 'DELETE') {
        const hedef = adNormal(String(req.query?.ad ?? ''));
        if (!hedef) throw new Error('Kullanıcı adı gerekli.');
        if (hedef === benKim.kullanici_ad) throw new Error('Kendini silemezsin.');
        await kullaniciSil(p, hedef);
        res.status(200).json({ tamam: true });
        return;
      }

      res.status(405).json({ hata: 'Yöntem desteklenmiyor.' });
    } catch (e) {
      // İş kuralı hataları (zaten var, son admin, zayıf şifre) 400 olmalı — 500 değil.
      const m = e instanceof Error ? e.message : String(e);
      const isKurali = /zaten var|silinemez|düşürülemez|hatalı|gerekli|olmalı|içermeli|bulunamadı|silemezsin|düşüremezsin|kullanılabilir/i.test(m);
      if (isKurali) res.status(400).json({ hata: m });
      else hataYanit(res, e);
    }
  },
  { rol: 'admin' },
);
