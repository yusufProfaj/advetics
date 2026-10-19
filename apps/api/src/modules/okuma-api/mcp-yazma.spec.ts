import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { LeadFormRecord, RehberHazirligi, RehberKaydi, TenantContext } from '@advetics/shared';
import { MCP_TALIMATLARI, MCP_YAZMA_TALIMATLARI, mcpIsle, type McpAraci } from './mcp-protokol';
import { BUTCE_UYARI_ESIGI_YUZDE, formIcerikOzeti, formOnayOzeti, rehberOnayOzeti, varlikOnayOzeti } from './mcp-onay-ozeti';
import { ONAYLI_ARACLAR, YAZMA_ARACLARI, yazmaAraciBul } from './mcp-yazma-araclari';
import { McpYazmaService, type YazmaIstegi } from './mcp-yazma.service';
import { dosyaTuru, jetonCoz, jetonUret } from './mcp-yukleme';
import { yuklemeAdresi } from './okuma-api.controller';
import { OKUMA_ARACLARI } from './okuma-araclari';

/**
 * ═══ MCP YAZMA — ONAY KAPISI, YETKİ, JETON, ÖZET ═══
 * (`docs/okuma-api/MCP-YAZMA-MIMARI.md`)
 *
 * Servis gerçek, bağımlılıkları sahte: iddia "hangi servis HANGİ ARGÜMANLA
 * ne zaman çağrıldı". Kritik olanlar:
 *  - onaylı araç platform servisini (`rehber.yayinla`, `actions.uygula`)
 *    HİÇ çağırmıyor; çağrı yalnız `onayla`dan,
 *  - `onayla` modelin değil SUNUCUNUN sakladığı argümanı kullanıyor,
 *  - yayın her zaman `hepsiKapali: true`,
 *  - okuma anahtarı, erişilemeyen workspace ve eksik izin reddediliyor.
 */

const WS = '11111111-1111-4111-8111-111111111111';
const BASKA_WS = '22222222-2222-4222-8222-222222222222';
const REHBER = '33333333-3333-4333-8333-333333333333';
const KAMPANYA = '44444444-4444-4444-8444-444444444444';
const OZET = 'a'.repeat(64);
const FORM = '88888888-8888-4888-8888-888888888888';
const SAYFA = '66666666-6666-4666-8666-666666666666';

function formKaydi(d: Partial<LeadFormRecord> = {}): LeadFormRecord {
  return {
    id: FORM,
    clientId: WS,
    socialProfileId: SAYFA,
    socialProfileName: 'Ornek Sayfa',
    name: 'Seasight bilgi',
    formType: 'higher_intent',
    headline: 'Villanızı ayırtın',
    intro: null,
    prefillQuestions: ['FULL_NAME', 'PHONE'],
    customQuestions: [{ type: 'multiple_choice', label: 'Ne zaman almayı düşünüyorsunuz?', options: ['Hemen', '6 ay içinde'] }],
    privacyPolicyUrl: 'https://ornek.com/gizlilik',
    privacyPolicyLinkText: 'Gizlilik Politikası',
    consentBoxes: [{ text: 'KVKK açık rıza metni', required: true }],
    thankYouHeadline: 'Teşekkürler!',
    thankYouBody: 'Size dönüş yapacağız.',
    thankYouCtaText: 'Bizi ara',
    thankYouCtaUrl: null,
    thankYouCtaType: 'CALL_BUSINESS',
    thankYouPhone: '+905321234567',
    status: 'draft',
    externalFormId: null,
    readbackWarning: null,
    version: 1,
    rootId: FORM,
    supersededById: null,
    error: null,
    publishedAt: null,
    createdAt: '2026-10-20T00:00:00.000Z',
    ...d,
  };
}

const EV_CTX = { userId: 'u1', orgId: 'o1', activeClientId: null, permissions: [], platformAdmin: true } as unknown as TenantContext;

function rehberKaydi(degisiklik: Partial<RehberKaydi> = {}): RehberKaydi {
  const z = '2026-10-19T00:00:00.000Z';
  const a = <T>(deger: T) => ({ deger, kaynak: 'kullanici' as const, kim: 'u1', zaman: z });
  return {
    id: REHBER,
    clientId: WS,
    durum: 'taslak',
    surum: 3,
    alanlar: {
      amac: a('SITE' as const),
      platformlar: a({ meta: true, google: false }),
      metaHesabiId: a('55555555-5555-4555-8555-555555555555'),
      sayfaId: a('66666666-6666-4666-8666-666666666666'),
      butce: a({ tip: 'gunluk' as const, micros: '500000000' }),
      takvim: a({ baslangic: '2026-10-20', bitis: null }),
      konumlar: a([{ tur: 'city' as const, key: '1', etiket: 'İzmir', ulkeKodu: 'TR' }]),
      enDusukYas: a(18),
      ekKategoriler: a([] as never[]),
      hedefAdres: a('https://ornek.com'),
      medya: a([{ varlikId: '77777777-7777-4777-8777-777777777777' }]),
      metin: a({ anaMetin: 'Yeni sezon', basliklar: ['Hemen gel'], aciklamalar: [] }),
    },
    eksikler: [],
    kararlar: [],
    metaTaslakId: null,
    googleTaslakId: null,
    icerikOzeti: OZET,
    updatedAt: z,
    ...degisiklik,
  };
}

