import { z } from 'zod';

/**
 * ═══ KURULUM BEYANLARI — "BUNU KULLANMIYORUZ" (docs/kurulum-sihirbazi/MIMARI.md § 5) ═══
 *
 * Sihirbazın sözü "hiç eksik kalmasın". Bazı öğeler ise bazı işletmelerde
 * gerçekten YOK: fiziksel adresi olmayan bir e-ticaret, bildirim istemeyen
 * bir ekip, web sitesi olmadan Instagram'dan satan bir marka. Beyan olmasaydı
 * bu workspace'ler sonsuza kadar "eksik" derdi ve her gün görülen bir uyarı
 * okunmaz hâle gelirdi. Beyan, kapsamı daraltmanın AÇIK ve İZLİ yolu: kim,
 * ne zaman ve hangi gerekçeyle dedi, son kontrol ekranında yazıyor.
 *
 * LİSTE BİLEREK DAR. Ödeme yöntemi, reklam hesabı, marka bilgileri,
 * varsayılanlar ve veri akışı beyanla KAPANMAZ: ödemesiz hesapta reklam
 * yayınlanmaz, "kapsam dışı" demek yalan olur. Yeni bir öğe eklemek bir ürün
 * kararıdır; buraya tek satır eklemek değil.
 *
 * Platformun bütünüyle kullanılmaması AYRI bir beyan
 * (`workspace_kurulum.kullanilmayan_platformlar`, `kurulumPlatformBeyaniSchema`):
 * o adımları listeden düşürür. Buradakiler tek tek parçaları kapatır.
 */

/** Workspace düzeyinde beyan edilebilenler. */
export const WORKSPACE_BEYAN_OGELERI = [
  /**
   * "Web sitemiz yok" (kullanıcı kararı, 2026-10-13). Dönüşüm ölçümü ve Meta
   * pikseli adımlarını kapsam dışı bırakır; AdvCampaign'de site isteyen
   * amaçlar kapanır (`siteYokRehberKapisi`).
   */
  'site_yok',
  /** "Fiziksel adresimiz yok" — adres + harita konumu parçası. */
  'adres',
  /** "Bildirim istemiyoruz" — bildirim kanalı parçası. */
  'bildirim',
  /** "Bu workspace'i yalnız şirket yöneticileri yönetiyor" — sorumlu kişi parçası. */
  'erisim',
] as const;
export type WorkspaceBeyanOgesi = (typeof WORKSPACE_BEYAN_OGELERI)[number];

/**
 * Şirket düzeyinde beyan edilebilenler. İki adımlı doğrulama zorunluluğu
 * için yöneticinin "zorunlu tutmuyoruz" beyanı yeterli (kullanıcı kararı,
 * 2026-10-13): zorunluluk müşteri şirketinin kişilerinin girişini
 * kilitleyebilir; önemli olan kararın BİLİNÇLİ verilmiş ve yazılı olması.
 */
export const SIRKET_BEYAN_OGELERI = ['iki_adim'] as const;
export type SirketBeyanOgesi = (typeof SIRKET_BEYAN_OGELERI)[number];

/**
 * İkisinin birleşimi — `kurulum_beyanlari.oge` CHECK kısıtının listesi.
 * Ajan 2: migration'daki CHECK bu listeyle karşılaştırılmalı (spec, `fatura-zip`
 * deseni); ayrışırlarsa INSERT üretimde patlar.
 */
export const KURULUM_BEYAN_OGELERI = [...WORKSPACE_BEYAN_OGELERI, ...SIRKET_BEYAN_OGELERI] as const;
export type KurulumBeyanOgesi = (typeof KURULUM_BEYAN_OGELERI)[number];

/** Ekranda ve son kontrolde görünen ad (beyanın kendisi, "biz … " dili). */
export const KURULUM_BEYAN_OGESI_ADI: Record<KurulumBeyanOgesi, string> = {
  site_yok: 'Web sitemiz yok',
  adres: 'Fiziksel adresimiz yok',
  bildirim: 'Bildirim istemiyoruz',
  erisim: 'Bu workspace’i yalnız şirket yöneticileri yönetiyor',
  iki_adim: 'İki adımlı doğrulamayı zorunlu tutmuyoruz',
};

const gerekce = z.string().trim().max(300).optional();

/**
 * `PUT /clients/:id/kurulum/beyan` gövdesi. `kapsamDisi: false` beyanı GERİ
 * ALIR (satır silinir, denetim kaydı kalır). Ödeme/hesap gibi kapanamaz
 * öğeler şemada YOK: göndermek 400.
 */
export const kurulumBeyaniSchema = z.object({
  oge: z.enum(WORKSPACE_BEYAN_OGELERI),
  kapsamDisi: z.boolean(),
  gerekce,
});
export type KurulumBeyaniIstegi = z.infer<typeof kurulumBeyaniSchema>;

/** `PUT /kurulum/sirket/beyan` gövdesi — org yöneticisi. */
export const sirketKurulumBeyaniSchema = z.object({
  oge: z.enum(SIRKET_BEYAN_OGELERI),
  kapsamDisi: z.boolean(),
  gerekce,
});
export type SirketKurulumBeyaniIstegi = z.infer<typeof sirketKurulumBeyaniSchema>;

/**
 * Okunan beyan. `kurulum_beyanlari` satırının yanıt hâli.
 *
 * `beyanEden` NULL olabilir: kullanıcı silinmişse (`ON DELETE SET NULL`) ya
 * da adı RLS yüzünden okunamıyorsa. Ad `LEFT JOIN users` ile alınır;
 * `INNER JOIN` beyanın KENDİSİNİ süzerdi (CLAUDE.md "RLS'li bir tabloya
 * yapılan INNER JOIN ana satırı sessizce süzüyor") ve kapsam dışı bir öğe
 * sessizce "eksik"e dönerdi.
 */
export interface KurulumBeyani {
  oge: KurulumBeyanOgesi;
  /** NULL = şirket düzeyi (`iki_adim`). */
  clientId: string | null;
  gerekce: string | null;
  beyanEden: { id: string; ad: string } | null;
  /** ISO zaman damgası. */
  tarih: string;
}

/**
 * Beyan listesinde öğe var mı — ÜÇ HÂLLİ.
 *
 *   · `true` / `false` — liste okundu.
 *   · `null`  — liste OKUNAMADI. "Beyan yok" DEĞİL: okunamayan beyanı yok
 *     saymak, kapsam dışı bir öğeyi "eksik" diye gösterip kullanıcıyı
 *     verdiği kararı yeniden vermeye gönderir.
 */
export function beyanVarMi(
  beyanlar: readonly Pick<KurulumBeyani, 'oge'>[] | null,
  oge: KurulumBeyanOgesi,
): boolean | null {
  if (beyanlar === null) return null;
  return beyanlar.some((b) => b.oge === oge);
}
