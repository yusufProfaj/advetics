import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { TESLIM_EN_FAZLA_DENEME, type RuleRecord, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { AppConfig } from '../../config/configuration';
import { CryptoService } from '../../crypto/crypto.service';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { BildirimService } from './bildirim.service';
import { BildirimTeslimService, type MailGonderici, type WebhookGonderici } from './bildirim-teslim.service';
import { EPOSTA_GONDEREN_YOK } from './eposta-gonderen';
import { govdeCoz, govdeKur, slackGovdesi, teamsGovdesi } from './bildirim-icerik';
import { kuralBildirimiYaz } from './kural-bildirimi';
import type { TxLike } from './sinyal-hesap';

/**
 * BİLDİRİM KANALLARI + TESLİM — gerçek Postgres (PGlite), sahte ağ.
 *
 * KRİTİK İDDİALAR:
 *   · webhook adresi ŞİFRELİ saklanıyor ve HİÇBİR yanıtta yok,
 *   · teslim sonucu durum makinesine göre yazılıyor (geçici → yeniden dene,
 *     kalıcı → vazgeç, deneme sınırı),
 *   · aynı satır İKİ KEZ gönderilmiyor (sahiplenme),
 *   · e-postada KISMİ RET sessiz kalmıyor,
 *   · 09:00 özeti günde bir, boş özet yok, sessiz koşumda hiç,
 *   · kural bildirimi: prova yok, kanalsız notify yok, başarısız eylem gidiyor.
 */

let h: Harness;
const SLACK = 'https://hooks.slack.com/services/T000/B000/GIZLIGIZLI';

const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: null,
  isOrgAdmin: true,
  permissions: [],
} as unknown as TenantContext;

function config(sessizKosum = false): AppConfig {
  return {
    encryption: { keys: { 1: randomBytes(32).toString('base64') }, activeVersion: 1 },
    mail: { appUrl: 'https://panel.advetics.com', smtp: null, eksikSmtpDegiskenleri: [] },
    sinyal: { sessizKosum },
  } as unknown as AppConfig;
}

let crypto: CryptoService;
let webhook: ReturnType<typeof vi.fn>;
let mail: ReturnType<typeof vi.fn>;

function kur(cfg = config()) {
  crypto = new CryptoService(cfg);
  const prisma = { withTenant: async (_c: TenantContext, fn: (tx: unknown) => Promise<unknown>) => fn(h.db) } as unknown as PrismaService;
  const admin = h.db as unknown as PrismaAdminService;
  const teslim = new BildirimTeslimService(admin, crypto, cfg);
  webhook = vi.fn(async () => ({ httpDurum: 200, reddedildi: false, hata: null }));
  mail = vi.fn(async () => ({ kabul: ['a@b.com'], ret: [] }));
  teslim.webhook = webhook as unknown as WebhookGonderici;
  teslim.mail = mail as unknown as MailGonderici;
  const svc = new BildirimService(prisma, admin, crypto, teslim);
  return { svc, teslim };
}

async function bekleyenSatir(kanalId: string, olay: 'kural' | 'sinyal' = 'kural', anahtar = 'kural:x'): Promise<string> {
  const [r] = await h.q<{ id: string }>(
    `INSERT INTO bildirim_gonderimleri (org_id, client_id, kanal_id, olay, anahtar, ozet, govde)
     VALUES ($1, $2, $3, $4, $5, 'Özet', $6::jsonb) RETURNING id::text AS id`,
    [IDS.org, IDS.client, kanalId, olay, anahtar, JSON.stringify({ baslik: 'B', konu: 'K', satirlar: [], fazla: 0, fazlaBirimi: 'x', baglanti: null })],
  );
  return r!.id;
}

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

