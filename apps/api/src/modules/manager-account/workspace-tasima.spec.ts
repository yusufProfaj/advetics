import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../../test/pglite-harness';
import {
  CASCADE_ILE_TASINANLAR,
  COCUK_TABLOLAR,
  KAYNAKTA_KALANLAR,
  WORKSPACE_TABLOLARI,
  workspaceTasi,
} from './workspace-tasima';

/**
 * ═══ WORKSPACE ŞİRKET DEĞİŞTİRİYOR ═══
 *
 * `org_id` denormalize ve 41 tabloda duruyor. Yalnızca `clients.org_id`
 * güncellenseydi belirti şu olurdu: workspace yeni şirkette GÖRÜNÜR ama
 * içi BOŞ, eski şirket onun verisini görmeye DEVAM eder, ve hiçbiri hata
 * üretmez.
 *
 * İKİ AYRI ŞEY SINANIYOR:
 *   1. KAPSAMA — listede eksik tablo var mı (şemadan taranıyor).
 *   2. DAVRANIŞ — gerçek Postgres'te satırlar gerçekten taşınıyor mu.
 *
 * Birincisi olmadan ikincisi yanıltıcı: yalnızca fikstürde satırı olan
 * tabloları sınamak, listeye hiç girmemiş bir tabloyu göremez.
 */
const SCHEMA = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');

/** Şemadaki `org_id` taşıyan tabloları, `client_id` var/yok diye ayırır. */
function semadanTablolar(): { dogrudan: string[]; cocuk: string[] } {
  const dogrudan: string[] = [];
  const cocuk: string[] = [];
  /*
   * ORGANİZASYONUN KENDİSİNE AİT tablolar hariç: bunlar bir workspace'e
   * bağlı değil ve taşınmaları YANLIŞ olurdu.
   *   users / memberships → kullanıcılar şirkete ait (üyelik AYRI: o
   *     workspace'e bağlı ve listede VAR)
   *   user_email_accounts → danışmanın kendi SMTP kimliği
   *   manager_* → zaten organizasyonun üstünde
   */
  const HARIC = new Set([
    'organizations',
    'users',
    'clients',
    'user_email_accounts',
    'manager_accounts',
    'manager_memberships',
  ]);

  for (const m of SCHEMA.matchAll(/model \w+ \{([\s\S]*?)\n\}/g)) {
    /*
     * YORUMSUZ GÖVDEDE ve GERÇEK KOLON TANIMINA bakılıyor.
     *
     * İlk yazımda `govde.includes('client_id')` diyordu ve `sync_batches`i
     * yanlış sınıflandırdı: o tablo `client_ids` (DİZİ) taşıyor ve dize
     * eşleşmesi ikisini ayırt etmiyor. Sonuç, var olmayan bir kolona
     * UPDATE atan bir taşıma listesiydi — taşımanın ORTASINDA patlıyordu.
     */
    const govde = (m[1] ?? '').replace(/^\s*\/\/\/.*$/gm, '');
    const t = /@@map\("(\w+)"\)/.exec(govde);
    if (!t?.[1] || !/@map\("org_id"\)/.test(govde) || HARIC.has(t[1])) continue;
    (/@map\("client_id"\)/.test(govde) ? dogrudan : cocuk).push(t[1]);
  }
  return { dogrudan, cocuk };
}

