import { Injectable, Logger } from '@nestjs/common';
import type { ReportData, TenantContext } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';

/**
 * ═══ KREATİF GÖRSELİNİN ADRESİNİ TAZELEME ═══
 *
 * CANLIDA ÇIKAN HATA: müşteriye giden rapor PDF'inde "Öne Çıkan Reklamlar"
 * sayfasındaki on Meta reklamının hepsi görselsiz basıldı ve dipnotta
 * *"10 reklamın görseli alınamadı (sunucu 403)"* yazıyordu.
 *
 * SEBEP SAKLANMIŞ ADRESİN ÇÜRÜMESİ. `creatives.asset_urls` içindeki Meta CDN
 * adresi imzalı ve süresi doluyor; Meta `image_url`ün geçici olduğunu ve HER
 * çağrının yenisini ürettiğini söylüyor, `thumbnail_url` için kalıcı bir
 * karşılık ise HİÇ YOK. Bizim yapı taramamız delta çalışıyor — değişmemiş bir
 * reklamın kreatifi yeniden yazılmıyor. İkisi bir araya gelince adres
 * yazıldığı gün taze, iki hafta sonra ölü oluyor.
 *
 * Panel bunu ZATEN BİLİYORDU: `kreatif-gorsel.tsx` yorumunda "Platform CDN
 * adresleri gerçekten ölüyor… bu yol istisna değil normal bir hâl" yazıyor ve
 * kırık görseli yer tutucuyla gizliyor. Panelde katlanılabilir olan şey
 * müşteriye giden belgede katlanılabilir değil.
 *
 * ┌─ NEDEN YAPI TARAMASINDA ÇÖZÜLEMİYOR ──────────────────────────────────┐
 * │ Taze adres yalnızca ALINDIĞI AN taze. Yapı taramasında tazelesek bile  │
 * │ rapor günler sonra üretiliyor ve adres yine ölmüş oluyor. Tazeleme,    │
 * │ görselin İNDİRİLECEĞİ ana mümkün olduğunca yakın olmak zorunda.        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NEDEN TRANSACTION'IN DIŞINDA ────────────────────────────────────────┐
 * │ `withTenant` etkileşimli bir transaction açıyor ve Prisma'nın sınırı 5 │
 * │ saniye. Platforma yapılan çağrı üretimde 12 saniye sürdü ve transaction│
 * │ ölünce hata bile kaydedilemedi (CLAUDE.md'de kayıtlı).                 │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ═══ ÜÇ KORUMA — ÇÜNKÜ BU YOL ANONİM TETİKLENEBİLİYOR ═══
 *
 * `GET /reports/shared/:token` `@Public()` ve `build()`ten geçiyor. Yani
 * paylaşım bağlantısına sahip herkes — bir tarayıcı botu dahil — her sayfa
 * yüklemesinde Meta'ya çıkabilir. Kota %90'ı geçtiğinde CLAUDE.md'de yazılı
 * KALICI KİLİT devreye giriyor: yapı taraması da reddediliyor, metrikler
 * eşlenemiyor, hesap kendini kilitliyor. Kozmetik bir eksik uğruna
 * alınabilecek bir risk değil.
 *
 * 1. KOTA BEKÇİSİ — `report_creative` katmanı, tavan %50 (en düşük). Çağrıdan
 *    ÖNCE soruluyor: maliyeti sıfır olan bir ret, bağımlılıklarına nefes
 *    alacak yer bırakıyor.
 * 2. ÖNBELLEK — aynı kreatifin adresi {@link ONBELLEK_MS} boyunca yeniden
 *    sorulmuyor. Bot ne kadar hızlı yüklerse yüklesin, trafiği sabitliyor.
 * 3. SÜRE BÜTÇESİ — bütün tazeleme {@link BUTCE_MS} içinde bitmek zorunda.
 *    Yarılama en kötü hâlde 2N-1 istek üretebiliyor ve bu, senkron PDF
 *    ucunda dakikalarca bekleyen bir istek demekti.
 *
 * BAŞARISIZLIK RAPORU BOZMUYOR. Tazeleme düşerse saklanmış adres kalıyor ve
 * sebep `imageUrlHatasi` alanına yazılıyor. "Bu bir metin reklamı", "görseli
 * indirilemedi" ve "adresi yenileyemedik" ÜÇ AYRI DURUM; üçünü aynı boş
 * kutuya çevirmek bu projenin tekrar eden hatası.
 */

/**
 * Tazelenmiş adresin önbellekte durma süresi.
 *
 * Meta imzalarının ömrü belgelenmiyor ama saatler mertebesinde; 10 dakika
 * güvenli tarafta kalıyor. Asıl amacı ömrü uzatmak değil, ANONİM TRAFİĞİ
 * platformdan yalıtmak: paylaşım sayfası saniyede bir yüklense bile
 * platforma 10 dakikada bir gidiliyor.
 */
