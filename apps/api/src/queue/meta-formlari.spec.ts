import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../test/pglite-harness';
import type { PrismaAdminService } from '../prisma/prisma-admin.service';
import { LeadSyncService } from './lead-sync.service';

/**
 * ═══ POTANSİYEL MÜŞTERİLER GELMİYORDU — SEBEBİ FORM LİSTESİNİN KAYNAĞIYDI ═══
 *
 * Mutabakat taraması form listesini KENDİ tablomuzdan (`lead_forms`) okuyordu:
 * yalnızca panelde ÜRETİLMİŞ formlar. Ajansların formlarının çoğu ise doğrudan
 * Meta Ads Manager'da kurulmuş ve onların bizde satırı yok — o formlar HİÇ
 * taranmıyordu.
 *
 * Belirti kullanıcının cümlesiyle: *"potansiyel müşteriler gelmiyor"*. Reklam
 * yayında, bütçe harcanıyor, form dolduruluyor; panel boş ve hiçbir yerde tek
 * bir hata satırı yok.
 *
 * Bu paket GERÇEK SORGUYU koşuyor (PGlite) çünkü sınanan şey SQL ve yazma
 * yolu: hangi sayfalar taranıyor, form adı nereden geliyor, aynı kayıt ikinci
 * kez yazılıyor mu.
 */
let h: Harness;
let svc: LeadSyncService;

const SAYFA = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const BIZIM_FORM = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';

/** Sağlayıcı taklidinin döndüreceği formlar ve kayıtlar — test başına kurulur. */
const listPageLeadForms = vi.fn();
const fetchFormLeads = vi.fn();
const fetchLeadFormName = vi.fn();

