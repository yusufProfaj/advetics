import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { OKUMA_ANAHTARI_ONEKI, type TenantContext } from '@advetics/shared';
import { OKUMA_ANAHTARI_KEY } from '../../common/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { anahtarOzeti, anahtarUret, okumaAnahtariMi } from '../auth/okuma-anahtari';
import type { ResolvedIdentity } from '../auth/tenant-context.service';
import { MCP_SURUMLERI, jsonMetni, mcpIsle, type McpOrtami } from './mcp-protokol';
import { ozete } from './okuma-anahtari.service';
import {
  AracArgumanHatasi,
  OKUMA_ARACLARI,
  araciBul,
  donem,
  kapsamDogrula,
  type AracOrtami,
} from './okuma-araclari';

const UST = '10000000-0000-4000-8000-000000000001';
const ORG = '20000000-0000-4000-8000-000000000002';
const WS = '30000000-0000-4000-8000-000000000003';
const BASKA = '90000000-0000-4000-8000-000000000009';

function ctx(p: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: 'u',
    orgId: ORG,
    clientIds: [WS],
    activeClientId: null,
    managerAccountId: UST,
    platformAdmin: true,
    tumSirketler: false,
    role: 'admin',
    isOrgAdmin: true,
    permissions: [],
    ...p,
  };
}

function kimlik(c: TenantContext): ResolvedIdentity {
  return {
    actor: { id: 'u', orgId: ORG, email: 'hello@profaj.com', fullName: 'Sahip' },
    context: c,
    memberships: [],
    availableClients: [{ id: WS, name: '3A Makina', status: 'active' }],
    managerAccount: {
      id: UST,
      name: 'Profaj',
      paket: 'ajans' as never,
      organizations: [{ id: ORG, name: 'Profaj', slug: 'profaj' }],
      rol: 'admin',
      yonetebilir: true,
    },
    secilebilirUstHesaplar: [{ id: UST, name: 'Profaj', slug: 'profaj', paket: 'ajans' as never, sirketSayisi: 1 }],
    platformAdmin: true,
    erisilebilirSirketler: [],
  } as ResolvedIdentity;
}

/** Sahte ortam: çözüm isteneni AYNEN uygular, metrik çağrıları kayda geçer. */
function ortam(cozum: (s: { ustHesapId: string | null; sirketId: string | null; workspaceId: string | null }) => TenantContext = (s) =>
  ctx({
    managerAccountId: s.ustHesapId ?? UST,
    orgId: s.sirketId && s.sirketId !== 'all' ? s.sirketId : ORG,
    tumSirketler: s.sirketId === 'all',
    activeClientId: s.workspaceId,
  })) {
  const cagrilar: Array<{ yontem: string; q: unknown }> = [];
  const kaydet = (yontem: string) =>
    vi.fn(async (_c: TenantContext, q: unknown) => {
      cagrilar.push({ yontem, q });
      return yontem === 'breakdown' ? [] : { ok: true };
    });
  const o: AracOrtami = {
    coz: async (s) => kimlik(cozum(s)),
    metrics: {
      summary: kaydet('summary'),
      timeseries: kaydet('timeseries'),
      breakdown: kaydet('breakdown'),
      byClient: kaydet('byClient'),
      byAccount: kaydet('byAccount'),
      byOrganization: kaydet('byOrganization'),
      coverage: kaydet('coverage'),
      conversionDetail: kaydet('conversionDetail'),
    } as unknown as AracOrtami['metrics'],
  };
  return { o, cagrilar };
}

