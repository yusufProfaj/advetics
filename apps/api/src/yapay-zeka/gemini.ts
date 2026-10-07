/**
 * GEMINI İSTEMCİSİ — ürünün TEK yapay zekâ bağlantısı (kullanıcı kararı
 * 2026-10-08: Anthropic kullanılmıyor; model fiyat/performans için seçildi).
 *
 * DÜZ REST, SDK YOK: ürünün geri kalanı da platformlara düz REST ile
 * gidiyor ve paylaşımlı sunucuya yeni bir bağımlılık kurmanın kazancı yok.
 *
 * ANAHTAR ADRESTE DEĞİL BAŞLIKTA (`x-goog-api-key`): `?key=` ile giden
 * anahtar vekil sunucu ve hata günlüklerine adresle birlikte düşer.
 *
 * DÜŞÜNCE İMZALARI: Gemini, modelin döndürdüğü parçaların (araç çağrısı ve
 * son metin parçası dahil) üstüne `thoughtSignature` koyuyor ve bir
 * sonraki istekte "aynen" geri istiyor; eksik ya da değiştirilmiş imza araç
 * döngüsünü bozuyor. Bu yüzden modelin içeriği HİÇ DÖNÜŞTÜRÜLMEDEN, parça
 * parça saklanıyor ve geri gönderiliyor (bkz. dongu.ts). Parçaları birleştiren
 * ya da sadeleştiren bir kod imzayı sessizce düşürür.
 *
 * Bitme sebepleri AYRI hâller: güvenlik engeli "ret", sınır "kesildi", boş
 * cevap "bos". Hepsi kullanıcıya ayrı cümleyle söyleniyor.
 */

export const GEMINI_KOK = 'https://generativelanguage.googleapis.com/v1beta';

/** Gemini parçası; alanlar API'nin kendi adlarıyla (bilinmeyenler de korunur). */
export type GeminiParcasi = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> };
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> };
  [ek: string]: unknown;
};

export interface GeminiMesaji {
  role: 'user' | 'model';
  parts: GeminiParcasi[];
}

export interface GeminiAraci {
  name: string;
  description: string;
  parametersJsonSchema: Record<string, unknown>;
}

export type BitisSebebi = 'bitti' | 'arac' | 'kesildi' | 'ret' | 'bos';

export interface GeminiSonucu {
  parcalar: GeminiParcasi[];
  sebep: BitisSebebi;
  /** Ret/boş için insan okuyacağı açıklama (Gemini'nin sebebiyle). */
  aciklama: string | null;
  girdiToken: number;
  ciktiToken: number;
  onbellekToken: number;
}

export class YapayZekaHatasi extends Error {
  constructor(
    readonly durum: number | null,
    mesaj: string,
  ) {
    super(mesaj);
  }
}

export interface GeminiIstegi {
  sistem: string;
  mesajlar: GeminiMesaji[];
  araclar?: GeminiAraci[];
  enCokCikti: number;
  /** Yapılandırılmış çıktı: JSON şeması verilirse cevap JSON. */
  jsonSemasi?: Record<string, unknown>;
  /** Düşünme düzeyi; varsayılana bırakılmıyor (CLAUDE.md "platformun varsayılanına güvenme"). */
  dusunme?: 'low' | 'medium' | 'high';
}

export interface GeminiAyarlari {
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
}

const RET_SEBEPLERI = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY', 'BLOCKED_PROMPTS']);

export class GeminiIstemcisi {
  constructor(private readonly a: GeminiAyarlari) {}

  get model(): string {
    return this.a.model;
  }

  private govde(g: GeminiIstegi): Record<string, unknown> {
    return {
      systemInstruction: { parts: [{ text: g.sistem }] },
      contents: g.mesajlar,
      ...(g.araclar?.length && { tools: [{ functionDeclarations: g.araclar }] }),
      generationConfig: {
        maxOutputTokens: g.enCokCikti,
        thinkingConfig: { thinkingLevel: g.dusunme ?? 'medium' },
        ...(g.jsonSemasi && { responseMimeType: 'application/json', responseJsonSchema: g.jsonSemasi }),
      },
    };
  }

