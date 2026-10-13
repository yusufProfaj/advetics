import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { GoogleSaatPlani } from '@advetics/shared';
import { GERI_ALINABILIR_DURUMLAR, YAYIN_DURUMLARI, YAYIN_DURUM_SINIFI, gecisIzinliMi, type YayinDurumu } from '@advetics/shared';
import { PlatformApiError, type FetchContext } from '../../connections/provider.types';
import { googleYalinKimlik } from '../../connections/providers/google-demandgen';
import { kapaliBirak, yayiniSonlandir, type TxRunner } from '../yayin-motoru';
import { googleYazmaAcikMi } from '../yazma-kapisi';
import { DEMAND_GEN_GORSEL_OTOMASYONU } from '../../connections/providers/google-demandgen';
import { PMAX_OTOMASYONU, type PmaxAlani } from '../../connections/providers/google-pmax';
import type { GoogleBeklenen, GoogleDerleme, GoogleGorselReklamBeklentisi, GoogleOgeBeklentisi, GoogleUzantiBeklentisi, GoogleVarlikGrubuBeklentisi } from './derle-google';

const logger = new Logger('GoogleYayin');

/**
 * ═══ GOOGLE YAYIN İŞLEYİCİSİ (AdvCampaign rehberi) ═══
 *
 * Meta motorunun üç adımı Google'da: DURAKLATILMIŞ kur (tek atomik istek) →
 * GERİ OKU (GAQL) → fark yoksa ve açılış `acik` ise AÇ. Durum makinesi ve
 * tablolar Meta ile ortak (`yayin`, `yayin_nesnesi`, `geri_okuma`); Google'ın
 * kullandığı alt küme MIMARI-REHBER § 2.2'de.
 *
 * PLATFORM ÇAĞRISI TRANSACTION'IN İÇİNDE DEĞİL: işleyiciye hazır bir `tx`
 * değil bir ÇALIŞTIRICI veriliyor; her adım önce kısa bir transaction'da
 * NİYET, sonra çağrı, sonra kısa bir transaction'da SONUÇ.
 *
 * SONUCU BİLİNMEYEN İSTEK ASLA KENDİLİĞİNDEN TEKRARLANMAZ. Atomik istek ya
 * hepsini kurar ya hiçbirini, ama zaman aşımında hangisinin olduğunu
 * bilmiyoruz: tekrar göndermek İKİNCİ bir kampanya demek (para harcayan
 * mükerrerlik). Uzlaştırma yalnız OKUR (kampanya adındaki `adv-<kimlik>`).
 *
 * CANLIDA HİÇ KOŞMADI (2026-10-10, Ö-1 / Ö-6).
 */

/** Worker'ın verdiği Google erişimi; testte sahte. */
export interface GoogleYayinPortu {
  /** Bağlantının erişim token'ı (kasa çözüyor, gerekiyorsa tazeliyor). */
  tokenAl(connectionId: string): Promise<string>;
  mutate(
    ctx: FetchContext,
    govde: { mutateOperations: Array<Record<string, unknown>>; partialFailure: false; validateOnly: boolean },
  ): Promise<Array<Record<string, { resourceName?: string }>>>;
  ara<T>(ctx: FetchContext, sorgu: string): Promise<T[]>;
  kampanyaAc(ctx: FetchContext, kampanyaKaynagi: string): Promise<void>;
}

export interface GoogleIsleyiciBagimliliklari {
  tx: TxRunner;
  google: GoogleYayinPortu;
  kilit: { al(anahtar: string, sahip: string, ms: number): Promise<boolean>; birak(anahtar: string, sahip: string): Promise<void> };
  kilitOneki: string;
}

/** `yayin.derlenmis_govde` — Google yayınında derlemenin kendisi. */
export interface GoogleYayinGovdesi {
  platform: 'google';
  kurgu: string;
  govde: Extract<GoogleDerleme, { tur: 'govde' }>['govde'];
  sira: Extract<GoogleDerleme, { tur: 'govde' }>['sira'];
  /** Yayında yeni logo oluşturulduysa önbelleğe yazılacak varlık. */
  logoVarlikId: string | null;
}

export type GoogleIsSonucu = { tur: 'bitti'; durum: YayinDurumu } | { tur: 'ertele'; sebep: string };

/** Nesne adları: Meta motorunun tür sözlüğüne eşleniyor (reklam grubu = reklam seti). */
export const GOOGLE_NESNELERI = [
  { ad: 'kampanya', tur: 'kampanya', sira: 'kampanya' },
  { ad: 'reklam_grubu', tur: 'reklam_seti', sira: 'reklamGrubu' },
  { ad: 'reklam', tur: 'reklam', sira: 'reklam' },
] as const;

/**
 * MAKS. PERFORMANS'IN NESNELERİ — reklam YOK. Google reklamları varlık
 * grubundan kendisi kuruyor; `ad_group_ad` satırı yok ve beklenseydi her
 * Maks. Performans yayını "kaynak adı yok" diye belirsiz kalırdı. Varlık
 * grubu reklam seti yuvasında (hedef sayfa ve varlıklar onda).
 */
export const GOOGLE_PMAX_NESNELERI = [
  { ad: 'kampanya', tur: 'kampanya', sira: 'kampanya' },
  { ad: 'varlik_grubu', tur: 'reklam_seti', sira: 'reklamGrubu' },
] as const;

type GoogleNesnesi = (typeof GOOGLE_NESNELERI)[number] | (typeof GOOGLE_PMAX_NESNELERI)[number];
type NesneKimlikleri = { kampanya: string; reklamGrubu: string; reklam?: string };

export function googleNesneleri(kurgu: string): readonly GoogleNesnesi[] {
  return kurgu === 'MAKS_PERFORMANS' ? GOOGLE_PMAX_NESNELERI : GOOGLE_NESNELERI;
}

const KILIT_MS = 30 * 60_000;

interface YayinSatiri {
  id: string;
  org_id: string;
  client_id: string;
  ad_account_id: string | null;
  durum: YayinDurumu;
  derlenmis_govde: GoogleYayinGovdesi;
  beklenen_yanki: GoogleBeklenen;
  kapali_kalacak: boolean;
  api_surumu: string;
}

export interface GoogleYayinKaydi {
  id: string;
  orgId: string;
  clientId: string;
  taslakId: string;
  taslakSurumNo: number;
  icerikOzeti: string;
  adAccountId: string;
  govde: GoogleYayinGovdesi;
  beklenen: GoogleBeklenen;
  apiSurumu: string;
  derleyiciSurumu: string;
  atifStandardi: string;
  baslatanId: string;
  kapaliKalacak: boolean;
  uyum: { surum: string; tur: string };
}

/**
 * Yayın kaydı + nesne satırları, TEK transaction. Taslak başına tek aktif
 * yayın indeksi çift tıklamayı burada durduruyor (ikinci INSERT tekil
 * ihlalle düşer). Taslak "yayında"ya geçiyor: Meta yolunun aynısı.
 */
export async function googleYayinKaydiOlustur(tx: TxRunner, g: GoogleYayinKaydi): Promise<void> {
  await tx(async (t) => {
    await t.$queryRaw(Prisma.sql`
      INSERT INTO yayin (id, org_id, client_id, taslak_id, taslak_surum_no, icerik_ozeti, ad_account_id,
                         derlenmis_govde, beklenen_yanki, api_surumu, derleyici_surumu, atif_standardi,
                         kaynak, test_kipi, baslatan_id, kapali_kalacak, uyum_surumu, uyum_sonucu)
      VALUES (${g.id}::uuid, ${g.orgId}::uuid, ${g.clientId}::uuid, ${g.taslakId}::uuid, ${g.taslakSurumNo}, ${g.icerikOzeti},
              ${g.adAccountId}::uuid, ${JSON.stringify(g.govde, bigintDizge)}::jsonb, ${JSON.stringify(g.beklenen)}::jsonb,
              ${g.apiSurumu}, ${g.derleyiciSurumu}, ${g.atifStandardi}, 'panel', false, ${g.baslatanId}::uuid,
              ${g.kapaliKalacak}, ${g.uyum.surum}, ${JSON.stringify(g.uyum)}::jsonb)
      RETURNING id`);
    for (const [i, n] of googleNesneleri(g.govde.kurgu).entries()) {
      await t.$queryRaw(Prisma.sql`
        INSERT INTO yayin_nesnesi (yayin_id, org_id, client_id, tur, ad, sira)
        VALUES (${g.id}::uuid, ${g.orgId}::uuid, ${g.clientId}::uuid, ${n.tur}, ${n.ad}, ${i})
        RETURNING id`);
    }
    await t.$queryRaw(Prisma.sql`UPDATE reklam_taslagi SET durum = 'yayinda', updated_at = now() WHERE id = ${g.taslakId}::uuid RETURNING id`);
  });
}

/** JSON'a giderken BigInt dizgeye: `JSON.stringify` BigInt'te fırlatıyor. Buffer base64 kalır (logo). */
function bigintDizge(_k: string, v: unknown): unknown {
  return typeof v === 'bigint' ? v.toString() : v;
}

// ---------------------------------------------------------------------------
// GERİ OKUMA — saf karşılaştırma
// ---------------------------------------------------------------------------

