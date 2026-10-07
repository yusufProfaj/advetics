import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePermissions, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { StratejiService, yapilabilirEylemler, onayRolu } from './strateji.service';
import type { StratejiKelimeKuyrugu } from './kelime-kuyrugu';
import { oneriHesapla, oneriPenceresi, kaynakBelirle } from './dagilim-oneri';

/**
 * AdvStrategy servisi — gerçek şema (PGlite), üretim migration'larından.
 * RLS burada KAPALI (worker rolü taklidi); politikalar `strateji-rls.spec.ts`te.
 */
let h: Harness;
let svc: StratejiService;
const kuyrukEkle = vi.fn<(is: { planId: string; tohumlar: string[] }) => Promise<void>>();

const OTEKI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GOOGLE = '44444444-0000-4000-8000-0000000000aa';
const KITLE_A = '77777777-0000-4000-8000-000000000001';
const KITLE_B = '77777777-0000-4000-8000-000000000002';
const VARLIK_A = '88888888-0000-4000-8000-000000000001';
const VARLIK_B = '88888888-0000-4000-8000-000000000002';

const AJANS = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, OTEKI],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  role: 'admin',
  permissions: [...resolvePermissions('admin')],
} as unknown as TenantContext;
const MUSTERI = {
  ...AJANS,
  isOrgAdmin: false,
  role: 'client_viewer',
  permissions: [...resolvePermissions('client_viewer')],
} as unknown as TenantContext;

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  svc = new StratejiService(prisma, { ekle: kuyrukEkle } as unknown as StratejiKelimeKuyrugu);
}, 60_000);
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  kuyrukEkle.mockReset();
  kuyrukEkle.mockResolvedValue(undefined);
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öteki', 'oteki', now())`, [OTEKI, IDS.org]);
  await h.q(
    `INSERT INTO audience_templates (id, org_id, client_id, name, updated_at)
     VALUES ($1, $3, $4, 'A kitlesi', now()), ($2, $3, $5, 'B kitlesi', now())`,
    [KITLE_A, KITLE_B, IDS.org, IDS.client, OTEKI],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $3, $4, 'A görseli', 'a.jpg', 'image/jpeg', 1, 1080, 1080, 'k/a', 'aaaaaaaaaaaaaaaa1', now()),
            ($2, $3, $5, 'B görseli', 'b.jpg', 'image/jpeg', 1, 1080, 1080, 'k/b', 'aaaaaaaaaaaaaaaa2', now())`,
    [VARLIK_A, VARLIK_B, IDS.org, IDS.client, OTEKI],
  );
});

const planAc = (ctx = AJANS, donem = '2026-11', toplamButce = '100.000') =>
  svc.olustur(ctx, { clientId: IDS.client, donem, toplamButce });

async function googleHesabiEkle(): Promise<void> {
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, 'google', '1234567890', 'G', 'TRY', 'Europe/Istanbul', true, now())`,
    [GOOGLE, IDS.org, IDS.client, IDS.connection],
  );
}

async function metrik(hesap: string, platform: 'meta' | 'google', tarih: string, harcamaTl: number, donusum: number, seviye = 'campaign') {
  await h.q(
    `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date,
                                 spend_micros, conversions, currency)
     VALUES ($1, $2, $3, $4, gen_random_uuid(), 'x', $5, $6, $7, 'TRY')`,
    [IDS.client, hesap, platform, seviye, tarih, BigInt(harcamaTl) * 1_000_000n, donusum],
  );
}

