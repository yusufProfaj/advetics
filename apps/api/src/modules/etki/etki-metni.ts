import { Prisma } from '@prisma/client';
import {
  degisiklikMetni,
  etkiCumlesi,
  formatMoney,
  metrikDegeri,
  type DegisiklikKaynagi,
  type DegisiklikSeviyesi,
  type DegisiklikTuru,
  type DegisiklikYolu,
  type Etki,
  type EtkiDurumu,
  type EtkiGozlemi,
  type EtkiNedeni,
  type EtkiPenceresiOzeti,
  type EtkiSonucu,
  type GunAraligi,
  type KapsamSeviyesi,
  type PencereToplami,
  type Platform,
} from '@advetics/shared';

/**
 * ═══ SATIR → EKRAN (Etki) ═══
 *
 * Liste ve tek kayıt AYNI seçimi ve AYNI dönüştürücüyü kullanıyor: iki
 * ayrı sorgu biri güncellenip diğeri unutulduğunda aynı satırı iki farklı
 * cümleyle gösterirdi.
 *
 * `ad_accounts` LEFT JOIN: hesap başka workspace'e taşınınca politikası
 * satırı aktif workspace'e daraltıyor; INNER JOIN etki satırını SESSİZCE
 * düşürürdü (CLAUDE.md "RLS'li bir tabloya INNER JOIN"). Hesap adı
 * görünmezse yedek metin yazılıyor.
 */
export const ETKI_SECIMI = Prisma.sql`
  SELECT e.id::text AS id, e.client_id::text AS client_id, e.platform::text AS platform,
         e.ad_account_id::text AS ad_account_id, a.name AS hesap_adi, a.currency AS hesap_para,
         e.kaynak, e.yol, e.yol_ref, e.kim, e.tur, e.seviye::text AS seviye,
         e.varlik_id::text AS varlik_id, e.varlik_adi, e.ust_adi,
         e.kapsam_seviye::text AS kapsam_seviye, e.kapsam_id::text AS kapsam_id, e.kapsam_adi,
         e.once_deger, e.sonra_deger, e.degisiklik_zamani, e.degisiklik_gunu::text AS gun,
         e.birlikte_olculen::int AS birlikte_olculen, e.durum, e.sonuc, e.neden, e.metrik,
         e.etki_orani::float8 AS etki_orani, e.nokta_gun::int AS nokta_gun,
         e.sonraki_olcum::text AS sonraki_olcum, e.olcum, e.gozlem
    FROM degisiklik_etkileri e
    LEFT JOIN ad_accounts a ON a.id = e.ad_account_id`;

/**
 * SELECT'teki her alan BURADA. `$queryRaw<T>` denetimsiz bir dönüşüm
 * (CLAUDE.md): alan eklerken SELECT'i de güncelle; `etki.service.spec.ts`
 * satırı gerçek sorguyla okuyup her alanı kontrol ediyor.
 */
export interface EtkiSatiri {
  id: string;
  client_id: string;
  platform: Platform;
  ad_account_id: string;
  hesap_adi: string | null;
  hesap_para: string | null;
  kaynak: DegisiklikKaynagi;
  yol: DegisiklikYolu;
  yol_ref: string | null;
  kim: string | null;
  tur: DegisiklikTuru;
  seviye: DegisiklikSeviyesi;
  varlik_id: string;
  varlik_adi: string;
  ust_adi: string | null;
  kapsam_seviye: KapsamSeviyesi;
  kapsam_id: string;
  kapsam_adi: string;
  once_deger: unknown;
  sonra_deger: unknown;
  degisiklik_zamani: Date | string;
  gun: string;
  birlikte_olculen: number;
  durum: EtkiDurumu;
  sonuc: EtkiSonucu | null;
  neden: EtkiNedeni | null;
  metrik: string | null;
  etki_orani: number | null;
  nokta_gun: number | null;
  sonraki_olcum: string | null;
  olcum: unknown;
  gozlem: unknown;
}

/** İşin `olcum` kolonuna yazdığı kanıt (etki-hesap.ts). */
export interface OlcumKaniti {
  pencereler: { plasebo: GunAraligi; once: GunAraligi; sonra: GunAraligi };
  paraBirimi?: string;
  deney?: { plasebo: PencereToplami; once: PencereToplami; sonra: PencereToplami };
  kontrol?: { plasebo: PencereToplami; once: PencereToplami; sonra: PencereToplami; varliklar: string[]; sayi: number } | null;
  esik?: number | null;
  plasebo?: number | null;
}

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** `2026-10-23` → `23 Ekim`. Date'e çevirmeden (saat dilimi kayması). */
export function gunMetni(gun: string | null): string | null {
  if (!gun) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gun);
  if (!m) return gun;
  return `${Number(m[3])} ${AYLAR[Number(m[2]) - 1]}`;
}