describe('KAPSAMA — şemadaki her tablo bir karara bağlı', () => {
  const { dogrudan, cocuk } = semadanTablolar();

  it('BOŞA DÜŞME BEKÇİSİ: tarama gerçekten tablo buldu', () => {
    // Şema biçimi değişirse liste boşalır ve aşağıdaki "eksik yok"
    // iddiaları HER ZAMAN doğru olurdu.
    expect(dogrudan.length).toBeGreaterThan(20);
    expect(cocuk.length).toBeGreaterThan(5);
    expect(dogrudan).toContain('monthly_budgets');
  });

  it('KRİTİK: `client_id` taşıyan hiçbir tablo LİSTE DIŞINDA değil', () => {
    /*
     * Bu testin var oluş sebebi: liste ELLE yazılı (her satır bir karar)
     * ama yeni bir tablo eklendiğinde sessizce eksik kalabilir. O tablo
     * taşınmazsa satırları RLS altında KİMSEYE görünmez olur — hata yok,
     * log yok, yalnızca "veri kayboldu".
     *
     * Üç tablo hariç: Postgres onları `ON UPDATE CASCADE` ile kendisi
     * taşıyor ve listeye eklemek "burada olmayan taşınmıyor" kuralını
     * bozardı.
     */
    const kapsanan = new Set<string>([
      ...WORKSPACE_TABLOLARI.map((t) => t.tablo),
      ...CASCADE_ILE_TASINANLAR,
    ]);
    expect(dogrudan.filter((t) => !kapsanan.has(t))).toEqual([]);
  });

  it('KRİTİK: `client_id` TAŞIMAYAN çocuk tabloların hepsi kapsanıyor', () => {
    /*
     * `KAYNAKTA_KALANLAR` da kapsanmış sayılıyor: orada durmak bir KARAR
     * ve gerekçesi kaynakta yazılı. Hariç tutmasaydık, bilinçli bir
     * kararı "eksik" gibi gösteren bir test olurdu.
     */
    const kapsanan = new Set<string>([
      ...COCUK_TABLOLAR.map((t) => t.tablo),
      ...KAYNAKTA_KALANLAR,
    ]);
    expect(cocuk.filter((t) => !kapsanan.has(t))).toEqual([]);
  });

  it('listede ŞEMADA OLMAYAN tablo yok', () => {
    // Ters yön: silinmiş bir tabloya UPDATE atmak, taşımanın ORTASINDA
    // patlaması ve transaction'ın geri alınması demek.
    const semada = new Set([...dogrudan, ...cocuk]);
    expect(WORKSPACE_TABLOLARI.map((t) => t.tablo).filter((t) => !semada.has(t))).toEqual([]);
    expect(COCUK_TABLOLAR.map((t) => t.tablo).filter((t) => !semada.has(t))).toEqual([]);
  });

  it('KRİTİK: çocuk tabloların EBEVEYN KOLONU şemada GERÇEKTEN var', () => {
    /*
     * Kolon adı yanlış yazılırsa taşıma "column does not exist" ile
     * ORTASINDA patlıyor ve transaction geri alınıyor — yani veri
     * bozulmuyor ama özellik hiç çalışmıyor ve sebebi ancak log'da.
     * İlk yazımda iki tanesi yanlıştı (`draft_campaign_id`,
     * `draft_ad_group_id`); şemada `campaign_id` ve `ad_group_id`.
     */
    for (const c of COCUK_TABLOLAR) {
      const model = new RegExp(
        `model \\w+ \\{[^}]*?@@map\\("${c.tablo}"\\)`,
        's',
      ).exec(SCHEMA);
      expect(model, `${c.tablo} modeli bulunamadı`).not.toBeNull();
      expect(model?.[0], `${c.tablo}.${c.kolon}`).toContain(`@map("${c.kolon}")`);
    }
  });

  it('çocuk tablo EBEVEYNİNDEN SONRA geliyor — sıra bir bağımlılık', () => {
    /*
     * Çocuk, ebeveyni üzerinden bulunuyor: `WHERE e.org_id = hedef`.
     * Ebeveyn henüz taşınmamışsa hiçbir satır eşleşmez ve çocuk SESSİZCE
     * geride kalır. `draft_ads`in ebeveyni `draft_ad_groups` de bir çocuk.
     */
    const sira = COCUK_TABLOLAR.map((t) => t.tablo);
    const cocukAdlari = new Set(sira);
    for (const [i, c] of COCUK_TABLOLAR.entries()) {
      if (cocukAdlari.has(c.ebeveyn)) {
        expect(sira.indexOf(c.ebeveyn)).toBeLessThan(i);
      }
    }
  });
});

// ---------------------------------------------------------------------------

let h: Harness;

const UST = 'a0000000-0000-0000-0000-00000000000a';
const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const USER = '99999999-9999-9999-9999-999999999999';
const WS = 'aaaa1111-1111-1111-1111-111111111111';
/** Aynı şirkette KALAN ikinci workspace — taşımanın onu etkilememesi gerekiyor. */
const WS_KALAN = 'aaaa2222-2222-2222-2222-222222222222';
const CONN = 'c0000000-0000-0000-0000-0000000000c1';

