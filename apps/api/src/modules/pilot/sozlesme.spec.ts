import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  KURULUM_ARA_DURUMLARI,
  kuruluyorPlanKarari,
  METIN_BOS_NEDENLERI,
  metinKorunurMu,
  metinleriTasi,
  metinYazilacakSatirlar,
  planMetinEksikleri,
  planUyumGirdisi,
  PLAN_BICIMI,
  reklamMetinleriniYerlestir,
  reklamMetniEksikleri,
  saklananPlanOku,
  TAKILAN_SATIR_EN_COK_DENEME,
  TAKILAN_SATIR_HEDEFI,
  TAKILMA_ESIGI_DK,
  takilanSatirKarari,
  type ReklamMetniYazimi,
  BUTCE_HIZI,
  butceHiziSapmasi,
  degisiklikCumleyleUyumluMu,
  degisiklikUygula,
  eylemArtirirMi,
  geriAlmaAdimi,
  harcayipDonusmeyenMi,
  hucreSchema,
  kaynakliSchema,
  kendiligindenUygulanabilirMi,
  KURULUM_GECISLERI,
  KURULUM_SATIR_DURUMLARI,
  KURULUM_SINIFI,
  kurulumOzeti,
  musteriOzeti,
  negatifAdayMi,
  ONERI_ACIK_DURUMLARI,
  ONERI_DURUMLARI,
  ONERI_GECISLERI,
  ONERI_SON_DURUMLARI,
  oneriBayatMi,
  oneriGecisiIzinliMi,
  onayKapisi,
  PILOT_PLAN_DURUMLARI,
  PILOT_PLAN_EYLEMLERI,
  PILOT_PLAN_SON_DURUMLARI,
  PILOT_SAYFA_IZNI,
  PILOT_UCLARI,
  pilotGecisMumkunMu,
  pilotPlanDuzenlenebilirMi,
  pilotTaslakEksikleri,
  pilotTaslakKanonikIcerik,
  PLAN_YAYIN_IZNI,
  planKanonikIcerik,
  planOnerisiSchema,
  planUret,
  resolvePermissions,
  satirdanTaslak,
  sayisalKaynakliSchema,
  uyumDurumu,
  YORULAN_KREATIF,
  yorulanKreatifMi,
  yzMetniDenetle,
  yzMetniEkle,
  type GecisYazani,
  type Kaynak,
  type OneriEylemi,
  type PlanOnerisi,
  type PlanUretGirdisi,
  type SatirdanTaslakBaglami,
  type UyumDenetimi,
} from '@advetics/shared';
import { metinliPlan } from '../../../test/pilot-fixture';
import { YAZICI_KILIT_MS } from './kurulum-isleyici';

/**
 * ═══ PİLOT SÖZLEŞMESİ (Ajan 1) ═══
 *
 * Saf fonksiyonlar ÇALIŞTIRILARAK sınanıyor. "KRİTİK" işaretli testler
 * mutasyonla doğrulandı (MIMARI.md §10): kodun ilgili satırı bozuldu, test
 * düştü, geri alındı.
 */

const T = '2026-10-07T06:00:00.000Z';
const M = 1_000_000n;
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function girdi(over: Partial<PlanUretGirdisi> = {}): PlanUretGirdisi {
  return {
    clientId: U(1),
    donem: '2026-11',
    bugun: '2026-10-07',
    simdi: T,
    aylikButce: { id: U(2), micros: 120_000n * M, paraBirimi: 'TRY', guncellendi: T },
    ayHarcanan: { deger: 0n, kaynak: { tur: 'gecmis_veri', kimlik: 'insights_daily', zaman: T, aciklama: 'Gelecek ay: harcama yok' } },
    hesaplar: [
      { id: U(3), platform: 'meta', paraBirimi: 'TRY' },
      { id: U(4), platform: 'google', paraBirimi: 'TRY' },
    ],
    gecmis: {
      pencere: { from: '2026-07-09', to: '2026-10-06' },
      okundu: T,
      platformlar: [
        { platform: 'meta', harcamaMicros: 50_000n * M, sonuc: 620 },
        { platform: 'google', harcamaMicros: 38_000n * M, sonuc: 380 },
      ],
    },
    marka: { profilId: U(5), guncellendi: T, anaAmac: 'form' },
    kitleler: [
      { id: U(10), ad: 'Varsayılan', katman: 'soguk', varsayilan: true, guncellendi: T },
      { id: U(11), ad: 'Etkileşim 180 gün', katman: 'sicak', varsayilan: false, guncellendi: T },
      { id: U(12), ad: 'Site ziyaretçisi', katman: 'yeniden_pazarlama', varsayilan: false, guncellendi: T },
    ],
    varliklar: [
      { id: U(20), ad: 'pahali', tur: 'gorsel', yuklendi: '2026-08-01T00:00:00Z', performans: { harcamaMicros: 9_000n * M, sonuc: 30, pencere: { from: '2026-07-09', to: '2026-10-06' }, okundu: T } },
      { id: U(21), ad: 'ucuz', tur: 'gorsel', yuklendi: '2026-08-01T00:00:00Z', performans: { harcamaMicros: 3_000n * M, sonuc: 60, pencere: { from: '2026-07-09', to: '2026-10-06' }, okundu: T } },
      { id: U(22), ad: 'sonucsuz', tur: 'video', yuklendi: '2026-09-01T00:00:00Z', performans: { harcamaMicros: 5_000n * M, sonuc: 0, pencere: { from: '2026-07-09', to: '2026-10-06' }, okundu: T } },
      { id: U(23), ad: 'yeni', tur: 'gorsel', yuklendi: '2026-10-01T00:00:00Z', performans: null },
      { id: U(24), ad: 'eski-yeni', tur: 'gorsel', yuklendi: '2026-09-15T00:00:00Z', performans: null },
    ],
    kelimeler: [
      { id: U(30), kelime: 'kahve makinesi', grup: 'Kahve makinesi', aylikArama: 90_500, cekim: T },
      { id: U(31), kelime: 'filtre kahve makinesi', grup: 'Kahve makinesi', aylikArama: 9_900, cekim: T },
      { id: U(32), kelime: 'kahve çekirdeği', grup: 'Kahve çekirdeği', aylikArama: 49_500, cekim: T },
      { id: U(33), kelime: 'nadir terim', grup: 'Kahve çekirdeği', aylikArama: 480, cekim: T },
    ],
    ...over,
  };
}

const toplamSatir = (p: PlanOnerisi) => p.satirlar.reduce((a, s) => a + BigInt(s.tutar.deger), 0n);

describe('kaynak çapası', () => {
  const sema = sayisalKaynakliSchema(z.string());
  const kaynak: Kaynak = { tur: 'aylik_butce', kimlik: U(2), zaman: T };

  it('KRİTİK: kaynaksız değer şemadan geçmez', () => {
    expect(kaynakliSchema(z.string()).safeParse({ deger: '1' }).success).toBe(false);
    expect(kaynakliSchema(z.string()).safeParse({ deger: '1', kaynak: { ...kaynak, kimlik: '' } }).success).toBe(false);
    expect(kaynakliSchema(z.string()).safeParse({ deger: '1', kaynak }).success).toBe(true);
  });

  it('KRİTİK: sayı taşıyan hücrenin kaynağı yapay zekâ olamaz', () => {
    expect(sema.safeParse({ deger: '1', kaynak: { ...kaynak, tur: 'yz_metin' } }).success).toBe(false);
    const h = hucreSchema(z.string(), { sayisal: true });
    expect(h.safeParse({ dolu: true, deger: '1', kaynak: { ...kaynak, tur: 'yz_metin' } }).success).toBe(false);
    // Metin hücresinde yapay zekâ kaynağı serbest.
    expect(hucreSchema(z.string(), { sayisal: false }).safeParse({ dolu: true, deger: 'x', kaynak: { ...kaynak, tur: 'yz_metin' } }).success).toBe(true);
  });

  it('boş hücre nedensiz olamaz', () => {
    const h = hucreSchema(z.string(), { sayisal: true });
    expect(h.safeParse({ dolu: false }).success).toBe(false);
    expect(h.safeParse({ dolu: false, emptyReason: 'uydurma_neden' }).success).toBe(false);
    expect(h.safeParse({ dolu: false, emptyReason: 'gecmis_yok' }).success).toBe(true);
  });

  it('KRİTİK: yapay zekâ metni plandaki sayıların dışında sayı getiremez', () => {
    expect(yzMetniDenetle('Bu ay 120.000 TL ile %62 Meta', ['120000', '62'])).toEqual([]);
    expect(yzMetniDenetle('Bu ay 150.000 TL ile 2.000 form', ['120000'])).toEqual(['150000', '2000']);
  });
});

