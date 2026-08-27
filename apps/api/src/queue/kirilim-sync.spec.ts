import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KIRILIM_BOYUTLARI } from './kirilim-sync.service';

/**
 * ═══ KIRILIM SENKRONİZASYONU ═══
 *
 * Bu veri bugüne kadar HİÇ toplanmıyordu: `insights_daily.breakdown_key`
 * kolonu ve `insights_breakdown` kota katmanı hazır duruyordu ama Meta
 * çağrısında `breakdowns` parametresi hiç yoktu ve zamanlanmış bir kırılım
 * işi de yoktu.
 *
 * En kritik iddia AYRI TABLO etrafında: kırılım satırları `insights_daily`ye
 * yazılsaydı mevcut toplama sorgularının hiçbiri onları süzmediği için her
 * harcama rakamı kırılım sayısı kadar KATLANIRDI — ve hiçbir hata düşmezdi.
 */
const SERVIS = readFileSync(join(__dirname, 'kirilim-sync.service.ts'), 'utf8');
const META = readFileSync(
  join(__dirname, '..', 'modules', 'connections', 'providers', 'meta.provider.ts'),
  'utf8',
);
const GOOGLE = readFileSync(
  join(__dirname, '..', 'modules', 'connections', 'providers', 'google.provider.ts'),
  'utf8',
);
const KUYRUK = readFileSync(join(__dirname, 'sync-queue.service.ts'), 'utf8');
const ISLEYICI = readFileSync(join(__dirname, 'sync-processor.service.ts'), 'utf8');
const SEMA = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');

/** Yorum satırlarını atar — dosyalar bu kuralları ANLATAN yorumlar taşıyor. */
function kod(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('///');
    })
    .join('\n');
}

/** Bir fonksiyonun gövdesini SINIRINA kadar alır — sabit uzunluk kırılgan. */
function govde(kaynak: string, ad: string): string {
  const k = kod(kaynak);
  const i = k.indexOf(ad);
  if (i === -1) throw new Error(`${ad} bulunamadı — tarama boşa düştü`);
  const sonraki = k.indexOf('\n  async ', i + 1);
  const sonraki2 = k.indexOf('\n  private ', i + 1);
  const son = [sonraki, sonraki2].filter((n) => n > -1).sort((a, b) => a - b)[0];
  return k.slice(i, son ?? undefined);
}

describe('boyutlar', () => {
  it('beş boyut toplanıyor', () => {
    expect([...KIRILIM_BOYUTLARI].sort()).toEqual(['age', 'city', 'gender', 'hour', 'placement']);
  });

  it('KRİTİK: İLGİ ALANI YOK', () => {
    /*
     * Meta'nın Ads Insights API'sinde ilgi alanı kırılımı BULUNMUYOR — ilgi
     * alanı bir hedefleme girdisi, raporlanan bir boyut değil. Google'da
     * yalnızca hedefleme kriteri olarak eklenmiş kitleler için kısmi veri
     * var. Tek platformda yarım çalışan bir boyut raporda "Meta'da neden
     * boş" sorusunu doğurur; uydurmak boş tablodan kötü.
     */
    expect(KIRILIM_BOYUTLARI as readonly string[]).not.toContain('interest');
  });
});

