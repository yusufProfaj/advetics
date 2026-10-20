import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resolvePermissions, V1_AKTARIM_KAPALI_SEBEBI, type Permission, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppConfig } from '../../config/configuration';
import { StratejiService, medyaPlaniDosyaAdi, yapilabilirEylemler } from './strateji.service';
import type { StratejiKelimeKuyrugu } from './kelime-kuyrugu';

/**
 * ═══ AJAN 4 — ADVSTRATEGY İKİNCİ TUR KAPISI (aktarım, PDF, gruplama) ═══
 *
 * `aktarim.spec.ts` ve `medya-plani-pdf.spec.ts`in bakmadığı yerler:
 * başka workspace'in planıyla aktarım ve PDF, eşzamanlı iki aktarım,
 * matrise doğrudan sokulmuş YABANCI varlığın hazır medyaya sızması,
 * müşteri hesabının aktarım düğmesi, dosya adı başlık enjeksiyonu,
 * yazı tipinin çizemediği karakter (emoji) ve büyük plan.
 *
 * Harness RLS'i KAPALI kuruyor: izolasyon iddiaları servisin ikinci kapısını
 * (ctx.clientIds) sınıyor; RLS strateji-rls*.spec.ts'te.
 */
let h: Harness;
let svc: StratejiService;

const OTEKI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KITLE = '77777777-0000-4000-8000-000000000001';
const V1 = '88888888-0000-4000-8000-000000000001';
const V_OTEKI = '88888888-0000-4000-8000-0000000000b1';

const izinli = (rol: 'admin' | 'ad_manager' | 'client_viewer', clientIds: string[] = [IDS.client, OTEKI]) =>
  ({
    orgId: IDS.org,
    userId: IDS.user,
    clientIds,
    activeClientId: clientIds[0],
    isOrgAdmin: rol === 'admin',
    tumSirketler: false,
    role: rol,
    permissions: [...resolvePermissions(rol)],
  }) as unknown as TenantContext;

const AJANS = izinli('admin');
const DAR = izinli('ad_manager', [IDS.client]);