describe('planUret', () => {
  it('KRİTİK: satırların toplamı plan toplamına TAM eşit; her hücre kaynaklı (şema)', () => {
    const p = planUret(girdi());
    expect(p.engeller).toEqual([]);
    expect(p.toplam.dolu && p.toplam.deger).toBe((120_000n * M).toString());
    expect(toplamSatir(p)).toBe(120_000n * M);
    expect(p.dagitilmamis.micros).toBe('0');
    const r = planOnerisiSchema.safeParse(JSON.parse(JSON.stringify(p)));
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues.slice(0, 3))).toBe(true);
  });

  it('KRİTİK: deterministik — girdi dizilerinin sırası çıktıyı değiştirmez', () => {
    const a = planUret(girdi());
    const g = girdi();
    const b = planUret({ ...g, kitleler: [...g.kitleler].reverse(), varliklar: [...g.varliklar].reverse(), kelimeler: [...g.kelimeler].reverse() });
    expect(planKanonikIcerik(b)).toBe(planKanonikIcerik(a));
  });

  it('platform payı 90 günün SONUÇ payından; kaynak geçmiş veri', () => {
    const p = planUret(girdi());
    const meta = p.platformlar.find((x) => x.platform === 'meta')!;
    expect(meta.payBaz.deger).toBe(6200);
    expect(meta.payBaz.kaynak.tur).toBe('gecmis_veri');
    expect(meta.tutar.deger).toBe((74_400n * M).toString());
    // 74.400 × 620 / 50.000 = 922
    expect(meta.beklenenSonuc.dolu && meta.beklenenSonuc.deger).toBe(922);
  });

  it('geçmiş yoksa adlı ajans sabiti, kaynağında adı yazılı', () => {
    const p = planUret(girdi({ gecmis: null }));
    expect(p.platformlar.map((x) => [x.platform, x.payBaz.deger, x.payBaz.kaynak.kimlik])).toEqual([
      ['meta', 6000, 'GECMISSIZ_PLATFORM_PAYI_YUZ'],
      ['google', 4000, 'GECMISSIZ_PLATFORM_PAYI_YUZ'],
    ]);
    expect(p.beklenenSonuc).toEqual({ dolu: false, emptyReason: 'gecmis_yok' });
  });

  it('KRİTİK: dönüşümü sıfır olan platform dışarıda kalır ve nedeni yazılır', () => {
    const g = girdi();
    const p = planUret({ ...g, gecmis: { ...g.gecmis!, platformlar: [{ platform: 'meta', harcamaMicros: 10n * M, sonuc: 5 }, { platform: 'google', harcamaMicros: 10n * M, sonuc: 0 }] } });
    expect(p.disaridaKalanlar).toEqual([{ platform: 'google', neden: 'donusum_yok' }]);
    expect(p.satirlar.every((s) => s.platform === 'meta')).toBe(true);
    expect(toplamSatir(p)).toBe(120_000n * M);
  });

  it('plan seviyesi ön koşullar ayrı nedenlerle', () => {
    expect(planUret(girdi({ aylikButce: null })).engeller).toEqual(['aylik_butce_yok']);
    expect(planUret(girdi({ hesaplar: [] })).engeller).toEqual(['hesap_yok']);
    expect(planUret(girdi({ hesaplar: [{ id: U(3), platform: 'meta', paraBirimi: 'USD' }] })).engeller).toEqual(['karisik_birim']);
    expect(planUret(girdi({ bugun: '2026-11-30' })).engeller).toEqual(['donem_gecti']);
  });

  const harcandi = (micros: bigint) => ({ deger: micros, kaynak: { tur: 'gecmis_veri' as const, kimlik: 'insights_daily', zaman: T, pencere: { from: '2026-10-01', to: '2026-10-20' } } });

  it('KRİTİK: kısmi ayda toplam = aylık bütçe − bu ay harcanan; başlangıç yarın (S-7)', () => {
    const p = planUret(girdi({ donem: '2026-10', bugun: '2026-10-21', ayHarcanan: harcandi(81_500_500_000n) }));
    expect(p.takvim).toEqual({ baslangic: '2026-10-22', bitis: '2026-10-31' });
    // 120.000 − 81.500,50 = 38.499,50 → tam birime aşağı 38.499
    expect(p.toplam.dolu && p.toplam.deger).toBe((38_499n * M).toString());
    expect(p.toplam.dolu && p.toplam.kaynak.aciklama).toContain('harcanan');
    expect(toplamSatir(p)).toBe(38_499n * M);
  });

  it('KRİTİK: harcanan bilinmiyorsa toplam BOŞ + neden; gün oranına düşülmez', () => {
    const p = planUret(girdi({ donem: '2026-10', bugun: '2026-10-21', ayHarcanan: null }));
    expect(p.toplam).toEqual({ dolu: false, emptyReason: 'harcanan_bilinmiyor' });
    expect(p.engeller).toEqual(['harcanan_bilinmiyor']);
    expect(p.satirlar).toEqual([]);
  });

  it('KRİTİK: harcanan bütçeye ulaştıysa toplam 0 DEĞİL boş + "bütçe bitti"', () => {
    for (const h of [120_000n * M, 130_000n * M]) {
      const p = planUret(girdi({ donem: '2026-10', bugun: '2026-10-21', ayHarcanan: harcandi(h) }));
      expect(p.toplam).toEqual({ dolu: false, emptyReason: 'ay_butcesi_bitti' });
      expect(p.satirlar).toEqual([]);
    }
  });

  it('Google eşik altı kelimeleri almaz; hiç kelime yoksa Google dışarıda + neden', () => {
    const p = planUret(girdi());
    const kelimeler = p.satirlar.filter((s) => s.platform === 'google').flatMap((s) => s.kelimeGrubu!.kelimeler.deger);
    expect(kelimeler).not.toContain('nadir terim');
    const q = planUret(girdi({ kelimeler: [] }));
    expect(q.disaridaKalanlar).toEqual([{ platform: 'google', neden: 'kelime_yok' }]);
  });

  it('kitlesi olmayan katmanın payı yeni kitleye eklenir ve notta yazılır', () => {
    const g = girdi();
    const p = planUret({ ...g, kitleler: g.kitleler.filter((k) => k.katman === 'soguk') });
    const meta = p.satirlar.filter((s) => s.platform === 'meta');
    expect(meta).toHaveLength(1);
    expect(meta[0]!.notlar.join(' ')).toContain('Kitlesi olmayan katmanların payı');
  });

  it('KRİTİK: harcayıp sonuç getirmemiş varlık seçilmez; ölçülen ucuz önce, sonra en yeni', () => {
    const p = planUret(girdi());
    const s = p.satirlar.find((x) => x.platform === 'meta')!;
    const ids = s.varliklar!.dolu ? s.varliklar!.deger.map((v) => v.deger.id) : [];
    expect(ids).toEqual([U(21), U(20), U(23)]);
  });

  it('KRİTİK: ölçülmüş varlık az olsa bile sonuçsuz varlık dolgu olarak da seçilmez', () => {
    const g = girdi();
    const p = planUret({ ...g, varliklar: g.varliklar.filter((v) => v.ad === 'sonucsuz' || v.ad === 'yeni') });
    const s = p.satirlar.find((x) => x.platform === 'meta')!;
    expect(s.varliklar!.dolu && s.varliklar!.deger.map((v) => v.deger.id)).toEqual([U(23)]);
  });

  it('Meta bütçesi dönem toplamı, Google günlük = tutar ÷ gün', () => {
    const p = planUret(girdi());
    for (const s of p.satirlar) {
      if (s.platform === 'meta') expect(s.butce.deger).toEqual({ tip: 'toplam', micros: s.tutar.deger });
      else expect(s.butce.deger.micros).toBe(((BigInt(s.tutar.deger) / 30n) / M * M).toString());
    }
  });

  it('ana amaç yoksa niyet boş + neden ve satır kurulamaz', () => {
    const p = planUret(girdi({ marka: { profilId: U(5), guncellendi: T, anaAmac: null } }));
    const s = p.satirlar.find((x) => x.platform === 'meta')!;
    expect(s.niyet).toEqual({ dolu: false, emptyReason: 'ana_amac_yok' });
    expect(s.engeller).toContain('ana_amac_yok');
  });

  it('derlenmeyen niyet (WHATSAPP) satırı kurulamaz yapar', () => {
    const p = planUret(girdi({ marka: { profilId: U(5), guncellendi: T, anaAmac: 'whatsapp' } }));
    expect(p.satirlar.find((x) => x.platform === 'meta')!.engeller).toContain('niyet_derlenmiyor');
  });
});