describe('KRİTİK: veri AYRI tabloya yazılıyor', () => {
  it('insight_breakdowns tablosuna, insights_daily’ye DEĞİL', () => {
    /*
     * `insights_daily`nin birincil anahtarı `breakdown_key` taşıyor, yani
     * kırılım satırları oraya TEKNİK OLARAK sığıyor. Ama mevcut toplama
     * sorgularının hiçbiri o kolonu süzmüyor: satırlar oraya yazıldığı an
     * her harcama rakamı kırılım sayısı kadar KATLANIR ve hiçbir hata
     * düşmez — panel yalnızca yanlış sayı gösterir.
     */
    const k = kod(SERVIS);
    expect(k).toContain('INSERT INTO insight_breakdowns');
    expect(k).not.toContain('INSERT INTO insights_daily');
  });

  it('upsert idempotent ve müşteriyi de güncelliyor', () => {
    // Hesap başka müşteriye atandığında `client_id` taşınmazsa satır yarım
    // kalır: hesabı doğru, müşterisi eski.
    const k = kod(SERVIS);
    expect(k).toContain('ON CONFLICT (date, ad_account_id, dimension, value) DO UPDATE SET');
    expect(k).toContain('client_id = EXCLUDED.client_id');
  });

  it('tablo hesap taşımada da taşınıyor', () => {
    const tasima = readFileSync(
      join(__dirname, '..', 'modules', 'connections', 'hesap-verisi-tasima.ts'),
      'utf8',
    );
    // Taşınmazsa eski müşterinin raporunda artık ona ait olmayan kitle
    // kırılımı görünmeye devam eder.
    expect(kod(tasima)).toContain("tablo: 'insight_breakdowns'");
  });

  it('RLS politikaları var', () => {
    const rls = readFileSync(join(__dirname, '..', '..', 'prisma', 'sql', '02_rls.sql'), 'utf8');
    for (const p of ['select', 'insert', 'update']) {
      expect(rls, `adv_insight_breakdowns_${p} yok`).toContain(`adv_insight_breakdowns_${p}`);
    }
  });
});

describe('Meta çekimi', () => {
  const G = () => govde(META, 'async fetchBreakdowns(');

  it('breakdowns parametresi GÖNDERİLİYOR', () => {
    // Bu parametre yoktu — kırılım verisinin hiç toplanmamasının sebebi.
    expect(G()).toContain("url.searchParams.set('breakdowns', kova)");
  });

  it('KRİTİK: atıf ayarı burada da AÇIKÇA yazılıyor', () => {
    /*
     * `fetchInsights` ile aynı gerekçe: iki çağrı farklı atıf penceresi
     * kullanırsa kırılım toplamı ana rakamı TUTMAZ ve fark hiçbir yerde
     * görünmez.
     */
    const g = G();
    expect(g).toContain("'use_unified_attribution_setting', 'true'");
    expect(g).toContain("'action_report_time', 'impression'");
  });

  it('KRİTİK: şehir için region kullanılıyor, city DEĞİL', () => {
    /*
     * Türkiye'de Meta'nın `region` kovaları illere denk geliyor —
     * kullanıcının "şehir" dediği şey bu. `city` kovası ilçe/semt düzeyine
     * iniyor ve raporda okunmaz bir tablo üretiyor.
     */
    const k = kod(META);
    const i = k.indexOf('const META_BREAKDOWN');
    expect(i).toBeGreaterThan(-1);
    const harita = k.slice(i, k.indexOf('};', i));
    expect(harita).toContain("city: 'region'");
  });

  it('saat kovası REKLAMVERENİN zaman diliminde', () => {
    // Panelin geri kalanı hesabın zaman dilimini kullanıyor; izleyicinin
    // zaman dilimine göre toplayan kova aynı ekranda iki farklı "gün"
    // tanımı demek olurdu.
    expect(kod(META)).toContain('hourly_stats_aggregated_by_advertiser_time_zone');
  });
});

describe('Google çekimi', () => {
  it('her boyut için kaynak tanımlı', () => {
    const k = kod(GOOGLE);
    const i = k.indexOf('const GOOGLE_BREAKDOWN');
    expect(i).toBeGreaterThan(-1);
    const harita = k.slice(i, k.indexOf('\n};', i));
    for (const kaynak of ['age_range_view', 'gender_view', 'geographic_view']) {
      expect(harita, `${kaynak} yok`).toContain(kaynak);
    }
  });

  it('KRİTİK: saat 0 geçerli bir değer', () => {
    /*
     * `if (!h)` yazmak gece yarısını (0) sessizce düşürürdü ve o saat
     * raporda hiç görünmezdi — sıfır harcama gibi değil, HİÇ satır gibi.
     */
    expect(kod(GOOGLE)).toContain('h === undefined || h === null ? undefined');
  });

  it('KRİTİK: coğrafi kimlikler TEK sorguda ada çevriliyor', () => {
    // Kimlik başına sorgu yüzlerce çağrı demekti.
    const g = govde(GOOGLE, 'private async geoAdlari(');
    expect(g).toContain('geo_target_constant.id IN (');
  });

  it('KRİTİK: sorguya giren kimlik DOĞRULANIYOR', () => {
    // Değer platformdan geldi ama yine de GAQL'e giriyor; sayı olmayan bir
    // değer enjeksiyon yüzeyi.
    expect(govde(GOOGLE, 'private async geoAdlari(')).toContain('/^\\d+$/.test(k)');
  });

  it('çevrilemeyen kimlik satırı DÜŞÜRMÜYOR', () => {
    /*
     * Satırı atmak o şehrin harcamasını raporun toplamından sessizce
     * çıkarırdı. Okunaksız bir kimlik, kayıp bir satırdan iyi.
     */
    expect(kod(GOOGLE)).toContain('adlar.get(s.value) ?? s.value');
  });
});

