import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AI_METIN_BOLUMLERI,
  AMAC_ASAMASI,
  BELGEYE_GIREN_METIN_KAYNAKLARI,
  ISTEMCI_YAZAMAZ,
  KALEM_AKTARIM_ENGELLERI,
  REHBER_AMAC_KODLARI,
  REHBER_IZINLI_KAYNAKLAR,
  REHBER_KAPALI_SEBEBI,
  REHBERDE_TAMAMLANAN_ALANLAR,
  STRATEJI_ACIK_DURUMLAR,
  STRATEJI_BELGE_BOLUMLERI,
  STRATEJI_DURUMLARI,
  STRATEJI_EYLEMLERI,
  STRATEJI_GECISLERI,
  STRATEJI_KAYNAKLARI,
  STRATEJI_REHBER_ESLEMESI,
  STRATEJI_SON_DURUMLARI,
  STRATEJI_V2_UCLARI,
  STRATEJIDEN_YAZILMAYAN_ALANLAR,
  YAYIN_DURUMLARI,
  YAYIN_KALEM_DURUMU,
  YORUM_ZORUNLU_EYLEMLER,
  baglantiHali,
  baglantiKarariSchema,
  kalemAktarimEngeli,
  kalemDurumu,
  kalemTahmini,
  kalemTarihHatasi,
  kalemdenRehberAlanlari,
  onayBaglantisiOlusturSchema,
  onayBaglantisiYolu,
  onayTokenBicimiGecerli,
  rehberAlanlariSchema,
  resolvePermissions,
  stratejiDonemi,
  stratejiGecisMumkunMu,
  stratejiGorunumKapisi,
  stratejiKalemiGirdiSchema,
  stratejiMetniDenetle,
  stratejiPanelAdresi,
  stratejiPdfYolu,
  stratejiRiskleri,
  stratejiUcYolu,
  stratejiYapilabilir,
  type KalemAktarimBaglami,
  type RehberAlanAdi,
  type StratejiKalemiGirdisi,
} from '@advetics/shared';
import { degisiklikleriUygula } from '../reklam/rehber/rehber-kayit';

/**
 * ADVSTRATEGY v2 SÖZLEŞMESİ (Ajan 1, 2026-10-13). Kritik kurallar
 * çalıştırılarak sınanıyor; "KRİTİK" işaretlileri mutasyonla doğrulandı
 * (docs/advstrategy/YENIDEN-TASARIM.md § 9 devir notu).
 */

const V1 = '88888888-0000-4000-8000-000000000001';
const V2 = '88888888-0000-4000-8000-000000000002';
const KIM = '11111111-0000-4000-8000-000000000001';
const ZAMAN = '2026-10-20T09:00:00.000Z';

const kalem = (o: Partial<StratejiKalemiGirdisi> = {}): StratejiKalemiGirdisi => ({
  amac: 'SITE',
  meta: true,
  google: true,
  metaPayi: 40,
  butce: '54.000',
  baslangic: '2026-11-01',
  bitis: '2027-01-31',
  konumlar: [{ tur: 'region', key: '3434', etiket: 'İzmir', ulkeKodu: 'TR' }],
  yasMin: null,
  yasMax: null,
  kelimeGrubu: 'çiğli satılık daire',
  varlikIdleri: [V1],
  metin: { anaMetin: 'Körfeze bakan daireler', basliklar: ['Deniz manzaralı 2+1'], aciklamalar: [], kaynak: 'ajans' },
  kreatifYonergesi: null,
  kitleTarifi: null,
  ...o,
});

const baglam = (o: Partial<KalemAktarimBaglami> = {}): KalemAktarimBaglami => ({
  plan: { durum: 'onaylandi', surum: 3, onaylananSurum: 3 },
  ajansYoneticisi: true,
  siteYok: false,
  mevcutVarliklar: new Set([V1, V2]),
  rehberId: null,
  bugun: '2026-10-20',
  ...o,
});

