import type {
  Dil,
  BildirimGonderimi,
  BildirimKanali,
  BildirimOlayi,
  HesapSinyalDurumu,
  HesapSinyalOzeti,
  KanalDurumu,
  KanalOlusturGirdisi,
  KanalTuru,
  Platform,
  SaglikDisaridaKodu,
  Sinyal,
  SinyalBosNedeni,
  SinyalListesi,
  SinyalSerisi,
  SinyalUygulamaSonucu,
  TeslimDurumu,
} from '@advetics/shared';
import {
  ALICI_UST_SINIRI,
  ANOMALI,
  ANOMALI_METRIK_TANIMI,
  BILDIRIM_OLAYI_ADI,
  KANAL_TURU_ADI,
  PLATFORM_KISA_ADLARI,
  SAGLIK_DISARIDA,
  SAGLIK_KOSULLU_DISARIDA,
  TESLIM_DURUMLARI,
  aliciAyristir,
  kanalOlusturSchema,
  sinyalGecisi,
  sec,
  webhookDenetle,
} from '@advetics/shared';
import { sinyalSozlugu } from '@/dil/sozlukler/iyilestir-sinyal';
import { baglanti } from '@/lib/baglanti';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';
import { markaMerkeziAdresi } from '@/lib/panel-adresleri';

/**
 * ═══ SİNYALLER + BİLDİRİMLER: EKRANIN SAF KARARLARI (Paket A, Ajan 3) ═══
 *
 * Sözleşme `packages/shared/src/sinyal`, ekran `docs/sinyal/taslak.html`,
 * gerekçeler `docs/sinyal/MIMARI.md` § 9. Panelde bileşen render eden test
 * altyapısı yok (bilinçli); kutunun hangi hâlde çizileceği, satırın ne
 * diyeceği, hangi düğmenin çıkacağı ve bağlantının nereye gideceği burada
 * ve `sinyal.spec.ts` onları ÇALIŞTIRARAK sınıyor. JSX içinde kalsalardı
 * yalnızca kaynak taramasıyla sınanabilirlerdi ve tarama yanlış şeyi
 * kilitleyebilirdi (CLAUDE.md "REACT EFFECT'İNİN İÇİNDEKİ KARAR").
 */

// ─── Liste çağrısı ───────────────────────────────────────────────────────────

/**
 * Ekranın iki görünümü. Sözleşmenin `durum` süzgeci ile AYNI iki değer:
 * "kapalı" iki durumu (`kapatildi`, `kendiliginden_kapandi`) birlikte
 * getiriyor, ayrımı satırın rozeti söylüyor.
 */
export type SinyalGorunumu = 'acik' | 'kapali';

export interface SinyalSorgusu {
  clientId: string;
  gorunum: SinyalGorunumu;
  tur: 'anomali' | 'saglik' | null;
  platform: Platform | null;
  sayfa: number;
}

/** Liste ucunun adresi; elle birleştirme yok (CLAUDE.md "bağlantıyı elle birleştirme"). */
export function sinyalListeYolu(q: SinyalSorgusu): string {
  return baglanti('/sinyaller', {
    clientId: q.clientId,
    durum: q.gorunum,
    tur: q.tur ?? undefined,
    platform: q.platform ?? undefined,
    sayfa: q.sayfa > 1 ? String(q.sayfa) : undefined,
  });
}

export function sinyalEylemYolu(id: string, eylem: 'kapat' | 'geri-ac' | 'uygula'): string {
  return `/sinyaller/${encodeURIComponent(id)}/${eylem}`;
}

/**
 * Sunucu bileşeninin ya da istemcinin elindeki sonuç. Çağrı düşerse BOŞ
 * LİSTE DEĞİL, sebebiyle bir hata: boş liste "sinyal yok" demek ve düşen
 * bir çağrıyı "her şey yolunda"ya çevirirdi (`.catch(() => setX([]))`
 * yasağının sebebi).
 */
export type SinyalSonucu = { durum: 'tamam'; liste: SinyalListesi } | { durum: 'hata'; mesaj: string };

/**
 * Liste kutusunun hâli. BEŞ HÂL AYRI:
 * - `yukleniyor`: istek sürüyor (süzgeç değişti),
 * - `hata`: çağrı düştü; sunucunun cümlesi ekranda,
 * - `olcum_donemi`: sessiz koşum ve bu kullanıcıya liste gösterilmiyor
 *   (boş liste "sinyal yok" sanılmasın diye bayrak AYRI, sözleşme notu),
 * - `bos`: neden `emptyReason`dan,
 * - `dolu`.
 */
export type SinyalKutuHali = 'yukleniyor' | 'hata' | 'olcum_donemi' | 'bos' | 'dolu';

