/**
 * ═══ HESABIN ÖDEME DURUMU — TEK KARAR ═══
 *
 * Aynı soru dört yerde soruluyor: uyarı bandı (Genel Bakış ve her ekranın
 * üstü), bildirim zili, ödeme maili ve Reklam Yöneticisi'nin teslimat
 * sütunu. Dördü bu dosyadaki kararı okuyor; ikinci bir "ödeme sorunu mu"
 * kararı, bandın "sorun var" derken kampanya satırının "Yayında" demesi
 * olurdu.
 *
 * ÜÇ HÂL AYRI: `bilinmiyor` ile `sorun_yok` aynı şey DEĞİL. Google'da
 * ödeme durumu ayrı bir okumayla geliyor ve o okuma hiç yapılmamış ya da
 * düşmüş olabilir; okunamayan bir hesabı "sorun yok" saymak, durmuş
 * reklamları sessizce sağlıklı göstermek demekti.
 *
 * GOOGLE'DA NE OKUNABİLİYOR (v25, googleapis proto'larından, 2026-10-19):
 *   · `customer.status` — yalnız SUSPENDED/CANCELED/CLOSED. Kartı reddedilen
 *     hesap ENABLED KALIYOR; tek başına bu alan ödeme sorununu göstermiyor
 *     (eski kod yalnız buna bakıyordu, sorunun kaynağı buydu).
 *   · `billing_setup.status` — PENDING / APPROVED_HELD / APPROVED / CANCELLED.
 *     Geçerli, onaylı bir kurulum yoksa hesap reklam yayınlayamıyor.
 *   · `account_budget` — onaylı bitiş, harcama sınırı ve harcanan tutar.
 *     Sınır dolmuş ya da süresi geçmişse reklamlar duruyor (aylık fatura
 *     ile ödeyen hesaplar).
 *   · `campaign.primary_status_reasons` içinde ödeme/fatura nedeni YOK
 *     (43 değerin hiçbiri; BUDGET_CONSTRAINED kampanya bütçesi, hesap
 *     ödemesi değil).
 *   · KART REDDİ, BAKİYE YETERSİZLİĞİ GİBİ ÖDEME PROFİLİ HÂLLERİ API'DE
 *     YOK. Bunları panel göremiyor ve "sorun yok" metni bunu söylüyor.
 */

export const ODEME_SEBEPLERI = [
  /** Meta `account_status = 3`: ödenmemiş bakiye. */
  'meta_bakiye_odenmemis',
  /** Meta `account_status = 8 / 9`: ödeme bekliyor ya da ek süre. */
  'meta_odeme_bekliyor',
  /** Google `customer.status = SUSPENDED`. */
  'google_hesap_askida',
  /** Google'da geçerli ve onaylı faturalandırma kurulumu yok. */
  'google_odeme_yontemi_yok',
  /** Google'da kurulum ya da hesap bütçesi onay bekliyor. */
  'google_fatura_onay_bekliyor',
  /** Google hesap bütçesinin harcama sınırı doldu. */
  'google_hesap_butcesi_bitti',
  /** Google hesap bütçesinin bitiş tarihi geçti, yenisi yok. */
  'google_hesap_butcesi_suresi_doldu',
] as const;
export type OdemeSebebi = (typeof ODEME_SEBEPLERI)[number];

/**
 * `ad_accounts.odeme_durumu` kolonunda duran Google okuması.
 *
 * KARAR DEĞİL HAM ÖZET SAKLANIYOR: "bütçenin süresi doldu" kararı okuma
 * anına değil BUGÜNE bağlı. Kararı yazarken saklamak, okumadan iki saat
 * sonra biten bir bütçeyi bir sonraki okumaya kadar "sorun yok" tutardı.
 */
export interface GoogleOdemeOkumasi {
  /** ISO. Okumanın yapıldığı an — ekranda bayatlık olarak görünüyor. */
  okundu: string;
  /** Okuma düştüyse platformun mesajı; o zaman listeler boş ve karar `bilinmiyor`. */
  hata: string | null;
  faturaKurulumlari: Array<{
    durum: string;
    /** Google "yyyy-MM-dd HH:mm:ss" (hesabın saat diliminde). */
    baslangic: string | null;
    bitis: string | null;
  }>;
  hesapButceleri: Array<{
    durum: string;
    baslangic: string | null;
    /** `null` + `bitisSuresiz` = FOREVER. */
    bitis: string | null;
    bitisSuresiz: boolean;
    /** Ayarlanmış (yoksa onaylı) sınır, micros, metin (BigInt JSON'a sığmıyor). */
    limitMicros: string | null;
    limitSuresiz: boolean;
    harcananMicros: string | null;
  }>;
}

