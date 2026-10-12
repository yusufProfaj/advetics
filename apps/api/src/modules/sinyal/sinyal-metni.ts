import { createHash } from 'node:crypto';
import {
  ANOMALI,
  ANOMALI_METRIK_TANIMI,
  SAGLIK,
  SAGLIK_KONTROL_TANIMI,
  googleYazilamazMi,
  sinyalEylemTuru,
  type AnomaliMetrigi,
  type AnomaliYonu,
  type Platform,
  type Sinyal,
  type SinyalDegeri,
  type SinyalDurumu,
  type SinyalEylemi,
  type SinyalKapatmaNedeni,
  type SinyalKodu,
  type SinyalSerisi,
  type SinyalSeviyesi,
  type SinyalTuru,
} from '@advetics/shared';

/**
 * ═══ SİNYALİN CÜMLESİ — TEK ÜRETİCİ ═══
 *
 * Ekrandaki kart, sabah özeti (e-posta/Slack/Teams) ve Genel Bakış aynı
 * cümleyi buradan alıyor. Sayılar ŞABLONDAN; yapay zekâ metin yazmıyor
 * (MIMARI § 7: model sayı uydurmasın). İki yerde ayrı yazılan cümle ilk
 * değişiklikte ayrışır ve kullanıcı Slack'te başka, panelde başka bir rakam
 * görür.
 */

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUN_ADLARI = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];

/** `2026-10-12` → `12 Ekim`. Date'e çevirmeden (saat dilimi kayması). */
export function gunMetni(gun: string): string {
  const [, a, g] = gun.split('-');
  return `${Number(g)} ${AYLAR[Number(a) - 1] ?? ''}`.trim();
}

function haftaGunu(gun: string): string {
  return GUN_ADLARI[new Date(`${gun}T00:00:00Z`).getUTCDay()] ?? '';
}

const sayiBicim = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

/** Para birimi kodu tanınmazsa (bozuk veri) çökmeden kodla yaz. */
function paraMetni(n: number, paraBirimi: string): string {
  const kesir = Math.abs(n) >= 100 ? 0 : 2;
  try {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: paraBirimi.trim(),
      minimumFractionDigits: kesir,
      maximumFractionDigits: kesir,
    }).format(n);
  } catch {
    return `${n.toFixed(kesir)} ${paraBirimi}`;
  }
}

export function degerMetni(kod: SinyalKodu, n: number, paraBirimi: string): string {
  if (!(kod in ANOMALI_METRIK_TANIMI)) return sayiBicim.format(n);
  const birim = ANOMALI_METRIK_TANIMI[kod as AnomaliMetrigi].birim;
  if (birim === 'para') return paraMetni(n, paraBirimi);
  if (birim === 'oran') {
    return `%${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(n * 100)}`;
  }
  return sayiBicim.format(n);
}

function deger(kod: SinyalKodu, n: number | null, paraBirimi: string): SinyalDegeri | null {
  return n === null || !Number.isFinite(n) ? null : { sayi: n, metin: degerMetni(kod, n, paraBirimi) };
}