export function sinyalKutuHali(sonuc: SinyalSonucu | null): SinyalKutuHali {
  if (sonuc === null) return 'yukleniyor';
  if (sonuc.durum === 'hata') return 'hata';
  if (sonuc.liste.sinyaller.length > 0) return 'dolu';
  if (sonuc.liste.sessizKosum) return 'olcum_donemi';
  return 'bos';
}

// ─── Boş liste: NEDENİYLE ────────────────────────────────────────────────────

export interface BosMetni {
  baslik: string;
  metin: string;
  /** Kutunun tek eylemi; `null` = yok. */
  eylem: 'suzgeci_temizle' | 'hesap_ata' | 'kapaliya_bak' | null;
}

/** En uzun geçmiş: "geçmiş yetersiz" cümlesindeki sayı. */
function enUzunGecmis(hesaplar: readonly HesapSinyalOzeti[]): number {
  return hesaplar.reduce((m, h) => Math.max(m, h.gecmisHafta), 0);
}

/**
 * Boş liste ne diyor. Beş neden beş AYRI iş (sözleşme `SINYAL_BOS_NEDENLERI`):
 * "hesap atanmamış" ile "her şey yolunda" aynı boş kutu olsaydı kullanıcı
 * hesabı atamadığını hiç öğrenmezdi.
 *
 * Sunucu `emptyReason` göndermediyse (sözleşme ihlali) "sinyal yok"
 * DENMİYOR: neden bilinmiyor ve bilinmeyeni olumlu cümleye çevirmek yalan.
 */
export function bosMetni(liste: SinyalListesi, gorunum: SinyalGorunumu, dil: Dil = 'tr'): BosMetni {
  const d = sec(sinyalSozlugu, dil).bos;
  const neden = liste.emptyReason;
  if (neden === null) {
    return { baslik: d.bilinmeyenBaslik, metin: d.bilinmeyen, eylem: null };
  }
  if (gorunum === 'kapali' && neden === 'sinyal_yok') {
    return { baslik: d.kapaliYokBaslik, metin: d.kapaliYok, eylem: null };
  }
  const degerlendirilen = liste.hesaplar.filter((h) => h.durum === 'hesaplandi').length;
  const kapali = liste.sayilar.kapatildi + liste.sayilar.kendiliginden_kapandi;
  const metinler: Record<SinyalBosNedeni, BosMetni> = {
    hesap_yok: { baslik: d.hesapYokBaslik, metin: d.hesapYok, eylem: 'hesap_ata' },
    hesaplanmadi: { baslik: d.hesaplanmadiBaslik, metin: d.hesaplanmadi, eylem: null },
    gecmis_yetersiz: {
      baslik: d.gecmisYetersizBaslik,
      metin: d.gecmisYetersiz(enUzunGecmis(liste.hesaplar), ANOMALI.enAzGecmisNokta),
      eylem: null,
    },
    sinyal_yok: {
      baslik: d.sinyalYokBaslik,
      metin: d.sinyalYok(degerlendirilen) + (kapali > 0 ? d.sinyalYokKapali(kapali) : ''),
      eylem: kapali > 0 ? 'kapaliya_bak' : null,
    },
    suzgec_bos: { baslik: d.suzgecBosBaslik, metin: d.suzgecBos, eylem: 'suzgeci_temizle' },
  };
  return metinler[neden];
}

/** Sessiz koşum (MIMARI Ç-14): org yöneticisi listeyi görür, bant ona da söyler. */
export function olcumDonemiMetni(dil: Dil = 'tr'): { baslik: string; bos: string; bant: string } {
  return sec(sinyalSozlugu, dil).olcum;
}

// ─── Hesap durumu satırı ────────────────────────────────────────────────────

export type Nokta = 'yesil' | 'gri' | 'kirmizi';

/**
 * Hesap başına durum. Yeşil YALNIZ "hesaplandı" (yeşil yalnız durum
 * göstergesi, TASARIM-DILI). `veri_bayat` KIRMIZI: o hesapta sinyaller
 * SUSTU (MIMARI Ç-3) ve boş görünen liste orada bir şeyi kaçırıyor olabilir.
 * `Record`: yeni bir durum eklenince derleme buraya getirir.
 */