describe('plan açma', () => {
  it('taslak + sürüm 1; para birimi workspace hesaplarından; org_id HEDEF MÜŞTERİDEN', async () => {
    const d = await planAc();
    expect(d.plan).toMatchObject({ durum: 'taslak', surum: 1, paraBirimi: 'TRY', toplamButceMicros: '100000000000', dagitilanMicros: '0' });
    const [r] = await h.q<{ org_id: string }>('SELECT org_id::text FROM strateji_planlari WHERE id = $1', [d.plan.id]);
    expect(r!.org_id).toBe(IDS.org);
  });

  it('KRİTİK: hesaplar karışık para birimi taşıyorsa ret; birim verilirse kabul', async () => {
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
       VALUES ($1, $2, $3, $4, 'google', '99', 'G', 'USD', 'Europe/Istanbul', now())`,
      [GOOGLE, IDS.org, IDS.client, IDS.connection],
    );
    await expect(planAc()).rejects.toThrow(/farklı para birimleri.*TRY, USD/);
    const d = await svc.olustur(AJANS, { clientId: IDS.client, donem: '2026-11', toplamButce: '1.000', paraBirimi: 'USD' });
    expect(d.plan.paraBirimi).toBe('USD');
  });

  it('hesabı olmayan workspace: para birimi verilmezse nedeniyle ret', async () => {
    await expect(svc.olustur(AJANS, { clientId: OTEKI, donem: '2026-11', toplamButce: '1.000' })).rejects.toThrow(/hesabı yok/);
  });

  it('KRİTİK: aynı ay için ikinci açık plan 409; iptal edilen ay yeniden açılır', async () => {
    const d = await planAc();
    await expect(planAc()).rejects.toMatchObject({ status: 409 });
    await svc.eylem(AJANS, d.plan.id, { eylem: 'iptal', surum: d.plan.surum });
    const yeni = await planAc();
    expect(yeni.plan.id).not.toBe(d.plan.id);
  });

  it('KRİTİK: kısmi tekil indeks servisten bağımsız da tutar; son durumlar ayı engellemez', async () => {
    // Servisin ön kontrolü yarışta iki isteği birden geçirebilir; son kapı indeks.
    const ekle = (durum: string) =>
      h.q(
        `INSERT INTO strateji_planlari (org_id, client_id, donem, durum, toplam_butce_micros, para_birimi, onay_rolu, onay_zamani, onaylanan_surum)
         VALUES ($1, $2, '2026-11', $3, 1, 'TRY', 'ajans', now(), 1)`,
        [IDS.org, IDS.client, durum],
      );
    await ekle('iptal');
    await ekle('aktarildi');
    await ekle('onaylandi');
    await expect(ekle('taslak')).rejects.toThrow(/strateji_planlari_acik_donem_key/);
    await expect(ekle('onayda')).rejects.toThrow(/strateji_planlari_acik_donem_key/);
  });

  it('KRİTİK: onaylanmış plan onay izi olmadan YAZILAMAZ (CHECK)', async () => {
    await expect(
      h.q(
        `INSERT INTO strateji_planlari (org_id, client_id, donem, durum, toplam_butce_micros, para_birimi)
         VALUES ($1, $2, '2026-11', 'onaylandi', 1, 'TRY')`,
        [IDS.org, IDS.client],
      ),
    ).rejects.toThrow(/strateji_planlari_onay_izi_chk/);
  });

  it('erişimi olmayan workspace reddedilir', async () => {
    const dar = { ...AJANS, clientIds: [IDS.client] } as TenantContext;
    await expect(svc.olustur(dar, { clientId: OTEKI, donem: '2026-11', toplamButce: '1', paraBirimi: 'TRY' })).rejects.toMatchObject({ status: 403 });
  });

  it('liste: dönem azalan, toplam ayrıca', async () => {
    await planAc(AJANS, '2026-11');
    await planAc(AJANS, '2026-12');
    const l = await svc.listele(AJANS, IDS.client);
    expect(l.planlar.map((p) => p.donem)).toEqual(['2026-12', '2026-11']);
    expect(l.toplam).toBe(2);
  });
});

describe('durum makinesi ve sürüm koruması', () => {
  it('KRİTİK: bayat sürümle yazım 409; başarılı yazım sürümü artırır', async () => {
    const d = await planAc();
    const a = await svc.dagilimKaydet(AJANS, d.plan.id, { surum: 1, satirlar: [{ platform: 'meta', katman: 'soguk', tutar: '50.000' }] });
    expect(a.plan.surum).toBe(2);
    await expect(
      svc.dagilimKaydet(AJANS, d.plan.id, { surum: 1, satirlar: [{ platform: 'meta', katman: 'soguk', tutar: '40.000' }] }),
    ).rejects.toMatchObject({ status: 409 });
    const [r] = await h.q<{ tutar_micros: string }>('SELECT tutar_micros::text FROM strateji_dagilimlari WHERE plan_id = $1', [d.plan.id]);
    expect(r!.tutar_micros).toBe('50000000000');
  });

  it('KRİTİK: onaydaki plan düzenlenemez; geri çekince sürüm artar ve düzenlenir', async () => {
    const d = await planAc();
    const o = await svc.eylem(AJANS, d.plan.id, { eylem: 'onaya_gonder', surum: 1 });
    expect(o.plan).toMatchObject({ durum: 'onayda', surum: 1 });
    await expect(
      svc.matrisKaydet(AJANS, d.plan.id, { surum: 1, satirlar: [] }),
    ).rejects.toThrow(/geri çekin/);
    const g = await svc.eylem(AJANS, d.plan.id, { eylem: 'geri_cek', surum: 1 });
    expect(g.plan).toMatchObject({ durum: 'taslak', surum: 2 });
  });

  it('geçiş tablosu dışı eylem 409; aktarım bu turda açık mesajla 400', async () => {
    const d = await planAc();
    await expect(svc.eylem(AJANS, d.plan.id, { eylem: 'geri_cek', surum: 1 })).rejects.toMatchObject({ status: 409 });
    await expect(svc.eylem(AJANS, d.plan.id, { eylem: 'aktar', surum: 1 })).rejects.toThrow('Aktarım henüz kurulmadı.');
  });

  it('KRİTİK: onay rolü kaydedilir (client_viewer → musteri) ve onaylanan sürüm basılır', async () => {
    const d = await planAc();
    await svc.dagilimKaydet(AJANS, d.plan.id, { surum: 1, satirlar: [{ platform: 'meta', katman: 'soguk', tutar: '10.000' }] });
    await svc.eylem(AJANS, d.plan.id, { eylem: 'onaya_gonder', surum: 2 });
    await expect(svc.onayla(MUSTERI, d.plan.id, 1)).rejects.toMatchObject({ status: 409 });
    const o = await svc.onayla(MUSTERI, d.plan.id, 2);
    expect(o.plan.durum).toBe('onaylandi');
    expect(o.plan.onaylayan).toMatchObject({ userId: IDS.user, rol: 'musteri', ad: 'Test Kullanıcı' });
    const [r] = await h.q<{ onaylanan_surum: number }>('SELECT onaylanan_surum FROM strateji_planlari WHERE id = $1', [d.plan.id]);
    expect(r!.onaylanan_surum).toBe(2);
    expect(onayRolu({ role: 'admin' })).toBe('ajans');
    expect(onayRolu({ role: 'ad_manager' })).toBe('ajans');
  });

  it('yapilabilir = durum × izin; aktarım hiç listelenmez; müşteri hesabı yalnız onaylar', () => {
    const yaz = [...resolvePermissions('admin')];
    expect(yapilabilirEylemler('taslak', yaz)).toEqual(['onaya_gonder', 'iptal']);
    expect(yapilabilirEylemler('onayda', yaz)).toEqual(['geri_cek', 'onayla', 'iptal']);
    expect(yapilabilirEylemler('onaylandi', yaz)).toEqual(['iptal']);
    expect(yapilabilirEylemler('onayda', [...resolvePermissions('client_viewer')])).toEqual(['onayla']);
    expect(yapilabilirEylemler('aktarildi', yaz)).toEqual([]);
  });

  it('detay yanıtı yapilabilir listesini kullanıcının izninden üretir', async () => {
    const d = await planAc();
    expect((await svc.detay(MUSTERI, d.plan.id)).yapilabilir).toEqual([]);
    expect((await svc.detay(AJANS, d.plan.id)).yapilabilir).toEqual(['onaya_gonder', 'iptal']);
  });
});

describe('dağılım', () => {
  it('toplamı aşan dağılım reddedilir; sıfır tutar kabul', async () => {
    const d = await planAc();
    await expect(
      svc.dagilimKaydet(AJANS, d.plan.id, {
        surum: 1,
        satirlar: [
          { platform: 'meta', katman: 'soguk', tutar: '60.000' },
          { platform: 'google', katman: 'soguk', tutar: '40.000,01' },
        ],
      }),
    ).rejects.toThrow(/0,01 TRY aşıyor/);
    const ok = await svc.dagilimKaydet(AJANS, d.plan.id, { surum: 1, satirlar: [{ platform: 'meta', katman: 'sicak', tutar: '0' }] });
    expect(ok.dagilim[0]).toMatchObject({ tutarMicros: '0', kaynak: 'elle' });
  });

  it('KRİTİK: geçmiş veriden öneri dönüşüm payıyla bölünür, kaydedilince kaynak gecmis_veri kalır', async () => {
    await googleHesabiEkle();
    const simdi = new Date('2026-10-08T10:00:00Z');
    await metrik(IDS.adAccount, 'meta', '2026-09-15', 6_000, 68);
    await metrik(GOOGLE, 'google', '2026-09-15', 4_000, 32);
    // Hesap seviyesi satırı TOPLANMAMALI: seviyeler toplanırsa harcama katlanır.
    await metrik(IDS.adAccount, 'meta', '2026-09-15', 6_000, 68, 'account');
    // Pencere dışı (91 gün önce) sayılmaz.
    await metrik(GOOGLE, 'google', '2026-07-09', 100_000, 1_000);
    const d = await planAc();
    const o = await svc.dagilimOner(AJANS, d.plan.id, simdi);
    expect(o.pencere).toEqual({ from: '2026-07-10', to: '2026-10-07' });
    expect(o.bosNedeni).toBeNull();
    expect(o.dayanak).toEqual([
      { platform: 'google', harcamaMicros: '4000000000', donusum: 32, donusumBasiMaliyetMicros: '125000000' },
      { platform: 'meta', harcamaMicros: '6000000000', donusum: 68, donusumBasiMaliyetMicros: '88235294' },
    ]);
    expect(o.satirlar!.map((s) => [s.platform, s.katman, s.tutarMicros, s.kaynak])).toEqual([
      ['google', 'soguk', '32000000000', 'gecmis_veri'],
      ['meta', 'soguk', '68000000000', 'gecmis_veri'],
    ]);
    expect(o.satirlar![1]!.gerekce).toMatch(/%68 kadarı Meta'dan/);

    const k = await svc.dagilimKaydet(AJANS, d.plan.id, {
      surum: 1,
      satirlar: [
        { platform: 'meta', katman: 'soguk', tutar: '68.000' },
        { platform: 'google', katman: 'soguk', tutar: '30.000' },
      ],
    });
    const meta = k.dagilim.find((s) => s.platform === 'meta')!;
    const google = k.dagilim.find((s) => s.platform === 'google')!;
    expect(meta).toMatchObject({ kaynak: 'gecmis_veri' });
    expect(meta.gerekce).toMatch(/Meta'dan/);
    // Kullanıcının değiştirdiği tutar "geçmiş veriden" diye GÖSTERİLMEZ.
    expect(google).toMatchObject({ kaynak: 'elle', gerekce: null });
  });

  it('KRİTİK: yeniden öneri elle satırı ezmez; elle platforma tutar önerilmez', async () => {
    await googleHesabiEkle();
    await metrik(IDS.adAccount, 'meta', '2026-09-15', 6_000, 68);
    await metrik(GOOGLE, 'google', '2026-09-15', 4_000, 32);
    const d = await planAc();
    await svc.dagilimKaydet(AJANS, d.plan.id, { surum: 1, satirlar: [{ platform: 'google', katman: 'sicak', tutar: '10.000' }] });
    const o = await svc.dagilimOner(AJANS, d.plan.id, new Date('2026-10-08T10:00:00Z'));
    expect(o.satirlar).toEqual([
      { platform: 'google', katman: 'sicak', tutarMicros: '10000000000', kaynak: 'elle', gerekce: null },
      expect.objectContaining({ platform: 'meta', katman: 'soguk', tutarMicros: '90000000000', kaynak: 'gecmis_veri' }),
    ]);
  });

  it('boş öneri NEDENİNİ söyler: hesap_yok, veri_yok, donusum_yok, karisik_birim', async () => {
    const simdi = new Date('2026-10-08T10:00:00Z');
    const d = await planAc();
    expect((await svc.dagilimOner(AJANS, d.plan.id, simdi)).bosNedeni).toBe('veri_yok');
    await metrik(IDS.adAccount, 'meta', '2026-09-15', 6_000, 0);
    const dy = await svc.dagilimOner(AJANS, d.plan.id, simdi);
    expect(dy).toMatchObject({ bosNedeni: 'donusum_yok', satirlar: null });
    expect(dy.dayanak[0]).toMatchObject({ harcamaMicros: '6000000000', donusumBasiMaliyetMicros: null });
    await h.q('UPDATE ad_accounts SET sync_enabled = false');
    expect((await svc.dagilimOner(AJANS, d.plan.id, simdi)).bosNedeni).toBe('hesap_yok');
    await h.q(`UPDATE ad_accounts SET sync_enabled = true, currency = 'USD'`);
    expect((await svc.dagilimOner(AJANS, d.plan.id, simdi)).bosNedeni).toBe('karisik_birim');
  });

  it('saf hesap: yuvarlama en küçük birime, artan en büyük paya; toplam TAM', () => {
    const r = oneriHesapla({
      toplamMicros: 100_000_000n, // 100 TRY
      paraBirimi: 'TRY',
      mevcut: [],
      dayanak: [
        { platform: 'meta', harcamaMicros: 1n, donusum: 1 },
        { platform: 'google', harcamaMicros: 1n, donusum: 2 },
      ],
    });
    const tutarlar = r.satirlar!.map((s) => BigInt(s.tutarMicros));
    expect(tutarlar.reduce((a, b) => a + b, 0n)).toBe(100_000_000n);
    for (const t of tutarlar) expect(t % 10_000n).toBe(0n);
    expect(r.satirlar!.find((s) => s.platform === 'google')!.tutarMicros).toBe('66670000');
  });

  it('pencere İstanbul takvimiyle dünden geriye 90 gün', () => {
    // UTC 22:30 = İstanbul'da ertesi gün 01:30.
    expect(oneriPenceresi(new Date('2026-10-07T22:30:00Z'))).toEqual({ from: '2026-07-10', to: '2026-10-07' });
  });

  it('kaynakBelirle: kuruşu kuruşuna aynı olmayan tutar elle', () => {
    const oneri = [{ platform: 'meta' as const, katman: 'soguk' as const, tutarMicros: '5000000', kaynak: 'gecmis_veri' as const, gerekce: 'g' }];
    expect(kaynakBelirle({ platform: 'meta', katman: 'soguk', tutarMicros: 5_000_000n }, oneri, [])).toEqual({ kaynak: 'gecmis_veri', gerekce: 'g' });
    expect(kaynakBelirle({ platform: 'meta', katman: 'soguk', tutarMicros: 5_000_001n }, oneri, [])).toEqual({ kaynak: 'elle', gerekce: null });
    expect(kaynakBelirle({ platform: 'meta', katman: 'sicak', tutarMicros: 5_000_000n }, oneri, [])).toEqual({ kaynak: 'elle', gerekce: null });
  });
});

describe('matris', () => {
  const satir = (o: Partial<Parameters<StratejiService['matrisKaydet']>[2]['satirlar'][number]> = {}) => ({
    platform: 'meta' as const,
    katman: 'soguk' as const,
    niyet: 'FORM' as const,
    kitleSablonuId: KITLE_A,
    kelimeGrubu: null,
    varlikIdleri: [VARLIK_A],
    tutar: '10.000',
    ...o,
  });

  async function dagitilmisPlan() {
    const d = await planAc();
    await svc.dagilimKaydet(AJANS, d.plan.id, { surum: 1, satirlar: [{ platform: 'meta', katman: 'soguk', tutar: '20.000' }] });
    return d.plan.id;
  }

  it('kaydedilir; adlar ve önizleme adresi döner', async () => {
    const id = await dagitilmisPlan();
    const d = await svc.matrisKaydet(AJANS, id, { surum: 2, satirlar: [satir()] });
    expect(d.plan.surum).toBe(3);
    expect(d.matris[0]).toMatchObject({
      kitle: { id: KITLE_A, ad: 'A kitlesi' },
      varliklar: [{ id: VARLIK_A, ad: 'A görseli', kucukResimAdresi: `/assets/${VARLIK_A}/preview` }],
      tutarMicros: '10000000000',
    });
  });

  it('KRİTİK: B workspace’inin kitle şablonu A’nın matrisine giremez', async () => {
    const id = await dagitilmisPlan();
    await expect(svc.matrisKaydet(AJANS, id, { surum: 2, satirlar: [satir({ kitleSablonuId: KITLE_B })] })).rejects.toThrow(
      /kitle şablonlarından biri bu workspace’e ait değil/,
    );
    const [n] = await h.q<{ n: number }>('SELECT count(*)::int AS n FROM strateji_matrisi');
    expect(n!.n).toBe(0);
  });

  it('KRİTİK: B workspace’inin varlığı A’nın matrisine giremez', async () => {
    const id = await dagitilmisPlan();
    await expect(svc.matrisKaydet(AJANS, id, { surum: 2, satirlar: [satir({ varlikIdleri: [VARLIK_B] })] })).rejects.toThrow(
      /görsellerden biri bu workspace’e ait değil/,
    );
  });

  it('KRİTİK: hücre bütçesini aşan matris reddedilir; dağılımda olmayan hücre SIFIR sayılır', async () => {
    const id = await dagitilmisPlan();
    await expect(
      svc.matrisKaydet(AJANS, id, { surum: 2, satirlar: [satir({ tutar: '15.000' }), satir({ tutar: '6.000' })] }),
    ).rejects.toThrow(/matris satırları 21.000 TRY, dağılımdaki bütçe 20.000 TRY/);
    await expect(svc.matrisKaydet(AJANS, id, { surum: 2, satirlar: [satir({ katman: 'sicak', tutar: '1' })] })).rejects.toThrow(
      /Etkileşim kuranlar/,
    );
  });

  it('dağılım matrisin altına çekilemez', async () => {
    const id = await dagitilmisPlan();
    await svc.matrisKaydet(AJANS, id, { surum: 2, satirlar: [satir({ tutar: '15.000' })] });
    await expect(
      svc.dagilimKaydet(AJANS, id, { surum: 3, satirlar: [{ platform: 'meta', katman: 'soguk', tutar: '10.000' }] }),
    ).rejects.toThrow(/Önce matrisi düzenleyin/);
  });

  it('silinen kitle şablonu satırı düşürmez (SET NULL)', async () => {
    const id = await dagitilmisPlan();
    await svc.matrisKaydet(AJANS, id, { surum: 2, satirlar: [satir()] });
    await h.q('DELETE FROM audience_templates WHERE id = $1', [KITLE_A]);
    await h.q('DELETE FROM assets WHERE id = $1', [VARLIK_A]);
    const d = await svc.detay(AJANS, id);
    expect(d.matris).toHaveLength(1);
    expect(d.matris[0]!.kitle).toBeNull();
    expect(d.matris[0]!.varliklar).toEqual([{ id: VARLIK_A, ad: null, kucukResimAdresi: null }]);
  });
});

describe('kelimeler', () => {
  it('KRİTİK: Google hesabı yoksa SIFIR kuyruk çağrısıyla, nedeniyle ret', async () => {
    const d = await planAc();
    await expect(svc.kelimeAra(AJANS, d.plan.id, { tohumlar: ['filtre kahve'] })).rejects.toThrow(/Google Ads hesabı yok/);
    expect(kuyrukEkle).not.toHaveBeenCalled();
    const [p] = await h.q<{ kelime_arama: string }>('SELECT kelime_arama FROM strateji_planlari');
    expect(p!.kelime_arama).toBe('bos');
  });

  it('kuyruğa alır, plan "aranıyor" der; ikinci arama 409', async () => {
    await googleHesabiEkle();
    const d = await planAc();
    const a = await svc.kelimeAra(AJANS, d.plan.id, { tohumlar: ['filtre kahve', 'filtre kahve', 'french press'] });
    expect(kuyrukEkle).toHaveBeenCalledWith({ planId: d.plan.id, tohumlar: ['filtre kahve', 'french press'] });
    expect(a.kelimeler).toMatchObject({ aramaSuruyor: true, erisim: 'var', sonHata: null });
    // Arama sürüm ARTIRMAZ (seçilmemiş fikir planın içeriği değil).
    expect(a.plan.surum).toBe(1);
    await expect(svc.kelimeAra(AJANS, d.plan.id, { tohumlar: ['x y'] })).rejects.toMatchObject({ status: 409 });
  });

  it('kuyruk düşerse plan "kuyrukta" KALMAZ: nedeniyle hata', async () => {
    await googleHesabiEkle();
    kuyrukEkle.mockRejectedValueOnce(new Error('REDIS_URL yok'));
    const d = await planAc();
    await expect(svc.kelimeAra(AJANS, d.plan.id, { tohumlar: ['kahve'] })).rejects.toMatchObject({ status: 503 });
    const k = (await svc.detay(AJANS, d.plan.id)).kelimeler;
    expect(k.aramaSuruyor).toBe(false);
    expect(k.sonHata).toMatch(/REDIS_URL yok/);
  });

  it('takılmış arama sonsuz "aranıyor" değil, nedeniyle hata', async () => {
    await googleHesabiEkle();
    const d = await planAc();
    await svc.kelimeAra(AJANS, d.plan.id, { tohumlar: ['kahve'] });
    await h.q(`UPDATE strateji_planlari SET kelime_arama_zamani = now() - interval '16 minutes'`);
    const k = (await svc.detay(AJANS, d.plan.id)).kelimeler;
    expect(k.aramaSuruyor).toBe(false);
    expect(k.sonHata).toMatch(/yanıt vermedi/);
    await svc.kelimeAra(AJANS, d.plan.id, { tohumlar: ['kahve'] });
    expect(kuyrukEkle).toHaveBeenCalledTimes(2);
  });

  it('seçim ve grup güncellenir; başka plandaki kimlik reddedilir; sürüm artar', async () => {
    const d = await planAc();
    const [k] = await h.q<{ id: string }>(
      `INSERT INTO strateji_kelimeleri (plan_id, org_id, client_id, kelime, aylik_arama, grup, cekim_zamani, kaynak_istek)
       VALUES ($1, $2, $3, 'filtre kahve', 49500, 'Kahve', now(), '{}') RETURNING id::text`,
      [d.plan.id, IDS.org, IDS.client],
    );
    const a = await svc.kelimeGuncelle(AJANS, d.plan.id, { surum: 1, satirlar: [{ id: k!.id, secili: true }] });
    expect(a.plan.surum).toBe(2);
    expect(a.kelimeler.satirlar[0]).toMatchObject({ secili: true, grup: 'Kahve', aylikArama: 49500 });
    const b = await svc.kelimeGuncelle(AJANS, d.plan.id, { surum: 2, satirlar: [{ id: k!.id, grup: null }] });
    expect(b.kelimeler.satirlar[0]).toMatchObject({ secili: true, grup: null });
    await expect(
      svc.kelimeGuncelle(AJANS, d.plan.id, { surum: 3, satirlar: [{ id: '99999999-0000-4000-8000-000000000000', secili: true }] }),
    ).rejects.toThrow(/bu planda yok/);
  });
});
