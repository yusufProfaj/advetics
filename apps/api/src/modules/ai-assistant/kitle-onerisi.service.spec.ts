import { describe, expect, it } from 'vitest';
import type { GeoLocationOption, InterestOption, TenantContext } from '@advetics/shared';
import type { AppConfig } from '../../config/configuration';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ConnectionsService } from '../connections/connections.service';
import type { AnthropicLike } from './anthropic-client.provider';
import { KitleOnerisiService } from './kitle-onerisi.service';

/**
 * ═══ DOĞAL DİLDEN KİTLE ÖNERİSİ ═══
 *
 * Model ve Meta aramaları sahte, akış gerçek. Sınanan: model kimlik
 * üretmiyor (kimlik Meta aramasından geliyor), bulunamayan terim ve
 * kurulamayan parça SESSİZCE düşmüyor, yanlış biçim "öneri" diye
 * gösterilmiyor.
 */
const CTX = { orgId: 'o', userId: 'u', clientIds: ['c'] } as TenantContext;
const IZMIR: GeoLocationOption = { key: '2622', type: 'region', name: 'İzmir', label: 'İzmir, Türkiye', countryCode: 'TR' };
const TURKIYE: GeoLocationOption = { key: 'TR', type: 'country', name: 'Türkiye', label: 'Türkiye', countryCode: 'TR' };
const LUKS: InterestOption = { id: '6003', name: 'Lüks araçlar', path: [], audienceMin: 1000, audienceMax: 2000 };

function kur(p: {
  cevap?: string;
  stop?: string;
  hesap?: boolean;
  geo?: Record<string, GeoLocationOption[]>;
  ilgi?: Record<string, InterestOption[]>;
}) {
  const istekler: Array<Record<string, unknown>> = [];
  const anthropic = {
    messages: {
      create: async (params: Record<string, unknown>) => {
        istekler.push(params);
        return { stop_reason: p.stop ?? 'end_turn', content: [{ type: 'text', text: p.cevap ?? '' }] };
      },
    },
  } as unknown as AnthropicLike;
  const prisma = {
    withTenant: async (_c: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $queryRaw: async () => (p.hesap === false ? [] : [{ id: 'acc', name: 'Meta Hesap' }]) }),
  } as unknown as PrismaService;
  const connections = {
    searchGeoLocations: async (_c: unknown, _a: string, q: string) => p.geo?.[q] ?? [],
    searchInterests: async (_c: unknown, _a: string, q: string) => p.ilgi?.[q] ?? [],
  } as unknown as ConnectionsService;
  const svc = new KitleOnerisiService(anthropic, { aiAssistant: { model: 'm' } } as AppConfig, prisma, connections);
  return { svc, istekler };
}

const cevap = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    konumlar: ['İzmir'],
    yasMin: null,
    yasMax: null,
    cinsiyet: 'male',
    ilgiler: [
      { kavram: 'lüks otomobil', aramalar: ['lüks otomobil'] },
      { kavram: 'yat', aramalar: ['yat', 'yacht'] },
    ],
    uygulanamayan: [{ ifade: 'son bir ayda', sebep: 'Meta ilgi hedeflemesinde zaman aralığı yok.' }],
    ...patch,
  });