/** "2,1 kat" ya da "%-64". Orta sıfırsa yalnız yön. */
export function sapmaMetni(gozlenen: number | null, orta: number | null): string | null {
  if (gozlenen === null || orta === null) return null;
  if (orta === 0) return gozlenen > 0 ? 'sıfırdan yukarı' : null;
  const oran = gozlenen / orta;
  if (oran >= 1.5) return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(oran)} kat`;
  const yuzde = Math.round((oran - 1) * 100);
  return `%${yuzde > 0 ? '+' : ''}${yuzde}`;
}

export interface SinyalCumleGirdisi {
  tur: SinyalTuru;
  kod: SinyalKodu;
  yon: AnomaliYonu | null;
  gun: string;
  gozlenen: number | null;
  orta: number | null;
  alt: number | null;
  ust: number | null;
  nokta: number | null;
  paraBirimi: string;
  kanit: Record<string, unknown>;
}

/** Tek cümle, sade, uzun tire yok. */
export function sinyalBasligi(s: SinyalCumleGirdisi): string {
  if (s.tur === 'saglik') return SAGLIK_KONTROL_TANIMI[s.kod as keyof typeof SAGLIK_KONTROL_TANIMI].ad;
  const ad = ANOMALI_METRIK_TANIMI[s.kod as AnomaliMetrigi].ad;
  if (s.gozlenen === 0 && s.yon === 'dusus') return `${ad} sıfıra düştü`;
  if (s.gozlenen !== null && s.orta !== null && s.orta > 0) {
    const oran = s.gozlenen / s.orta;
    if (s.yon === 'artis' && oran >= 1.5) {
      return `${ad} beklenenin ${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(oran)} katı`;
    }
    const yuzde = Math.abs(Math.round((oran - 1) * 100));
    return `${ad} beklenenden %${yuzde} ${s.yon === 'artis' ? 'yüksek' : 'düşük'}`;
  }
  return `${ad} beklenen aralığın ${s.yon === 'artis' ? 'üstünde' : 'altında'}`;
}

/** Neden + ne yapılır. */
export function sinyalNedeni(s: SinyalCumleGirdisi): string {
  if (s.tur === 'anomali') {
    const tanim = ANOMALI_METRIK_TANIMI[s.kod as AnomaliMetrigi];
    const g = s.gozlenen === null ? '-' : degerMetni(s.kod, s.gozlenen, s.paraBirimi);
    const alt = s.alt === null ? '-' : degerMetni(s.kod, s.alt, s.paraBirimi);
    const ust = s.ust === null ? '-' : degerMetni(s.kod, s.ust, s.paraBirimi);
    const parca = [
      `${gunMetni(s.gun)} günü ${g} oldu; son ${s.nokta ?? ANOMALI.gecmisHafta} ${haftaGunu(s.gun)} ${alt} ile ${ust} arasındaydı.`,
    ];
    if (tanim.gecikmeli) parca.push(`Dönüşüm verisi geç kesinleştiği için ${ANOMALI.donusumGecikmesiGun} gün önceki veri değerlendirildi.`);
    return parca.join(' ');
  }
  if (s.kod === 'sifir_gosterim') {
    return `Platformda etkin ama son ${SAGLIK.sifirGosterimGun} günde hiç gösterim almadı. Bütçe, teklif, hedef kitle ve onay durumuna bak.`;
  }
  if (s.kod === 'reklam_onaysiz') {
    const sorunlar = Array.isArray(s.kanit.sorunlar) ? (s.kanit.sorunlar as Array<{ topic?: string }>) : [];
    const konular = sorunlar.map((x) => x.topic).filter((x): x is string => typeof x === 'string');
    return konular.length > 0
      ? `Platformun gerekçesi: ${konular.slice(0, 3).join(', ')}. Reklamı düzeltip yeniden incelemeye gönder.`
      : 'Platform reklamı reddetti ya da kısıtladı. Reklamı düzeltip yeniden incelemeye gönder.';
  }
  // ── Paket F1 (veri-kaynagi-saglik.ts) ──
  if (s.kod === 'ga4_anahtar_etkinlik_yok') {
    return 'Analytics mülkünde hiç anahtar etkinlik tanımlı değil; site dönüşümleri sayılamıyor. Form gönderimi, arama gibi olayları anahtar etkinlik yap.';
  }
  if (s.kod === 'ga4_veri_gelmiyor') {
    const t = Number(s.kanit.tiklama ?? 0);
    return `Son ${SAGLIK.ga4SessizGun} günde reklamlar ${sayiBicim.format(t)} tıklama aldı ama Analytics hiç oturum kaydetmedi. Sitedeki Analytics etiketi kaldırılmış ya da kırık olabilir.`;
  }
  if (s.kod === 'takip_acigi') {
    const pd = Number(s.kanit.platformDonusum ?? 0);
    const sd = Number(s.kanit.siteDonusum ?? 0);
    const etiket = String(s.kanit.etiket ?? '');
    const ek =
      etiket === 'site_fazla'
        ? 'Platform dönüşümü eksik sayıyor; piksel ya da dönüşüm işlemi eksik olabilir.'
        : 'Site bu kampanyadan geleni eksik görüyor; Analytics etiketi ya da reklam bağlantısındaki etiket düşüyor olabilir.';
    return `Son ${SAGLIK.kaynakPencereGun} günde platform ${sayiBicim.format(pd)}, site ${sayiBicim.format(sd)} dönüşüm saydı. ${ek}`;
  }
  if (s.kod === 'utm_eksik') {
    const pay = Number(s.kanit.pay ?? 0);
    return `Son ${SAGLIK.kaynakPencereGun} günde bu platformdan gelen ücretli oturumların %${Math.round(pay * 100)}'inde kampanya etiketi (utm_campaign) yok; site dönüşümleri kampanyaya bağlanamıyor. Reklam bağlantılarına kampanya etiketi ekle.`;
  }
  const p = s.kanit.pencere as { gosterim?: number } | undefined;
  const o = s.kanit.onceki as { donusum?: number } | undefined;
  return (
    `Son ${SAGLIK.donusumPencereGun} günde ${sayiBicim.format(p?.gosterim ?? 0)} gösterim var ama hiç dönüşüm kaydedilmedi; ` +
    `önceki ${SAGLIK.donusumOncekiGun} günde ${sayiBicim.format(o?.donusum ?? 0)} dönüşüm vardı. Dönüşüm etiketini (pixel, Google etiketi) kontrol et.`
  );
}