  private async istek(yol: string, govde: unknown, zamanAsimiMs: number): Promise<Response> {
    let res: Response;
    try {
      res = await (this.a.fetchFn ?? fetch)(`${GEMINI_KOK}/models/${encodeURIComponent(this.a.model)}:${yol}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.a.apiKey },
        body: JSON.stringify(govde),
        signal: AbortSignal.timeout(zamanAsimiMs),
      });
    } catch (e) {
      throw new YapayZekaHatasi(null, `Gemini’ye ulaşılamadı: ${(e as Error).message}`);
    }
    if (!res.ok) {
      const g = (await res.json().catch(() => null)) as { error?: { message?: string; status?: string } } | null;
      throw new YapayZekaHatasi(res.status, `Gemini ${res.status}${g?.error?.status ? ` ${g.error.status}` : ''}: ${g?.error?.message ?? 'cevap okunamadı'}`);
    }
    return res;
  }

  /** Tek atış (akışsız). */
  async uret(g: GeminiIstegi): Promise<GeminiSonucu> {
    const res = await this.istek('generateContent', this.govde(g), 120_000);
    return sonucCoz([(await res.json()) as GeminiCevabi]);
  }

  /**
   * Akışlı adım: metin parçaları geldikçe `metinParcasi` çağrılır; araç
   * çağrısı ve imza yalnız adım bitince, TAM hâliyle döner (yarım araç
   * girdisi çalıştırılmaz).
   */
  async akis(g: GeminiIstegi, metinParcasi: (p: string) => void): Promise<GeminiSonucu> {
    const res = await this.istek('streamGenerateContent?alt=sse', this.govde(g), 180_000);
    if (!res.body) throw new YapayZekaHatasi(null, 'Gemini akışı boş döndü');
    const parcalar: GeminiCevabi[] = [];
    const cozucu = new TextDecoder();
    const okuyucu = res.body.getReader();
    let tampon = '';
    for (;;) {
      const { done, value } = await okuyucu.read();
      if (done) break;
      tampon += cozucu.decode(value, { stream: true });
      const bloklar = tampon.split(/\r?\n\r?\n/);
      tampon = bloklar.pop() ?? '';
      for (const b of bloklar) {
        const veri = b
          .split(/\r?\n/)
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('');
        if (!veri) continue;
        const c = JSON.parse(veri) as GeminiCevabi;
        parcalar.push(c);
        for (const p of c.candidates?.[0]?.content?.parts ?? []) if (typeof p.text === 'string' && !p.thought) metinParcasi(p.text);
      }
    }
    return sonucCoz(parcalar);
  }
}

interface GeminiCevabi {
  candidates?: Array<{ content?: { parts?: GeminiParcasi[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
}

/**
 * Akış parçalarından (ya da tek cevaptan) tek sonuç. Parçalar SIRAYLA ve
 * DEĞİŞTİRİLMEDEN birleştiriliyor; kullanım bilgisi son parçada.
 */
export function sonucCoz(cevaplar: GeminiCevabi[]): GeminiSonucu {
  const parcalar = cevaplar.flatMap((c) => c.candidates?.[0]?.content?.parts ?? []);
  const son = [...cevaplar].reverse();
  const bitis = son.map((c) => c.candidates?.[0]?.finishReason).find(Boolean) ?? null;
  const engel = son.map((c) => c.promptFeedback?.blockReason).find(Boolean) ?? null;
  const k = son.map((c) => c.usageMetadata).find(Boolean) ?? {};
  const onbellek = k.cachedContentTokenCount ?? 0;
  const ortak = {
    parcalar,
    // Girdi kotası ÖNBELLEK DIŞI sayılıyor; önbellekten okunan ayrıca yazılıyor.
    girdiToken: Math.max(0, (k.promptTokenCount ?? 0) - onbellek),
    // Düşünme token'ı çıktı olarak faturalanıyor: kotaya dahil.
    ciktiToken: (k.candidatesTokenCount ?? 0) + (k.thoughtsTokenCount ?? 0),
    onbellekToken: onbellek,
  };
  if (engel) return { ...ortak, sebep: 'ret', aciklama: `Gemini isteği engelledi (${engel}).` };
  if (bitis && RET_SEBEPLERI.has(bitis)) return { ...ortak, sebep: 'ret', aciklama: `Gemini cevabı engelledi (${bitis}).` };
  if (bitis === 'MAX_TOKENS') return { ...ortak, sebep: 'kesildi', aciklama: null };
  if (parcalar.some((p) => p.functionCall)) return { ...ortak, sebep: 'arac', aciklama: null };
  if (!parcalar.some((p) => typeof p.text === 'string' && !p.thought && p.text.trim())) {
    return { ...ortak, sebep: 'bos', aciklama: `Gemini boş cevap döndü${bitis ? ` (${bitis})` : ''}.` };
  }
  return { ...ortak, sebep: 'bitti', aciklama: null };
}

/** Görünür metin (düşünce parçaları hariç). */
export function gorunurMetin(parcalar: GeminiParcasi[]): string {
  return parcalar
    .filter((p) => typeof p.text === 'string' && !p.thought)
    .map((p) => p.text!)
    .join('');
}

/**
 * Servislerin gördüğü dar yüz: testte sahte `uret` verilebilsin diye.
 * `null` = anahtar yok.
 */
export type MetinUretici = Pick<GeminiIstemcisi, 'uret' | 'model'>;

/**
 * Tek atışlık metin/JSON isteği: ret, kesilme ve boş cevap AYRI döner;
 * çağıran her birini kendi cümlesiyle söyler.
 */
export async function metinIste(
  u: MetinUretici,
  g: { sistem: string; metin: string; enCokCikti: number; jsonSemasi?: Record<string, unknown>; dusunme?: GeminiIstegi['dusunme'] },
): Promise<{ tur: 'tamam'; metin: string } | { tur: 'ret' | 'kesildi' | 'bos'; mesaj: string }> {
  const r = await u.uret({
    sistem: g.sistem,
    mesajlar: [{ role: 'user', parts: [{ text: g.metin }] }],
    enCokCikti: g.enCokCikti,
    jsonSemasi: g.jsonSemasi,
    dusunme: g.dusunme ?? 'low',
  });
  if (r.sebep === 'ret') return { tur: 'ret', mesaj: r.aciklama ?? 'Yapay zekâ isteği işlemedi.' };
  if (r.sebep === 'kesildi') return { tur: 'kesildi', mesaj: 'Yapay zekânın cevabı yarıda kesildi.' };
  const metin = gorunurMetin(r.parcalar);
  if (!metin.trim()) return { tur: 'bos', mesaj: r.aciklama ?? 'Yapay zekâ boş cevap döndü.' };
  return { tur: 'tamam', metin };
}
