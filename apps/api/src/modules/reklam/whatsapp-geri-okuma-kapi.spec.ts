import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { beklenenYankilar, derleMeta, geriOkumaNotlariniSec, type DerlemeGirdisi } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { SahteMeta } from '../../../test/reklam-sahte-meta';
import { MetaKesinHata, YayinMotoru, yayinKaydiOlustur, type TxRunner } from './yayin-motoru';

/**
 * AJAN 4 KAPISI — N-21 (`advantage_state_info`) OKUMA YÜZEYİ (1b2671e8).
 *
 * N-21 yalnız BİLGİ: ne gönderiyoruz ne değiştirebiliriz. Ama alan kampanya
 * okumasının ALAN LİSTESİNE ekleniyor ve canlıda ÖLÇÜLMEDİ. Graph bilinmeyen
 * ya da izin istemeyen bir alanı `(#100) Tried accessing nonexisting field`
 * ile reddederse İSTEĞİN TAMAMI düşüyor (CLAUDE.md "TEK geçersiz ad isteğin
 * tamamını düşürüyor"): kampanyanın bütçe, hedef, kategori satırlarının
 * hepsi "dönmedi" olur ve WhatsApp/form yayını "okunamadı"da DURUR. Yani bir
 * bilgi satırı, canlıda iki turda çalışmış yayın yolunu kilitleyebilir.
 * Form geri okumasında aynı risk için "alan reddedilirse temel alanlarla
 * yeniden oku" yolu var (`form-publisher.service.ts#geriOku`); reklam
 * motorunda yok.
 */
const ACIK = async () => ({ acik: true as const });
let h: Harness;
let tx: TxRunner;
const VARLIK = '66666666-0000-4000-8000-000000000001';
const HESAP = '44444444-0000-4000-8000-000000000001';