describe('yapay zekâ metni ve değişiklik', () => {
  it('KRİTİK: planda olmayan sayı taşıyan gerekçe yazılmaz', () => {
    const p = planUret(girdi());
    expect(yzMetniEkle(p, 'Meta payı %62, toplam 120.000 TL.', { model: 'gemini', zaman: T }).tur).toBe('tamam');
    const r = yzMetniEkle(p, 'Bu planla 5.000 form bekliyoruz.', { model: 'gemini', zaman: T });
    expect(r).toEqual({ tur: 'ret', uydurulanSayilar: ['5000'] });
  });

  const kim: Kaynak = { tur: 'kullanici', kimlik: U(99), zaman: T };

  it('KRİTİK: toplamı aşan değişiklik reddedilir', () => {
    const p = planUret(girdi());
    const a = p.satirlar[0]!.anahtar;
    expect(degisiklikUygula(p, [{ tur: 'satir_tutari_fark', anahtar: a, farkMicros: (1n * M).toString(), yon: 'artir' }], kim).tur).toBe('ret');
  });

  it('azaltma + artırma birlikte geçer; değişen satırın kaynağı kişi; gerekçe düşer', () => {
    let p = planUret(girdi());
    p = yzMetniEkle(p, 'Toplam 120.000 TL.', { model: 'gemini', zaman: T }).tur === 'tamam' ? (yzMetniEkle(p, 'Toplam 120.000 TL.', { model: 'gemini', zaman: T }) as { plan: PlanOnerisi }).plan : p;
    const meta = p.satirlar.find((s) => s.platform === 'meta')!.anahtar;
    const google = p.satirlar.find((s) => s.platform === 'google')!.anahtar;
    const r = degisiklikUygula(
      p,
      [
        { tur: 'satir_tutari_fark', anahtar: meta, farkMicros: (5_000n * M).toString(), yon: 'azalt' },
        { tur: 'satir_tutari_fark', anahtar: google, farkMicros: (5_000n * M).toString(), yon: 'artir' },
      ],
      kim,
    );
    expect(r.tur).toBe('tamam');
    if (r.tur !== 'tamam') return;
    expect(toplamSatir(r.plan)).toBe(120_000n * M);
    expect(r.plan.satirlar.find((s) => s.anahtar === google)!.tutar.kaynak.tur).toBe('kullanici');
    expect(r.plan.ozetMetni).toEqual({ dolu: false, emptyReason: 'yz_yazmadi' });
    expect(planOnerisiSchema.safeParse(JSON.parse(JSON.stringify(r.plan))).success).toBe(true);
  });

  it('çıkarılan satırın tutarı dağıtılmamışa döner ve nedeni yazılır', () => {
    const p = planUret(girdi());
    const s = p.satirlar[0]!;
    const r = degisiklikUygula(p, [{ tur: 'satir_cikar', anahtar: s.anahtar }], kim);
    expect(r.tur === 'tamam' && r.plan.dagitilmamis).toEqual({ micros: s.tutar.deger, nedenler: ['kullanici_cikardi'] });
  });

  it('değişikliğin kaynağı bir kişi olmalı (yapay zekâ kaynağıyla değişiklik yok)', () => {
    const p = planUret(girdi());
    expect(degisiklikUygula(p, [{ tur: 'satir_cikar', anahtar: p.satirlar[0]!.anahtar }], { ...kim, tur: 'yz_metin' }).tur).toBe('ret');
  });

  it('KRİTİK: cümledeki sayı değişikliği karşılamalı (model sıfır eklerse ret)', () => {
    const d = (f: bigint) => [{ tur: 'satir_tutari_fark' as const, anahtar: 'x', farkMicros: (f * M).toString(), yon: 'artir' as const }];
    expect(degisiklikCumleyleUyumluMu("Google'a 5.000 TL daha ayır", d(5_000n))).toBe(true);
    expect(degisiklikCumleyleUyumluMu("Google'a 5.000 TL daha ayır", d(50_000n))).toBe(false);
  });
});

describe('plan durum makinesi', () => {
  const yazanlar: GecisYazani[] = ['ajans', 'musteri', 'worker', 'sistem'];
  const herhangi = (d: (typeof PILOT_PLAN_DURUMLARI)[number]) =>
    PILOT_PLAN_EYLEMLERI.filter((e) => yazanlar.some((y) => pilotGecisMumkunMu(d, e, y)));

  it('KRİTİK: son olmayan her durumun çıkışı var; son durumların yok (kısmi indeks kalıcı kilit üretmez)', () => {
    for (const d of PILOT_PLAN_DURUMLARI) {
      if (PILOT_PLAN_SON_DURUMLARI.includes(d)) expect(herhangi(d), d).toEqual([]);
      else expect(herhangi(d).length, d).toBeGreaterThan(0);
    }
  });

  it('KRİTİK: ajansın yayın düğmesi yok — kurulumu yalnız worker başlatır (Ç-6)', () => {
    expect(pilotGecisMumkunMu('onaylandi', 'kurulum_basla', 'ajans')).toBe(false);
    expect(pilotGecisMumkunMu('onaylandi', 'kurulum_basla', 'worker')).toBe(true);
  });

  it('müşteri planı gönderemez/iptal edemez; onaylayabilir ve değişiklik isteyebilir', () => {
    expect(pilotGecisMumkunMu('taslak', 'musteriye_gonder', 'musteri')).toBe(false);
    expect(pilotGecisMumkunMu('musteride', 'iptal', 'musteri')).toBe(false);
    expect(pilotGecisMumkunMu('musteride', 'onayla', 'musteri')).toBe(true);
    expect(pilotGecisMumkunMu('musteride', 'degisiklik_iste', 'musteri')).toBe(true);
    expect(pilotGecisMumkunMu('taslak', 'onayla', 'musteri')).toBe(false);
  });

  it('KRİTİK: kısmen kurulan plan yeniden denemeden de KAPATILABİLİR', () => {
    /*
     * `yeniden_dene` tek çıkış olsaydı, kalıcı olarak düşen bir satır (silinmiş
     * sayfa) planı `kismen_kuruldu`da tutardı ve "açık plan" indeksi o ayı
     * yeni plana kilitlerdi. Kapatmak kurulmuş satırlara dokunmaz.
     */
    expect(pilotGecisMumkunMu('kismen_kuruldu', 'kapat', 'ajans')).toBe(true);
    expect(PILOT_PLAN_SON_DURUMLARI).toContain('kapatildi');
  });

  it('kurulum başladıktan sonra iptal yok; yalnız taslak düzenlenir', () => {
    expect(pilotGecisMumkunMu('kuruluyor', 'iptal', 'ajans')).toBe(false);
    expect(PILOT_PLAN_DURUMLARI.filter(pilotPlanDuzenlenebilirMi)).toEqual(['taslak']);
  });
});