describe('kaynak etiketi', () => {
  it('KRİTİK: varsayım kaynağı YOK (kullanıcı kararı 3); yapay zekâ metni onaysız belgeye girmez', () => {
    expect(STRATEJI_KAYNAKLARI as readonly string[]).not.toContain('varsayim');
    expect(BELGEYE_GIREN_METIN_KAYNAKLARI).not.toContain('ai');
  });

  it('KRİTİK: strateji metninde rakam ya da yazıyla oran reddedilir', () => {
    expect(stratejiMetniDenetle('Bütçenin çoğu Meta formuna gidiyor.')).toEqual({ tamam: true });
    expect(stratejiMetniDenetle('Başvuruların %68 kadarı Meta’dan')).toEqual({ tamam: false, neden: 'sayi_var' });
    expect(stratejiMetniDenetle('yüzde otuz daha ucuz')).toEqual({ tamam: false, neden: 'sayi_var' });
    expect(stratejiMetniDenetle('İki kat daha fazla form')).toEqual({ tamam: false, neden: 'sayi_var' });
    expect(stratejiMetniDenetle('  ')).toEqual({ tamam: false, neden: 'bos' });
  });
});

describe('durum makinesi (v2)', () => {
  it('KRİTİK: son durumlardan çıkış yok, diğer her durumdan çıkış var (kısmi indeks kilidi olmasın)', () => {
    for (const d of STRATEJI_DURUMLARI) {
      const cikis = STRATEJI_EYLEMLERI.filter((e) => stratejiGecisMumkunMu(d, e));
      if (STRATEJI_SON_DURUMLARI.includes(d)) expect(cikis, d).toEqual([]);
      else expect(cikis.length, d).toBeGreaterThan(0);
    }
    for (const d of STRATEJI_ACIK_DURUMLAR) expect(STRATEJI_SON_DURUMLARI).not.toContain(d);
  });

  it('KRİTİK: müşteri hesabı onayda olan stratejiyi onaylar ya da revizyon ister; yazamaz, gönderemez', () => {
    const musteri = [...resolvePermissions('client_viewer')];
    expect(stratejiYapilabilir('onayda', musteri)).toEqual(['onayla', 'revizyon_iste']);
    expect(stratejiYapilabilir('taslak', musteri)).toEqual([]);
    expect(stratejiYapilabilir('onaylandi', musteri)).toEqual([]);
    expect(stratejiYapilabilir('revizyon', [...resolvePermissions('admin')])).toEqual(['onaya_gonder', 'iptal']);
  });

  it('revizyon yorum ister; revizyondan yeniden onaya gönderilir; onaylı plan kapatılır', () => {
    expect(YORUM_ZORUNLU_EYLEMLER).toEqual(['revizyon_iste']);
    expect(STRATEJI_GECISLERI.revizyon_iste).toEqual({ kaynak: ['onayda'], hedef: 'revizyon' });
    expect(stratejiGecisMumkunMu('revizyon', 'onaya_gonder')).toBe(true);
    expect(stratejiGecisMumkunMu('onaylandi', 'kapat')).toBe(true);
    expect(stratejiGecisMumkunMu('onayda', 'kapat')).toBe(false);
  });
});