describe('anahtar', () => {
  it('öneki taşıyor, özet hex 64 ve düz anahtardan türüyor', () => {
    const { anahtar, ozet, gorunenOnek } = anahtarUret();
    expect(anahtar.startsWith(OKUMA_ANAHTARI_ONEKI)).toBe(true);
    expect(ozet).toMatch(/^[0-9a-f]{64}$/);
    expect(ozet).toBe(anahtarOzeti(anahtar));
    expect(anahtar.startsWith(gorunenOnek)).toBe(true);
    // Görünen kısım anahtarın TAMAMI olmamalı — panelde gösteriliyor.
    expect(gorunenOnek.length).toBeLessThan(anahtar.length - 20);
  });

  it('iki üretim aynı anahtarı vermiyor', () => {
    expect(anahtarUret().anahtar).not.toBe(anahtarUret().anahtar);
  });

  it('JWT okuma anahtarı sanılmıyor', () => {
    expect(okumaAnahtariMi('eyJhbGciOiJIUzI1NiJ9.x.y')).toBe(false);
    expect(okumaAnahtariMi(`${OKUMA_ANAHTARI_ONEKI}abc`)).toBe(true);
  });

  it('durum sunucuda: iptal > süresi doldu > etkin', () => {
    const temel = { id: 'x', ad: 'a', gorunenOnek: 'adv_ro_x', createdAt: new Date(), sonKullanim: null, sonKullanimIp: null };
    const simdi = new Date('2026-10-08T12:00:00Z');
    expect(ozete({ ...temel, bitis: null, iptal: null }, simdi).durum).toBe('etkin');
    expect(ozete({ ...temel, bitis: new Date('2026-10-08T11:59:59Z'), iptal: null }, simdi).durum).toBe('suresi_doldu');
    expect(ozete({ ...temel, bitis: null, iptal: new Date() }, simdi).durum).toBe('iptal');
  });
});

describe('KRİTİK: kapsam sessizce varsayılana düşmüyor', () => {
  it('istenen ile çözülen aynıysa geçiyor', () => {
    expect(() =>
      kapsamDogrula({ ust_hesap_id: UST, sirket_id: ORG, workspace_id: WS }, ctx({ activeClientId: WS })),
    ).not.toThrow();
  });

  it('üst hesap tutmazsa hata', () => {
    expect(() => kapsamDogrula({ ust_hesap_id: BASKA }, ctx())).toThrow(AracArgumanHatasi);
  });

  it('şirket tutmazsa hata', () => {
    expect(() => kapsamDogrula({ sirket_id: BASKA }, ctx())).toThrow(/sirket_id/);
  });

  it('"all" istenip mod açılmadıysa hata', () => {
    expect(() => kapsamDogrula({ sirket_id: 'all' }, ctx({ tumSirketler: false }))).toThrow(/Tüm şirketler/);
  });

  it('şirket istenip "tüm şirketler" modunda kalındıysa hata', () => {
    expect(() => kapsamDogrula({ sirket_id: ORG }, ctx({ tumSirketler: true }))).toThrow(/sirket_id/);
  });

  it('KRİTİK: workspace seçilemediyse hata — ajans toplamı workspace verisi sanılmasın', async () => {
    // Çözücü workspace'i DÜŞÜRÜYOR (resolve'un tarayıcı davranışı).
    const { o, cagrilar } = ortam((s) => ctx({ managerAccountId: s.ustHesapId ?? UST, activeClientId: null }));
    await expect(araciBul('metrik_ozeti')!.calistir({ workspace_id: WS }, o)).rejects.toThrow(/workspace_id/);
    // Ve servis HİÇ çağrılmadı.
    expect(cagrilar).toHaveLength(0);
  });
});