describe('KitleOnerisiService', () => {
  it('KRİTİK: kimlikler Meta aramasından; bulunamayan terim ve kurulamayan parça AYRI yazıyor', async () => {
    const { svc } = kur({ cevap: cevap(), geo: { İzmir: [IZMIR] }, ilgi: { 'lüks otomobil': [LUKS] } });
    const r = await svc.oner(CTX, 'c', 'son bir ayda lüks araç arayan İzmirli erkekler');
    expect(r.locations).toEqual([{ key: '2622', type: 'region', label: 'İzmir, Türkiye', countryCode: 'TR' }]);
    expect(r.interests).toEqual([{ id: '6003', name: 'Lüks araçlar', terim: 'lüks otomobil', audienceMin: 1000, audienceMax: 2000 }]);
    // Kavramın BÜTÜN adayları denendi ve hiçbiri tutmadı.
    expect(r.eslesmeyen).toEqual([{ terim: 'yat', tur: 'ilgi' }]);
    expect(r.uygulanamayan[0]!.ifade).toBe('son bir ayda');
    expect(r).toMatchObject({ genders: 'male', ageMin: 18, ageMax: 65, hesapAdi: 'Meta Hesap' });
  });

  it('yapılandırılmış çıktı output_config ile — zorunlu tool_choice YOK (yeni modellerde 400)', async () => {
    const { svc, istekler } = kur({ cevap: cevap({ konumlar: [], ilgiler: [] }) });
    await svc.oner(CTX, 'c', 'herkes için geniş bir kitle');
    expect((istekler[0]!.output_config as { format: { type: string } }).format.type).toBe('json_schema');
    expect(istekler[0]!.tool_choice).toBeUndefined();
  });

  it('KRİTİK: ülke + o ülkenin ili gelirse ülke ÇIKARILIYOR ve sebebi yazıyor', async () => {
    const { svc } = kur({
      cevap: cevap({ konumlar: ['Türkiye', 'İzmir'], ilgiler: [] }),
      geo: { Türkiye: [TURKIYE], İzmir: [IZMIR] },
    });
    const r = await svc.oner(CTX, 'c', 'Türkiye, İzmir');
    expect(r.locations.map((l) => l.key)).toEqual(['2622']);
    expect(r.uygulanamayan.some((u) => u.ifade === 'Türkiye' && u.sebep.includes('ülkenin tamamına'))).toBe(true);
  });

  it('18 altı yaş sıkıştırılıyor ve SÖYLENİYOR', async () => {
    const { svc } = kur({ cevap: cevap({ yasMin: 15, yasMax: 24, konumlar: [], ilgiler: [] }) });
    const r = await svc.oner(CTX, 'c', 'lise öğrencileri');
    expect(r.ageMin).toBe(18);
    expect(r.uygulanamayan.some((u) => u.sebep.includes('alt yaş sınırı 18'))).toBe(true);
  });

  it('bulunamayan konum da eşleşmeyenler listesinde', async () => {
    const { svc } = kur({ cevap: cevap({ konumlar: ['Atlantis'], ilgiler: [] }) });
    expect((await svc.oner(CTX, 'c', 'Atlantisliler')).eslesmeyen).toEqual([{ terim: 'Atlantis', tur: 'konum' }]);
  });

  it('JSON olmayan, şemaya uymayan ya da reddedilen cevap ÖNERİ DİYE GÖSTERİLMİYOR', async () => {
    await expect(kur({ cevap: 'Tabii, işte öneri' }).svc.oner(CTX, 'c', 'lüks araç')).rejects.toThrow('beklenen biçimde');
    await expect(kur({ cevap: JSON.stringify({ konumlar: 'İzmir' }) }).svc.oner(CTX, 'c', 'lüks araç')).rejects.toThrow(
      'beklenen biçimde',
    );
    await expect(kur({ cevap: cevap(), stop: 'refusal' }).svc.oner(CTX, 'c', 'lüks araç')).rejects.toThrow('reddetti');
  });

  it('Meta hesabı yoksa MODELE GİTMİYOR — çözümleme olmadan öneri kimliksiz terimlerden ibaret olurdu', async () => {
    const { svc, istekler } = kur({ cevap: cevap(), hesap: false });
    await expect(svc.oner(CTX, 'c', 'lüks araç')).rejects.toThrow('Meta reklam hesabı atanmamış');
    expect(istekler).toHaveLength(0);
  });

  it('KRİTİK: çok kelimeli aday sıfır dönerse sonraki aday deneniyor ve hangisinin tuttuğu YAZIYOR', async () => {
    const OTOMOBIL = { id: '6004', name: 'Otomobiller (araçlar)', path: [], audienceMin: null, audienceMax: null };
    const denenen: string[] = [];
    const { svc } = kur({
      cevap: cevap({
        konumlar: [],
        ilgiler: [{ kavram: 'lüks otomobil', aramalar: ['lüks otomobil', 'otomobil', 'luxury car'] }],
      }),
      ilgi: { otomobil: [OTOMOBIL] },
    });
    const ara = (svc as unknown as { connections: { searchInterests: (...a: unknown[]) => unknown } }).connections;
    const asil = ara.searchInterests;
    ara.searchInterests = async (...a: unknown[]) => {
      denenen.push(a[2] as string);
      return asil(...a);
    };
    const r = await svc.oner(CTX, 'c', 'lüks otomobil meraklıları');
    expect(r.interests).toEqual([
      { id: '6004', name: 'Otomobiller (araçlar)', terim: 'lüks otomobil → otomobil', audienceMin: null, audienceMax: null },
    ]);
    // İlk eşleşmede DURUYOR — kalan adaylar kota harcamıyor.
    expect(denenen).toEqual(['lüks otomobil', 'otomobil']);
  });
});


