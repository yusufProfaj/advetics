import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { KitleKonumu, KitleOnerisi, TenantContext } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectionsService } from '../connections/connections.service';
import { ANTHROPIC_CLIENT } from './anthropic-client.provider';
import type { AnthropicLike } from './ai-assistant.service';

/**
 * ═══ DOĞAL DİLDEN KİTLE ÖNERİSİ (Marka Merkezi Bölüm 4c) ═══
 *
 * "son bir ayda lüks araç arayan erkekler" → konum, yaş, cinsiyet ve Meta
 * ilgi alanları. İKİ AŞAMA ve ayrılmaları bilinçli:
 *
 *   1. Model metni YAPILANDIRIYOR: yer adları, yaş, cinsiyet, ilgi ARAMA
 *      TERİMLERİ ve kurulamayan kısımlar. Kimlik ÜRETMİYOR — modelin
 *      "hatırladığı" bir ilgi kimliği uydurmadır.
 *   2. Sunucu her terimi Meta'nın KENDİ aramasıyla (`adgeolocation`,
 *      `adinterest`) gerçek bir kimliğe çözüyor. Bulunamayan terim listeden
 *      sessizce düşmüyor, `eslesmeyen`e yazılıyor.
 *
 * KAYDETMİYOR. Öneri formda gösteriliyor, kullanıcı düzeltip kendisi
 * kaydediyor (Bilgi Bankası taslağıyla aynı ilke).
 *
 * YAPILANDIRILMIŞ ÇIKTI `output_config.format` ile — zorunlu `tool_choice`
 * DEĞİL: model yapılandırmadan geliyor ve yeni modellerde zorunlu araç
 * seçimi 400 dönüyor. Yanıt yine de Zod'dan geçiyor; şemaya uymayan bir
 * cevap "öneri" diye gösterilmiyor.
 */

/** Modelin doldurduğu şema. Sınırlar Meta çağrı sayısını da sınırlıyor (kota). */
const MODEL_SEMASI = {
  type: 'object',
  additionalProperties: false,
  required: ['konumlar', 'yasMin', 'yasMax', 'cinsiyet', 'ilgiTerimleri', 'uygulanamayan'],
  properties: {
    konumlar: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    yasMin: { type: ['integer', 'null'] },
    yasMax: { type: ['integer', 'null'] },
    cinsiyet: { type: 'string', enum: ['all', 'male', 'female'] },
    ilgiTerimleri: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    uygulanamayan: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ifade', 'sebep'],
        properties: { ifade: { type: 'string' }, sebep: { type: 'string' } },
      },
    },
  },
} as const;

const modelCevabi = z.object({
  konumlar: z.array(z.string().trim().min(2).max(80)).max(5),
  yasMin: z.number().int().nullable(),
  yasMax: z.number().int().nullable(),
  cinsiyet: z.enum(['all', 'male', 'female']),
  ilgiTerimleri: z.array(z.string().trim().min(2).max(80)).max(6),
  uygulanamayan: z.array(z.object({ ifade: z.string().max(300), sebep: z.string().max(300) })).max(10),
});
export type ModelCevabi = z.infer<typeof modelCevabi>;

const SISTEM = `Bir Meta (Facebook/Instagram) reklam kitlesini tarif eden Türkçe bir
metni yapılandırıyorsun. Çıktın bir arama motoruna gidecek: her konum ve her ilgi
terimi Meta'nın kendi aramasında aranacak.

KURALLAR:
- konumlar: metinde AÇIKÇA geçen ülke, il ya da şehir adları. Metinde konum yoksa
  boş bırak (Türkiye geneli varsayılıyor). Konum UYDURMA.
- yasMin/yasMax: metinde yaş ya da yaşı belirten bir ifade varsa (ör. "gençler",
  "emekliler") makul aralık; yoksa null. Meta'da alt sınır 18, üst sınır 65 ("65 ve üzeri").
- cinsiyet: metin açıkça kadın ya da erkek diyorsa female/male, yoksa all.
- ilgiTerimleri: Meta ilgi alanı aramasında aranacak KISA Türkçe terimler (1-3
  kelime; ör. "lüks otomobil", "golf"). Kimlik yazma, yalnızca terim. En fazla 6.
- uygulanamayan: metinde olan ama Meta'nın konum/yaş/cinsiyet/ilgi hedeflemesiyle
  kurulamayan her parça ve NEDEN. Örnek: "son bir ayda" → Meta ilgi hedeflemesinde
  zaman aralığı yok; "arayan" (arama niyeti) → Meta'da doğrudan karşılığı yok, en
  yakın karşılık ilgi alanı. Hiçbir parçayı sessizce atlama.
- Uzun tire kullanma.`;