beforeAll(async () => {
  h = await createHarness();
  await h.q(`INSERT INTO manager_accounts (id, name, slug, status, created_at, updated_at)
             VALUES ('${UST}', 'D', 'd', 'active', now(), now())`);
  await h.q(`INSERT INTO organizations (id, name, slug, plan, status, manager_account_id, created_at, updated_at) VALUES
             ('${ORG_A}','A','a','starter','active','${UST}',now(),now()),
             ('${ORG_B}','B','b','starter','active','${UST}',now(),now())`);
  await h.q(`INSERT INTO users (id, org_id, email, full_name, password_hash, locale, status, created_at, updated_at)
             VALUES ('${USER}','${ORG_A}','u@x.com','U','h','tr','active',now(),now())`);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, timezone, reporting_currency, status, contact_emails, created_at, updated_at) VALUES
             ('${WS}','${ORG_A}','Taşınan','tasinan','Europe/Istanbul','TRY','active','{}',now(),now()),
             ('${WS_KALAN}','${ORG_A}','Kalan','kalan','Europe/Istanbul','TRY','active','{}',now(),now())`);

  // Taşınacak workspace'in verisi — üç ayrı katman.
  await h.q(`INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month, amount_micros, currency, created_at, updated_at)
             VALUES (gen_random_uuid(),'${ORG_A}','${WS}',NULL,'2026-09-01',1000000,'TRY',now(),now())`);
  await h.q(`INSERT INTO rules (id, org_id, client_id, name, level, conditions, action, guard, created_at, updated_at)
             VALUES ('bbbb1111-1111-1111-1111-111111111111','${ORG_A}','${WS}','Kural','campaign','[{"metric":"spend","op":"gt","value":1}]'::jsonb,'{"type":"pause"}'::jsonb,'{}'::jsonb,now(),now())`);
  await h.q(`INSERT INTO rule_runs (id, org_id, rule_id, dry_run, started_at)
             VALUES (gen_random_uuid(),'${ORG_A}','bbbb1111-1111-1111-1111-111111111111',true,now())`);
  // Kalan workspace'in verisi — taşımadan ETKİLENMEMELİ.
  await h.q(`INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month, amount_micros, currency, created_at, updated_at)
             VALUES (gen_random_uuid(),'${ORG_A}','${WS_KALAN}',NULL,'2026-09-01',5000000,'TRY',now(),now())`);
  // Kompozit yabancı anahtarın CASCADE'ini sınamak için bir bağlantı + hesap.
  await h.q(`INSERT INTO platform_connections (id, org_id, client_id, platform, external_user_id, account_label, access_token_enc, status, connected_by_user_id, created_at, updated_at)
             VALUES ('${CONN}','${ORG_A}',NULL,'meta','fb','Ajans','\\x00','active','${USER}',now(),now())`);
  await h.q(`INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
             VALUES ('dddd1111-1111-1111-1111-111111111111','${ORG_A}','${WS}','${CONN}','meta','act_1','Hesap','TRY','Europe/Istanbul',now())`);
});

afterAll(async () => {
  await h.close();
});

async function orgOf(tablo: string, kosul: string): Promise<string | null> {
  const rows = await h.q<{ org_id: string }>(`SELECT org_id FROM ${tablo} WHERE ${kosul}`);
  return rows[0]?.org_id ?? null;
}

describe('DAVRANIŞ — gerçek Postgres', () => {
  it('KRİTİK: workspace ve BÜTÜN verisi hedef şirkete geçiyor', async () => {
    const sonuc = await workspaceTasi(
      { $executeRaw: (sql) => h.db.$executeRaw(sql) },
      WS,
      ORG_A,
      ORG_B,
    );

    expect(await orgOf('clients', `id = '${WS}'`)).toBe(ORG_B);
    expect(await orgOf('monthly_budgets', `client_id = '${WS}'`)).toBe(ORG_B);
    expect(await orgOf('rules', `client_id = '${WS}'`)).toBe(ORG_B);
    // ÇOCUK TABLO: `client_id` taşımıyor, ebeveyni üzerinden bulunuyor.
    expect(await orgOf('rule_runs', `rule_id = 'bbbb1111-1111-1111-1111-111111111111'`)).toBe(
      ORG_B,
    );
    expect(sonuc.toplam).toBeGreaterThan(0);
    expect(sonuc.tasinan['workspace']).toBe(1);
  });

  it('KRİTİK: reklam hesabı KOMPOZİT ANAHTARLA kendiliğinden taşındı', async () => {
    /*
     * `ad_accounts_client_org_fkey` `ON UPDATE CASCADE` taşıyor. Bu test o
     * varsayımı ÖLÇÜYOR: doğru olmasaydı hesap eski şirkette kalır ve
     * yabancı anahtar `clients.org_id` güncellemesini REDDEDERDİ.
     */
    expect(await orgOf('ad_accounts', `id = 'dddd1111-1111-1111-1111-111111111111'`)).toBe(ORG_B);
  });

  it('KRİTİK: AYNI ŞİRKETTE KALAN workspace ETKİLENMEDİ', async () => {
    // Yüklem `client_id`ye çapalı değilse taşıma komşusunu da götürürdü.
    expect(await orgOf('clients', `id = '${WS_KALAN}'`)).toBe(ORG_A);
    expect(await orgOf('monthly_budgets', `client_id = '${WS_KALAN}'`)).toBe(ORG_A);
  });

  it('AJANS BAĞLANTISI yerinde kaldı — havuz workspace’e ait değil', async () => {
    // `client_id` NULL: bağlantı ajansın, taşınan workspace'in değil.
    expect(await orgOf('platform_connections', `id = '${CONN}'`)).toBe(ORG_A);
  });

  it('ikinci kez taşımak SIFIR satır etkiliyor — idempotent', async () => {
    const sonuc = await workspaceTasi(
      { $executeRaw: (sql) => h.db.$executeRaw(sql) },
      WS,
      ORG_A,
      ORG_B,
    );
    expect(sonuc.toplam).toBe(0);
  });
});