describe('kalem', () => {
  it('her rehber amacının bir aşaması var', () => {
    expect(Object.keys(AMAC_ASAMASI).sort()).toEqual([...REHBER_AMAC_KODLARI].sort());
  });

  it('KRİTİK: pay yalnız iki platform açıkken; yaşın iki ucu birlikte', () => {
    expect(stratejiKalemiGirdiSchema.safeParse(kalem()).success).toBe(true);
    expect(stratejiKalemiGirdiSchema.safeParse(kalem({ metaPayi: null })).success).toBe(false);
    expect(stratejiKalemiGirdiSchema.safeParse(kalem({ google: false })).success).toBe(false);
    expect(stratejiKalemiGirdiSchema.safeParse(kalem({ google: false, metaPayi: null })).success).toBe(true);
    expect(stratejiKalemiGirdiSchema.safeParse(kalem({ meta: false, google: false, metaPayi: null })).success).toBe(false);
    expect(stratejiKalemiGirdiSchema.safeParse(kalem({ yasMin: 25, yasMax: null })).success).toBe(false);
    expect(stratejiKalemiGirdiSchema.safeParse(kalem({ yasMin: 25, yasMax: 54 })).success).toBe(true);
    expect(stratejiKalemiGirdiSchema.safeParse(kalem({ varlikIdleri: [V1, V1] })).success).toBe(false);
  });

  it('dönem ay sonuna kadar; artık yıl; süre 1-3', () => {
    expect(stratejiDonemi('2026-11', 3)).toEqual({ baslangic: '2026-11-01', bitis: '2027-01-31' });
    expect(stratejiDonemi('2028-02', 1)).toEqual({ baslangic: '2028-02-01', bitis: '2028-02-29' });
    expect(() => stratejiDonemi('2026-11', 4)).toThrow();
    expect(kalemTarihHatasi({ baslangic: '2026-10-31', bitis: '2026-11-30' }, { baslangic: '2026-11-01', bitis: '2027-01-31' })).toMatch(/dönemi/);
    expect(kalemTarihHatasi({ baslangic: '2026-11-01', bitis: '2027-01-31' }, { baslangic: '2026-11-01', bitis: '2027-01-31' })).toBeNull();
  });

  it('KRİTİK: tahmin YALNIZ veriden; geçmiş yoksa "yok", aralık en iyi ve en kötü ay', () => {
    expect(kalemTahmini('FORM', 72_000_000_000n, [])).toEqual({ tur: 'yok', neden: 'gecmis_yok' });
    expect(kalemTahmini('FORM', 72_000_000_000n, [{ harcamaMicros: 5_000_000_000n, sonuc: 0 }])).toEqual({ tur: 'yok', neden: 'gecmis_yok' });
    // 72.000 ₺; aylar 10.000 ₺ → 20 form (500 ₺/form) ve 12.000 ₺ → 20 form (600 ₺/form).
    const t = kalemTahmini('FORM', 72_000_000_000n, [
      { harcamaMicros: 10_000_000_000n, sonuc: 20 },
      { harcamaMicros: 12_000_000_000n, sonuc: 20 },
    ]);
    expect(t).toEqual({ tur: 'aralik', olcut: 'form', altSonuc: 120, ustSonuc: 144, aySayisi: 2, kaynak: 'veri' });
    // Yalnız son üç ay; sıfır sonuçlu ay atlanır, ondalık dönüşüm kayan noktasız.
    const u = kalemTahmini('SITE', 1_000_000_000n, [
      { harcamaMicros: 1_000_000n, sonuc: 1000 },
      { harcamaMicros: 1_000_000_000n, sonuc: 0 },
      { harcamaMicros: 1_000_000_000n, sonuc: 100.5 },
      { harcamaMicros: 2_000_000_000n, sonuc: 100 },
    ]);
    expect(u).toEqual({ tur: 'aralik', olcut: 'ziyaret', altSonuc: 50, ustSonuc: 100, aySayisi: 2, kaynak: 'veri' });
  });

  it('KRİTİK: yayın makinesinin her durumu kalem durumuna eşli; arşivlenen rehber arşiv sayılır', () => {
    expect(Object.keys(YAYIN_KALEM_DURUMU).sort()).toEqual([...YAYIN_DURUMLARI].sort());
    expect(kalemDurumu(null, ['meta'])).toEqual({ tur: 'aktarilmadi' });
    const r = { id: 'r1', durum: 'yayinda' as const, yayinlar: [{ platform: 'meta' as const, durum: 'ogreniyor' as const }] };
    expect(kalemDurumu(r, ['meta', 'google'])).toEqual({ tur: 'aktarildi', rehberId: 'r1', rehberDurumu: 'yayinda', platformlar: { meta: 'yayinda', google: 'taslakta' } });
    expect(kalemDurumu({ ...r, durum: 'arsivlendi' }, ['meta']).tur === 'aktarildi' && kalemDurumu({ ...r, durum: 'arsivlendi' }, ['meta'])).toMatchObject({ platformlar: { meta: 'arsivlendi' } });
  });
});

