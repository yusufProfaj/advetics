import type { KurulumPlatformu } from '../kurulum';
import { KURULUM_BEYAN_OGESI_ADI, beyanVarMi, type KurulumBeyani } from '../kurulum/beyan';
import type { ConnectionSummary, ProviderAvailability } from '../schemas/connection.schema';
import { PANEL_YERLERI } from './adresler';
import { birlesikDurum, type KurulumListesiDurumu, type KurulumListesiParcasi, type KurulumSayaci } from './kurulum-listesi';

/**
 * ═══ ŞİRKET KURULUMU — İKİ ADIM (docs/kurulum-sihirbazi/MIMARI.md § 2a) ═══
 *
 * Workspace listesi (`KURULUM_LISTESI`) "bu proje reklama hazır mı"yı
 * cevaplıyor; bazı işler ise ŞİRKETİN: platform bağlantısı ve iki adımlı
 * doğrulama kararı. Workspace listesine koymak, aynı şirket işini her
 * workspace'te ayrı "eksik" diye saymak olurdu. Sayaç AYNI fonksiyon
 * (`kurulumSayaci`), durum sözlüğü AYNI (`KURULUM_LISTESI_DURUMLARI`).
 *
 * ═══ AJANSIN BAĞLANTISI BİR KEZ KURULUR — "Bağla" ÇİZİLMEZ ═══
 *
 * Ölçüldü (2026-10-13, kaynak okundu): `GET /connections` PARAMETRESİZ
 * çağrıldığında servis yalnız `status <> 'revoked'` süzüyor, şirket süzgeci
 * RLS'te (`adv_connections_select` → `app.havuz_kapsaminda`: kendi şirketi
 * + AJANS şirketi). Yani müşteri şirketinde ajansın bağlantısı GÖRÜNÜYOR ve
 * yanıtta `sahip: 'ajans'` taşıyor. Aynı kimliği o şirkette yeniden
 * bağlamak da artık sunucuda reddediliyor (`ayniKimlikBaskaSatirda`,
 * a11ca4a6). Bu yüzden: görünür ETKİN bir bağlantı varsa adım TAMAM ve
 * "Bağla" eylemi ÜRETİLMEZ — ajansın kimliğini şirket başına yeniden
 * yetkilendirmek önceki token'ı geçersiz kılıp bağlantıları koparıyordu.
 *
 * İKİ TUZAK (çağıran için):
 *   · `?clientId=` ile çağırma. O dal bağlantıyı "bu workspace'e ait ya da
 *     altında bu workspace'e atanmış hesap var" diye süzüyor; YENİ bir
 *     workspace'te ajansın bağlantısı orada GÖRÜNMEZ ve adım "bağlantı yok"
 *     derdi. Girdi parametresiz listeden gelmeli.
 *   · `sahip` alanı üst hesap üyeliği olmayan kullanıcıda her zaman
 *     `'sirket'` (ajans şirketi bilinmiyor). Bu yüzden TAMAM kararı `sahip`e
 *     BAKMAZ; `sahip` yalnız metni ve "yetkisi düştü" eylemini seçer.
 */

export const SIRKET_KURULUM_LISTESI = [
  { kod: 'baglantilar', ad: 'Platform bağlantıları' },
  { kod: 'guvenlik', ad: 'Ekip ve güvenlik' },
] as const;
export type SirketKurulumKodu = (typeof SIRKET_KURULUM_LISTESI)[number]['kod'];

/**
 * Parçanın tek eylemi — panel düğmeyi buna göre çizer.
 *   · `bagla`               — şirketin KENDİ bağlantısını kurması (OAuth).
 *   · `yeniden_yetkilendir` — şirketin kendi bağlantısının yetkisi düşmüş.
 *   · `ajansa_haber`        — ajansın bağlantısının yetkisi düşmüş; şirket
 *                             ekranı yeniden yetkilendirme SUNMAZ (yanlış
 *                             kişinin token'ı ajansın satırına yazılırdı).
 *   · `advetics_ekibine`    — sunucuda platform ayarı yok.
 *   · `zorunlu_ac`          — iki adımlı doğrulamayı zorunlu yap ya da beyan et.
 */