describe('onay = yayın kapısı', () => {
  // Metinli: karar (a) sonrası metinsiz Meta satırı onaya gelemez (aşağıda ayrı test).
  const plan = metinliPlan(planUret(girdi()));
  const ozet = 'a'.repeat(64);
  const temel = {
    durum: 'musteride' as const,
    surum: 3,
    icerikOzeti: ozet,
    istek: { surum: 3, icerikOzeti: ozet },
    rol: 'musteri' as const,
    plan,
    aylikButceMicros: 120_000n * M,
    uyum: 'gecti' as const,
    ajansinKendiSirketi: false,
    gercekYayinAcik: true,
    yasalUyari: null,
  };

  it('uyum geçtiyse gerçek yayın', () => {
    expect(onayKapisi(temel)).toEqual({ tur: 'kabul', kip: 'gercek', ajansNotu: null });
  });

  it('KRİTİK: sürüm ya da içerik özeti farklıysa ret', () => {
    const r1 = onayKapisi({ ...temel, istek: { surum: 2, icerikOzeti: ozet } });
    const r2 = onayKapisi({ ...temel, istek: { surum: 3, icerikOzeti: 'b'.repeat(64) } });
    expect(r1.tur === 'ret' && r1.retler.map((x) => x.kod)).toEqual(['SURUM']);
    expect(r2.tur === 'ret' && r2.retler.map((x) => x.kod)).toEqual(['SURUM']);
  });

  it('KRİTİK: uyum bağlı değilse gerçek yayın YOK — ajans şirketinde test, müşteri şirketinde kapalı; müşteriye söylenmez', () => {
    const a = onayKapisi({ ...temel, uyum: 'bagli_degil', ajansinKendiSirketi: true });
    const b = onayKapisi({ ...temel, uyum: 'bagli_degil' });
    expect(a.tur === 'kabul' && a.kip).toBe('test');
    expect(b.tur === 'kabul' && b.kip).toBe('kapali');
    expect(b.tur === 'kabul' && b.ajansNotu).toContain('Uyum');
  });

  it('KRİTİK: anahtar kapalıyken uyum geçse bile gerçek YOK — ajans şirketinde test, müşteri şirketinde KAPALI; ajansa söylenir', () => {
    const m = onayKapisi({ ...temel, gercekYayinAcik: false });
    expect(m).toMatchObject({ tur: 'kabul', kip: 'kapali' });
    expect(m.tur === 'kabul' && m.ajansNotu).toContain('anahtarı kapalı');
    const a = onayKapisi({ ...temel, gercekYayinAcik: false, ajansinKendiSirketi: true });
    expect(a).toMatchObject({ tur: 'kabul', kip: 'test' });
    // Anahtar uyum bağlı değilken gerçeği AÇAMAZ.
    expect(onayKapisi({ ...temel, uyum: 'bagli_degil', gercekYayinAcik: true })).toMatchObject({ kip: 'kapali' });
  });

  it('ENGEL, işaretsiz UYARI ve bayat denetim onayı kapatır', () => {
    for (const [u, kod] of [['engel', 'UYUM_ENGEL'], ['uyari_isaret_bekliyor', 'UYUM_UYARI'], ['bayat', 'UYUM_BAYAT']] as const) {
      const r = onayKapisi({ ...temel, uyum: u });
      expect(r.tur === 'ret' && r.retler.map((x) => x.kod)).toEqual([kod]);
      expect(r.tur === 'ret' && r.retler[0]!.musteriMesaji).not.toContain('uyum');
    }
  });

  it('KRİTİK: Aylık Bütçe plan toplamının altına düşürüldüyse ret; bütçe yoksa ret', () => {
    const r = onayKapisi({ ...temel, aylikButceMicros: 100_000n * M });
    expect(r.tur === 'ret' && r.retler.map((x) => x.kod)).toEqual(['BUTCE_ASIMI']);
    const y = onayKapisi({ ...temel, aylikButceMicros: null });
    expect(y.tur === 'ret' && y.retler.map((x) => x.kod)).toEqual(['BUTCE_YOK']);
  });

  it('KRİTİK: bütçe SATIR toplamıyla (B-3) — beyan boşken de; satırlar beyanı aşarsa bütçe içinde olsa da ret', () => {
    const sisir = (p: PlanOnerisi, ek: bigint): PlanOnerisi => ({
      ...p,
      satirlar: p.satirlar.map((s, i) => (i === 0 ? { ...s, tutar: { ...s.tutar, deger: (BigInt(s.tutar.deger) + ek).toString() } } : s)),
    });
    // Beyan edilen toplam BOŞ, satırlar bütçeyi aşıyor: beyana bakan kapı bunu göremezdi.
    const bos = { ...sisir(plan, 50_000n * M), toplam: { dolu: false as const, emptyReason: 'aylik_butce_yok' as const } };
    const b = onayKapisi({ ...temel, plan: bos });
    expect(b.tur === 'ret' && b.retler.map((x) => x.kod)).toContain('BUTCE_ASIMI');
    // Satırlar beyanı 10.000 aşıyor ama bütçe 200.000: müşterinin okuduğu toplam harcanacak olandan küçük.
    const r = onayKapisi({ ...temel, plan: sisir(plan, 10_000n * M), aylikButceMicros: 200_000n * M });
    expect(r.tur === 'ret' && r.retler.map((x) => x.kod)).toEqual(['BUTCE_ASIMI']);
  });

  it('ajans müşteri adına gerekçesiz onaylayamaz', () => {
    const r = onayKapisi({ ...temel, rol: 'ajans' });
    expect(r.tur === 'ret' && r.retler.map((x) => x.kod)).toEqual(['GEREKCE']);
    expect(onayKapisi({ ...temel, rol: 'ajans', istek: { ...temel.istek, musteriAdinaGerekce: 'Müşteri telefonda onayladı, 7 Ekim 14:00' } }).tur).toBe('kabul');
  });

  it('kurulamayan satırı olan plan onaylanamaz; müşteride olmayan plan onaylanamaz', () => {
    const p = planUret(girdi({ marka: null }));
    expect(onayKapisi({ ...temel, plan: p }).tur).toBe('ret');
    const r = onayKapisi({ ...temel, durum: 'taslak' });
    expect(r.tur === 'ret' && r.retler.map((x) => x.kod)).toEqual(['DURUM']);
  });

  it('KRİTİK: müşteri özeti — Meta en çok = toplam, Google en çok = min(gün×2×günlük, 30,4×günlük)', () => {
    const o = musteriOzeti(plan)!;
    const meta = o.platformlar.find((x) => x.platform === 'meta')!;
    const google = o.platformlar.find((x) => x.platform === 'google')!;
    expect(meta.enCokMicros).toBe(meta.toplamMicros);
    const gunlukler = plan.satirlar.filter((s) => s.platform === 'google').map((s) => BigInt(s.butce.deger.micros));
    const beklenen = gunlukler.reduce((a, d) => a + (60n * d < (d * 304n) / 10n ? 60n * d : (d * 304n) / 10n), 0n);
    expect(google.enCokMicros).toBe(beklenen.toString());
    expect(o.gunSayisi).toBe(30);
    expect(o.cumleler.join(' ')).toContain('120.000,00 TL');
  });

  it('KRİTİK: kısa dönemde Google en çok = gün × 2 × günlük (ay sınırı değil)', () => {
    const p = planUret(girdi({ donem: '2026-10', bugun: '2026-10-21' }));
    const o = musteriOzeti(p)!;
    expect(o.gunSayisi).toBe(10);
    const d = p.satirlar.filter((s) => s.platform === 'google').map((s) => BigInt(s.butce.deger.micros));
    expect(o.platformlar.find((x) => x.platform === 'google')!.enCokMicros).toBe(d.reduce((a, x) => a + 20n * x, 0n).toString());
    expect(BigInt(o.enCokMicros)).toBeGreaterThan(BigInt(o.toplamMicros));
    expect(o.cumleler.join(' ')).toContain('iki katına');
  });
});

describe('uyum durumu', () => {
  const den = (b: UyumDenetimi['bulgular'], ozet = 'x'): UyumDenetimi => ({ katalogSurumu: '2026.10.1', icerikOzeti: ozet, zaman: T, bulgular: b });
  const uyari = { kuralKimligi: 'GNL-03', seviye: 'UYARI' as const, durum: 'kaldi' as const, yer: 'plan', mesaj: 'İndirim oranı kanıt ister', neYapmali: '', kimCozer: 'ajans' as const, dayanak: '' };

  it('KRİTİK: denetim yoksa "geçti" DEĞİL, bağlı değil', () => {
    expect(uyumDurumu(null, [], 'x')).toBe('bagli_degil');
    expect(uyumDurumu(den([]), [], 'x')).toBe('gecti');
  });

  it('UYARI işaretlenince geçer; mesaj değişirse işaret düşer; başka sürümün denetimi bayat', () => {
    const isaret = { kuralKimligi: 'GNL-03', mesaj: uyari.mesaj, userId: U(9), zaman: T };
    expect(uyumDurumu(den([uyari]), [], 'x')).toBe('uyari_isaret_bekliyor');
    expect(uyumDurumu(den([uyari]), [isaret], 'x')).toBe('gecti');
    expect(uyumDurumu(den([{ ...uyari, mesaj: 'yeni metin' }]), [isaret], 'x')).toBe('uyari_isaret_bekliyor');
    expect(uyumDurumu(den([]), [], 'y')).toBe('bayat');
    expect(uyumDurumu(den([{ ...uyari, seviye: 'ENGEL' }]), [isaret], 'x')).toBe('engel');
  });
});

describe('toplu kurulum', () => {
  it('KRİTİK: her durumun sınıfı var; son olmayan her durumun çıkışı var', () => {
    expect(Object.keys(KURULUM_SINIFI).sort()).toEqual([...KURULUM_SATIR_DURUMLARI].sort());
    for (const d of KURULUM_SATIR_DURUMLARI) {
      if (!KURULUM_SINIFI[d].son) expect(KURULUM_GECISLERI[d].length, d).toBeGreaterThan(0);
    }
  });

  it('KRİTİK: sayım bütün son durumları kapsar; tek satır bile planı açık bırakmaz', () => {
    expect(kurulumOzeti([{ durum: 'acildi' }, { durum: 'duraklatilmis_kuruldu' }]).planHedefi).toBe('kuruldu');
    expect(kurulumOzeti([{ durum: 'acildi' }, { durum: 'kayit_belirsiz' }]).planHedefi).toBe('kismen_kuruldu');
    expect(kurulumOzeti([{ durum: 'acildi' }, { durum: 'kuruluyor' }]).planHedefi).toBeNull();
    for (const d of KURULUM_SATIR_DURUMLARI.filter((x) => KURULUM_SINIFI[x].son)) {
      expect(kurulumOzeti([{ durum: d }]).planHedefi, d).not.toBeNull();
    }
  });

  it('kapalı kipte kurulmayan satır başarı sayılmaz', () => {
    expect(kurulumOzeti([{ durum: 'kurulmadi_kapali' }]).planHedefi).toBe('kismen_kuruldu');
  });

  it('kayıt belirsizse yeniden kurulum yok (mükerrer kampanya = para)', () => {
    expect(KURULUM_GECISLERI.kayit_belirsiz).not.toContain('prova');
    expect(KURULUM_GECISLERI.kayit_belirsiz).not.toContain('kuruluyor');
  });
});