export interface GoogleOkunan {
  kampanyaAdi: string | null;
  durum: string | null;
  kanal: string | null;
  gunlukButceMicros: string | null;
  aglar: { googleSearch: boolean; searchNetwork: boolean; contentNetwork: boolean; partnerSearchNetwork: boolean } | null;
  konumTuru: string | null;
  konumSayisi: number;
  anahtarKelimeSayisi: number;
  negatifSayisi: number;
  /**
   * Kampanyaya CALL olarak bağlı, kaldırılmamış öğeler (numara ulusal haneler).
   * Onay durumu (`primary_status`) BİLEREK yok: numara doğrulaması günler
   * sürebilen bir politika incelemesi ve onu fark saymak her yeni telefon
   * reklamını "fark var"da durdururdu.
   */
  aramaOgeleri: Array<{ countryCode: string | null; phoneNumber: string | null }>;
  /** Arama öğesinin saat planı — yalnız beklenen taşıyorsa okunur (bilinmeyen = fark). */
  aramaSaatleri?: GoogleSaatPlani[] | null;
  /** Dalga 3 — yalnız beklenen taşıyorsa okunur ve kıyaslanır. */
  teklif?: string | null;
  /** Yalnız beklenen taşıyorsa okunur: TEK reklamın yolu, değilse null (bilinmeyen = fark). */
  gorunenYol?: { path1: string | null; path2: string | null } | null;
  gorselReklam?: GoogleGorselReklamBeklentisi | null;
  varlikGrubu?: GoogleVarlikGrubuBeklentisi | null;
  /** Maks. Performans: teklife giren kampanya dönüşüm hedefleri (`KATEGORI~KAYNAK`, sıralı); yalnız beklenen taşıyorsa okunur. */
  teklifHedefleri?: string[] | null;
  /**
   * Kampanyaya bağlı site bağlantısı ve açıklama metni öğeleri, İÇERİKLE.
   * Onay durumu (`primary_status`, politika incelemesi) BİLEREK okunmuyor:
   * öğeler günlerce "inceleniyor" kalabiliyor ve onu fark saymak her yeni
   * site reklamını açılmadan durdururdu (arama öğesi dersiyle aynı).
   */
  uzantilar?: GoogleUzantiBeklentisi | null;
  /** Arama öğeleri (g-1.2.0), İÇERİKLE; onay durumu yine okunmuyor. */
  ogeler?: GoogleOgeBeklentisi | null;
  /**
   * Öğe sorgusu DÜŞTÜYSE sebebi ("alan seçilemez" vb.). Ana kampanya geri
   * okuması tamamlanıyor, öğe kıyası YAPILMIYOR ve bu alan ham kayda
   * (`geri_okuma.ham`) giriyor: sessiz değil, ama ölçülmemiş bir GAQL alanı
   * bütün Arama yayınlarını "okunamadı"da tutmuyor.
   */
  ogeOkumaHatasi?: string;
}

export interface GeriOkumaSatiri {
  alan: string;
  beklenen: unknown;
  okunan: unknown;
}

/**
 * Beklenen ile okunan, alan alan. Fark tek satır bile olsa `fark`: geri
 * okumanın amacı "kurulan şey istenen mi" ve yarım doğru bir kampanyayı
 * açmak, söz verilmemiş bir yere para göndermek demek. Okunamayan alan
 * (`null`) da fark sayılıyor: bilmediğimiz şeyi doğru varsaymıyoruz.
 */
export function googleGeriOkumaKarsilastir(b: GoogleBeklenen, o: GoogleOkunan): { sonuc: 'temiz' | 'fark'; satirlar: GeriOkumaSatiri[] } {
  const satirlar: GeriOkumaSatiri[] = [];
  // ANAHTAR SIRASINDAN BAĞIMSIZ: okunan nesneler Google'ın yanıt sırasıyla
  // kuruluyor; `{a,b}` ile `{b,a}`yı fark saymak doğru kampanyayı durdururdu.
  const kiyasla = (alan: string, beklenen: unknown, okunan: unknown) => {
    if (kararliJson(beklenen) !== kararliJson(okunan)) satirlar.push({ alan, beklenen, okunan });
  };
  kiyasla('kampanya.durum', b.durum, o.durum);
  kiyasla('kampanya.kanal', b.kanal, o.kanal);
  kiyasla('kampanya.ad', b.kampanyaAdi, o.kampanyaAdi);
  kiyasla('butce.gunluk', b.gunlukButceMicros, o.gunlukButceMicros);
  if (b.aglar) kiyasla('kampanya.aglar', b.aglar, o.aglar);
  kiyasla('kampanya.konumTuru', b.konumTuru, o.konumTuru);
  kiyasla('konum.sayisi', b.konumSayisi, o.konumSayisi);
  if (b.anahtarKelimeSayisi !== null) kiyasla('anahtarKelime.sayisi', b.anahtarKelimeSayisi, o.anahtarKelimeSayisi);
  if (b.negatifSayisi !== null) kiyasla('negatif.sayisi', b.negatifSayisi, o.negatifSayisi);
  // Arama öğesi: beklenen varsa TAM OLARAK o tek öğe; beklenmiyorsa HİÇ öğe.
  // "Beklenmiyorsa bakma" demek, site reklamına hesap düzeyinde bir şeyin
  // telefon iliştirmesini görmezden gelmek olurdu; kampanyanın kendi bağına
  // bakıyoruz (hesap düzeyi öğeler campaign_asset'te görünmüyor). Eski yayın
  // satırlarında alan yok (undefined) = null.
  const beklenenOge = b.aramaOgesi ?? null;
  kiyasla('aramaOgesi', beklenenOge ? [beklenenOge] : [], o.aramaOgeleri.map(ulusalNumara));
  // Dalga 3: eski yayın satırlarında bu alanlar YOK (undefined) = bakılmaz.
  // Beklenip okunamayan (`null`/`undefined`) FARK: bilinmeyeni doğru saymıyoruz.
  if (b.teklif) kiyasla('kampanya.teklif', b.teklif, o.teklif ?? null);
  // Saat planı KÜME (Google sırası garanti değil); okunamadıysa null = fark.
  if (b.aramaSaatleri) kiyasla('aramaOgesi.saatler', saatPlaniSirala(b.aramaSaatleri), o.aramaSaatleri ? saatPlaniSirala(o.aramaSaatleri) : null);
  if (b.gorunenYol) kiyasla('reklam.gorunenYol', b.gorunenYol, o.gorunenYol ?? null);
  if (b.gorselReklam) kiyasla('gorselReklam', b.gorselReklam, o.gorselReklam ?? null);
  if (b.varlikGrubu) kiyasla('varlikGrubu', b.varlikGrubu, o.varlikGrubu ?? null);
  // "200 döndü doğrulama değil": hedef güncellemesi kabul edildi diye
  // uygulandığı anlamına gelmiyor. Teklife giren küme TAM OLARAK beklenen
  // olmalı; fazladan açık hedef (form, telefon) bütçeyi oraya akıtır.
  if (b.teklifHedefleri) kiyasla('kampanya.donusumHedefleri', [...b.teklifHedefleri].sort(), o.teklifHedefleri ? [...o.teklifHedefleri].sort() : null);
  // Uzantılar KÜME olarak: Google'ın satır sırası garanti değil. Beklenen
  // boşsa da kıyaslanır (bağlı öğe varsa fark: söz verilmemiş metin).
  if (b.uzantilar) kiyasla('uzantilar', uzantiKumesi(b.uzantilar), o.uzantilar ? uzantiKumesi(o.uzantilar) : null);
  // Arama öğeleri ALAN ALAN: hangi öğenin ayrıştığı satırda görünsün.
  // Beklenmeyen ama bağlı öğe (beklenen null, okunan dolu) de fark.
  if (b.ogeler && !o.ogeOkumaHatasi) {
    const ok = o.ogeler ?? null;
    for (const alan of ['isletmeAdi', 'logo', 'snippet', 'promosyon', 'fiyat'] as const) {
      kiyasla(`oge.${alan}`, b.ogeler[alan], ok ? ok[alan] : null);
    }
  }
  return { sonuc: satirlar.length ? 'fark' : 'temiz', satirlar };
}

/**
 * Uzantıların sıradan bağımsız biçimi. Adres `URL` ile kanonikleştiriliyor
 * (`https://x.com` ↔ `https://x.com/`): Google'ın adresi nasıl döndürdüğü
 * ÖLÇÜLMEDİ ve biçim farkını fark saymak doğru kampanyayı durdururdu; yol,
 * sorgu ya da alan adı farkı yine fark.
 */
export function uzantiKumesi(u: GoogleUzantiBeklentisi): GoogleUzantiBeklentisi {
  const adres = (a: string) => {
    try {
      return new URL(a).toString();
    } catch {
      return a;
    }
  };
  const sirala = <T>(x: T[]) => [...x].sort((a, b) => (kararliJson(a) < kararliJson(b) ? -1 : kararliJson(a) > kararliJson(b) ? 1 : 0));
  return {
    siteBaglantilari: sirala(u.siteBaglantilari.map((x) => ({ ...x, adres: adres(x.adres) }))),
    aciklamaMetinleri: sirala(u.aciklamaMetinleri),
  };
}

/** Anahtarları sıralı JSON — kıyas için; diziler sırasını korur. */
function kararliJson(x: unknown): string {
  return JSON.stringify(x, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );
}

interface KampanyaSatiri {
  campaign?: {
    resourceName?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
    networkSettings?: { targetGoogleSearch?: boolean; targetSearchNetwork?: boolean; targetContentNetwork?: boolean; targetPartnerSearchNetwork?: boolean };
    geoTargetTypeSetting?: { positiveGeoTargetType?: string };
    biddingStrategyType?: string;
  };
  campaignBudget?: { amountMicros?: string };
}

/** Saat planını gün ve saate göre sıralar (karşılaştırma sırasız). */
export function saatPlaniSirala(xs: readonly GoogleSaatPlani[]): GoogleSaatPlani[] {
  const anahtar = (x: GoogleSaatPlani) => `${x.dayOfWeek}|${String(x.startHour).padStart(2, '0')}|${x.startMinute}|${String(x.endHour).padStart(2, '0')}|${x.endMinute}`;
  return [...xs].map((x) => ({ dayOfWeek: x.dayOfWeek, startHour: x.startHour, startMinute: x.startMinute, endHour: x.endHour, endMinute: x.endMinute })).sort((a, b) => anahtar(a).localeCompare(anahtar(b)));
}

/**
 * Google'ın döndürdüğü saat planı. Proto3 JSON'da SIFIR değerli sayı alanı
 * HİÇ gelmeyebilir (gece yarısı `startHour: 0`): eksik saat 0 sayılıyor.
 * Dakika enum'u (ZERO = 2) sıfır değil, gelmesi bekleniyor; gelmezse
 * okunan değer `undefined` kalır ve fark çıkar (bilinmeyen doğru sayılmaz).
 * Biçim CANLIDA ÖLÇÜLMEDİ.
 */
export function saatPlaniOku(ham: unknown): GoogleSaatPlani[] {
  if (!Array.isArray(ham)) return [];
  return ham.map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      dayOfWeek: o.dayOfWeek as GoogleSaatPlani['dayOfWeek'],
      startHour: Number(o.startHour ?? 0),
      startMinute: o.startMinute as GoogleSaatPlani['startMinute'],
      endHour: Number(o.endHour ?? 0),
      endMinute: o.endMinute as GoogleSaatPlani['endMinute'],
    };
  });
}

interface CagriOgesiSatiri {
  campaignAsset?: { fieldType?: string; status?: string; source?: string };
  asset?: { callAsset?: { countryCode?: string; phoneNumber?: string } };
}

