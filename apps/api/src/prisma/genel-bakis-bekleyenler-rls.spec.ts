import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolvePermissions, type BekleyenIs, type TenantContext } from '@advetics/shared';
import { createHarness, type Harness } from '../../test/pglite-harness';
import { PrismaService } from './prisma.service';
import { GenelBakisService } from '../modules/genel-bakis/genel-bakis.service';
import { BudgetsService } from '../modules/budgets/budgets.service';

/**
 * ═══ GENEL BAKIŞ BEKLEYEN İŞLER — GERÇEK POLİTİKALARLA (Ajan 4) ═══
 *
 * `genel-bakis.service.spec.ts` RLS KAPALI koşuyor: kapsamı servisin kendi
 * `client_id = ANY(...)` süzgeci taşıyor ve o test onu sınıyor. Buradaki soru
 * başka: üretimde istek `advetics_app` rolüyle ve politikalar AÇIK koşuyor;
 * dört kaynağın politikaları birbirinden FARKLI (`insights_daily` yalnızca
 * `can_access_client`, ötekiler ayrıca `org_kapsaminda`) ve `clients`
 * join'i RLS'li. Bir kaynağın sayısı politika yüzünden SESSİZCE düşerse
 * kutu "bekleyen yok" der — hata yok, log yok.
 *
 * SERVİS GERÇEK, SORGU KOPYALANMIYOR: `GenelBakisService` olduğu gibi
 * çağrılıyor ve bağlamı `PrismaService.prototype.withTenant`in KENDİSİ
 * kuruyor (aynı `set_config` dizisi). Taklit edilen tek şey transaction:
 * PGlite'ta tek oturum var, yani BEGIN → SET LOCAL ROLE → fn → COMMIT
 * sırayla koşuyor (servis dört kaynağı `Promise.all` ile açıyor; kilit
 * olmadan biri ötekinin rolünü sıfırlardı).
 */
let h: Harness;
let svc: GenelBakisService;
let butceSvc: BudgetsService;

const APP_ROLE = 'advetics_genel_bakis_rls_test';

const UST = '0a000000-0000-4000-8000-000000000001';
const UST_YABANCI = '0a000000-0000-4000-8000-000000000002';
const ORG_EV = '0b000000-0000-4000-8000-000000000001';
const ORG_KARDES = '0b000000-0000-4000-8000-000000000002';
const ORG_YABANCI = '0b000000-0000-4000-8000-000000000003';
const WS_EV = '0c000000-0000-4000-8000-000000000001';
const WS_EV2 = '0c000000-0000-4000-8000-000000000004';
const WS_KARDES = '0c000000-0000-4000-8000-000000000002';
const WS_YABANCI = '0c000000-0000-4000-8000-000000000003';
const USER = '0d000000-0000-4000-8000-000000000001';

const ORG_OF: Record<string, string> = {
  [WS_EV]: ORG_EV,
  [WS_EV2]: ORG_EV,
  [WS_KARDES]: ORG_KARDES,
  [WS_YABANCI]: ORG_YABANCI,
};
const AD_OF: Record<string, string> = {
  [WS_EV]: 'Ev WS',
  [WS_EV2]: 'Ev WS 2',
  [WS_KARDES]: 'Kardeş WS',
  [WS_YABANCI]: 'Yabancı WS',
};
/** Workspace başına sabit tohum kimlikleri: bağlantı, hesap, profil. */
const kimlik = (ws: string, n: number) => `${ws.slice(0, 33)}${n}${ws.slice(34)}`;

/** 15 Ekim: harcama kapsamı 1–14 Ekim. */
const SIMDI = new Date('2026-10-15T09:00:00Z');