beforeAll(async () => {
  h = await createHarness();

  const providers = {
    get: () => ({ listPageLeadForms, fetchFormLeads, fetchLeadFormName }),
  } as never;

  svc = new LeadSyncService(
    h.db as unknown as PrismaAdminService,
    providers,
    // ŞİFRE ÇÖZÜCÜ: token'ın değeri sınanmıyor, VARLIĞI sınanıyor.
    { decrypt: () => 'sayfa-token' } as never,
    { acquire: async () => ({ allowed: true }), record: async () => {} } as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  listPageLeadForms.mockReset();
  fetchFormLeads.mockReset();
  fetchLeadFormName.mockReset();
  listPageLeadForms.mockResolvedValue([]);
  fetchFormLeads.mockResolvedValue([]);
  fetchLeadFormName.mockResolvedValue(null);
});

/** Müşteriye atanmış, token'ı olan bir Facebook sayfası. */
async function sayfaEkle(opts: { token?: boolean } = {}): Promise<void> {
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
       external_id, name, sync_enabled, page_access_token_enc, updated_at)
     VALUES ($1,$2,$3,$4,'facebook_page','page-1','Mia Yapı Sayfası',true,$5,now())`,
    [
      SAYFA,
      IDS.org,
      IDS.client,
      IDS.connection,
      opts.token === false ? null : Buffer.from('sifreli'),
    ],
  );
}

function kayit(id: string, opts: { formId?: string; gun?: number } = {}) {
  return {
    externalLeadId: id,
    externalFormId: opts.formId ?? 'meta-form-1',
    externalAdId: null,
    submittedAt: new Date(Date.now() - (opts.gun ?? 1) * 86_400_000),
    fields: [
      { name: 'full_name', label: 'Ad Soyad', value: 'Ahmet Yılmaz' },
      { name: 'phone_number', label: 'Telefon', value: '05320000000' },
      { name: 'butce', label: 'Bütçe', value: '2-3 milyon' },
    ],
  };
}

async function kayitlar(): Promise<
  Array<{ external_lead_id: string; lead_form_name: string | null; full_name: string | null }>
> {
  return h.q(
    `SELECT external_lead_id, lead_form_name, full_name FROM leads ORDER BY external_lead_id`,
  );
}

describe('META ADS MANAGER FORMLARI', () => {
  it('düzenek gerçekten kayıt yazıyor', async () => {
    await sayfaEkle();
    listPageLeadForms.mockResolvedValue([
      { externalFormId: 'meta-form-1', name: 'Villa Kampanyası', status: 'ACTIVE' },
    ]);
    fetchFormLeads.mockResolvedValue([kayit('lead-1')]);

    const sonuc = await svc.reconcile(IDS.client);
    expect(sonuc.rows).toBe(1);
  });

  it('KRİTİK: BİZDE SATIRI OLMAYAN FORM TARANIYOR', async () => {
    /*
     * ASIL HATA BUYDU. `lead_forms` tablosu BOŞ ve eski kod bu durumda
     * "yayınlanmış form yok" deyip hiçbir şey yapmadan dönüyordu — Meta'da
     * kurulmuş formların kayıtları paneldeki hiçbir yola girmiyordu.
     */
    await sayfaEkle();
    listPageLeadForms.mockResolvedValue([
      { externalFormId: 'meta-form-1', name: 'Villa Kampanyası', status: 'ACTIVE' },
    ]);
    fetchFormLeads.mockResolvedValue([kayit('lead-1')]);

    const [sayim] = await h.q<{ n: number }>(`SELECT count(*)::int AS n FROM lead_forms`);
    expect(sayim?.n, 'bizde form satırı OLMAMALI — testin anlamı buna bağlı').toBe(0);

    await svc.reconcile(IDS.client);
    expect((await kayitlar()).map((r) => r.external_lead_id)).toEqual(['lead-1']);
  });

  it('KRİTİK: FORM ADI META’DAN YAZILIYOR — kayıt sahipsiz kalmıyor', async () => {
    /*
     * Ad bizde olmayan formlarda NULL kalıyordu ve panelde "hangi form"
     * sorusu cevapsızdı: kayıt var, nereden geldiği yok.
     */
    await sayfaEkle();
    listPageLeadForms.mockResolvedValue([
      { externalFormId: 'meta-form-1', name: 'Villa Kampanyası', status: 'ACTIVE' },
    ]);
    fetchFormLeads.mockResolvedValue([kayit('lead-1')]);

    await svc.reconcile(IDS.client);
    expect((await kayitlar())[0]!.lead_form_name).toBe('Villa Kampanyası');
  });

  it('KRİTİK: ARŞİVLENMİŞ FORM DA TARANIYOR', async () => {
    /*
     * Meta arşivlenmiş formun geçmiş kayıtlarını saklamaya devam ediyor ve
     * son 30 günün kayıtları arşivlenen bir formdan gelmiş olabilir; süzmek
     * o kayıtları sessizce atlamak olurdu.
     */
    await sayfaEkle();
    listPageLeadForms.mockResolvedValue([
      { externalFormId: 'eski-form', name: 'Eski Kampanya', status: 'ARCHIVED' },
    ]);
    fetchFormLeads.mockResolvedValue([kayit('lead-1', { formId: 'eski-form' })]);

    await svc.reconcile(IDS.client);
    expect(await kayitlar()).toHaveLength(1);
  });

  it('KRİTİK: KENDİ FORMUMUZ META LİSTESİNDE YOKSA DA TARANIYOR', async () => {
    /*
     * İDDİA ADA DEĞİL TARAMAYA ÇAPALI — ilk yazımda ada bakıyordu ve
     * MUTASYONLA BOŞ ÇIKTI: `persist` form adını zaten kendi tablomuzdan
     * okuyor, yani birleştirme silinse bile ad doğru yazılıyordu.
     *
     * Birleştirmenin gerçekten taşıdığı şey şu: Meta'nın form listesi sayfa
     * sınırına takılabiliyor ve bizim kurduğumuz bir form o yüzden listede
     * çıkmayabiliyor. Birleştirme olmadan o form HİÇ taranmaz — yani kendi
     * kurduğumuz akış sessizce çalışmaz.
     */
    await sayfaEkle();
    await h.q(
      /*
       * KISITLARIN HEPSİ AYNI DEYİMDE KARŞILANIYOR:
       *   · `lead_forms_published_chk` — yayınlanmış formun Meta kimliği ve
       *     yayın tarihi olmak zorunda,
       *   · `lead_forms_questions_chk` — en az bir ön dolgu sorusu,
       *   · `lead_forms_root_chk` — ilk sürümde kök kimliği KENDİSİ.
       *
       * Üçünü ayrı deyimlere bölmek ara durum üretiyor ve kısıt her deyimin
       * sonunda doğrulanıyor.
       */
      `INSERT INTO lead_forms (id, org_id, client_id, social_profile_id, name, form_type,
         prefill_questions, privacy_policy_url, status, external_form_id, published_at,
         version, root_id, updated_at)
       VALUES ($4,$1,$2,$3,'Bizim Adımız','more_volume','["FULL_NAME"]'::jsonb,
               'https://x.com/gizlilik','published','meta-form-1', now(),
               1, $4, now())`,
      [IDS.org, IDS.client, SAYFA, BIZIM_FORM],
    );


    // META LİSTESİ BU FORMU HİÇ DÖNDÜRMÜYOR.
    listPageLeadForms.mockResolvedValue([]);
    fetchFormLeads.mockResolvedValue([kayit('lead-1')]);

    await svc.reconcile(IDS.client);

    expect(fetchFormLeads).toHaveBeenCalledTimes(1);
    expect((fetchFormLeads.mock.calls[0]![0] as { externalFormId: string }).externalFormId).toBe(
      'meta-form-1',
    );
    // Ad kendi tablomuzdan geliyor: panelde form neyse kayıtta da o yazıyor.
    expect((await kayitlar())[0]!.lead_form_name).toBe('Bizim Adımız');
  });
});

describe('MÜKERRER KAYIT', () => {
  it('KRİTİK: AYNI KAYIT İKİ KEZ YAZILMIYOR', async () => {
    /*
     * Webhook ile tarama aynı kaydı görüyor ve kullanıcı düğmeye iki kez
     * basabiliyor. Engel `leads_external_uniq` tekil indeksinde, yani bizim
     * kontrolümüze değil VERİTABANINA dayanıyor: iki tarama aynı anda koşsa
     * bile klon üretmiyor.
     */
    await sayfaEkle();
    listPageLeadForms.mockResolvedValue([
      { externalFormId: 'meta-form-1', name: 'Villa', status: 'ACTIVE' },
    ]);
    fetchFormLeads.mockResolvedValue([kayit('lead-1')]);

    await svc.reconcile(IDS.client);
    const ikinci = await svc.reconcile(IDS.client, { gecmis: true });

    expect(await kayitlar()).toHaveLength(1);
    // İKİNCİ TUR SIFIR YAZIYOR ve bu başarısızlık değil.
    expect(ikinci.rows).toBe(0);
  });
});

describe('SON 30 GÜN — imleç yok sayılıyor', () => {
  it('KRİTİK: GEÇMİŞ ÇEKİMİ İMLECİ YOK SAYIP 30 GÜN GERİ GİDİYOR', async () => {
    /*
     * İmleç bir kez ilerledikten sonra geriye dönmüyor: normal tarama en
     * yeni kayıttan devam ediyor ve geçmişi bir daha okumuyor. Kullanıcı
     * "son 30 günü getir" dediğinde imleçten devam etmek hiçbir şey
     * getirmezdi.
     */
    await sayfaEkle();
    listPageLeadForms.mockResolvedValue([
      { externalFormId: 'meta-form-1', name: 'Villa', status: 'ACTIVE' },
    ]);
    fetchFormLeads.mockResolvedValue([kayit('lead-1', { gun: 1 })]);
    await svc.reconcile(IDS.client);

    fetchFormLeads.mockClear();
    await svc.reconcile(IDS.client, { gecmis: true });

    const istenen = fetchFormLeads.mock.calls[0]![0] as { since: Date };
    const gunFarki = (Date.now() - istenen.since.getTime()) / 86_400_000;
    expect(gunFarki).toBeGreaterThan(29);
    expect(gunFarki).toBeLessThan(31);
  });

  it('NORMAL TARAMA İMLEÇTEN DEVAM EDİYOR', async () => {
    // Her turda 30 günü yeniden okumak, kotayı boşa harcamak demek.
    await sayfaEkle();
    listPageLeadForms.mockResolvedValue([
      { externalFormId: 'meta-form-1', name: 'Villa', status: 'ACTIVE' },
    ]);
    fetchFormLeads.mockResolvedValue([kayit('lead-1', { gun: 1 })]);
    await svc.reconcile(IDS.client);

    fetchFormLeads.mockClear();
    await svc.reconcile(IDS.client);

    const istenen = fetchFormLeads.mock.calls[0]![0] as { since: Date };
    const gunFarki = (Date.now() - istenen.since.getTime()) / 86_400_000;
    expect(gunFarki).toBeLessThan(2);
  });
});

describe('SESSİZ HATA YOK', () => {
  it('KRİTİK: SAYFA ATANMAMIŞSA SEBEBİ YAZIYOR', async () => {
    const sonuc = await svc.reconcile(IDS.client);
    expect(sonuc.rows).toBe(0);
    expect(sonuc.notlar.join(' ')).toContain('Facebook sayfası yok');
  });

  it('KRİTİK: SAYFA TOKEN’I YOKSA SEBEBİ YAZIYOR', async () => {
    /*
     * Token olmadan çağrı yapılamıyor ve eski kod bunu yalnızca log'a
     * yazıyordu: panelde boş bir liste, sebebi hiçbir yerde.
     */
    await sayfaEkle({ token: false });
    await expect(svc.reconcile(IDS.client)).rejects.toThrow(/token/);
  });

  it('KRİTİK: SAYFADA HİÇ FORM YOKSA SÖYLENİYOR', async () => {
    await sayfaEkle();
    listPageLeadForms.mockResolvedValue([]);
    const sonuc = await svc.reconcile(IDS.client);
    expect(sonuc.notlar.join(' ')).toContain('anlık form yok');
  });

  it('KRİTİK: İLETİŞİM BİLGİSİ OLMAYAN KAYIT YAZILMIYOR', async () => {
    /*
     * Üçü de boşsa elimizde ulaşılamayan bir kayıt var demektir ve bu, çekme
     * çağrısının boş döndüğü ama hatanın yutulduğu durumun imzası.
     */
    await sayfaEkle();
    listPageLeadForms.mockResolvedValue([
      { externalFormId: 'meta-form-1', name: 'Villa', status: 'ACTIVE' },
    ]);
    fetchFormLeads.mockResolvedValue([
      { ...kayit('lead-bos'), fields: [{ name: 'butce', label: 'Bütçe', value: '1M' }] },
    ]);

    const sonuc = await svc.reconcile(IDS.client);
    expect(sonuc.rows).toBe(0);
    expect(await kayitlar()).toHaveLength(0);
  });
});
