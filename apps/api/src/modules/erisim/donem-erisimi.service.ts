import { Injectable, Logger } from '@nestjs/common';
import { GOOGLE_ERISIM_YOK, PLATFORM_KISA_ADLARI, type Platform } from '@advetics/shared';
import { QuotaGuardService, type QuotaLayer } from '../../queue/quota-guard.service';
import type { InsightsLevel, PeriodReachRow } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';

/**
 * ═══ DÖNEMİN TEKİL ERİŞİMİ — RAPOR VE KURAL MOTORU İÇİN TEK OKUYUCU ═══
 *
 * İKİ SESSİZ HATANIN ORTAK KÖKÜ: tekil erişim günlerden türetiliyordu.
 *  · Rapor: günlük erişimlerin ORTALAMASI basılıyordu ("*" ile). 30 günlük
 *    raporda kampanyanın kitlesi olduğundan kat kat küçük görünüyordu.
 *  · Kural motoru: frekans = Σgösterim ÷ ORTALAMA günlük erişim. Payda bir
 *    günün kitlesi, pay pencerenin gösterimi: 7 günlük pencerede frekans ~7
 *    kat büyük çıkıyor ve "frekans 3'ü geçerse durdur" kuralı ÇALIŞAN bir
 *    reklamı durduruyordu. Para harcayan hata.
 * Dönemin tekil kişi sayısını yalnız platform hesaplayabiliyor (Meta,
 * `time_increment=all_days`). İkisi aynı okuyucudan geçiyor: kota sırası,
 * önbellek ve hata dili ikinci bir kopyada unutulmasın.
 *
 * SIRA (kreatif adresi tazelemesiyle aynı, CLAUDE.md'deki kalıcı kilit
 * dersi): önce önbellek, sonra KOTA (çağrıdan ÖNCE, maliyeti sıfır ret),
 * sonra token + tek çağrı. Katman çağırandan: rapor `report_reach` (anonim
 * paylaşım bağlantısından tetiklenebiliyor, %50), kural `rule_reach`.
 *
 * HATA YUTULMUYOR, DÖNÜŞE YAZILIYOR: "okunamadı" + sebep. Çağıran bunu
 * rapor notuna ya da kural geçmişine taşıyor. Bir payda tahmin etmek (eski
 * davranış) tam da düzeltilen hatanın kendisi olurdu.
 *
 * PLATFORM ÇAĞRISI TRANSACTION'IN İÇİNDE YAPILMAMALI: çağıranlar hesap
 * bilgisini kısa bir transaction'da okuyup bu servisi DIŞARIDA çağırıyor
 * (`withTenant` 5 sn sınırı; Meta çağrısı üretimde 12 sn sürdü).
 */

/** Okunacak hesabın bilgisi — çağıran kendi istemcisiyle (RLS'li ya da değil) okuyor. */
export interface ErisimHesabi {
  id: string;
  clientId: string | null;
  platform: Platform;
  externalId: string;
  connectionId: string;
  managerExternalId: string | null;
}

export type DonemErisimiSonucu =
  /** Platform verdi. Varlık YOKSA (gösterimsiz ya da eşik altı) çağıran "okunamadı" sayar. */
  | { tur: 'olculdu'; satirlar: Map<string, PeriodReachRow> }
  /** Platform veriyor ama alınamadı: kota, token, platform hatası, sayfa sınırı. */
  | { tur: 'okunamadi'; neden: string }
  /** Platform tekil erişim vermiyor (Google, LinkedIn). */
  | { tur: 'desteklenmiyor'; neden: string };

/** Desteklemeyen platformun cümlesi (rapor dipnotu ve kural geçmişi aynı cümle). */
export function erisimYokCumlesi(platform: Platform): string {
  if (platform === 'google') return GOOGLE_ERISIM_YOK;
  return `${PLATFORM_KISA_ADLARI[platform]} tekil erişim vermiyor`;
}

