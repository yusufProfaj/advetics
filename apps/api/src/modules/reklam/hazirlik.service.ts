import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  HAZIRLIK_GORSEL_SINIRI,
  KITLE_CINSIYETLERI,
  kitleKonumuSchema,
  kitleOzeti,
  OZEL_KATEGORILER,
  type OzelKategori,
  type KitleKonumu,
  type RehberHazirligi,
  type ReklamHazirligi,
  type TenantContext,
  type UcHal,
} from '@advetics/shared';
import { Prisma } from '@prisma/client';
import { ajansYoneticisiMi } from './ajans-yoneticisi';
import { PrismaService } from '../../prisma/prisma.service';

const logger = new Logger('ReklamHazirlik');

interface ProfilSatiri {
  yasal_uyari: string | null;
  metin_sablonlari: string[] | null;
  k_id: string | null;
  k_ad: string | null;
  k_konum: unknown;
  k_min: number | null;
  k_max: number | null;
  k_cins: string | null;
}

/**
 * Rehber hazırlığının PLATFORM okumaları. Bu modül eski bağlantı servislerine
 * bağlanmıyor (modül sınırı); okuyucuyu rehber servisi veriyor. Her okuma
 * ayrı ve TRANSACTION DIŞINDA çağrılıyor.
 */
export interface RehberPlatformOkuyucu {
  /** Meta günlük asgari bütçesi, micros dizge (`GET /act_X/minimum_budgets`). */
  metaAsgariGunluk(adAccountId: string, clientId: string): Promise<string | null>;
  /** Sayfada Lead Ads koşulları kabul edilmiş mi (`leadgen_tos_accepted`). */
  metaFormKosullari(sayfaId: string, clientId: string): Promise<boolean | null>;
  /** Google Ads'te etkin birincil dönüşüm işlemi var mı. */
  googleDonusumEtkin(adAccountId: string): Promise<boolean | null>;
}

/**
 * Google Talep Yaratma günlük asgarisi — YALNIZ TRY ve ÖLÇÜLMÜŞ değer
 * (2026-10-09 provası: 50 ₺ reddedildi, 250 ₺ geçti; Google'ın "5 USD
 * karşılığı" kuralı). Başka para biriminde kur bilmiyoruz ve sayı UYDURMUYORUZ:
 * `null` = kontrol yok, prova söyler.
 */
export const GOOGLE_TY_ASGARI_TRY_MICROS = 250_000_000n;

/**
 * Reklam modülünün hazırlık okuması — TEK transaction, platform çağrısı YOK.
 *
 * Eski modüllerin servislerini ÇAĞIRMIYOR (ConnectionsService,
 * AssetsService, KitleSablonuService): yeni modül onlardan bağımsız kalmalı
 * ki Aşama 7'deki silme bu ucu kırmasın. Okunan tablolar ortak — veri tek.
 *
 * HAVUZ SATIRLARI GİRMİYOR: `client_id = X` süzgeci açık yazılıyor. RLS
 * org yöneticisine havuzu (`client_id IS NULL`) BİLEREK gösteriyor; süzgeç
 * RLS'e bırakılsaydı ajans yöneticisi her workspace'te 481 hesabı seçenek
 * olarak görürdü (CLAUDE.md "HAVUZ SATIRLARI MÜŞTERİ-KAPSAMLI SAYIMA GİRMEZ").
 */
@Injectable()
export class ReklamHazirlikService {
  constructor(private readonly prisma: PrismaService) {}