beforeAll(async () => {
  h = await createHarness();
  tx = (fn) => fn(h.db as never);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q('DELETE FROM ad_accounts');
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'act_1', 'H', 'TRY', 'Europe/Istanbul', now())`,
    [HESAP, IDS.org, IDS.client, IDS.connection],
  );
});

async function hazirla(): Promise<string> {
  const [t] = await h.q<{ id: string }>(
    `INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, olusturan_id)
     VALUES ($1, $2, 'meta', 'acemi', $3) RETURNING id::text`,
    [IDS.org, IDS.client, IDS.user],
  );
  const id = randomUUID();
  const g: DerlemeGirdisi = {
    apiSurumu: 'v25.0',
    yayinKimligi: id,
    tarih: '2026-10-12',
    workspaceKisaAdi: 'Ege',
    niyet: 'WHATSAPP',
    hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
    sayfaPlatformId: '111',
    instagramPlatformId: null,
    hedefleme: { konumlar: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
    kategoriler: { taban: [], ek: [] },
    butce: { tip: 'gunluk', micros: 500_000_000n, seviye: 'kampanya' },
    takvim: { baslangic: '2026-10-13T00:00:00+0300', bitis: null },
    atif: 'tik7_gor1',
    kavramlar: [{ gorselHash: `{medya:${VARLIK}}`, baslik: 'B', metin: 'M' }],
    hedefAdres: null,
    formId: null,
    telefon: null,
    whatsappNumarasi: '+905321234567',
    urlEtiketleri: null,
  };
  const r = derleMeta(g);
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  await yayinKaydiOlustur(tx, {
    id,
    orgId: IDS.org,
    clientId: IDS.client,
    taslakId: t!.id,
    taslakSurumNo: 1,
    icerikOzeti: 'a'.repeat(64),
    adAccountId: HESAP,
    govdeler: r.govdeler,
    yankilar: beklenenYankilar(r.govdeler),
    apiSurumu: 'v25.0',
    derleyiciSurumu: r.derleyiciSurumu,
    atifStandardi: 'tik7_gor1',
    medyaVarliklari: [VARLIK],
    videoVarliklari: [],
    kaynak: 'panel',
    baslatanId: IDS.user,
    testKipi: false,
    kapaliKalacak: false,
  });
  return id;
}

describe('N-21 okuma yüzeyi', () => {
  it('kusursuz Meta: WhatsApp yayını açılıyor (zemin)', async () => {
    const meta = new SahteMeta();
    const id = await hazirla();
    expect(await new YayinMotoru(tx, meta, 'act_1', ACIK, async () => undefined).kur(id)).not.toMatch(/dogrulanamadi|fark_var/);
    // Ekrana giden notlar GERÇEK geri okuma satırından: Advantage+ bilgisi var,
    // karşılama aynen döndüğü için uyarı YOK.
    const [g] = await h.q<{ bilgiler: unknown }>('SELECT bilgiler FROM geri_okuma WHERE yayin_id = $1', [id]);
    const notlar = geriOkumaNotlariniSec(g!.bilgiler);
    expect(notlar.filter((n) => n.tur === 'bilgi').map((n) => n.metin)).toEqual(['Meta bu kampanyanın Advantage+ durumunu döndürmedi.']);
    expect(notlar.filter((n) => n.tur === 'uyari')).toEqual([]);
  });

  it('Meta karşılamayı farklı kaydederse yayın AÇILIR ama uyarı notu ekrana gider', async () => {
    const meta = new SahteMeta();
    meta.okumaBozucu = (_id, o) => {
      const oss = o.object_story_spec as Record<string, any> | undefined;
      if (!oss?.link_data?.page_welcome_message) return o;
      return { ...o, object_story_spec: { ...oss, link_data: { ...oss.link_data, page_welcome_message: { text_format: { customer_action_type: 'autofill_message', message: { text: 'Hello! Can I get more info on this?' } } } } } };
    };
    const id = await hazirla();
    expect(await new YayinMotoru(tx, meta, 'act_1', ACIK, async () => undefined).kur(id)).not.toMatch(/dogrulanamadi|fark_var/);
    const [g] = await h.q<{ bilgiler: unknown }>('SELECT bilgiler FROM geri_okuma WHERE yayin_id = $1', [id]);
    expect(geriOkumaNotlariniSec(g!.bilgiler).filter((n) => n.tur === 'uyari')).toHaveLength(1);
  });

  it('KRİTİK: Meta `advantage_state_info`yu reddederse yayın "okunamadı"da DURMAMALI (bilgi satırı yayını kilitleyemez)', async () => {
    const meta = new SahteMeta();
    const eski = meta.oku.bind(meta);
    meta.oku = async (oid, alanlar) => {
      if (alanlar.includes('advantage_state_info')) {
        throw new MetaKesinHata('(#100) Tried accessing nonexisting field (advantage_state_info) on node type (Campaign)', 100);
      }
      return eski(oid, alanlar);
    };
    const id = await hazirla();
    const sonuc = await new YayinMotoru(tx, meta, 'act_1', ACIK, async () => undefined).kur(id);
    expect(sonuc).not.toBe('dogrulanamadi');
    expect(sonuc).not.toBe('fark_var');
  });

  it('KRİTİK: reddedilen bilgi alanı ekranda SEBEBİYLE "okunamadı"; ana alanlar yine kıyaslanıyor', async () => {
    const meta = new SahteMeta();
    const eski = meta.oku.bind(meta);
    const istekler: string[][] = [];
    meta.oku = async (oid, alanlar) => {
      istekler.push(alanlar);
      if (alanlar.includes('advantage_state_info')) {
        throw new MetaKesinHata('(#100) Tried accessing nonexisting field (advantage_state_info) on node type (Campaign)', 100);
      }
      return eski(oid, alanlar);
    };
    const id = await hazirla();
    await new YayinMotoru(tx, meta, 'act_1', ACIK, async () => undefined).kur(id);
    // Bilgi alanı YALNIZ kendi isteğinde; ana okuma onu hiç istemiyor.
    expect(istekler.filter((a) => a.includes('advantage_state_info'))).toEqual([['advantage_state_info']]);
    expect(istekler.some((a) => a.includes('daily_budget'))).toBe(true);
    const [g] = await h.q<{ bilgiler: unknown; ham: Record<string, unknown> }>('SELECT bilgiler, ham FROM geri_okuma WHERE yayin_id = $1', [id]);
    expect(geriOkumaNotlariniSec(g!.bilgiler).filter((n) => n.tur === 'bilgi').map((n) => n.metin)).toEqual([
      'Advantage+ durumu okunamadı: (#100) Tried accessing nonexisting field (advantage_state_info) on node type (Campaign)',
    ]);
    expect(g!.ham.ek_okuma_hatalari).toBeDefined();
  });
});
