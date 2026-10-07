import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { YASAKLI_ARACLAR, type HedefKonum, type ReklamHazirligi, type ReklamTaslakKaydi, type TenantContext } from '@advetics/shared';
import type { AlanDegisikligi } from '../taslak.service';
import { AracCalistirici, aracTanimlari, sayiMetindeMi, type AracBagimliliklari, type OturumDurumu } from './araclar';

/**
 * Araç kapıları (İP-12/14): model şemaya uysa da uymasa da sunucu her
 * girdiyi yeniden doğruluyor. Bütçe, süre, adres ve konum anahtarı
 * UYDURULAMAZ.
 */

const CTX = { userId: 'u', clientIds: ['c'], permissions: [] } as unknown as TenantContext;
const IZMIR: HedefKonum = { tur: 'city', key: '2584', etiket: 'İzmir, Türkiye', ulkeKodu: 'TR' };

function hazirlik(o: Partial<ReklamHazirligi> = {}): ReklamHazirligi {
  return {
    hesaplar: [{ id: 'h1', ad: 'Hesap', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul' }],
    sayfalar: [{ id: 's1', ad: 'Sayfa', ustSayfaPlatformId: null }],
    instagramHesaplari: [],
    gorseller: { satirlar: [], toplam: 0 },
    marka: { yasalUyari: null, metinSablonlari: [], profilVar: true },
    varsayilanKitle: null,
    ozelKategoriTabani: [],
    taninmayanKategoriler: [],
    ...o,
  };
}

function kur(o: Partial<OturumDurumu> = {}, d: Partial<AracBagimliliklari> = {}) {
  const yazilan: AlanDegisikligi[] = [];
  let taslak: ReklamTaslakKaydi = {
    id: 't1',
    clientId: 'c',
    durum: 'taslak',
    niyetKodu: 'SITE',
    adAccountId: 'h1',
    aktifSurumNo: 3,
    olusturanYuz: 'ai',
    updatedAt: '',
    alanlar: { kavramlar: { deger: [{ varlikId: 'v1', baslik: 'B', metin: 'M' }], kaynak: 'ai_onerisi', kim: 'u', zaman: '' } } as never,
    eksikler: [{ adim: 3, alan: 'butce', kod: 'BTC-01', metin: 'Bütçe seçilmedi' }] as never,
    icerikOzeti: 'x',
  };
  const bag: AracBagimliliklari = {
    hazirlik: async () => hazirlik(),
    profil: async () => ({ sikSayfalar: [{ ad: 'Menü', adres: 'https://ornek.com/menu' }] }),
    taslakOlustur: async () => taslak,
    taslakOku: async () => taslak,
    surumYaz: async (_c, _id, deg) => {
      yazilan.push(deg);
      taslak = { ...taslak, aktifSurumNo: taslak.aktifSurumNo + 1 };
      return taslak;
    },
    provaIste: async () => ({ durum: { tur: 'bekliyor', metin: 'Sürüyor' }, sonuclar: [] }),
    provaOku: async () => ({ durum: { tur: 'yok', metin: 'Yok' }, sonuclar: [] }),
    konumAra: async () => [IZMIR],
    onayKarti: async () => ({ hal: 'tamam', veri: {} }),
    ...d,
  };
  const oturum: OturumDurumu = {
    id: 'o',
    clientId: 'c',
    taslakId: 't1',
    kullaniciMetni: 'günlük 1.500 TL ile 14 gün siteme trafik',
    medyalar: [{ varlikId: 'v1' }],
    konumAdaylari: [],
    sorulanlar: [],
    bugun: '2026-10-08',
    ...o,
  };
  return { c: new AracCalistirici(bag), oturum, yazilan };
}

const yaz = (yazim: unknown, beklenenSurum = 3) => ({ beklenenSurum, yazim });

describe('taslak_alan_yaz kapıları', () => {
  it('KRİTİK: kullanıcının yazmadığı bütçe REDDEDİLİR, yazdığı kabul ve doğru micros', async () => {
    const { c, oturum, yazilan } = kur();
    expect((await c.calistir(CTX, oturum, 'taslak_alan_yaz', yaz({ alan: 'butce', deger: { tip: 'gunluk', tutar: 2000 } }))).sonuc.hal).toBe('reddedildi');
    expect(yazilan).toHaveLength(0);
    const r = await c.calistir(CTX, oturum, 'taslak_alan_yaz', yaz({ alan: 'butce', deger: { tip: 'gunluk', tutar: 1500 } }));
    expect(r.sonuc.hal).toBe('tamam');
    expect(yazilan[0]!.butce).toEqual({ deger: { tip: 'gunluk', micros: '1500000000' }, kaynak: 'ai_onerisi' });
  });

  it('KRİTİK: süre kullanıcının metninden; bitiş başlangıç dahil sayılır (14 gün → +13)', async () => {
    const { c, oturum, yazilan } = kur();
    expect((await c.calistir(CTX, oturum, 'taslak_alan_yaz', yaz({ alan: 'sure_gun', deger: 30 }))).sonuc.hal).toBe('reddedildi');
    await c.calistir(CTX, oturum, 'taslak_alan_yaz', yaz({ alan: 'sure_gun', deger: 14 }));
    expect(yazilan[0]!.takvim).toEqual({ deger: { baslangic: '2026-10-08', bitis: '2026-10-21' }, kaynak: 'ai_onerisi' });
  });

  it('KRİTİK: konum anahtarı yalnız bu oturumun konum aramasından', async () => {
    const { c, oturum } = kur();
    expect((await c.calistir(CTX, oturum, 'taslak_alan_yaz', yaz({ alan: 'konum', deger: ['2584'] }))).sonuc.hal).toBe('reddedildi');
    const ok = kur({ konumAdaylari: [IZMIR] });
    expect((await ok.c.calistir(CTX, ok.oturum, 'taslak_alan_yaz', yaz({ alan: 'konum', deger: ['2584'] }))).sonuc.hal).toBe('tamam');
    expect(ok.yazilan[0]!.konumlar).toEqual({ deger: [IZMIR], kaynak: 'ai_onerisi' });
  });

  it('KRİTİK: adres Marka Merkezi’nde ya da kullanıcının mesajında değilse uydurulamaz', async () => {
    const { c, oturum } = kur();
    expect((await c.calistir(CTX, oturum, 'taslak_alan_yaz', yaz({ alan: 'hedef_adres', deger: 'https://uydurma.com' }))).sonuc.hal).toBe('reddedildi');
    expect((await c.calistir(CTX, oturum, 'taslak_alan_yaz', yaz({ alan: 'hedef_adres', deger: 'https://ornek.com/menu' }))).sonuc.hal).toBe('tamam');
  });

  it('KRİTİK: eski sürüme göre yazım reddedilir (kullanıcının panel kararı ezilmez)', async () => {
    const { c, oturum, yazilan } = kur();
    const r = await c.calistir(CTX, oturum, 'taslak_alan_yaz', yaz({ alan: 'niyet', deger: 'SITE' }, 2));
    expect(r.sonuc).toMatchObject({ hal: 'reddedildi', neden: expect.stringContaining('SURUM_ESKI') });
    expect(yazilan).toHaveLength(0);
  });

  it('başka workspace’in hesabı yazılamaz; derlenemeyen niyet şemada yok', async () => {
    const { c, oturum } = kur();
    // Geçerli bir UUID: şemadan geçsin, KAPIYA takılsın (sebebe çapalı).
    expect((await c.calistir(CTX, oturum, 'taslak_alan_yaz', yaz({ alan: 'reklam_hesabi', deger: '6f1c2a3b-4d5e-4f60-8a71-92b3c4d5e6f7' }))).sonuc).toMatchObject({
      hal: 'reddedildi',
      neden: expect.stringContaining('listesinde yok'),
    });
    expect((await c.calistir(CTX, oturum, 'taslak_alan_yaz', yaz({ alan: 'niyet', deger: 'WHATSAPP' }))).sonuc).toMatchObject({ hal: 'reddedildi', neden: expect.stringContaining('Girdi geçersiz') });
  });

  it('yazımın sonucunda sıradaki soru döner (model yalnız onu sorar)', async () => {
    const { c, oturum } = kur();
    const r = await c.calistir(CTX, oturum, 'taslak_alan_yaz', yaz({ alan: 'niyet', deger: 'SITE' }));
    expect(r.soru).toMatchObject({ alan: 'butce' });
  });
});

describe('diğer araçlar', () => {
  it('bilinmeyen araç ve şema dışı girdi REDDEDİLİR, çalışmaz', async () => {
    const { c, oturum } = kur();
    expect((await c.calistir(CTX, oturum, 'yayinla', {})).sonuc.hal).toBe('reddedildi');
    expect((await c.calistir(CTX, oturum, 'konum_ara', { metin: 'a', fazla: 1 })).sonuc.hal).toBe('reddedildi');
  });

  it('KRİTİK: konum araması "eşleşme yok" ile "çağrı düştü"yü AYRI döndürür', async () => {
    const bos = kur({}, { konumAra: async () => [] });
    expect((await bos.c.calistir(CTX, bos.oturum, 'konum_ara', { metin: 'Xyz' })).sonuc.hal).toBe('sonuc_yok');
    const dustu = kur({}, { konumAra: async () => { throw new Error('(#190) token süresi doldu'); } });
    expect((await dustu.c.calistir(CTX, dustu.oturum, 'konum_ara', { metin: 'İzmir' })).sonuc).toEqual({ hal: 'dustu', platformMesaji: '(#190) token süresi doldu' });
  });

  it('prova eksik varken başlamaz (kota boşa harcanmaz)', async () => {
    let istendi = false;
    const { c, oturum } = kur({}, { provaIste: async () => ((istendi = true), { durum: { tur: 'bekliyor', metin: '' }, sonuclar: [] }) });
    expect((await c.calistir(CTX, oturum, 'prova_baslat', {})).sonuc.hal).toBe('reddedildi');
    expect(istendi).toBe(false);
  });

  it('taslak varken ikinci taslak kurulmaz', async () => {
    const { c, oturum } = kur();
    const gecerli = {
      niyet: 'SITE',
      niyetGerekcesi: 'site',
      hedefAdres: null,
      kavramlar: [{ gorselSirasi: 1, baslik: 'B', metin: 'M' }],
      butce: null,
      sureGun: null,
      konum: 'belirtilmedi',
      sorular: [],
    };
    expect((await c.calistir(CTX, oturum, 'taslak_olustur', gecerli)).sonuc).toMatchObject({ hal: 'reddedildi', neden: expect.stringContaining('zaten var') });
    // Taslak yokken aynı girdi kuruluyor: girdi geçerliydi.
    const yeni = kur({ taslakId: null });
    expect((await yeni.c.calistir(CTX, yeni.oturum, 'taslak_olustur', gecerli)).sonuc.hal).toBe('tamam');
  });
});

describe('tanımlar ve sınır', () => {
  it('her araç tanımı bir JSON şeması taşıyor; yasaklı ad yok', () => {
    const t = aracTanimlari();
    for (const a of t) {
      expect(a.input_schema.type).toBe('object');
      expect(YASAKLI_ARACLAR as readonly string[]).not.toContain(a.name);
    }
  });

  it('KRİTİK: araç katmanı yayın başlatamaz (kaynakta yayın çağrısı yok)', () => {
    const k = readFileSync(join(__dirname, 'araclar.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(k.length).toBeGreaterThan(1000);
    expect(k).not.toMatch(/\.baslat\(|yayinBaslat|onayla\(/);
  });

  it('sayı eşleştirme: "1.500 TL" = 1500, "14 gün" = 14, 1,5 ayrı sayı', () => {
    expect(sayiMetindeMi(1500, 'günlük 1.500 TL')).toBe(true);
    expect(sayiMetindeMi(150, 'günlük 1.500 TL')).toBe(false);
    expect(sayiMetindeMi(1.5, '1,5 bin')).toBe(true);
  });
});