export const ONBELLEK_MS = 10 * 60 * 1000;

/**
 * Bütün tazeleme adımının toplam süresi.
 *
 * `platformFetch` varsayılanı 30 saniye ve yarılama en kötü hâlde 2N-1 istek
 * üretiyor: 24 kreatifte teorik tavan dakikalarca. Bu adım SENKRON bir PDF
 * isteğinin içinde koşuyor; kullanıcının o kadar beklemesi, görselsiz bir
 * rapordan kötü.
 */
export const BUTCE_MS = 12_000;

/** Tek istek için zaman aşımı — varsayılan 30 sn bu iş için fazla. */
const ISTEK_ZAMAN_ASIMI_MS = 6_000;

/**
 * Önbellekteki en fazla kayıt.
 *
 * Sınırsız bir `Map`, uzun süre ayakta kalan API sürecinde sessizce büyüyen
 * bir bellek sızıntısı olurdu. Sınıra gelince en eskiler atılıyor.
 */
const ONBELLEK_TAVANI = 2_000;

type Adres = { url: string } | { hata: string };

@Injectable()
export class KreatifAdresiService {
  private readonly log = new Logger(KreatifAdresiService.name);

  /**
   * Kreatif kimliği → adres. Ekleme sırası korunuyor (`Map` garantisi), yani
   * tavana gelince en eskiyi atmak için ayrı bir yapı gerekmiyor.
   *
   * SÜREÇ İÇİ. Redis'e taşımak birden çok API örneğinde daha etkili olurdu ama
   * yeni bir hata yüzeyi ve yeni bir anahtar alanı demek; bu önbelleğin işi
   * ömür uzatmak değil, art arda gelen isteklerin aynı çağrıyı tekrar
   * etmesini engellemek — süreç içi bunun için yeterli.
   */
  private readonly onbellek = new Map<string, { deger: Adres; sonGecerlilik: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
  ) {}

