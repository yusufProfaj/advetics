import { PANEL_YERLERI } from '@advetics/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { googleIlgiEsle, type KitleGoogleIlgi, type KitleKonumu, type KitleOnerisi, type TenantContext } from '@advetics/shared';
import { TokenVaultService } from '../connections/token-vault.service';
import { ProviderRegistry } from '../connections/provider.registry';
import type { GoogleProvider } from '../connections/providers/google.provider';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { ConnectionsService } from '../connections/connections.service';
import { metinIste, type MetinUretici } from '../../yapay-zeka/gemini';
import { YAPAY_ZEKA } from '../../yapay-zeka/yapay-zeka.module';

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

/**
 * Modelin doldurduğu şema.
 *
 * ═══ DİZİ KISITI (`minItems` / `maxItems`) BURADA YOK — ve olmamalı ═══
 *
 * Yapılandırılmış çıktı "karmaşık dizi kısıtlarını" desteklemiyor; SDK onları
 * yalnızca `messages.parse()` yardımcısında şemadan söküyor, burada ise ham
 * `messages.create` kullanılıyor ve şema API'ye olduğu gibi gidiyor. İlk
 * sürüm `maxItems: 5/6/4` ve `minItems: 1` taşıyordu ve özellik canlıda ilk
 * denemede 500 ile düştü (2026-10-05; sebep sunucu logunda doğrulanacak).
 *
 * SINIRLAR KALKMADI, ZOD'A TAŞINDI (`modelCevabi`): Meta çağrı sayısını
 * (kota) onlar sınırlıyor. Sınırı aşan cevap sessizce kırpılmıyor, "tekrar
 * dene" hatası veriyor. Sistem istemi de sayıları söylüyor.
 */