/**
 * ONAY ÖZETİ: `id + durum + sonGorulme + eylem`in sha256'sı (sözleşme).
 * Uygula bunu taşır; sunucu satırı yeniden okuyup karşılaştırır.
 */
export function sinyalOzeti(id: string, durum: SinyalDurumu, sonGorulme: string, eylem: SinyalEylemi | null): string {
  return createHash('sha256').update(`${id}|${durum}|${sonGorulme}|${JSON.stringify(eylem)}`).digest('hex');
}

/** Liste sorgusunun satırı. */
export interface SinyalSatiri {
  id: string;
  anahtar: string;
  tur: SinyalTuru;
  kod: SinyalKodu;
  yon: AnomaliYonu | null;
  platform: Platform;
  client_id: string;
  client_adi: string | null;
  ad_account_id: string;
  hesap_adi: string | null;
  seviye: SinyalSeviyesi;
  varlik_id: string;
  varlik_adi: string;
  ust_adi: string | null;
  gun: string;
  gozlenen: number | null;
  beklenen_alt: number | null;
  beklenen_orta: number | null;
  beklenen_ust: number | null;
  nokta: number | null;
  onem: 'yuksek' | 'orta';
  para_birimi: string;
  kanit: Record<string, unknown> | null;
  durum: SinyalDurumu;
  ilk_gorulme: Date | string;
  son_gorulme: Date | string;
  son_acilma: Date | string;
  acilma_sayisi: number;
  kapatma_nedeni: SinyalKapatmaNedeni | null;
  kapatan_adi: string | null;
  kapatma_zamani: Date | string | null;
  kapatma_notu: string | null;
  /** Kampanyanın kanalı (Google VIDEO yazılamaz); kampanya dışı seviyede üst kampanyanınki. */
  kampanya_kanali: string | null;
}

/**
 * Sinyalin açılan sayısal kolonları. `numeric` sürücüden dize gelebiliyor;
 * `float8`e çevirme sorguda (`SINYAL_SECIMI`), burada savunma.
 */