describe('satirdanTaslak', () => {
  const plan = planUret(girdi());
  const onay: Kaynak = { tur: 'onayli_plan', kimlik: `${U(50)}@3`, zaman: T };
  const baglam: SatirdanTaslakBaglami = {
    planId: U(50),
    planSurum: 3,
    onayKaynagi: onay,
    takvim: plan.takvim!,
    hesap: { deger: U(3), kaynak: { tur: 'workspace_profili', kimlik: U(3), zaman: T } },
    sayfa: { deger: U(60), kaynak: { tur: 'workspace_profili', kimlik: U(60), zaman: T } },
    instagram: null,
    kitleKonumlari: new Map([[U(10), { deger: [{ tur: 'city', key: '2348', etiket: 'İzmir', ulkeKodu: 'TR' }], kaynak: { tur: 'kitle_sablonu', kimlik: U(10), zaman: T } }]]),
    ozelKategoriler: { deger: [], kaynak: { tur: 'marka_merkezi', kimlik: U(5), zaman: T } },
    hedefAdres: { deger: 'https://ornek.example', kaynak: { tur: 'marka_merkezi', kimlik: U(5), zaman: T } },
    formSablonuId: { deger: U(70), kaynak: { tur: 'marka_merkezi', kimlik: U(5), zaman: T } },
    tabanNegatifler: { deger: ['bedava'], kaynak: { tur: 'sabit_kural', kimlik: 'TABAN_NEGATIFLER', zaman: T } },
    zaman: T,
  };
  const metaSatir = plan.satirlar.find((s) => s.anahtar.startsWith('meta:soguk'))!;
  const googleSatir = plan.satirlar.find((s) => s.platform === 'google')!;

  it('KRİTİK: bütçe ve takvim onaylı plandan; Google duraklatılmış kurulur (K-02)', () => {
    const t = satirdanTaslak(metaSatir, baglam);
    expect(t.butce.kaynak).toEqual(onay);
    expect(t.butce.deger.micros).toBe(metaSatir.tutar.deger);
    expect(satirdanTaslak(googleSatir, baglam).acilis.deger).toBe('duraklatilmis_kalir');
  });

  it('metin yazılana kadar taslak eksik; yasal uyarı her metinde aranır', () => {
    const t = satirdanTaslak(metaSatir, baglam);
    expect(pilotTaslakEksikleri(t).map((e) => e.kod)).toEqual(['KRT-METIN']);
    const gorsel = t.varliklar?.dolu ? t.varliklar.deger[0]! : null;
    const y = { ...t, metinler: { dolu: true as const, deger: [{ varlikId: gorsel, baslik: 'B', metin: 'Kahve' }], kaynak: { tur: 'yz_metin' as const, kimlik: 'gemini', zaman: T } } };
    expect(pilotTaslakEksikleri(y)).toEqual([]);
    // Görsele bağlı olmayan metin reklam olmaz (işçi görsel başına kuruyor): onay anıyla AYNI denetleyici.
    expect(pilotTaslakEksikleri({ ...y, metinler: { ...y.metinler, deger: [{ varlikId: null, baslik: 'B', metin: 'Kahve' }] } }).map((e) => e.kod)).toEqual(['KRT-VARLIK']);
    expect(pilotTaslakEksikleri(y, { yasalUyari: 'Kampanya stoklarla sınırlıdır.' }).map((e) => e.kod)).toEqual(['YASAL-UYARI']);
  });

  it('KRİTİK: özel kategori sorulmadıysa kurulum yok; bütçenin kaynağı yapay zekâ olamaz', () => {
    const t = satirdanTaslak(metaSatir, { ...baglam, ozelKategoriler: null });
    expect(pilotTaslakEksikleri(t).map((e) => e.kod)).toContain('OZK-SORU');
    const yz = { ...satirdanTaslak(metaSatir, baglam), butce: { deger: { tip: 'toplam' as const, micros: '1' }, kaynak: { tur: 'yz_metin' as const, kimlik: 'm', zaman: T } } };
    expect(pilotTaslakEksikleri(yz).map((e) => e.kod)).toEqual(expect.arrayContaining(['KAYNAK', 'YZ-SAYI']));
  });

  it('içerik özetine kaynak zamanı girmez, kaynak türü girer', () => {
    const a = satirdanTaslak(metaSatir, baglam);
    const b = satirdanTaslak(metaSatir, { ...baglam, zaman: '2026-10-08T00:00:00.000Z', onayKaynagi: { ...onay, zaman: '2026-10-08T00:00:00.000Z' } });
    expect(pilotTaslakKanonikIcerik(b)).toBe(pilotTaslakKanonikIcerik(a));
    const c = { ...a, butce: { ...a.butce, kaynak: { ...a.butce.kaynak, tur: 'kullanici' as const } } };
    expect(pilotTaslakKanonikIcerik(c)).not.toBe(pilotTaslakKanonikIcerik(a));
  });
});