  async oku(ctx: TenantContext, clientId: string): Promise<ReklamHazirligi> {
    // RLS satırı gizler ama "boş workspace" ile "erişimin yok" ayrı cümle.
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');

    return this.prisma.withTenant(ctx, async (tx) => {
      /*
       * Ham SQL: test koşum ortamı yalnızca $queryRaw taklit ediyor ve
       * gerçek şemaya karşı koşan bir test, typed istemciyle yazılmış bir
       * sorgunun taklidinden değerlidir.
       */
      const [hesaplar, profiller, gorseller, [sayim], [musteri], [profilSatiri]] = await Promise.all([
        tx.$queryRaw<Array<{ id: string; name: string; external_id: string; currency: string; timezone: string }>>(Prisma.sql`
          SELECT id::text, name, external_id, currency, timezone
            FROM ad_accounts
           WHERE client_id = ${clientId}::uuid AND platform = 'meta'
           ORDER BY name`),
        // KAPALI LİSTE: yeni bir profil türü varsayılan olarak DIŞARIDA kalır.
        tx.$queryRaw<Array<{ id: string; name: string; profile_type: string; parent: string | null }>>(Prisma.sql`
          SELECT id::text, name, profile_type::text, parent_page_external_id AS parent
            FROM social_profiles
           WHERE client_id = ${clientId}::uuid
             AND profile_type IN ('facebook_page', 'instagram_business')
           ORDER BY name`),
        tx.$queryRaw<Array<{ id: string; name: string; width: number; height: number }>>(Prisma.sql`
          SELECT id::text, name, width, height
            FROM assets
           WHERE client_id = ${clientId}::uuid AND kind = 'image'
           ORDER BY created_at DESC
           LIMIT ${HAZIRLIK_GORSEL_SINIRI}`),
        tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
          SELECT count(*)::int AS n FROM assets WHERE client_id = ${clientId}::uuid AND kind = 'image'`),
        tx.$queryRaw<Array<{ kategoriler: string[] }>>(Prisma.sql`
          SELECT special_ad_categories AS kategoriler FROM clients WHERE id = ${clientId}::uuid`),
        tx.$queryRaw<ProfilSatiri[]>(Prisma.sql`
          SELECT p.yasal_uyari, p.metin_sablonlari,
                 k.id::text AS k_id, k.name AS k_ad, k.locations AS k_konum,
                 k.age_min AS k_min, k.age_max AS k_max, k.genders AS k_cins
            FROM client_profiles p
            LEFT JOIN audience_templates k ON k.id = p.varsayilan_kitle_id
           WHERE p.client_id = ${clientId}::uuid`),
      ]);
      const profil = profilSatiri ?? null;
      const konumListesi = profil?.k_id ? konumlar(profil.k_id, profil.k_konum) : [];
      const tabanHam = musteri?.kategoriler ?? [];
      const taban = new Set<OzelKategori>();
      const taninmayan: string[] = [];
      for (const k of tabanHam) {
        // Meta CREDIT'i 2025-01-14'te FINANCIAL_PRODUCTS_SERVICES ile değiştirdi.
        const c = k === 'CREDIT' ? 'FINANCIAL_PRODUCTS_SERVICES' : k;
        if ((OZEL_KATEGORILER as readonly string[]).includes(c)) taban.add(c as OzelKategori);
        else taninmayan.push(k);
      }

      return {
        hesaplar: hesaplar.map((h) => ({ id: h.id, ad: h.name, disKimlik: h.external_id, paraBirimi: h.currency, saatDilimi: h.timezone })),
        sayfalar: profiller
          .filter((p) => p.profile_type === 'facebook_page')
          .map((p) => ({ id: p.id, ad: p.name, ustSayfaPlatformId: null })),
        instagramHesaplari: profiller
          .filter((p) => p.profile_type === 'instagram_business')
          .map((p) => ({ id: p.id, ad: p.name, ustSayfaPlatformId: p.parent })),
        gorseller: {
          satirlar: gorseller.map((g) => ({
            id: g.id,
            ad: g.name,
            onizlemeAdresi: `/assets/${g.id}/preview`,
            genislik: g.width,
            yukseklik: g.height,
          })),
          toplam: sayim?.n ?? 0,
        },
        marka: {
          yasalUyari: profil?.yasal_uyari ?? null,
          metinSablonlari: profil?.metin_sablonlari ?? [],
          profilVar: profil !== null,
        },
        varsayilanKitle: profil?.k_id
          ? {
              id: profil.k_id,
              ad: profil.k_ad ?? '',
              ozet: kitleOzeti({
                locations: konumListesi,
                ageMin: profil.k_min ?? 18,
                ageMax: profil.k_max ?? 65,
                genders: (KITLE_CINSIYETLERI as readonly string[]).includes(profil.k_cins ?? '')
                  ? (profil.k_cins as (typeof KITLE_CINSIYETLERI)[number])
                  : 'all',
              }),
              konumlar: konumListesi.map((l) => ({
                tur: l.type,
                key: l.key,
                etiket: l.label,
                ulkeKodu: l.countryCode,
              })),
            }
          : null,
        ozelKategoriTabani: OZEL_KATEGORILER.filter((k) => taban.has(k)),
        taninmayanKategoriler: taninmayan,
      };
    });
  }

  /**
   * REHBER HAZIRLIĞI — `oku`nun üstüne Google hesapları, YouTube kanalları,
   * ön koşullar ve asgari bütçe (shared `RehberHazirligi`).
   *
   * VERİTABANI KISMI TEK TRANSACTION, PLATFORM KISMI TRANSACTION DIŞINDA:
   * Meta/Google çağrısı 5 saniyelik transaction sınırını aşabilir ve
   * transaction ölünce hata bile kaydedilemez (CLAUDE.md).
   *
   * Ön koşullar hesap/sayfa başına: hazırlık okunurken kullanıcı henüz
   * seçmedi, panel ilk hesabı/sayfayı önden seçiyor ve okuma ONA yapılıyor.
   * Birden çok hesap varsa öbürlerinin değeri farklı olabilir (devir notu).
   *
   * Okunmayan ön koşullar (WhatsApp hattı, satış ölçümü) Dalga 2-3'ün;
   * bugün `null` = "kontrol etmedik". Eksik listesi `null`ı UYARI gösteriyor
   * ve o amaçlar açılış tablosunda zaten kapalı.
   */
  async rehberOku(ctx: TenantContext, clientId: string, okuyucu: RehberPlatformOkuyucu | null): Promise<RehberHazirligi> {
    const temel = await this.oku(ctx, clientId);
    const ek = await this.prisma.withTenant(ctx, async (tx) => {
      const [googleHesaplari, kanallar, [musteri], ajansYoneticisi] = await Promise.all([
        tx.$queryRaw<Array<{ id: string; name: string; external_id: string; currency: string; timezone: string }>>(Prisma.sql`
          SELECT id::text, name, external_id, currency, timezone
            FROM ad_accounts
           WHERE client_id = ${clientId}::uuid AND platform = 'google'
           ORDER BY name`),
        tx.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
          SELECT id::text, name FROM social_profiles
           WHERE client_id = ${clientId}::uuid AND profile_type = 'youtube_channel'
           ORDER BY name`),
        tx.$queryRaw<Array<{ telefon: string | null; site: string | null; logo: string | null; marka: string | null; ad: string }>>(Prisma.sql`
          SELECT c.contact_phone AS telefon, c.website AS site, p.logo_asset_id::text AS logo,
                 p.marka_adi AS marka, c.name AS ad
            FROM clients c LEFT JOIN client_profiles p ON p.client_id = c.id
           WHERE c.id = ${clientId}::uuid`),
        // Rehber servisiyle AYNI kural, tek yardımcıdan (BULGU-5).
        ajansYoneticisiMi(tx, ctx),
      ]);
      /*
       * FORM ŞABLONLARI: ilk sayfanın kayıtlı anlık formları (`lead_forms`,
       * Potansiyel Müşteriler modülünün tablosu; servisine bağlanılmıyor,
       * modül sınırı). Her formun YALNIZ son sürümü. Sayfa yoksa boş liste.
       */
      const sayfaId = temel.sayfalar[0]?.id ?? null;
      const formlar = sayfaId
        ? await tx.$queryRaw<Array<{ id: string; ad: string }>>(Prisma.sql`
            SELECT id::text, name AS ad FROM lead_forms
             WHERE client_id = ${clientId}::uuid AND social_profile_id = ${sayfaId}::uuid AND superseded_by_id IS NULL
             ORDER BY updated_at DESC, id`)
        : [];
      return { googleHesaplari, kanallar, musteri, ajansYoneticisi, formlar };
    });