export type OdemeKarari =
  | { durum: 'sorun'; sebep: OdemeSebebi }
  | { durum: 'sorun_yok' }
  | {
      durum: 'bilinmiyor';
      /**
       * `okunmadi` = ödeme okuması bu hesapta henüz hiç koşmadı.
       * `okunamadi` = koştu ama platform hata döndü (`hata` dolu).
       * `butce_yok` = kurulum onaylı ama hiç hesap bütçesi dönmedi;
       *   bu hâlin ne anlama geldiği canlıda ölçülmedi, tahmin etmiyoruz.
       * `kurulum_yok` = bütçe var ama faturalandırma kurulumu dönmedi
       *   (toplu faturalama olabilir; ölçülmedi).
       */
      neden: 'okunmadi' | 'okunamadi' | 'butce_yok' | 'kurulum_yok';
      hata?: string;
    };

/** Meta'da ÖDEME sorunu anlamına gelen kodlar. 7 (risk incelemesi) BURADA DEĞİL. */
const META_ODEME_KODLARI = new Set([3, 8, 9]);

/**
 * Meta'nın sayısal `account_status` değerini ham yanıttan okur.
 *
 * NEDEN HAM YANITTAN: normalize edilmiş durum 3, 7, 8 ve 9'u tek bir
 * `paused` değerine indiriyor; "bakiye ödenmemiş" (3) ile "risk
 * incelemesinde" (7) aynı satıra düşüyor, oysa yapılacak iş farklı.
 * `null` = okunamadı; tahmin etmiyoruz.
 */