export type SirketKurulumEylemi = 'bagla' | 'yeniden_yetkilendir' | 'ajansa_haber' | 'advetics_ekibine' | 'zorunlu_ac';

export interface SirketKurulumParcasi extends Omit<KurulumListesiParcasi, 'kaynak'> {
  kaynak: 'baglanti' | 'guvenlik';
  eylem: SirketKurulumEylemi | null;
}

export interface SirketKurulumAdimi {
  kod: SirketKurulumKodu;
  ad: string;
  durum: KurulumListesiDurumu;
  parcalar: SirketKurulumParcasi[];
}

export interface SirketKurulumGirdisi {
  /** PARAMETRESİZ `GET /connections` (yukarıdaki tuzak); `null` = okunamadı. */
  baglantilar: ReadonlyArray<Pick<ConnectionSummary, 'platform' | 'status' | 'sahip'>> | null;
  /** `GET /connections/availability`; `null` = okunamadı. */
  uygunluk: ReadonlyArray<Pick<ProviderAvailability, 'platform' | 'configured'>> | null;
  /**
   * Şirkette kullanılan platformlar: en az bir workspace'i o platformu
   * kullanıyorsa (beyanla kapatmamışsa) sayılır. Hiçbir workspace Google
   * kullanmıyorsa şirketten Google bağlantısı istemek yanlış alarm.
   */
  kullanilanPlatformlar: readonly KurulumPlatformu[];
  /** Şirketin 2FA zorunluluğu; `null` = okunamadı (yönetici olmayan okuyamıyor olabilir). */
  ikiAdimZorunlu: boolean | null;
  /** Şirket düzeyi beyanlar (`client_id IS NULL`); `null` = okunamadı. */
  beyanlar: readonly KurulumBeyani[] | null;
}

const PLATFORM_ADI: Record<KurulumPlatformu, string> = { meta: 'Meta', google: 'Google Ads' };
const OKUNAMADI = 'Bu bilgi okunamadı; sayfayı yenile ya da birazdan tekrar bak.';

function baglantiParcasi(platform: KurulumPlatformu, g: SirketKurulumGirdisi): SirketKurulumParcasi {
  const ad = PLATFORM_ADI[platform];
  const temel = { kaynak: 'baglanti' as const, kod: platform, baslik: null };
  if (g.baglantilar === null || g.uygunluk === null) return { ...temel, durum: 'bilinmiyor', neden: OKUNAMADI, eylem: null };
  if (!g.uygunluk.find((u) => u.platform === platform)?.configured) {
    return { ...temel, durum: 'hata', neden: `${ad} bağlantısı için sunucu ayarı eksik; Advetics ekibine haber ver.`, eylem: 'advetics_ekibine' };
  }
  const bu = g.baglantilar.filter((b) => b.platform === platform && b.status !== 'revoked');
  const etkin = bu.find((b) => b.status === 'active');
  if (etkin) {
    return {
      ...temel,
      durum: 'tamam',
      baslik: etkin.sahip === 'ajans' ? 'Ajansın bağlantısı' : 'Şirketin bağlantısı',
      neden: etkin.sahip === 'ajans' ? `${ad}: ajansın bağlantısı bu şirkete de hizmet ediyor.` : `${ad} bağlı.`,
      eylem: null,
    };
  }
  const bozuk = bu[0];
  if (bozuk) {
    return bozuk.sahip === 'ajans'
      ? { ...temel, durum: 'hata', neden: `${ad}: ajansın bağlantısının yetkisi düşmüş; ajans yöneticisi ${PANEL_YERLERI.platformBaglantilari} ekranından yeniler.`, eylem: 'ajansa_haber' }
      : { ...temel, durum: 'hata', neden: `${ad} bağlantısının yetkisi düşmüş; yeniden yetkilendir.`, eylem: 'yeniden_yetkilendir' };
  }
  return { ...temel, durum: 'eksik', neden: `${ad} bağlı değil. Şirketin kendi ${ad} hesabıyla bağlan ya da ajansından bağlantıyı iste.`, eylem: 'bagla' };
}

