import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { taslakEksikleri, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppConfig } from '../../config/configuration';
import { aiCiktisiniDogrula, type AiBaglami, type AiCikti } from './ai-taslak';
import { ReklamAiTaslakService } from './ai-taslak.service';
import { gorselBilgisi, gorselKaydet } from './gorsel-yukle';
import { ReklamHazirlikService } from './hazirlik.service';
import { ReklamTaslakService } from './taslak.service';

const V1 = '66666666-0000-4000-8000-000000000001';
const V2 = '66666666-0000-4000-8000-000000000002';
const baglam: AiBaglami = {
  cumle: 'Bu görsellerle form kampanyası kur, günlük 500 TL, 14 gün',
  varliklar: [V1, V2],
  sikSayfalar: [{ ad: 'Kampanya', adres: 'https://ornek.com.tr/kampanya' }],
  markaKitlesi: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }],
  yasalUyari: null,
  tekHesap: null,
  tekSayfa: null,
  bugun: '2026-10-08',
};
const cikti: AiCikti = {
  niyet: 'FORM',
  niyetGerekcesi: 'Form istendi',
  hedefAdres: null,
  kavramlar: [
    { gorselSirasi: 1, baslik: 'Bornova’da yeni daireler', metin: 'Bilgi için formu doldur.' },
    { gorselSirasi: 2, baslik: 'Teslim 2027', metin: 'Ödeme planını öğren.' },
  ],
  butce: { tip: 'gunluk', tutar: 500 },
  sureGun: 14,
  konum: 'marka_kitlesi',
  sorular: [],
};

describe('model çıktısının denetimi', () => {
  it('her alan öneri; konum Marka Merkezi’nden; cümledeki bütçe ve süre alınıyor', () => {
    const r = aiCiktisiniDogrula(cikti, baglam);
    expect(r.degisiklikler.niyet).toEqual({ deger: 'FORM', kaynak: 'ai_onerisi' });
    expect(r.degisiklikler.butce).toEqual({ deger: { tip: 'gunluk', micros: '500000000' }, kaynak: 'ai_onerisi' });
    expect(r.degisiklikler.takvim).toEqual({ deger: { baslangic: '2026-10-08', bitis: '2026-10-21' }, kaynak: 'ai_onerisi' });
    expect(r.degisiklikler.konumlar?.kaynak).toBe('marka_merkezi');
    expect((r.degisiklikler.kavramlar!.deger as Array<{ varlikId: string }>).map((k) => k.varlikId)).toEqual([V1, V2]);
  });

  it('KRİTİK: model bütçe ya da süre UYDURURSA atılır ve söylenir', () => {
    const r = aiCiktisiniDogrula({ ...cikti, butce: { tip: 'gunluk', tutar: 750 }, sureGun: 30 }, baglam);
    expect(r.degisiklikler.butce).toBeUndefined();
    expect(r.degisiklikler.takvim).toBeUndefined();
    expect(r.notlar).toContain('Bütçeyi isteğinde göremedim; tutarı sen yaz.');
    const yok = aiCiktisiniDogrula({ ...cikti, butce: null }, { ...baglam, cumle: 'form kampanyası kur' });
    expect(yok.notlar).toContain('Günlük ya da toplam bütçeyi yaz.');
  });

  it('"1.500 TL" Türkçe binlik yazımı tanınıyor', () => {
    const r = aiCiktisiniDogrula({ ...cikti, butce: { tip: 'toplam', tutar: 1500 } }, { ...baglam, cumle: 'toplam 1.500 TL, 10 gün' });
    expect(r.degisiklikler.butce?.deger).toEqual({ tip: 'toplam', micros: '1500000000' });
  });

  it('KRİTİK: uydurulmuş adres atılır; bilinen sayfa ya da cümlede yazan adres kabul', () => {
    const site = { ...cikti, niyet: 'SITE' as const };
    expect(aiCiktisiniDogrula({ ...site, hedefAdres: 'https://uydurma.com' }, baglam).degisiklikler.hedefAdres).toBeUndefined();
    expect(aiCiktisiniDogrula({ ...site, hedefAdres: 'https://ornek.com.tr/kampanya' }, baglam).degisiklikler.hedefAdres?.deger).toBe(
      'https://ornek.com.tr/kampanya',
    );
    const c = { ...baglam, cumle: 'https://yeni.com.tr/x sayfasına gönder' };
    expect(aiCiktisiniDogrula({ ...site, hedefAdres: 'https://yeni.com.tr/x' }, c).degisiklikler.hedefAdres?.deger).toBe('https://yeni.com.tr/x');
  });

  it('başlık kısaltılırsa, yasal uyarı eklenirse, görsel atlanırsa SÖYLENİR', () => {
    const r = aiCiktisiniDogrula(
      { ...cikti, kavramlar: [{ gorselSirasi: 1, baslik: 'x'.repeat(60), metin: 'M' }, { gorselSirasi: 9, baslik: 'B', metin: 'M' }] },
      { ...baglam, yasalUyari: 'Yatırım tavsiyesi değildir.' },
    );
    expect(r.notlar).toEqual(expect.arrayContaining([
      'Fikir 1: başlık 40 karakteri aşıyordu, kısaltıldı; kontrol et.',
      'Fikir 1: zorunlu yasal uyarı metne eklendi.',
      '1 görsel için fikir üretilmedi; önizlemede ekleyebilirsin.',
    ]));
  });

  it('KRİTİK: öneri ONAYLANMADAN derlenemez (kaynak kilidi)', () => {
    const r = aiCiktisiniDogrula(cikti, baglam);
    const z = '2026-10-07T10:00:00.000Z';
    const alanlar = Object.fromEntries(Object.entries(r.degisiklikler).map(([k, v]) => [k, { ...v!, kim: null, zaman: z }]));
    expect(taslakEksikleri(alanlar as never).filter((e) => e.kod === 'KAYNAK').map((e) => e.alan).sort()).toEqual(['butce', 'niyet', 'takvim']);
  });
});

