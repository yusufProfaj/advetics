import { Prisma } from '@prisma/client';

/**
 * ═══ WORKSPACE ŞİRKET DEĞİŞTİRİYOR — `org_id` DE TAŞINIR ═══
 *
 * `org_id` bu kod tabanında `client_id` gibi BİLEREK denormalize: RLS
 * politikaları join'siz yazılabilsin diye her satır kendi organizasyonunu
 * taşıyor. Bedeli, bir workspace şirket değiştirdiğinde ortaya çıkıyor.
 *
 * Yalnızca `clients.org_id` güncellenseydi:
 *
 *   · Workspace yeni şirkette GÖRÜNÜYOR ama bütçesi, kuralları, formları,
 *     görselleri ve raporları ESKİ şirketin `org_id`'siyle kalıyor — RLS
 *     onları yeni şirkete AÇMIYOR, yani "workspace taşındı, içi boş".
 *   · Eski şirket o satırları görmeye devam ediyor: başka bir şirketin
 *     müşteri verisi, eski şirketin ekranında.
 *   · Hiçbiri hata üretmiyor. Belirti "taşıdım ama hiçbir şey yok".
 *
 * Bu, `hesap-verisi-tasima.ts`teki sorunun BİR SEVİYE ÜSTÜ ve aynı gerekçeyle
 * aynı transaction'da çözülüyor: yarım kalmış bir taşıma, iki şirketin de
 * verisini sessizce yanlış yapar.
 *
 * ┌─ ÜÇ TABLO BURADA YOK ÇÜNKÜ POSTGRES ONLARI KENDİSİ TAŞIYOR ───────────┐
 * │ `ad_accounts`, `platform_connections` ve `social_profiles`             │
 * │ `(client_id, org_id)` kompozit yabancı anahtarını `ON UPDATE CASCADE`  │
 * │ ile taşıyor (bkz. 20260815120000_agency_connections). `clients.org_id` │
 * │ güncellenince üçü de kendiliğinden güncelleniyor. Listeye eklemek      │
 * │ zararsız olurdu ama YANILTICI: "burada olmayan taşınmıyor" kuralını    │
 * │ bozar ve kapsama testinin ne ölçtüğünü belirsizleştirirdi.             │
 * └───────────────────────────────────────────────────────────────────────┘
 */

/**
 * `client_id` TAŞIYAN tablolar — workspace nereye giderse oraya giderler.
 *
 * LİSTE ŞEMADAN TÜRETİLMİYOR, ELLE YAZILI ve bu bilinçli: her satır bir
 * KARAR. Otomatik türetme, yeni bir tablonun ne olduğu düşünülmeden
 * taşınması demek olurdu. Ama liste KİLİTLİ DEĞİL: `workspace-tasima.spec.ts`
 * şemayı tarayıp burada olmayan bir tablo bulursa DÜŞÜYOR — yani yeni tablo
 * eklemek, bu dosyada bir karar vermeyi ZORUNLU kılıyor.
 */
export const WORKSPACE_TABLOLARI: ReadonlyArray<{ tablo: string; etiket: string }> = [
  { tablo: 'memberships', etiket: 'yetki' },
  { tablo: 'branding_profiles', etiket: 'marka profili' },
  { tablo: 'client_profiles', etiket: 'bilgi bankası' },
  { tablo: 'audit_logs', etiket: 'denetim kaydı' },
  { tablo: 'oauth_states', etiket: 'yetkilendirme durumu' },
  { tablo: 'report_templates', etiket: 'rapor şablonu' },
  { tablo: 'report_shares', etiket: 'rapor paylaşımı' },
  { tablo: 'report_schedules', etiket: 'rapor planı' },
  { tablo: 'monthly_budgets', etiket: 'aylık bütçe' },
  { tablo: 'rules', etiket: 'kural' },
  { tablo: 'organic_posts', etiket: 'organik gönderi' },
  { tablo: 'boost_rules', etiket: 'boost kuralı' },
  { tablo: 'boosts', etiket: 'boost' },
  { tablo: 'bulk_batches', etiket: 'toplu işlem' },
  { tablo: 'ad_drafts', etiket: 'reklam taslağı' },
  { tablo: 'lead_forms', etiket: 'form' },
  { tablo: 'leads', etiket: 'potansiyel müşteri kaydı' },
  { tablo: 'lead_sync_cursors', etiket: 'form imleci' },
  { tablo: 'assets', etiket: 'görsel' },
  { tablo: 'ad_creatives', etiket: 'kreatif' },
  { tablo: 'draft_campaigns', etiket: 'taslak kampanya' },
  { tablo: 'auto_boost_presets', etiket: 'boost ön ayarı' },
  { tablo: 'auto_boost_queue_items', etiket: 'boost kuyruğu' },
  { tablo: 'auto_boost_subscriptions', etiket: 'boost aboneliği' },
  { tablo: 'fatura_belgeleri', etiket: 'fatura' },
  { tablo: 'ai_conversations', etiket: 'asistan sohbeti' },
] as const;