/**
 * Önbellek ömrü. GEÇMİŞ dönem (bitişi iki gün önce ya da daha eski) Meta'da
 * artık değişmiyor: kural motoru her turda aynı pencereyi soruyor ve 6 saat
 * kota harcamadan yetiyor. BUGÜNÜ ya da dünü kapsayan dönem hâlâ doluyor:
 * 10 dakika, art arda gelen istekleri (anonim paylaşım sayfası) platformdan
 * yalıtmaya yetiyor ve sayı fazla bayatlamıyor.
 */
export const GECMIS_ONBELLEK_MS = 6 * 60 * 60 * 1000;
export const TAZE_ONBELLEK_MS = 10 * 60 * 1000;
/**
 * PLATFORM HATASI KISA SÜRE HATIRLANIYOR (Ajan 4 kapısı). Hata önbelleğe hiç
 * yazılmıyordu: anonim paylaşım sayfasını yenileyen bir ziyaretçi, Meta'nın
 * reddettiği (izin, silinmiş hesap) çağrıyı HER yüklemede yeniden yaptırıyor
 * ve kotayı yalnız %50 tavanı durduruyordu. Bir dakika geçici arızayı
 * dondurmuyor (saatlerce değil), art arda gelen yüklemeleri tek çağrıya
 * indiriyor. Kota reddi hatırlanmıyor: zaten maliyetsiz.
 */
export const HATA_ONBELLEK_MS = 60 * 1000;
/** Sınırsız `Map` uzun ömürlü süreçte sessizce büyüyen bir sızıntı olurdu. */
const ONBELLEK_TAVANI = 500;
/** Tek istek. Rapor senkron bir PDF isteğinin içinde; 30 sn fazla. */
const ISTEK_ZAMAN_ASIMI_MS = 8_000;