describe('kanal kaydı', () => {
  it('KRİTİK: webhook adresi şifreli saklanıyor ve yanıtta TAM ADRES yok', async () => {
    const { svc } = kur();
    const k = await svc.olustur(CTX, { tur: 'slack', clientId: IDS.client, ad: 'Slack', olaylar: ['sinyal'], adres: SLACK });
    expect(JSON.stringify(k)).not.toContain('GIZLIGIZLI');
    expect(k.hedefIpucu).toContain('hooks.slack.com');
    expect(k.durum).toBe('dogrulanmadi');
    const [ham] = await h.q<{ hedef_enc: Uint8Array }>(`SELECT hedef_enc FROM bildirim_kanallari WHERE id = $1`, [k.id]);
    expect(Buffer.from(ham!.hedef_enc).toString('latin1')).not.toContain('GIZLIGIZLI');
    expect(crypto.decrypt(Buffer.from(ham!.hedef_enc))).toBe(SLACK);
    const liste = await svc.liste(CTX, IDS.client);
    expect(JSON.stringify(liste)).not.toContain('GIZLIGIZLI');
    expect(liste.epostaGonderen).toEqual({ tanimli: false, neden: EPOSTA_GONDEREN_YOK });
  });

  it('adres değişince doğrulama SIFIRLANIYOR', async () => {
    const { svc } = kur();
    const k = await svc.olustur(CTX, { tur: 'slack', clientId: IDS.client, ad: 'Slack', olaylar: ['sinyal'], adres: SLACK });
    expect((await svc.dogrula(CTX, k.id, true)).dogrulandi).not.toBeNull();
    const g = await svc.guncelle(CTX, k.id, { adres: 'https://hooks.slack.com/services/T1/B1/YENI' });
    expect(g.dogrulandi).toBeNull();
    expect(g.durum).toBe('dogrulanmadi');
  });

  it('başka workspace’in kanalı yazılamıyor (403)', async () => {
    const { svc } = kur();
    await expect(
      svc.olustur({ ...CTX, clientIds: [] } as TenantContext, { tur: 'slack', clientId: IDS.client, ad: 'S', olaylar: ['sinyal'], adres: SLACK }),
    ).rejects.toThrow(/erişimin yok/);
  });

  it('silinen kanalın bekleyen gönderimleri vazgeçiliyor, geçmiş kalıyor', async () => {
    const { svc } = kur();
    const k = await svc.olustur(CTX, { tur: 'slack', clientId: IDS.client, ad: 'S', olaylar: ['kural'], adres: SLACK });
    const id = await bekleyenSatir(k.id);
    const r = await svc.sil(CTX, k.id);
    expect(r.iptalEdilenGonderim).toBe(1);
    expect((await h.q(`SELECT durum, kanal_id FROM bildirim_gonderimleri WHERE id = $1`, [id]))[0]).toEqual({ durum: 'vazgecildi', kanal_id: null });
  });
});

