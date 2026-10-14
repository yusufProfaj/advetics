import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DERLEYICI_NIYETLERI, derleMeta, type DerlemeGirdisi } from '@advetics/shared';

/*
 * ═══ ESKİ ADVANTAGE+ TÜRLERİ BEKÇİSİ (pazar araştırması, 2026-10-15) ═══
 *
 * Meta, Advantage+ Shopping (ASC) ve App (AAC) kampanyalarını kaldırıyor:
 * v25'ten beri API'den oluşturulamıyor, v26'da (tahmini Eylül 2026) var
 * olanlar DURAKLATILIYOR (docs/pazar/advcampaign.md, Meta geliştirici
 * blogu 2026-02-13). Advantage+ artık tür değil, üç kaldıracın durumu
 * (`advantage_state_info`). Derleyicimiz bugün o alanları üretmiyor;
 * bu dosya bunun öyle KALMASINI kilitliyor: biri "Advantage+ Satış"ı eski
 * yolla kurmaya kalkarsa kampanya kurulur, birkaç hafta sonra hiçbir hata
 * vermeden durur ve kullanıcı harcamanın neden kesildiğini bilemez.
 */
const YASAKLI = ['smart_promotion_type', 'AUTOMATED_SHOPPING_ADS', 'SMART_APP_PROMOTION', 'existing_customer_budget_percentage'];

const temel = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-15',
  workspaceKisaAdi: 'Örnek Yapı',
  niyet: 'SITE',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: { konumlar: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: 500_000_000n, seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-16T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [{ gorselHash: 'h1', baslik: 'B1', metin: 'M1' }],
  hedefAdres: 'https://ornek.com/',
  formId: '999',
  telefon: '+905551112233',
  urlEtiketleri: null,
  whatsappNumarasi: '+905551112233',
  pikselId: '123456789',
} as DerlemeGirdisi;

/** Gövdenin bütün anahtarlarını ve dize değerlerini düz bir metne indir (derin). */
function izler(x: unknown, out: string[] = []): string[] {
  if (Array.isArray(x)) for (const v of x) izler(v, out);
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) (out.push(k), izler(v, out));
  else if (typeof x === 'string') out.push(x);
  return out;
}

describe('derleyici eski Advantage+ türü üretmiyor', () => {
  it('KRİTİK: derlenebilen her amacın gövdesinde ASC/AAC alanı yok', () => {
    let derlenen = 0;
    const reddedilen: string[] = [];
    // Derleyicinin KENDİ niyet listesi (rehber amaç kodları değil: VIDEO → VIDEO_IZLENME).
    for (const niyet of DERLEYICI_NIYETLERI) {
      // Video izlenme yalnız video fikri kabul ediyor (KRT-VIDEO-ZORUNLU).
      const kavramlar = niyet === 'VIDEO_IZLENME' ? [{ gorselHash: 'KAPAK', videoId: 'VID', baslik: 'B1', metin: 'M1' }] : temel.kavramlar;
      const r = derleMeta({ ...temel, niyet, kavramlar });
      if (r.tur !== 'govde') {
        reddedilen.push(`${niyet}: ${r.retler.map((x) => x.kod).join(',')}`);
        continue;
      }
      derlenen++;
      const hepsi = izler(r);
      for (const y of YASAKLI) expect(hepsi, `${niyet}: ${y}`).not.toContain(y);
    }
    // Fikstür bozulup bir amaç derlenmezse iddia o amaç için boşa düşerdi: HEPSİ derlenmeli.
    expect(reddedilen).toEqual([]);
    expect(derlenen).toBe(DERLEYICI_NIYETLERI.length);
  });

  it('KRİTİK: Meta’ya yazan kod yollarında yasaklı alan adı geçmiyor (fikstürü olmayan amaç da kapsanır)', () => {
    const kok = join(__dirname, '../../../../../..');
    const dizinler = ['packages/shared/src/reklam', 'apps/api/src/modules/reklam', 'apps/api/src/modules/draft-tree', 'apps/api/src/modules/boosts', 'apps/api/src/modules/autoboost'];
    const dosyalar: string[] = [];
    const gez = (d: string) => {
      for (const ad of readdirSync(d)) {
        const yol = join(d, ad);
        if (statSync(yol).isDirectory()) gez(yol);
        else if (/\.ts$/.test(ad) && !/\.spec\.ts$/.test(ad)) dosyalar.push(yol);
      }
    };
    for (const d of dizinler) gez(join(kok, d));
    dosyalar.push(join(kok, 'apps/api/src/modules/connections/providers/meta.provider.ts'));
    // Tarama boşa düşmesin: derleyicinin kendisi listede olmalı.
    expect(dosyalar.some((f) => f.endsWith('reklam/meta/derle.ts'))).toBe(true);
    const bulunan = dosyalar.flatMap((f) => {
      const k = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      return YASAKLI.filter((y) => k.includes(y)).map((y) => `${f.slice(kok.length)}: ${y}`);
    });
    expect(bulunan).toEqual([]);
  });
});
