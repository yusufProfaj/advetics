import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Prisma } from '@prisma/client';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import { ayarAc, lead, olay, olaylar, PIKSEL, UZUN_LEAD_ID } from '../../../test/geri-besleme-tohum';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { QuotaGuardService } from '../../queue/quota-guard.service';
import type { ProviderRegistry } from '../connections/provider.registry';
import type { TokenVaultService } from '../connections/token-vault.service';
import { GeriBeslemeGonderimService } from './geri-besleme-gonderim.service';

/**
 * ═══ AJAN 4 · PAKET E KAPI TESTLERİ (saldırgan + sessiz hata gözü) ═══
 *
 * Bu dosyadaki testlerin BİR KISMI BİLEREK KIRMIZI: her biri bir bulgunun
 * (Ö-1 … Ö-3, N-1, N-2) beklenen davranışını kilitliyor ve düzeltmeyi
 * bulguyu üreten ajan yapacak. Yeşil olanlar kapının KORUMA iddiaları
 * (kişisel veri, token sızıntısı) — mutasyonla doğrulandı.
 *
 * Canlı Meta YOK: `fetch` sahte, cevaplar belgedeki biçimde.
 */
let h: Harness;
const SIMDI = new Date('2026-10-12T10:00:00Z');
const saatOnce = (n: number) => new Date(SIMDI.getTime() - n * 3_600_000);
const L1 = 'cccccccc-0000-4000-8000-000000000001';
const L2 = 'cccccccc-0000-4000-8000-000000000002';

const EPOSTA = 'ayse.kaya@ornek.com.tr';
const TELEFON = '+905321234567';
const AD = 'Ayşe Kaya';

type Cagri = { url: string; govde: string; yetki: string | null };
let cagrilar: Cagri[] = [];
let cevap: (govde: string) => { status: number; body: unknown };
let gecikmeMs = 0;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Gövdedeki olayların sayısı; lead_id sayı literali olduğundan önce tırnaklanıyor. */
function olaySayisi(g: string): number {
  return (JSON.parse(g.replace(/"lead_id":(\d+)/g, '"lead_id":"$1"')) as { data: unknown[] }).data.length;
}

function eventIdleri(): string[] {
  return cagrilar.flatMap((c) =>
    (JSON.parse(c.govde.replace(/"lead_id":(\d+)/g, '"lead_id":"$1"')) as { data: Array<{ event_id: string }> }).data.map((o) => o.event_id),
  );
}

