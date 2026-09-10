import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MetricsBreakdownRow } from '@advetics/shared';
import { SIRALAMALAR, SIRALAMA_YONU, kirilimSirala, siralamaCoz } from './kirilim-siralama';

/**
 * ═══ KIRILIM SIRALAMASI ═══
 *
 * Ekranın sorusu "hangi kampanya hangi mecrada ve ne harcıyor". Sıralama
 * GÖSTERİM kararı: satır kümesi sunucudan her zaman "harcamaya göre ilk N"
 * geliyor ve burada yalnızca sıra değişiyor.
 *
 * En kritik iki iddia:
 *   · `null` DEĞERLER SONDA — CPA'da `null` "hesaplanamıyor" (dönüşüm yok)
 *     demek, sıfır DEĞİL. Sıfır saymak hiç dönüşüm getirmemiş kampanyaları
 *     "en ucuz CPA" olarak listenin başına taşırdı.
 *   · EŞİTLİKTE HARCAMA — mecraya göre sıralarken aynı platformun satırları
 *     arasında düzen olmazsa tablo her yenilemede farklı sıra gösterebilir
 *     ve kullanıcı verinin değiştiğini sanır.
 */

function satir(p: {
  ad: string;
  platform: 'meta' | 'google' | 'linkedin';
  harcama: string;
  gosterim?: number;
  tik?: number;
  donusum?: number;
  cpa?: number | null;
}): MetricsBreakdownRow {
  return {
    entityId: p.ad,
    entityExternalId: p.ad,
    name: p.ad,
    parentName: null,
    platform: p.platform,
    status: 'active',
    currency: 'TRY',
    impressions: p.gosterim ?? 0,
    clicks: p.tik ?? 0,
    spendMicros: p.harcama,
    conversions: p.donusum ?? 0,
    conversionValueMicros: '0',
    ctr: null,
    cpc: null,
    cpm: null,
    cpa: p.cpa === undefined ? null : p.cpa,
    roas: null,
    previous: null,
  } as MetricsBreakdownRow;
}

const ADLAR = (rows: MetricsBreakdownRow[]): string[] => rows.map((r) => r.name);

describe('siralamaCoz', () => {
  it('bilinen değerleri geçiriyor', () => {
    for (const s of SIRALAMALAR) expect(siralamaCoz(s)).toBe(s);
  });

  it('bilinmeyen ve eksik değer VARSAYILANA düşüyor — panel açılmalı', () => {
    // URL elle düzenlenmiş olabilir; bir yazım hatası yüzünden Genel
    // Bakış'ın açılmaması abartı olurdu.
    expect(siralamaCoz('cpm')).toBe('harcama');
    expect(siralamaCoz(undefined)).toBe('harcama');
    expect(siralamaCoz('')).toBe('harcama');
  });
});

describe('kirilimSirala — yön', () => {
  const rows = [
    satir({ ad: 'orta', platform: 'meta', harcama: '50', gosterim: 50, tik: 5, donusum: 5, cpa: 20 }),
    satir({ ad: 'buyuk', platform: 'meta', harcama: '90', gosterim: 90, tik: 9, donusum: 9, cpa: 30 }),
    satir({ ad: 'kucuk', platform: 'meta', harcama: '10', gosterim: 10, tik: 1, donusum: 1, cpa: 5 }),
  ];

  it('harcama BÜYÜKTEN küçüğe', () => {
    expect(ADLAR(kirilimSirala(rows, 'harcama'))).toEqual(['buyuk', 'orta', 'kucuk']);
  });

  it('gösterim, tık ve dönüşüm de büyükten küçüğe', () => {
    expect(ADLAR(kirilimSirala(rows, 'gosterim'))).toEqual(['buyuk', 'orta', 'kucuk']);
    expect(ADLAR(kirilimSirala(rows, 'tik'))).toEqual(['buyuk', 'orta', 'kucuk']);
    expect(ADLAR(kirilimSirala(rows, 'donusum'))).toEqual(['buyuk', 'orta', 'kucuk']);
  });

  it('CPA KÜÇÜKTEN büyüğe — tek ters yönlü sütun', () => {
    /*
     * CPA'da artış KÖTÜ ve tabloda zaten `inverse` ile öyle işaretli.
     * Diğerleriyle aynı yöne çevirmek, "en verimli kampanya hangisi"
     * sorusunun cevabını listenin en altına iterdi.
     */
    expect(ADLAR(kirilimSirala(rows, 'cpa'))).toEqual(['kucuk', 'orta', 'buyuk']);
    expect(SIRALAMA_YONU.cpa).toBe('artan');
    expect(SIRALAMA_YONU.harcama).toBe('azalan');
  });
});