/** Servisin gönderdiği SQL — "sorulmadı" iddiaları için. */
let sorgular: string[] = [];

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${APP_ROLE}`);
  for (const t of ['clients', 'auto_boost_queue_items', 'strateji_planlari', 'insights_daily', 'monthly_budgets']) {
    await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }

  let kilit: Promise<unknown> = Promise.resolve();
  const tx = {
    $queryRaw: (ilk: unknown, ...degerler: unknown[]) => {
      const sql =
        Array.isArray(ilk) && 'raw' in (ilk as object)
          ? Prisma.sql(ilk as unknown as readonly string[], ...degerler)
          : (ilk as Prisma.Sql);
      sorgular.push(sql.sql);
      return h.db.$queryRaw(sql);
    },
  };
  const sahte = {
    $transaction: <T>(fn: (t: unknown) => Promise<T>): Promise<T> => {
      const is = kilit.then(async () => {
        await h.q('BEGIN');
        await h.q(`SET LOCAL ROLE ${APP_ROLE}`);
        try {
          const r = await fn(tx);
          await h.q('COMMIT');
          return r;
        } catch (e) {
          await h.q('ROLLBACK');
          throw e;
        }
      });
      kilit = is.catch(() => undefined);
      return is;
    },
  };
  const prisma = {
    withTenant: (ctx: TenantContext, fn: (t: unknown) => Promise<unknown>) =>
      (PrismaService.prototype.withTenant as (...a: unknown[]) => Promise<unknown>).call(sahte, ctx, fn),
  } as unknown as PrismaService;
  svc = new GenelBakisService(prisma);
  butceSvc = new BudgetsService(prisma);
}, 60_000);

afterAll(async () => {
  await h.close();
});

async function tohumla(ws: string): Promise<void> {
  const org = ORG_OF[ws]!;
  const [conn, hesap, profil] = [kimlik(ws, 1), kimlik(ws, 2), kimlik(ws, 3)];
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, $3, $4, now())`, [
    ws,
    org,
    AD_OF[ws],
    `ws-${ws.slice(-4)}`,
  ]);
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, $3, 'meta', 'active', $4, 'L', '\\x00', '{}', $5, now())`,
    [conn, org, ws, `u-${ws}`, USER],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', $5, 'Hesap', 'TRY', 'Europe/Istanbul', true, now())`,
    [hesap, org, ws, conn, `act_${ws.slice(-4)}`],
  );
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'instagram_business', $5, 'Profil', now())`,
    [profil, org, ws, conn, `ig-${ws}`],
  );
  // İki onay bekleyen kart + bir `kontrol` (sayılmamalı).
  for (const [durum, zaman] of [
    ['pending', '2026-10-03T08:00:00Z'],
    ['pending', '2026-10-09T08:00:00Z'],
    ['kontrol', '2026-09-01T08:00:00Z'],
  ]) {
    await h.q(
      `INSERT INTO auto_boost_queue_items
         (id, org_id, client_id, platform, social_profile_id, external_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'meta', $3, gen_random_uuid()::text, $4, $5, now())`,
      [org, ws, profil, durum, zaman],
    );
  }
  // Bir onayda, bir onaylanmış (aktarılmamış) plan.
  await h.q(
    `INSERT INTO strateji_planlari (org_id, client_id, donem, durum, toplam_butce_micros, para_birimi, updated_at)
     VALUES ($1, $2, '2026-11', 'onayda', 1, 'TRY', '2026-10-05T08:00:00Z')`,
    [org, ws],
  );
  await h.q(
    `INSERT INTO strateji_planlari
       (org_id, client_id, donem, durum, toplam_butce_micros, para_birimi,
        onay_rolu, onay_zamani, onaylanan_surum, updated_at)
     VALUES ($1, $2, '2026-12', 'onaylandi', 1, 'TRY', 'ajans', '2026-10-06T08:00:00Z', 1, '2026-10-06T08:00:00Z')`,
    [org, ws],
  );
  // Bu ay harcama, bütçe yok.
  await h.q(
    `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date,
                                 spend_micros, currency)
     VALUES ($1, $2, 'meta', 'campaign', gen_random_uuid(), 'x', '2026-10-10', 5000000, 'TRY')`,
    [ws, hesap],
  );
}

beforeEach(async () => {
  sorgular = [];
  await h.reset();
  await h.q(
    `INSERT INTO manager_accounts (id, name, slug, updated_at)
     VALUES ($1, 'Profaj', 'profaj', now()), ($2, 'Başka Ajans', 'baska', now())`,
    [UST, UST_YABANCI],
  );
  await h.q(
    `INSERT INTO organizations (id, name, slug, manager_account_id, updated_at)
     VALUES ($1, 'Ajans', 'ajans', $4, now()),
            ($2, 'Kardeş', 'kardes', $4, now()),
            ($3, 'Yabancı', 'yabanci', $5, now())`,
    [ORG_EV, ORG_KARDES, ORG_YABANCI, UST, UST_YABANCI],
  );
  await h.q(`UPDATE manager_accounts SET ajans_org_id = $1 WHERE id = $2`, [ORG_EV, UST]);
  await h.q(
    `INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, 'a@profaj.com', 'x', 'Ajans', now())`,
    [USER, ORG_EV],
  );
  for (const ws of [WS_EV, WS_EV2, WS_KARDES, WS_YABANCI]) await tohumla(ws);
});

const ADMIN = [...resolvePermissions('admin')];

/** Ev şirketinde ajans yöneticisi — normal kip. */
const EV: TenantContext = {
  orgId: ORG_EV,
  userId: USER,
  clientIds: [WS_EV, WS_EV2],
  activeClientId: null,
  isOrgAdmin: true,
  tumSirketler: false,
  managerAccountId: UST,
  role: 'admin',
  permissions: ADMIN,
} as unknown as TenantContext;

/** "Tüm şirketler": orgId EV KALIYOR, clientIds kardeşi de taşıyor. */
const TUM: TenantContext = {
  ...EV,
  clientIds: [WS_EV, WS_EV2, WS_KARDES],
  tumSirketler: true,
} as unknown as TenantContext;

/** Ajans yöneticisi KARDEŞ şirkete geçmiş — `users.org_id` hâlâ EV. */
const KARDES: TenantContext = {
  ...EV,
  orgId: ORG_KARDES,
  clientIds: [WS_KARDES],
} as unknown as TenantContext;

/** Müşteri hesabı — tek workspace, onay yetkisi var, okuma dar. */
const MUSTERI: TenantContext = {
  ...EV,
  clientIds: [WS_EV],
  activeClientId: WS_EV,
  isOrgAdmin: false,
  role: 'client_viewer',
  permissions: [...resolvePermissions('client_viewer')],
} as unknown as TenantContext;

const ozet = (isler: BekleyenIs[]) =>
  isler
    .map((i) => `${i.tur}|${i.clientAdi}|${i.sayi}`)
    .sort()
    .join('\n');

const beklenen = (...wsler: string[]) =>
  wsler
    .flatMap((ws) => [
      `boost_onay|${AD_OF[ws]}|2`,
      `strateji_onay|${AD_OF[ws]}|1`,
      `strateji_aktar|${AD_OF[ws]}|1`,
      `butce_yok|${AD_OF[ws]}|1`,
    ])
    .sort()
    .join('\n');

describe('ön koşul: politikalar GERÇEKTEN açık', () => {
  it('KRİTİK: politikasız bağlamla tablolar boş görünüyor (rol BYPASSRLS değil)', async () => {
    // Bu düşmezse aşağıdaki "sızmıyor" iddialarının hepsi boşa yeşil.
    await h.q('BEGIN');
    await h.q(`SET LOCAL ROLE ${APP_ROLE}`);
    try {
      for (const t of ['auto_boost_queue_items', 'strateji_planlari', 'insights_daily', 'clients']) {
        const r = await h.q<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${t}`);
        expect(r[0]!.n, t).toBe(0);
      }
    } finally {
      await h.q('ROLLBACK');
    }
  });
});