/**
 * `client_id` TAŞIMAYAN çocuk tablolar — ebeveyn üzerinden bulunuyorlar.
 *
 * `org_id`leri var ama workspace'e doğrudan bağlı değiller; ebeveyni
 * taşındığında geride kalırlarsa RLS onları kimseye göstermez ve satırlar
 * SESSİZCE erişilemez olur. Hata yok, log yok.
 */
export const COCUK_TABLOLAR: ReadonlyArray<{
  tablo: string;
  ebeveyn: string;
  kolon: string;
  etiket: string;
}> = [
  { tablo: 'rule_runs', ebeveyn: 'rules', kolon: 'rule_id', etiket: 'kural koşumu' },
  { tablo: 'rule_action_logs', ebeveyn: 'rules', kolon: 'rule_id', etiket: 'kural aksiyonu' },
  { tablo: 'bulk_items', ebeveyn: 'bulk_batches', kolon: 'batch_id', etiket: 'toplu işlem satırı' },
  { tablo: 'ad_draft_assets', ebeveyn: 'ad_drafts', kolon: 'draft_id', etiket: 'taslak görseli' },
  { tablo: 'asset_platform_refs', ebeveyn: 'assets', kolon: 'asset_id', etiket: 'görsel referansı' },
  {
    tablo: 'ad_creative_assets',
    ebeveyn: 'ad_creatives',
    kolon: 'creative_id',
    etiket: 'kreatif görseli',
  },
  {
    tablo: 'draft_ad_groups',
    ebeveyn: 'draft_campaigns',
    kolon: 'campaign_id',
    etiket: 'taslak reklam grubu',
  },
  { tablo: 'draft_ads', ebeveyn: 'draft_ad_groups', kolon: 'ad_group_id', etiket: 'taslak reklam' },
] as const;

/**
 * POSTGRES'İN KENDİSİ TAŞIDIĞI TABLOLAR — burada YOK ve olmamalı.
 * Kapsama testi bunları hariç tutabilmek için okuyor.
 */
/**
 * TAŞINMAYAN ve bunun bir KARAR olduğu tablolar.
 *
 * `sync_batches` `client_id` değil `client_ids` (DİZİ) taşıyor: bir toplu
 * tazeleme turu birden çok workspace'e birden dokunuyor ve bir workspace'e
 * ait değil — turu ÇALIŞTIRAN organizasyona ait. Taşımak, turun geri
 * kalanını başka bir şirkete taşımak ya da kaydı ikiye bölmek demekti.
 * Alt satırları (`sync_jobs`) `org_id` taşımıyor, dolayısıyla onlar da
 * kendiliğinden tutarlı kalıyor.
 */
export const KAYNAKTA_KALANLAR = ['sync_batches'] as const;

export const CASCADE_ILE_TASINANLAR = [
  'ad_accounts',
  'platform_connections',
  'social_profiles',
] as const;

export interface WorkspaceTasimaSonucu {
  /** Tablo etiketi → taşınan satır sayısı. Sıfır olanlar YAZILMIYOR. */
  tasinan: Record<string, number>;
  toplam: number;
}