describe('model şeması API’nin desteklediği anahtar kelimelerle sınırlı', () => {
  it('KRİTİK: dizi/sayı/metin kısıtı yok — yapılandırılmış çıktı bunları reddediyor', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const kaynak = readFileSync(resolve(__dirname, 'kitle-onerisi.service.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const bas = kaynak.indexOf('const MODEL_SEMASI = {');
    const son = kaynak.indexOf('} as const;', bas);
    expect(bas, 'şema bulunamadı — tarama boşa düştü').toBeGreaterThan(0);
    const sema = kaynak.slice(bas, son);
    expect(sema).toContain("konumlar: { type: 'array'");
    for (const yasak of ['minItems', 'maxItems', 'minimum', 'maximum', 'minLength', 'maxLength']) {
      expect(sema, yasak).not.toContain(yasak);
    }
  });
});

describe('konum yalnızca Türkiye’de ya da adı geçen ülkede', () => {
  // Canlıda ölçüldü (2026-10-05): "Bornova" araması yalnızca İspanya'daki
  // bir köyü döndürüyor.
  const ISPANYA: GeoLocationOption = {
    key: '1234',
    type: 'city',
    name: 'Gascueña de Bornova',
    label: 'Gascueña de Bornova, Spain, Castilla-La Mancha, İspanya',
    countryCode: 'ES',
  };
  const KATAR: GeoLocationOption = { key: 'QA', type: 'country', name: 'Katar', label: 'Katar', countryCode: 'QA' };
  const DOHA: GeoLocationOption = { key: '777', type: 'city', name: 'Doha', label: 'Doha, Katar', countryCode: 'QA' };

  it('KRİTİK: yalnızca yurt dışında eşleşen ilçe EKLENMİYOR ve sebebi neyle eşleştiğini söylüyor', async () => {
    const { svc } = kur({
      cevap: cevap({ konumlar: ['Bornova'], ilgiler: [], uygulanamayan: [] }),
      geo: { Bornova: [ISPANYA] },
    });
    const r = await svc.oner(CTX, 'c', "Bornova'daki kadınlar");
    expect(r.locations).toEqual([]);
    expect(r.eslesmeyen).toEqual([]);
    expect(r.uygulanamayan).toHaveLength(1);
    expect(r.uygulanamayan[0]!.ifade).toBe('Bornova');
    expect(r.uygulanamayan[0]!.sebep).toContain('Gascueña de Bornova');
  });

  it('Türkiye adayı yabancıdan sonra gelse bile Türkiye seçiliyor', async () => {
    const { svc } = kur({
      cevap: cevap({ konumlar: ['İzmir'], ilgiler: [], uygulanamayan: [] }),
      geo: { İzmir: [ISPANYA, IZMIR] },
    });
    const r = await svc.oner(CTX, 'c', 'İzmir');
    expect(r.locations.map((l) => l.key)).toEqual(['2622']);
  });

  it('tarifte ülkesi geçen yurt dışı şehri KABUL ediliyor (Katar workspace’i kırılmıyor)', async () => {
    const { svc } = kur({
      cevap: cevap({ konumlar: ['Doha', 'Katar'], ilgiler: [], uygulanamayan: [] }),
      geo: { Doha: [DOHA], Katar: [KATAR] },
    });
    const r = await svc.oner(CTX, 'c', "Katar'da Doha");
    // Ülke + o ülkenin şehri: ülke düşüyor (birleşim kuralı), şehir kalıyor.
    expect(r.locations.map((l) => l.key)).toEqual(['777']);
  });

  it('istem virgüllü konum yazmamasını söylüyor — Meta araması onu bulamıyor', async () => {
    const { svc, istekler } = kur({ cevap: cevap({ konumlar: [], ilgiler: [] }) });
    await svc.oner(CTX, 'c', 'x');
    expect(String(istekler[0]!.system)).toContain('virgülle il ya da ülke ekleme');
  });
});