function nesne(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function hukumMetrikMi(m: string | null): m is 'donusum_basi_maliyet' | 'tiklama_basi_maliyet' {
  return m === 'donusum_basi_maliyet' || m === 'tiklama_basi_maliyet';
}

/** Para birimindeki tutarı (micros değil) biçimle. */
export function paraMetni(tutar: number, paraBirimi: string | null): string {
  return formatMoney(String(Math.round(tutar * 1_000_000)), paraBirimi, { decimals: 2 });
}

function pencereOzeti(
  aralik: GunAraligi,
  t: PencereToplami,
  metrik: 'donusum_basi_maliyet' | 'tiklama_basi_maliyet' | null,
  para: string | null,
): EtkiPenceresiOzeti {
  const d = metrik ? metrikDegeri(metrik, t) : null;
  return { aralik, deger: d === null ? null : paraMetni(d, para), tiklama: Math.round(t.tiklama), donusum: Math.round(t.donusum * 10) / 10 };
}

export function satirdanEtki(r: EtkiSatiri): Etki {
  const once = nesne(r.once_deger);
  const sonra = nesne(r.sonra_deger);
  const olcum = nesne(r.olcum) as Partial<OlcumKaniti>;
  const para = (typeof once.paraBirimi === 'string' ? once.paraBirimi : null) ?? olcum.paraBirimi ?? r.hesap_para ?? null;
  const tutar = (v: unknown) => (typeof v === 'string' && /^\d+$/.test(v) ? formatMoney(v, para, { decimals: 0 }) : null);
  const metrik = hukumMetrikMi(r.metrik) ? r.metrik : null;
  const sonrakiOlcum = r.sonraki_olcum;

  let onceOzet: EtkiPenceresiOzeti | null = null;
  let sonraOzet: EtkiPenceresiOzeti | null = null;
  let kontrolDegisimi: number | null = null;
  if (olcum.deney && olcum.pencereler) {
    onceOzet = pencereOzeti(olcum.pencereler.once, olcum.deney.once, metrik, para);
    sonraOzet = pencereOzeti(olcum.pencereler.sonra, olcum.deney.sonra, metrik, para);
  }
  if (metrik && olcum.kontrol) {
    const kO = metrikDegeri(metrik, olcum.kontrol.once);
    const kS = metrikDegeri(metrik, olcum.kontrol.sonra);
    kontrolDegisimi = kO && kS !== null ? kS / kO - 1 : null;
  }
  const kontrolSayisi = olcum.kontrol?.sayi ?? 0;
  const kontrolMetni =
    kontrolSayisi > 0
      ? `Aynı hesaptaki ${kontrolSayisi} ${r.kapsam_seviye === 'ad_group' ? 'reklam seti' : 'kampanya'}`
      : null;

  return {
    id: r.id,
    clientId: r.client_id,
    platform: r.platform,
    adAccountId: r.ad_account_id,
    adAccountAdi: r.hesap_adi ?? 'Reklam hesabı',
    kaynak: r.kaynak,
    yol: r.yol,
    yolRef: r.yol_ref,
    kim: r.kim,
    tur: r.tur,
    degisiklikMetni: degisiklikMetni(r.tur, tutar(once.budgetAmountMicros), tutar(sonra.budgetAmountMicros)),
    varlik: { seviye: r.seviye, id: r.varlik_id, ad: r.varlik_adi, ustAd: r.ust_adi },
    kapsam: { seviye: r.kapsam_seviye, id: r.kapsam_id, ad: r.kapsam_adi },
    kontrolMetni,
    birlikteOlculen: Number(r.birlikte_olculen),
    zaman: new Date(r.degisiklik_zamani).toISOString(),
    gun: r.gun,
    durum: r.durum,
    sonuc: r.sonuc,
    neden: r.neden,
    metrik,
    etkiOrani: r.etki_orani === null ? null : Number(r.etki_orani),
    noktaGun: r.nokta_gun,
    sonrakiOlcum,
    once: onceOzet,
    sonra: sonraOzet,
    kontrolDegisimi,
    gozlem: r.gozlem ? (r.gozlem as EtkiGozlemi) : null,
    /*
     * CÜMLE ŞABLONDAN (`etkiCumlesi`), tarih okunur biçimde: sözleşme alanı
     * `sonrakiOlcum` ISO kalıyor (panel sıralıyor ve biçimliyor), cümleye
     * "23 Ekim" giriyor. Ham ISO ekranda "2026-10-23 tarihinde" okunurdu.
     */
    cumle: etkiCumlesi({
      durum: r.durum,
      sonuc: r.sonuc,
      neden: r.neden,
      metrik,
      etkiOrani: r.etki_orani === null ? null : Number(r.etki_orani),
      sonrakiOlcum: gunMetni(sonrakiOlcum),
      tur: r.tur,
    }),
  };
}