describe('teslim', () => {
  it('KRİTİK: deneme mesajı tek atış; sonuç platformun cümlesiyle dönüyor', async () => {
    const { svc } = kur();
    const k = await svc.olustur(CTX, { tur: 'slack', clientId: IDS.client, ad: 'S', olaylar: ['sinyal'], adres: SLACK });
    const ok = await svc.dene(CTX, k.id);
    expect(ok).toMatchObject({ durum: 'gonderildi', httpDurum: 200, hata: null, olay: 'deneme' });
    expect(webhook).toHaveBeenCalledWith('slack', SLACK, expect.objectContaining({ text: expect.any(String) }));

    webhook.mockResolvedValueOnce({ httpDurum: 500, reddedildi: false, hata: 'sunucu' });
    const bad = await svc.dene(CTX, k.id);
    // Geçici hata da olsa deneme YENİDEN DENENMEZ: "geldi mi" cevabı anlamsızlaşırdı.
    expect(bad).toMatchObject({ durum: 'vazgecildi', httpDurum: 500, hata: 'sunucu' });
    expect((await svc.liste(CTX, IDS.client)).kanallar[0]!.durum).toBe('hata');
  });

  it('KRİTİK: geçici hata yeniden denenir, sınır dolunca vazgeçilir; kalıcı hata hemen vazgeçilir', async () => {
    const { svc, teslim } = kur();
    const k = await svc.olustur(CTX, { tur: 'slack', clientId: IDS.client, ad: 'S', olaylar: ['kural'], adres: SLACK });
    const id = await bekleyenSatir(k.id);
    webhook.mockResolvedValue({ httpDurum: 503, reddedildi: false, hata: 'meşgul' });
    let simdi = new Date();
    for (let i = 1; i <= TESLIM_EN_FAZLA_DENEME; i++) {
      const g = await teslim.gonder(id, simdi);
      expect(g!.deneme).toBe(i);
      expect(g!.durum).toBe(i < TESLIM_EN_FAZLA_DENEME ? 'basarisiz' : 'vazgecildi');
      simdi = new Date(simdi.getTime() + 3 * 3_600_000);
    }
    const id2 = await bekleyenSatir(k.id, 'kural', 'kural:y');
    webhook.mockResolvedValue({ httpDurum: 404, reddedildi: false, hata: 'no_service' });
    expect((await teslim.gonder(id2))!.durum).toBe('vazgecildi');
  });

  it('KRİTİK: aynı satır iki kez GÖNDERİLMİYOR (sahiplenme)', async () => {
    const { svc, teslim } = kur();
    const k = await svc.olustur(CTX, { tur: 'slack', clientId: IDS.client, ad: 'S', olaylar: ['kural'], adres: SLACK });
    const id = await bekleyenSatir(k.id);
    const [a, b] = await Promise.all([teslim.gonder(id), teslim.gonder(id)]);
    expect([a, b].filter((x) => x !== null)).toHaveLength(1);
    expect(webhook).toHaveBeenCalledTimes(1);
  });

  it('KRİTİK: e-postada KISMİ RET gönderildi sayılıyor ama reddedilenler ve cümlesi satırda', async () => {
    const { svc, teslim } = kur();
    await h.q(`INSERT INTO memberships (id, user_id, org_id, client_id, role, updated_at) VALUES (gen_random_uuid(), $1, $2, NULL, 'admin', now())`, [
      IDS.user,
      IDS.org,
    ]);
    await h.q(
      `INSERT INTO user_email_accounts (id, org_id, user_id, from_name, from_email, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass_enc, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Ajans', 'ajans@profaj.com', 'smtp.x', 465, true, 'ajans@profaj.com', $3, now())`,
      [IDS.org, IDS.user, crypto.encrypt('parola')],
    );
    const k = await svc.olustur(CTX, { tur: 'eposta', clientId: IDS.client, ad: 'Ekip', olaylar: ['kural'], alicilar: ['A@b.com', 'a@b.com', 'c@d.com'] });
    expect(k.alicilar).toEqual(['a@b.com', 'c@d.com']);
    expect((await svc.liste(CTX, IDS.client)).epostaGonderen).toEqual({ tanimli: true, adres: 'ajans@profaj.com' });
    mail.mockResolvedValueOnce({ kabul: ['a@b.com'], ret: [{ adres: 'c@d.com', sebep: '550 yok' }] });
    const id = await bekleyenSatir(k.id);
    const g = await teslim.gonder(id);
    expect(g!.durum).toBe('gonderildi');
    expect(g!.hata).toContain('1 alıcı reddetti');
    expect((await h.q(`SELECT reddedilen FROM bildirim_gonderimleri WHERE id = $1`, [id]))[0]).toEqual({ reddedilen: ['c@d.com'] });
    const [cagri] = mail.mock.calls[0] as unknown as [{ pass: string }, { to: string[] }];
    expect(cagri.pass).toBe('parola');
  });

  it('gönderen kimliği yoksa e-posta KALICI hatayla ve nedeniyle vazgeçiliyor', async () => {
    const { svc, teslim } = kur();
    const k = await svc.olustur(CTX, { tur: 'eposta', clientId: IDS.client, ad: 'E', olaylar: ['kural'], alicilar: ['a@b.com'] });
    const g = await teslim.gonder(await bekleyenSatir(k.id));
    expect(g).toMatchObject({ durum: 'vazgecildi', hata: EPOSTA_GONDEREN_YOK });
    expect(mail).not.toHaveBeenCalled();
  });
});