describe('Pilot öneri kartı', () => {
  it('KRİTİK: harcayıp dönüşmeyen — eşik, öğrenme dönemi ve kıyas yokluğu', () => {
    const k = 100n * M;
    expect(harcayipDonusmeyenMi({ yasGun: 7, harcamaMicros: 200n * M, sonuc: 0, kiyasMaliyetMicros: k })).toEqual({ kart: true });
    expect(harcayipDonusmeyenMi({ yasGun: 7, harcamaMicros: 199n * M, sonuc: 0, kiyasMaliyetMicros: k })).toEqual({ kart: false, neden: 'esik_alti' });
    expect(harcayipDonusmeyenMi({ yasGun: 6, harcamaMicros: 900n * M, sonuc: 0, kiyasMaliyetMicros: k })).toEqual({ kart: false, neden: 'ogrenme_donemi' });
    expect(harcayipDonusmeyenMi({ yasGun: 9, harcamaMicros: 900n * M, sonuc: 0, kiyasMaliyetMicros: null })).toEqual({ kart: false, neden: 'kiyas_yok' });
    expect(harcayipDonusmeyenMi({ yasGun: 9, harcamaMicros: 900n * M, sonuc: 1, kiyasMaliyetMicros: k }).kart).toBe(false);
  });

  it('KRİTİK: yorulan kreatif — frekans VE tıklama oranı düşüşü birlikte', () => {
    const temel = { gosterim: 10_000, oncekiGosterim: 10_000, oncekiTiklama: 100 };
    expect(yorulanKreatifMi({ ...temel, frekansOnda: 41, tiklama: 70 })).toEqual({ kart: true }); // %30 düşüş
    expect(yorulanKreatifMi({ ...temel, frekansOnda: 41, tiklama: 71 }).kart).toBe(false);
    expect(yorulanKreatifMi({ ...temel, frekansOnda: YORULAN_KREATIF.enAzFrekansOnda - 1, tiklama: 10 }).kart).toBe(false);
    expect(yorulanKreatifMi({ ...temel, gosterim: 4_999, frekansOnda: 50, tiklama: 1 }).kart).toBe(false);
  });

  it('negatif aday — anahtar kelimenin aynısı asla; dönüşümlü terim asla', () => {
    const t = { tiklama: 96, donusum: 0, harcamaMicros: 382n * M, hesapMaliyetMicros: 95n * M, anahtarKelimeyleAyni: false };
    expect(negatifAdayMi(t)).toEqual({ kart: true });
    expect(negatifAdayMi({ ...t, anahtarKelimeyleAyni: true }).kart).toBe(false);
    expect(negatifAdayMi({ ...t, donusum: 1 }).kart).toBe(false);
    expect(negatifAdayMi({ ...t, tiklama: 9 }).kart).toBe(false);
  });

  it('bütçe hızı — ilk günlerde bakılmaz; eşikte iki yön', () => {
    expect(butceHiziSapmasi({ planMicros: 3_000n * M, harcananMicros: 0n, gecenGun: BUTCE_HIZI.enAzGecenGun - 1, ayGun: 30 }).kart).toBe(false);
    expect(butceHiziSapmasi({ planMicros: 3_000n * M, harcananMicros: 1_200n * M, gecenGun: 10, ayGun: 30 })).toMatchObject({ kart: true, yon: 'hizli' });
    expect(butceHiziSapmasi({ planMicros: 3_000n * M, harcananMicros: 800n * M, gecenGun: 10, ayGun: 30 })).toMatchObject({ kart: true, yon: 'yavas' });
    expect(butceHiziSapmasi({ planMicros: 3_000n * M, harcananMicros: 1_100n * M, gecenGun: 10, ayGun: 30 }).kart).toBe(false);
  });

  it('KRİTİK: kendiliğinden uygulama kapalı; açılsa bile bütçe ARTIRAMAZ', () => {
    const artir: OneriEylemi = { tur: 'butce_degistir', oncekiMicros: '100', yeniMicros: '200' };
    const kis: OneriEylemi = { tur: 'butce_degistir', oncekiMicros: '200', yeniMicros: '100' };
    expect(kendiligindenUygulanabilirMi({ tur: 'durdur' })).toBe(false);
    expect(kendiligindenUygulanabilirMi(artir, true)).toBe(false);
    expect(eylemArtirirMi(artir)).toBe(true);
    expect(kendiligindenUygulanabilirMi(kis, true)).toBe(true);
    expect(kendiligindenUygulanabilirMi({ tur: 'negatif_ekle', terimler: ['x'], eslesme: 'tam' }, true)).toBe(false);
  });

  it('her eylemin geri alma adımı var', () => {
    expect(geriAlmaAdimi({ tur: 'durdur' })).toEqual({ tur: 'yeniden_ac' });
    expect(geriAlmaAdimi({ tur: 'butce_degistir', oncekiMicros: '5', yeniMicros: '3' })).toEqual({ tur: 'butceyi_geri_yaz', micros: '5' });
    expect(geriAlmaAdimi({ tur: 'negatif_ekle', terimler: ['a'], eslesme: 'tam' })).toEqual({ tur: 'negatifi_kaldir', terimler: ['a'] });
  });

  it('KRİTİK: açık durumların her birinin çıkışı var; son durumların yok', () => {
    for (const d of ONERI_DURUMLARI) {
      if (ONERI_SON_DURUMLARI.includes(d)) expect(ONERI_GECISLERI[d], d).toEqual([]);
      else expect(ONERI_GECISLERI[d].length, d).toBeGreaterThan(0);
    }
    for (const d of ONERI_ACIK_DURUMLARI) expect(ONERI_SON_DURUMLARI).not.toContain(d);
  });

  it('belirsiz sonuçta kişi yeniden gönderemez; yalnız worker uzlaştırır', () => {
    expect(oneriGecisiIzinliMi('sonuc_belirsiz', 'uygulaniyor', 'ajans')).toBe(false);
    expect(oneriGecisiIzinliMi('sonuc_belirsiz', 'uygulandi', 'worker')).toBe(true);
    expect(oneriGecisiIzinliMi('yeni', 'uygulandi', 'ajans')).toBe(false);
  });

  it('KRİTİK: uygula anında hedef değiştiyse kart bayat (başka yerden yapılmış kararı ezmez)', () => {
    const k = { gecerlilikSonu: '2026-10-08T18:00:00.000Z', eylem: { tur: 'butce_degistir', oncekiMicros: '500', yeniMicros: '400' } as OneriEylemi };
    expect(oneriBayatMi(k, T, { durum: 'acik', butceMicros: '500' })).toBe(false);
    expect(oneriBayatMi(k, T, { durum: 'acik', butceMicros: '600' })).toBe(true);
    expect(oneriBayatMi(k, '2026-10-09T00:00:00.000Z', { durum: 'acik', butceMicros: '500' })).toBe(true);
    expect(oneriBayatMi({ ...k, eylem: { tur: 'durdur' } }, T, { durum: 'durdurulmus', butceMicros: null })).toBe(true);
  });
});

describe('uçlar ve yetki', () => {
  it('her (yöntem, yol) tekil', () => {
    const a = PILOT_UCLARI.map((u) => `${u.yontem} ${u.yol}`);
    expect(new Set(a).size).toBe(a.length);
  });

  it('KRİTİK: onay ucu yalnız strategy.publish ister; müşteri onaylar ama hiçbir yazma ucunu açamaz', () => {
    const onayla = PILOT_UCLARI.find((u) => u.yol.endsWith('/onayla'))!;
    expect(onayla.izin).toBe(PLAN_YAYIN_IZNI);
    const m = resolvePermissions('client_viewer');
    expect(m.has('strategy.publish')).toBe(true);
    const acabildigi = PILOT_UCLARI.filter((u) => m.has(u.izin)).map((u) => u.yol);
    for (const yol of acabildigi) expect(['/pilot/planlar', '/pilot/planlar/:id', '/pilot/planlar/:id/degisiklik-iste', '/pilot/planlar/:id/onayla', '/pilot/planlar/:id/kurulum', '/pilot/planlar/:id/pdf']).toContain(yol);
  });

  it('Pilot sayfası AdvCampaign menü izniyle aynı; öneri uygulamak yayın izni', () => {
    expect(PILOT_SAYFA_IZNI).toBe('bulk.write');
    expect(PILOT_UCLARI.find((u) => u.yol.endsWith('/uygula'))!.izin).toBe('bulk.publish');
    expect(resolvePermissions('ad_manager').has('strategy.publish')).toBe(true);
  });
});

// ─── Reklam metni planın parçası (kullanıcı kararı (a), 2026-10-08) ─────────