export function hesapDurumu(h: HesapSinyalOzeti, zaman: (iso: string) => string, dil: Dil = 'tr'): { nokta: Nokta; metin: string } {
  const d = sec(sinyalSozlugu, dil).hesap;
  const not = h.not ? ` ${h.not}` : '';
  const tablo: Record<HesapSinyalDurumu, { nokta: Nokta; metin: string }> = {
    hesaplandi: {
      nokta: 'yesil',
      metin: d.hesaplandi(h.sonHesaplama ? ` ${zaman(h.sonHesaplama)}` : '', h.gecmisHafta),
    },
    hic_hesaplanmadi: { nokta: 'gri', metin: d.hicHesaplanmadi(not) },
    gecmis_yetersiz: { nokta: 'gri', metin: d.gecmisYetersiz(h.gecmisHafta, ANOMALI.enAzGecmisNokta) },
    veri_bayat: { nokta: 'kirmizi', metin: d.veriBayat(not) },
    hesaplama_dustu: { nokta: 'kirmizi', metin: h.not ? d.dustuNedenli(h.not) : d.dustuNedensiz },
  };
  return tablo[h.durum];
}

/**
 * "Kontrol edilmeyenler" satırının KISA cümleleri. Sözleşmedeki `neden`
 * geliştirici için yazılmış (dosya adları, servis adları) ve reklam bilmeyen
 * kullanıcıya gösterilemez; ad sözleşmeden, cümle buradan. `Record`: yeni bir
 * dışarıda kalan kontrol eklenince derleme buraya getirir, sessizce adsız
 * satır çizilmez.
 */
export function kontrolEdilmeyenler(
  kodlar: readonly SaglikDisaridaKodu[],
  dil: Dil = 'tr',
): Array<{ kod: SaglikDisaridaKodu; ad: string; neden: string }> {
  const metin = sec(sinyalSozlugu, dil).kontrolEdilmeyen;
  return kodlar.map((kod) => ({
    kod,
    ad: [...SAGLIK_DISARIDA, ...SAGLIK_KOSULLU_DISARIDA].find((d) => d.kod === kod)?.ad ?? kod,
    neden: metin[kod],
  }));
}

// ─── Özet şeridi ─────────────────────────────────────────────────────────────

export interface SinyalOzeti {
  acik: number;
  /** Yüksek önemli açık sinyal; liste kesilmişse ya da kapalı görünümdeyse `null` (eksik sayı kesin gibi gösterilmez). */
  yuksek: number | null;
  kapatildi: number;
  kendiliginden: number;
  /** Hesapların en yeni değerlendirmesi. */
  sonHesaplama: string | null;
}

export function sinyalOzeti(liste: SinyalListesi, gorunum: SinyalGorunumu): SinyalOzeti {
  const tam = gorunum === 'acik' && liste.toplam === liste.sinyaller.length && liste.toplam === liste.sayilar.acik;
  const son = liste.hesaplar.map((h) => h.sonHesaplama).filter((x): x is string => x !== null).sort();
  return {
    acik: liste.sayilar.acik,
    yuksek: tam ? liste.sinyaller.filter((s) => s.onem === 'yuksek').length : null,
    kapatildi: liste.sayilar.kapatildi,
    kendiliginden: liste.sayilar.kendiliginden_kapandi,
    sonHesaplama: son.length > 0 ? son[son.length - 1]! : null,
  };
}

/** Süzgeçteki platform çipleri: yalnız workspace'te gerçekten olanlar; tek platformsa çip yok. */
export function platformCipleri(liste: SinyalListesi): Platform[] {
  const p = [...new Set(liste.hesaplar.map((h) => h.platform))];
  return p.length > 1 ? p : [];
}

// ─── Satır ───────────────────────────────────────────────────────────────────

function anomaliMetrigiMi(kod: Sinyal['kod']): kod is keyof typeof ANOMALI_METRIK_TANIMI {
  return Object.prototype.hasOwnProperty.call(ANOMALI_METRIK_TANIMI, kod);
}

/**
 * Satırın rozetleri. "Yeniden açıldı" kırmızı: kapatılmış bir olay
 * kötüleşip döndü ve kullanıcı onu bir kez görmezden gelmişti. Dönüşüm
 * metrikleri 3 gün geriden değerlendiriliyor (MIMARI Ç-10) ve kart bunu
 * SÖYLÜYOR: "dün dönüşüm düştü" sanılmasın.
 */