const MODEL_SEMASI = {
  type: 'object',
  additionalProperties: false,
  required: ['konumlar', 'yasMin', 'yasMax', 'cinsiyet', 'ilgiler', 'anahtarKelimeler', 'uygulanamayan'],
  properties: {
    konumlar: { type: 'array', items: { type: 'string' } },
    yasMin: { type: ['integer', 'null'] },
    yasMax: { type: ['integer', 'null'] },
    cinsiyet: { type: 'string', enum: ['all', 'male', 'female'] },
    ilgiler: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kavram', 'aramalar'],
        properties: {
          kavram: { type: 'string' },
          aramalar: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    anahtarKelimeler: { type: 'array', items: { type: 'string' } },
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
  ilgiler: z
    .array(
      z.object({
        kavram: z.string().trim().min(2).max(80),
        aramalar: z.array(z.string().trim().min(2).max(40)).min(1).max(4),
      }),
    )
    .max(6),
  // Eski cevaplar alanı taşımıyorsa boş: Google kelime karşılığı yok demek.
  anahtarKelimeler: z.array(z.string().trim().min(2).max(80)).max(15).default([]),
  uygulanamayan: z.array(z.object({ ifade: z.string().max(300), sebep: z.string().max(300) })).max(10),
});
export type ModelCevabi = z.infer<typeof modelCevabi>;

const SISTEM = `Bir Meta (Facebook/Instagram) reklam kitlesini tarif eden Türkçe bir
metni yapılandırıyorsun. Çıktın bir arama motoruna gidecek: her konum ve her ilgi
terimi Meta'nın kendi aramasında aranacak.

KURALLAR:
- konumlar: metinde AÇIKÇA geçen ülke, il ya da şehir adları. Metinde konum yoksa
  boş bırak (Türkiye geneli varsayılıyor). Konum UYDURMA. Her konumu TEK BAŞINA
  yaz, virgülle il ya da ülke ekleme ("Bornova", "Bornova, İzmir" değil); Meta'nın
  araması virgüllü ifadeyi bulamıyor. Yurt dışındaki bir şehir için ülkesini de
  ayrı bir konum olarak yaz ("Doha" ve "Katar").
- yasMin/yasMax: metinde yaş ya da yaşı belirten bir ifade varsa (ör. "gençler",
  "emekliler") makul aralık; yoksa null. Meta'da alt sınır 18, üst sınır 65 ("65 ve üzeri").
- cinsiyet: metin açıkça kadın ya da erkek diyorsa female/male, yoksa all.
- ilgiler: metindeki her ilgi KAVRAMI için Meta ilgi aramasında denenecek 1-4
  aday terim ("aramalar"). Meta'nın araması KISA terimlerle eşleşiyor: çok
  kelimeli ifadeler çoğu zaman hiç sonuç vermiyor ("lüks otomobil" 0 sonuç,
  "otomobil" ve "luxury car" sonuç veriyor). Adayları EN ÖZELDEN en genele sırala;
  tek ya da iki kelime; Türkçe ve İngilizce karşılık birlikte. Örnek: kavram
  "lüks otomobil" → aramalar ["luxury car", "lüks araç", "otomobil"]. Kimlik
  yazma, yalnızca terim. En fazla 6 kavram.
- anahtarKelimeler: bu kitlenin Google'da ARAYACAĞI Türkçe ifadeler (Google
  özel segmenti: "bu kelimeleri arayan kişiler"). Metindeki ürün ve hizmetten
  türet, 3-15 ifade, gerçek arama dili ("satılık daire izmir", "golf sopası").
  Metin arama niyeti taşımıyorsa boş bırak.
- ilgiler.aramalar içinde EN AZ BİR İngilizce terim olsun: Google'ın ilgi ve
  satın alma niyeti kategorileri İngilizce adlarla eşleniyor.
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
    @Inject(YAPAY_ZEKA) private readonly yz: MetinUretici | null,
    @Inject(CONFIG) config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly connections: ConnectionsService,
    /** Google karşılığı (Base › Kitleler, 2026-10-16). EN SONDA: testler konumla geçiriyor. */
    @Optional() private readonly kasa?: TokenVaultService,
    @Optional() private readonly saglayicilar?: ProviderRegistry,
  ) {
    this.model = config.yapayZeka.model;
  }

  async oner(ctx: TenantContext, clientId: string, metin: string): Promise<KitleOnerisi> {
    if (!this.yz) {
      throw new ServiceUnavailableException('Yapay zekâ bağlı değil (GEMINI_API_KEY tanımlı değil).');
    }

    // ÖNCE HESAP: Meta hesabı yoksa modele gitmeden reddediliyor. Çözümleme
    // Meta aramasına muhtaç; hesapsız bir öneri kimliksiz terimlerden ibaret
    // olurdu ve modelin maliyeti boşa gitmiş olurdu.
    // GOOGLE HESABI DA SAYILIYOR: yalnız Google'ı olan workspace de öneri
    // alabilmeli (Google karşılığı). İkisi de yoksa modele gidilmiyor.
    const googleHesap = await this.googleHesabi(ctx, clientId);
    const hesap = await this.metaHesabi(ctx, clientId, googleHesap !== null);

    const cevap = await this.yapilandir(metin);
    const meta: KitleOnerisi = hesap
      ? await this.coz(ctx, hesap, cevap)
      : {
          locations: [],
          ageMin: Math.max(18, Math.min(65, cevap.yasMin ?? 18)),
          ageMax: Math.max(18, Math.min(65, cevap.yasMax ?? 65)),
          genders: cevap.cinsiyet,
          interests: [],
          eslesmeyen: [],
          uygulanamayan: [...cevap.uygulanamayan, { ifade: 'Meta ilgi ve konumları', sebep: 'Bu workspace’e Meta reklam hesabı atanmamış; yalnız Google karşılığı arandı.' }],
          hesapAdi: '',
          google: { ilgiler: [], kelimeler: [], hesapAdi: null, hata: null },
        };
    return { ...meta, google: await this.googleCoz(googleHesap, cevap) };
  }

  /**
   * ═══ GOOGLE KARŞILIĞI ═══
   *
   * Kategoriler `user_interest`ten (Google'ın sabit sözlüğü, süreç başına 24
   * saat önbellek: her öneride binlerce satır çekmek kota israfı). Modelin
   * ilgi adayları (İngilizce dahil) kategori adlarında aranıyor; kavram başına
   * en çok iki kategori, hangi terimle eşleştiği yazıyor. Kelimeler modelden
   * geliyor (özel segment terimi, kimlik gerektirmiyor).
   *
   * HATA YUTULMUYOR AMA ÖNERİYİ DÜŞÜRMÜYOR: Meta tarafı hazırken Google
   * okuması düştüyse neden `google.hata`da yazıyor.
   */
  private async googleCoz(
    hesap: GoogleKitleHesabi | null,
    c: ModelCevabi,
  ): Promise<KitleOnerisi['google']> {
    const kelimeler = [...new Set(c.anahtarKelimeler.map((k) => k.toLocaleLowerCase('tr')))];
    if (!hesap) {
      return { ilgiler: [], kelimeler, hesapAdi: null, hata: 'Bu workspace’e Google Ads hesabı atanmamış; Google kategorileri aranamadı.' };
    }
    if (!this.kasa || !this.saglayicilar) {
      return { ilgiler: [], kelimeler, hesapAdi: hesap.name, hata: 'Google bağlantısı bu ortamda kurulu değil.' };
    }
    let liste: KitleGoogleIlgi[];
    try {
      liste = await googleKategorileri(async () => {
        const google = this.saglayicilar!.get('google') as unknown as GoogleProvider;
        const token = await this.kasa!.getAccessToken(hesap.connection_id, this.saglayicilar!.get('google'));
        return google.kullaniciIlgileri(token, hesap.external_id.replace(/-/g, ''), hesap.manager_external_id ?? undefined);
      });
    } catch (e) {
      this.logger.warn(`Google kategorileri okunamadı: ${e instanceof Error ? e.message : String(e)}`);
      return { ilgiler: [], kelimeler, hesapAdi: hesap.name, hata: `Google kategorileri okunamadı: ${e instanceof Error ? e.message : String(e)}` };
    }
    const ilgiler: KitleOnerisi['google']['ilgiler'] = [];
    for (const ilgi of c.ilgiler) {
      for (const aday of ilgi.aramalar) {
        const bulunan = googleIlgiEsle(liste, aday, 2).filter((g) => !ilgiler.some((x) => x.id === g.id));
        if (bulunan.length > 0) {
          for (const g of bulunan) ilgiler.push({ ...g, terim: aday === ilgi.kavram ? ilgi.kavram : `${ilgi.kavram} → ${aday}` });
          break;
        }
      }
    }
    return { ilgiler, kelimeler, hesapAdi: hesap.name, hata: null };
  }

  private async googleHesabi(ctx: TenantContext, clientId: string): Promise<GoogleKitleHesabi | null> {
    const [h] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<GoogleKitleHesabi[]>(Prisma.sql`
        SELECT id::text AS id, name, connection_id::text AS connection_id, external_id, manager_external_id
          FROM ad_accounts
         WHERE client_id = ${clientId}::uuid AND platform = 'google'
         ORDER BY sync_enabled DESC, name LIMIT 1
      `),
    );
    // Test taklitleri her sorguya aynı satırı döndürüyor: bağlantısı olmayan satır Google hesabı değil.
    return h && h.connection_id ? h : null;
  }

  /** 1. aşama: metin → yapılandırılmış terimler. */
  private async yapilandir(metin: string): Promise<ModelCevabi> {
    const r0 = await metinIste(this.yz!, { sistem: SISTEM, metin, enCokCikti: 2000, jsonSemasi: MODEL_SEMASI });
    if (r0.tur === 'ret') {
      throw new BadRequestException('Yapay zekâ bu tarifi işlemeyi reddetti; kitleyi farklı sözcüklerle anlat.');
    }
    if (r0.tur !== 'tamam') throw new BadRequestException(`${r0.mesaj} Tekrar dene; sürerse kitleyi elle kur.`);
    const ham = r0.metin;
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

    /*
     * ═══ İL/ŞEHİR YALNIZCA TÜRKİYE'DE YA DA ADI GEÇEN ÜLKEDE ═══
     *
     * Burada Meta'nın İLK sonucu koşulsuz alınıyordu. Canlıda ölçüldü
     * (2026-10-05): "Bornova" araması Türkiye'deki ilçeyi değil "Gascueña de
     * Bornova, İspanya"yı döndürüyor — model "Bornova" yazsaydı reklam
     * hiçbir hata vermeden İspanya'ya gidecekti. İlçeler Meta'da çoğu zaman
     * ayrı bir konum değil.
     *
     * KABUL KÜMESİ: Türkiye + tarifte ÜLKE olarak çözülen her ülke. Yalnızca
     * "Türkiye" demek yurt dışı hedefleyen workspace'leri (Katar, Kuveyt)
     * kırardı; "Katar'da Doha" iki terim üretir ve Doha, Katar çözüldüğü için
     * geçer. Yabancı tek eşleşme sessizce EKLENMİYOR ve sessizce DÜŞMÜYOR:
     * neyle eşleştiği `uygulanamayan`a yazılıyor, kullanıcı gerçekten
     * orasıysa elle ekliyor. Arama sayısı değişmiyor (sonuçlar saklanıyor).
     */
    const gecerliTur = (o: { type: string }) =>
      o.type === 'country' || o.type === 'region' || o.type === 'city';
    const aramalar: Array<{ terim: string; adaylar: Awaited<ReturnType<ConnectionsService['searchGeoLocations']>> }> = [];
    for (const terim of c.konumlar) {
      const sonuc = await this.connections.searchGeoLocations(ctx, hesap.id, terim);
      aramalar.push({ terim, adaylar: sonuc.filter(gecerliTur) });
    }
    const izinliUlkeler = new Set<string>(['TR']);
    for (const a of aramalar) {
      const ilk = a.adaylar[0];
      if (ilk?.type === 'country') izinliUlkeler.add(ilk.key);
    }

    const locations: KitleKonumu[] = [];
    for (const { terim, adaylar } of aramalar) {
      // Kabul kümesi içinde Meta'nın alaka sırası. Kullanıcı formda görüp değiştiriyor.
      const ilk = adaylar.find(
        (o) => o.type === 'country' || (o.countryCode !== null && izinliUlkeler.has(o.countryCode)),
      );
      if (!ilk) {
        const yabanci = adaylar[0];
        if (yabanci) {
          uygulanamayan.push({
            ifade: terim,
            sebep:
              `Meta'da Türkiye'de bu adla bir il ya da şehir yok; yalnızca yurt dışında eşleşti ` +
              `(${yabanci.label}). Yanlış ülkeye gitmesin diye eklenmedi; gerçekten orasıysa elle ekle.`,
          });
        } else {
          eslesmeyen.push({ terim, tur: 'konum' });
        }
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

    /*
     * ADAYLAR SIRAYLA DENENİYOR, İLK EŞLEŞEN ALINIYOR. Canlı ölçüm
     * (2026-09-29, `meta-ilgi-kontrol`): Meta ilgi araması kısa terimlerle
     * eşleşiyor, çok kelimeli ifadeler çoğu zaman SIFIR dönüyor ("lüks
     * otomobil" 0, "otomobil" 5, "luxury car" 4); `locale` eşleşmeyi
     * etkilemiyor. Hangi adayın eşleştiği `terim`e yazılıyor: "lüks
     * otomobil" kavramı "otomobil" ile eşleştiyse kitle kavramdan GENİŞ ve
     * kullanıcı bunu görmeli. Kavram başına en fazla 4 çağrı (kota).
     */
    const interests: KitleOnerisi['interests'] = [];
    for (const ilgi of c.ilgiler) {
      let bulunan: { terim: string; o: Awaited<ReturnType<ConnectionsService['searchInterests']>>[number] } | null = null;
      for (const aday of ilgi.aramalar) {
        const sonuc = await this.connections.searchInterests(ctx, hesap.id, aday);
        const ilk = sonuc.find((o) => !interests.some((i) => i.id === o.id));
        if (ilk) {
          bulunan = { terim: aday, o: ilk };
          break;
        }
      }
      if (!bulunan) {
        eslesmeyen.push({ terim: ilgi.kavram, tur: 'ilgi' });
        continue;
      }
      interests.push({
        id: bulunan.o.id,
        name: bulunan.o.name,
        terim: bulunan.terim === ilgi.kavram ? ilgi.kavram : `${ilgi.kavram} → ${bulunan.terim}`,
        audienceMin: bulunan.o.audienceMin,
        audienceMax: bulunan.o.audienceMax,
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
      // Google tarafı `oner`de dolduruluyor (`googleCoz`); burada yalnız Meta.
      google: { ilgiler: [], kelimeler: [], hesapAdi: null, hata: null },
    };
  }

  private async metaHesabi(ctx: TenantContext, clientId: string, googleVar: boolean): Promise<{ id: string; name: string } | null> {
    const [h] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
        SELECT id::text AS id, name FROM ad_accounts
         WHERE client_id = ${clientId}::uuid AND platform = 'meta' AND sync_enabled
         ORDER BY name LIMIT 1
      `),
    );
    if (!h) {
      if (googleVar) return null;
      throw new BadRequestException(
        'Bu workspace’e izlenen bir Meta reklam hesabı atanmamış ve Google Ads hesabı da yok. Öneri konum ve ilgi alanlarını ' +
          `platformların kendi aramasıyla çözüyor; önce ${PANEL_YERLERI.kurulum}’da hesap ata.`,
      );
    }
    return h;
  }
}

interface GoogleKitleHesabi {
  id: string;
  name: string;
  connection_id: string;
  external_id: string;
  manager_external_id: string | null;
}

/**
 * Google kategori sözlüğü süreç başına 24 saat önbellekte. Hesaptan bağımsız
 * (Google'ın sabit listesi); düşen okuma önbelleğe YAZILMIYOR.
 */
let kategoriOnbellegi: { zaman: number; liste: KitleGoogleIlgi[] } | null = null;
const KATEGORI_OMRU_MS = 24 * 60 * 60 * 1000;
export async function googleKategorileri(oku: () => Promise<KitleGoogleIlgi[]>, simdi = Date.now()): Promise<KitleGoogleIlgi[]> {
  if (kategoriOnbellegi && simdi - kategoriOnbellegi.zaman < KATEGORI_OMRU_MS) return kategoriOnbellegi.liste;
  const liste = await oku();
  kategoriOnbellegi = { zaman: simdi, liste };
  return liste;
}
export function kategoriOnbelleginiSifirla(): void {
  kategoriOnbellegi = null;
}