function sayi(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function iso(v: Date | string): string {
  return (v instanceof Date ? v : new Date(v)).toISOString();
}

/** Satırdan eylem + kısıt. */
export function eylemVeKisit(r: Pick<SinyalSatiri, 'kod' | 'yon' | 'seviye' | 'varlik_id' | 'platform' | 'kampanya_kanali' | 'client_id'>): {
  eylem: SinyalEylemi | null;
  kisit: string | null;
} {
  const tur = sinyalEylemTuru(r.kod, r.yon, r.seviye);
  if (tur === null) return { eylem: null, kisit: null };
  if (tur === 'olcum') return { eylem: { tur: 'olcum', clientId: r.client_id }, kisit: null };
  if (tur === 'incele') return { eylem: { tur: 'incele', seviye: r.seviye, varlikId: r.varlik_id }, kisit: null };
  // DURDUR: yazılamayan platformda düğme YOK, sebebi yazılı (sözleşme:
  // eylem null + kisit). Sessizce düşen düğme "neden durduramıyorum" sorusunu
  // cevapsız bırakırdı.
  if (r.platform === 'linkedin') {
    return {
      eylem: null,
      kisit: "LinkedIn'de Advetics'ten durdurma yok; kampanyayı Campaign Manager'dan durdurman gerekiyor.",
    };
  }
  if (googleYazilamazMi(r.platform, r.kampanya_kanali)) {
    return {
      eylem: null,
      kisit: "Google, YouTube (Video) kampanyalarında API'den değişikliğe izin vermiyor; Google Ads'ten durdurman gerekiyor.",
    };
  }
  if (r.seviye === 'account') return { eylem: null, kisit: null };
  return { eylem: { tur: 'durdur', seviye: r.seviye, varlikId: r.varlik_id }, kisit: null };
}

export function satirdanSinyal(r: SinyalSatiri): Sinyal {
  const kanit = r.kanit ?? {};
  const gozlenen = sayi(r.gozlenen);
  const alt = sayi(r.beklenen_alt);
  const orta = sayi(r.beklenen_orta);
  const ust = sayi(r.beklenen_ust);
  const nokta = sayi(r.nokta);
  const cumle: SinyalCumleGirdisi = {
    tur: r.tur,
    kod: r.kod,
    yon: r.yon,
    gun: r.gun,
    gozlenen,
    orta,
    alt,
    ust,
    nokta,
    paraBirimi: r.para_birimi,
    kanit,
  };
  const { eylem, kisit } = eylemVeKisit(r);
  const sonGorulme = iso(r.son_gorulme);
  const seri = (kanit.seri as SinyalSerisi | undefined) ?? null;
  return {
    id: r.id,
    anahtar: r.anahtar,
    tur: r.tur,
    kod: r.kod,
    yon: r.yon,
    platform: r.platform,
    clientId: r.client_id,
    clientAdi: r.client_adi ?? 'Adı görünmeyen workspace',
    adAccountId: r.ad_account_id,
    adAccountAdi: r.hesap_adi ?? 'Adı görünmeyen hesap',
    varlik: { seviye: r.seviye, id: r.varlik_id, ad: r.varlik_adi, ustAd: r.ust_adi },
    baslik: sinyalBasligi(cumle),
    neden: sinyalNedeni(cumle),
    gun: r.gun,
    gozlenen: deger(r.kod, gozlenen, r.para_birimi),
    beklenen:
      alt !== null && ust !== null
        ? { alt: deger(r.kod, alt, r.para_birimi)!, ust: deger(r.kod, ust, r.para_birimi)!, nokta: nokta ?? 0 }
        : null,
    sapmaMetni: r.tur === 'anomali' ? sapmaMetni(gozlenen, orta) : null,
    onem: r.onem,
    durum: r.durum,
    ilkGorulme: iso(r.ilk_gorulme),
    sonGorulme,
    sonAcilma: iso(r.son_acilma),
    acilmaSayisi: Number(r.acilma_sayisi),
    kapatma:
      r.kapatma_nedeni && r.kapatma_zamani
        ? { neden: r.kapatma_nedeni, kim: r.kapatan_adi, zaman: iso(r.kapatma_zamani), not: r.kapatma_notu }
        : null,
    eylem,
    kisit,
    seri,
    ozet: sinyalOzeti(r.id, r.durum, sonGorulme, eylem),
  };
}