  /**
   * `topAds` görsellerinin adresini platformdan tazeler.
   *
   * DÖNÜŞ AYNI NESNE DEĞİL, YENİSİ: `ReportData` çağıran tarafta önbelleğe
   * alınabiliyor ve yerinde değiştirmek o kopyaları da sessizce bozardı.
   */
  async tazele(ctx: TenantContext, data: ReportData): Promise<ReportData> {
    /*
     * TAZELENECEK REKLAM: kreatif kimliği OLAN. Google arama reklamının
     * görseli yok ve görsel varlıkları kalıcı adreste duruyor — orada
     * tazelenecek bir şey olmadığı için sağlayıcı bu yeteneği hiç uygulamıyor
     * ve aşağıda sessizce atlanıyor.
     */
    const hedefler = data.topAds.filter((a) => a.creativeExternalId !== null);
    if (hedefler.length === 0) return data;

    const simdi = Date.now();
    const bitis = simdi + BUTCE_MS;
    const yeniAdres = new Map<string, Adres>();

    // Hesap başına grupla: her hesabın kendi bağlantısı, token'ı ve kotası var.
    const hesapBasina = new Map<string, Set<string>>();
    for (const a of hedefler) {
      const id = a.creativeExternalId!;
      /*
       * ÖNBELLEKTEKİ KREATİF PLATFORMA HİÇ SORULMUYOR — ve bu, anonim
       * paylaşım yolundaki asıl korumadır.
       */
      const kayit = this.onbellek.get(id);
      if (kayit && kayit.sonGecerlilik > simdi) {
        yeniAdres.set(id, kayit.deger);
        continue;
      }
      const kume = hesapBasina.get(a.adAccountId) ?? new Set<string>();
      kume.add(id);
      hesapBasina.set(a.adAccountId, kume);
    }

    if (hesapBasina.size > 0) {
      /*
       * HESAP BİLGİSİ TEK VE KISA BİR TRANSACTION'DA. Hesap başına ayrı sorgu
       * atmak, 24 reklamlık bir raporda 24 tur demekti; platform çağrısından
       * önce yapılan iş mümkün olduğunca ucuz olmalı.
       */
      const hesaplar = await this.prisma.withTenant(ctx, (tx) =>
        tx.adAccount.findMany({
          where: { id: { in: [...hesapBasina.keys()] } },
          select: {
            id: true,
            clientId: true,
            platform: true,
            externalId: true,
            connectionId: true,
            managerExternalId: true,
          },
        }),
      );

      for (const hesap of hesaplar) {
        const idler = [...(hesapBasina.get(hesap.id) ?? [])];
        if (idler.length === 0) continue;

        const provider = this.providers.get(hesap.platform);
        /*
         * DESTEKLEMEYEN PLATFORM HATA DEĞİL. Google'ın görsel adresleri
         * kalıcı; "tazelenemedi" yazmak kullanıcıya olmayan bir sorun
         * bildirmek olurdu ve her raporda duran bir uyarı okunmaz hâle gelir.
         */
        if (!provider.fetchCreativeImageUrls) continue;

        // SÜRE BÜTÇESİ HESAPLAR ARASINDA DA KONTROL EDİLİYOR.
        if (Date.now() >= bitis) {
          for (const id of idler) yeniAdres.set(id, { hata: 'tazeleme süresi doldu' });
          continue;
        }

        /*
         * ÖNCE KOTA, SONRA ÇAĞRI. Maliyeti sıfır olan bir ret, bağımlı
         * işlere (yapı taraması) nefes alacak yer bırakıyor — CLAUDE.md'de
         * kayıtlı kalıcı kilit tam bu sıranın tersine çevrilmesiyle oluştu.
         */
        const gate = await this.quota.acquire({
          platform: hesap.platform,
          adAccountId: hesap.id,
          layer: 'report_creative',
        });
        if (!gate.allowed) {
          const sebep = `kota engeli (${gate.reason})`;
          this.log.warn(`Kreatif adresi tazelenmedi (hesap ${hesap.id}): ${sebep}`);
          for (const id of idler) yeniAdres.set(id, { hata: sebep });
          continue;
        }

        try {
          const token = await this.vault.getAccessToken(hesap.connectionId, provider);
          const sonuc = await provider.fetchCreativeImageUrls(
            {
              accessToken: token,
              accountExternalId: hesap.externalId,
              loginCustomerId: hesap.managerExternalId ?? undefined,
              /*
               * TELEMETRİ BAĞLANIYOR. Bağlanmazsa bu çağrıların tükettiği
               * kota `rate_limit_state`e hiç yazılmıyor ve KOTA BEKÇİSİ KENDİ
               * ÜRETTİĞİ TRAFİĞİ GÖRMÜYOR — bekçi varmış gibi görünüp
               * korumayan bir kurulum, hiç olmamasından kötü.
               */
              onRateLimit: (snapshot) =>
                this.quota.record({
                  platform: hesap.platform,
                  adAccountId: hesap.id,
                  clientId: hesap.clientId,
                  endpoint: `${hesap.platform}:rapor_kreatif`,
                  snapshot,
                }),
            },
            idler,
            { timeoutMs: ISTEK_ZAMAN_ASIMI_MS, butceBitisi: bitis },
          );
          for (const [id, deger] of sonuc) {
            yeniAdres.set(id, deger);
            this.onbellegeYaz(id, deger);
          }
        } catch (err) {
          /*
           * HESABIN TAMAMI DÜŞTÜ (token geçersiz, bağlantı kaldırılmış).
           * Sebep her reklama tek tek yazılıyor: rapor "neden yok" sorusunu
           * cevaplayabilmeli ve bir hesabın sorunu diğerlerini
           * etkilememeli. ÖNBELLEĞE YAZILMIYOR — geçici bir arıza on dakika
           * boyunca dondurulmamalı.
           */
          const sebep = err instanceof Error ? err.message : 'bağlantı hatası';
          this.log.warn(
            `Kreatif adresi tazelenemedi (hesap ${hesap.id}, ${idler.length} kreatif): ${sebep}`,
          );
          for (const id of idler) yeniAdres.set(id, { hata: sebep });
        }
      }
    }

    return {
      ...data,
      topAds: data.topAds.map((a) => {
        const taze = a.creativeExternalId ? yeniAdres.get(a.creativeExternalId) : undefined;
        if (!taze) return a;
        if ('url' in taze) return { ...a, imageUrl: taze.url, imageUrlHatasi: null };
        /*
         * SAKLANMIŞ ADRES KORUNUYOR. Silmek, tazeleme düştüğünde kesin bir
         * kayıp demekti; eski adres bazen hâlâ çalışıyor. Ama hata da
         * yazılıyor, yoksa "denendi mi" sorusu cevapsız kalırdı.
         */
        return { ...a, imageUrlHatasi: taze.hata };
      }),
    };
  }

  /** Yalnızca BAŞARILI sonuç önbelleğe giriyor — hata dondurulmuyor. */
  private onbellegeYaz(id: string, deger: Adres): void {
    if (!('url' in deger)) return;
    if (this.onbellek.size >= ONBELLEK_TAVANI) {
      const enEski = this.onbellek.keys().next();
      if (!enEski.done) this.onbellek.delete(enEski.value);
    }
    this.onbellek.set(id, { deger, sonGecerlilik: Date.now() + ONBELLEK_MS });
  }
}
