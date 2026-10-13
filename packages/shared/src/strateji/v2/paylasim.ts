import { z } from 'zod';
import type { StratejiDurumu } from './durum';

/**
 * ═══ GİRİŞSİZ ONAY BAĞLANTISI (kullanıcı kararı 2, 2026-10-13) ═══
 *
 * Müşteri stratejiyi panele girmeden, bir bağlantıyla okuyup ONAYLAYABİLİR
 * ya da REVİZYON isteyebilir. Emsal: performans raporu paylaşım bağlantısı
 * (`apps/api/src/modules/reports/share.service.ts`, `apps/web/src/app/r/[token]`).
 *
 * Bu bağlantı rapor bağlantısından TEHLİKELİ: rapor yalnız okunur, bu ise
 * bir KARAR yazar ve o karar ajansın kampanya kurmasının kapısı. Kurallar:
 *
 * 1. TOKEN: 32 bayt `randomBytes`, base64url (43 karakter). Veritabanında
 *    YALNIZ SHA-256 özeti; ham token bir kez, oluşturan yanıtında döner ve
 *    bir daha okunamaz. Kayıtta, logda, denetim kaydında ham token YOK.
 * 2. TEK PLAN, TEK SÜRÜM: bağlantı `(plan_id, surum)`a bağlı. Plan bu
 *    sürümden ayrılırsa (geri çekildi, revizyonla düzenlendi) bağlantı
 *    okunabilir kalabilir ama KARAR VERDİRMEZ: müşteri gördüğünden farklı
 *    bir belgeyi onaylamış olmasın.
 * 3. SÜRELİ: en çok `ONAY_BAGLANTISI_EN_UZUN_GUN`; süresiz bağlantı YOK
 *    (rapor bağlantısından farkı bu).
 * 4. İPTAL EDİLEBİLİR ve plan başına TEK AÇIK bağlantı: yenisi
 *    oluşturulunca eskisi aynı transaction'da iptal edilir. İletilen eski bir
 *    maildeki bağlantı ikinci bir karar yazamasın.
 * 5. TEK KULLANIMLIK KARAR: ilk karar (onay ya da revizyon) bağlantıyı
 *    TÜKETİR. Tüketme koşullu UPDATE ile (`kullanildi_at IS NULL AND
 *    iptal_at IS NULL AND surum = $plan_surum ... RETURNING`): iki sekmeden
 *    aynı anda gelen iki karar için yalnız biri satır döndürür.
 * 6. KİMLİK BEYANI: karar verenin adı ve e-postası ZORUNLU ve kayda
 *    alınır (`onaylayan_ad`, `onaylayan_eposta`, `onay_rolu = 'baglanti'`);
 *    bunlar kişinin beyanı, doğrulanmış kimlik DEĞİL ve ekran/PDF bunu
 *    "Onay bağlantısıyla onaylandı · Ad Soyad (e-posta)" diye yazar.
 *    IP ve tarayıcı bilgisi denetim kaydına (audit_logs) gider, belgeye değil.
 * 7. KÖTÜYE KULLANIMA KARŞI: biçimi tutmayan token VERİTABANINA
 *    sorulmadan reddedilir; geçersiz/iptal/süresi dolmuş AYIRT EDİLMEZ (hepsi
 *    aynı cevap — rapor bağlantısındaki gibi, var olanı tahmin ettirmez);
 *    IP başına deneme sınırı; sayfa `noindex` + `Referrer-Policy:
 *    no-referrer` (token yolda, başka siteye sızmasın); yanıtta ajansın iç
 *    notu, yorumların ajans içi olanları, kişi e-postaları YOK.
 */

export const ONAY_TOKEN_BAYT = 32;
/** base64url(32 bayt) = 43 karakter, dolgusuz. */
export const ONAY_TOKEN_DESENI = /^[A-Za-z0-9_-]{43}$/;
export const ONAY_BAGLANTISI_EN_UZUN_GUN = 30;
export const ONAY_BAGLANTISI_VARSAYILAN_GUN = 14;
/** IP başına, pencere içinde en çok bu kadar token denemesi (okuma + karar). */
export const ONAY_BAGLANTISI_DENEME_SINIRI = { istek: 30, pencereDk: 15 } as const;

/** Veritabanına sormadan önce: biçimsiz token bir sorgu bile harcatmasın. */
export function onayTokenBicimiGecerli(token: string): boolean {
  return ONAY_TOKEN_DESENI.test(token);
}