/**
 * Google'ın geri döndürdüğü numarayı gönderdiğimiz biçime indirger: yalnız
 * rakamlar ve TR'de baştaki santral öneki `0` ya da ülke kodu `90` atılır.
 * Google numarayı biçimlendirip (boşluk, parantez) dönebilir — ÖLÇÜLMEDİ;
 * biçim farkını "fark" saymak doğru kampanyayı açılmadan durdururdu. Rakam
 * farkı ise fark olarak kalıyor: başka bir numara başka bir hat demek.
 */
export function ulusalNumara(o: { countryCode: string | null; phoneNumber: string | null }): { countryCode: string | null; phoneNumber: string | null } {
  const ulke = o.countryCode?.toUpperCase() ?? null;
  if (o.phoneNumber === null) return { countryCode: ulke, phoneNumber: null };
  let rakam = o.phoneNumber.replace(/\D/g, '');
  if (ulke === 'TR') {
    if (rakam.length === 12 && rakam.startsWith('90')) rakam = rakam.slice(2);
    else if (rakam.length === 11 && rakam.startsWith('0')) rakam = rakam.slice(1);
  }
  return { countryCode: ulke, phoneNumber: rakam };
}

interface UzantiSatiri {
  campaignAsset?: { fieldType?: string; status?: string; source?: string };
  asset?: {
    finalUrls?: string[];
    sitelinkAsset?: { linkText?: string; description1?: string; description2?: string };
    calloutAsset?: { calloutText?: string };
  };
}

/**
 * Kampanyaya bağlı SITELINK/CALLOUT öğeleri. WHERE'deki her alan SELECT'te
 * (`campaign_asset` dersi). Onay alanları seçilmiyor (yukarıdaki not).
 * Alan adları v25 başvurusundan, ÖLÇÜLMEDİ.
 */
async function uzantilariOku(port: GoogleYayinPortu, ctx: FetchContext, kampanyaId: string): Promise<GoogleUzantiBeklentisi> {
  const satirlar = await port.ara<UzantiSatiri>(
    ctx,
    `SELECT campaign.id, campaign_asset.field_type, campaign_asset.status, campaign_asset.source, asset.final_urls,
            asset.sitelink_asset.link_text, asset.sitelink_asset.description1, asset.sitelink_asset.description2,
            asset.callout_asset.callout_text
       FROM campaign_asset
      WHERE campaign.id = ${kampanyaId} AND campaign_asset.field_type IN ('SITELINK', 'CALLOUT') AND campaign_asset.status != 'REMOVED'`,
  );
  // GOOGLE'IN KENDİ ÜRETTİĞİ öğe (dinamik site bağlantısı, `source =
  // AUTOMATICALLY_CREATED`) bizim sözümüz değil ve hesap ayarına bağlı:
  // onu fark saymak doğru kurulumu durdururdu. Ayıklama kodda, WHERE'de
  // değil: alanın filtrede davranışı ÖLÇÜLMEDİ, seçmek zararsız.
  const canli = satirlar.filter((x) => x.campaignAsset?.status !== 'REMOVED' && x.campaignAsset?.source !== 'AUTOMATICALLY_CREATED');
  return {
    siteBaglantilari: canli
      .filter((x) => x.campaignAsset?.fieldType === 'SITELINK')
      .map((x) => ({
        metin: x.asset?.sitelinkAsset?.linkText ?? '',
        adres: x.asset?.finalUrls?.[0] ?? '',
        satir1: x.asset?.sitelinkAsset?.description1 ?? null,
        satir2: x.asset?.sitelinkAsset?.description2 ?? null,
      })),
    aciklamaMetinleri: canli.filter((x) => x.campaignAsset?.fieldType === 'CALLOUT').map((x) => x.asset?.calloutAsset?.calloutText ?? ''),
  };
}

interface OgeSatiri {
  campaignAsset?: { fieldType?: string; status?: string; source?: string };
  asset?: {
    textAsset?: { text?: string };
    structuredSnippetAsset?: { header?: string; values?: string[] };
    promotionAsset?: {
      promotionTarget?: string;
      percentOff?: string | number;
      moneyAmountOff?: { amountMicros?: string | number };
      startDate?: string;
      endDate?: string;
    };
    priceAsset?: {
      type?: string;
      priceOfferings?: Array<{ header?: string; description?: string; price?: { amountMicros?: string | number } }>;
    };
  };
}

/**
 * Kampanyaya bağlı Arama öğeleri (işletme adı, logo, snippet, promosyon,
 * fiyat). WHERE'deki her alan SELECT'te (`campaign_asset` dersi). Google'ın
 * KENDİ ürettiği öğe (`source = AUTOMATICALLY_CREATED`, örn. siteden çektiği
 * işletme adı) sayılmıyor: bizim sözümüz değil ve hesap ayarına bağlı.
 * int64 alanlar (percent_off, amount_micros) JSON'da DİZGE geliyor; ikisi de
 * dizgeye indirgenip kıyaslanıyor. Alan adları v25 başvurusundan, ÖLÇÜLMEDİ.
 */
/*
 * PROMOSYON VE FİYAT ALANLARI YALNIZ O ÖĞE GÖNDERİLDİYSE SORULUR (canlı
 * risk, Ajan 4): `asset.price_asset.price_offerings` ve
 * `money_amount_off.amount_micros` GAQL'de seçilebilirliği ÖLÇÜLMEDİ; her
 * Arama geri okumasında sorulsaydı Google'ın tek bir "seçilemez" cevabı
 * BÜTÜN Arama yayınlarını takardı. Beklenmeyen ama bağlı bir öğe yine
 * görünür: tür WHERE'de, içerik seçilmese de satır gelir ve boş içerikle
 * beklentiden ayrışır (fark).
 */
export function ogeSorgusu(kampanyaId: string, b: Pick<GoogleOgeBeklentisi, 'promosyon' | 'fiyat'>): string {
  const alanlar = [
    'campaign.id',
    'campaign_asset.field_type',
    'campaign_asset.status',
    'campaign_asset.source',
    'asset.text_asset.text',
    'asset.structured_snippet_asset.header',
    'asset.structured_snippet_asset.values',
    ...(b.promosyon
      ? [
          'asset.promotion_asset.promotion_target',
          'asset.promotion_asset.percent_off',
          'asset.promotion_asset.money_amount_off.amount_micros',
          'asset.promotion_asset.start_date',
          'asset.promotion_asset.end_date',
        ]
      : []),
    ...(b.fiyat ? ['asset.price_asset.type', 'asset.price_asset.price_offerings'] : []),
  ];
  return `SELECT ${alanlar.join(', ')}
       FROM campaign_asset
      WHERE campaign.id = ${kampanyaId}
        AND campaign_asset.field_type IN ('BUSINESS_NAME', 'BUSINESS_LOGO', 'STRUCTURED_SNIPPET', 'PROMOTION', 'PRICE')
        AND campaign_asset.status != 'REMOVED'`;
}

async function ogeleriOku(port: GoogleYayinPortu, ctx: FetchContext, kampanyaId: string, b: GoogleOgeBeklentisi): Promise<GoogleOgeBeklentisi> {
  const satirlar = await port.ara<OgeSatiri>(ctx, ogeSorgusu(kampanyaId, b));
  const canli = satirlar.filter((x) => x.campaignAsset?.status !== 'REMOVED' && x.campaignAsset?.source !== 'AUTOMATICALLY_CREATED');
  const tur = (t: string) => canli.filter((x) => x.campaignAsset?.fieldType === t);
  const dizge = (v: string | number | undefined) => (v === undefined || v === null ? null : String(v));
  // Bir türden BİRDEN ÇOK öğe beklenmiyor: iki işletme adı bağlıysa hangisinin
  // gösterildiği belirsiz; dizi olarak döner ve tekil beklentiyle FARK verir.
  const tek = <T>(xs: T[]): T | T[] | null => (xs.length === 0 ? null : xs.length === 1 ? xs[0]! : xs);
  const ad = tur('BUSINESS_NAME').map((x) => x.asset?.textAsset?.text ?? '');
  const sn = tur('STRUCTURED_SNIPPET').map((x) => ({ baslik: x.asset?.structuredSnippetAsset?.header ?? '', degerler: x.asset?.structuredSnippetAsset?.values ?? [] }));
  const pr = tur('PROMOTION').map((x) => {
    const p = x.asset?.promotionAsset;
    return {
      hedef: p?.promotionTarget ?? '',
      yuzdeMicros: dizge(p?.percentOff),
      tutarMicros: dizge(p?.moneyAmountOff?.amountMicros),
      baslangic: p?.startDate ?? null,
      bitis: p?.endDate ?? '',
    };
  });
  const fy = tur('PRICE').map((x) => ({
    tur: x.asset?.priceAsset?.type ?? '',
    kalemler: (x.asset?.priceAsset?.priceOfferings ?? []).map((k) => ({ baslik: k.header ?? '', aciklama: k.description ?? '', micros: dizge(k.price?.amountMicros) ?? '' })),
  }));
  return {
    isletmeAdi: tek(ad) as string | null,
    logo: tur('BUSINESS_LOGO').length,
    snippet: tek(sn) as GoogleOgeBeklentisi['snippet'],
    promosyon: tek(pr) as GoogleOgeBeklentisi['promosyon'],
    fiyat: tek(fy) as GoogleOgeBeklentisi['fiyat'],
  };
}

interface KriterSatiri {
  campaignCriterion?: { type?: string; negative?: boolean };
  adGroupCriterion?: { type?: string; negative?: boolean };
}

/**
 * GAQL ile okur. Kimlik yalnız RAKAM (GAQL'de bağlı parametre yok; kimlik
 * sorgu metnine gömülüyor). Alan adları v25 referansından, ÖLÇÜLMEDİ.
 */
/**
 * `b` (beklenen) verilirse kurguya özgü EK sorgular da koşar (Talep Yaratma
 * görsel reklamı, Maks. Performans varlık grubu). Verilmezse eski davranış:
 * açma hatasından sonra yalnız DURUM tekrar okunurken ek sorgu boşa kota.
 */