describe('araçlar', () => {
  it('her aracın adı tekil ve MCP adı kuralına uyuyor', () => {
    const adlar = OKUMA_ARACLARI.map((a) => a.ad);
    expect(new Set(adlar).size).toBe(adlar.length);
    for (const ad of adlar) expect(ad).toMatch(/^[a-z_]{1,64}$/);
  });

  it('JSON şeması ek alanı reddediyor ve Zod da öyle — iki taraf ayrışmıyor', async () => {
    for (const a of OKUMA_ARACLARI) expect(a.girdi.additionalProperties).toBe(false);
    const { o } = ortam();
    await expect(araciBul('metrik_ozeti')!.calistir({ start_date: '2026-01-01' }, o)).rejects.toThrow(
      /start_date/,
    );
  });

  it('JSON şemasındaki her alan Zod tarafından kabul ediliyor', async () => {
    /*
     * Ters yön: şemada ilan edilen alanı Zod reddederse model doğru
     * çağrıyı yapıp hata alır. Her alanı geçerli bir değerle tek tek gönder.
     */
    const ornek: Record<string, unknown> = {
      ust_hesap_id: UST,
      sirket_id: ORG,
      workspace_id: WS,
      baslangic: '2026-09-01',
      bitis: '2026-09-30',
      karsilastirma_baslangic: '2026-08-01',
      karsilastirma_bitis: '2026-08-30',
      platform: 'meta',
      reklam_hesabi_id: BASKA,
      kampanya_id: BASKA,
      reklam_grubu_id: BASKA,
      seviye: 'ad',
      limit: 10,
    };
    for (const a of OKUMA_ARACLARI) {
      const alanlar = Object.keys((a.girdi as { properties: Record<string, unknown> }).properties);
      const zorunlu = (a.girdi as { required: string[] }).required;
      for (const alan of alanlar) {
        const { o } = ortam();
        const args: Record<string, unknown> = { [alan]: ornek[alan] };
        for (const z of zorunlu) args[z] = ornek[z];
        // sirket_kirilimi kendi sirket_id'sini 'all' yapıyor; tek başına sirket_id göndermek anlamsız.
        if (alan === 'sirket_id' && args.workspace_id === undefined && a.ad === 'hesap_kirilimi') continue;
        await expect(a.calistir(args, o), `${a.ad}.${alan}`).resolves.toBeDefined();
      }
    }
  });

  it('metrik_ozeti argümanı panelin sorgusuna eşleniyor', async () => {
    const { o, cagrilar } = ortam();
    await araciBul('metrik_ozeti')!.calistir(
      { baslangic: '2026-09-01', bitis: '2026-09-30', platform: 'google', kampanya_id: BASKA },
      o,
    );
    expect(cagrilar).toEqual([
      {
        yontem: 'summary',
        q: expect.objectContaining({ from: '2026-09-01', to: '2026-09-30', platform: 'google', campaignId: BASKA }),
      },
    ]);
  });

  it('panelin şeması uygulanıyor: 400 günden uzun aralık reddediliyor', async () => {
    const { o } = ortam();
    await expect(
      araciBul('gunluk_seri')!.calistir({ baslangic: '2024-01-01', bitis: '2026-01-01' }, o),
    ).rejects.toThrow(/400/);
  });

  it('sirket_kirilimi "tüm şirketler" kapsamında koşuyor', async () => {
    const cozulen: Array<string | null> = [];
    const { o } = ortam((s) => {
      cozulen.push(s.sirketId);
      return ctx({ tumSirketler: s.sirketId === 'all' });
    });
    await araciBul('sirket_kirilimi')!.calistir({}, o);
    expect(cozulen).toEqual(['all']);
  });

  it('varlik_kirilimi dolu sayfayı "kesilmiş olabilir" diye işaretliyor', async () => {
    const { o } = ortam();
    (o.metrics.breakdown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{}, {}]);
    const r = (await araciBul('varlik_kirilimi')!.calistir({ limit: 2 }, o)) as { kesilmis_olabilir: boolean };
    expect(r.kesilmis_olabilir).toBe(true);
  });

  it('varsayılan dönem: dün dahil son 30 gün', () => {
    const { from, to } = donem({ bitis: '2026-10-07' });
    expect(to).toBe('2026-10-07');
    expect(from).toBe('2026-09-08');
  });
});