export function metaHesapDurumu(raw: unknown): number | null {
  if (raw === null || typeof raw !== 'object') return null;
  const v = (raw as Record<string, unknown>).account_status;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Google `customer.status` ham yanıttan: 'SUSPENDED', 'CANCELED', 'CLOSED'. */
export function googleHesapDurumu(raw: unknown): string | null {
  if (raw === null || typeof raw !== 'object') return null;
  const v = (raw as Record<string, unknown>).status;
  return typeof v === 'string' && v.trim() !== '' ? v.toUpperCase() : null;
}

/**
 * Google'ın "yyyy-MM-dd HH:mm:ss" zamanını karşılaştırılabilir ana çevirir.
 *
 * SAAT DİLİMİ BİLİNMEDEN UTC sayılıyor: değer hesabın saat diliminde ve
 * İstanbul hesabında en çok 3 saat erken/geç karar demek. Bitiş tarihi
 * gün düzeyinde bir olay; saatlik kayma yanlış bir "doldu" demiyor, yalnız
 * kararı birkaç saat kaydırıyor. `NaN` = ayrıştırılamadı.
 */
function googleZamani(s: string | null): number {
  if (!s) return Number.NaN;
  return Date.parse(`${s.trim().replace(' ', 'T')}Z`);
}

/** Bir zaman aralığı ŞU ANI kapsıyor mu? Ayrıştırılamayan sınır "açık" sayılır. */
function kapsiyor(baslangic: string | null, bitis: string | null, suresiz: boolean, simdi: number): boolean {
  const b = googleZamani(baslangic);
  if (Number.isFinite(b) && b > simdi) return false;
  if (suresiz || bitis === null) return true;
  const e = googleZamani(bitis);
  return !Number.isFinite(e) || e > simdi;
}

function okumaMi(v: unknown): v is GoogleOdemeOkumasi {
  if (v === null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.okundu === 'string' && Array.isArray(o.faturaKurulumlari) && Array.isArray(o.hesapButceleri);
}

/**
 * Google ödeme okumasından karar.
 *
 * SIRA: önce ödeme yöntemi (kurulum yoksa bütçeye bakmak anlamsız), sonra
 * hesap bütçesi. Onay bekleyen bir kurulum/bütçe "yöntem yok"tan ayrı
 * yazılıyor: birinde kullanıcı kart ekleyecek, diğerinde Google'ın onayını
 * bekleyecek.
 */
export function googleOdemeKarari(okuma: unknown, simdi: Date): OdemeKarari {
  if (!okumaMi(okuma)) return { durum: 'bilinmiyor', neden: 'okunmadi' };
  if (okuma.hata) return { durum: 'bilinmiyor', neden: 'okunamadi', hata: okuma.hata };
  const t = simdi.getTime();

  const kurulumlar = okuma.faturaKurulumlari;
  /*
   * HİÇ KURULUM DÖNMEDİ AMA BÜTÇE VAR: tutarsız bir okuma. Yönetici hesaptan
   * toplu faturalanan alt hesapta kurulumun nasıl göründüğü canlıda
   * ölçülmedi; burada "ödeme yöntemi yok" demek, çalışan onlarca hesaba
   * yanlış alarm olabilirdi. Hiçbiri yoksa (yeni, hiç ödeme ayarı
   * girilmemiş hesap) hesap gerçekten reklam yayınlayamaz.
   */
  if (kurulumlar.length === 0 && okuma.hesapButceleri.length > 0) {
    return { durum: 'bilinmiyor', neden: 'kurulum_yok' };
  }
  const gecerliKurulum = kurulumlar.some(
    (k) => k.durum === 'APPROVED' && kapsiyor(k.baslangic, k.bitis, false, t),
  );
  if (!gecerliKurulum) {
    const bekleyen = kurulumlar.some((k) => k.durum === 'PENDING' || k.durum === 'APPROVED_HELD');
    return { durum: 'sorun', sebep: bekleyen ? 'google_fatura_onay_bekliyor' : 'google_odeme_yontemi_yok' };
  }

  const butceler = okuma.hesapButceleri;
  if (butceler.length === 0) return { durum: 'bilinmiyor', neden: 'butce_yok' };

  const onayli = butceler.filter((b) => b.durum === 'APPROVED');
  const gecerli = onayli.filter((b) => kapsiyor(b.baslangic, b.bitis, b.bitisSuresiz, t));
  if (gecerli.length === 0) {
    // Başlangıcı gelecekte olan onaylı bütçe = sıradaki dönem; o da yayını
    // bugün açmıyor ama "süresi doldu" demek yanlış olurdu.
    const bitmis = onayli.some((b) => {
      const e = googleZamani(b.bitis);
      return !b.bitisSuresiz && Number.isFinite(e) && e <= t;
    });
    if (bitmis) return { durum: 'sorun', sebep: 'google_hesap_butcesi_suresi_doldu' };
    return { durum: 'sorun', sebep: 'google_fatura_onay_bekliyor' };
  }

  /*
   * SINIR DOLDU MU — geçerli bütçelerin HEPSİ dolmuşsa. Biri bile sınırsız ya
   * da kalanı varsa hesap harcayabiliyor. Sayı okunamıyorsa (`null`) dolmuş
   * SAYILMIYOR: yanlış bir ödeme uyarısı kullanıcıyı olmayan bir borcu
   * aramaya gönderir.
   */
  const hepsiDolmus = gecerli.every((b) => {
    if (b.limitSuresiz || b.limitMicros === null || b.harcananMicros === null) return false;
    try {
      return BigInt(b.harcananMicros) >= BigInt(b.limitMicros);
    } catch {
      return false;
    }
  });
  if (hepsiDolmus) return { durum: 'sorun', sebep: 'google_hesap_butcesi_bitti' };

  return { durum: 'sorun_yok' };
}

/** Kararın platformdan bağımsız girdisi — `ad_accounts` satırından. */
export interface OdemeHesabi {
  platform: string;
  /** `ad_accounts.raw` (Meta `account_status`, Google `status`). */
  raw: unknown;
  /** `ad_accounts.odeme_durumu` (yalnız Google). */
  odemeDurumu: unknown;
}

/**
 * Hesabın ödeme kararı — platform fark etmeksizin.
 *
 * Meta'da karar `account_status`tan: okunamıyorsa `bilinmiyor`. LinkedIn'de
 * ödeme okuması yok (`bilinmiyor`/`okunmadi`).
 */
export function hesapOdemeKarari(h: OdemeHesabi, simdi: Date): OdemeKarari {
  if (h.platform === 'meta') {
    const kod = metaHesapDurumu(h.raw);
    if (kod === null) return { durum: 'bilinmiyor', neden: 'okunmadi' };
    if (!META_ODEME_KODLARI.has(kod)) return { durum: 'sorun_yok' };
    return { durum: 'sorun', sebep: kod === 3 ? 'meta_bakiye_odenmemis' : 'meta_odeme_bekliyor' };
  }
  if (h.platform === 'google') {
    // ASKIYA ALINMIŞ HESAP ÖNCE: o hâlde fatura kurulumu sağlam görünse de
    // reklam yayınlanmıyor ve yapılacak iş (Google'a başvurmak) farklı.
    if (googleHesapDurumu(h.raw) === 'SUSPENDED') return { durum: 'sorun', sebep: 'google_hesap_askida' };
    return googleOdemeKarari(h.odemeDurumu, simdi);
  }
  return { durum: 'bilinmiyor', neden: 'okunmadi' };
}

/**
 * Platformun ödeme ekranı — "ne yapmalı" bağlantısı.
 *
 * Google adresi HESABA ÖZEL DEĞİL: hesabı adreste seçen parametrenin (ocid)
 * müşteri kimliğiyle ilgisi yok ve tahmin edilen bir parametre yanlış hesabı
 * açabilir. Kullanıcı hesabı Google'ın kendi seçicisinden seçiyor; metin
 * hesap numarasını söylüyor. Meta'nın faturalandırma merkezi `asset_id`
 * ile hesabı açıyor. İki adres de canlıda tıklanarak DOĞRULANMADI.
 */
export function odemeEkraniAdresi(platform: string, externalId: string | null): string | null {
  if (platform === 'google') return 'https://ads.google.com/aw/billing/summary';
  if (platform === 'meta') {
    const id = (externalId ?? '').replace(/^act_/, '');
    return id
      ? `https://business.facebook.com/billing_hub/payment_settings/?asset_id=${encodeURIComponent(id)}`
      : 'https://business.facebook.com/billing_hub/payment_settings/';
  }
  return null;
}

/** Google müşteri kimliği ekranda "123-456-7890" biçiminde. */
export function googleMusteriNumarasi(id: string): string {
  const d = id.replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : id;
}