export async function googleGeriOku(port: GoogleYayinPortu, ctx: FetchContext, kampanyaId: string, b?: GoogleBeklenen): Promise<GoogleOkunan> {
  if (!/^\d+$/.test(kampanyaId)) throw new Error(`Geçersiz kampanya kimliği: ${kampanyaId.slice(0, 40)}`);
  const [k] = await port.ara<KampanyaSatiri>(
    ctx,
    `SELECT campaign.resource_name, campaign.name, campaign.status, campaign.advertising_channel_type,
            campaign.network_settings.target_google_search, campaign.network_settings.target_search_network,
            campaign.network_settings.target_content_network, campaign.network_settings.target_partner_search_network,
            campaign.geo_target_type_setting.positive_geo_target_type, campaign.bidding_strategy_type, campaign_budget.amount_micros
       FROM campaign WHERE campaign.id = ${kampanyaId}`,
  );
  // `campaign.id` SELECT'te: canlı tur bu iki sorguyu seçmeden de geçti, ama
  // aynı kural `campaign_asset`te patladı (aşağıda); seçmek zararsız,
  // seçmemek bir sürüm değişikliğinde "kurulamadı" demek.
  const kampanyaKriteri = await port.ara<KriterSatiri>(
    ctx,
    `SELECT campaign.id, campaign_criterion.type, campaign_criterion.negative FROM campaign_criterion WHERE campaign.id = ${kampanyaId}`,
  );
  const grupKriteri = await port.ara<KriterSatiri>(
    ctx,
    `SELECT campaign.id, ad_group_criterion.type, ad_group_criterion.negative FROM ad_group_criterion WHERE campaign.id = ${kampanyaId}`,
  );
  // Arama öğesi: her kurguda soruluyor (beklenmiyorsa da): bkz. karşılaştırma.
  // `campaign.id` SELECT'TE OLMAK ZORUNDA — ölçüldü (2026-10-11, canlı tur):
  // WHERE'de süzülen alan seçilmezse Google sorguyu
  // EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE ile reddediyor ve kurulmuş,
  // sağlam bir kampanya ekranda "kurulamadı" görünüyordu. Sahte port sorguyu
  // çalıştırmadığı için hiçbir test bunu görmedi.
  const cagriOgeleri = await port.ara<CagriOgesiSatiri>(
    ctx,
    `SELECT campaign.id, campaign_asset.field_type, campaign_asset.status, campaign_asset.source, asset.call_asset.country_code, asset.call_asset.phone_number
       FROM campaign_asset
      WHERE campaign.id = ${kampanyaId} AND campaign_asset.field_type = 'CALL' AND campaign_asset.status != 'REMOVED'`,
  );
  const c = k?.campaign;
  const n = c?.networkSettings;
  const say = (r: KriterSatiri[], alan: 'campaignCriterion' | 'adGroupCriterion', tur: string, negatif: boolean) =>
    r.filter((x) => x[alan]?.type === tur && (x[alan]?.negative === true) === negatif).length;
  return {
    kampanyaAdi: c?.name ?? null,
    durum: c?.status ?? null,
    kanal: c?.advertisingChannelType ?? null,
    gunlukButceMicros: k?.campaignBudget?.amountMicros ?? null,
    aglar:
      c?.advertisingChannelType === 'SEARCH' && n
        ? {
            googleSearch: n.targetGoogleSearch === true,
            searchNetwork: n.targetSearchNetwork === true,
            contentNetwork: n.targetContentNetwork === true,
            partnerSearchNetwork: n.targetPartnerSearchNetwork === true,
          }
        : null,
    konumTuru: c?.geoTargetTypeSetting?.positiveGeoTargetType ?? null,
    // Arama'da konum kampanyada, Talep Yaratma'da reklam grubunda: ikisi toplanıyor.
    konumSayisi: say(kampanyaKriteri, 'campaignCriterion', 'LOCATION', false) + say(grupKriteri, 'adGroupCriterion', 'LOCATION', false),
    anahtarKelimeSayisi: say(grupKriteri, 'adGroupCriterion', 'KEYWORD', false),
    negatifSayisi: say(kampanyaKriteri, 'campaignCriterion', 'KEYWORD', true),
    aramaOgeleri: cagriOgeleri
      // Google'ın kendi ürettiği arama öğesi bizim sözümüz değil (öğe dersi).
      .filter((x) => x.campaignAsset?.fieldType === 'CALL' && x.campaignAsset?.status !== 'REMOVED' && x.campaignAsset?.source !== 'AUTOMATICALLY_CREATED')
      .map((x) => ({ countryCode: x.asset?.callAsset?.countryCode ?? null, phoneNumber: x.asset?.callAsset?.phoneNumber ?? null })),
    teklif: c?.biddingStrategyType ?? null,
    ...(b?.aramaSaatleri ? { aramaSaatleri: await aramaSaatleriOku(port, ctx, kampanyaId) } : {}),
    ...(b?.gorunenYol ? { gorunenYol: await gorunenYolOku(port, ctx, kampanyaId) } : {}),
    ...(b?.gorselReklam ? { gorselReklam: await gorselReklamOku(port, ctx, kampanyaId) } : {}),
    ...(b?.varlikGrubu ? { varlikGrubu: await varlikGrubuOku(port, ctx, kampanyaId) } : {}),
    ...(b?.teklifHedefleri ? { teklifHedefleri: await teklifHedefleriOku(port, ctx, kampanyaId) } : {}),
    ...(b?.uzantilar ? { uzantilar: await uzantilariOku(port, ctx, kampanyaId) } : {}),
    ...(b?.ogeler ? await ogeleriGuvenli(port, ctx, kampanyaId, b.ogeler) : {}),
  };
}

/**
 * Öğe okuması ayrı bir hata sınırında: düşerse ana geri okuma tamamlanır,
 * öğe kısmı "okunamadı: sebep" olarak kalır (kıyaslanmaz, ham kayıtta ve
 * log'da görünür).
 */