describe('MCP protokolü', () => {
  const temelOrtam = (calistir: McpOrtami['calistir'] = async () => ({ n: 10n })): McpOrtami => ({
    araclar: OKUMA_ARACLARI,
    calistir,
    hataMetni: (e) => (e instanceof Error ? e.message : String(e)),
    sunucu: { name: 'advetics-okuma', version: 't' },
  });

  it('initialize istenen sürümü destekliyorsa aynısını, yoksa en yenisini döndürüyor', async () => {
    const eski = (await mcpIsle(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } },
      temelOrtam(),
    )) as { result: { protocolVersion: string; capabilities: unknown; instructions: string } };
    expect(eski.result.protocolVersion).toBe('2025-03-26');
    expect(eski.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(eski.result.instructions).toMatch(/kapsam/);
    const bilinmeyen = (await mcpIsle(
      { jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } },
      temelOrtam(),
    )) as { result: { protocolVersion: string } };
    expect(bilinmeyen.result.protocolVersion).toBe(MCP_SURUMLERI[0]);
  });

  it('bildirim cevapsız (null → HTTP 202)', async () => {
    expect(await mcpIsle({ jsonrpc: '2.0', method: 'notifications/initialized' }, temelOrtam())).toBeNull();
  });

  it('tools/list bütün araçları salt okunur ipucuyla veriyor', async () => {
    const r = (await mcpIsle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, temelOrtam())) as {
      result: { tools: Array<{ name: string; inputSchema: unknown; annotations: { readOnlyHint: boolean } }> };
    };
    expect(r.result.tools.map((t) => t.name)).toEqual(OKUMA_ARACLARI.map((a) => a.ad));
    for (const t of r.result.tools) {
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.inputSchema).toMatchObject({ type: 'object' });
    }
  });

  it('tools/call BigInt\'i string olarak döndürüyor (düz stringify patlardı)', async () => {
    const r = (await mcpIsle(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'kapsam', arguments: {} } },
      temelOrtam(),
    )) as { result: { content: Array<{ text: string }>; isError: boolean } };
    expect(r.result.isError).toBe(false);
    expect(JSON.parse(r.result.content[0]!.text)).toEqual({ n: '10' });
    expect(jsonMetni({ a: 1n })).toContain('"1"');
  });

  it('araç hatası protokol hatası DEĞİL, modelin okuyacağı isError', async () => {
    const r = (await mcpIsle(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'kapsam', arguments: {} } },
      temelOrtam(async () => {
        throw new Error('sirket_id yanlış');
      }),
    )) as { result: { content: Array<{ text: string }>; isError: boolean } };
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0]!.text).toBe('sirket_id yanlış');
  });

  it('bilinmeyen araç ve yöntem JSON-RPC hatası', async () => {
    const a = (await mcpIsle(
      { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'kampanya_sil' } },
      temelOrtam(),
    )) as { error: { code: number } };
    expect(a.error.code).toBe(-32602);
    const b = (await mcpIsle({ jsonrpc: '2.0', id: 2, method: 'sampling/createMessage' }, temelOrtam())) as {
      error: { code: number };
    };
    expect(b.error.code).toBe(-32601);
  });

  it('toplu istek: bildirimler düşüyor, istekler cevaplanıyor', async () => {
    const r = (await mcpIsle(
      [
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 7, method: 'ping' },
      ],
      temelOrtam(),
    )) as Array<{ id: number }>;
    expect(r).toEqual([{ jsonrpc: '2.0', id: 7, result: {} }]);
  });
});