describe('kirilimSirala — mecra', () => {
  it('platforma göre grupluyor ve grup İÇİNDE harcamaya göre diziyor', () => {
    const rows = [
      satir({ ad: 'm-kucuk', platform: 'meta', harcama: '10' }),
      satir({ ad: 'g-buyuk', platform: 'google', harcama: '90' }),
      satir({ ad: 'm-buyuk', platform: 'meta', harcama: '80' }),
      satir({ ad: 'g-kucuk', platform: 'google', harcama: '20' }),
    ];
    expect(ADLAR(kirilimSirala(rows, 'mecra'))).toEqual([
      'g-buyuk',
      'g-kucuk',
      'm-buyuk',
      'm-kucuk',
    ]);
  });

  it('grup içindeki belirleyici HARCAMA — ad DEĞİL', () => {
    /*
     * Aynı platformun satırları arasında bir düzen olmazsa tablo her
     * yenilemede farklı sıra gösterebilir (`sort` kararlılığı girdi
     * sırasına bağlı) ve kullanıcı verinin değiştiğini sanır. Belirleyici
     * ADA bağlansaydı ekranda "en çok harcayan" sorusu cevapsız kalırdı.
     */
    const rows = [
      satir({ ad: 'zeta', platform: 'meta', harcama: '90' }),
      satir({ ad: 'alfa', platform: 'meta', harcama: '10' }),
    ];
    expect(ADLAR(kirilimSirala(rows, 'mecra'))).toEqual(['zeta', 'alfa']);
  });
});

describe('kirilimSirala — null değerler', () => {
  it('CPA’sı OLMAYAN satır sonda — "en ucuz" sanılmıyor', () => {
    /*
     * Dönüşüm getirmemiş bir kampanyanın CPA'sı hesaplanamıyor. `null`ı
     * sıfır saymak onu listenin en başına taşırdı ve ekranın verdiği cevabın
     * tam tersini gösterirdi.
     */
    const rows = [
      satir({ ad: 'pahali', platform: 'meta', harcama: '90', cpa: 100 }),
      satir({ ad: 'donusumsuz', platform: 'meta', harcama: '50', cpa: null }),
      satir({ ad: 'ucuz', platform: 'meta', harcama: '10', cpa: 3 }),
    ];
    expect(ADLAR(kirilimSirala(rows, 'cpa'))).toEqual(['ucuz', 'pahali', 'donusumsuz']);
  });

  it('hepsi null ise harcama sırası kalıyor', () => {
    const rows = [
      satir({ ad: 'kucuk', platform: 'meta', harcama: '10', cpa: null }),
      satir({ ad: 'buyuk', platform: 'meta', harcama: '90', cpa: null }),
    ];
    expect(ADLAR(kirilimSirala(rows, 'cpa'))).toEqual(['buyuk', 'kucuk']);
  });
});

describe('kirilimSirala — sözleşme', () => {
  it('GİRDİYİ DEĞİŞTİRMİYOR — kopya döndürüyor', () => {
    /*
     * Yerinde sıralamak çağıranın elindeki diziyi de değiştirirdi; aynı
     * diziyi başka bir bileşene veren bir sayfa sessizce farklı sıra
     * görürdü.
     */
    const rows = [
      satir({ ad: 'kucuk', platform: 'meta', harcama: '10' }),
      satir({ ad: 'buyuk', platform: 'meta', harcama: '90' }),
    ];
    const once = ADLAR(rows);
    kirilimSirala(rows, 'harcama');
    expect(ADLAR(rows)).toEqual(once);
  });

  it('BÜYÜK MİKROS DEĞERLERİNDE de doğru — BigInt üzerinden okunuyor', () => {
    /*
     * İKİ DEĞER KASITLI SEÇİLDİ: `Number()` ikisini de 9007199254740992'ye
     * yuvarlıyor, yani sayıya indirgeyen bir karşılaştırma onları EŞİT görür
     * ve girdi sırasını korur. Yıllık harcama micros cinsinden bu aralığa
     * giriyor ve belirtisi "iki kampanyanın yeri bazen değişiyor" oluyor.
     */
    expect(Number(9007199254740993n)).toBe(Number(9007199254740992n));
    const rows = [
      satir({ ad: 'kucuk', platform: 'meta', harcama: '9007199254740992' }),
      satir({ ad: 'buyuk', platform: 'meta', harcama: '9007199254740993' }),
    ];
    expect(kirilimSirala(rows, 'harcama')[0]?.name).toBe('buyuk');
  });

  it('BAŞLIKTAKİ OK İLE GERÇEK SIRA AYNI — her sütun için', () => {
    /*
     * Yön iki yerde yazılsaydı (biri okta, biri sıralamada) doğduğu anda
     * ayrışırdı: başlık "↑" gösterirken tablo azalan sıralanır ve hiçbir
     * hata düşmez. Bu test ikisini KARŞILAŞTIRIYOR, ikisinin de var
     * olduğunu değil.
     */
    const kucuk = satir({
      ad: 'kucuk',
      platform: 'google',
      harcama: '10',
      gosterim: 10,
      tik: 1,
      donusum: 1,
      cpa: 5,
    });
    const buyuk = satir({
      ad: 'buyuk',
      platform: 'meta',
      harcama: '90',
      gosterim: 90,
      tik: 9,
      donusum: 9,
      cpa: 50,
    });

    for (const s of SIRALAMALAR) {
      const ilk = kirilimSirala([kucuk, buyuk], s)[0]?.name;
      // "artan" = küçük değer önce. Mecrada 'google' < 'meta', ve o satır
      // aynı zamanda küçük olan — tek fixture bütün sütunları kapsıyor.
      expect([s, ilk]).toEqual([s, SIRALAMA_YONU[s] === 'artan' ? 'kucuk' : 'buyuk']);
    }
  });
});