async function ogeleriGuvenli(
  port: GoogleYayinPortu,
  ctx: FetchContext,
  kampanyaId: string,
  b: GoogleOgeBeklentisi,
): Promise<{ ogeler: GoogleOgeBeklentisi } | { ogeOkumaHatasi: string }> {
  try {
    return { ogeler: await ogeleriOku(port, ctx, kampanyaId, b) };
  } catch (e) {
    const m = `okunamadı: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
    logger.warn(`kampanya=${kampanyaId}: Arama öğeleri ${m}`);
    return { ogeOkumaHatasi: m };
  }
}

/**
 * Arama öğesinin saat planı — AYRI sorgu, yalnız plan gönderildiyse: arama
 * öğesi sorgusuna alan eklemek her kurgunun geri okumasını değiştirirdi.
 * Kampanyaya bağlı TEK öğe bekleniyor; birden çoksa ya da hiç yoksa `null`
 * (fark, öğe sayısı satırı ayrıca söylüyor).
 */
async function aramaSaatleriOku(port: GoogleYayinPortu, ctx: FetchContext, kampanyaId: string): Promise<GoogleSaatPlani[] | null> {
  const r = await port.ara<{ campaignAsset?: { source?: string }; asset?: { callAsset?: { adScheduleTargets?: unknown } } }>(
    ctx,
    `SELECT campaign.id, campaign_asset.field_type, campaign_asset.status, campaign_asset.source, asset.call_asset.ad_schedule_targets
       FROM campaign_asset
      WHERE campaign.id = ${kampanyaId} AND campaign_asset.field_type = 'CALL' AND campaign_asset.status != 'REMOVED'`,
  );
  const bizim = r.filter((x) => x.campaignAsset?.source !== 'AUTOMATICALLY_CREATED');
  return bizim.length === 1 ? saatPlaniOku(bizim[0]!.asset?.callAsset?.adScheduleTargets) : null;
}

/**
 * Arama reklamının görünen yolu. Kampanyada TEK reklam beklenir; sıfır ya da
 * birden çok satır `null` (bilinmeyen = fark). Alan adları v25 referansından,
 * CANLIDA ÖLÇÜLMEDİ: Google `path2`yi boşken hiç döndürmeyebilir, o yüzden
 * eksik alan `null` sayılıyor ve beklenen de yolsuz parçayı `null` yazıyor.
 * `campaign.id` SELECT'te (WHERE'de süzülen alan seçilmezse Google reddediyor).
 */
async function gorunenYolOku(port: GoogleYayinPortu, ctx: FetchContext, kampanyaId: string): Promise<{ path1: string | null; path2: string | null } | null> {
  const satirlar = await port.ara<{ adGroupAd?: { ad?: { responsiveSearchAd?: { path1?: string; path2?: string } } } }>(
    ctx,
    `SELECT campaign.id, ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2
       FROM ad_group_ad
      WHERE campaign.id = ${kampanyaId} AND ad_group_ad.status != 'REMOVED'`,
  );
  if (satirlar.length !== 1) return null;
  const r = satirlar[0]!.adGroupAd?.ad?.responsiveSearchAd;
  return { path1: r?.path1 || null, path2: r?.path2 || null };
}

/*
 * ═══ DALGA 3 GERİ OKUMA SORGULARI ═══
 *
 * GAQL KURALI (canlıda ölçüldü, 2026-10-11 — `campaign_asset` dersi): WHERE'de
 * süzülen alan SELECT'te YOKSA Google sorguyu
 * EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE ile reddediyor. Kuralın hangi
 * alanlara uygulandığı tam bilinmiyor; bu yüzden aşağıdaki HER sorgu WHERE'de
 * kullandığı HER alanı seçiyor. Sahte port (`google-yayin.spec.ts`) bunu
 * bütün sorgular için dayatıyor.
 *
 * Proto3 JSON'da `false` boolean ALANI HİÇ GELMEYEBİLİR: kanal bayrakları
 * `=== true` ile okunuyor (eksik = kapalı). Bu, "kapalı beklenen" kanallarda
 * okunamayanı kapalı saymak demek; açık beklenenler ise yalnız `true` gelince
 * tutuyor, yani hata yönü güvenli (fark → açılmaz).
 */

interface GorselGrupSatiri {
  adGroup?: {
    status?: string;
    demandGenAdGroupSettings?: { channelControls?: { selectedChannels?: Record<string, boolean | undefined> } };
  };
}
interface GorselReklamSatiri {
  adGroupAd?: {
    status?: string;
    ad?: {
      type?: string;
      demandGenMultiAssetAd?: {
        marketingImages?: unknown[];
        squareMarketingImages?: unknown[];
        portraitMarketingImages?: unknown[];
        logoImages?: unknown[];
      };
    };
    adGroupAdAssetAutomationSettings?: Array<{ assetAutomationType?: string; assetAutomationStatus?: string }>;
  };
}

async function gorselReklamOku(port: GoogleYayinPortu, ctx: FetchContext, kampanyaId: string): Promise<GoogleGorselReklamBeklentisi | null> {
  const gruplar = await port.ara<GorselGrupSatiri>(
    ctx,
    `SELECT campaign.id, ad_group.id, ad_group.status,
            ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.youtube_in_stream,
            ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.youtube_in_feed,
            ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.youtube_shorts,
            ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.discover,
            ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.gmail,
            ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.display,
            ad_group.demand_gen_ad_group_settings.channel_controls.selected_channels.maps
       FROM ad_group
      WHERE campaign.id = ${kampanyaId} AND ad_group.status != 'REMOVED'`,
  );
  const reklamlar = await port.ara<GorselReklamSatiri>(
    ctx,
    `SELECT campaign.id, ad_group_ad.status, ad_group_ad.ad.type,
            ad_group_ad.ad.demand_gen_multi_asset_ad.marketing_images,
            ad_group_ad.ad.demand_gen_multi_asset_ad.square_marketing_images,
            ad_group_ad.ad.demand_gen_multi_asset_ad.portrait_marketing_images,
            ad_group_ad.ad.demand_gen_multi_asset_ad.logo_images,
            ad_group_ad.ad_group_ad_asset_automation_settings
       FROM ad_group_ad
      WHERE campaign.id = ${kampanyaId} AND ad_group_ad.status != 'REMOVED'`,
  );
  // Hiçbir şey okunamadıysa `null` (bilinmeyen = fark). Tek grup, tek reklam
  // beklenir; SAYILAR kıyaslanıyor, ayrıntı ilk satırdan okunuyor.
  if (gruplar.length === 0 && reklamlar.length === 0) return null;
  return gorselOzet(gruplar[0], reklamlar, gruplar.length);
}

function gorselOzet(grup: GorselGrupSatiri | undefined, reklamlar: GorselReklamSatiri[], grupSayisi: number): GoogleGorselReklamBeklentisi {
  const k = grup?.adGroup?.demandGenAdGroupSettings?.channelControls?.selectedChannels ?? {};
  const r = reklamlar[0]?.adGroupAd;
  const m = r?.ad?.demandGenMultiAssetAd;
  return {
    // Grup sayısı 1 değilse reklam sayısı bilerek bozulur: iki grup = söz dışı.
    reklamSayisi: grupSayisi === 1 ? reklamlar.length : -grupSayisi,
    yatay: m?.marketingImages?.length ?? 0,
    kare: m?.squareMarketingImages?.length ?? 0,
    dik45: m?.portraitMarketingImages?.length ?? 0,
    logo: m?.logoImages?.length ?? 0,
    kanallar: {
      youtubeInStream: k.youtubeInStream === true,
      youtubeInFeed: k.youtubeInFeed === true,
      youtubeShorts: k.youtubeShorts === true,
      discover: k.discover === true,
      gmail: k.gmail === true,
      display: k.display === true,
      maps: k.maps === true,
    },
    otomasyon: Object.fromEntries(
      (r?.adGroupAdAssetAutomationSettings ?? [])
        .filter((x) => x.assetAutomationType && GORSEL_OTOMASYON_TURLERI.has(x.assetAutomationType))
        .map((x) => [x.assetAutomationType!, x.assetAutomationStatus ?? 'BILINMIYOR']),
    ),
  };
}

/** Yalnız BİZİM yazdığımız türler kıyaslanır: Google başka türleri de dönebilir (ÖLÇÜLMEDİ). */
const GORSEL_OTOMASYON_TURLERI = new Set<string>(DEMAND_GEN_GORSEL_OTOMASYONU.map((x) => x.assetAutomationType));
const PMAX_OTOMASYON_TURLERI = new Set<string>(PMAX_OTOMASYONU.map((x) => x.assetAutomationType));

interface PmaxKampanyaSatiri {
  campaign?: { brandGuidelinesEnabled?: boolean; assetAutomationSettings?: Array<{ assetAutomationType?: string; assetAutomationStatus?: string }> };
}
interface VarlikGrubuSatiri {
  assetGroup?: { resourceName?: string; status?: string; finalUrls?: string[] };
}
interface VarlikBagiSatiri {
  assetGroupAsset?: { fieldType?: string; status?: string; source?: string };
}
interface MarkaBagiSatiri {
  campaignAsset?: { fieldType?: string; status?: string };
}

interface KampanyaHedefSatiri {
  campaignConversionGoal?: { campaign?: string; category?: string; origin?: string; biddable?: boolean };
}

/**
 * Kampanyanın TEKLİFE GİREN dönüşüm hedefleri. Süzgeç kampanyanın KAYNAK
 * ADIYLA (`campaign_conversion_goal.campaign`) ve o alan SELECT'te: WHERE'de
 * süzülen alanın seçilmesi GAQL kuralı (canlıda `campaign_asset` ile
 * öğrenildi). `campaign.id` birleşimi bu kaynakta ÖLÇÜLMEDİ; kaynak adı
 * kaynağın kendi alanı. CANLIDA ÖLÇÜLMEDİ.
 *
 * `biddable` proto3 JSON'da false iken HİÇ gelmeyebilir: yalnız `true`
 * teklife giren sayılıyor. Hiç satır yoksa boş küme = fark (satın alma da
 * teklife girmiyor demek).
 */
export function teklifHedefleriSorgusu(musteriId: string, kampanyaId: string): string {
  if (!/^\d+$/.test(musteriId) || !/^\d+$/.test(kampanyaId)) throw new Error('Geçersiz Google Ads hesap ya da kampanya kimliği');
  return `SELECT campaign_conversion_goal.campaign, campaign_conversion_goal.category, campaign_conversion_goal.origin, campaign_conversion_goal.biddable
       FROM campaign_conversion_goal
      WHERE campaign_conversion_goal.campaign = 'customers/${musteriId}/campaigns/${kampanyaId}'`;
}

async function teklifHedefleriOku(port: GoogleYayinPortu, ctx: FetchContext, kampanyaId: string): Promise<string[]> {
  const r = await port.ara<KampanyaHedefSatiri>(ctx, teklifHedefleriSorgusu(ctx.accountExternalId, kampanyaId));
  return r
    .filter((x) => x.campaignConversionGoal?.biddable === true)
    .map((x) => `${x.campaignConversionGoal?.category ?? 'BILINMIYOR'}~${x.campaignConversionGoal?.origin ?? 'BILINMIYOR'}`)
    .sort();
}

async function varlikGrubuOku(port: GoogleYayinPortu, ctx: FetchContext, kampanyaId: string): Promise<GoogleVarlikGrubuBeklentisi | null> {
  const [k] = await port.ara<PmaxKampanyaSatiri>(
    ctx,
    `SELECT campaign.id, campaign.brand_guidelines_enabled, campaign.asset_automation_settings FROM campaign WHERE campaign.id = ${kampanyaId}`,
  );
  const gruplar = await port.ara<VarlikGrubuSatiri>(
    ctx,
    `SELECT campaign.id, asset_group.resource_name, asset_group.status, asset_group.final_urls
       FROM asset_group
      WHERE campaign.id = ${kampanyaId} AND asset_group.status != 'REMOVED'`,
  );
  const baglar = await port.ara<VarlikBagiSatiri>(
    ctx,
    `SELECT campaign.id, asset_group_asset.field_type, asset_group_asset.status, asset_group_asset.source
       FROM asset_group_asset
      WHERE campaign.id = ${kampanyaId} AND asset_group_asset.status != 'REMOVED'`,
  );
  const marka = await port.ara<MarkaBagiSatiri>(
    ctx,
    `SELECT campaign.id, campaign_asset.field_type, campaign_asset.status
       FROM campaign_asset
      WHERE campaign.id = ${kampanyaId} AND campaign_asset.field_type IN ('BUSINESS_NAME', 'LOGO') AND campaign_asset.status != 'REMOVED'`,
  );
  if (!k?.campaign) return null;
  const alan = (t: PmaxAlani) =>
    // Google'ın KENDİ ürettiği varlıklar (kaynak AUTOMATICALLY_CREATED)
    // sayılmıyor: onları biz göndermedik; sayıya katmak her otomatik video
    // ekleyen kampanyayı "fark"ta durdururdu. Kaynağı okunamayan bizim sayılır.
    baglar.filter((x) => x.assetGroupAsset?.fieldType === t && x.assetGroupAsset?.source !== 'AUTOMATICALLY_CREATED').length;
  const markaSay = (t: string) => marka.filter((x) => x.campaignAsset?.fieldType === t).length;
  return {
    grupSayisi: gruplar.length,
    adresler: gruplar[0]?.assetGroup?.finalUrls ?? [],
    alanlar: {
      HEADLINE: alan('HEADLINE'),
      LONG_HEADLINE: alan('LONG_HEADLINE'),
      DESCRIPTION: alan('DESCRIPTION'),
      MARKETING_IMAGE: alan('MARKETING_IMAGE'),
      SQUARE_MARKETING_IMAGE: alan('SQUARE_MARKETING_IMAGE'),
      PORTRAIT_MARKETING_IMAGE: alan('PORTRAIT_MARKETING_IMAGE'),
      YOUTUBE_VIDEO: alan('YOUTUBE_VIDEO'),
    },
    marka: { BUSINESS_NAME: markaSay('BUSINESS_NAME'), LOGO: markaSay('LOGO') },
    markaKurallari: k.campaign.brandGuidelinesEnabled === true,
    otomasyon: Object.fromEntries(
      (k.campaign.assetAutomationSettings ?? [])
        .filter((x) => x.assetAutomationType && PMAX_OTOMASYON_TURLERI.has(x.assetAutomationType))
        .map((x) => [x.assetAutomationType!, x.assetAutomationStatus ?? 'BILINMIYOR']),
    ),
  };
}

// ---------------------------------------------------------------------------
// İŞLEYİCİ
// ---------------------------------------------------------------------------

/**
 * Hata sınıfı: KESİN (Google isteği reddetti, hiçbir şey kurulmadı) mı,
 * BELİRSİZ (kurulmuş olabilir) mi. Şüphede BELİRSİZ: yanlış "kesin"
 * kullanıcıyı yeniden yayınlamaya ve ikinci kampanyaya götürür; yanlış
 * "belirsiz" yalnız bir arama ve bir insan kararı ister.
 *
 * `rate_limited` KESİN: Google kota aşımında isteği İŞLEMEDEN reddediyor.
 * `transient` (zaman aşımı, 5xx) BELİRSİZ: istek uygulanmış olabilir.
 */
export function googleHataKesinMi(e: unknown): boolean {
  return e instanceof PlatformApiError && e.kind !== 'transient';
}

export async function googleYayinIsle(d: GoogleIsleyiciBagimliliklari, yayinId: string, sahip: string): Promise<GoogleIsSonucu> {
  const y = await yayinOku(d.tx, yayinId);
  if (y.durum !== 'on_kontrol') {
    // Aynı iş ikinci kez geldi (ya da insan ileri bir durumdan tetikledi):
    // atomik istek ASLA yeniden gönderilmez.
    return { tur: 'bitti', durum: y.durum };
  }
  if (!y.ad_account_id) return { tur: 'bitti', durum: await yayiniSonlandir(d.tx, yayinId, 'on_kontrol_reddi', 'Google Ads hesabı artık yok') };

  const anahtar = `${d.kilitOneki}:yazici:${y.ad_account_id}`;
  if (!(await d.kilit.al(anahtar, sahip, KILIT_MS))) return { tur: 'ertele', sebep: 'Bu hesapta başka bir işlem sürüyor; sıradasın.' };
  try {
    // ── Ön kontrol: SIFIR platform çağrısı ────────────────────────────────
    const [h] = await d.tx((t) =>
      t.$queryRaw<Array<{ external_id: string; manager_external_id: string | null; connection_id: string; client_id: string | null; platform: string }>>(Prisma.sql`
        SELECT external_id, manager_external_id, connection_id::text, client_id::text, platform::text AS platform
          FROM ad_accounts WHERE id = ${y.ad_account_id}::uuid`),
    );
    if (!h || h.client_id !== y.client_id) return sonlandir('Bu Google Ads hesabı artık bu workspace’e atanmış değil');
    if (h.platform !== 'google') return sonlandir('Bu hesap bir Google Ads hesabı değil');
    const kapi = await googleYazmaAcikMi(d.tx, y.client_id);
    if (!kapi.acik) return sonlandir(kapi.sebep);
    let token: string;
    try {
      token = await d.google.tokenAl(h.connection_id);
    } catch (e) {
      return sonlandir(`Google bağlantısı kullanılamıyor: ${(e as Error).message}`);
    }
    const ctx: FetchContext = {
      accessToken: token,
      accountExternalId: h.external_id.replace(/-/g, ''),
      loginCustomerId: h.manager_external_id ?? undefined,
    };

    // ── Kur: DURAKLATILMIŞ, tek atomik istek ─────────────────────────────
    let durum = await gec(d.tx, yayinId, y.durum, 'medya', null);
    durum = await gec(d.tx, yayinId, durum, 'kuruluyor', null);
    await nesnelerYaz(d.tx, yayinId, 'gonderiliyor', null, 'bekliyor');

    const g = y.derlenmis_govde;
    if (g.govde.validateOnly !== false) throw new Error('Yayın gövdesi prova bayrağı taşıyor; kurulum yapılmaz.');
    // Maks. Performans'ta reklam nesnesi yok (`sira.reklam === null`).
    const reklamVar = g.sira.reklam !== null;
    let kimlikler: NesneKimlikleri | null = null;
    let logoKaynagi: string | null = null;
    let gorselKaynaklari: Array<{ varlikId: string; kaynak: string }> = [];
    try {
      const yanit = await d.google.mutate(ctx, g.govde);
      const kaynak = (i: number | null): string | null => (i === null ? null : (Object.values(yanit[i] ?? {})[0]?.resourceName ?? null));
      const k = kaynak(g.sira.kampanya);
      const r = kaynak(g.sira.reklamGrubu);
      const a = kaynak(g.sira.reklam);
      logoKaynagi = kaynak(g.sira.logo);
      gorselKaynaklari = (g.sira.gorseller ?? []).flatMap((x) => {
        const kk = kaynak(x.sira);
        return kk ? [{ varlikId: x.varlikId, kaynak: kk }] : [];
      });
      // 200 AMA KAYNAK ADI YOK: başarı sayılmıyor, ne kurulduğunu bilmiyoruz.
      kimlikler = k && r && (a || !reklamVar) ? { kampanya: k, reklamGrubu: r, ...(a ? { reklam: a } : {}) } : null;
    } catch (e) {
      if (googleHataKesinMi(e)) {
        await nesnelerYaz(d.tx, yayinId, 'reddedildi', null, 'gonderiliyor', { mesaj: (e as Error).message });
        return { tur: 'bitti', durum: await gec(d.tx, yayinId, durum, 'kurulamadi', `Google kabul etmedi: ${(e as Error).message}`.slice(0, 2000)) };
      }
      logger.warn(`yayin=${yayinId}: Google kurulumunun sonucu bilinmiyor: ${(e as Error).message}`);
    }

    if (!kimlikler) {
      // ── Uzlaştırma: YALNIZ OKUMA ───────────────────────────────────────
      await nesnelerYaz(d.tx, yayinId, 'belirsiz', null, 'gonderiliyor');
      durum = await gec(d.tx, yayinId, durum, 'uzlastirma', 'Google kurulumunun sonucu bilinmiyor; aranıyor');
      const bulunan = await kurulumuAra(d.google, ctx, yayinId, g.kurgu).catch((e: unknown) => ({ hata: (e as Error).message }));
      if ('hata' in bulunan) return { tur: 'bitti', durum: await gec(d.tx, yayinId, durum, 'kayit_belirsiz', `Google'da arama da düştü (${bulunan.hata})`) };
      if (bulunan.kampanyalar.length !== 1 || !bulunan.grup || (reklamVar && !bulunan.reklam)) {
        return {
          tur: 'bitti',
          durum: await gec(
            d.tx,
            yayinId,
            durum,
            'sonuc_belirsiz',
            bulunan.kampanyalar.length === 0
              ? "Google'da kurulmuş olabilir ama aramada görünmedi; Google Ads'te kontrol et, yeniden yayınlama."
              : `Google'da ${bulunan.kampanyalar.length} kopya var (${bulunan.kampanyalar.join(', ')}).`,
          ),
        };
      }
      kimlikler = { kampanya: bulunan.kampanyalar[0]!, reklamGrubu: bulunan.grup, ...(bulunan.reklam ? { reklam: bulunan.reklam } : {}) };
      durum = await gec(d.tx, yayinId, durum, 'kuruluyor', 'Uzlaştırıldı');
      if (!(await nesneKimlikleri(d.tx, yayinId, g.kurgu, kimlikler, 'belirsiz', durum))) return { tur: 'bitti', durum: 'kayit_belirsiz' };
    } else {
      // SONUÇ: yazılamazsa nesneler 'gonderiliyor'da kalır, yayın
      // kayit_belirsiz olur — 'reddedildi' yazmak yeniden denemeyi açardı.
      const yazildi = await nesneKimlikleri(d.tx, yayinId, g.kurgu, kimlikler, 'gonderiliyor', durum);
      if (!yazildi) return { tur: 'bitti', durum: 'kayit_belirsiz' };
    }
    if (logoKaynagi && g.logoVarlikId) {
      // Önbellek: sonraki yayın aynı logoyu yeniden yüklemesin. Düşerse
      // yayın sürüyor; bir sonraki yayın logoyu yeniden yükler.
      await d.tx((t) =>
        t.$queryRaw(Prisma.sql`
          INSERT INTO asset_platform_refs (id, org_id, asset_id, platform, ad_account_id, external_ref)
          VALUES (gen_random_uuid(), ${y.org_id}::uuid, ${g.logoVarlikId}::uuid, 'google'::"Platform", ${y.ad_account_id}::uuid, ${logoKaynagi})
          ON CONFLICT (asset_id, ad_account_id) DO NOTHING RETURNING id`),
      ).catch((e: unknown) => logger.warn(`Logo kaynak adı önbelleğe yazılamadı: ${(e as Error).message}`));
    }
    // Reklam görselleri de aynı önbelleğe (Dalga 3): bir sonraki yayın aynı
    // baytları yeniden yüklemesin. Uzlaştırma yolunda kaynak adı yanıttan
    // gelmediği için liste boş: bir sonraki yayın yeniden yükler (zararsız).
    for (const x of gorselKaynaklari) {
      await d.tx((t) =>
        t.$queryRaw(Prisma.sql`
          INSERT INTO asset_platform_refs (id, org_id, asset_id, platform, ad_account_id, external_ref)
          VALUES (gen_random_uuid(), ${y.org_id}::uuid, ${x.varlikId}::uuid, 'google'::"Platform", ${y.ad_account_id}::uuid, ${x.kaynak})
          ON CONFLICT (asset_id, ad_account_id) DO NOTHING RETURNING id`),
      ).catch((e: unknown) => logger.warn(`Görsel kaynak adı önbelleğe yazılamadı (${x.varlikId}): ${(e as Error).message}`));
    }

    // ── Geri oku ────────────────────────────────────────────────────────
    durum = await gec(d.tx, yayinId, durum, 'geri_okuma', null);
    const kampanyaId = googleYalinKimlik(kimlikler.kampanya);
    let okunan: GoogleOkunan;
    try {
      okunan = await googleGeriOku(d.google, ctx, kampanyaId, y.beklenen_yanki);
    } catch (e) {
      await geriOkumaYaz(d.tx, y, 'dogrulanamadi', [], { hata: (e as Error).message });
      return { tur: 'bitti', durum: await gec(d.tx, yayinId, durum, 'dogrulanamadi', `Google'daki ayarlar okunamadı: ${(e as Error).message}`.slice(0, 2000)) };
    }
    const k = googleGeriOkumaKarsilastir(y.beklenen_yanki, okunan);
    await geriOkumaYaz(d.tx, y, k.sonuc, k.satirlar, okunan);
    if (k.sonuc === 'fark') {
      // Kampanya DURAKLATILMIŞ kaldı: para harcamıyor. Ne farklıysa ekranda.
      return { tur: 'bitti', durum: await gec(d.tx, yayinId, durum, 'fark_var', `Google'da duran ayar gönderilenden farklı: ${k.satirlar.map((s) => s.alan).join(', ')}`) };
    }

    // ── Tekillik ────────────────────────────────────────────────────────
    durum = await gec(d.tx, yayinId, durum, 'tekillik_kapisi', null);
    const tekil = await kurulumuAra(d.google, ctx, yayinId, g.kurgu).catch(() => null);
    if (!tekil) return { tur: 'bitti', durum: await gec(d.tx, yayinId, durum, 'dogrulanamadi', 'Tekillik araması yapılamadı') };
    const fazla = tekil.kampanyalar.filter((x) => x !== kimlikler!.kampanya);
    if (fazla.length > 0) return { tur: 'bitti', durum: await gec(d.tx, yayinId, durum, 'fark_var', `Google'da bu reklamın ikinci bir kopyası var: ${fazla.join(', ')}`) };

    // ── Aç ya da duraklatılmış bırak ────────────────────────────────────
    if (y.kapali_kalacak) return { tur: 'bitti', durum: await kapaliBirak(d.tx, yayinId, durum) };
    durum = await gec(d.tx, yayinId, durum, 'aciliyor', null);
    const kapi2 = await googleYazmaAcikMi(d.tx, y.client_id);
    if (!kapi2.acik) return { tur: 'bitti', durum: await gec(d.tx, yayinId, durum, 'bekletildi', kapi2.sebep) };
    try {
      await d.google.kampanyaAc(ctx, kimlikler.kampanya);
    } catch (e) {
      // Açma tekrarlanabilir ama önce DURUM okunur: cevap kaybolmuş olabilir.
      const tekrar = await googleGeriOku(d.google, ctx, kampanyaId).catch(() => null);
      if (tekrar?.durum !== 'ENABLED') {
        return { tur: 'bitti', durum: await gec(d.tx, yayinId, durum, 'kismen_acik', `Kampanya açılamadı: ${(e as Error).message}`.slice(0, 2000)) };
      }
    }
    await nesneYaz(d.tx, yayinId, 'kampanya', 'acildi', 'kuruldu');
    return { tur: 'bitti', durum: await gec(d.tx, yayinId, durum, 'iletildi', null) };
  } finally {
    await d.kilit.birak(anahtar, sahip);
  }

  async function sonlandir(sebep: string): Promise<GoogleIsSonucu> {
    // Google'a hiçbir şey gitmedi: ön kontrolde kalan yayın sebebiyle kapanır.
    return { tur: 'bitti', durum: await yayiniSonlandir(d.tx, yayinId, 'on_kontrol_reddi', sebep) };
  }
}