const HAZIRLIK = {
  hesaplar: [{ id: '55555555-5555-4555-8555-555555555555', ad: 'Ornek Meta', disKimlik: 'act_1', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul' }],
  googleHesaplari: [],
  sayfalar: [{ id: '66666666-6666-4666-8666-666666666666', ad: 'Ornek Sayfa', ustSayfaPlatformId: null }],
  instagramHesaplari: [],
} as unknown as RehberHazirligi;

/** Bellekte onay servisi: `al` tek seferlik (atomik almanın davranışı; gerçeği RLS testinde). */
function sahteOnay() {
  const satirlar = new Map<string, { islem: string; hedef: Record<string, unknown>; durum: string; ozet: string[] }>();
  let n = 0;
  return {
    satirlar,
    ac: vi.fn(async (_ev: unknown, islem: string, hedef: Record<string, unknown>, ozet: string[]) => {
      const id = `00000000-0000-4000-8000-00000000000${++n}`;
      satirlar.set(id, { islem, hedef, durum: 'bekliyor', ozet });
      return { id, ozet, bitis: '2026-10-19T00:15:00.000Z' };
    }),
    al: vi.fn(async (_ev: unknown, kod: string) => {
      const s = satirlar.get(kod);
      if (!s || s.durum !== 'bekliyor') throw new Error('alınamadı');
      s.durum = 'uygulaniyor';
      return { id: kod, islem: s.islem, hedef: s.hedef };
    }),
    bitir: vi.fn(async (_ev: unknown, id: string, durum: string) => {
      satirlar.get(id)!.durum = durum;
    }),
    vazgec: vi.fn(),
    listele: vi.fn(),
  };
}

function kur(
  o: {
    izinler?: string[];
    aktif?: string;
    rehber?: Partial<RehberKaydi>;
    prova?: unknown;
    dogrulama?: string;
    form?: Partial<LeadFormRecord>;
    engeller?: string[];
    yayinlanan?: Partial<LeadFormRecord>;
  } = {},
) {
  const rehber = {
    oku: vi.fn(async () => rehberKaydi(o.rehber)),
    provaOku: vi.fn(async () => o.prova !== undefined ? o.prova : { icerikOzeti: OZET, meta: { tur: 'gecti', zaman: 'z', not: null }, google: null }),
    hazirlik: vi.fn(async () => HAZIRLIK),
    yayinla: vi.fn(async () => ({ rehberId: REHBER, platformlar: [{ platform: 'meta', yayinId: 'y1', sebep: null }], uyum: null })),
  };
  const actions = {
    onizle: vi.fn(async () => ({ platform: 'meta', varlikAdi: 'Kampanya A', clientId: WS, once: { status: 'active', budgetMode: 'daily', budgetAmountMicros: '500000000' }, currency: 'TRY' })),
    uygula: vi.fn(async () => ({ varlikAdi: 'Kampanya A', platform: 'meta', dogrulama: o.dogrulama ?? 'dogrulandi', platformDegeri: 'Duraklatıldı' })),
  };
  const tenant = {
    resolve: vi.fn(async () => ({
      context: { ...EV_CTX, activeClientId: o.aktif ?? WS, permissions: o.izinler ?? ['bulk.read', 'bulk.write', 'bulk.publish', 'budget.write'] },
    })),
  };
  const admin = { $queryRaw: vi.fn(async () => [{ ad: 'Ornek WS', org_id: 'o2', manager_account_id: null }]) };
  const onay = sahteOnay();
  const forms = {
    get: vi.fn(async () => formKaydi(o.form)),
    list: vi.fn(async () => [formKaydi(o.form)]),
    create: vi.fn(async (_c: unknown, g: { clientId: string; socialProfileId: string }) => formKaydi({ clientId: g.clientId, socialProfileId: g.socialProfileId })),
    checks: vi.fn(async () => ({ blockers: o.engeller ?? [], warnings: [] })),
  };
  const formYayinci = {
    publish: vi.fn(async () => formKaydi({ status: 'published', externalFormId: '1234567890', ...o.yayinlanan })),
  };
  const svc = new McpYazmaService(
    admin as never,
    {} as never,
    tenant as never,
    rehber as never,
    actions as never,
    onay as never,
    {} as never,
    {} as never,
    { jwt: { accessSecret: 'gizli' } } as never,
    forms as never,
    formYayinci as never,
  );
  return { svc, rehber, actions, tenant, onay, forms, formYayinci };
}

const ISTEK: YazmaIstegi = { ctx: EV_CTX, anahtarId: 'k1', yetki: 'yazma', requestId: 'r', yuklemeAdresi: 'https://advetics.com/api/mcp/yukleme' };
const cagir = (svc: McpYazmaService, ad: string, args: unknown, istek: YazmaIstegi = ISTEK) => svc.calistir(istek, yazmaAraciBul(ad)!, args);

describe('KRİTİK: onaylı araçlar platforma HİÇBİR ŞEY göndermiyor', () => {
  it('rehber_yayinla onay satırı açıyor, yayinla ÇAĞRILMIYOR; onayla saklı özetle ve hepsiKapali ile yayınlıyor', async () => {
    const t = kur();
    const c = (await cagir(t.svc, 'rehber_yayinla', { workspace_id: WS, rehber_id: REHBER })) as { onayGerekli: boolean; onayKodu: string; ozet: string[] };
    expect(c.onayGerekli).toBe(true);
    expect(t.rehber.yayinla).not.toHaveBeenCalled();
    expect(c.ozet.some((s) => s.includes('DURAKLATILMIŞ'))).toBe(true);

    // Onaydan sonra rehber değişse bile ONAYLANAN özet gidiyor (yayinla 409 verir, değişen içerik yayınlanmaz).
    t.rehber.oku.mockResolvedValue(rehberKaydi({ icerikOzeti: 'b'.repeat(64) }));
    const s = (await cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu })) as { durum: string };
    expect(s.durum).toBe('uygulandi');
    expect(t.rehber.yayinla).toHaveBeenCalledTimes(1);
    expect(t.rehber.yayinla).toHaveBeenCalledWith(expect.anything(), REHBER, OZET, { hepsiKapali: true });
  });

  it('aynı kodla ikinci onayla İKİNCİ yayın açmıyor', async () => {
    const t = kur();
    const c = (await cagir(t.svc, 'rehber_yayinla', { workspace_id: WS, rehber_id: REHBER })) as { onayKodu: string };
    await cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu });
    await expect(cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu })).rejects.toThrow();
    expect(t.rehber.yayinla).toHaveBeenCalledTimes(1);
  });

  for (const [ad, args, eylem] of [
    ['varlik_durdur', { seviye: 'campaign' }, { type: 'pause' }],
    ['varlik_etkinlestir', { seviye: 'campaign' }, { type: 'resume' }],
    ['butce_degistir', { seviye: 'campaign', tutar_micros: '750000000', butce_tipi: 'gunluk' }, { type: 'set_budget', amountMicros: 750000000n, budgetMode: 'daily' }],
  ] as const) {
    it(`${ad}: uygula yalnız onayla'dan, iz yol=mcp ve onay kimliğiyle`, async () => {
      const t = kur();
      const c = (await cagir(t.svc, ad, { workspace_id: WS, varlik_id: KAMPANYA, ...args })) as { onayKodu: string };
      expect(t.actions.uygula).not.toHaveBeenCalled();
      expect(t.actions.onizle).toHaveBeenCalledTimes(1);
      await cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu });
      expect(t.actions.uygula).toHaveBeenCalledWith(expect.anything(), { seviye: 'campaign', id: KAMPANYA }, eylem, { iz: { yol: 'mcp', ref: c.onayKodu } });
    });
  }

  it('KRİTİK: geri okuma uyuşmazsa "uygulandi" DEMİYOR', async () => {
    const t = kur({ dogrulama: 'uyusmadi' });
    const c = (await cagir(t.svc, 'varlik_durdur', { workspace_id: WS, seviye: 'campaign', varlik_id: KAMPANYA })) as { onayKodu: string };
    const s = (await cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu })) as { durum: string; hata: string };
    expect(s.durum).toBe('basarisiz');
    expect(s.hata).toMatch(/uyuşmadı/);
    expect(t.onay.bitir).toHaveBeenCalledWith(expect.anything(), c.onayKodu, 'basarisiz', expect.anything(), expect.any(String));
  });
});