export function sinyalRozetleri(s: Sinyal, dil: Dil = 'tr'): Array<{ metin: string; vurgu: boolean }> {
  const d = sec(sinyalSozlugu, dil).rozet;
  const r: Array<{ metin: string; vurgu: boolean }> = [];
  if (s.durum === 'acik' && s.acilmaSayisi > 1) r.push({ metin: d.yenidenAcildi, vurgu: true });
  if (s.tur === 'anomali' && anomaliMetrigiMi(s.kod) && ANOMALI_METRIK_TANIMI[s.kod].gecikmeli) {
    r.push({ metin: d.gunOnceki(ANOMALI.donusumGecikmesiGun), vurgu: false });
  }
  if (s.tur === 'saglik') r.push({ metin: d.saglik, vurgu: false });
  if (s.durum !== 'acik') {
    const k = s.kapatma;
    if (k?.neden === 'kullanici') r.push({ metin: `${d.kapatildi}${k.kim ? ` · ${k.kim}` : ''}`, vurgu: false });
    else if (k?.neden === 'uygulandi') r.push({ metin: `${d.durduruldu}${k.kim ? ` · ${k.kim}` : ''}`, vurgu: false });
    else r.push({ metin: d.kendiligindenKapandi, vurgu: false });
  }
  return r;
}

/** Workspace › platform › (üst) › varlık. Hesap seviyesinde varlık adı yerine hesap adı. */
export function sinyalYolu(s: Sinyal, dil: Dil = 'tr'): string[] {
  const ust = s.varlik.seviye === 'account' ? [] : s.varlik.ustAd ? [s.varlik.ustAd] : [];
  const son = s.varlik.seviye === 'account' ? sec(sinyalSozlugu, dil).yol.hesapGeneli(s.adAccountAdi) : s.varlik.ad;
  return [s.clientAdi, PLATFORM_KISA_ADLARI[s.platform], ...ust, son];
}

function yerelGun(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
}

const yerel = (dil: Dil) => (dil === 'en' ? 'en-US' : 'tr-TR');

/** `YYYY-MM-DD` → "pazartesi" / "Monday". UTC ile okunuyor: gün dizesi Date'e çevrilince saat dilimi kaydırmasın. */
export function haftaGunu(gun: string, dil: Dil = 'tr'): string {
  const ad = new Date(`${gun}T00:00:00Z`).toLocaleDateString(yerel(dil), { weekday: 'long', timeZone: 'UTC' });
  return dil === 'en' ? ad : ad.toLocaleLowerCase('tr-TR');
}

