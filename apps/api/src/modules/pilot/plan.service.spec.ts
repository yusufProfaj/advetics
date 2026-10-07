import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePermissions, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MetinUretici } from '../../yapay-zeka/gemini';
import type { PilotKurulumKuyrugu } from './kurulum-kuyrugu';
import { PilotPlanService, yapilabilirEylemler } from './plan.service';
import type { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';

/**
 * ═══ PİLOT PLAN SERVİSİ — gerçek şema (PGlite), sahte Gemini ═══
 *
 * RLS burada kapalı (worker rolü taklidi); politikalar `pilot-rls.spec.ts`te.
 * Gemini sahte: her test modelin ne döndürdüğünü kendisi kuruyor, çünkü
 * sınanan şey modelin değil SUNUCUNUN kararı (uydurulan sayıyı reddetmek).
 */
let h: Harness;
let svc: PilotPlanService;
const kuyruk = { planEkle: vi.fn<(id: string, tetik: string, yeniden?: boolean) => Promise<void>>() };
let yzCevabi: string | null = null;
const yz: MetinUretici = {
  model: 'sahte-gemini',
  uret: vi.fn(async () => {
    if (yzCevabi === null) throw new Error('model düştü');
    return { parcalar: [{ text: yzCevabi }], sebep: 'bitti' as const, aciklama: null, girdiToken: 1, ciktiToken: 1, onbellekToken: 0 };
  }),
} as unknown as MetinUretici;

const OTEKI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KITLE = '77777777-0000-4000-8000-000000000001';
const VARLIK = '88888888-0000-4000-8000-000000000001';
const SIMDI = new Date('2026-10-07T06:00:00Z');

const AJANS = {
  orgId: '99999999-9999-4999-8999-999999999999', // "tüm şirketler": ev şirketi BAŞKA
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  role: 'admin',
  permissions: [...resolvePermissions('admin')],
} as unknown as TenantContext;
const MUSTERI = { ...AJANS, orgId: IDS.org, isOrgAdmin: false, role: 'client_viewer', permissions: [...resolvePermissions('client_viewer')] } as unknown as TenantContext;

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  svc = new PilotPlanService(prisma, kuyruk as unknown as PilotKurulumKuyrugu, yz);
}, 60_000);
afterAll(async () => h?.close());