describe('KRİTİK: yayınlanamayacak şey için onay sorulmuyor', () => {
  it('engel eksik varsa onay satırı AÇILMIYOR', async () => {
    const t = kur({ rehber: { eksikler: [{ adim: 1, alan: 'butce', platform: null, kod: 'X', seviye: 'engel', metin: 'Bütçe girilmedi' }] } as never });
    await expect(cagir(t.svc, 'rehber_yayinla', { workspace_id: WS, rehber_id: REHBER })).rejects.toThrow(/Bütçe girilmedi/);
    expect(t.onay.ac).not.toHaveBeenCalled();
  });

  it('prova yoksa ya da rehber provadan sonra değiştiyse onay AÇILMIYOR', async () => {
    const yok = kur({ prova: null });
    await expect(cagir(yok.svc, 'rehber_yayinla', { workspace_id: WS, rehber_id: REHBER })).rejects.toThrow(/Prova yapılmadı/);
    const bayat = kur({ prova: { icerikOzeti: 'c'.repeat(64), meta: { tur: 'gecti' }, google: null } });
    await expect(cagir(bayat.svc, 'rehber_yayinla', { workspace_id: WS, rehber_id: REHBER })).rejects.toThrow(/provadan sonra değişti/);
    const ret = kur({ prova: { icerikOzeti: OZET, meta: { tur: 'reddetti', zaman: 'z', mesajlar: ['Görsel küçük'] }, google: null } });
    await expect(cagir(ret.svc, 'rehber_yayinla', { workspace_id: WS, rehber_id: REHBER })).rejects.toThrow(/Görsel küçük/);
    for (const t of [yok, bayat, ret]) expect(t.onay.ac).not.toHaveBeenCalled();
  });
});