describe('09:00 sinyal özeti', () => {
  const SABAH = new Date('2026-10-12T06:05:00Z'); // İstanbul 09:05
  const ERKEN = new Date('2026-10-12T05:55:00Z'); // İstanbul 08:55

  async function acikSinyal(anahtar: string, sonAcilma: string) {
    await h.q(
      `INSERT INTO sinyaller (org_id, client_id, ad_account_id, platform, anahtar, tur, kod, yon, seviye, varlik_id, varlik_adi,
         gun, gozlenen, beklenen_orta, beklenen_alt, beklenen_ust, nokta, onem, para_birimi, son_acilma)
       VALUES ($1, $2, $3, 'meta', $4, 'anomali', 'harcama', 'artis', 'campaign', gen_random_uuid(), 'Kampanya X',
         '2026-10-11', 400, 100, 85, 115, 6, 'yuksek', 'TRY', $5)`,
      [IDS.org, IDS.client, IDS.adAccount, anahtar, sonAcilma],
    );
  }

  async function kanal(svc: BildirimService) {
    const k = await svc.olustur(CTX, { tur: 'slack', clientId: IDS.client, ad: 'S', olaylar: ['sinyal'], adres: SLACK });
    await h.q(`UPDATE bildirim_kanallari SET created_at = '2026-10-01T00:00:00Z'`);
    return k;
  }

  it('KRİTİK: 09:00 öncesi yok; sonra GÜNDE BİR satır; boş özet yok; damga ilerliyor', async () => {
    const { svc, teslim } = kur();
    const k = await kanal(svc);
    expect((await teslim.ozetleriUret(SABAH)).uretilen).toBe(0); // açık sinyal yok → boş özet gitmez
    await acikSinyal('a1', '2026-10-12T02:00:00Z');
    expect((await teslim.ozetleriUret(ERKEN)).uretilen).toBe(0);
    expect((await teslim.ozetleriUret(SABAH)).uretilen).toBe(1);
    expect((await teslim.ozetleriUret(new Date(SABAH.getTime() + 300_000))).uretilen).toBe(0);
    const rows = await h.q<{ anahtar: string; ozet: string }>(`SELECT anahtar, ozet FROM bildirim_gonderimleri WHERE kanal_id = $1`, [k.id]);
    expect(rows).toEqual([{ anahtar: 'ozet:2026-10-12', ozet: '1 yeni sinyal' }]);
    // 09:00'dan sonra açılan sinyal YARININ özetine kalıyor, kaybolmuyor.
    await acikSinyal('a2', '2026-10-12T07:00:00Z');
    expect((await teslim.ozetleriUret(new Date(SABAH.getTime() + 3_600_000))).uretilen).toBe(0);
    const yarin = new Date(SABAH.getTime() + 86_400_000);
    expect((await teslim.ozetleriUret(yarin)).uretilen).toBe(1);
    const [y] = await h.q<{ kaynaklar: string[] }>(`SELECT kaynaklar FROM bildirim_gonderimleri WHERE anahtar = 'ozet:2026-10-13'`);
    expect(y!.kaynaklar).toHaveLength(1);
  });

  it('KRİTİK: sessiz koşumda özet ÜRETİLMİYOR ve sinyal satırı gönderilmiyor', async () => {
    const { svc } = kur();
    const k = await kanal(svc);
    await acikSinyal('a1', '2026-10-12T02:00:00Z');
    const sessiz = kur(config(true));
    expect((await sessiz.teslim.ozetleriUret(SABAH)).uretilen).toBe(0);
    const id = await bekleyenSatir(k.id, 'sinyal', 'ozet:elle');
    const g = await sessiz.teslim.gonder(id);
    expect(g!.durum).toBe('vazgecildi');
    expect(webhook).not.toHaveBeenCalled();
  });

  it('özet gövdesi gönderimde Slack bloğuna çevriliyor ve panel bağlantısını taşıyor', async () => {
    const { svc, teslim } = kur();
    await kanal(svc);
    await acikSinyal('a1', '2026-10-12T02:00:00Z');
    await teslim.supur(SABAH);
    const govde = webhook.mock.calls[0]![2] as { text: string; blocks: Array<{ text: { text: string } }> };
    expect(govde.text).toContain('1 yeni sinyal');
    const hepsi = govde.blocks.map((b) => b.text.text).join('\n');
    expect(hepsi).toContain('Kampanya X');
    expect(hepsi).toContain(`https://panel.advetics.com/iyilestir?musteri=${IDS.client}&sekme=sinyaller`);
  });
});