function gunEkle(gun: string, n: number): string {
  const d = new Date(`${gun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dönem kapanmış mı (iki günden eski bitiş). `simdi` test için parametre. */
export function donemKapandiMi(dateTo: string, simdi: Date): boolean {
  return dateTo <= gunEkle(simdi.toISOString().slice(0, 10), -2);
}

@Injectable()
export class DonemErisimiService {
  private readonly log = new Logger(DonemErisimiService.name);
  private readonly onbellek = new Map<string, { satirlar: Map<string, PeriodReachRow>; sonGecerlilik: number }>();
  private readonly hataOnbellegi = new Map<string, { neden: string; sonGecerlilik: number }>();
  /**
   * AYNI ANAHTARDA SÜREN ÇAĞRI PAYLAŞILIYOR: önbellek ancak cevap gelince
   * doluyor ve aynı anda açılan on paylaşım sekmesi (ya da aynı pencereyi
   * soran iki kural) on ayrı Meta çağrısı yapıyordu.
   */
  private readonly suren = new Map<string, Promise<DonemErisimiSonucu>>();

  constructor(
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
  ) {}

  /**
   * Bir hesabın, bir seviyede, bir dönem için tekil erişimi.
   * Dönüş HİÇBİR ZAMAN fırlatmıyor: hata `okunamadi` + sebep.
   */
  async oku(
    hesap: ErisimHesabi,
    istek: { seviye: InsightsLevel; from: string; to: string },
    opts: { katman: QuotaLayer; etiket: string; simdi?: Date },
  ): Promise<DonemErisimiSonucu> {
    const provider = this.providers.get(hesap.platform);
    if (!provider.fetchPeriodReach) return { tur: 'desteklenmiyor', neden: erisimYokCumlesi(hesap.platform) };

    const simdi = opts.simdi ?? new Date();
    const anahtar = `${hesap.id}|${istek.seviye}|${istek.from}|${istek.to}`;
    const kayit = this.onbellek.get(anahtar);
    if (kayit && kayit.sonGecerlilik > simdi.getTime()) return { tur: 'olculdu', satirlar: kayit.satirlar };
    const hata = this.hataOnbellegi.get(anahtar);
    if (hata && hata.sonGecerlilik > simdi.getTime()) return { tur: 'okunamadi', neden: hata.neden };
    const devam = this.suren.get(anahtar);
    if (devam) return devam;
    const is = this.platformdanOku(provider, hesap, istek, opts, anahtar, simdi).finally(() => this.suren.delete(anahtar));
    this.suren.set(anahtar, is);
    return is;
  }

  private async platformdanOku(
    provider: ReturnType<ProviderRegistry['get']>,
    hesap: ErisimHesabi,
    istek: { seviye: InsightsLevel; from: string; to: string },
    opts: { katman: QuotaLayer; etiket: string },
    anahtar: string,
    simdi: Date,
  ): Promise<DonemErisimiSonucu> {
    if (!provider.fetchPeriodReach) return { tur: 'desteklenmiyor', neden: erisimYokCumlesi(hesap.platform) };

    // ÖNCE KOTA, SONRA ÇAĞRI: ret maliyetsiz, yapı taramasına yer bırakıyor.
    const gate = await this.quota.acquire({ platform: hesap.platform, adAccountId: hesap.id, layer: opts.katman });
    if (!gate.allowed) {
      const neden = `kota engeli (${gate.reason})`;
      this.log.warn(`Dönem erişimi okunmadı (hesap ${hesap.id}, ${opts.etiket}): ${neden}`);
      return { tur: 'okunamadi', neden };
    }

    try {
      const token = await this.vault.getAccessToken(hesap.connectionId, provider);
      const sonuc = await provider.fetchPeriodReach(
        {
          accessToken: token,
          accountExternalId: hesap.externalId,
          loginCustomerId: hesap.managerExternalId ?? undefined,
          // TELEMETRİ BAĞLI: bağlanmazsa kota bekçisi bu çağrıların
          // tükettiği kotayı görmez ve korumuyormuş gibi davranır.
          onRateLimit: (snapshot) =>
            this.quota.record({
              platform: hesap.platform,
              adAccountId: hesap.id,
              clientId: hesap.clientId,
              endpoint: `${hesap.platform}:${opts.etiket}`,
              snapshot,
            }),
        },
        { level: istek.seviye, dateFrom: istek.from, dateTo: istek.to },
        { timeoutMs: ISTEK_ZAMAN_ASIMI_MS },
      );
      if (!sonuc.complete) {
        // Eksik sayfa: bulunan varlıklar doğru ama bulunmayanlar "yok" değil.
        // Hepsini "okunamadı" saymak kısmi bir doğruyu atıyor; ama hangi
        // varlığın eksik kaldığını ayırt edemeyiz, yanlış "0 kişi"den iyi.
        return { tur: 'okunamadi', neden: 'Meta yanıtı sayfa sınırında bitmedi' };
      }
      const satirlar = new Map(sonuc.rows.map((r) => [r.entityExternalId, r]));
      this.onbellegeYaz(anahtar, satirlar, donemKapandiMi(istek.to, simdi) ? GECMIS_ONBELLEK_MS : TAZE_ONBELLEK_MS, simdi);
      return { tur: 'olculdu', satirlar };
    } catch (err) {
      // HATA YALNIZ BİR DAKİKA hatırlanıyor (`HATA_ONBELLEK_MS`): geçici
      // arıza saatlerce dondurulmuyor, art arda yüklemeler platforma gitmiyor.
      const neden = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      this.log.warn(`Dönem erişimi okunamadı (hesap ${hesap.id}, ${opts.etiket}): ${neden}`);
      if (this.hataOnbellegi.size >= ONBELLEK_TAVANI) {
        const enEski = this.hataOnbellegi.keys().next();
        if (!enEski.done) this.hataOnbellegi.delete(enEski.value);
      }
      this.hataOnbellegi.set(anahtar, { neden, sonGecerlilik: simdi.getTime() + HATA_ONBELLEK_MS });
      return { tur: 'okunamadi', neden };
    }
  }

  private onbellegeYaz(anahtar: string, satirlar: Map<string, PeriodReachRow>, omur: number, simdi: Date): void {
    if (this.onbellek.size >= ONBELLEK_TAVANI) {
      const enEski = this.onbellek.keys().next();
      if (!enEski.done) this.onbellek.delete(enEski.value);
    }
    this.onbellek.set(anahtar, { satirlar, sonGecerlilik: simdi.getTime() + omur });
  }
}