describe('kiracı izolasyonu — gerçek servis, gerçek politika', () => {
  it('KRİTİK: ev şirketi, tüm workspace kipi: yalnız kendi iki workspace’i, dört tür, sayılar tam', async () => {
    const y = await svc.bekleyenler(EV, {}, SIMDI);
    expect(y.hatalar).toEqual([]);
    expect(ozet(y.isler)).toBe(beklenen(WS_EV, WS_EV2));
    expect(y.toplam).toBe(8);
  });

  it('KRİTİK: başka şirketin workspace’i istenirse 403 ve HİÇBİR sorgu koşmuyor', async () => {
    await expect(svc.bekleyenler(EV, { clientId: WS_YABANCI }, SIMDI)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.bekleyenler(EV, { clientId: WS_KARDES }, SIMDI)).rejects.toBeInstanceOf(ForbiddenException);
    expect(sorgular).toEqual([]);
  });

  it('KRİTİK: tek workspace istenince öteki workspace’in satırı gelmiyor', async () => {
    const y = await svc.bekleyenler({ ...EV, activeClientId: WS_EV2 } as TenantContext, { clientId: WS_EV }, SIMDI);
    expect(ozet(y.isler)).toBe(beklenen(WS_EV));
  });

  it('KRİTİK: eski seçim (activeClientId) "tüm workspace’ler" isteğini tek workspace’e İNDİRMİYOR', async () => {
    // RLS'te seçili workspace görüş alanını daraltıyor; servis bağlamı
    // isteğin kapsamına eşitlemezse WS_EV2 sessizce kaybolur.
    const y = await svc.bekleyenler({ ...EV, activeClientId: WS_EV } as TenantContext, {}, SIMDI);
    expect(ozet(y.isler)).toBe(beklenen(WS_EV, WS_EV2));
  });

  it('SAVUNMA: servis kapısı aşılsa bile (clientIds sahte) yabancı şirketin boost/plan satırı politikada kalıyor', async () => {
    /*
     * `ctx.clientIds` sunucuda kuruluyor, istemci yazamıyor; bu bağlam
     * GERÇEKÇİ DEĞİL, son savunma hattını ölçüyor. `org_kapsaminda` taşıyan
     * üç kaynak yabancı satırı vermiyor. `insights_daily` politikası yalnız
     * `can_access_client` (org yok — `insights-kiraci-izolasyonu-rls.spec.ts`
     * bilinen durum) ve bütçe NOT EXISTS'i yabancı bütçeyi göremediği için
     * `butce_yok` satırı ADSIZ olarak çıkıyor: sayıyı değil yalnızca "bu
     * workspace'in bu ay harcaması var" bilgisini taşıyor.
     */
    /*
     * Ayrıca org'u workspace'inden FARKLI bir kart (kuyrukta bileşik yabancı
     * anahtar yok): politika kartı gösteriyor (org kapsamda), `clients`
     * satırını göstermiyor. Boost sorgusunun LEFT JOIN'i bunu düşürmemeli.
     */
    await h.q(
      `INSERT INTO auto_boost_queue_items
         (id, org_id, client_id, platform, social_profile_id, external_id, status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'meta', $3, 'uyumsuz', 'pending', '2026-10-01T08:00:00Z', now())`,
      [ORG_EV, WS_YABANCI, kimlik(WS_YABANCI, 3)],
    );
    const sahte = { ...EV, clientIds: [WS_EV, WS_YABANCI] } as TenantContext;
    const y = await svc.bekleyenler(sahte, {}, SIMDI);
    const yabanci = y.isler.filter((i) => i.clientId === WS_YABANCI);
    // Yabancı org'un KENDİ iki kartı ve iki planı politikada kaldı; görünen
    // tek kart org'u kapsamda olan uyumsuz kart.
    expect(yabanci.map((i) => `${i.tur}|${i.sayi}`).sort()).toEqual(['boost_onay|1', 'butce_yok|1']);
    // clients LEFT JOIN satırı DÜŞÜRMEDİ: ad görünmüyor, satır duruyor.
    expect(new Set(yabanci.map((i) => i.clientAdi))).toEqual(new Set(['Adı görünmeyen workspace']));
  });
});