describe('kural bildirimi (Ç-6)', () => {
  const RUN = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const KURAL = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  function kural(ek: Partial<RuleRecord>): RuleRecord {
    return { id: KURAL, name: 'Yüksek maliyet', clientId: IDS.client, dryRun: false, action: { type: 'pause' }, ...ek } as RuleRecord;
  }

  async function tur(outcome: string) {
    await h.q(
      `INSERT INTO rules (id, org_id, client_id, name, level, conditions, action, guard, updated_at)
       VALUES ($1, $2, $3, 'Yüksek maliyet', 'campaign', '[{"metric":"cpa","op":"gt","value":100}]'::jsonb, '{"type":"pause"}'::jsonb, '{}'::jsonb, now())
       ON CONFLICT DO NOTHING`,
      [KURAL, IDS.org, IDS.client],
    );
    await h.q(`INSERT INTO rule_runs (id, org_id, rule_id, dry_run, started_at) VALUES ($1, $2, $3, false, now()) ON CONFLICT DO NOTHING`, [
      RUN,
      IDS.org,
      KURAL,
    ]);
    await h.q(
      `INSERT INTO rule_action_logs (id, org_id, rule_id, run_id, entity_level, entity_id, entity_name, entity_external_id, action_type, outcome, reason, error)
       VALUES (gen_random_uuid(), $1, $2, $3, 'campaign', gen_random_uuid(), 'Kampanya A', 'c-1', 'pause', $4, 'CPA 300 > 200', $5)`,
      [IDS.org, KURAL, RUN, outcome, outcome === 'failed' ? 'Yazma izni yok' : null],
    );
  }

  it('KRİTİK: canlı kuralın BAŞARISIZ eylemi kural olayını alan kanallara gidiyor; prova gitmiyor', async () => {
    const { svc } = kur();
    const k = await svc.olustur(CTX, { tur: 'slack', clientId: IDS.client, ad: 'S', olaylar: ['kural'], adres: SLACK });
    await svc.olustur(CTX, { tur: 'slack', clientId: IDS.client, ad: 'Yalnız sinyal', olaylar: ['sinyal'], adres: SLACK });
    await tur('failed');
    const db = h.db as unknown as TxLike;
    expect(await kuralBildirimiYaz(db, kural({ dryRun: true }), RUN)).toBe(0);
    expect(await kuralBildirimiYaz(db, kural({}), RUN)).toBe(1);
    const [r] = await h.q<{ kanal_id: string; anahtar: string; govde: { satirlar: Array<{ metin: string }> } }>(
      `SELECT kanal_id::text AS kanal_id, anahtar, govde FROM bildirim_gonderimleri`,
    );
    expect(r!.kanal_id).toBe(k.id);
    expect(r!.anahtar).toBe(`kural:${RUN}`);
    expect(r!.govde.satirlar[0]!.metin).toBe('Yazma izni yok');
    // Tekrar: aynı tur için ikinci satır yok.
    expect(await kuralBildirimiYaz(db, kural({}), RUN)).toBe(0);
  });

  it('notify: yalnız kuralın SEÇTİĞİ kanallar; kanalsız eski kural yalnız geçmişe yazılır', async () => {
    const { svc } = kur();
    const a = await svc.olustur(CTX, { tur: 'slack', clientId: IDS.client, ad: 'A', olaylar: ['kural'], adres: SLACK });
    await svc.olustur(CTX, { tur: 'slack', clientId: IDS.client, ad: 'B', olaylar: ['kural'], adres: SLACK });
    await tur('simulated');
    const db = h.db as unknown as TxLike;
    expect(await kuralBildirimiYaz(db, kural({ action: { type: 'notify' } }), RUN)).toBe(0);
    expect(await kuralBildirimiYaz(db, kural({ action: { type: 'notify', kanalIdleri: [a.id] } }), RUN)).toBe(1);
    expect(await h.q(`SELECT kanal_id::text AS k FROM bildirim_gonderimleri`)).toEqual([{ k: a.id }]);
  });
});