describe('iş akışı', () => {
  it('KRİTİK: bir boyutun düşmesi diğerlerini durdurmuyor', () => {
    // Şehir kırılımı coğrafi çözümde düşerse yaş ve cinsiyet yine yazılmalı.
    const k = kod(SERVIS);
    expect(k).toContain('hatalar.push(');
    expect(k).toContain('for (const dimension of KIRILIM_BOYUTLARI)');
  });

  it('KRİTİK: kısmi başarı BAŞARILI sayılmıyor', () => {
    /*
     * "Üç boyut yazıldı, ikisi düştü" durumunu `succeeded` saymak eksik
     * veriyi tam sanmak demek — `succeeded` + `rows = 0` bu projede tam
     * olarak böyle bir hata türüydü.
     */
    expect(kod(SERVIS)).toContain('if (hatalar.length > 0) {');
    expect(kod(SERVIS)).toContain('throw new Error(notlar.join');
  });

  it('KRİTİK: desteklenmeyen boyut boş sonuçtan AYRI', () => {
    // "Bu platform bu kırılımı vermiyor" ile "bu dönemde veri yok" farklı
    // iki hâl ve raporun ikisini ayırt etmesi gerekiyor.
    const k = kod(SERVIS);
    expect(k).toContain('if (sonuc.unsupported) {');
    expect(k).toContain('desteklenmeyen.push(dimension)');
  });

  it('atanmamış hesap için çalışmıyor', () => {
    // `client_id`si NULL bir satırı RLS kimseye göstermez ve iş sessizce
    // kaybolur.
    expect(kod(SERVIS)).toContain('if (account.clientId === null)');
  });

  it('kota BİR KEZ soruluyor, boyut başına değil', () => {
    // Boyut başına sormak, üçüncüde reddedilip ilk ikisinin yazıldığı YARIM
    // bir tur üretirdi ve o tur "başarılı" görünürdü.
    const k = kod(SERVIS);
    expect(k.split('this.quota.acquire(').length - 1).toBe(1);
  });
});

describe('zamanlama', () => {
  it('KRİTİK: zamanlayıcı kaydı VAR', () => {
    expect(kod(KUYRUK)).toContain("jobType: 'insights_breakdowns'");
  });

  it('KRİTİK: tarih dalı VAR — yoksa iş her gece missing_dates ile düşer', () => {
    /*
     * `sweep:keywords` tam bunu yaptı: iş kuyruğa giriyordu, dal yoktu ve
     * Google anahtar kelime verisi aylarca HİÇ toplanmadı. Tek iz
     * `sync_jobs`taydı ve okuyan yoktu.
     */
    expect(kod(ISLEYICI)).toContain("case 'insights_breakdowns':");
  });

  it('KRİTİK: işleyici dalı VAR', () => {
    expect(kod(ISLEYICI)).toContain("payload.jobType === 'insights_breakdowns'");
    expect(kod(ISLEYICI)).toContain('this.kirilim.syncAccount(');
  });

  it('enum değeri şemada tanımlı', () => {
    expect(SEMA).toContain('insights_breakdowns');
    expect(SEMA).toContain('enum BreakdownDimension');
  });
});