describe('reklam metni — plan hazırlanırken yazılır, onay özeti onu kapsar', () => {
  const ham = planUret(girdi());
  const metinli = metinliPlan(ham);
  const meta = (p: PlanOnerisi) => p.satirlar.filter((s) => s.platform === 'meta');
  const kapi = (p: PlanOnerisi, yasalUyari: string | null = null) =>
    onayKapisi({ durum: 'musteride', surum: 1, icerikOzeti: 'a', istek: { surum: 1, icerikOzeti: 'a' }, rol: 'musteri', plan: p, aylikButceMicros: 120_000n * M, uyum: 'gecti', ajansinKendiSirketi: false, gercekYayinAcik: true, yasalUyari });
  const kodlar = (r: ReturnType<typeof kapi>) => (r.tur === 'ret' ? r.retler.map((x) => x.kod) : []);
  const kim: Kaynak = { tur: 'kullanici', kimlik: U(99), zaman: T };

  it('KRİTİK: planUret Meta satırını "metin bekliyor" ENGELİYLE üretir; Google satırında metin hücresi yok; şema iki biçimi de dayatır', () => {
    expect(ham.bicim).toBe(PLAN_BICIMI);
    for (const s of meta(ham)) {
      expect(s.metinler).toEqual({ dolu: false, emptyReason: 'metin_bekliyor' });
      expect(s.engeller).toContain('metin_bekliyor');
    }
    for (const s of ham.satirlar.filter((x) => x.platform === 'google')) expect(s.metinler).toBeNull();
    expect(planOnerisiSchema.safeParse(JSON.parse(JSON.stringify(metinli))).success).toBe(true);
    // Meta satırında `null` ve Google satırında hücre: ikisi de şemadan geçmez.
    const bozuk1 = { ...metinli, satirlar: metinli.satirlar.map((s) => (s.platform === 'meta' ? { ...s, metinler: null } : s)) };
    const bozuk2 = { ...metinli, satirlar: metinli.satirlar.map((s) => (s.platform === 'google' ? { ...s, metinler: { dolu: false, emptyReason: 'metin_bekliyor' } } : s)) };
    expect(planOnerisiSchema.safeParse(JSON.parse(JSON.stringify(bozuk1))).success).toBe(false);
    expect(planOnerisiSchema.safeParse(JSON.parse(JSON.stringify(bozuk2))).success).toBe(false);
  });

  it('KRİTİK: içerik özeti METNİ KAPSAR — tek kelime değişince özet değişir; aynı metin aynı özet', () => {
    expect(planKanonikIcerik(metinliPlan(ham))).toBe(planKanonikIcerik(metinli));
    const s0 = meta(metinli)[0]!;
    const degisik: PlanOnerisi = {
      ...metinli,
      satirlar: metinli.satirlar.map((s) =>
        s.anahtar === s0.anahtar && s.metinler?.dolu ? { ...s, metinler: { ...s.metinler, deger: [{ ...s.metinler.deger[0]!, metin: 'Kahve makinesinde YENİ sezon.' }] } } : s,
      ),
    };
    expect(planKanonikIcerik(degisik)).not.toBe(planKanonikIcerik(metinli));
    expect(planKanonikIcerik(metinli)).not.toBe(planKanonikIcerik(ham));
  });

  it('KRİTİK: metinsiz Meta satırı onay kapısında KURULAMAYAN_SATIR; metinli plan kabul', () => {
    expect(kodlar(kapi(ham))).toEqual(['KURULAMAYAN_SATIR']);
    expect(kapi(metinli).tur).toBe('kabul');
    // Engeli silinmiş ama metni boş satır da kapıdan geçemez: kapı satır engeline GÜVENMİYOR, metni kendisi denetliyor.
    const engelsiz = { ...ham, satirlar: ham.satirlar.map((s) => ({ ...s, engeller: [] })) };
    const r = kapi(engelsiz);
    expect(kodlar(r)).toEqual(['KURULAMAYAN_SATIR']);
    expect(r.tur === 'ret' && r.retler[0]!.ajansMesaji).toContain('Reklam metni');
  });

  it('KRİTİK: yasal uyarı plan hazırlandıktan SONRA eklendiyse eski metin kapıda düşer (TAZE uyarı)', () => {
    const UYARI = 'Kampanya stoklarla sınırlıdır.';
    expect(kodlar(kapi(metinli, UYARI))).toEqual(['KURULAMAYAN_SATIR']);
    expect(planMetinEksikleri(metinli, { yasalUyari: UYARI }).every((x) => x.kod === 'YASAL-UYARI')).toBe(true);
    expect(kapi(metinliPlan(ham, UYARI), UYARI).tur).toBe('kabul');
  });

  it('KRİTİK: metin kaynağı yalnız model ya da kişi — sayısal/plan kaynaklı metin geçmez', () => {
    const s = meta(metinli)[0]!;
    if (!s.metinler?.dolu) throw new Error('fixture metinsiz');
    const ids = s.varliklar?.dolu ? s.varliklar.deger.map((v) => v.deger.id) : [];
    expect(reklamMetniEksikleri(s.metinler, { varlikIdleri: ids })).toEqual([]);
    expect(reklamMetniEksikleri({ ...s.metinler, kaynak: { ...s.metinler.kaynak, tur: 'onayli_plan' } }, { varlikIdleri: ids }).map((x) => x.kod)).toEqual(['METIN-KAYNAK']);
  });

  it('yerleştirme: model düştü / kapalı / denetimden geçmedi ayrı nedenlerle; geçmeyen metin DOLU bırakılmaz; plan dışı satır patlar', () => {
    const [a, b, c] = meta(ham);
    const y = new Map<string, ReklamMetniYazimi>([
      [a!.anahtar, { tur: 'yazilamadi', neden: 'metin_yazilamadi', mesaj: 'Yapay zekâya ulaşılamadı: zaman aşımı' }],
      [b!.anahtar, { tur: 'yazilamadi', neden: 'yz_kapali', mesaj: 'Yapay zekâ bağlı değil' }],
      // Satırın görsellerinde olmayan bir görsele bağlı metin.
      [c!.anahtar, { tur: 'tamam', metinler: [{ varlikId: U(77), baslik: 'B', metin: 'M' }], kaynak: { tur: 'yz_metin', kimlik: 'm', zaman: T }, notlar: [] }],
    ]);
    const p = reklamMetinleriniYerlestir(ham, y, { yasalUyari: null });
    const bul = (k: string) => p.satirlar.find((s) => s.anahtar === k)!;
    expect(bul(a!.anahtar).metinler).toEqual({ dolu: false, emptyReason: 'metin_yazilamadi' });
    expect(bul(a!.anahtar).engeller).toEqual(['metin_yazilamadi']);
    expect(bul(a!.anahtar).notlar.some((n) => n.includes('zaman aşımı'))).toBe(true);
    expect(bul(b!.anahtar).metinler).toEqual({ dolu: false, emptyReason: 'yz_kapali' });
    expect(bul(c!.anahtar).metinler).toEqual({ dolu: false, emptyReason: 'metin_denetimden_gecmedi' });
    expect(() => reklamMetinleriniYerlestir(ham, new Map([['meta:yok:x', y.get(a!.anahtar)!]]), { yasalUyari: null })).toThrow(/plan dışı/);
    const g = ham.satirlar.find((s) => s.platform === 'google')!;
    expect(() => reklamMetinleriniYerlestir(ham, new Map([[g.anahtar, y.get(a!.anahtar)!]]), { yasalUyari: null })).toThrow(/Meta dışı/);
    // Engeller yeniden hesaplanırken YALNIZ metin nedenleri silinir.
    expect(METIN_BOS_NEDENLERI).not.toContain('varlik_yok');
  });

  it('KRİTİK: değiştir — yalnız TUTAR değişince metin korunur; GÖRSEL çıkınca metin yeniden yazılacak ve satır kurulamaz', () => {
    const s = meta(metinli)[0]!;
    const t = degisiklikUygula(metinli, [{ tur: 'satir_tutari_fark', anahtar: s.anahtar, farkMicros: (1_000n * M).toString(), yon: 'azalt' }], kim);
    if (t.tur !== 'tamam') throw new Error(t.mesaj);
    expect(t.plan.satirlar.find((x) => x.anahtar === s.anahtar)!.metinler).toEqual(s.metinler);
    expect(metinYazilacakSatirlar(t.plan)).toEqual([]);
    const gorsel = s.varliklar?.dolu ? s.varliklar.deger[1]!.deger.id : '';
    const v = degisiklikUygula(metinli, [{ tur: 'varlik_cikar', anahtar: s.anahtar, varlikId: gorsel }], kim);
    if (v.tur !== 'tamam') throw new Error(v.mesaj);
    const yeni = v.plan.satirlar.find((x) => x.anahtar === s.anahtar)!;
    expect(yeni.metinler).toEqual({ dolu: false, emptyReason: 'metin_bekliyor' });
    expect(yeni.engeller).toContain('metin_bekliyor');
    expect(metinYazilacakSatirlar(v.plan).map((x) => x.anahtar)).toEqual([s.anahtar]);
    // Dokunulmayan satırların metni yerinde.
    expect(v.plan.satirlar.filter((x) => x.platform === 'meta' && x.anahtar !== s.anahtar).every((x) => x.metinler?.dolu)).toBe(true);
    expect(planOnerisiSchema.safeParse(JSON.parse(JSON.stringify(v.plan))).success).toBe(true);
  });

  it('KRİTİK: yeniden hazırla — aynı kitle+görsel+amaç metni taşır; kitle/amaç değişince ya da yasal uyarı tutmayınca yeniden yazılır', () => {
    const yeniUretim = planUret(girdi());
    const t = metinleriTasi(metinli, yeniUretim);
    expect(metinYazilacakSatirlar(t)).toEqual([]);
    expect(meta(t).every((s) => !s.engeller.includes('metin_bekliyor'))).toBe(true);
    // Amaç değişti (form → site): her Meta satırı yeniden.
    const amac = metinleriTasi(metinli, planUret(girdi({ marka: { profilId: U(5), guncellendi: T, anaAmac: 'website' } })));
    expect(metinYazilacakSatirlar(amac).length).toBe(meta(amac).length);
    // Yasal uyarı eklendi: eski metin onu taşımıyor.
    expect(metinYazilacakSatirlar(metinleriTasi(metinli, yeniUretim, { yasalUyari: 'Kampanya stoklarla sınırlıdır.' })).length).toBe(meta(t).length);
    // Saf kural: kitle farklı → korunmaz; tutar farklı → korunur.
    const s = meta(metinli)[0]!;
    expect(metinKorunurMu(s, { ...s, tutar: { ...s.tutar, deger: '1000000' } })).toBe(true);
    expect(metinKorunurMu(s, { ...s, kitle: { dolu: true, deger: { id: U(11), ad: 'x' }, kaynak: { tur: 'kitle_sablonu', kimlik: U(11), zaman: T } } })).toBe(false);
  });

  it('KRİTİK: eski biçim (1) SESSİZCE GEÇMEZ — okunur, Meta satırı "eski biçim" engeli alır, kapı reddeder; bilinmeyen biçim patlar', () => {
    const v1 = JSON.parse(JSON.stringify({ ...ham, bicim: 1, satirlar: ham.satirlar.map(({ metinler: _m, ...r }) => ({ ...r, engeller: r.engeller.filter((e) => e !== 'metin_bekliyor') })) }));
    // Yazma şeması eski biçimi KABUL ETMEZ (yeni sürüm hep yeni biçimle yazılır).
    expect(planOnerisiSchema.safeParse(v1).success).toBe(false);
    const okunan = saklananPlanOku(v1);
    expect(okunan.bicim).toBe(PLAN_BICIMI);
    for (const s of meta(okunan)) {
      expect(s.metinler).toEqual({ dolu: false, emptyReason: 'plan_eski_bicim' });
      expect(s.engeller).toContain('plan_eski_bicim');
    }
    expect(kodlar(kapi(okunan))).toEqual(['KURULAMAYAN_SATIR']);
    expect(() => saklananPlanOku({ ...v1, bicim: 9 })).toThrow();
    expect(saklananPlanOku(JSON.parse(JSON.stringify(metinli)))).toEqual(JSON.parse(JSON.stringify(metinli)));
  });

  it('taslak metni ONAYLI SATIRDAN kaynağıyla kopyalar (işçi modeli çağırmaz); uyum plan anında metni görür', () => {
    const s = meta(metinli)[0]!;
    const onay: Kaynak = { tur: 'onayli_plan', kimlik: `${U(50)}@1`, zaman: T };
    const t = satirdanTaslak(s, {
      planId: U(50), planSurum: 1, onayKaynagi: onay, takvim: metinli.takvim!, hesap: null, sayfa: null, instagram: null,
      kitleKonumlari: new Map(), ozelKategoriler: null, hedefAdres: null, formSablonuId: null, tabanNegatifler: null, zaman: T,
    });
    expect(t.metinler).toEqual(s.metinler);
    expect(t.metinler.dolu && t.metinler.kaynak.tur).toBe('yz_metin');
    const g = planUyumGirdisi(metinli, 'x', '2026-10-08', new Map());
    const satir = g.satirlar.find((x) => x.yer === s.anahtar)!;
    expect(satir.metinler.filter((m) => m.alan === 'metin').map((m) => m.uretici)).toEqual(['ai']);
  });

  it('müşteri özeti metnin onayın parçası olduğunu söyler (yalnız metin varken)', () => {
    expect(musteriOzeti(metinli)!.cumleler.join(' ')).toContain('reklam metinleri de onayın parçası');
    expect(musteriOzeti(ham)!.cumleler.join(' ')).not.toContain('reklam metinleri');
    expect(musteriOzeti(metinli)!.cumleler.join(' ')).not.toMatch(/—/);
  });
});