// ---------------------------------------------------------------------------
// GERİ AL ("Vazgeç ve kaldır")
// ---------------------------------------------------------------------------

/**
 * Kampanyayı Google'da KALDIRAN atomik gövde. Google'da Meta'nın ARŞİV'inin
 * karşılığı REMOVED ve kaldırılan kampanya bir daha ENABLED/PAUSED yapılamaz
 * (panel onay metni bunu söylüyor).
 *
 * `update` + `status: REMOVED` DEĞİL, `remove` İŞLEMİ: Google Ads API durum
 * alanına REMOVED yazmayı kabul etmiyor (REMOVED yalnız okunan bir değer;
 * kaldırmanın belgelenmiş yolu `CampaignOperation.remove`). Yanlış biçim bir
 * ret üretir ve kullanıcı yalnız "kaldırılamadı" görür. Kabul edilip
 * görmezden gelinme ihtimaline karşı sonuç her hâlükârda GERİ OKUNUYOR.
 * CANLIDA ÖLÇÜLMEDİ (2026-10-11).
 *
 * `partialFailure: false`: birden çok kopya kaldırılırken biri düşerse
 * HİÇBİRİ uygulanmasın; yarım kaldırma "kaldırıldı" görünüp birini hesapta
 * bırakabilirdi. Kampanya kaldırılınca reklam grubu ve reklam onu miras
 * alıyor (Meta'daki arşiv gibi); bütçe ayrı kaynak ve tek başına harcamaz.
 */
