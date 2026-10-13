import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TakipAcigiYaniti } from '@advetics/shared';
import { kaynakDurumMetni, siteSutunuKarari, sitedeHaritasi } from './veri-kaynagi';

const yanit = (ek: Partial<TakipAcigiYaniti> = {}): TakipAcigiYaniti => ({
  donem: { from: '2026-09-01', to: '2026-09-30' },
  kiyasBitis: '2026-09-30',
  emptyReason: null,
  satirlar: [
    { platform: 'meta', kampanyaId: 'k1', kampanyaAdi: 'A', platformDonusum: 142, siteDonusum: 61, platformTiklama: 3388, siteOturum: 3000, etiket: 'platform_fazla', oran: 0.43 },
    { platform: 'google', kampanyaId: 'k2', kampanyaAdi: 'B', platformDonusum: 96, siteDonusum: 88, platformTiklama: 2910, siteOturum: 2500, etiket: 'uyumlu', oran: 0.92 },
  ],
  toplamSatir: 2,
  eslenemeyen: { pay: 0.14, anahtarEtkinlik: 49, nedenler: {} },
  uyarilar: [],
  kalite: { digerSatiri: false, esiklendi: false, ornekleme: false },
  ...ek,
});

describe('Reklam Yöneticisi "Sitede" sütunu', () => {
  it('KRİTİK: GA4 bağlı değilse sütun YOK; bağlı ama veri yoksa sütun açık ve NEDENİ yazar', () => {
    expect(siteSutunuKarari(yanit({ emptyReason: 'kaynak_yok', satirlar: [] }))).toBeNull();
    expect(siteSutunuKarari(yanit({ emptyReason: 'cekim_kosmadi', satirlar: [] }))!.not).toMatch(/henüz çekilmedi/);
    expect(siteSutunuKarari(yanit({ emptyReason: 'izin_eksik', satirlar: [] }))!.not).toMatch(/izni/);
  });

  it('KRİTİK: çağrı düştüyse hata ayrı (boş sütunla karışmaz) ve sütun açık kalır', () => {
    expect(siteSutunuKarari({ hata: 'Sunucuya ulaşılamadı.' })).toEqual({ hata: 'Sunucuya ulaşılamadı.', not: null });
  });

  it('eşlenemeyen pay notta; etiket yalnız sorunlu satırda', () => {
    expect(siteSutunuKarari(yanit())!.not).toMatch(/%14/);
    const m = sitedeHaritasi(yanit());
    expect(m.get('k1')).toEqual({ anahtarEtkinlik: 61, etiket: 'Site daha az görüyor' });
    expect(m.get('k2')).toEqual({ anahtarEtkinlik: 88, etiket: null });
  });

  it('sayfa sütunu yalnız kampanya düzeyinde ve hatayı yutmadan çağırıyor', () => {
    const src = readFileSync(join(__dirname, '../app/(dashboard)/ads-explorer/page.tsx'), 'utf8');
    expect(src).toMatch(/varlik === 'campaign' && !mcc && !ajansGorunumu && session\.activeClientId/);
    expect(src).toMatch(/\.catch\(\(e: unknown\) => \(\{ hata: hataMetni\(e\) \}\)\)/);
  });
});

describe('kaynak kartı durumu', () => {
  it('yeşil yalnız "Bağlı"; izin/erişim sorunu kırmızı', () => {
    expect(kaynakDurumMetni({ durum: 'etkin' })).toEqual({ metin: 'Bağlı', ton: 'yesil' });
    expect(kaynakDurumMetni({ durum: 'izin_eksik' }).ton).toBe('kirmizi');
    expect(kaynakDurumMetni({ durum: 'duraklatildi' }).ton).toBe('gri');
  });

  it('kart grubu Kurulum bölümünün İÇİNDE (ayrı bölüm değil) ve hatayı yutmuyor', () => {
    // 2026-10-13: eski Bağlantılar bölümü Kurulum'a katlandı (docs/panel-sadelestirme/MIMARI.md).
    const sayfa = readFileSync(join(__dirname, '../app/(dashboard)/marka-merkezi/page.tsx'), 'utf8');
    const bas = sayfa.indexOf("bolum === 'kurulum'");
    if (bas < 0) throw new Error('kurulum bölümü bulunamadı');
    expect(sayfa.slice(bas, sayfa.indexOf("bolum === 'marka'", bas))).toContain('<VeriKaynaklari');
    const kart = readFileSync(join(__dirname, '../components/marka-merkezi/veri-kaynaklari.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(kart).not.toMatch(/\.catch\(\(\) => set\w+\(\[\]\)\)/);
  });
});