// ─── `kuruluyor`dan çıkış (Ajan 4 B-4'ün sözleşme yarısı, 2026-10-08) ──────

describe('kuruluyor çıkışı — takılan satır ve plan', () => {
  const simdi = '2026-10-08T12:00:00.000Z';
  const once = (dk: number) => new Date(Date.parse(simdi) - dk * 60_000).toISOString();

  it('KRİTİK: takılma eşiği işçinin hesap kilidinden UZUN (canlı işin altından satır çekilmez)', () => {
    expect(TAKILMA_ESIGI_DK * 60_000).toBeGreaterThan(YAZICI_KILIT_MS);
  });

  it('KRİTİK: her ara durumun takılma hedefi izinli bir geçiş, SON durum, başarısız ve ajans çıkışlı', () => {
    expect([...KURULUM_ARA_DURUMLARI].sort()).toEqual(KURULUM_SATIR_DURUMLARI.filter((d) => !KURULUM_SINIFI[d].son).sort());
    for (const d of KURULUM_ARA_DURUMLARI) {
      const h = TAKILAN_SATIR_HEDEFI[d];
      expect(KURULUM_GECISLERI[d], d).toContain(h);
      expect(KURULUM_SINIFI[h].son, d).toBe(true);
      expect(KURULUM_SINIFI[h].basarili, d).toBe(false);
      expect(KURULUM_SINIFI[h].cikisYazani, d).toContain('ajans');
    }
  });

  it('KRİTİK: satır kararı — genç bekler, yaşlı önce yeniden kuyruğa, hak bitince son duruma iner; son durumdakine dokunulmaz', () => {
    expect(takilanSatirKarari({ durum: 'prova', guncellendi: once(TAKILMA_ESIGI_DK - 1), supurmeDenemesi: 0 }, simdi)).toEqual({ tur: 'bekle' });
    expect(takilanSatirKarari({ durum: 'prova', guncellendi: once(TAKILMA_ESIGI_DK), supurmeDenemesi: 0 }, simdi)).toEqual({ tur: 'yeniden_kuyruk' });
    expect(takilanSatirKarari({ durum: 'prova', guncellendi: once(TAKILMA_ESIGI_DK), supurmeDenemesi: TAKILAN_SATIR_EN_COK_DENEME }, simdi)).toMatchObject({ tur: 'dusur', hedef: 'prova_dustu' });
    expect(takilanSatirKarari({ durum: 'aciliyor', guncellendi: once(600), supurmeDenemesi: 9 }, simdi)).toMatchObject({ tur: 'dusur', hedef: 'dustu' });
    expect(takilanSatirKarari({ durum: 'dustu', guncellendi: once(600), supurmeDenemesi: 0 }, simdi)).toEqual({ tur: 'dokunma' });
    expect(takilanSatirKarari({ durum: 'kayit_belirsiz', guncellendi: once(600), supurmeDenemesi: 9 }, simdi)).toEqual({ tur: 'dokunma' });
  });

  it('KRİTİK: plan kararı — canlı iş sürüyor, hepsi yaşlıysa takıldı, satırsızsa satır yok, hepsi son ise sayım', () => {
    const k = (satirlar: Array<{ durum: (typeof KURULUM_SATIR_DURUMLARI)[number]; guncellendi: string }>, plan = once(600)) =>
      kuruluyorPlanKarari({ planGuncellendi: plan, satirlar, simdi });
    expect(k([{ durum: 'kuruluyor', guncellendi: once(600) }, { durum: 'prova', guncellendi: once(5) }])).toEqual({ tur: 'suruyor' });
    expect(k([{ durum: 'kuruluyor', guncellendi: once(600) }, { durum: 'acildi', guncellendi: once(1) }])).toEqual({ tur: 'takildi' });
    expect(k([])).toEqual({ tur: 'satir_yok' });
    expect(k([], once(5))).toEqual({ tur: 'suruyor' });
    expect(k([{ durum: 'acildi', guncellendi: once(1) }])).toEqual({ tur: 'sayimi_yenile', hedef: 'kuruldu' });
    expect(k([{ durum: 'acildi', guncellendi: once(1) }, { durum: 'dustu', guncellendi: once(1) }])).toEqual({ tur: 'sayimi_yenile', hedef: 'kismen_kuruldu' });
  });

  it('KRİTİK: kuruluyor planının ajans çıkışı var ve kismen_kuruldu üzerinden "Şimdi kur"/"Vazgeç"e açılıyor; müşteri ve doğrudan kapat/iptal yok', () => {
    expect(pilotGecisMumkunMu('kuruluyor', 'takilan_kurulumu_durdur', 'ajans')).toBe(true);
    expect(pilotGecisMumkunMu('kuruluyor', 'takilan_kurulumu_durdur', 'sistem')).toBe(true);
    expect(pilotGecisMumkunMu('kuruluyor', 'takilan_kurulumu_durdur', 'musteri')).toBe(false);
    expect(pilotGecisMumkunMu('kismen_kuruldu', 'yeniden_dene', 'ajans')).toBe(true);
    expect(pilotGecisMumkunMu('kismen_kuruldu', 'kapat', 'ajans')).toBe(true);
    expect(pilotGecisMumkunMu('kuruluyor', 'kapat', 'ajans')).toBe(false);
    expect(pilotGecisMumkunMu('kuruluyor', 'iptal', 'ajans')).toBe(false);
  });
});

// ─── Ajan 2'ye devir kilitleri (it.fails: Ajan 2 düzeltince `it`e çevirir) ───

describe('DEVİR — karar (a) uygulaması (Ajan 2)', () => {
  const yorumsuz = (ad: string) =>
    readFileSync(join(__dirname, ad), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('kardeş: taranan dosyalar gerçekten okunuyor (boş dilim değil)', () => {
    expect(yorumsuz('kurulum-isleyici.ts')).toContain('async function taslakKur(');
    expect(yorumsuz('plan.service.ts')).toContain('async hazirla(');
  });

  it('DEVİR A2-1: işçi reklam metnini YAZMIYOR — taslak metni onaylı satırdan okunur, model çağrısı yok', () => {
    expect(yorumsuz('kurulum-isleyici.ts')).not.toMatch(/reklamMetniYaz\(/);
  });

  it('DEVİR A2-2: plan servisi metni hazırlarken yazar ve değişiklikte taşır', () => {
    const s = yorumsuz('plan.service.ts');
    expect(s).toContain('reklamMetinleriniYerlestir(');
    expect(s).toContain('metinleriTasi(');
  });
});