describe('Ajan 4 düzeltmeleri', () => {
  it('KRİTİK (N-e): Slack’te kullanıcı kaynaklı ad kanal uyarısı/etiket/bağlantı ÜRETEMİYOR', () => {
    const g = govdeCoz(
      govdeKur({
        baslik: '<!channel> ACİL & <@U123>',
        konu: 'k',
        satirlar: [{ etiket: '<!here>', metin: '<https://evil.com|tıkla>' }],
        fazlaBirimi: 'x',
        baglanti: null,
      }),
      'https://p',
      IDS.client,
    );
    const metin = JSON.stringify(slackGovdesi(g));
    for (const tehlikeli of ['<!channel>', '<!here>', '<@U123>', '<https://evil.com|']) expect(metin).not.toContain(tehlikeli);
    expect((slackGovdesi(g) as { text: string }).text).toBe('&lt;!channel&gt; ACİL &amp; &lt;@U123&gt;');
  });

  it('KRİTİK (N-e): Teams’te markdown bağlantısı ve HTML etkisiz', () => {
    const g = govdeCoz(
      govdeKur({ baslik: 'Kural [tıkla](https://evil.com)', konu: 'k', satirlar: [{ etiket: '<b>x</b>', metin: '**kalın**' }], fazlaBirimi: 'x', baglanti: null }),
      'https://p',
      IDS.client,
    );
    for (const aile of ['baglayici', 'workflows'] as const) {
      // `summary` DÜZ METİN (bildirim önizlemesi, markdown yorumlanmıyor);
      // ham bırakılıyor ki önizlemede ters bölüler görünmesin.
      const { summary: _duz, ...isle } = teamsGovdesi(g, aile) as Record<string, unknown>;
      const metin = JSON.stringify(isle);
      expect(metin, aile).not.toContain('[tıkla](https://evil.com)');
      expect(metin, aile).not.toContain('**kalın**');
    }
    expect(JSON.stringify(teamsGovdesi(g, 'baglayici'))).not.toContain('<b>');
  });

  it('KRİTİK (N-f): yarıda kalmış deneme süpürmede vazgeçiliyor (bekliyor’da kalmıyor)', async () => {
    const { svc, teslim } = kur();
    const k = await svc.olustur(CTX, { tur: 'slack', clientId: IDS.client, ad: 'S', olaylar: ['sinyal'], adres: SLACK });
    const id = await bekleyenSatir(k.id, 'kural', 'deneme:yetim');
    await h.q(`UPDATE bildirim_gonderimleri SET olay = 'deneme', created_at = now() - interval '1 hour' WHERE id = $1`, [id]);
    const taze = await bekleyenSatir(k.id, 'kural', 'deneme:taze');
    await h.q(`UPDATE bildirim_gonderimleri SET olay = 'deneme' WHERE id = $1`, [taze]);
    const r = await teslim.supur();
    expect(r.note).toContain('1 yarıda kalmış deneme kapatıldı');
    expect((await h.q(`SELECT durum FROM bildirim_gonderimleri WHERE id = $1`, [id]))[0]).toEqual({ durum: 'vazgecildi' });
    // Ucun hâlâ gönderiyor olabileceği taze deneme ellenmiyor ve süpürme onu GÖNDERMİYOR.
    expect((await h.q(`SELECT durum FROM bildirim_gonderimleri WHERE id = $1`, [taze]))[0]).toEqual({ durum: 'bekliyor' });
    expect(webhook).not.toHaveBeenCalled();
  });
});