describe('KRİTİK: yetki, kapsam, izin', () => {
  it('okuma anahtarı yazma aracını çağıramıyor (liste görüntü, kapı serviste)', async () => {
    const t = kur();
    await expect(cagir(t.svc, 'rehber_olustur', { workspace_id: WS }, { ...ISTEK, yetki: 'okuma' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(cagir(t.svc, 'onayla', { onay_kodu: 'x' }, { ...ISTEK, yetki: 'okuma' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('çözülen bağlam istenen workspace değilse (resolve sessizce ev şirketine düştü) RET', async () => {
    const t = kur({ aktif: BASKA_WS });
    await expect(cagir(t.svc, 'rehber_yayinla', { workspace_id: WS, rehber_id: REHBER })).rejects.toThrow(/erişimin yok/);
    expect(t.onay.ac).not.toHaveBeenCalled();
  });

  it('panelin izni yoksa RET (bulk.publish olmadan yayın onayı açılmıyor)', async () => {
    const t = kur({ izinler: ['bulk.read', 'bulk.write'] });
    await expect(cagir(t.svc, 'rehber_yayinla', { workspace_id: WS, rehber_id: REHBER })).rejects.toThrow(/bulk.publish/);
    const b = kur({ izinler: ['bulk.read'] });
    await expect(cagir(b.svc, 'butce_degistir', { workspace_id: WS, seviye: 'campaign', varlik_id: KAMPANYA, tutar_micros: '1', butce_tipi: 'gunluk' })).rejects.toThrow(/budget.write/);
  });

  it('onay anında izin YENİDEN soruluyor (15 dakikada rol düşebilir)', async () => {
    const t = kur();
    const c = (await cagir(t.svc, 'varlik_durdur', { workspace_id: WS, seviye: 'campaign', varlik_id: KAMPANYA })) as { onayKodu: string };
    t.tenant.resolve.mockResolvedValue({ context: { ...EV_CTX, activeClientId: WS, permissions: ['bulk.read'] } } as never);
    await expect(cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu })).rejects.toThrow(/budget.write/);
    expect(t.actions.uygula).not.toHaveBeenCalled();
  });

  it('başka workspace\'in rehberi bu workspace bağlamında işlenmiyor', async () => {
    const t = kur({ rehber: { clientId: BASKA_WS } });
    await expect(cagir(t.svc, 'rehber_guncelle', { workspace_id: WS, rehber_id: REHBER, surum: 3, alanlar: { amac: 'FORM' } })).rejects.toThrow(/bu workspace'te değil/);
  });
});

describe('protokol: liste ve işaretler', () => {
  const liste = async (araclar: readonly McpAraci[], talimat: string) =>
    (await mcpIsle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { araclar, calistir: async () => null, hataMetni: String, sunucu: { name: 't', version: 't' }, talimat })) as {
      result: { tools: Array<{ name: string; annotations: { readOnlyHint: boolean; destructiveHint: boolean } }> };
    };

  it('okuma anahtarının listesinde yazma aracı YOK', async () => {
    const r = await liste(OKUMA_ARACLARI, MCP_TALIMATLARI);
    const adlar = r.result.tools.map((t) => t.name);
    for (const y of YAZMA_ARACLARI) expect(adlar).not.toContain(y.ad);
  });

  it('KRİTİK: onayla YIKICI işaretli (Claude Code her seferinde sorar); onaylı araçlar ve taslak araçları salt okuma DEĞİL', async () => {
    const r = await liste([...OKUMA_ARACLARI, ...YAZMA_ARACLARI], MCP_YAZMA_TALIMATLARI);
    const bul = (ad: string) => r.result.tools.find((t) => t.name === ad)!.annotations;
    expect(bul('onayla')).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    for (const ad of [...ONAYLI_ARACLAR, 'rehber_guncelle', 'rehber_olustur', 'yukleme_adresi']) {
      expect(bul(ad).readOnlyHint, ad).toBe(false);
    }
    // Okuma araçları değişmedi.
    expect(bul('metrik_ozeti')).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  });

  it('yazma talimatı onay kuralını söylüyor; okuma talimatı "hiçbir araç yazmaz"', () => {
    expect(MCP_YAZMA_TALIMATLARI).toMatch(/Onaylıyor musunuz/);
    expect(MCP_YAZMA_TALIMATLARI).toMatch(/DURAKLATILMIŞ/);
    expect(MCP_TALIMATLARI).toMatch(/Hiçbir araç yazmaz/);
  });

  it('araç adları okuma ve yazma listesinde çakışmıyor', () => {
    const okuma = new Set(OKUMA_ARACLARI.map((a) => a.ad));
    for (const y of YAZMA_ARACLARI) expect(okuma.has(y.ad), y.ad).toBe(false);
  });
});

describe('KRİTİK: yükleme jetonu', () => {
  const g = { userId: 'u1', anahtarId: 'k1', workspaceId: WS };
  it('üret → çöz aynı kişiyi, anahtarı ve workspace\'i veriyor', () => {
    const { jeton } = jetonUret(g, 'gizli', 1_000);
    expect(jetonCoz(jeton, 'gizli', 2_000)).toMatchObject({ u: 'u1', k: 'k1', w: WS });
  });
  it('süresi dolmuş, başka gizliyle imzalı ya da gövdesi değiştirilmiş jeton RET', () => {
    const { jeton } = jetonUret(g, 'gizli', 1_000);
    expect(() => jetonCoz(jeton, 'gizli', 1_000 + 16 * 60_000)).toThrow(/süresi dolmuş/);
    expect(() => jetonCoz(jeton, 'baska', 2_000)).toThrow(/doğrulanamadı/);
    const [, imza] = jeton.split('.');
    const sahte = Buffer.from(JSON.stringify({ u: 'u1', k: 'k1', w: BASKA_WS, e: 9e15 })).toString('base64url');
    expect(() => jetonCoz(`${sahte}.${imza}`, 'gizli', 2_000)).toThrow(/doğrulanamadı/);
    expect(() => jetonCoz('bozuk', 'gizli', 2_000)).toThrow(/bozuk/);
  });
  it('tür baytlardan: PNG, JPEG, MP4, MOV; gerisi RET', () => {
    expect(dosyaTuru(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toEqual({ kind: 'image', mime: 'image/png' });
    expect(dosyaTuru(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ kind: 'image', mime: 'image/jpeg' });
    expect(dosyaTuru(Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom')]))).toEqual({ kind: 'video', mime: 'video/mp4' });
    expect(dosyaTuru(Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  ')]))).toEqual({ kind: 'video', mime: 'video/quicktime' });
    expect(dosyaTuru(Buffer.from('%PDF-1.4'))).toHaveProperty('hata');
  });
  it('yükleme adresi isteğin geldiği MCP adresinden', () => {
    const req = (h: Record<string, string>, url: string) => ({ get: (k: string) => h[k.toLowerCase()], protocol: 'http', originalUrl: url }) as never;
    expect(yuklemeAdresi(req({ 'x-forwarded-proto': 'https', host: 'advetics.com' }, '/api/mcp'))).toBe('https://advetics.com/api/mcp/yukleme');
    expect(yuklemeAdresi(req({ host: 'localhost:4000' }, '/api/mcp?x=1'))).toBe('http://localhost:4000/api/mcp/yukleme');
  });
});

describe('KRİTİK: onay özeti para ve hukuk sözü taşıyan her alanı yazıyor', () => {
  it('rehber: hesap, amaç, bütçe, takvim, konum, yaş, özel kategori, hedef adres, duraklatılmış', () => {
    const s = rehberOnayOzeti(rehberKaydi(), HAZIRLIK, 'Ornek WS').join('\n');
    for (const beklenen of ['Workspace: Ornek WS', 'Amaç: Siteme gelsinler', 'Meta hesabı: Ornek Meta (act_1)', 'Bütçe: 500', '/ gün', 'Takvim: 2026-10-20 → bitiş yok', 'Konum: İzmir', 'Yaş: 18+', 'Özel kategori: yok', 'Hedef adres: https://ornek.com', 'DURAKLATILMIŞ']) {
      expect(s, beklenen).toContain(beklenen);
    }
  });
  it('boş yapısal alan "girilmedi" diye YAZILIYOR, atlanmıyor', () => {
    const r = rehberKaydi();
    delete r.alanlar.butce;
    delete r.alanlar.takvim;
    const s = rehberOnayOzeti(r, HAZIRLIK, 'W').join('\n');
    expect(s).toContain('Bütçe: girilmedi');
    expect(s).toContain('Takvim: girilmedi');
  });
  it(`bütçe: eski → yeni, yüzde ve %${BUTCE_UYARI_ESIGI_YUZDE} üstünde uyarı`, () => {
    const v = { platform: 'meta', varlikAdi: 'A', once: { status: 'active', budgetMode: 'daily', budgetAmountMicros: '500000000' }, currency: 'TRY' };
    const buyuk = varlikOnayOzeti('campaign', v, { tur: 'butce', micros: 750000000n, tip: 'gunluk' }, 'W').join('\n');
    expect(buyuk).toMatch(/Bütçe: 500,00 .* → 750,00/);
    expect(buyuk).toContain('Değişim: +50%');
    expect(buyuk).toContain('öğrenmesini sıfırlayabilir');
    const kucuk = varlikOnayOzeti('campaign', v, { tur: 'butce', micros: 550000000n, tip: 'gunluk' }, 'W').join('\n');
    expect(kucuk).toContain('Değişim: +10%');
    expect(kucuk).not.toContain('sıfırlayabilir');
    expect(varlikOnayOzeti('campaign', v, { tur: 'etkinlestir' }, 'W').join('\n')).toContain('HARCAMA BAŞLAR');
  });
});

describe('KRİTİK: rehber yayını hepsiKapali ile İKİ platformda da duraklatılmış (kaynak taraması)', () => {
  const KOD = readFileSync(join(__dirname, '../reklam/rehber/rehber.service.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const i = KOD.indexOf('async yayinla(');
  const g = KOD.slice(i, KOD.indexOf('\n  }\n', i));
  it('gövde yakalandı', () => expect(g.length).toBeGreaterThan(1000));
  it('seçenek kararı tek yerde ve her iki platform onu okuyor', () => {
    expect(g).toContain("secenek.hepsiKapali === true || !platformAcilabilirMi(amac, p)");
    expect(g).toContain("kapaliKalacak: kapali(amac, 'meta')");
    expect(g).toContain("this.googleYayinBaslat(ctx, s, a, b, k.uyum, kapali(amac, 'google'))");
    expect(g).not.toContain("kapaliKalacak: !platformAcilabilirMi(amac, 'meta')");
  });
});

describe('KRİTİK: yazma anahtarı ve yükleme ucu', () => {
  it('yazma anahtarı adv_rw_ önekli ve bekçi onu anahtar sayıyor; yetki önekten değil satırdan', async () => {
    const { anahtarUret, okumaAnahtariMi } = await import('../auth/okuma-anahtari');
    const { YAZMA_ANAHTARI_ONEKI, OKUMA_ANAHTARI_ONEKI } = await import('@advetics/shared');
    expect(anahtarUret('yazma').anahtar.startsWith(YAZMA_ANAHTARI_ONEKI)).toBe(true);
    expect(anahtarUret().anahtar.startsWith(OKUMA_ANAHTARI_ONEKI)).toBe(true);
    expect(okumaAnahtariMi(`${YAZMA_ANAHTARI_ONEKI}x`)).toBe(true);
    expect(okumaAnahtariMi('eyJhbGciOi')).toBe(false);
    expect(anahtarUret('yazma').gorunenOnek.length).toBe(anahtarUret('okuma').gorunenOnek.length);
  });

  it('yazma anahtarı süresiz ya da 90 günden uzun olamaz; okuma anahtarı olabilir', async () => {
    const { okumaAnahtariOlusturSchema } = await import('@advetics/shared');
    expect(okumaAnahtariOlusturSchema.safeParse({ ad: 'a', yetki: 'yazma', gecerlilikGun: null }).success).toBe(false);
    expect(okumaAnahtariOlusturSchema.safeParse({ ad: 'a', yetki: 'yazma', gecerlilikGun: 365 }).success).toBe(false);
    expect(okumaAnahtariOlusturSchema.safeParse({ ad: 'a', yetki: 'yazma', gecerlilikGun: 90 }).success).toBe(true);
    expect(okumaAnahtariOlusturSchema.safeParse({ ad: 'a', gecerlilikGun: null }).success).toBe(true);
    // Varsayılan OKUMA: yetki vermeyen istemci yazma anahtarı almıyor.
    expect(okumaAnahtariOlusturSchema.parse({ ad: 'a' }).yetki).toBe('okuma');
  });

  function yuklemeKur(k: { userId?: string; yetki?: 'okuma' | 'yazma'; hata?: Error } = {}) {
    const t = kur();
    const assets = { upload: vi.fn(async () => ({ asset: { id: 'v1', name: 'g', kind: 'image', width: 1080, height: 1080 }, duplicate: false })) };
    const anahtar = {
      kimlikleDogrula: vi.fn(async () => {
        if (k.hata) throw k.hata;
        return { userId: k.userId ?? 'u1', anahtarId: 'k1', yetki: k.yetki ?? 'yazma' };
      }),
    };
    const svc = new McpYazmaService(
      { $queryRaw: vi.fn(async () => [{ ad: 'W', org_id: 'o', manager_account_id: null }]) } as never,
      {} as never,
      t.tenant as never,
      {} as never,
      {} as never,
      {} as never,
      assets as never,
      anahtar as never,
      { jwt: { accessSecret: 'gizli' } } as never,
      {} as never,
      {} as never,
    );
    const { jeton } = jetonUret({ userId: 'u1', anahtarId: 'k1', workspaceId: WS }, 'gizli');
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    return { svc, assets, anahtar, jeton, png };
  }

  it('geçerli jeton + yazma anahtarı → Varlıklar\'ın yükleme yolu, workspace ve tür baytlardan', async () => {
    const y = yuklemeKur();
    const r = (await y.svc.yukle(y.jeton, { buffer: y.png, originalname: 'a.jpg' })) as { varlikId: string };
    expect(r.varlikId).toBe('v1');
    expect(y.anahtar.kimlikleDogrula).toHaveBeenCalledWith('k1');
    expect(y.assets.upload).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ clientId: WS, kind: 'image', mimeType: 'image/png' }));
  });

  it('KRİTİK: anahtar iptal edilmişse (jeton hâlâ geçerli olsa da) yükleme YOK', async () => {
    const y = yuklemeKur({ hata: new Error('Okuma anahtarı iptal edilmiş') });
    await expect(y.svc.yukle(y.jeton, { buffer: y.png, originalname: 'a' })).rejects.toThrow(/iptal/);
    expect(y.assets.upload).not.toHaveBeenCalled();
  });

  it('KRİTİK: okuma anahtarına, başka kullanıcıya ve jetonsuz isteğe yükleme YOK', async () => {
    for (const k of [{ yetki: 'okuma' as const }, { userId: 'baska' }]) {
      const y = yuklemeKur(k);
      await expect(y.svc.yukle(y.jeton, { buffer: y.png, originalname: 'a' })).rejects.toThrow();
      expect(y.assets.upload).not.toHaveBeenCalled();
    }
    const y = yuklemeKur();
    await expect(y.svc.yukle(undefined, { buffer: y.png, originalname: 'a' })).rejects.toThrow(/jetonu yok/);
    await expect(y.svc.yukle(y.jeton, { buffer: Buffer.from('%PDF'), originalname: 'a.jpg' })).rejects.toThrow(/JPEG, PNG/);
    expect(y.assets.upload).not.toHaveBeenCalled();
  });
});

describe('KRİTİK: form yayını (Meta\'da açılan form silinemiyor)', () => {
  it('form_yayinla onay satırı açıyor, Meta\'ya GİTMİYOR; onayla publish çağırıyor ve Meta form kimliğini dönüyor', async () => {
    const t = kur();
    const c = (await cagir(t.svc, 'form_yayinla', { workspace_id: WS, form_id: FORM })) as { onayGerekli: boolean; onayKodu: string; ozet: string[] };
    expect(c.onayGerekli).toBe(true);
    expect(t.formYayinci.publish).not.toHaveBeenCalled();
    expect(t.onay.satirlar.get(c.onayKodu)!.islem).toBe('form_yayinla');
    const s = (await cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu })) as { durum: string; sonuc: { metaFormKimligi: string } };
    expect(s.durum).toBe('uygulandi');
    expect(s.sonuc.metaFormKimligi).toBe('1234567890');
    // `belirsizOnayi` VERİLMİYOR: belirsiz satırı açmak panelin kararı.
    expect(t.formYayinci.publish).toHaveBeenCalledWith(expect.anything(), FORM);
  });

  it('KRİTİK: form onaydan SONRA değiştiyse Meta\'ya gidilmiyor', async () => {
    const t = kur();
    const c = (await cagir(t.svc, 'form_yayinla', { workspace_id: WS, form_id: FORM })) as { onayKodu: string };
    t.forms.get.mockResolvedValue(formKaydi({ privacyPolicyUrl: 'https://baska.com/gizlilik' }));
    const s = (await cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu })) as { durum: string; hata: string };
    expect(s.durum).toBe('basarisiz');
    expect(s.hata).toMatch(/onaydan sonra değişti/);
    expect(t.formYayinci.publish).not.toHaveBeenCalled();
  });

  it('yalnız AD değişirse içerik özeti aynı (ad Meta\'ya gitmiyor); soru değişirse farklı', () => {
    expect(formIcerikOzeti(formKaydi({ name: 'başka ad' }))).toBe(formIcerikOzeti(formKaydi()));
    expect(formIcerikOzeti(formKaydi({ prefillQuestions: ['FULL_NAME'] }))).not.toBe(formIcerikOzeti(formKaydi()));
    expect(formIcerikOzeti(formKaydi({ consentBoxes: [] }))).not.toBe(formIcerikOzeti(formKaydi()));
  });

  it('KRİTİK: geri okuma uyuşmazsa "uygulandi" DEMİYOR ama kimliği dönüyor', async () => {
    const t = kur({ yayinlanan: { readbackWarning: 'KVKK kutusu Meta\'da farklı' } });
    const c = (await cagir(t.svc, 'form_yayinla', { workspace_id: WS, form_id: FORM })) as { onayKodu: string };
    const s = (await cagir(t.svc, 'onayla', { onay_kodu: c.onayKodu })) as { durum: string; hata: string; sonuc: { metaFormKimligi: string } };
    expect(s.durum).toBe('basarisiz');
    expect(s.hata).toMatch(/KVKK/);
    expect(s.sonuc.metaFormKimligi).toBe('1234567890');
  });

  it('yayın engeli varsa onay AÇILMIYOR; başka workspace\'in formu reddediliyor; bulk.publish şart', async () => {
    const e = kur({ engeller: ['Bu form zaten yayında.'] });
    await expect(cagir(e.svc, 'form_yayinla', { workspace_id: WS, form_id: FORM })).rejects.toThrow(/zaten yayında/);
    const b = kur({ form: { clientId: BASKA_WS } });
    await expect(cagir(b.svc, 'form_yayinla', { workspace_id: WS, form_id: FORM })).rejects.toThrow(/bu workspace'te değil/);
    const i = kur({ izinler: ['bulk.read', 'bulk.write'] });
    await expect(cagir(i.svc, 'form_yayinla', { workspace_id: WS, form_id: FORM })).rejects.toThrow(/bulk.publish/);
    for (const t of [e, b, i]) expect(t.onay.ac).not.toHaveBeenCalled();
  });

  it('özet Meta\'da kalıcı olan her metni yazıyor: sorular, gizlilik, KVKK, teşekkür düğmesi, silinemez', () => {
    const o = formOnayOzeti(formKaydi(), 'Ornek WS').join('\n');
    for (const p of ['Ornek Sayfa', 'Ad soyad', 'Telefon', 'Ne zaman almayı', 'Hemen / 6 ay içinde', 'https://ornek.com/gizlilik', 'KVKK açık rıza metni (zorunlu)', '+905321234567', 'SİLİNEMEZ']) {
      expect(o, p).toContain(p);
    }
    expect(formOnayOzeti(formKaydi({ consentBoxes: [], customQuestions: [] }), 'W').join('\n')).toMatch(/Ek sorular: yok[\s\S]*Onay kutuları: yok/);
  });

  it('form_olustur: kimlikler ARGÜMANDAN, form içindeki clientId yok sayılıyor; Meta\'ya gitmiyor', async () => {
    const t = kur();
    await cagir(t.svc, 'form_olustur', {
      workspace_id: WS,
      sayfa_id: SAYFA,
      form: { clientId: BASKA_WS, name: 'Seasight', prefillQuestions: ['FULL_NAME', 'PHONE'], privacyPolicyUrl: 'https://ornek.com/gizlilik' },
    });
    expect(t.forms.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ clientId: WS, socialProfileId: SAYFA, formType: 'higher_intent' }));
    expect(t.formYayinci.publish).not.toHaveBeenCalled();
  });

  it('form_olustur: gizlilik adresi yoksa ya da "Bizi ara" telefonsuzsa form AÇILMIYOR, alan adıyla hata', async () => {
    const t = kur();
    await expect(cagir(t.svc, 'form_olustur', { workspace_id: WS, sayfa_id: SAYFA, form: { name: 'a', prefillQuestions: ['PHONE'] } })).rejects.toThrow(/form\.privacyPolicyUrl/);
    await expect(
      cagir(t.svc, 'form_olustur', {
        workspace_id: WS,
        sayfa_id: SAYFA,
        form: { name: 'a', prefillQuestions: ['PHONE'], privacyPolicyUrl: 'https://a.com/g', thankYouCtaType: 'CALL_BUSINESS' },
      }),
    ).rejects.toThrow(/form\.thankYouPhone/);
    expect(t.forms.create).not.toHaveBeenCalled();
  });
});