// -----------------------------------------------------------------------------
// KAYNAK TARAMASI — bileşen render edilemiyor (vitest.config.ts bunu bilinçli
// reddediyor), o yüzden ekranın davranışı kaynaktan kilitleniyor.
// -----------------------------------------------------------------------------

const oku = (p: string): string =>
  readFileSync(resolve(__dirname, '..', p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('kırılım tablosu — mecra sütunu', () => {
  const KAYNAK = oku('components/breakdown-table.tsx');

  it('satır başına PLATFORM basılıyor', () => {
    // Kullanıcının istediği şey buydu: aynı listede Meta ve Google
    // kampanyaları yan yana duruyor ve hangi harcamanın hangi mecraya
    // gittiği yalnızca kampanya adından tahmin edilebiliyordu.
    expect(KAYNAK).toContain('<Mecra platform={r.platform} />');
    expect(KAYNAK).toContain('PLATFORM_KISA_ADLARI[platform]');
    expect(KAYNAK).toContain('platformKanali(platform)');
  });

  it('KESME EKRANDA YAZILI — "ilk N satır" notu var', () => {
    /*
     * Tablo harcamaya göre ilk N satırı gösteriyor. Bu yazılmazsa "mecraya
     * göre sıraladım ama Google kampanyalarımın çoğu listede yok" hâli
     * hiçbir yerde açıklanmaz. CLAUDE.md: "Sessiz kesme yok."
     */
    expect(KAYNAK).toContain('rows.length >= limit');
    expect(KAYNAK).toContain('Harcamaya göre ilk {limit} satır');
  });

  it('başlıklar LİNK — tablo sunucu bileşeni kalıyor', () => {
    // Buton yazmak seçimi URL'den alır, bağlantıyı paylaşılamaz yapar ve
    // tabloyu istemci bileşenine çevirirdi.
    expect(KAYNAK).not.toContain("'use client'");
    expect(KAYNAK).toContain("baglanti('/dashboard', tasinan, { sirala: anahtar })");
  });
});

describe('Genel Bakış — katman sırası', () => {
  const KAYNAK = oku('app/(dashboard)/dashboard/page.tsx');

  it('AJANS kontrolü MCC kontrolünden ÖNCE geliyor', () => {
    /*
     * `tumSirketler` modunda `activeClientId` daima null ve
     * `availableClients` bütün şirketlerin workspace'lerini taşıyor — yani
     * `mcc` koşulu da doğru oluyor. Sıra bozulursa ajans kapsamında yine
     * düz workspace listesi görünür ve şirket katmanı hiç açılmaz.
     */
    const ajans = KAYNAK.indexOf('const ajansGorunumu');
    const mcc = KAYNAK.indexOf('const mcc =');
    expect(ajans).toBeGreaterThan(-1);
    expect(mcc).toBeGreaterThan(ajans);
    expect(KAYNAK).toContain('!ajansGorunumu && session.activeClientId === null');
  });

  it('ajans kapsamında ŞİRKET tablosu render ediliyor', () => {
    expect(KAYNAK).toContain('<SirketTablosu rows={sirketler}');
    expect(KAYNAK).toContain("serverApiFetch<MetricsOrganizationRow[]>(`/metrics/organizations?");
  });

  it('üst katmanlarda KAMPANYA sorgusu koşulmuyor', () => {
    // Gösterilmeyecek bir sorguyu koşmak, en ağır sorgusu boşa giden bir
    // ekran demekti.
    expect(KAYNAK).toContain('mcc || ajansGorunumu');
  });

  it('LİMİT TEK SABİTTEN okunuyor — sorgu ve ekrandaki not ayrışmasın', () => {
    expect(KAYNAK).toContain("breakdownQs.set('limit', String(KIRILIM_LIMITI))");
    expect(KAYNAK).toContain('limit={KIRILIM_LIMITI}');
  });

  it('SIRALAMA SORGUYA DEĞİL, GELEN SATIRLARA uygulanıyor', () => {
    /*
     * `ORDER BY platform LIMIT 25` yazmak satır KÜMESİNİ değiştirirdi:
     * alfabetik olarak öne düşen platformun 25 kampanyası gelir, diğeri
     * tabloda HİÇ görünmezdi — üstelik hiçbir hata vermeden.
     */
    expect(KAYNAK).toContain('rows={kirilimSirala(breakdown, siralama)}');
    expect(KAYNAK).not.toContain("breakdownQs.set('sirala'");
  });
});