beforeEach(async () => {
  kuyruk.planEkle.mockReset();
  kuyruk.planEkle.mockResolvedValue(undefined);
  yzCevabi = null;
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öteki', 'oteki', now())`, [OTEKI, IDS.org]);
  // Gerçek yayın anahtarı AÇIK (varsayılan kapalı; kapalı hâli ayrı testte).
  await h.q(`INSERT INTO ajans_ayari (org_id, pilot_gercek_yayin, pilot_gercek_yayin_at, pilot_gercek_yayin_sebebi) VALUES ($1, true, now(), 'test kurulumu')`, [IDS.org]);
  // Özel kategori sorusu CEVAPLANDI ("Hayır"); sektör beyanlı.
  await h.q(`UPDATE clients SET ozel_kategori_beyan_zamani = now() WHERE id = $1`, [IDS.client]);
  await h.q(`INSERT INTO monthly_budgets (id, org_id, client_id, month, amount_micros, currency, updated_at) VALUES (gen_random_uuid(), $1, $2, '2026-11-01', 120000000000, 'TRY', now())`, [IDS.org, IDS.client]);
  await h.q(`INSERT INTO audience_templates (id, org_id, client_id, name, updated_at) VALUES ($1, $2, $3, 'Genel', now())`, [KITLE, IDS.org, IDS.client]);
  await h.q(
    `INSERT INTO client_profiles (id, org_id, client_id, ana_amac, sektor, varsayilan_kitle_id, updated_at) VALUES (gen_random_uuid(), $1, $2, 'website', 'Kahve makinesi üretimi', $3, now())`,
    [IDS.org, IDS.client, KITLE],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $2, $3, 'Görsel', 'a.jpg', 'image/jpeg', 1, 1080, 1080, 'k/a', 'aaaaaaaaaaaaaaaa1', now())`,
    [VARLIK, IDS.org, IDS.client],
  );
});

const hazirla = () => svc.hazirla(AJANS, { clientId: IDS.client, donem: '2026-11' }, SIMDI);

describe('planı hazırla', () => {
  it('KRİTİK: sürüm 1 + değişmez denetim yazılır; org_id HEDEF MÜŞTERİDEN (ev şirketi değil)', async () => {
    const { id } = await hazirla();
    const [p] = await h.q<{ org_id: string; surum: number; toplam_micros: string; icerik_ozeti: string }>(
      'SELECT org_id::text, surum, toplam_micros::text, icerik_ozeti FROM pilot_planlari WHERE id = $1',
      [id],
    );
    expect(p).toMatchObject({ org_id: IDS.org, surum: 1, toplam_micros: '120000000000' });
    const s = await h.q<{ icerik_ozeti: string; kaynak: string }>('SELECT icerik_ozeti, kaynak FROM pilot_plan_surumleri WHERE plan_id = $1', [id]);
    expect(s).toEqual([{ icerik_ozeti: p!.icerik_ozeti, kaynak: 'uretici' }]);
    const d = await h.q<{ katalog_surumu: string; an: string }>('SELECT katalog_surumu, an FROM pilot_uyum_denetimleri WHERE plan_id = $1', [id]);
    expect(d).toEqual([{ katalog_surumu: '2026.10.1', an: 'plan' }]);
  });

  it('aynı ay için ikinci açık plan 409', async () => {
    await hazirla();
    await expect(hazirla()).rejects.toThrow(/açık bir plan zaten var/);
  });

  it('KRİTİK: model plandaki sayıların dışında sayı yazarsa gerekçe YAZILMAZ; temizse yazılır', async () => {
    yzCevabi = 'Bu ay 999.999 TL ile 5.000 form bekliyoruz.';
    const a = await hazirla();
    expect((await svc.detay(AJANS, a.id, SIMDI)).icerik.ozetMetni).toEqual({ dolu: false, emptyReason: 'yz_yazmadi' });
    await h.q(`UPDATE pilot_planlari SET durum = 'iptal'`);
    yzCevabi = 'Bütçenin tamamı Meta’da, çünkü plana giren tek platform o.';
    const b = await hazirla();
    expect((await svc.detay(AJANS, b.id, SIMDI)).icerik.ozetMetni).toMatchObject({ dolu: true, kaynak: { tur: 'yz_metin', kimlik: 'sahte-gemini' } });
  });

  it('model düşerse plan yine üretilir (gerekçesiz)', async () => {
    yzCevabi = null;
    const { id } = await hazirla();
    const d = await svc.detay(AJANS, id, SIMDI);
    expect(d.icerik.satirlar.length).toBeGreaterThan(0);
    expect(d.icerik.ozetMetni.dolu).toBe(false);
  });

  it('müşteri plan hazırlayamaz; başka workspace’in planı 404', async () => {
    await expect(svc.hazirla(MUSTERI, { clientId: IDS.client, donem: '2026-11' }, SIMDI)).rejects.toThrow(/ajans hesabından/);
    const { id } = await hazirla();
    await expect(svc.detay({ ...AJANS, clientIds: [OTEKI] } as TenantContext, id, SIMDI)).rejects.toThrow(/Plan bulunamadı/);
  });
});

describe('değiştir', () => {
  it('KRİTİK: elle değişiklik yeni sürüm yazar, özet değişir, eski sürümle yazım 409', async () => {
    const { id } = await hazirla();
    const d1 = await svc.detay(AJANS, id, SIMDI);
    const anahtar = d1.icerik.satirlar[0]!.anahtar;
    const d2 = await svc.degistir(AJANS, id, { surum: 1, degisiklikler: [{ tur: 'satir_tutari_fark', anahtar, farkMicros: '5000000000', yon: 'azalt' }] }, SIMDI);
    expect(d2.plan.surum).toBe(2);
    expect(d2.plan.icerikOzeti).not.toBe(d1.plan.icerikOzeti);
    expect(d2.icerik.dagitilmamis.micros).toBe('5000000000');
    await expect(svc.degistir(AJANS, id, { surum: 1, degisiklikler: [{ tur: 'satir_cikar', anahtar }] }, SIMDI)).rejects.toThrow(/sen bakarken değişti/);
  });

  it('KRİTİK: cümle çevirisi cümlede olmayan tutarı getirirse 400; doğruysa uygulanır', async () => {
    const { id } = await hazirla();
    const anahtar = (await svc.detay(AJANS, id, SIMDI)).icerik.satirlar[0]!.anahtar;
    // Model "5.000"ü "50.000" diye yazdı.
    yzCevabi = JSON.stringify({ degisiklikler: [{ tur: 'satir_tutari_fark', anahtar, tutar: '50.000', yon: 'azalt' }] });
    await expect(svc.degistir(AJANS, id, { surum: 1, cumle: 'Soğuktan 5.000 TL azalt' }, SIMDI)).rejects.toThrow(/cümlende geçmiyor/);
    yzCevabi = JSON.stringify({ degisiklikler: [{ tur: 'satir_tutari_fark', anahtar, tutar: '5.000', yon: 'azalt' }] });
    const d = await svc.degistir(AJANS, id, { surum: 1, cumle: 'Soğuktan 5.000 TL azalt' }, SIMDI);
    expect(d.plan.surum).toBe(2);
    const [s] = await h.q<{ cumle: string }>('SELECT cumle FROM pilot_plan_surumleri WHERE plan_id = $1 AND surum = 2', [id]);
    expect(s!.cumle).toBe('Soğuktan 5.000 TL azalt');
  });

  it('yeniden hazırla elle değişikliği SESSİZCE ezmez: onay olmadan 409', async () => {
    const { id } = await hazirla();
    const anahtar = (await svc.detay(AJANS, id, SIMDI)).icerik.satirlar[0]!.anahtar;
    await svc.degistir(AJANS, id, { surum: 1, degisiklikler: [{ tur: 'satir_tutari_fark', anahtar, farkMicros: '1000000', yon: 'azalt' }] }, SIMDI);
    await expect(svc.yenidenHazirla(AJANS, id, { surum: 2 }, SIMDI)).rejects.toThrow(/elle yapılmış değişiklikler/);
    const d = await svc.yenidenHazirla(AJANS, id, { surum: 2, onay: true }, SIMDI);
    expect(d.plan.surum).toBe(3);
  });
});

describe('gönder → onayla', () => {
  it('KRİTİK: müşteri onayı = yayın; özet uyuşmazsa ret, doğruysa onaylandi + kip + kuyruk', async () => {
    const { id } = await hazirla();
    const a = await svc.detay(AJANS, id, SIMDI);
    expect(a.uyum?.durum).toBe('gecti');
    expect(a.yapilabilir).toContain('musteriye_gonder');
    await svc.eylem(AJANS, id, { eylem: 'musteriye_gonder', surum: 1 }, SIMDI);
    const m = await svc.detay(MUSTERI, id, SIMDI);
    expect(m.rol).toBe('musteri');
    expect(m.uyum).toBeNull();
    expect(m.yapilabilir.sort()).toEqual(['degisiklik_iste', 'onayla']);
    await expect(svc.onayla(MUSTERI, id, { surum: 1, icerikOzeti: 'f'.repeat(64) }, SIMDI)).rejects.toThrow(/onaylanamıyor/);
    const o = await svc.onayla(MUSTERI, id, { surum: 1, icerikOzeti: m.plan.icerikOzeti }, SIMDI);
    expect(o.plan).toMatchObject({ durum: 'onaylandi', yayinKipi: 'gercek', onay: { rol: 'musteri' } });
    expect(kuyruk.planEkle).toHaveBeenCalledWith(id, 'onay', false);
    const [p] = await h.q<{ onaylanan_ozet: string; onay_denetim_id: string | null }>('SELECT onaylanan_ozet, onay_denetim_id::text FROM pilot_planlari WHERE id = $1', [id]);
    expect(p!.onaylanan_ozet).toBe(m.plan.icerikOzeti);
    expect(p!.onay_denetim_id).not.toBeNull();
    // Aynı sürüm ikinci kez onaylanamaz (G-06).
    await expect(svc.onayla(MUSTERI, id, { surum: 1, icerikOzeti: m.plan.icerikOzeti }, SIMDI)).rejects.toThrow(/onaylanamıyor/);
  });

  it('KRİTİK: uyum ENGEL varken müşteriye GÖNDERİLEMEZ (sektör beyanı yok)', async () => {
    await h.q(`UPDATE client_profiles SET sektor = NULL WHERE client_id = $1`, [IDS.client]);
    const { id } = await hazirla();
    const d = await svc.detay(AJANS, id, SIMDI);
    expect(d.uyum?.durum).toBe('engel');
    expect(d.yapilabilir).not.toContain('musteriye_gonder');
    await expect(svc.eylem(AJANS, id, { eylem: 'musteriye_gonder', surum: 1 }, SIMDI)).rejects.toThrow(/gönderilemez/);
  });

  it('KRİTİK: ajans müşteri adına onaylarken gerekçe zorunlu; kayıt ajans rolüyle', async () => {
    const { id } = await hazirla();
    await svc.eylem(AJANS, id, { eylem: 'musteriye_gonder', surum: 1 }, SIMDI);
    const oz = (await svc.detay(AJANS, id, SIMDI)).plan.icerikOzeti;
    await expect(svc.onayla(AJANS, id, { surum: 1, icerikOzeti: oz, musteriAdinaGerekce: 'tamam' }, SIMDI)).rejects.toThrow(/onaylanamaz/);
    const o = await svc.onayla(AJANS, id, { surum: 1, icerikOzeti: oz, musteriAdinaGerekce: 'Müşteri telefonda onay verdi, 7 Ekim 10:30' }, SIMDI);
    expect(o.plan.onay).toMatchObject({ rol: 'ajans', gerekce: 'Müşteri telefonda onay verdi, 7 Ekim 10:30' });
  });

  it('KRİTİK: gönderildikten sonra uyum bozulursa onaylanamaz; müşteriye uyum ayrıntısı gitmez', async () => {
    const { id } = await hazirla();
    await svc.eylem(AJANS, id, { eylem: 'musteriye_gonder', surum: 1 }, SIMDI);
    // Gönderildikten SONRA sektör silindi: taze denetim ENGEL.
    await h.q(`UPDATE client_profiles SET sektor = NULL WHERE client_id = $1`, [IDS.client]);
    const m = await svc.detay(MUSTERI, id, SIMDI);
    expect(m.yapilabilir).not.toContain('onayla');
    try {
      await svc.onayla(MUSTERI, id, { surum: 1, icerikOzeti: m.plan.icerikOzeti }, SIMDI);
      throw new Error('onay geçmemeliydi');
    } catch (e) {
      // Gerçek 409'u filtreden geçir: panele giden gövdede `retler` olmalı.
      const json = vi.fn();
      const host = { switchToHttp: () => ({ getResponse: () => ({ status: () => ({ json }) }), getRequest: () => ({ method: 'POST', originalUrl: '/pilot', requestId: 'r' }) }) } as unknown as ArgumentsHost;
      new AllExceptionsFilter().catch(e, host);
      const govde = json.mock.calls[0]![0] as { statusCode: number; retler?: Array<{ kod: string; mesaj: string }> };
      expect(govde.statusCode).toBe(409);
      expect(govde.retler?.map((r) => r.kod)).toContain('UYUM_ENGEL');
      expect(JSON.stringify(govde)).not.toMatch(/GNL-18|sektör/i);
    }
  });

  it('müşteri değişiklik ister: not zorunlu alan şemada, plan taslağa döner; ajans değişiklik isteyemez', async () => {
    const { id } = await hazirla();
    await svc.eylem(AJANS, id, { eylem: 'musteriye_gonder', surum: 1 }, SIMDI);
    await expect(svc.degisiklikIste(AJANS, id, { surum: 1, not: 'x' }, SIMDI)).rejects.toThrow(/müşteri hesabından/);
    const d = await svc.degisiklikIste(MUSTERI, id, { surum: 1, not: 'Google’a daha az ayıralım' }, SIMDI);
    expect(d.plan).toMatchObject({ durum: 'taslak', musteriNotu: 'Google’a daha az ayıralım' });
  });
});

describe('gerçek yayın anahtarı', () => {
  const onayaKadar = async () => {
    const { id } = await hazirla();
    await svc.eylem(AJANS, id, { eylem: 'musteriye_gonder', surum: 1 }, SIMDI);
    const m = await svc.detay(MUSTERI, id, SIMDI);
    return { id, oz: m.plan.icerikOzeti };
  };

  it('KRİTİK: anahtar kapalı + ajansın kendi şirketi → kip TEST; ajansa söylenir, müşteriye söylenmez', async () => {
    await h.q(`UPDATE ajans_ayari SET pilot_gercek_yayin = false`);
    const { id, oz } = await onayaKadar();
    const a = await svc.detay(AJANS, id, SIMDI);
    expect(a.onayKapisi).toMatchObject({ tur: 'kabul', kip: 'test' });
    expect(a.onayKapisi?.tur === 'kabul' && a.onayKapisi.ajansNotu).toContain('anahtarı kapalı');
    const o = await svc.onayla(MUSTERI, id, { surum: 1, icerikOzeti: oz }, SIMDI);
    expect(o.plan.yayinKipi).toBe('test');
    expect(JSON.stringify(o.musteriOzeti)).not.toContain('anahtar');
  });

  it('KRİTİK: anahtar sonradan açılırsa "Şimdi kur" planı gerçeğe geçirir; kapalıyken geçiremez', async () => {
    await h.q(`UPDATE ajans_ayari SET pilot_gercek_yayin = false`);
    const { id, oz } = await onayaKadar();
    await svc.onayla(MUSTERI, id, { surum: 1, icerikOzeti: oz }, SIMDI);
    await h.q(`UPDATE pilot_planlari SET durum = 'kismen_kuruldu' WHERE id = $1`, [id]);
    await svc.eylem(AJANS, id, { eylem: 'yeniden_dene', surum: 1 }, SIMDI);
    expect((await svc.detay(AJANS, id, SIMDI)).plan.yayinKipi).toBe('test');
    await h.q(`UPDATE pilot_planlari SET durum = 'kismen_kuruldu' WHERE id = $1`, [id]);
    await h.q(`UPDATE ajans_ayari SET pilot_gercek_yayin = true`);
    await svc.eylem(AJANS, id, { eylem: 'yeniden_dene', surum: 1 }, SIMDI);
    expect((await svc.detay(AJANS, id, SIMDI)).plan.yayinKipi).toBe('gercek');
    expect(kuyruk.planEkle).toHaveBeenLastCalledWith(id, expect.stringMatching(/^yd/), true);
  });
});

describe('uyum işareti', () => {
  it('KRİTİK: işaretsiz UYARI gönderimi kapatır; ajans işaretleyince açılır', async () => {
    await h.q(`UPDATE audience_templates SET name = 'Garanti müşteriler' WHERE id = $1`, [KITLE]);
    const { id } = await hazirla();
    const d = await svc.detay(AJANS, id, SIMDI);
    expect(d.uyum?.durum).toBe('uyari_isaret_bekliyor');
    expect(d.yapilabilir).toContain('uyum_isaret');
    expect(d.yapilabilir).not.toContain('musteriye_gonder');
    const b = d.uyum!.bulgular.find((x) => x.seviye === 'UYARI')!;
    await expect(svc.uyumIsaret(AJANS, id, { surum: 1, kuralKimligi: b.kuralKimligi, mesaj: 'eski metin' }, SIMDI)).rejects.toThrow(/metni değişti/);
    const s = await svc.uyumIsaret(AJANS, id, { surum: 1, kuralKimligi: b.kuralKimligi, mesaj: b.mesaj }, SIMDI);
    expect(s.uyum?.durum).toBe('gecti');
    expect(s.yapilabilir).toContain('musteriye_gonder');
  });
});

describe('yapılabilir eylemler', () => {
  const izin = [...resolvePermissions('admin')];
  it('müşteri yalnız onaylar ve değişiklik ister; yazma eylemi hiç çıkmaz', () => {
    const e = yapilabilirEylemler({ durum: 'musteride', rol: 'musteri', izinler: [...resolvePermissions('client_viewer')], gonderilebilir: true, isaretBekleyen: true, onaylanabilir: true });
    expect(e.sort()).toEqual(['degisiklik_iste', 'onayla']);
  });
  it('kısmen kurulmuş planda ajans yeniden dener ya da kapatır', () => {
    expect(yapilabilirEylemler({ durum: 'kismen_kuruldu', rol: 'ajans', izinler: izin, gonderilebilir: false, isaretBekleyen: false, onaylanabilir: false }).sort()).toEqual(['kapat', 'yeniden_dene']);
  });
});