/**
 * Tablo adı SABİT LİSTEDEN geliyor ama yine de doğrulanıyor.
 * `Prisma.raw` denetimsiz: bir gün dışarıdan bir dize sızarsa SQL
 * enjeksiyonu olur ve tip sistemi hiçbir şey demez.
 */
function tabloAdi(t: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/.test(t)) throw new Error(`Geçersiz tablo adı: ${t}`);
  return Prisma.raw(t);
}

type Yurutucu = {
  $executeRaw(sql: Prisma.Sql): Promise<number>;
};

/**
 * Workspace'i ve BÜTÜN verisini hedef şirkete taşır.
 *
 * ÇAĞIRAN TRANSACTION AÇMAK ZORUNDA. Yarım kalmış bir taşıma iki şirketin
 * de verisini sessizce yanlış yapar; hepsi ya birlikte olur ya hiç olmaz.
 *
 * SIRA ÖNEMLİ: `clients.org_id` EN SONDA. Önce güncellenirse, kompozit
 * yabancı anahtarı `ON UPDATE CASCADE` ile taşınan üç tablo hedefe geçer
 * ama diğerleri hâlâ eski org'da olur; aradaki her satır iki dünyaya birden
 * bakar. Sonda güncellemek, cascade'i taşımanın son adımı yapıyor.
 */
export async function workspaceTasi(
  tx: Yurutucu,
  clientId: string,
  kaynakOrgId: string,
  hedefOrgId: string,
): Promise<WorkspaceTasimaSonucu> {
  const tasinan: Record<string, number> = {};
  let toplam = 0;

  for (const { tablo, etiket } of WORKSPACE_TABLOLARI) {
    const n = await tx.$executeRaw(
      Prisma.sql`
        UPDATE ${tabloAdi(tablo)}
           SET org_id = ${hedefOrgId}::uuid
         WHERE client_id = ${clientId}::uuid
           AND org_id IS DISTINCT FROM ${hedefOrgId}::uuid
      `,
    );
    if (n > 0) {
      tasinan[etiket] = n;
      toplam += n;
    }
  }

  for (const { tablo, ebeveyn, kolon, etiket } of COCUK_TABLOLAR) {
    /*
     * ÇOCUK, EBEVEYNİ ÜZERİNDEN BULUNUYOR. `draft_ads` iki seviye derinde
     * (`draft_campaigns` → `draft_ad_groups` → `draft_ads`) ve ebeveyni bu
     * döngüde ONDAN ÖNCE taşındığı için sorgu doğru sonucu veriyor —
     * `COCUK_TABLOLAR` sırası bu yüzden bir tercih değil, bir bağımlılık.
     *
     * KAYNAK ORG DA ŞART KOŞULUYOR. Yalnızca "ebeveyni hedefte" demek,
     * hedef şirkette ZATEN duran BAŞKA bir workspace'in çocuklarını da
     * kapsayan bir yüklem olurdu; bugün onlar zaten hedefte olduğu için
     * zararsız görünüyor ama yüklem yanlış ve bir gün yanlış satırı taşır.
     */
    const n = await tx.$executeRaw(
      Prisma.sql`
        UPDATE ${tabloAdi(tablo)} AS c
           SET org_id = ${hedefOrgId}::uuid
          FROM ${tabloAdi(ebeveyn)} AS e
         WHERE c.${tabloAdi(kolon)} = e.id
           AND e.org_id = ${hedefOrgId}::uuid
           AND c.org_id = ${kaynakOrgId}::uuid
      `,
    );
    if (n > 0) {
      tasinan[etiket] = n;
      toplam += n;
    }
  }

  const workspaceSatiri = await tx.$executeRaw(
    Prisma.sql`
      UPDATE clients SET org_id = ${hedefOrgId}::uuid, updated_at = now()
       WHERE id = ${clientId}::uuid
         AND org_id IS DISTINCT FROM ${hedefOrgId}::uuid
    `,
  );
  if (workspaceSatiri > 0) {
    tasinan['workspace'] = workspaceSatiri;
    toplam += workspaceSatiri;
  }

  return { tasinan, toplam };
}