describe('görsel başlığı', () => {
  const png = (en: number, boy: number) => {
    const b = Buffer.alloc(32);
    b.writeUInt32BE(0x89504e47, 0);
    b.writeUInt32BE(0x0d0a1a0a, 4);
    b.writeUInt32BE(en, 16);
    b.writeUInt32BE(boy, 20);
    return b;
  };
  const jpeg = (en: number, boy: number) =>
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, boy >> 8, boy & 255, en >> 8, en & 255, 0x03, 0, 0, 0, 0]);

  it('PNG ve JPEG boyutları baytlardan', () => {
    expect(gorselBilgisi(png(1080, 1350))).toEqual({ tur: 'tamam', mime: 'image/png', en: 1080, boy: 1350 });
    expect(gorselBilgisi(jpeg(1200, 628))).toEqual({ tur: 'tamam', mime: 'image/jpeg', en: 1200, boy: 628 });
  });

  it('WebP, GIF ve küçük görsel GİRİŞTE reddedilir', () => {
    expect(gorselBilgisi(Buffer.from('RIFF....WEBPVP8 '))).toMatchObject({ tur: 'hata' });
    expect(gorselBilgisi(Buffer.from('GIF89a......'))).toMatchObject({ tur: 'hata' });
    expect(gorselBilgisi(png(400, 400))).toEqual({ tur: 'hata', mesaj: 'Görsel çok küçük (400×400); kısa kenar en az 600 piksel olmalı.' });
  });
});