    const metaHesap = temel.hesaplar[0] ?? null;
    const sayfa = temel.sayfalar[0] ?? null;
    const googleHesap = ek.googleHesaplari[0] ?? null;
    const [metaAsgari, metaForm, googleDonusum] = await Promise.all([
      uc('Meta asgari bütçe', metaHesap && okuyucu ? () => okuyucu.metaAsgariGunluk(metaHesap.id, clientId) : null),
      uc('Meta form koşulları', sayfa && okuyucu ? () => okuyucu.metaFormKosullari(sayfa.id, clientId) : null),
      uc('Google dönüşüm işlemi', googleHesap && okuyucu ? () => okuyucu.googleDonusumEtkin(googleHesap.id) : null),
    ]);
    const yok: UcHal = null;

    return {
      ...temel,
      googleHesaplari: ek.googleHesaplari.map((g) => ({
        id: g.id,
        ad: g.name,
        musteriNo: musteriNo(g.external_id),
        paraBirimi: g.currency,
        saatDilimi: g.timezone,
      })),
      youtubeKanallari: ek.kanallar.map((k) => ({ id: k.id, ad: k.name })),
      onKosullar: {
        metaFormKosullari: metaForm,
        metaWhatsapp: yok,
        metaSatisOlcumu: yok,
        googleSatisOlcumu: yok,
        googleDonusumEtkin: googleDonusum,
        // İşletme adı her zaman var (yoksa workspace adı); belirleyici logo.
        googleLogoVeAd: !!ek.musteri?.logo,
        // Marka Merkezi'nde aydınlatma/gizlilik adresi alanı YOK (devir notu,
        // "Ajan 1'e"). Var saymak form reklamını yayında patlatırdı.
        gizlilikAdresi: false,
      },
      asgariGunluk: {
        meta: metaAsgari,
        googleTalepYaratma: googleHesap?.currency === 'TRY' ? GOOGLE_TY_ASGARI_TRY_MICROS.toString() : null,
      },
      iletisim: { telefon: ek.musteri?.telefon ?? null, siteAdresi: ek.musteri?.site ?? null },
      formSablonlari: ek.formlar,
      ajansYoneticisi: ek.ajansYoneticisi,
    };
  }
}

/** `1234567890` → `123-456-7890` (ekranda gösterilen biçim). */
function musteriNo(id: string): string {
  const d = id.replace(/-/g, '');
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : id;
}

/**
 * Bir platform okuması: düşerse `null` + LOG, ASLA `false`. Bilinmeyeni
 * "yok" saymak sağlam bir kurulumu kilitler (RehberOnKosullari yorumu).
 */
async function uc<T>(ad: string, fn: (() => Promise<T | null>) | null): Promise<T | null> {
  if (!fn) return null;
  try {
    return await fn();
  } catch (e) {
    logger.warn(`Rehber hazırlığı: ${ad} okunamadı: ${(e as Error).message}`);
    return null;
  }
}

/** Geçersiz öğe ATLANIYOR ama log'a yazılıyor: sessiz düşüş yok. */
function konumlar(id: string, ham: unknown): KitleKonumu[] {
  const sonuc: KitleKonumu[] = [];
  for (const o of Array.isArray(ham) ? ham : []) {
    const r = kitleKonumuSchema.safeParse(o);
    if (r.success) sonuc.push(r.data);
    else logger.warn(`audience_templates(${id}).locations: geçersiz öğe atlandı`);
  }
  return sonuc;
}