@Injectable()
export class KitleOnerisiService {
  private readonly logger = new Logger(KitleOnerisiService.name);
  private readonly model: string;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: AnthropicLike | null,
    @Inject(CONFIG) config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly connections: ConnectionsService,
  ) {
    this.model = config.aiAssistant.model;
  }

  async oner(ctx: TenantContext, clientId: string, metin: string): Promise<KitleOnerisi> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException('AI asistanı yapılandırılmamış — ANTHROPIC_API_KEY eksik.');
    }

    // ÖNCE HESAP: Meta hesabı yoksa modele gitmeden reddediliyor. Çözümleme
    // Meta aramasına muhtaç; hesapsız bir öneri kimliksiz terimlerden ibaret
    // olurdu ve modelin maliyeti boşa gitmiş olurdu.
    const hesap = await this.metaHesabi(ctx, clientId);

    const cevap = await this.yapilandir(metin);
    return this.coz(ctx, hesap, cevap);
  }

  /** 1. aşama: metin → yapılandırılmış terimler. */
  private async yapilandir(metin: string): Promise<ModelCevabi> {
    const response = await this.anthropic!.messages.create({
      model: this.model,
      max_tokens: 2000,
      system: SISTEM,
      messages: [{ role: 'user', content: metin }],
      output_config: { format: { type: 'json_schema', schema: MODEL_SEMASI } },
    });

    if (response.stop_reason === 'refusal') {
      throw new BadRequestException('Yapay zekâ bu tarifi işlemeyi reddetti; kitleyi farklı sözcüklerle anlat.');
    }
    const ham = response.content
      .filter((b): b is Extract<(typeof response.content)[number], { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('');
    let json: unknown;
    try {
      json = JSON.parse(ham);
    } catch {
      this.logger.warn(`Kitle önerisi JSON değil: ${ham.slice(0, 300)}`);
      throw new BadRequestException('Öneri beklenen biçimde gelmedi. Tekrar dene; sürerse kitleyi elle kur.');
    }
    const r = modelCevabi.safeParse(json);
    if (!r.success) {
      this.logger.warn(`Kitle önerisi şemaya uymadı: ${r.error.issues[0]?.message} · ${ham.slice(0, 300)}`);
      throw new BadRequestException('Öneri beklenen biçimde gelmedi. Tekrar dene; sürerse kitleyi elle kur.');
    }
    return r.data;
  }

  /** 2. aşama: terimler → Meta kimlikleri. Dışa açık, çünkü saf mantığı test ediliyor. */
  async coz(
    ctx: TenantContext,
    hesap: { id: string; name: string },
    c: ModelCevabi,
  ): Promise<KitleOnerisi> {
    const eslesmeyen: KitleOnerisi['eslesmeyen'] = [];
    const uygulanamayan = [...c.uygulanamayan];

    const locations: KitleKonumu[] = [];
    for (const terim of c.konumlar) {
      const sonuc = await this.connections.searchGeoLocations(ctx, hesap.id, terim);
      // İLK SONUÇ: Meta'nın alaka sırası. Kullanıcı formda görüp değiştiriyor.
      const ilk = sonuc.find((o) => o.type === 'country' || o.type === 'region' || o.type === 'city');
      if (!ilk) {
        eslesmeyen.push({ terim, tur: 'konum' });
        continue;
      }
      if (locations.some((l) => l.key === ilk.key && l.type === ilk.type)) continue;
      locations.push({
        key: ilk.key,
        type: ilk.type as KitleKonumu['type'],
        label: ilk.label,
        countryCode: ilk.countryCode ?? null,
      });
    }
    /*
     * ÜLKE + O ÜLKENİN İLİ: model "İzmir, Türkiye" diye ikisini birden
     * yazabiliyor. Meta ikisini birleştirip ülke geneline gösterir; ülke
     * düşürülüyor ve bu SÖYLENİYOR (şema zaten kaydetmeyi reddederdi).
     */
    const altUlkeler = new Set(locations.filter((l) => l.type !== 'country').map((l) => l.countryCode));
    const dusenUlke = locations.filter((l) => l.type === 'country' && altUlkeler.has(l.key));
    for (const u of dusenUlke) {
      uygulanamayan.push({
        ifade: u.label,
        sebep: 'Aynı ülkenin il/şehri de seçili; Meta ikisini birleştirip ülkenin tamamına gösterirdi, ülke çıkarıldı.',
      });
    }
    const sonKonumlar = locations.filter((l) => !dusenUlke.includes(l));

    const interests: KitleOnerisi['interests'] = [];
    for (const terim of c.ilgiTerimleri) {
      const sonuc = await this.connections.searchInterests(ctx, hesap.id, terim);
      const ilk = sonuc.find((o) => !interests.some((i) => i.id === o.id));
      if (!ilk) {
        eslesmeyen.push({ terim, tur: 'ilgi' });
        continue;
      }
      interests.push({
        id: ilk.id,
        name: ilk.name,
        terim,
        audienceMin: ilk.audienceMin,
        audienceMax: ilk.audienceMax,
      });
    }

    // Yaş Meta sınırlarına sıkıştırılıyor ve sıkıştırma SÖYLENİYOR.
    let ageMin = c.yasMin ?? 18;
    let ageMax = c.yasMax ?? 65;
    if (ageMin < 18) {
      uygulanamayan.push({ ifade: `${ageMin} yaş`, sebep: 'Meta reklamında alt yaş sınırı 18; 18 yapıldı.' });
      ageMin = 18;
    }
    if (ageMax > 65) ageMax = 65;
    if (ageMin > ageMax) [ageMin, ageMax] = [ageMax, ageMin];

    return {
      locations: sonKonumlar,
      ageMin,
      ageMax,
      genders: c.cinsiyet,
      interests,
      eslesmeyen,
      uygulanamayan,
      hesapAdi: hesap.name,
    };
  }

  private async metaHesabi(ctx: TenantContext, clientId: string): Promise<{ id: string; name: string }> {
    const [h] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
        SELECT id::text AS id, name FROM ad_accounts
         WHERE client_id = ${clientId}::uuid AND platform = 'meta' AND sync_enabled
         ORDER BY name LIMIT 1
      `),
    );
    if (!h) {
      throw new BadRequestException(
        'Bu workspace’e izlenen bir Meta reklam hesabı atanmamış. Öneri konum ve ilgi alanlarını ' +
          'Meta’nın aramasıyla çözüyor; önce Bağlantılar’dan hesap ata.',
      );
    }
    return h;
  }
}
