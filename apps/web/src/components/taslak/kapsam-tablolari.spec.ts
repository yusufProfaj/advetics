import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ KAPSAM TABLOLARI — ŞİRKET / WORKSPACE / HESAP SATIRLARI ═══
 *
 * Eski `musteri-tablosu.spec.ts`in kuralları (2026-10-09). O tablo ve şirket
 * tablosu kalktı; aynı satırlar artık iki yerde çiziliyor: Genel Bakış'ın
 * özet listesi (`OzetListeKarti`, ilk beş) ve Reklam Yöneticisi'nin tek
 * tablosu. İkisi de satıra tıklayınca kapsam değiştiriyor, yani eski
 * tablonun bütün kuralları İKİSİ İÇİN de geçerli.
 *
 * Bileşenler render edilmiyor (`vitest.config.ts`); iddialar YORUMSUZ
 * kaynağa çapalı.
 */
const WEB = join(__dirname, '..', '..');
const kod = (yol: string): string =>
  readFileSync(join(WEB, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const OZET_TUM = kod('components/taslak/genel-bakis-parcalari.tsx');
const YONETICI = kod('components/taslak/reklam-yoneticisi-tablosu.tsx');
const GB = kod('app/(dashboard)/dashboard/page.tsx');
const YM = kod('app/(dashboard)/ads-explorer/page.tsx');

/** `export function ad` ile bir sonraki `export function` arası; bulunamazsa FIRLATIR. */
function blok(kaynak: string, ad: string): string {
  const i = kaynak.indexOf(`export function ${ad}`);
  if (i < 0) throw new Error(`bulunamadı: ${ad}`);
  const j = kaynak.indexOf('\nexport ', i + 1);
  return kaynak.slice(i, j < 0 ? undefined : j);
}
const OZET = blok(OZET_TUM, 'OzetListeKarti');
const EN_COK = blok(OZET_TUM, 'EnCokHarcayanlarKarti');

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(OZET.length).toBeGreaterThan(1500);
    expect(YONETICI).toContain('export function ReklamYoneticisiTablosu');
    expect(GB).toContain('workspaceSatirlari(musteriler)');
  });
});