const CONFIG = {
  yapayZeka: { model: 'gemini-test' },
  uploads: { dir: '/tmp' },
  platforms: { meta: { apiVersion: 'v25.0' } },
} as unknown as AppConfig;

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  svc = new StratejiService(prisma, { ekle: async () => undefined } as unknown as StratejiKelimeKuyrugu, CONFIG);
}, 60_000);
afterAll(async () => h?.close());
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öteki', 'oteki', now())`, [OTEKI, IDS.org]);
  await h.q(
    `INSERT INTO audience_templates (id, org_id, client_id, name, platform, updated_at) VALUES ($1, $2, $3, 'İzmir kadın', 'meta', now())`,
    [KITLE, IDS.org, IDS.client],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $3, $4, 'Kare', 'a.jpg', 'image/jpeg', 1, 1080, 1080, 'k/a', 'aaaaaaaaaaaaaaaa1', now()),
            ($2, $3, $5, 'Ötekinin', 'b.jpg', 'image/jpeg', 1, 1080, 1080, 'k/b', 'aaaaaaaaaaaaaaaa2', now())`,
    [V1, V_OTEKI, IDS.org, IDS.client, OTEKI],
  );
});

async function onayliPlan(not?: string): Promise<string> {
  const d = await svc.olustur(AJANS, { clientId: IDS.client, donem: '2026-11', toplamButce: '100.000', paraBirimi: 'TRY', not });
  await svc.dagilimKaydet(AJANS, d.plan.id, { surum: 1, satirlar: [{ platform: 'meta', katman: 'soguk', tutar: '50.000' }] });
  await svc.matrisKaydet(AJANS, d.plan.id, {
    surum: 2,
    satirlar: [
      { platform: 'meta', katman: 'soguk', niyet: 'FORM', kitleSablonuId: KITLE, kelimeGrubu: null, varlikIdleri: [V1], tutar: '10.000' },
      { platform: 'meta', katman: 'soguk', niyet: 'FORM', kitleSablonuId: KITLE, kelimeGrubu: null, varlikIdleri: [], tutar: '5.000' },
    ],
  });
  await svc.eylem(AJANS, d.plan.id, { eylem: 'onaya_gonder', surum: 3 });
  await svc.onayla(AJANS, d.plan.id, 3);
  return d.plan.id;
}

const oturumSayisi = async () => (await h.q<{ n: number }>('SELECT count(*)::int AS n FROM adv_oturum'))[0]!.n;

/*
 * AKTARIM 2026-10-13'TEN BERİ KAPALI (`V1_AKTARIM_KAPALI_SEBEBI`): eski
 * yol `adv_oturum`a yazıyordu ve okuyan ekran yoktu. Burada duran izolasyon,
 * eşzamanlılık ve hazır metin testleri o ölü yolu sınıyordu; kapı kapalıyken
 * tek iddia: hiçbir rolde, hiçbir planda oturum açılmaz. Ayrıntı aktarim.spec.ts.
 */
describe('aktarım — kapalı', () => {
  it('KRİTİK: başka workspace’in planı, müşteri hesabı ve eşzamanlı iki istek: hiçbiri oturum açmaz', async () => {
    const id = await onayliPlan();
    const r = await Promise.allSettled([
      svc.eylem(AJANS, id, { eylem: 'aktar', surum: 3 }),
      svc.eylem(AJANS, id, { eylem: 'aktar', surum: 3 }),
      svc.eylem(izinli('client_viewer'), id, { eylem: 'aktar', surum: 3 }),
      svc.eylem(DAR, id, { eylem: 'aktar', surum: 3 }),
    ]);
    for (const x of r) expect(x).toMatchObject({ status: 'rejected', reason: { message: V1_AKTARIM_KAPALI_SEBEBI } });
    expect(await oturumSayisi()).toBe(0);
    expect(yapilabilirEylemler('onaylandi', [...resolvePermissions('client_viewer')])).not.toContain('aktar');
  });
});

describe('PDF', () => {
  it('KRİTİK: başka workspace’in planı 404; müşteri hesabı kendi planını indirir', async () => {
    const id = await onayliPlan();
    const p = await svc.pdf(izinli('client_viewer', [IDS.client]), id);
    expect(p.bayt.subarray(0, 5).toString()).toBe('%PDF-');
    await expect(svc.pdf(izinli('client_viewer', [OTEKI]), id)).rejects.toMatchObject({ status: 404 });
  });

  it('KRİTİK: dosya adı başlığa tırnak, satır sonu ya da Türkçe/Unicode sızdırmaz', () => {
    const ad = medyaPlaniDosyaAdi('x"\r\nSet-Cookie: a=b;ğüş/..\\', '2026-11', 3, 'onaylandi');
    expect(ad).toMatch(/^[a-z0-9.-]+$/);
    expect(medyaPlaniDosyaAdi('"""', '2026-11', 1, 'taslak')).toBe('medya-plani-workspace-2026-11-s1-taslak.pdf');
  });

  it('KRİTİK: yazı tipinin çizemediği karakter (emoji, CJK) PDF üretimini düşürmez', async () => {
    const d = await svc.olustur(AJANS, { clientId: IDS.client, donem: '2026-11', toplamButce: '1.000', not: 'Kampanya 🚀 başlıyor · 春' });
    await h.q(`UPDATE audience_templates SET name = 'Kadın 👩 25-44' WHERE id = $1`, [KITLE]);
    await h.q(`UPDATE clients SET name = 'Kafe ☕ Şube' WHERE id = $1`, [IDS.client]);
    await svc.dagilimKaydet(AJANS, d.plan.id, { surum: 1, satirlar: [{ platform: 'meta', katman: 'soguk', tutar: '500' }] });
    await svc.matrisKaydet(AJANS, d.plan.id, {
      surum: 2,
      satirlar: [{ platform: 'meta', katman: 'soguk', niyet: 'FORM', kitleSablonuId: KITLE, kelimeGrubu: null, varlikIdleri: [], tutar: '100', not: '🔥' }],
    });
    await h.q(
      `INSERT INTO strateji_kelimeleri (plan_id, org_id, client_id, kelime, aylik_arama, grup, secili, cekim_zamani, kaynak_istek)
       VALUES ($1, $2, $3, 'kahve ☕', 1000, 'kahve 😀', true, now(), '{}')`,
      [d.plan.id, IDS.org, IDS.client],
    );
    const p = await svc.pdf(AJANS, d.plan.id);
    expect(p.bayt.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('büyük plan: 30 matris satırı + 1.000 seçili kelime makul sürede ve boyutta üretilir', async () => {
    const d = await svc.olustur(AJANS, { clientId: IDS.client, donem: '2026-11', toplamButce: '1.000.000' });
    await svc.dagilimKaydet(AJANS, d.plan.id, { surum: 1, satirlar: [{ platform: 'meta', katman: 'soguk', tutar: '300.000' }] });
    await svc.matrisKaydet(AJANS, d.plan.id, {
      surum: 2,
      satirlar: Array.from({ length: 30 }, () => ({
        platform: 'meta' as const, katman: 'soguk' as const, niyet: 'FORM' as const, kitleSablonuId: KITLE,
        kelimeGrubu: null, varlikIdleri: [V1], tutar: '1.000', not: 'ö'.repeat(500),
      })),
    });
    await h.q(
      `INSERT INTO strateji_kelimeleri (plan_id, org_id, client_id, kelime, aylik_arama, grup, secili, cekim_zamani, kaynak_istek)
       SELECT $1, $2, $3, 'kelime ' || g || ' ' || repeat('ş', 60), g, 'grup ' || (g % 40), true, now(), '{}'
         FROM generate_series(1, 1000) g`,
      [d.plan.id, IDS.org, IDS.client],
    );
    const bas = Date.now();
    const p = await svc.pdf(AJANS, d.plan.id);
    const sure = Date.now() - bas;
    /*
     * EŞİK DUVAR SAATİ VE PAYLAŞIMLI MAKİNEDE ÖLÇÜLÜYOR. Yerelde ~2,4 sn;
     * GitHub doğrulamasında bütün paket paralel koşarken 15,19 sn ölçüldü
     * (0b2ad76, 2026-10-09) ve 15 sn eşiği PDF koduna dokunmayan bir commit'i
     * kırmızıya boyayıp deploy'u kilitledi. Testin işi PATOLOJİK yavaşlığı
     * (satır başına yeniden ölçüm, ikinci dereceden döngü) yakalamak; o
     * dakikalar sürer, 45 sn onu hâlâ yakalıyor ve makine gürültüsünden
     * etkilenmiyor.
     */
    expect(sure).toBeLessThan(45_000);
    expect(p.bayt.byteLength).toBeLessThan(5 * 1024 * 1024);
  }, 90_000);
});

describe('gruplama', () => {
  it('KRİTİK: elle grubu temizlenen satır otomatiğe döner; elle grup kalıcı işaretli', async () => {
    const d = await svc.olustur(AJANS, { clientId: IDS.client, donem: '2026-11', toplamButce: '1.000' });
    const [k] = await h.q<{ id: string }>(
      `INSERT INTO strateji_kelimeleri (plan_id, org_id, client_id, kelime, grup, cekim_zamani, kaynak_istek)
       VALUES ($1, $2, $3, 'filtre kahve', 'kahve', now(), '{}') RETURNING id::text`,
      [d.plan.id, IDS.org, IDS.client],
    );
    const a = await svc.kelimeGuncelle(AJANS, d.plan.id, { surum: 1, satirlar: [{ id: k!.id, grup: 'Benim grubum' }] });
    expect(a.kelimeler.satirlar[0]).toMatchObject({ grup: 'Benim grubum', grupElle: true });
    const b = await svc.kelimeGuncelle(AJANS, d.plan.id, { surum: 2, satirlar: [{ id: k!.id, grup: null }] });
    expect(b.kelimeler.satirlar[0]).toMatchObject({ grup: null, grupElle: false });
    const c = await svc.kelimeGuncelle(AJANS, d.plan.id, { surum: 3, satirlar: [{ id: k!.id, secili: true }] });
    expect(c.kelimeler.satirlar[0]).toMatchObject({ grupElle: false, secili: true });
  });
});