/** "Dün (pazartesi)" ya da "9 Ekim (perşembe)". */
export function gunEtiketi(gun: string, simdi: Date = new Date(), dil: Dil = 'tr'): string {
  const d = sec(sinyalSozlugu, dil).gun;
  const dun = new Date(simdi);
  dun.setDate(dun.getDate() - 1);
  const hg = haftaGunu(gun, dil);
  if (gun === yerelGun(dun)) return d.dun(hg);
  if (gun === yerelGun(simdi)) return d.bugun(hg);
  const tarih = new Date(`${gun}T00:00:00Z`).toLocaleDateString(yerel(dil), { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return `${tarih} (${hg})`;
}

export interface SinyalKaniti {
  gun: string;
  gozlenen: string | null;
  beklenen: { alt: string; ust: string } | null;
  dipnot: string | null;
}

/**
 * Kanıt satırı: gözlenen ve beklenen aralık, ikisi de SUNUCUNUN biçimlediği
 * metinle (para birimi ve ondalık sunucuda; panel yeniden biçimlerse iki
 * ekranda iki farklı sayı çıkar). Sağlık sinyalinde gözlenen yok; kanıt
 * `neden` cümlesinde.
 */
export function sinyalKaniti(s: Sinyal, simdi: Date = new Date(), dil: Dil = 'tr'): SinyalKaniti | null {
  if (!s.gozlenen) return null;
  return {
    gun: gunEtiketi(s.gun, simdi, dil),
    gozlenen: s.gozlenen.metin,
    beklenen: s.beklenen ? { alt: s.beklenen.alt.metin, ust: s.beklenen.ust.metin } : null,
    dipnot: s.beklenen ? sec(sinyalSozlugu, dil).gun.dipnot(s.beklenen.nokta, haftaGunu(s.gun, dil)) : null,
  };
}

/**
 * İnceleme bağlantısı — Reklam Yöneticisi'nin üreticisinden. Hesap ve
 * platform TAŞINIYOR: sinyal belli bir hesabın kampanyası ve Reklam
 * Yöneticisi aynı adlı kampanyayı başka hesapta da gösterebilir.
 * Reklam seviyesinde (reddedilen reklam) iniş tablosunda reklamı
 * süzecek parametre yok; Reklam Galerisi'nin "Sorunlu" süzgeci AYNI
 * fonksiyonla (`hasReviewIssue`) çalışıyor, oraya gidiliyor.
 */
export function sinyalIncelemeAdresi(s: Pick<Sinyal, 'varlik' | 'adAccountId' | 'platform'>): string {
  const tasinan = { hesap: s.adAccountId, platform: s.platform };
  switch (s.varlik.seviye) {
    case 'account':
      return baglanti(REKLAM_YONETICISI, tasinan, { seviye: 'campaign' });
    case 'campaign':
      return baglanti(REKLAM_YONETICISI, tasinan, { seviye: 'ad_group', kampanya: s.varlik.id });
    case 'ad_group':
      return baglanti(REKLAM_YONETICISI, tasinan, { seviye: 'ad', reklamSeti: s.varlik.id });
    case 'ad':
      return baglanti(`${REKLAM_YONETICISI}/galeri`, tasinan, { sorunlu: '1' });
  }
}

export interface SatirEylemi {
  birincil: { tur: 'durdur' } | { tur: 'bag'; href: string; etiket: string } | null;
  /** Birincil düğme durdurken yandaki "İncele" bağlantısı. */
  incele: string | null;
  kapatilabilir: boolean;
  geriAcilabilir: boolean;
  /** Eylem neden yok ya da kısıtlı; düz metin. */
  kisit: string | null;
}

/**
 * Satırın düğmeleri. Kapat / geri aç izni DURUM MAKİNESİNDEN okunuyor
 * (`sinyalGecisi`): "kendiliğinden kapandı" bir sinyali geri açmak
 * sözleşmede yok ve düğmesi gösterilseydi her basış 409 alırdı.
 *
 * DURDUR YALNIZ `budget.write`LE (Reklam Yöneticisi satır içi durdurla aynı
 * izin); yetkisi olmayana düğme gösterilmiyor, nedeni yazılıyor ve inceleme
 * bağlantısı birincil oluyor.
 */
export function satirEylemi(s: Sinyal, yetki: { butce: boolean; kural: boolean }, dil: Dil = 'tr'): SatirEylemi {
  const d = sec(sinyalSozlugu, dil).eylem;
  const kapatilabilir = yetki.kural && sinyalGecisi(s.durum, 'kullanici_kapatti') !== null;
  const geriAcilabilir = yetki.kural && s.durum !== 'acik' && sinyalGecisi(s.durum, 'kullanici_geri_acti') !== null;
  const bos: SatirEylemi = { birincil: null, incele: null, kapatilabilir, geriAcilabilir, kisit: s.kisit };
  if (s.durum !== 'acik') return { ...bos, kisit: null };
  const e = s.eylem;
  if (!e) return bos;
  const inceleBag = { tur: 'bag' as const, href: sinyalIncelemeAdresi(s), etiket: d.reklamYoneticisindeAc };
  switch (e.tur) {
    case 'durdur':
      if (!yetki.butce) {
        return { ...bos, birincil: inceleBag, kisit: s.kisit ?? d.butceYetkisi };
      }
      return { ...bos, birincil: { tur: 'durdur' }, incele: sinyalIncelemeAdresi(s) };
    case 'incele':
      return { ...bos, birincil: inceleBag };
    case 'olcum':
      return { ...bos, birincil: { tur: 'bag', href: markaMerkeziAdresi('kurulum', e.clientId, 'olcum'), etiket: d.olcumuAc } };
  }
}

/**
 * Uygula yanıtı. Sözleşme `SinyalUygulamaSonucu`; değilse `null` ve ekran
 * "sonuç okunamadı" der. Sonucu olmayan bir yanıtı "doğrulandı" saymak,
 * geri okuma kuralını ekranda çiğnemek olurdu (İyileştir ile aynı karar).
 */
export function sinyalUygulamaCoz(yanit: unknown): SinyalUygulamaSonucu | null {
  const y = yanit as Partial<SinyalUygulamaSonucu> | null;
  if (!y || (y.dogrulama !== 'dogrulandi' && y.dogrulama !== 'uyusmadi')) return null;
  if (typeof y.platformDegeri !== 'string') return null;
  if (!y.sinyal || typeof y.sinyal.id !== 'string') return null;
  return y as SinyalUygulamaSonucu;
}

// ─── Mini grafik ─────────────────────────────────────────────────────────────

export const SINYAL_MINI = { W: 180, H: 44 } as const;

/**
 * Taslağın `mini()`si: geçmiş haftalar çizgi, SON nokta (gözlenen) kırmızı
 * daire, beklenen aralık gri bant. Değeri olmayan gün (`null`) sıfıra
 * ÇEVRİLMİYOR: çizgi orada kopuyor (sıfır, "o gün hiç harcamadı" demek ve
 * uydurma bir düşüş çizerdi). Çizilecek iki nokta yoksa `null`; boş bir SVG
 * "veri sıfır" gibi okunur.
 */
export function sinyalMiniYolu(seri: SinyalSerisi | null): {
  cizgi: string;
  son: { x: number; y: number } | null;
  bant: { y: number; h: number } | null;
} | null {
  if (!seri || seri.degerler.length < 2) return null;
  const dolu = seri.degerler.filter((v): v is number => v !== null && Number.isFinite(v));
  if (dolu.length < 2) return null;
  const { W, H } = SINYAL_MINI;
  const ust = Math.max(...dolu, seri.bant?.ust ?? 0) * 1.1 || 1;
  const n = seri.degerler.length;
  const x = (i: number) => 4 + (i * (W - 8)) / (n - 1);
  const y = (v: number) => H - 2 - (v / ust) * (H - 6);
  let cizgi = '';
  let kopuk = true;
  seri.degerler.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      kopuk = true;
      return;
    }
    cizgi += `${kopuk ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    kopuk = false;
  });
  const sonDeger = seri.degerler[n - 1];
  return {
    cizgi: cizgi.trim(),
    son: sonDeger !== null && sonDeger !== undefined && Number.isFinite(sonDeger) ? { x: Number(x(n - 1).toFixed(1)), y: Number(y(sonDeger).toFixed(1)) } : null,
    bant: seri.bant
      ? { y: Number(y(seri.bant.ust).toFixed(1)), h: Number((y(seri.bant.alt) - y(seri.bant.ust)).toFixed(1)) }
      : null,
  };
}

// ─── Bildirim kanalları ─────────────────────────────────────────────────────

/** Yeşil yalnız "çalışıyor"; `Record`: yeni durum eklenince derleme buraya getirir. */
export const KANAL_DURUM_NOKTASI: Record<KanalDurumu, Nokta> = {
  calisiyor: 'yesil',
  dogrulanmadi: 'gri',
  kapali: 'gri',
  hata: 'kirmizi',
};

export function olaylarMetni(olaylar: readonly BildirimOlayi[]): string {
  return olaylar.map((o) => BILDIRIM_OLAYI_ADI[o]).join(', ');
}

/** "3 alıcı · Sinyaller (...)", "hooks.slack.com … X9kQ · Kural bildirimleri (...)". */
export function kanalAltMetni(k: Pick<BildirimKanali, 'hedefIpucu' | 'olaylar'>): string {
  return `${k.hedefIpucu} · ${olaylarMetni(k.olaylar)}`;
}

export function kanalAdi(k: Pick<BildirimKanali, 'tur' | 'ad'>): string {
  return `${KANAL_TURU_ADI[k.tur]} · ${k.ad}`;
}

/**
 * Webhook alanı BIRAKILINCA çalışan kontrol (doğrulama giriş anında,
 * CLAUDE.md). Boş alan HATA DEĞİL: kullanıcı henüz yazmadı ve alanı ilk
 * geçişte kırmızıya boyamak, yazmadan önce azarlamak. Kural sunucudakiyle
 * AYNI fonksiyon (`webhookDenetle`); ikinci bir kontrol doğduğu anda ayrışır.
 */
export function adresAlaniHatasi(tur: 'slack' | 'teams', ham: string): string | null {
  if (ham.trim() === '') return null;
  const d = webhookDenetle(tur, ham);
  return d.gecerli ? null : d.neden;
}

export interface KanalFormu {
  tur: KanalTuru;
  clientId: string;
  ad: string;
  adres: string;
  alicilarHam: string;
  olaylar: BildirimOlayi[];
}

export type KanalFormuSonucu = { gecerli: true; girdi: KanalOlusturGirdisi } | { gecerli: false; neden: string };

/**
 * Kaydetmeden ÖNCE sözleşmenin şemasıyla doğrulama: sunucu aynı şemayı
 * koşuyor ve ekranda geçen bir form sunucuda düşerse kullanıcı "Kaydet"e
 * basıp nedenini anlamadığı bir 400 görürdü. Alıcılar `aliciAyristir`dan:
 * rapor alıcılarıyla aynı ayırıcılar ve aynı üst sınır; geçersiz parça ve
 * sınırı aşan adres SESSİZCE atılmıyor, adıyla söyleniyor.
 */
export function kanalFormuDenetle(f: KanalFormu, dil: Dil = 'tr'): KanalFormuSonucu {
  const d = sec(sinyalSozlugu, dil).kanal;
  let ham: unknown;
  if (f.tur === 'eposta') {
    const a = aliciAyristir(f.alicilarHam);
    if (a.gecersiz.length > 0) return { gecerli: false, neden: d.gecersizAdres(a.gecersiz.join(', ')) };
    if (a.atilan.length > 0) return { gecerli: false, neden: d.aliciFazla(ALICI_UST_SINIRI, a.atilan.length) };
    ham = { tur: 'eposta', clientId: f.clientId, ad: f.ad, olaylar: f.olaylar, alicilar: a.adresler };
  } else {
    ham = { tur: f.tur, clientId: f.clientId, ad: f.ad, olaylar: f.olaylar, adres: f.adres.trim() };
  }
  const r = kanalOlusturSchema.safeParse(ham);
  if (r.success) return { gecerli: true, girdi: r.data };
  const ilk = r.error.issues[0];
  const alan = ilk?.path[0];
  const onEk = alan === 'ad' ? d.alanKanalAdi : alan === 'alicilar' ? d.alanAlicilar : '';
  return { gecerli: false, neden: `${onEk}${ilk?.message ?? d.formGecersiz}` };
}

/**
 * Ajansın alan adı dışındaki alıcılar (MIMARI Ç-8): sinyal ajansın iç
 * bilgisi; müşteri adresi yazılırsa form UYARIR ama ENGELLEMEZ. Ajans alan
 * adı gönderen kimliğinden, o yoksa oturumdaki kullanıcının adresinden.
 * Genel sağlayıcılar (gmail…) alan adı olarak kıyaslanamaz: ajans gmail
 * kullanıyorsa her müşteri gmail adresi "ajans" sayılırdı; o durumda uyarı
 * yapılmıyor (yanlış güven vermektense susmak, uyarı bir engel değil).
 */
const GENEL_SAGLAYICILAR = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'yandex.com']);

function alanAdi(adres: string): string | null {
  const i = adres.lastIndexOf('@');
  return i > 0 ? adres.slice(i + 1).trim().toLowerCase() : null;
}

export function ajansDisiAlicilar(alicilar: readonly string[], ajansAdresi: string | null): string[] {
  const ajans = ajansAdresi ? alanAdi(ajansAdresi) : null;
  if (!ajans || GENEL_SAGLAYICILAR.has(ajans)) return [];
  return alicilar.filter((a) => {
    const d = alanAdi(a);
    return d !== null && d !== ajans;
  });
}

/**
 * Deneme mesajının yanıtı. Sözleşme yanıtın BİÇİMİNİ tanımlamıyor ("teslim
 * sonucu ve platformun cümlesi"); teslim satırı (`BildirimGonderimi`) ya da
 * `{ durum, hata }` taşıyan bir nesne bekleniyor. Tanınmazsa "sonuç
 * okunamadı": 200 dönen bir isteği "gönderildi" saymak, "200 döndü
 * doğrulama değil" kuralını ekranda çiğnemek olurdu.
 */
export type DenemeSonucu = { tur: 'gonderildi' } | { tur: 'dustu'; mesaj: string } | { tur: 'okunamadi' };

export function denemeSonucuCoz(yanit: unknown, dil: Dil = 'tr'): DenemeSonucu {
  const y = yanit as { durum?: unknown; hata?: unknown; httpDurum?: unknown; gonderim?: unknown } | null;
  const ic = y && typeof y.gonderim === 'object' && y.gonderim !== null ? (y.gonderim as typeof y) : y;
  const durum = ic?.durum;
  if (typeof durum !== 'string' || !(TESLIM_DURUMLARI as readonly string[]).includes(durum)) return { tur: 'okunamadi' };
  if (durum === 'gonderildi') return { tur: 'gonderildi' };
  const http = typeof ic?.httpDurum === 'number' ? `${ic.httpDurum} · ` : '';
  const hata = typeof ic?.hata === 'string' && ic.hata ? ic.hata : sec(sinyalSozlugu, dil).kanal.platformNedenYok;
  return { tur: 'dustu', mesaj: `${http}${hata}` };
}

/** Son gönderimler tablosundaki durum hücresi. `Record`: dört teslim durumu dört AYRI cümle. */
export function gonderimDurumu(g: BildirimGonderimi, dil: Dil = 'tr'): { nokta: Nokta; etiket: string; ayrinti: string | null } {
  const d = sec(sinyalSozlugu, dil).kanal;
  const http = g.httpDurum !== null ? String(g.httpDurum) : d.baglantiHatasi;
  const hata = g.hata ? ` · ${g.hata}` : '';
  const tablo: Record<TeslimDurumu, { nokta: Nokta; etiket: string; ayrinti: string | null }> = {
    gonderildi: { nokta: 'yesil', etiket: d.gonderildi, ayrinti: g.hata },
    bekliyor: { nokta: 'gri', etiket: d.bekliyor, ayrinti: null },
    basarisiz: { nokta: 'gri', etiket: d.tekrarDenenecek, ayrinti: d.denemeAyrinti(http, g.deneme, hata) },
    vazgecildi: { nokta: 'kirmizi', etiket: d.vazgecildi, ayrinti: d.vazgecAyrinti(http, g.deneme, hata) },
  };
  return tablo[g.durum];
}

export function gonderimIcerigi(g: Pick<BildirimGonderimi, 'olay' | 'ozet'>, dil: Dil = 'tr'): string {
  return g.olay === 'deneme' ? `${sec(sinyalSozlugu, dil).kanal.denemeMesaji}${g.ozet ? ` · ${g.ozet}` : ''}` : g.ozet;
}

// ─── Kural: "Yalnızca bildir" ───────────────────────────────────────────────

/**
 * Kural satırındaki "yalnızca bildir" cümlesi. Kanalsız eski kural "yalnız
 * kural geçmişine yazılır" der (MIMARI Ç-6): bugün `notify` hiçbir yere
 * gitmiyordu ve kullanıcı bunu bilmeliydi. Kanal listesi okunamadıysa ad
 * UYDURULMUYOR, sayı söyleniyor; silinmiş kanal "silinmiş kanal" diye.
 */
export function kuralBildirimMetni(
  kanalIdleri: readonly string[] | undefined,
  kanallar: readonly BildirimKanali[] | null,
  dil: Dil = 'tr',
): string {
  const d = sec(sinyalSozlugu, dil).kanal;
  if (!kanalIdleri || kanalIdleri.length === 0) return d.kuralKanalsiz;
  if (kanallar === null) return d.kuralAdlarYok(kanalIdleri.length);
  const adlar = kanalIdleri.map((id) => {
    const k = kanallar.find((x) => x.id === id);
    return k ? kanalAdi(k) : d.silinmisKanal;
  });
  return d.kuralBildir(adlar.join(', '));
}

/**
 * Kural düzenleyicideki kanal satırı. Gönderemeyen kanal SEÇİLEMEZ, nedeni
 * satırda (taslak "Bozuk kanal seçilemez"). Kural olayını ALMAYAN kanal da
 * seçilemez: bildirim yalnız kural kanalı seçtiğinde VE kanal `kural`
 * olayını aldığında gidiyor (sözleşme `BILDIRIM_OLAYLARI`). Seçilebilir
 * olsaydı kullanıcı kanalı seçer, kural eşleşir ve hiçbir yere mesaj gitmezdi.
 * Taslak burada "seçersen açılır" diyordu; bu, kural kaydının içinden
 * kanalın ayarını değiştiren İKİNCİ bir yazma demekti (kural yetkisi ile
 * kanal yetkisi farklı: `rule.write` / `client.write`). Kanalın olayı
 * Marka Merkezi'nde açılıyor.
 */
export function kanalSecimi(
  k: Pick<BildirimKanali, 'durum' | 'olaylar' | 'sonTeslim' | 'etkin'>,
  dil: Dil = 'tr',
): { secilebilir: boolean; not: string | null } {
  const d = sec(sinyalSozlugu, dil).kanal;
  if (k.durum === 'hata') {
    return {
      secilebilir: false,
      not: d.sonGonderimDustu(k.sonTeslim?.hata ? ` (${k.sonTeslim.hata})` : ''),
    };
  }
  if (!k.etkin) return { secilebilir: false, not: d.kapali };
  if (!k.olaylar.includes('kural')) {
    return { secilebilir: false, not: d.kuralAlmiyor };
  }
  return { secilebilir: true, not: k.durum === 'dogrulanmadi' ? d.dogrulanmadi : null };
}

/**
 * Kural kaydına gidecek kanal listesi. Kanal listesi OKUNAMADIYSA (`null`)
 * seçim AYNEN gidiyor: düşen bir çağrı yüzünden kuralın kanallarını boş
 * listeyle ezmek, bildirimleri sessizce kapatmak olurdu. Okunduysa artık
 * olmayan (silinmiş) kanallar çıkıyor ve ekran bunu sayıyla söylüyor.
 */
export function kaydedilecekKanallar(
  secili: readonly string[],
  kanallar: readonly Pick<BildirimKanali, 'id'>[] | null,
): { idler: string[]; kayip: number } {
  if (kanallar === null) return { idler: [...secili], kayip: 0 };
  const idler = secili.filter((id) => kanallar.some((k) => k.id === id));
  return { idler, kayip: secili.length - idler.length };
}

// ─── Genel Bakış ─────────────────────────────────────────────────────────────

/** "Bekleyen işler"deki sinyal satırının hedefi: İyileştir › Sinyaller, işin workspace'inde. */
export function sinyallerAdresi(clientId: string): string {
  return baglanti('/iyilestir', { musteri: clientId, sekme: 'sinyaller' });
}
