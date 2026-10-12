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
 * ┌─ KOMPOZİT ANAHTARLI TABLOLAR BURADA YOK: POSTGRES KENDİSİ TAŞIYOR ──┐
 * │ `(client_id, org_id)` kompozit yabancı anahtarını `ON UPDATE CASCADE`  │
 * │ ile taşıyan tablolar (`CASCADE_ILE_TASINANLAR`) `clients.org_id`       │
 * │ güncellenince kendiliğinden güncelleniyor. Listeye eklemek ZARARSIZ    │
 * │ DEĞİL: kısıt her deyimde doğrulanıyor ve satırın org_id'sini önden     │
 * │ yazmak, henüz var olmayan (workspace, hedef şirket) çiftine bakıyor —  │
 * │ taşıma ORTASINDA düşüyordu (Ajan 4, Paket A kapısı).                   │
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
  { tablo: 'audience_templates', etiket: 'kitle şablonu' },
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
 * TAŞINMAYAN ve bunun bir KARAR olduğu tablolar.
 *
 * `sync_batches` `client_id` değil `client_ids` (DİZİ) taşıyor: bir toplu
 * tazeleme turu birden çok workspace'e birden dokunuyor ve bir workspace'e
 * ait değil — turu ÇALIŞTIRAN organizasyona ait. Taşımak, turun geri
 * kalanını başka bir şirkete taşımak ya da kaydı ikiye bölmek demekti.
 * Alt satırları (`sync_jobs`) `org_id` taşımıyor, dolayısıyla onlar da
 * kendiliğinden tutarlı kalıyor.
 */
export const KAYNAKTA_KALANLAR = [
  'sync_batches',
  /*
   * AJANS GENELİ ayar (atıf standardı): bir workspace'in değil şirketin
   * kaydı ve `client_id` taşımıyor. Workspace başka şirkete geçince yeni
   * şirketin (ya da onun ajansının) ayarı geçerli olur — taşınacak bir şey
   * yok.
   */
  'ajans_ayari',
] as const;

/**
 * `(client_id, org_id)` KOMPOZİT YABANCI ANAHTARI `ON UPDATE CASCADE` OLAN
 * tablolar: `clients.org_id` güncellenince Postgres onları KENDİSİ taşıyor.
 *
 * BU TABLOLAR `WORKSPACE_TABLOLARI`NDA DURAMAZ — durunca taşıma PATLIYOR.
 * Bir süre (reklam modülünden Paket A'ya kadar) orada duruyorlardı ve
 * `workspaceTasi` önce satırın `org_id`sini hedefe yazıyordu: kısıt ertelenmiş
 * değil, her deyimde doğrulanıyor ve `(workspace, hedef şirket)` çifti
 * `clients`ta henüz YOK (o satır EN SONDA güncelleniyor). Sonuç: bu
 * tablolardan birinde tek satırı olan her workspace'in şirket değiştirmesi
 * "İlişkili kayıt geçersiz" ile düşüyordu (Ajan 4, Paket A kapısı).
 *
 * Kapsama testi (`workspace-tasima.spec.ts`) migration'lardaki kompozit
 * anahtarları tarayıp bu listeyle KARŞILAŞTIRIYOR; yeni bir tablo kompozit
 * anahtarla eklenince buraya, düz `org_id` ile eklenince
 * `WORKSPACE_TABLOLARI`na girmek zorunda. Satırların neden workspace'le
 * gittiğinin gerekçeleri aşağıda, tablonun yanında.
 */
export const CASCADE_ILE_TASINANLAR = [
  'ad_accounts',
  'platform_connections',
  'social_profiles',
  // Yeni reklam modülü: taslak ve DEĞİŞMEZ sürümleri workspace'in bütün
  // geçmişiyle gidiyor. Sürüm tablosunun trigger'ı client_id/org_id
  // değişimine bilerek izin veriyor; içerik kolonları kilitli.
  'reklam_taslagi',
  'taslak_surumu',
  'yayin',
  'yayin_nesnesi',
  'geri_okuma',
  'prova',
  // AdvCampaign sohbeti taslakla birlikte gider: taslak yeni şirkete
  // taşınıyorsa "bunu kim neden istedi" sorusunun cevabı da gitmeli.
  'adv_oturum',
  'adv_mesaj',
  'adv_onay',
  // AdvCampaign rehberi workspace'in YARIM İŞİ ve türettiği taslaklar
  // (reklam_taslagi) zaten taşınıyor; rehberi geride bırakmak, yeni şirkette
  // ebeveynsiz taslaklar, eskide hiçbir hesaba bağlanamayan bir rehber demekti.
  'reklam_rehberi',
  // Hazırlık workspace'in KENDİ ayarı (piksel, bütçe önerisi, kategori
  // cevabı); geride kalsa yeni şirkette workspace "hazırlanmamış" görünür ve
  // kullanıcıya aynı sorular yeniden sorulurdu.
  'workspace_hazirlama',
  'workspace_kurulum',
  // AdvStrategy planı workspace'in KENDİ kararı ve dayandığı kitle şablonları
  // ile varlıklar zaten taşınıyor; planı geride bırakmak, yeni şirkette
  // kitlesi olup planı olmayan bir workspace ve eski şirkette sahipsiz bir
  // onay izi demekti (MIMARI § 1). Çocuk tablolar `client_id` taşıyor,
  // planla aynı turda gidiyor.
  'strateji_planlari',
  'strateji_dagilimlari',
  'strateji_matrisi',
  'strateji_kelimeleri',
  // İyileştir: karar, workspace'in reklamlarına verilmiş bir cevap ve
  // reklamlar (hesap atamasıyla) workspace'le gidiyor; kararı geride
  // bırakmak, yeni şirkette aynı haftanın önerisini yeniden "açık"
  // gösterir ve ikinci kez uygulatırdı. Asistan sohbeti de AdvCampaign
  // sohbetiyle aynı gerekçeyle taşınıyor (MIMARI § 4).
  'iyilestir_oneri_karar',
  'iyilestir_asistan_oturum',
  'iyilestir_asistan_mesaj',
  // SİNYALLER VE BİLDİRİM KANALLARI (docs/sinyal/MIMARI.md § 2) TAŞINIYOR.
  // Sinyal, workspace'in reklam hesaplarından türetilmiş bir gözlem ve
  // hesaplar workspace'le gidiyor; geride kalan sinyal, sahibi olmayan bir
  // uyarı olurdu. Kanal ajansın o workspace için kurduğu teslim yolu: yeni
  // şirkette yeniden kurdurmak, ilk sabahki özetin sessizce hiç gitmemesi
  // demek. Gönderim geçmişi kanalla birlikte ("bu sabah ne gitti").
  'sinyaller',
  'bildirim_kanallari',
  'bildirim_gonderimleri',
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