export function googleKaldirmaGovdesi(kampanyaKaynaklari: readonly string[]): {
  mutateOperations: Array<Record<string, unknown>>;
  partialFailure: false;
  validateOnly: false;
} {
  if (kampanyaKaynaklari.length === 0) throw new Error('Kaldırılacak kampanya yok');
  for (const k of kampanyaKaynaklari) {
    if (!/^customers\/\d+\/campaigns\/\d+$/.test(k)) throw new Error(`Geçersiz kampanya kaynağı: ${k.slice(0, 80)}`);
  }
  return {
    mutateOperations: kampanyaKaynaklari.map((k) => ({ campaignOperation: { remove: k } })),
    partialFailure: false,
    validateOnly: false,
  };
}

/** Geri almada kampanyaların Google'daki durumu, kaynak adına göre. Satırı gelmeyen kampanyanın anahtarı yok. */
async function kampanyaDurumlari(port: GoogleYayinPortu, ctx: FetchContext, kaynaklar: readonly string[]): Promise<Map<string, string>> {
  const idler = kaynaklar.map((k) => googleYalinKimlik(k));
  for (const id of idler) if (!/^\d+$/.test(id)) throw new Error(`Geçersiz kampanya kimliği: ${id.slice(0, 40)}`);
  // `campaign.id` SELECT'te de: WHERE'de süzülen alan SELECT'te yoksa Google
  // bazı kaynaklarda sorguyu reddediyor (canlı tur, 2026-10-11).
  const satirlar = await port.ara<{ campaign?: { resourceName?: string; status?: string } }>(
    ctx,
    `SELECT campaign.id, campaign.resource_name, campaign.status FROM campaign WHERE campaign.id IN (${idler.join(', ')})`,
  );
  const m = new Map<string, string>();
  for (const s of satirlar) if (s.campaign?.resourceName && s.campaign.status) m.set(s.campaign.resourceName, s.campaign.status);
  return m;
}

/**
 * Google yayınını GERİ AL: kampanya(lar)ı kaldır, GERİ OKU, yayını Meta'nın
 * geri almasıyla AYNI son duruma (`arsivlendi` + `geri_alindi`) taşı. Tek
 * durum makinesi: panel ve sayaçlar ikinci bir "kaldırıldı" durumu tanımıyor
 * ve tanımaları gerekirse her sayan yer aynı commit'te değişmek zorunda kalırdı.
 *
 * Hiçbir yolda sessiz değil: kaldırılamayan ya da geri okumada REMOVED
 * görünmeyen kampanya varsa yayın OLDUĞU YERDE kalır ve sebebi yazılır
 * (kullanıcı tekrar basabilir; kaldırma tekrarlanabilir bir işlem).
 * "200 döndü" kaldırıldı demek değil: karar geri okumadan.
 */
export async function googleGeriAlIsle(d: GoogleIsleyiciBagimliliklari, yayinId: string, sahip: string): Promise<GoogleIsSonucu> {
  const y = await yayinOku(d.tx, yayinId);
  // Aynı iş iki kez geldiyse (çift tıklama) ikincisi hiçbir şey yapmaz.
  if (!GERI_ALINABILIR_DURUMLAR.includes(y.durum)) return { tur: 'bitti', durum: y.durum };

  const kayitli = await d.tx((t) =>
    t.$queryRaw<Array<{ meta_id: string }>>(Prisma.sql`
      SELECT meta_id FROM yayin_nesnesi WHERE yayin_id = ${yayinId}::uuid AND ad = 'kampanya' AND meta_id IS NOT NULL`),
  );
  // Google atomik isteği KESİN reddettiyse hiçbir şey kurulmadı (`kurulamadi`
  // ve kampanya kimliği yok): kaldıracak bir şey yok, SIFIR çağrıyla kapanır.
  // Kimliği bilinmeyen öbür hâllerde (`sonuc_belirsiz`) kurulmuş olabilir:
  // orada aşağıdaki ad araması karar veriyor.
  if (kayitli.length === 0 && y.durum === 'kurulamadi') {
    return { tur: 'bitti', durum: await yayiniSonlandir(d.tx, yayinId, 'geri_alindi', "Google'da kurulan bir şey yoktu; kayıt kapatıldı.") };
  }
  if (!y.ad_account_id) return yerindeKal('Google Ads hesabı artık yok; kampanyayı Google Ads’ten kaldır.');

  const anahtar = `${d.kilitOneki}:yazici:${y.ad_account_id}`;
  if (!(await d.kilit.al(anahtar, sahip, KILIT_MS))) return { tur: 'ertele', sebep: 'Bu hesapta başka bir işlem sürüyor; sıradasın.' };
  try {
    const [h] = await d.tx((t) =>
      t.$queryRaw<Array<{ external_id: string; manager_external_id: string | null; connection_id: string; client_id: string | null; platform: string }>>(Prisma.sql`
        SELECT external_id, manager_external_id, connection_id::text, client_id::text, platform::text AS platform
          FROM ad_accounts WHERE id = ${y.ad_account_id}::uuid`),
    );
    if (!h || h.client_id !== y.client_id) return yerindeKal('Bu Google Ads hesabı artık bu workspace’e atanmış değil; kampanyayı Google Ads’ten kaldır.');
    if (h.platform !== 'google') return yerindeKal('Bu hesap bir Google Ads hesabı değil');
    const kapi = await googleYazmaAcikMi(d.tx, y.client_id);
    if (!kapi.acik) return yerindeKal(kapi.sebep);
    let token: string;
    try {
      token = await d.google.tokenAl(h.connection_id);
    } catch (e) {
      return yerindeKal(`Google bağlantısı kullanılamıyor: ${(e as Error).message}`);
    }
    const ctx: FetchContext = {
      accessToken: token,
      accountExternalId: h.external_id.replace(/-/g, ''),
      loginCustomerId: h.manager_external_id ?? undefined,
    };

    // Hedef: kayıtlı kampanya + adında bu yayının izi olan, kaldırılmamış
    // HER kopya. Tekillik kapısının bulduğu ikinci kopya (fark_var) ya da
    // uzlaştırmanın sayamadığı kopyalar (sonuc_belirsiz) da bu yayının
    // ürünü; yalnız kaydı kaldırmak onları hesapta sessizce bırakırdı.
    // Arama düşerse kaldırma YAPILMAZ: eksik hedefle "geri alındı" demek
    // yalan olurdu.
    let bulunan: string[];
    try {
      // Kurgu derlenmiş gövdeden: Maks. Performans'ta reklam nesnesi yok ve
      // arama varlık grubundan yapılıyor; yanlış kaynaktan aramak hiçbir
      // kopyayı bulamaz ve "kaldırıldı" eksik hedefle söylenmiş olurdu.
      bulunan = (await kurulumuAra(d.google, ctx, yayinId, y.derlenmis_govde.kurgu)).kampanyalar;
    } catch (e) {
      return yerindeKal(`Google'da bu reklamın kampanyaları aranamadı: ${(e as Error).message}`);
    }
    const hedef = [...new Set([...kayitli.map((k) => k.meta_id), ...bulunan])];

    if (hedef.length > 0) {
      let yazmaHatasi: string | null = null;
      try {
        await d.google.mutate(ctx, googleKaldirmaGovdesi(hedef));
      } catch (e) {
        // Cevap kaybolmuş olabilir: karar yine geri okumada.
        yazmaHatasi = (e as Error).message;
      }
      let durumlar: Map<string, string>;
      try {
        durumlar = await kampanyaDurumlari(d.google, ctx, hedef);
      } catch (e) {
        return yerindeKal(`Kaldırma ${yazmaHatasi ? `düştü (${yazmaHatasi}) ve` : 'gönderildi ama'} sonuç okunamadı: ${(e as Error).message}`);
      }
      // Okumada HİÇ görünmeyen kampanya da kaldırılmış SAYILMIYOR: satırın
      // yokluğu "kaldırıldı" kanıtı değil (yanlış hesap, yetki, kimlik).
      const kalan = hedef.filter((k) => durumlar.get(k) !== 'REMOVED');
      if (kalan.length > 0) {
        const ayrinti = kalan.map((k) => `${googleYalinKimlik(k)} (${durumlar.get(k) ?? 'okunamadı'})`).join(', ');
        return yerindeKal(`Kaldırılamadı: ${ayrinti}${yazmaHatasi ? ` · Google: ${yazmaHatasi}` : ''}`);
      }
      await d.tx((t) =>
        t.$queryRaw(Prisma.sql`
          UPDATE yayin_nesnesi SET durum = 'arsivlendi', updated_at = now()
           WHERE yayin_id = ${yayinId}::uuid AND ad = 'kampanya' AND meta_id IS NOT NULL
          RETURNING id`),
      );
    }
    const not = hedef.length === 0 ? "Google'da bu reklama ait kampanya bulunmadı; kayıt kapatıldı." : null;
    return { tur: 'bitti', durum: await yayiniSonlandir(d.tx, yayinId, 'geri_alindi', not) };
  } finally {
    await d.kilit.birak(anahtar, sahip);
  }

  async function yerindeKal(sebep: string): Promise<GoogleIsSonucu> {
    // Meta'daki "Arşivlenemedi" ile aynı davranış: durum değişmez, sebep
    // ekranda. Panel yoklaması sebep değişimini sonuç sayıyor.
    await d.tx((t) => t.$queryRaw(Prisma.sql`UPDATE yayin SET sebep = ${sebep.slice(0, 2000)} WHERE id = ${yayinId}::uuid RETURNING id`));
    return { tur: 'bitti', durum: y.durum };
  }
}

