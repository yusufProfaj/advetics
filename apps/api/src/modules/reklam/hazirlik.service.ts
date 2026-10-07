import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  HAZIRLIK_GORSEL_SINIRI,
  KITLE_CINSIYETLERI,
  kitleKonumuSchema,
  kitleOzeti,
  OZEL_KATEGORILER,
  type OzelKategori,
  type KitleKonumu,
  type ReklamHazirligi,
  type TenantContext,
} from '@advetics/shared';
import { Prisma } from '@prisma/client';
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
        tx.$queryRaw<Array<{ id: string; name: string; currency: string; timezone: string }>>(Prisma.sql`
          SELECT id::text, name, currency, timezone
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
        hesaplar: hesaplar.map((h) => ({ id: h.id, ad: h.name, paraBirimi: h.currency, saatDilimi: h.timezone })),
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