describe('MCC koşulu', () => {
  it('KRİTİK: workspace listesi yalnızca "Tüm workspace’ler" seçiliyken ve BİRDEN ÇOK workspace varsa', () => {
    /*
     * Tek workspace'i olan kullanıcıda da `activeClientId` null olabiliyor ve
     * orada tek satırlık bir liste, kampanya listesinden daha az şey söylerdi.
     * `!ajansGorunumu`: "Tüm şirketler" modunda `activeClientId` daima null
     * ve `availableClients` bütün şirketlerin workspace'lerini taşıyor; koşul
     * o modda da doğru olur ve ekran şirket yerine düz workspace listesi
     * gösterirdi.
     */
    for (const [ad, k] of [['Genel Bakış', GB], ['Reklam Yöneticisi', YM]] as const) {
      const bas = k.indexOf('const mcc =');
      expect(bas, `${ad}: mcc tanımı yok`).toBeGreaterThan(-1);
      const dilim = k.slice(bas, k.indexOf(';', bas));
      expect(dilim, ad).toContain('!ajansGorunumu');
      expect(dilim, ad).toContain('session.activeClientId === null');
      expect(dilim, ad).toContain('session.availableClients.length > 1');
    }
  });

  it('KRİTİK: üst katmanlarda kampanya sorgusu KOŞULMUYOR', () => {
    // Gösterilmeyecek bir sorguyu koşmak, ekranın en ağır sorgusunun boşa gitmesi.
    expect(GB).toContain('const workspaceGorunumu = !ajansGorunumu && !mcc;');
    expect(GB).toMatch(/workspaceGorunumu\s*\n?\s*\? serverApiFetch<MetricsBreakdownRow\[\]>\(`\/metrics\/breakdown\?/);
    const i = YM.indexOf('/metrics/breakdown');
    expect(i).toBeGreaterThan(-1);
    expect(YM.slice(0, i)).toMatch(/mcc \|\| ajansGorunumu \|\| varlik === null\s*\n?\s*\? Promise\.resolve\(null\)/);
  });

  it('workspace sorgusu yalnızca MCC modunda ve platform süzgeciyle', () => {
    for (const k of [GB, YM]) {
      const i = k.indexOf('/metrics/clients');
      expect(i).toBeGreaterThan(-1);
      expect(k.slice(0, i)).toMatch(/mcc\s*\n?\s*\?\s*serverApiFetch/);
      expect(k).toContain('/metrics/clients?${base}');
    }
  });
});

describe('satıra tıklayınca kapsam değişiyor', () => {
  const IKISI = [
    ['özet listesi', OZET],
    ['Reklam Yöneticisi', YONETICI],
  ] as const;

  it('KRİTİK: geçiş uçlarına gidiyor', () => {
    for (const [ad, k] of IKISI) {
      expect(k, ad).toContain("'/auth/switch-client'");
      expect(k, ad).toContain("'/auth/switch-org'");
    }
  });

  it('KRİTİK: adres TEMİZLENİYOR ama kullanıcı aynı sayfada kalıyor', () => {
    /*
     * Sayfalar kapsamı `params.* ?? session.*` sırasıyla çözüyor, yani URL
     * parametresi COOKIE'Yİ EZİYOR. Temizlenmezse üst bar yeni kapsamı
     * yazarken gövde eskisinin verisini gösterir — sızıntıdan ayırt
     * edilemeyecek kadar kötü bir hâl.
     */
    expect(OZET).toContain("const yol = usePathname() ?? '/dashboard';");
    expect(YONETICI).toContain("const yol = usePathname() ?? '/ads-explorer';");
    for (const [ad, k] of IKISI) expect(k, ad).toContain('router.replace(yol);');
  });

  it('KRİTİK: geçiş hatası YUTULMUYOR', () => {
    // İDDİA CATCH BLOĞUNA ÇAPALI: `setHata(null)` fonksiyonun başında da
    // geçiyor; catch gövdesini silmek yalnızca adı arayan testi düşürmezdi.
    for (const [ad, k] of IKISI) {
      const i = k.indexOf('} catch (e) {');
      expect(i, `${ad}: catch bloğu yok — tarama boşa düştü`).toBeGreaterThan(-1);
      const yakala = k.slice(i, k.indexOf('\n    }', i));
      expect(yakala, ad).toContain('setHata(');
      expect(yakala, ad).toContain('e.message');
      expect(k, ad).toContain('role="alert"');
    }
  });
});

describe('sayılar yalan söylemiyor', () => {
  it('KRİTİK: karışık para biriminde TUTAR değil "karışık" yazılıyor', () => {
    // 1 USD + 1 TRY = 2 ne? Kur çevrimi yok.
    expect(OZET).toContain("r.paraBirimi ? formatMoney(r.spendMicros, r.paraBirimi) : 'karışık'");
    expect(YONETICI).toContain("(b ? formatMoney(m, b) : 'karışık')");
  });

  it('TOPLAM satırı karışık para biriminde sayı basmıyor', () => {
    expect(YONETICI).toContain('const tekBirim = birimler.size === 1 ? [...birimler][0]! : null;');
    expect(YONETICI).toContain('para(T.h.toString(), tekBirim)');
  });

  it('KRİTİK: dönüşüm başı maliyet hesaplanamazsa "0" değil "—"', () => {
    // `null` "hesaplanamaz" demek; "0,00 ₺" bedava dönüşüm getirdiğini söyler.
    expect(OZET).toContain("r.dbmMicros && r.paraBirimi ? formatMoney(r.dbmMicros, r.paraBirimi) : '—'");
    expect(EN_COK).toContain("r.cpa === null ? '—'");
    expect(YONETICI).toMatch(/d > 0 && b \? formatMoney\([^\n]*: '—'/);
  });

  it('KRİTİK: micros çevrimi ORTAK fonksiyondan — yeni kopya yok', () => {
    // Yuvarlama kuralı değiştiğinde aynı sayının iki ekranda farklı görünmesi.
    expect(EN_COK).toContain('microsOf(r.cpa)');
    expect(OZET_TUM).not.toContain('* 1_000_000');
    expect(GB).toContain('dbmMicros: microsOf(r.cpa),');
  });

  it('sessiz kesme yok: kaç workspace ve kaçının harcadığı yazılı', () => {
    expect(GB).toContain('tanesi bu dönemde harcadı');
  });

  it('KRİTİK: boş satırın SEBEBİ yazılı', () => {
    // "Hesap atanmamış" ile "hesabı var ama harcamamış" aynı boş satır olarak
    // görünüyordu ve ikisinin yapılacak işi farklı.
    // İDDİA WORKSPACE SATIRINA ÇAPALI: aynı cümle şirket satırında da geçiyor
    // ve dosya geneline bakan bir arama workspace dalı silinince de geçiyordu.
    for (const [k, ad] of [[GB, 'workspaceSatirlari'], [YM, 'workspaceSatiri']] as const) {
      const i = k.indexOf(`function ${ad}(`);
      expect(i, `${ad} bulunamadı`).toBeGreaterThan(-1);
      const f = k.slice(i, k.indexOf('\nfunction ', i + 1));
      expect(f, ad).toContain("r.adAccountCount === 0 ? 'izlemede hesap yok'");
    }
  });
});