/**
 * Kampanya adındaki `adv-<kimlik>` ile arama (uzlaştırma ve tekillik). Kısa
 * kimlik yalnız onaltılık rakam: GAQL metnine güvenle gömülüyor.
 */
async function kurulumuAra(
  port: GoogleYayinPortu,
  ctx: FetchContext,
  yayinId: string,
  kurgu: string,
): Promise<{ kampanyalar: string[]; grup: string | null; reklam: string | null }> {
  const kisa = yayinId.replace(/-/g, '').slice(0, 8);
  if (!/^[0-9a-f]{8}$/.test(kisa)) throw new Error('Geçersiz yayın kimliği');
  if (kurgu === 'MAKS_PERFORMANS') {
    /*
     * Maks. Performans'ta `ad_group_ad` YOK: o kaynaktan arayan tekillik
     * kapısı kendi kurduğu kampanyayı hiç bulamaz ve her yayını "aramada
     * görünmedi" diye durdururdu. Varlık grubundan aranıyor; WHERE'deki iki
     * kampanya alanı SELECT'te (GAQL kuralı, yukarıya bkz.).
     */
    const satirlar = await port.ara<{ campaign?: { resourceName?: string }; assetGroup?: { resourceName?: string } }>(
      ctx,
      `SELECT campaign.resource_name, campaign.name, campaign.status, asset_group.resource_name
         FROM asset_group
        WHERE campaign.name LIKE '%adv-${kisa}%' AND campaign.status != 'REMOVED'`,
    );
    return {
      kampanyalar: [...new Set(satirlar.map((s) => s.campaign?.resourceName).filter((x): x is string => !!x))],
      grup: satirlar[0]?.assetGroup?.resourceName ?? null,
      reklam: null,
    };
  }
  const satirlar = await port.ara<{ campaign?: { resourceName?: string }; adGroup?: { resourceName?: string }; adGroupAd?: { resourceName?: string } }>(
    ctx,
    `SELECT campaign.resource_name, campaign.name, campaign.status, ad_group.resource_name, ad_group_ad.resource_name
       FROM ad_group_ad
      WHERE campaign.name LIKE '%adv-${kisa}%' AND campaign.status != 'REMOVED'`,
  );
  const kampanyalar = [...new Set(satirlar.map((s) => s.campaign?.resourceName).filter((x): x is string => !!x))];
  return {
    kampanyalar,
    grup: satirlar[0]?.adGroup?.resourceName ?? null,
    reklam: satirlar[0]?.adGroupAd?.resourceName ?? null,
  };
}

async function yayinOku(tx: TxRunner, id: string): Promise<YayinSatiri> {
  const [y] = await tx((t) =>
    t.$queryRaw<YayinSatiri[]>(Prisma.sql`
      SELECT id::text, org_id::text, client_id::text, ad_account_id::text, durum, derlenmis_govde, beklenen_yanki, kapali_kalacak, api_surumu
        FROM yayin WHERE id = ${id}::uuid`),
  );
  if (!y) throw new Error(`Yayın bulunamadı: ${id}`);
  return y;
}

const AKTIF = new Set<YayinDurumu>(YAYIN_DURUMLARI.filter((x) => YAYIN_DURUM_SINIFI[x].aktif));

/**
 * Durum geçişi: Meta motorunun kuralı (izinli geçiş tablosu + iyimser kilit).
 * Son durumlar (arşiv, kapali_kuruldu) yalnız `yayiniSonlandir`'den.
 */
async function gec(tx: TxRunner, yayinId: string, eski: YayinDurumu, yeni: YayinDurumu, sebep: string | null): Promise<YayinDurumu> {
  if (!gecisIzinliMi(eski, yeni)) throw new Error(`İzinsiz geçiş: ${eski} → ${yeni}`);
  if (!AKTIF.has(yeni)) throw new Error(`${yeni} yalnız yayiniSonlandir ile yazılır`);
  const r = await tx((t) =>
    t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE yayin SET durum = ${yeni}, onceki_durum = durum, durum_at = now(), sebep = ${sebep}
       WHERE id = ${yayinId}::uuid AND durum = ${eski} AND sonlandi_at IS NULL
      RETURNING id::text`),
  );
  if (r.length !== 1) throw new Error(`Yayın ${yayinId} başka bir süreçte ilerlemiş (${eski})`);
  return yeni;
}

async function nesnelerYaz(tx: TxRunner, yayinId: string, durum: string, metaId: string | null, beklenen: string, hata: unknown = null): Promise<void> {
  await tx((t) =>
    t.$queryRaw(Prisma.sql`
      UPDATE yayin_nesnesi SET durum = ${durum}, meta_id = COALESCE(${metaId}, meta_id),
             son_hata = ${hata === null ? null : JSON.stringify(hata)}::jsonb,
             deneme_sayisi = deneme_sayisi + ${durum === 'gonderiliyor' ? 1 : 0}, updated_at = now()
       WHERE yayin_id = ${yayinId}::uuid AND durum = ${beklenen}
      RETURNING id`),
  );
}

async function nesneYaz(tx: TxRunner, yayinId: string, ad: string, durum: string, beklenen: string, metaId: string | null = null): Promise<void> {
  const r = await tx((t) =>
    t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE yayin_nesnesi SET durum = ${durum}, meta_id = COALESCE(${metaId}, meta_id), updated_at = now()
       WHERE yayin_id = ${yayinId}::uuid AND ad = ${ad} AND durum = ${beklenen}
      RETURNING id::text`),
  );
  // Sıfır satır = başka bir süreç değiştirdi ya da RLS gizledi: sessiz geçme.
  if (r.length !== 1) throw new Error(`yayin_nesnesi ${ad} ${durum} yazılamadı`);
}

/** Nesnelerin Google kaynak adını yazar; yazılamazsa yayın kayit_belirsiz. */
async function nesneKimlikleri(
  tx: TxRunner,
  yayinId: string,
  kurgu: string,
  k: NesneKimlikleri,
  beklenen: string,
  durum: YayinDurumu,
): Promise<boolean> {
  try {
    for (const n of googleNesneleri(kurgu)) {
      const kimlik = k[n.sira];
      // Beklenen nesnenin kimliği yoksa SESSİZ geçilmez: yazılamadı sayılır.
      if (!kimlik) throw new Error(`${n.ad} için Google kaynak adı yok`);
      await nesneYaz(tx, yayinId, n.ad, 'kuruldu', beklenen, kimlik);
    }
    return true;
  } catch (e) {
    logger.error(`KAYIT BELİRSİZ yayin=${yayinId} google kampanya=${k.kampanya}: ${(e as Error).message}`);
    await gec(tx, yayinId, durum, 'kayit_belirsiz', `Google'da kuruldu (${k.kampanya}) ama kayıt yazılamadı`).catch(() => {
      // Durum da yazılamıyorsa elde kalan tek iz yukarıdaki log satırı.
    });
    return false;
  }
}

async function geriOkumaYaz(tx: TxRunner, y: YayinSatiri, sonuc: 'temiz' | 'fark' | 'dogrulanamadi', satirlar: GeriOkumaSatiri[], ham: unknown): Promise<void> {
  await tx((t) =>
    t.$queryRaw(Prisma.sql`
      INSERT INTO geri_okuma (yayin_id, org_id, client_id, sonuc, satirlar, bilgiler, ham, api_surumu)
      VALUES (${y.id}::uuid, ${y.org_id}::uuid, ${y.client_id}::uuid, ${sonuc}, ${JSON.stringify(satirlar)}::jsonb,
              '[]'::jsonb, ${JSON.stringify(ham)}::jsonb, ${y.api_surumu})
      RETURNING id`),
  );
}