describe('strateji kalemi → rehber', () => {
  it('KRİTİK: her rehber alanı üç gruptan TAM BİRİNDE (yeni alan karar ister)', () => {
    const yazilan = STRATEJI_REHBER_ESLEMESI.map((e) => e.rehber as string);
    const gruplar = [yazilan, [...REHBERDE_TAMAMLANAN_ALANLAR], [...STRATEJIDEN_YAZILMAYAN_ALANLAR]];
    const hepsi = Object.keys(rehberAlanlariSchema.shape).sort();
    expect(gruplar.flat().sort()).toEqual(hepsi);
  });

  it('KRİTİK: para ve hukuk alanları `strateji` kaynağını KABUL ETMEZ; yazılan alanlar eder', () => {
    for (const a of STRATEJIDEN_YAZILMAYAN_ALANLAR) {
      expect(REHBER_IZINLI_KAYNAKLAR[a], a).toBeDefined();
      expect(REHBER_IZINLI_KAYNAKLAR[a], a).not.toContain('strateji');
    }
    for (const e of STRATEJI_REHBER_ESLEMESI) {
      const izinli = REHBER_IZINLI_KAYNAKLAR[e.rehber as RehberAlanAdi];
      if (izinli) expect(izinli, e.rehber).toContain('strateji');
    }
  });

  it('KRİTİK: istemci `strateji` kaynağıyla yazamaz (yalnız sunucunun aktarımı)', () => {
    expect(ISTEMCI_YAZAMAZ).toContain('strateji');
    const r = degisiklikleriUygula({}, [{ alan: 'butce', deger: { tip: 'toplam', micros: '1000000' }, kaynak: 'strateji' }], KIM, ZAMAN);
    expect(r.tur).toBe('ret');
  });

  it('KRİTİK: onaysız ya da onaydan sonra değişmiş plan aktarılmaz', () => {
    expect(kalemAktarimEngeli(kalem(), baglam({ plan: { durum: 'onayda', surum: 3, onaylananSurum: null } }))).toEqual({ tur: 'engel', engel: 'onaysiz' });
    expect(kalemAktarimEngeli(kalem(), baglam({ plan: { durum: 'onaylandi', surum: 4, onaylananSurum: 3 } }))).toEqual({ tur: 'engel', engel: 'onaysiz' });
  });

  it('KRİTİK: platform kapıları rehberin kendi kapıları; düşen platform SEBEBİYLE yazılır', () => {
    const form = kalemAktarimEngeli(kalem({ amac: 'FORM' }), baglam());
    expect(form).toEqual({ tur: 'aktarilabilir', platformlar: { meta: true, google: false }, dusenler: [{ platform: 'google', sebep: REHBER_KAPALI_SEBEBI.FORM!.google }] });
    const wa = kalemAktarimEngeli(kalem({ amac: 'WHATSAPP' }), baglam());
    expect(wa.tur === 'aktarilabilir' && wa.dusenler[0]!.sebep).toMatch(/izin listesine bağlı/);
    // `deneme` amacı ajans yöneticisi olmayana açık değil.
    expect(kalemAktarimEngeli(kalem({ amac: 'TELEFON' }), baglam({ ajansYoneticisi: false }))).toEqual({ tur: 'engel', engel: 'amac_kapali' });
    expect(kalemAktarimEngeli(kalem({ amac: 'TELEFON' }), baglam()).tur).toBe('aktarilabilir');
    // Site yok beyanı site amacının iki platformunu da kapatır; okunamayan beyan kapatmaz.
    expect(kalemAktarimEngeli(kalem(), baglam({ siteYok: true }))).toEqual({ tur: 'engel', engel: 'platform_kalmadi' });
    expect(kalemAktarimEngeli(kalem(), baglam({ siteYok: null })).tur).toBe('aktarilabilir');
  });

  it('silinmiş görsel, geçmiş bitiş, zaten aktarılmış kalem', () => {
    expect(kalemAktarimEngeli(kalem({ varlikIdleri: [V1, '99999999-0000-4000-8000-000000000009'] }), baglam())).toEqual({ tur: 'engel', engel: 'kaynak_silinmis' });
    expect(kalemAktarimEngeli(kalem({ bitis: '2026-10-20' }), baglam())).toEqual({ tur: 'engel', engel: 'tarih_gecti' });
    expect(kalemAktarimEngeli(kalem(), baglam({ rehberId: 'r1' }))).toEqual({ tur: 'engel', engel: 'zaten_aktarildi' });
    expect(KALEM_AKTARIM_ENGELLERI).toHaveLength(6);
  });

  it('KRİTİK: üretilen alanlar şemaya uyar ve izinli kaynaklarla; para/hukuk alanı ÜRETİLMEZ', () => {
    const k = kalem({ yasMin: 25, yasMax: 54, baslangic: '2026-10-01', konumlar: [{ tur: 'region', key: '3434', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/2840', ad: 'ABD' } }] });
    const karar = kalemAktarimEngeli(k, baglam());
    if (karar.tur !== 'aktarilabilir') throw new Error('aktarılabilir olmalıydı');
    const kelimeler = Array.from({ length: 60 }, (_, i) => ({ metin: `kelime ${i}`, aylikArama: i === 0 ? null : 100 }));
    const { alanlar, notlar } = kalemdenRehberAlanlari({ ...k, butceMicros: 54_000_000_000n }, karar, { kim: KIM, zaman: ZAMAN, bugun: '2026-10-20', kelimeler });
    expect(rehberAlanlariSchema.safeParse(alanlar).success).toBe(true);
    for (const [ad, d] of Object.entries(alanlar) as Array<[RehberAlanAdi, { kaynak: string; kim: string }]>) {
      expect(d.kim).toBe(KIM);
      const izinli = REHBER_IZINLI_KAYNAKLAR[ad];
      if (izinli) expect(izinli as readonly string[], ad).toContain(d.kaynak);
    }
    for (const a of STRATEJIDEN_YAZILMAYAN_ALANLAR) expect(alanlar[a]).toBeUndefined();
    expect(alanlar.enDusukYas).toBeUndefined();
    expect(alanlar.yasAraligi?.deger).toEqual({ min: 25, max: 54 });
    // Geçmiş başlangıç yarına; istemcinin Google karşılığı atılır.
    expect(alanlar.takvim?.deger).toEqual({ baslangic: '2026-10-21', bitis: '2027-01-31' });
    expect(notlar.some((n) => n.includes('2026-10-21'))).toBe(true);
    expect(alanlar.konumlar?.deger[0]).not.toHaveProperty('google');
    expect(alanlar.butce?.deger).toEqual({ tip: 'toplam', micros: '54000000000' });
    expect(alanlar.metaPayiYuzde?.deger).toBe(40);
    expect(alanlar.anahtarKelimeler?.deger).toHaveLength(50);
    expect(alanlar.metin?.kaynak).toBe('strateji');
  });

  it('KRİTİK: "Kullan" denmemiş metin öneri olarak gider; kelimeler yalnız Google Arama; tek platformda pay yok', () => {
    const k = kalem({ amac: 'FORM', metin: { anaMetin: 'x', basliklar: [], aciklamalar: [], kaynak: 'ai' } });
    const karar = kalemAktarimEngeli(k, baglam());
    if (karar.tur !== 'aktarilabilir') throw new Error('aktarılabilir olmalıydı');
    const { alanlar, notlar } = kalemdenRehberAlanlari({ ...k, butceMicros: 1n }, karar, { kim: KIM, zaman: ZAMAN, bugun: '2026-10-20', kelimeler: [{ metin: 'a', aylikArama: 1 }] });
    expect(alanlar.metin?.kaynak).toBe('ai_onerisi');
    expect(alanlar.metaPayiYuzde).toBeUndefined();
    expect(alanlar.anahtarKelimeler).toBeUndefined();
    expect(alanlar.platformlar?.deger).toEqual({ meta: true, google: false });
    expect(notlar.some((n) => n.startsWith('Google açılmadı'))).toBe(true);
    const v = kalem({ amac: 'VIDEO' });
    const kv = kalemAktarimEngeli(v, baglam());
    if (kv.tur !== 'aktarilabilir') throw new Error('aktarılabilir olmalıydı');
    expect(kalemdenRehberAlanlari({ ...v, butceMicros: 1n }, kv, { kim: KIM, zaman: ZAMAN, bugun: '2026-10-20', kelimeler: [{ metin: 'a', aylikArama: 1 }] }).alanlar.anahtarKelimeler).toBeUndefined();
  });
});

describe('girişsiz onay bağlantısı', () => {
  const b = { surum: 3, sonGecerlilik: '2026-11-01T00:00:00Z', iptalZamani: null as string | null, kullanildiZamani: null as string | null };
  const simdi = new Date('2026-10-20T00:00:00Z');

  it('KRİTİK: token biçimi; biçimsiz token veritabanına gitmez', () => {
    expect(onayTokenBicimiGecerli(randomBytes(32).toString('base64url'))).toBe(true);
    expect(onayTokenBicimiGecerli('abc')).toBe(false);
    expect(onayTokenBicimiGecerli(`${randomBytes(32).toString('base64url')}'--`)).toBe(false);
    expect(onayBaglantisiYolu('a_b-c')).toBe('/strateji-onay/a_b-c');
  });

  it('KRİTİK: karar YALNIZ aynı sürümde, onay beklerken, kullanılmamış, süresi dolmamış, iptal edilmemiş bağlantıyla', () => {
    expect(baglantiHali(b, { durum: 'onayda', surum: 3 }, simdi)).toEqual({ hal: 'gecerli', okunabilir: true, karar: true });
    expect(baglantiHali(b, { durum: 'onayda', surum: 4 }, simdi)).toMatchObject({ hal: 'surum_degisti', karar: false, okunabilir: false });
    expect(baglantiHali({ ...b, kullanildiZamani: '2026-10-19T00:00:00Z' }, { durum: 'onaylandi', surum: 3 }, simdi)).toMatchObject({ hal: 'kullanildi', karar: false });
    expect(baglantiHali(b, { durum: 'onaylandi', surum: 3 }, simdi)).toMatchObject({ hal: 'karar_beklemiyor', karar: false });
    expect(baglantiHali(b, { durum: 'onayda', surum: 3 }, new Date('2026-11-01T00:00:00Z'))).toMatchObject({ hal: 'suresi_doldu', okunabilir: false });
    // İptal, sürüm sorusundan önce: iptal edilmiş bağlantı "sürüm değişti" demez.
    expect(baglantiHali({ ...b, iptalZamani: '2026-10-19T00:00:00Z' }, { durum: 'onayda', surum: 9 }, simdi)).toMatchObject({ hal: 'iptal' });
    expect(baglantiHali(b, { durum: 'iptal', surum: 3 }, simdi)).toMatchObject({ hal: 'iptal', okunabilir: false });
  });

  it('karar şeması: ad ve e-posta zorunlu, revizyonda yorum zorunlu; süre en çok 30 gün', () => {
    const t = { karar: 'onayla' as const, ad: 'Mehmet Kaya', eposta: 'MEHMET@ornek.com', surum: 3 };
    expect(baglantiKarariSchema.parse(t).eposta).toBe('mehmet@ornek.com');
    expect(baglantiKarariSchema.safeParse({ ...t, ad: '' }).success).toBe(false);
    expect(baglantiKarariSchema.safeParse({ ...t, karar: 'revizyon_iste' }).success).toBe(false);
    expect(baglantiKarariSchema.safeParse({ ...t, karar: 'revizyon_iste', yorum: 'Tanıtım Aralık’a uzasın' }).success).toBe(true);
    expect(onayBaglantisiOlusturSchema.parse({ surum: 1 }).sureGun).toBe(14);
    expect(onayBaglantisiOlusturSchema.safeParse({ surum: 1, sureGun: 31 }).success).toBe(false);
  });
});

describe('adresler, uçlar, görünüm kapısı', () => {
  it('KRİTİK: müşteri hesabı düzenleyiciyi istese de belgeyi görür; aktarım reklam kurma izni ister', () => {
    expect(stratejiGorunumKapisi([...resolvePermissions('client_viewer')], 'duzenle')).toBe('belge');
    expect(stratejiGorunumKapisi([...resolvePermissions('client_viewer')], 'aktar')).toBe('belge');
    expect(stratejiGorunumKapisi([...resolvePermissions('admin')], 'aktar')).toBe('aktar');
    expect(stratejiGorunumKapisi([...resolvePermissions('admin')], null)).toBe('duzenle');
    expect(stratejiGorunumKapisi(['strategy.read', 'strategy.write'], 'aktar')).toBe('duzenle');
    expect(stratejiGorunumKapisi([], null)).toBeNull();
  });

  it('KRİTİK: oturumsuz uç YALNIZ onay bağlantısının ikisi', () => {
    expect(STRATEJI_V2_UCLARI.filter((u) => u.izin === null).map((u) => `${u.yontem} ${u.yol}`)).toEqual([
      'GET /strateji/v2/onay/:token',
      'POST /strateji/v2/onay/:token/karar',
    ]);
  });

  it('adres ve yol tek üreticiden; eksik parametre hata', () => {
    expect(stratejiPanelAdresi({ musteri: 'm 1', plan: 'p', gorunum: 'belge' })).toBe('/strateji?musteri=m%201&plan=p&gorunum=belge');
    expect(stratejiPanelAdresi({ musteri: 'm' })).toBe('/strateji?musteri=m');
    expect(stratejiPdfYolu('p1', 3)).toBe('/strateji/v2/planlar/p1/pdf?surum=3');
    expect(() => stratejiUcYolu('/strateji/v2/planlar/:id/kalemler/:kalemId/metin-oner', { id: 'p' })).toThrow(/kalemId/);
  });
});

describe('belge ve riskler', () => {
  it('bölüm listesi tekil; gerçekleşen yalnız onaydan sonra ve en sonda; AI bölümleri listede', () => {
    const kodlar = STRATEJI_BELGE_BOLUMLERI.map((b) => b.kod);
    expect(new Set(kodlar).size).toBe(kodlar.length);
    expect(kodlar.at(-1)).toBe('gerceklesen');
    expect(STRATEJI_BELGE_BOLUMLERI.filter((b) => b.onaydanSonra).map((b) => b.kod)).toEqual(['gerceklesen']);
    for (const a of AI_METIN_BOLUMLERI) expect(kodlar).toContain(a);
  });

  it('KRİTİK: ölçüm "bilinmiyor" risk ÜRETMEZ, "yok" üretir; deneme ve veri yok riskleri', () => {
    const tb = {
      olcum: { site_formu: { meta: null, google: false } },
      hesap: { meta: true, google: true },
      asgariAlti: () => null,
      haftalikSonuc: () => null,
      ozelKategori: true,
      hicTahminYok: true,
    };
    const r = stratejiRiskleri([kalem(), kalem({ amac: 'TELEFON' })], tb);
    const kod = (k: string, p: string | null) => r.filter((x) => x.kod === k && x.platform === p);
    expect(kod('R-OLCUM', 'google')).toHaveLength(1);
    expect(kod('R-OLCUM', 'meta')).toHaveLength(0);
    expect(r.filter((x) => x.kod === 'R-DENEME').map((x) => x.kalem)).toEqual([2, 2]);
    expect(r.map((x) => x.kod)).toContain('R-KATEGORI');
    expect(r.map((x) => x.kod)).toContain('R-VERI');
    const ogrenme = stratejiRiskleri([kalem()], { ...tb, haftalikSonuc: (_s, p) => (p === 'meta' ? 12 : 3) });
    expect(ogrenme.filter((x) => x.kod === 'R-OGRENME').map((x) => x.platform)).toEqual(['meta']);
  });
});