function ikiAdimParcasi(g: SirketKurulumGirdisi): SirketKurulumParcasi {
  const temel = { kaynak: 'guvenlik' as const, kod: 'iki_adim', baslik: null };
  if (g.ikiAdimZorunlu === true) return { ...temel, durum: 'tamam', neden: 'İki adımlı doğrulama zorunlu.', eylem: null };
  if (g.ikiAdimZorunlu === null) return { ...temel, durum: 'bilinmiyor', neden: OKUNAMADI, eylem: null };
  /*
   * YÖNETİCİ BEYANI YETERLİ (kullanıcı kararı, 2026-10-13): kapalı kalması
   * meşru bir karar; eksik olan kararın VERİLMEMİŞ olması.
   */
  const var_ = beyanVarMi(g.beyanlar, 'iki_adim');
  if (var_ === null) return { ...temel, durum: 'bilinmiyor', neden: OKUNAMADI, eylem: null };
  if (var_) {
    const b = g.beyanlar!.find((x) => x.oge === 'iki_adim')!;
    const kim = b.beyanEden ? `${b.beyanEden.ad}, ` : '';
    return { ...temel, durum: 'kapsam_disi', neden: `Kapsam dışı (${kim}${b.tarih.slice(0, 10)}) · ${KURULUM_BEYAN_OGESI_ADI.iki_adim}.`, beyan: b, eylem: null };
  }
  return {
    ...temel,
    durum: 'eksik',
    neden: 'İki adımlı doğrulama zorunlu değil ve bu konuda karar verilmemiş. Zorunlu yap ya da "zorunlu tutmuyoruz" de.',
    eylem: 'zorunlu_ac',
  };
}

/**
 * `GET /kurulum/sirket` yanıtı (Ajan 2 sapması — sözleşmede uç vardı, tip
 * yoktu; MIMARI § 7). Bağlantılar BURADA DEĞİL: girdi PARAMETRESİZ
 * `GET /connections` ve `/connections/availability`ten (yukarıdaki tuzak);
 * ikinci bir bağlantı özeti, aynı soruya iki cevap demekti.
 */
export interface SirketKurulumYaniti {
  orgId: string;
  sirketAdi: string;
  /** `organizations.iki_adim_zorunlu`; `null` = okunamadı. */
  ikiAdimZorunlu: boolean | null;
  /** Şirket düzeyi beyanlar (`client_id IS NULL`). */
  beyanlar: KurulumBeyani[];
  /**
   * Şirketin arşivlenmemiş workspace'leri — yalnız ad/id ve platform beyanı;
   * sayaçlar başlangıç ekranında tembel okunur (MIMARI § 7).
   */
  workspaceler: Array<{ id: string; ad: string; kullanilmayanPlatformlar: KurulumPlatformu[] }>;
  /**
   * En az bir workspace'in kullandığı (beyanla kapatmadığı) platformlar —
   * `SirketKurulumGirdisi.kullanilanPlatformlar`. Hiç workspace yoksa İKİSİ:
   * beyan yok = hepsi sayılır.
   */
  kullanilanPlatformlar: KurulumPlatformu[];
}

/** İki adımı kurar. Kullanılan platform yoksa bağlantı adımı `kullanilmiyor`. */
export function sirketKurulumListesi(g: SirketKurulumGirdisi): SirketKurulumAdimi[] {
  const platformlar = (['meta', 'google'] as const).filter((p) => g.kullanilanPlatformlar.includes(p));
  const baglanti = platformlar.map((p) => baglantiParcasi(p, g));
  const guvenlik = [ikiAdimParcasi(g)];
  return [
    {
      kod: 'baglantilar',
      ad: SIRKET_KURULUM_LISTESI[0].ad,
      durum: baglanti.length === 0 ? 'kullanilmiyor' : birlesikDurum(baglanti),
      parcalar: baglanti,
    },
    { kod: 'guvenlik', ad: SIRKET_KURULUM_LISTESI[1].ad, durum: birlesikDurum(guvenlik), parcalar: guvenlik },
  ];
}

/**
 * Sihirbazın "hiç eksik yok" hükmü: şirket VE workspace sayacı birlikte.
 * Ayrı bir hüküm fonksiyonu yazılmıyor; iki sayaç da `kurulumSayaci`ndan.
 */
export function hicEksikYok(sirket: KurulumSayaci, workspace: KurulumSayaci): boolean {
  return sirket.bitti && workspace.bitti;
}