describe('KRİTİK: kimlik bekçisi — anahtar ile oturum ayrımı', () => {
  function bekci(opts: { okumaUcu: boolean; dogrula?: () => Promise<{ userId: string; anahtarId: string }> }) {
    const reflector = {
      getAllAndOverride: (k: string) => (k === OKUMA_ANAHTARI_KEY ? opts.okumaUcu : undefined),
    } as unknown as Reflector;
    const tokens = { verifyAccessToken: vi.fn(async () => ({ sub: 'u', org: ORG })) };
    const tenantContext = { resolve: vi.fn(async () => kimlik(ctx())) };
    const dogrulayici = { dogrula: vi.fn(opts.dogrula ?? (async () => ({ userId: 'u', anahtarId: 'k1' }))) };
    const guard = new JwtAuthGuard(reflector, tokens as never, tenantContext as never, dogrulayici as never);
    return { guard, tokens, dogrulayici, tenantContext };
  }
  function istek(baslik: string | null, cerez?: string) {
    const req = {
      get: (h: string) => (h.toLowerCase() === 'authorization' ? (baslik ?? undefined) : undefined),
      cookies: cerez ? { advetics_at: cerez, access_token: cerez } : {},
      ip: '1.2.3.4',
    } as Record<string, unknown>;
    const ec = {
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    return { req, ec };
  }
  const ANAHTAR = `${OKUMA_ANAHTARI_ONEKI}xyz`;

  it('KRİTİK: okuma anahtarı İŞARETSİZ (yazan olabilecek) uçta reddediliyor', async () => {
    const { guard, dogrulayici } = bekci({ okumaUcu: false });
    await expect(guard.canActivate(istek(`Bearer ${ANAHTAR}`).ec)).rejects.toThrow(ForbiddenException);
    // Veritabanına bile gidilmedi.
    expect(dogrulayici.dogrula).not.toHaveBeenCalled();
  });

  it('KRİTİK: okuma ucu çerezli oturumla/JWT ile çağrılamıyor', async () => {
    const { guard, tokens } = bekci({ okumaUcu: true });
    await expect(guard.canActivate(istek('Bearer eyJ.a.b').ec)).rejects.toThrow(UnauthorizedException);
    await expect(guard.canActivate(istek(null, 'eyJ.a.b').ec)).rejects.toThrow(UnauthorizedException);
    expect(tokens.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('anahtar ÇEREZDEN okunmuyor', async () => {
    const { guard, dogrulayici } = bekci({ okumaUcu: true });
    await expect(guard.canActivate(istek(null, ANAHTAR).ec)).rejects.toThrow(UnauthorizedException);
    expect(dogrulayici.dogrula).not.toHaveBeenCalled();
  });

  it('okuma ucunda geçerli anahtar bağlamı kuruyor ve işaretliyor', async () => {
    const { guard } = bekci({ okumaUcu: true });
    const { req, ec } = istek(`Bearer ${ANAHTAR}`);
    await expect(guard.canActivate(ec)).resolves.toBe(true);
    expect(req.okumaAnahtariId).toBe('k1');
    expect((req.tenant as TenantContext).platformAdmin).toBe(true);
  });

  it('bağlam platform sahibi değilse reddediliyor (bayrak arada geri alındı)', async () => {
    const { guard, tenantContext } = bekci({ okumaUcu: true });
    tenantContext.resolve.mockResolvedValueOnce(kimlik(ctx({ platformAdmin: false })));
    await expect(guard.canActivate(istek(`Bearer ${ANAHTAR}`).ec)).rejects.toThrow(/platform sahibi/);
  });
});

describe('kaynak kilitleri', () => {
  const oku = (p: string) =>
    readFileSync(join(__dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('NEST KAYDI: modül uygulamada, doğrulayıcı AuthModule\'de sağlanıp dışa açık', () => {
    expect(oku('../../app.module.ts')).toMatch(/imports:[\s\S]*\bOkumaApiModule\b/);
    const auth = oku('../auth/auth.module.ts');
    expect(auth).toMatch(/providers:\s*\[[^\]]*OkumaAnahtariDogrulayici/);
    expect(auth).toMatch(/exports:\s*\[[^\]]*OkumaAnahtariDogrulayici/);
    const mod = oku('okuma-api.module.ts');
    expect(mod).toMatch(/imports:\s*\[[^\]]*MetricsModule/);
    expect(mod).toMatch(/imports:\s*\[[^\]]*AuditModule/);
  });

  it('KRİTİK: araç dosyası YAZAN hiçbir şeye dokunmuyor', () => {
    const kaynak = oku('okuma-araclari.ts');
    expect(kaynak.length).toBeGreaterThan(1000); // dilim boşa düşmesin
    for (const yasak of ['withTenant', 'PrismaService', 'PrismaAdminService', '.create(', '.update(', '.delete(', '$executeRaw']) {
      expect(kaynak, yasak).not.toContain(yasak);
    }
  });

  it('KRİTİK: okuma işareti YALNIZCA okuma denetleyicisinde', () => {
    const kaynak = oku('okuma-api.controller.ts');
    // Sınır: bir sonraki denetleyicinin DEKORATÖRLERİ (sınıf adı değil — dekoratör ondan önce geliyor).
    const sonraki = kaynak.lastIndexOf('@Controller', kaynak.indexOf('class OkumaApiController'));
    const yonetim = kaynak.slice(kaynak.indexOf('class OkumaApiYonetimController'), sonraki);
    expect(yonetim.length).toBeGreaterThan(100);
    // Anahtar yönetimi okuma anahtarına açılırsa anahtar kendini yenileyip iptali atlatır.
    const yonetimBasi = kaynak.slice(0, kaynak.indexOf('class OkumaApiYonetimController'));
    expect(yonetimBasi.slice(yonetimBasi.lastIndexOf('@Controller'))).not.toContain('@OkumaAnahtariyla');
    expect(yonetim).not.toContain('@OkumaAnahtariyla');
  });
});

describe('KRİTİK: anahtar doğrulayıcı', () => {
  async function dene(satir: Record<string, unknown> | null) {
    const { OkumaAnahtariDogrulayici } = await import('../auth/okuma-anahtari-dogrulayici.service');
    const update = vi.fn(async () => ({}));
    const findUnique = vi.fn(async () => satir);
    const d = new OkumaAnahtariDogrulayici({ okumaAnahtari: { findUnique, update } } as never);
    return { sonuc: d.dogrula(`${OKUMA_ANAHTARI_ONEKI}x`, '1.2.3.4'), findUnique, update };
  }
  const iyi = {
    id: 'k1',
    userId: 'u',
    bitis: null,
    iptal: null,
    sonKullanim: null,
    user: { platformAdmin: true, status: 'active' },
  };

  it('satır ÖZETLE aranıyor, düz anahtarla değil', async () => {
    const { sonuc, findUnique } = await dene(iyi);
    await expect(sonuc).resolves.toEqual({ userId: 'u', anahtarId: 'k1' });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { anahtarOzeti: anahtarOzeti(`${OKUMA_ANAHTARI_ONEKI}x`) } }),
    );
  });

  it('her ret kendi cümlesiyle: tanınmadı / iptal / süre / sahiplik', async () => {
    await expect((await dene(null)).sonuc).rejects.toThrow(/tanınmadı/);
    await expect((await dene({ ...iyi, iptal: new Date() })).sonuc).rejects.toThrow(/iptal/);
    await expect((await dene({ ...iyi, bitis: new Date(Date.now() - 1000) })).sonuc).rejects.toThrow(/süresi dolmuş/);
    await expect(
      (await dene({ ...iyi, user: { platformAdmin: false, status: 'active' } })).sonuc,
    ).rejects.toThrow(/platform sahibi/);
    await expect(
      (await dene({ ...iyi, user: { platformAdmin: true, status: 'disabled' } })).sonuc,
    ).rejects.toThrow(/devre dışı/);
  });

  it('son kullanım dakikada bir yazılıyor', async () => {
    const taze = await dene({ ...iyi, sonKullanim: new Date() });
    await taze.sonuc;
    expect(taze.update).not.toHaveBeenCalled();
    const bayat = await dene({ ...iyi, sonKullanim: new Date(Date.now() - 120_000) });
    await bayat.sonuc;
    expect(bayat.update).toHaveBeenCalledTimes(1);
  });
});
