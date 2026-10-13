import type { Permission } from '../../auth/roles';

/**
 * ═══ ADVSTRATEGY v2 — DURUM MAKİNESİ (YENIDEN-TASARIM.md § 6.2) ═══
 *
 *   taslak ──onaya_gonder──► onayda ──onayla──► onaylandi ──kapat──► kapandi
 *     ▲  ▲                    │   │
 *     │  └────geri_cek────────┘   └──revizyon_iste──► revizyon
 *     │                                                 │
 *     └───────────(ilk düzenleme, sürüm artar)──────────┘
 *   (taslak | onayda | revizyon | onaylandi) ──iptal──► iptal
 *
 * v1 (`../plan.ts`, `PLAN_DURUMLARI`) AYNI TABLODA yaşıyor ve dokunulmadı:
 * eski planlar `bicim = 1` ile salt okunur. Adlar bilerek ayrı
 * (`STRATEJI_*`): v1 listesine değer eklemek v1 ekranlarının `Record`
 * tablolarını kırar ve iki makineyi tek sabitte karıştırırdı.
 *
 * "AKTARILDI" VE "YAYINDA" PLAN DURUMU DEĞİL. v1'de `aktarildi` son
 * durumdu: kısmi aktarım ve tekrar deneme kilitleniyordu. Aktarım KALEM
 * düzeyinde ve tekrarlanabilir; plan rozeti kalemlerden türetilir
 * ("Onaylandı · 3/5 kampanya yayında", `kalem.ts#kalemDurumu`).
 *
 * SON DURUMLAR `kapandi`, `iptal`. Açık strateji tekil indeksi yalnız
 * `STRATEJI_ACIK_DURUMLAR`ı kapsar ve hepsinden çıkış var (kısmi indeks +
 * çıkışsız durum = kalıcı kilit; boost `active` dersi).
 */
export const STRATEJI_DURUMLARI = ['taslak', 'onayda', 'revizyon', 'onaylandi', 'kapandi', 'iptal'] as const;
export type StratejiDurumu = (typeof STRATEJI_DURUMLARI)[number];

export const STRATEJI_SON_DURUMLARI: readonly StratejiDurumu[] = ['kapandi', 'iptal'];

/** Workspace başına TEK açık strateji (kısmi tekil indeksin yüklemi). */
export const STRATEJI_ACIK_DURUMLAR: readonly StratejiDurumu[] = ['taslak', 'onayda', 'revizyon'];

export const STRATEJI_EYLEMLERI = ['onaya_gonder', 'geri_cek', 'onayla', 'revizyon_iste', 'kapat', 'iptal'] as const;
export type StratejiEylemi = (typeof STRATEJI_EYLEMLERI)[number];

export const STRATEJI_GECISLERI: Record<StratejiEylemi, { kaynak: readonly StratejiDurumu[]; hedef: StratejiDurumu }> = {
  onaya_gonder: { kaynak: ['taslak', 'revizyon'], hedef: 'onayda' },
  geri_cek: { kaynak: ['onayda'], hedef: 'taslak' },
  onayla: { kaynak: ['onayda'], hedef: 'onaylandi' },
  revizyon_iste: { kaynak: ['onayda'], hedef: 'revizyon' },
  kapat: { kaynak: ['onaylandi'], hedef: 'kapandi' },
  iptal: { kaynak: ['taslak', 'onayda', 'revizyon', 'onaylandi'], hedef: 'iptal' },
};

/**
 * Panel içinden eylem başına GEREKEN izinlerin tamamı. Girişsiz onay
 * bağlantısı (`paylasim.ts`) bu tabloyu KULLANMAZ: orada yetki token'ın
 * kendisi ve yalnız `onayla` / `revizyon_iste` yapılabilir.
 */
export const STRATEJI_EYLEM_IZINLERI: Record<StratejiEylemi, readonly Permission[]> = {
  onaya_gonder: ['strategy.write'],
  geri_cek: ['strategy.write'],
  onayla: ['strategy.approve'],
  revizyon_iste: ['strategy.approve'],
  kapat: ['strategy.write'],
  iptal: ['strategy.write'],
};

/** Yorum ZORUNLU eylemler: neden yazmadan revizyon istemek ajansı tahmine bırakır. */
export const YORUM_ZORUNLU_EYLEMLER: readonly StratejiEylemi[] = ['revizyon_iste'];

/**
 * Onaylayanın türü. `baglanti` = girişsiz onay bağlantısıyla (kullanıcı kararı
 * 2, 2026-10-13); adı ve e-postası kişinin KENDİ beyanı, doğrulanmış bir
 * kimlik değil. Ekran ve PDF üçünü ayrı cümleyle yazar.
 */
export const STRATEJI_ONAY_ROLLERI = ['musteri', 'ajans', 'baglanti'] as const;
export type StratejiOnayRolu = (typeof STRATEJI_ONAY_ROLLERI)[number];

export const STRATEJI_ONAY_CUMLESI: Record<StratejiOnayRolu, string> = {
  musteri: 'Müşteri hesabı onayladı',
  ajans: 'Ajans onayladı (müşteri hesabı adına)',
  baglanti: 'Onay bağlantısıyla onaylandı',
};

export function stratejiGecisMumkunMu(durum: StratejiDurumu, eylem: StratejiEylemi): boolean {
  return STRATEJI_GECISLERI[eylem].kaynak.includes(durum);
}

/** Düzenlenebilir: taslak ve revizyon. Revizyondaki ilk kayıt durumu `taslak`a çeker, sürüm artar. */
export function stratejiDuzenlenebilirMi(durum: StratejiDurumu): boolean {
  return durum === 'taslak' || durum === 'revizyon';
}

/** Bu kullanıcının yapabileceği eylemler (durum × izin). Düğmeler BUNDAN çizilir. */
export function stratejiYapilabilir(durum: StratejiDurumu, izinler: readonly Permission[]): StratejiEylemi[] {
  return STRATEJI_EYLEMLERI.filter(
    (e) => stratejiGecisMumkunMu(durum, e) && STRATEJI_EYLEM_IZINLERI[e].every((i) => izinler.includes(i)),
  );
}