describe('"tüm şirketler" ve kardeş şirket — ctx.orgId ev şirketinde kalıyor', () => {
  it('KRİTİK: tüm şirketler kipinde kardeş şirketin workspace’i de geliyor, adıyla; yabancı gelmiyor', async () => {
    const y = await svc.bekleyenler(TUM, {}, SIMDI);
    expect(y.hatalar).toEqual([]);
    expect(ozet(y.isler)).toBe(beklenen(WS_EV, WS_EV2, WS_KARDES));
  });

  it('KRİTİK: tüm şirketler kipinde kardeş workspace tek başına istenebiliyor', async () => {
    const y = await svc.bekleyenler(TUM, { clientId: WS_KARDES }, SIMDI);
    expect(ozet(y.isler)).toBe(beklenen(WS_KARDES));
  });

  it('KRİTİK: kardeş şirkete geçmiş ajans yöneticisi o şirketin workspace’ini adıyla görüyor (users join yok)', async () => {
    const y = await svc.bekleyenler(KARDES, {}, SIMDI);
    expect(y.hatalar).toEqual([]);
    expect(ozet(y.isler)).toBe(beklenen(WS_KARDES));
  });

  it('KRİTİK: kardeş workspace’in bütçesi varsa tüm şirketler kipinde "bütçe yok" demiyor', async () => {
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, month, amount_micros, currency, updated_at)
       VALUES (gen_random_uuid(), $1, $2, '2026-10-01', 1000000, 'TRY', now())`,
      [ORG_KARDES, WS_KARDES],
    );
    const y = await svc.bekleyenler(TUM, {}, SIMDI);
    const butceYok = y.isler.filter((i) => i.tur === 'butce_yok').map((i) => i.clientId).sort();
    expect(butceYok).toEqual([WS_EV, WS_EV2].sort());
    // Aynı satır kardeş şirketin içinden de görünüyor.
    const k = await svc.bekleyenler(KARDES, {}, SIMDI);
    expect(k.isler.filter((i) => i.tur === 'butce_yok')).toEqual([]);
  });
});

describe('müşteri hesabı (client_viewer)', () => {
  it('KRİTİK: yalnız strateji_onay, yalnız kendi workspace’i; öteki üç tür sorulmuyor', async () => {
    const y = await svc.bekleyenler(MUSTERI, {}, SIMDI);
    expect(y.hatalar).toEqual([]);
    expect(ozet(y.isler)).toBe(`strateji_onay|${AD_OF[WS_EV]}|1`);
    expect([...y.sorulmayan].sort()).toEqual(['boost_onay', 'butce_yok', 'strateji_aktar']);
    // "Sorulmadı" SÖZ değil: gönderilen SQL'de üç tablonun hiçbiri yok.
    const govde = sorgular.join('\n');
    expect(govde).toContain('strateji_planlari');
    expect(govde).not.toContain('auto_boost_queue_items');
    expect(govde).not.toContain('insights_daily');
    // Plan tablosuna TEK sorgu: `strateji_aktar` (aynı tablo, öteki durum) da sorulmadı.
    expect(sorgular.filter((q) => q.includes('strateji_planlari'))).toHaveLength(1);
  });

  it('KRİTİK: müşteri hesabı ajansın başka workspace’ini isteyemiyor (403)', async () => {
    await expect(svc.bekleyenler(MUSTERI, { clientId: WS_EV2 }, SIMDI)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('kontrolcü kapısı', () => {
  it('KRİTİK: uç insights.read istiyor ve müşteri hesabı bu yetkiyi taşıyor', () => {
    const kaynak = readFileSync(
      join(__dirname, '..', 'modules', 'genel-bakis', 'genel-bakis.controller.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');
    const bas = kaynak.indexOf("@Get('bekleyenler')");
    if (bas === -1) throw new Error('uç bulunamadı — tarama boşa düştü');
    const dilim = kaynak.slice(bas, kaynak.indexOf('bekleyenler(', bas));
    expect(dilim).toContain("@RequirePermissions('insights.read')");
    expect(resolvePermissions('client_viewer')).toContain('insights.read');
  });
});

describe('BULGU (Ajan 4): kutu ile bütçe ekranı "tüm şirketler" kipinde ayrışıyor', () => {
  /*
   * Kutu bütçe satırını POLİTİKAYLA süzüyor (`org_kapsaminda` — bu kipte
   * ajansın bütün şirketleri). `budgets.service#pacing` ise ayrıca
   * `b.org_id = ctx.orgId` yazıyor ve bu kipte `ctx.orgId` EV şirketi.
   * Kardeş şirketin workspace'inin bütçesi (org_id = kardeş) kutuda VAR
   * sayılıyor, bütçe ekranında YOK görünüyor.
   *
   * Genel Bakış'taki bütçe kartı bu kipte hiç çizilmiyor (`butceGorunur`
   * `!ajansGorunumu` istiyor), yani ayrışma Genel Bakış'ın içinde
   * görünmüyor. Ama kutunun `butce_yok` bağlantısı `/butce?musteri=` ve
   * oturum tüm şirketler kipinde KALIYOR: kutudan gidilen bütçe ekranı
   * pacing'i bu kipte çağırıyor. Hata pacing'de (ve aynı süzgeci taşıyan
   * list/create/delete'te); kutu doğru.
   *
   * `it.fails`: DOĞRU davranışı iddia ediyor ve bugün düşüyor. Bütçe
   * modülü düzeltildiğinde bu test "beklenmedik geçti" ile kırmızıya döner;
   * o zaman `.fails` kaldırılır.
   */
  it.fails('pacing tüm şirketler kipinde kardeş workspace’in bütçesini görmeli (kutu görüyor)', async () => {
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, month, amount_micros, currency, updated_at)
       VALUES (gen_random_uuid(), $1, $2, '2026-10-01', 1000000, 'TRY', now())`,
      [ORG_KARDES, WS_KARDES],
    );
    // Kutu: bütçe var, iş yok.
    const y = await svc.bekleyenler(TUM, { clientId: WS_KARDES }, SIMDI);
    expect(y.isler.filter((i) => i.tur === 'butce_yok')).toEqual([]);
    // Bütçe ekranı aynı kipte: bütçe görünmeli.
    const p = await butceSvc.pacing(TUM, { clientId: WS_KARDES, month: '2026-10' }, SIMDI);
    expect(p.overall.budget, 'pacing bütçeyi göremedi — b.org_id = ctx.orgId süzgeci').not.toBeNull();
  });

  it('aynı satır kardeş şirketin İÇİNDEN bakınca iki tarafta da görünüyor (ayrışma yalnız tüm şirketler kipinde)', async () => {
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, month, amount_micros, currency, updated_at)
       VALUES (gen_random_uuid(), $1, $2, '2026-10-01', 1000000, 'TRY', now())`,
      [ORG_KARDES, WS_KARDES],
    );
    const ctx = { ...KARDES, activeClientId: WS_KARDES } as TenantContext;
    const y = await svc.bekleyenler(ctx, { clientId: WS_KARDES }, SIMDI);
    expect(y.isler.filter((i) => i.tur === 'butce_yok')).toEqual([]);
    const p = await butceSvc.pacing(ctx, { clientId: WS_KARDES, month: '2026-10' }, SIMDI);
    expect(p.overall.budget).not.toBeNull();
  });
});
