import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { esneklikCumlesi, onayKartiUret, type OnayKartiGirdisi, type ReklamTaslakKaydi, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { ReklamAiTaslakService } from '../ai-taslak.service';
import type { ReklamTaslakService } from '../taslak.service';
import type { ReklamYayinService } from '../yayin.service';
import { AdvOnayService, GERCEK_YAYIN_KAPALI, KART_OMRU_MS } from './onay.service';

/**
 * Onay kartı (İP-15). Kartın metnini model yazmıyor; kapılar düğmeleri
 * belirliyor; onay tek kullanımlık ve kart açıldıktan sonra taslak
 * değiştiyse reddediliyor.
 */

const temel: OnayKartiGirdisi = {
  alanlar: {
    niyet: { deger: 'SITE', kaynak: 'ai_onerisi' },
    butce: { deger: { tip: 'gunluk', micros: '250000000' }, kaynak: 'kullanici' },
    takvim: { deger: { baslangic: '2026-10-08', bitis: '2026-10-21' }, kaynak: 'kullanici' },
    konumlar: { deger: [{ tur: 'city', key: '1', etiket: 'İzmir', ulkeKodu: 'TR' }], kaynak: 'kullanici' },
    kavramlar: { deger: [{ varlikId: 'v', baslik: 'B', metin: 'M' }], kaynak: 'kullanici' },
  } as never,
  surumNo: 4,
  kalanEksikler: [],
  prova: { tur: 'gecti', metin: 'Geçti' },
  hesap: { ad: 'Hesap', paraBirimi: 'TRY' },
  sayfaAdi: 'Kuzey Kahve',
  atifEtiketi: '7 gün tıklama + 1 gün görüntüleme',
  kapilar: { metaYazma: { acik: true }, yayinYetkisi: true, gercekYayin: { acik: false, sebep: 'uyum yok' }, testKipi: false },
};
const kart = (o: Partial<OnayKartiGirdisi> = {}, k: Partial<OnayKartiGirdisi['kapilar']> = {}) =>
  onayKartiUret({ ...temel, ...o, kapilar: { ...temel.kapilar, ...k } });

describe('onayKartiUret', () => {
  it('KRİTİK: gerçek yayın kapalıyken "yayınla" düğmesi YOK ve sebebi yazıyor; metinde "yayınlanır" geçmiyor', () => {
    const k = kart();
    expect(k.dugmeler.map((d) => d.tur)).toEqual(['degistir', 'panelde_ac']);
    expect(k.dugmeYokSebebi).toBe('uyum yok');
    expect(JSON.stringify(k.satirlar)).not.toMatch(/yayınlanır/);
  });

  it('test kipi yalnız izinliye; gerçek yayın açılınca birincil düğme gelir', () => {
    expect(kart({}, { testKipi: true }).dugmeler[0]!.tur).toBe('test_kipi');
    expect(kart({}, { gercekYayin: { acik: true } }).dugmeler[0]!.tur).toBe('yayinla');
    expect(kart({}, { gercekYayin: { acik: true }, yayinYetkisi: false }).dugmeler.map((d) => d.tur)).not.toContain('yayinla');
  });

  it('KRİTİK: eksik ya da geçmemiş prova varken hiçbir yayın düğmesi yok', () => {
    expect(kart({ kalanEksikler: ['Bütçe seçilmedi'] }, { gercekYayin: { acik: true } }).dugmeler.map((d) => d.tur)).toEqual(['degistir', 'panelde_ac']);
    const p = kart({ prova: { tur: 'reddedildi', metin: 'Meta reddetti' } }, { gercekYayin: { acik: true }, testKipi: true });
    expect(p.dugmeler.map((d) => d.tur)).toEqual(['degistir', 'panelde_ac']);
    expect(p.uyarilar).toContain('Meta kontrolü: Meta reddetti');
  });

  it('Meta yazma kapısı kapalıysa sebebi kartta', () => {
    expect(kart({}, { metaYazma: { acik: false, sebep: 'Ajans durdurdu' }, gercekYayin: { acik: true } }).dugmeYokSebebi).toBe('Ajans durdurdu');
  });

  it('bütçe esnekliği sabitten: günlük 250 TL → 437,50 TL, haftalık 1.750 TL', () => {
    expect(kart().esneklik).toBe(esneklikCumlesi('gunluk', 250_000_000n, 'TRY'));
    expect(kart().esneklik).toMatch(/437,50/);
    expect(kart().esneklik).toMatch(/1\.750,00/);
  });

  it('KRİTİK: ölçüm etiketi niyete göre — site ziyareti 1 gün tıklama, form ajans standardı', () => {
    expect(kart().olcum).toBe('Meta’nın saydığı sonuç · 1 gün tıklama');
    expect(kart({ alanlar: { ...temel.alanlar, niyet: { deger: 'FORM', kaynak: 'kullanici' } } as never }).olcum).toBe(
      'Meta’nın saydığı sonuç · 7 gün tıklama + 1 gün görüntüleme',
    );
  });

  it('kapattıklarımız ve Meta’nın yapabilecekleri ayrı listeler', () => {
    const k = kart();
    expect(k.kapattiklarimiz).toContain('görseli hareketlendirme');
    expect(k.metaOtomatikYapabilir).toContain('görseli yerleşime göre kırpabilir');
  });
});

describe('AdvOnayService.onayla', () => {
  let h: Harness;
  let svc: AdvOnayService;
  let taslakId: string;
  const basladi: Array<{ testKipi: boolean }> = [];
  const CTX = {
    orgId: IDS.org,
    userId: IDS.user,
    clientIds: [IDS.client],
    activeClientId: IDS.client,
    isOrgAdmin: true,
    permissions: ['bulk.write', 'bulk.read', 'bulk.publish'],
  } as unknown as TenantContext;

  beforeAll(async () => {
    h = await createHarness();
    const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
    const taslakKaydi = async (): Promise<ReklamTaslakKaydi> => {
      const [t] = await h.q<{ aktif_surum_no: number }>(`SELECT aktif_surum_no FROM reklam_taslagi WHERE id = $1`, [taslakId]);
      return { id: taslakId, aktifSurumNo: t!.aktif_surum_no, icerikOzeti: 'a'.repeat(64) } as ReklamTaslakKaydi;
    };
    svc = new AdvOnayService(
      prisma,
      null as never,
      { oku: taslakKaydi } as unknown as ReklamTaslakService,
      { baslat: async (_c: unknown, i: { testKipi: boolean }) => (basladi.push(i), { tur: 'basladi', yayinId: await yayinAc() }) } as unknown as ReklamYayinService,
      null as never,
      { onayla: taslakKaydi } as unknown as ReklamAiTaslakService,
    );
  }, 60_000);
  afterAll(async () => h?.close());

  async function yayinAc(): Promise<string> {
    const [y] = await h.q<{ id: string }>(
      `INSERT INTO yayin (org_id, client_id, taslak_id, taslak_surum_no, icerik_ozeti, derlenmis_govde, beklenen_yanki, api_surumu, derleyici_surumu, atif_standardi, kaynak, baslatan_id)
       VALUES ($1, $2, $3, 1, $4, '[]', '[]', 'v25.0', 'd', 'tik7', 'ai_kart', $5) RETURNING id::text`,
      [IDS.org, IDS.client, taslakId, 'a'.repeat(64), IDS.user],
    );
    return y!.id;
  }

  beforeEach(async () => {
    basladi.length = 0;
    await h.reset();
    await seedTenant(h);
    const [t] = await h.q<{ id: string }>(
      `INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, olusturan_id, aktif_surum_no) VALUES ($1, $2, 'meta', 'ai', $3, 4) RETURNING id::text`,
      [IDS.org, IDS.client, IDS.user],
    );
    taslakId = t!.id;
  });

  async function kartYaz(dugmeler: Array<{ tur: string }>, surum = 4, yas = '0 seconds'): Promise<string> {
    const [o] = await h.q<{ id: string }>(
      `INSERT INTO adv_onay (org_id, client_id, taslak_id, taslak_surum_no, kart, kart_ozeti, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() - $7::interval) RETURNING id::text`,
      [IDS.org, IDS.client, taslakId, surum, JSON.stringify({ dugmeler, dugmeYokSebebi: GERCEK_YAYIN_KAPALI }), 'b'.repeat(64), yas],
    );
    return o!.id;
  }
  const durum = async (id: string) => (await h.q<{ durum: string }>(`SELECT durum FROM adv_onay WHERE id = $1`, [id]))[0]!.durum;

  it('KRİTİK: onay TEK KULLANIMLIK — ikinci tık yayın başlatmaz', async () => {
    const id = await kartYaz([{ tur: 'test_kipi' }]);
    await svc.onayla(CTX, id, 'test_kipi');
    await expect(svc.onayla(CTX, id, 'test_kipi')).rejects.toThrow(/zaten onaylandı/);
    expect(basladi).toEqual([expect.objectContaining({ testKipi: true, kaynak: 'ai_kart' })]);
    expect(await durum(id)).toBe('onaylandi');
  });

  it('KRİTİK: kart açıldıktan sonra taslak değiştiyse onay REDDEDİLİR ve kart bayat olur', async () => {
    const id = await kartYaz([{ tur: 'test_kipi' }], 3);
    await expect(svc.onayla(CTX, id, 'test_kipi')).rejects.toThrow(/taslak değişti/);
    expect(basladi).toHaveLength(0);
    expect(await durum(id)).toBe('bayat');
  });

  it('KRİTİK: kartta olmayan eylem (doğrudan istek) reddedilir', async () => {
    const id = await kartYaz([{ tur: 'test_kipi' }]);
    await expect(svc.onayla(CTX, id, 'yayinla')).rejects.toThrow(GERCEK_YAYIN_KAPALI);
    expect(basladi).toHaveLength(0);
  });

  it(`${KART_OMRU_MS / 3_600_000} saatten eski kartın süresi dolar`, async () => {
    const id = await kartYaz([{ tur: 'test_kipi' }], 4, '25 hours');
    await expect(svc.onayla(CTX, id, 'test_kipi')).rejects.toThrow(/süresi doldu/);
    expect(await durum(id)).toBe('suresi_doldu');
  });
});