describe('uçtan uca: cümle + görsel → öneri taslağı → onay', () => {
  let h: Harness;
  let svc: ReklamAiTaslakService;
  const kok = mkdtempSync(join(tmpdir(), 'ai-'));
  const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: IDS.client, isOrgAdmin: true } as TenantContext;
  let son: { icerik: unknown[] } | null = null;

  beforeAll(async () => {
    h = await createHarness();
    const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
    const config = { aiAssistant: { apiKey: undefined }, uploads: { dir: kok } } as unknown as AppConfig;
    svc = new ReklamAiTaslakService(prisma, new ReklamHazirlikService(prisma), new ReklamTaslakService(prisma), config);
    svc.modelCagir = async (g) => {
      son = { icerik: g.icerik };
      return { tur: 'tamam', cikti };
    };
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
    await seedTenant(h);
    mkdirSync(join(kok, 'o'), { recursive: true });
    for (const [id, ad] of [[V1, 'a.png'], [V2, 'b.png']] as const) {
      writeFileSync(join(kok, 'o', ad), 'PNG');
      await h.q(
        `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
         VALUES ($1, $2, $3, 'image', $4, $4, 'image/png', 3, 1080, 1080, $5, $6, now())`,
        [id, IDS.org, IDS.client, ad, `o/${ad}`, id.replace(/-/g, '')],
      );
    }
  });

  it('taslak "ai" yüzüyle açılır, alanlar öneri, görseller modele gider; onay öneriyi kullanıcıya çevirir', async () => {
    const r = await svc.olustur(CTX, IDS.client, baglam.cumle, [V1, V2]);
    expect(r.taslak.olusturanYuz).toBe('ai');
    expect(r.taslak.alanlar.niyet?.kaynak).toBe('ai_onerisi');
    expect(r.taslak.eksikler.map((e) => e.kod)).toContain('KAYNAK');
    expect(JSON.stringify(son!.icerik)).toContain('"type":"image"');
    expect(r.notlar).toContain('Bu reklam konut, iş ilanı, kredi ya da finans ya da siyasi bir konu içeriyor mu? Önizlemede cevapla.');

    await expect(svc.onayla(CTX, r.taslak.id, 'f'.repeat(64))).rejects.toThrow(/değişti/);
    const o = await svc.onayla(CTX, r.taslak.id, r.taslak.icerikOzeti!);
    expect(o.alanlar.niyet).toMatchObject({ kaynak: 'kullanici', kim: IDS.user });
    expect(o.eksikler.map((e) => e.kod)).not.toContain('KAYNAK');
  });

  it('başka workspace’in görseli kullanılamaz; model reddederse taslak açılmaz', async () => {
    await expect(svc.olustur(CTX, IDS.client, 'form kur', ['77777777-0000-4000-8000-000000000001'])).rejects.toThrow(/arşivinde değil/);
    svc.modelCagir = async () => ({ tur: 'ret', mesaj: 'Asistan bu isteği yapamadı; taslağı panelden kurabilirsin.' });
    await expect(svc.olustur(CTX, IDS.client, 'form kur', [V1])).rejects.toThrow(/yapamadı/);
    const [n] = await h.q<{ n: number }>('SELECT count(*)::int AS n FROM reklam_taslagi');
    expect(n!.n).toBe(0);
  });

  it('görsel kaydı: aynı dosya ikinci kez yeni satır açmaz ve söylenir', async () => {
    const tx = (fn: (t: never) => Promise<unknown>) => fn(h.db as never);
    const b = Buffer.alloc(32);
    b.writeUInt32BE(0x89504e47, 0);
    b.writeUInt32BE(0x0d0a1a0a, 4);
    b.writeUInt32BE(1080, 16);
    b.writeUInt32BE(1080, 20);
    const g = { orgId: IDS.org, clientId: IDS.client, kullaniciId: IDS.user, ad: 'kare.png', bayt: b, yuklemeKoku: kok };
    const a = await gorselKaydet(tx as never, g);
    const c = await gorselKaydet(tx as never, g);
    expect(a.zatenVardi).toBe(false);
    expect(c).toMatchObject({ id: a.id, zatenVardi: true });
  });
});