function kur(db: unknown = h.db): GeriBeslemeGonderimService {
  return new GeriBeslemeGonderimService(
    db as PrismaAdminService,
    { getAccessToken: vi.fn(async () => 'TOKEN-GIZLI-abc123') } as unknown as TokenVaultService,
    { get: () => ({}) } as unknown as ProviderRegistry,
    {
      acquire: vi.fn(async () => ({ allowed: true })),
      record: vi.fn(async () => undefined),
    } as unknown as QuotaGuardService,
  );
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
  cagrilar = [];
  gecikmeMs = 0;
  cevap = (g) => ({ status: 200, body: { events_received: olaySayisi(g), fbtrace_id: 'AbC' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const govde = String(init.body ?? '');
      cagrilar.push({ url, govde, yetki: new Headers(init.headers).get('authorization') });
      if (gecikmeMs > 0) await new Promise((r) => setTimeout(r, gecikmeMs));
      const c = cevap(govde);
      return json(c.status, c.body);
    }),
  );
  await lead(h, { id: L1, externalId: UZUN_LEAD_ID, submittedAt: saatOnce(3), ad: AD });
  await lead(h, { id: L2, externalId: '223456789012345', submittedAt: saatOnce(3), ad: AD });
  // Kişisel verinin TAMAMI lead satırında dolu: gövdeye sızarsa yakalansın.
  await h.q(`UPDATE leads SET email = $1, phone = $2, fields = $3::jsonb`, [
    EPOSTA,
    TELEFON,
    JSON.stringify([{ name: 'city', values: ['İzmir'] }, { name: 'email', values: [EPOSTA] }]),
  ]);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
// KORUMA İDDİALARI (yeşil olmalı)
// ─────────────────────────────────────────────────────────────────────────────

describe('PII: Meta’ya giden gövde (yapısal tarama)', () => {
  it('KRİTİK: her olayın anahtar kümesi BİREBİR izinli küme; user_data yalnız lead_id; düz ya da hash’li kişisel veri yok', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    await olay(h, { leadId: L2, asama: 'ulasildi', olayZamani: saatOnce(1) });
    await kur().calistir(IDS.client, SIMDI);

    expect(cagrilar).toHaveLength(1);
    const govde = cagrilar[0]!.govde;
    const g = JSON.parse(govde.replace(/"lead_id":(\d+)/g, '"lead_id":"$1"')) as { data: Array<Record<string, unknown>> };
    // Kök: YALNIZ `data` (test_event_code, partner_agent vb. yok).
    expect(Object.keys(g)).toEqual(['data']);
    for (const o of g.data) {
      expect(Object.keys(o).sort()).toEqual(['action_source', 'custom_data', 'event_id', 'event_name', 'event_time', 'user_data']);
      expect(Object.keys(o.user_data as object)).toEqual(['lead_id']);
      expect(Object.keys(o.custom_data as object).sort()).toEqual(['event_source', 'lead_event_source']);
    }
    // Düz ve SHA-256 (Meta'nın normalleştirmesiyle) kişisel veri hiçbir yerde yok.
    const sha = (s: string) => createHash('sha256').update(s.trim().toLowerCase()).digest('hex');
    for (const parca of [EPOSTA, TELEFON, TELEFON.replace('+', ''), 'Ayşe', 'Kaya', 'İzmir', sha(EPOSTA), sha(TELEFON.replace('+', '')), sha('ayşe'), sha('kaya')]) {
      expect(govde).not.toContain(parca);
    }
    // event_id iç UUID'den türüyor; Meta lead kimliğini ya da kişiyi taşımıyor.
    for (const o of g.data) expect(String(o.event_id)).toMatch(/^adv-[0-9a-f-]{36}-[a-z_]+$/);
  });

  it('KRİTİK: token yalnız Authorization başlığında; URL’de, veritabanında ve iş notunda YOK (hata yolunda da)', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    await olay(h, { leadId: L2, asama: 'ham_lead', olayZamani: saatOnce(3) });
    // Meta'nın hata mesajı isteği "yankılıyor" olsa bile token oraya girmemeli.
    cevap = () => ({ status: 400, body: { error: { code: 100, message: 'Invalid parameter', fbtrace_id: 'Zz' } } });
    const r = await kur().calistir(IDS.client, SIMDI);

    for (const c of cagrilar) {
      expect(c.url).not.toContain('TOKEN-GIZLI');
      expect(c.govde).not.toContain('TOKEN-GIZLI');
      expect(c.yetki).toBe('Bearer TOKEN-GIZLI-abc123');
    }
    expect(r.note).not.toContain('TOKEN-GIZLI');
    const dokum = JSON.stringify([
      await h.q('SELECT * FROM geri_besleme_olaylari'),
      await h.q('SELECT * FROM geri_besleme_ayarlari'),
    ]);
    expect(dokum).not.toContain('TOKEN-GIZLI');
    expect(dokum).not.toContain(EPOSTA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BULGULAR (bilerek KIRMIZI)
// ─────────────────────────────────────────────────────────────────────────────

describe('Ö-1 · sahiplenme yok: aynı olay iki kez Meta’ya gidebiliyor', () => {
  /*
   * Gönderim işi satırları SAHİPLENMEDEN seçiyor (`SELECT ... LIMIT 200`,
   * `FOR UPDATE SKIP LOCKED` / ara durum yok) ve sonucu çağrıdan SONRA yazıyor.
   * Tek koruma BullMQ iş kimliği. İş `stalled` sayılıp ikinci bir slotta
   * yeniden başlatıldığında (olay döngüsü kilidi kaçırdı, deploy) ya da
   * kabul sonrası yazım düştüğünde aynı `event_id` ikinci kez gidiyor.
   * Meta'nın CRM olayını event_id ile tekilleştirip tekilleştirmediği
   * ÖLÇÜLMEDİ (M-6) ve sözleşme "platform tekilleştirmesine yaslanmıyoruz"
   * diyor: tekillik bizim tarafta garanti edilmeli.
   */
  it('KIRMIZI: iki eşzamanlı koşu aynı workspace’te her olayı EN FAZLA BİR KEZ gönderir', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    await olay(h, { leadId: L2, asama: 'ham_lead', olayZamani: saatOnce(3) });
    gecikmeMs = 30;
    const s = kur();
    await Promise.all([s.calistir(IDS.client, SIMDI), s.calistir(IDS.client, SIMDI)]);

    const idler = eventIdleri();
    expect(new Set(idler).size).toBe(2); // boşa düşme bekçisi: iki olay da gerçekten gitti
    expect(idler).toHaveLength(2);
  });

  it('KIRMIZI: Meta kabul etti ama "iletildi" yazımı düştü → sonraki tur aynı olayı YENİDEN göndermez', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    let dusur = true;
    const db = {
      ...h.db,
      $executeRaw: async (q: Prisma.Sql) => {
        if (dusur && q.sql.includes("durum = 'iletildi'")) {
          dusur = false;
          throw new Error('bağlantı koptu (simülasyon)');
        }
        return h.db.$executeRaw(q);
      },
    };
    await expect(kur(db).calistir(IDS.client, SIMDI)).rejects.toThrow('bağlantı koptu');
    expect(cagrilar).toHaveLength(1); // bekçi: Meta'ya gerçekten gitti
    await kur().calistir(IDS.client, new Date(SIMDI.getTime() + 5 * 60_000));
    expect(eventIdleri()).toEqual([`adv-${L1}-ham_lead`]);
  });
});

describe('Ö-2 · veri kümesi sahipliği gönderim anında doğrulanmıyor', () => {
  /*
   * `ayarYaz` dataset'i workspace'in Meta hesaplarının piksel listesinde
   * doğruluyor (Ç-7: "yanlış datasete giden CRM olayları başka bir projenin
   * modelini eğitir ve geri alınamaz"). Ama doğrulama YALNIZ kayıt anında:
   * hesap sonradan workspace'ten alınınca (havuza dönünce ya da başka
   * müşteriye atanınca) ayar açık kalıyor ve `calistir` hesap bulamazsa
   * kota anahtarını `dataset_<id>`e düşürüp GÖNDERMEYE DEVAM EDİYOR.
   * Ön koşul: workspace'in bu bağlantıyla en az bir Meta hesabı olmalı;
   * yoksa çağrı yok, ayar "kurulum eksik"e düşer ve sebep notta.
   */
  it('KIRMIZI: workspace’in Meta hesabı kalmadıysa platform çağrısı SIFIR ve not sebebi söylüyor', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    await h.q(`UPDATE ad_accounts SET client_id = NULL, sync_enabled = false WHERE id = $1`, [IDS.adAccount]);
    const r = await kur().calistir(IDS.client, SIMDI);
    expect(cagrilar).toHaveLength(0);
    expect(r.note).toMatch(/hesap/i);
    expect((await olaylar(h))[0]).toMatchObject({ durum: 'bekliyor', deneme: 0 });
  });
});

describe('Ö-3 · sistematik olay hatası yarılamayla 2n-1 istek ve toplu kalıcı ret', () => {
  /*
   * Yarılama TEK kötü olay için doğru. Ama ret olaya değil BİÇİME aitse
   * (M-3: Meta `lead_id`i sayı literali olarak kabul etmezse; veri kümesi
   * CRM'e açık değilse ve kod 100/33 dışında dönerse) her olay reddediliyor
   * ve 50'lik parti 99 istek harcıyor; 200 satırlık tur ~400 istek ve
   * satırların TAMAMI kalıcı `reddedildi`. İlk canlı günün en olası hâli.
   * Beklenen: ilk yarılamada iki yarı da AYNI hatayla düşerse bu bir ayar/
   * biçim hatası sayılır, istek sayısı log2 mertebesinde kalır.
   */
  it('KIRMIZI: 50 olayın hepsi aynı hatayla reddedilince istek sayısı ≤ 2·log2(50)+2', async () => {
    await ayarAc(h);
    for (let i = 0; i < 50; i++) {
      const id = `dddddddd-0000-4000-8000-${String(i).padStart(12, '0')}`;
      await lead(h, { id, externalId: `3${String(i).padStart(14, '0')}`, submittedAt: saatOnce(3) });
      await olay(h, { leadId: id, asama: 'ham_lead', olayZamani: saatOnce(3) });
    }
    cevap = () => ({ status: 400, body: { error: { code: 100, error_subcode: 2804050, message: 'Invalid parameter: lead_id' } } });
    await kur().calistir(IDS.client, SIMDI);
    expect(cagrilar.length).toBeGreaterThan(0);
    expect(cagrilar.length).toBeLessThanOrEqual(14);
  });
});

describe('N-1 · panel: "Geri al" süre dolunca kaybolmuyor', () => {
  /*
   * `lead-table.tsx` kalan süreyi render anında `Date.now()` ile hesaplıyor
   * ve yeniden render ettiren bir saat (setInterval/setTimeout) YOK. Kart
   * hareketsiz kalırsa düğme 15 dakikadan sonra da görünüyor; o arada
   * süpürme olayı göndermiş olabilir ve tıklama "geri alındı" sandırıyor —
   * dosyanın kendi yorumunun yasakladığı hâl.
   */
  it('KIRMIZI: geri alma penceresi için bir zamanlayıcı var (pencere kapanınca yeniden render)', () => {
    const kaynak = readFileSync(join(__dirname, '../../../../web/src/components/leads/lead-table.tsx'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(kaynak).toContain('geriAlmaKalanDk('); // bekçi: doğru dosya
    expect(/set(Interval|Timeout)\(/.test(kaynak), 'lead-table.tsx içinde zamanlayıcı yok').toBe(true);
  });
});

describe('N-2 · müşteri hesabı (client_viewer) geri besleme uyarısını görüyor', () => {
  /*
   * Uyarı ucu `insights.read` ile açık (müşteri hesabında VAR); geri besleme
   * uyarısı izin süzgeci olmadan ekleniyor. Müşteri Meta'nın ham hata
   * cümlesini ve `lead.read` olmadan AÇAMADIĞI bir sayfaya bağlantıyı
   * görüyor. Genel Bakış'ın bekleyen işi bunu `BEKLEYEN_IS_YETKISI` ile
   * süzüyor; uyarı süzmüyor (aynı süzgecin iki yerde yazılmaması dersi).
   */
  it('KIRMIZI: alerts.service geri besleme bloğu lead.read iznine bağlı', () => {
    const kaynak = readFileSync(join(__dirname, '../alerts/alerts.service.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const i = kaynak.indexOf('geriBeslemeUyariSatirlari(tx');
    expect(i).toBeGreaterThan(0); // bekçi
    const once = kaynak.slice(Math.max(0, i - 300), i);
    expect(/permissions\.includes\(\s*'lead\.read'\s*\)/.test(once), 'geri besleme uyarısı izin süzgeçsiz').toBe(true);
  });
});

/** Kullanılmayan import uyarısı olmasın: PIKSEL tohumun veri kümesi. */
void PIKSEL;