/** Panelden bağlantı oluşturma (`strategy.write`). Sürüm ekranın gördüğü sürüm; uyuşmazsa 409. */
export const onayBaglantisiOlusturSchema = z.object({
  surum: z.number().int().positive(),
  sureGun: z.number().int().min(1).max(ONAY_BAGLANTISI_EN_UZUN_GUN).default(ONAY_BAGLANTISI_VARSAYILAN_GUN),
});
export type OnayBaglantisiOlusturGirdisi = z.input<typeof onayBaglantisiOlusturSchema>;

/** Bağlantıdan karar (girişsiz). Revizyonda yorum ZORUNLU. */
export const baglantiKarariSchema = z
  .object({
    karar: z.enum(['onayla', 'revizyon_iste']),
    ad: z.string().trim().min(3, 'Adınızı ve soyadınızı yazın').max(120),
    eposta: z.string().trim().toLowerCase().email('Geçerli bir e-posta yazın').max(254),
    yorum: z.string().trim().max(2000).optional(),
    /** Ekranın gördüğü sürüm: bağlantının sürümüyle aynı olmalı (eski sekme). */
    surum: z.number().int().positive(),
  })
  .refine((v) => v.karar !== 'revizyon_iste' || (v.yorum ?? '').length > 0, {
    message: 'Revizyon isterken ne değişmesi gerektiğini yazın',
    path: ['yorum'],
  });
export type BaglantiKarariGirdisi = z.infer<typeof baglantiKarariSchema>;

/**
 * Bağlantının o anki hâli — SAF; servis hem okumada hem kararda bunu koşar.
 * Sıra önemli: iptal ve süre, sürüm sorusundan ÖNCE (iptal edilmiş bir
 * bağlantıya "sürüm değişti" demek, bağlantının hâlâ bir şeye yaradığını
 * ima ederdi).
 *
 * `okunabilir`: belge gösterilir mi. `karar`: karar düğmeleri açık mı.
 */
export const BAGLANTI_HALLERI = ['gecerli', 'kullanildi', 'surum_degisti', 'karar_beklemiyor', 'suresi_doldu', 'iptal'] as const;
export type BaglantiHali = (typeof BAGLANTI_HALLERI)[number];

export const BAGLANTI_HALI_METNI: Record<BaglantiHali, string> = {
  gecerli: '',
  kullanildi: 'Bu strateji için karar verildi. Teşekkürler.',
  surum_degisti: 'Strateji bu bağlantı gönderildikten sonra değişti. Ajansınızdan güncel bağlantıyı isteyin.',
  karar_beklemiyor: 'Bu strateji şu an onay beklemiyor.',
  suresi_doldu: 'Bağlantı geçersiz.',
  iptal: 'Bağlantı geçersiz.',
};

export function baglantiHali(
  b: { surum: number; sonGecerlilik: string; iptalZamani: string | null; kullanildiZamani: string | null },
  plan: { durum: StratejiDurumu; surum: number },
  simdi: Date,
): { hal: BaglantiHali; okunabilir: boolean; karar: boolean } {
  if (b.iptalZamani !== null) return { hal: 'iptal', okunabilir: false, karar: false };
  if (new Date(b.sonGecerlilik).getTime() <= simdi.getTime()) return { hal: 'suresi_doldu', okunabilir: false, karar: false };
  // Plan iptal edildiyse bağlantı da ölü: iptal edilmiş bir stratejiyi müşteriye göstermek kafa karıştırır.
  if (plan.durum === 'iptal') return { hal: 'iptal', okunabilir: false, karar: false };
  if (b.kullanildiZamani !== null) return { hal: 'kullanildi', okunabilir: true, karar: false };
  if (plan.surum !== b.surum) return { hal: 'surum_degisti', okunabilir: false, karar: false };
  if (plan.durum !== 'onayda') return { hal: 'karar_beklemiyor', okunabilir: true, karar: false };
  return { hal: 'gecerli', okunabilir: true, karar: true };
}

/** Panelde bağlantı satırı (ham token YOK; yalnız oluşturma yanıtında). */
export interface OnayBaglantisiOzeti {
  id: string;
  planId: string;
  surum: number;
  olusturan: { id: string; ad: string | null };
  olusturuldu: string;
  sonGecerlilik: string;
  iptalZamani: string | null;
  kullanildiZamani: string | null;
  /** Bağlantıyla verilen karar (varsa). */
  karar: { tur: 'onayla' | 'revizyon_iste'; ad: string; eposta: string } | null;
}

/** `POST /strateji/planlar/:id/onay-baglantisi` yanıtı — ham token YALNIZ burada. */
export interface OnayBaglantisiOlusturuldu {
  baglanti: OnayBaglantisiOzeti;
  /** Panel adresi (`onayBaglantisiYolu(token)`), mail gövdesine bu girer. */
  yol: string;
}
