import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { YAYIN_DURUMLARI, YAYIN_DURUM_SINIFI, gecisIzinliMi, type YayinDurumu } from '@advetics/shared';
import { PlatformApiError, type FetchContext } from '../../connections/provider.types';
import { googleYalinKimlik } from '../../connections/providers/google-demandgen';
import { kapaliBirak, yayiniSonlandir, type TxRunner } from '../yayin-motoru';
import { googleYazmaAcikMi } from '../yazma-kapisi';
import type { GoogleBeklenen, GoogleDerleme } from './derle-google';

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
    for (const [i, n] of GOOGLE_NESNELERI.entries()) {
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
  const kiyasla = (alan: string, beklenen: unknown, okunan: unknown) => {
    if (JSON.stringify(beklenen) !== JSON.stringify(okunan)) satirlar.push({ alan, beklenen, okunan });
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
  return { sonuc: satirlar.length ? 'fark' : 'temiz', satirlar };
}

interface KampanyaSatiri {
  campaign?: {
    resourceName?: string;
    name?: string;
    status?: string;
    advertisingChannelType?: string;
    networkSettings?: { targetGoogleSearch?: boolean; targetSearchNetwork?: boolean; targetContentNetwork?: boolean; targetPartnerSearchNetwork?: boolean };
    geoTargetTypeSetting?: { positiveGeoTargetType?: string };
  };
  campaignBudget?: { amountMicros?: string };
}
interface KriterSatiri {
  campaignCriterion?: { type?: string; negative?: boolean };
  adGroupCriterion?: { type?: string; negative?: boolean };
}

/**
 * GAQL ile okur. Kimlik yalnız RAKAM (GAQL'de bağlı parametre yok; kimlik
 * sorgu metnine gömülüyor). Alan adları v25 referansından, ÖLÇÜLMEDİ.
 */
export async function googleGeriOku(port: GoogleYayinPortu, ctx: FetchContext, kampanyaId: string): Promise<GoogleOkunan> {
  if (!/^\d+$/.test(kampanyaId)) throw new Error(`Geçersiz kampanya kimliği: ${kampanyaId.slice(0, 40)}`);
  const [k] = await port.ara<KampanyaSatiri>(
    ctx,
    `SELECT campaign.resource_name, campaign.name, campaign.status, campaign.advertising_channel_type,
            campaign.network_settings.target_google_search, campaign.network_settings.target_search_network,
            campaign.network_settings.target_content_network, campaign.network_settings.target_partner_search_network,
            campaign.geo_target_type_setting.positive_geo_target_type, campaign_budget.amount_micros
       FROM campaign WHERE campaign.id = ${kampanyaId}`,
  );
  const kampanyaKriteri = await port.ara<KriterSatiri>(
    ctx,
    `SELECT campaign_criterion.type, campaign_criterion.negative FROM campaign_criterion WHERE campaign.id = ${kampanyaId}`,
  );
  const grupKriteri = await port.ara<KriterSatiri>(
    ctx,
    `SELECT ad_group_criterion.type, ad_group_criterion.negative FROM ad_group_criterion WHERE campaign.id = ${kampanyaId}`,
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
    let kimlikler: Record<'kampanya' | 'reklamGrubu' | 'reklam', string> | null = null;
    let logoKaynagi: string | null = null;
    try {
      const yanit = await d.google.mutate(ctx, g.govde);
      const kaynak = (i: number | null): string | null => (i === null ? null : (Object.values(yanit[i] ?? {})[0]?.resourceName ?? null));
      const k = kaynak(g.sira.kampanya);
      const r = kaynak(g.sira.reklamGrubu);
      const a = kaynak(g.sira.reklam);
      logoKaynagi = kaynak(g.sira.logo);
      // 200 AMA KAYNAK ADI YOK: başarı sayılmıyor, ne kurulduğunu bilmiyoruz.
      kimlikler = k && r && a ? { kampanya: k, reklamGrubu: r, reklam: a } : null;
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
      const bulunan = await kurulumuAra(d.google, ctx, yayinId).catch((e: unknown) => ({ hata: (e as Error).message }));
      if ('hata' in bulunan) return { tur: 'bitti', durum: await gec(d.tx, yayinId, durum, 'kayit_belirsiz', `Google'da arama da düştü (${bulunan.hata})`) };
      if (bulunan.kampanyalar.length !== 1 || !bulunan.grup || !bulunan.reklam) {
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
      kimlikler = { kampanya: bulunan.kampanyalar[0]!, reklamGrubu: bulunan.grup, reklam: bulunan.reklam };
      durum = await gec(d.tx, yayinId, durum, 'kuruluyor', 'Uzlaştırıldı');
      if (!(await nesneKimlikleri(d.tx, yayinId, kimlikler, 'belirsiz', durum))) return { tur: 'bitti', durum: 'kayit_belirsiz' };
    } else {
      // SONUÇ: yazılamazsa nesneler 'gonderiliyor'da kalır, yayın
      // kayit_belirsiz olur — 'reddedildi' yazmak yeniden denemeyi açardı.
      const yazildi = await nesneKimlikleri(d.tx, yayinId, kimlikler, 'gonderiliyor', durum);
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

    // ── Geri oku ────────────────────────────────────────────────────────
    durum = await gec(d.tx, yayinId, durum, 'geri_okuma', null);
    const kampanyaId = googleYalinKimlik(kimlikler.kampanya);
    let okunan: GoogleOkunan;
    try {
      okunan = await googleGeriOku(d.google, ctx, kampanyaId);
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
    const tekil = await kurulumuAra(d.google, ctx, yayinId).catch(() => null);
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

/**
 * Kampanya adındaki `adv-<kimlik>` ile arama (uzlaştırma ve tekillik). Kısa
 * kimlik yalnız onaltılık rakam: GAQL metnine güvenle gömülüyor.
 */
async function kurulumuAra(
  port: GoogleYayinPortu,
  ctx: FetchContext,
  yayinId: string,
): Promise<{ kampanyalar: string[]; grup: string | null; reklam: string | null }> {
  const kisa = yayinId.replace(/-/g, '').slice(0, 8);
  if (!/^[0-9a-f]{8}$/.test(kisa)) throw new Error('Geçersiz yayın kimliği');
  const satirlar = await port.ara<{ campaign?: { resourceName?: string }; adGroup?: { resourceName?: string }; adGroupAd?: { resourceName?: string } }>(
    ctx,
    `SELECT campaign.resource_name, ad_group.resource_name, ad_group_ad.resource_name
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

/** Üç nesnenin Google kaynak adını yazar; yazılamazsa yayın kayit_belirsiz. */
async function nesneKimlikleri(
  tx: TxRunner,
  yayinId: string,
  k: Record<'kampanya' | 'reklamGrubu' | 'reklam', string>,
  beklenen: string,
  durum: YayinDurumu,
): Promise<boolean> {
  try {
    for (const n of GOOGLE_NESNELERI) await nesneYaz(tx, yayinId, n.ad, 'kuruldu', beklenen, k[n.sira]);
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
