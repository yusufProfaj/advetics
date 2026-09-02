/**
 * ═══ RAPOR SORGUSU — TEK ÜRETİCİ ═══
 *
 * CANLIDA GÖRÜLEN HÂL: kullanıcı rapor ekranında şablonu değiştiriyor,
 * ÖNİZLEME değişiyor, indirdiği PDF DEĞİŞMİYOR. Belirti kullanıcının
 * cümlesiyle *"şablonu değiştirdiğimde pdf oluşturamıyorum"*.
 *
 * SEBEP: aynı raporu isteyen üç yol vardı ve her biri kendi sorgu dizesini
 * ELLE kuruyordu.
 *
 *   · önizleme  `/reports/preview` → `clientId, from, to, sablon`   ✅
 *   · PDF       `/reports/pdf`     → `clientId, from, to`           ❌
 *   · mail      `/reports/mail`    → `clientId, from, to`           ❌
 *
 * Hiçbiri hata vermiyor: üçü de geçerli bir istek ve sunucu şablon
 * verilmediğinde varsayılanı üretiyor. Yani ekranda Google raporunu gören
 * kullanıcı, Genel raporu indiriyor ve bunu ancak PDF'i AÇINCA anlıyor.
 * CLAUDE.md'deki "BAĞLANTIYI ELLE BİRLEŞTİRME — SÜZGEÇ DÜŞÜYOR" kuralı bire
 * bir bu; orada panel süzgeçleri kayboluyordu, burada şablon.
 *
 * ┌─ NEDEN EKRANDA TEK PARAMETRE, API'DE İKİ ALAN ────────────────────────┐
 * │ API `templateId` (UUID) ile `sablon` (ön ayar kodu) alanlarını AYRI    │
 * │ tutuyor ve bu doğru: tek alan olsaydı doğrulama hem UUID'yi hem        │
 * │ "google"ı kabul etmek zorunda kalır, bozuk bir UUID de sessizce        │
 * │ "bilinmeyen şablon" sayılırdı.                                         │
 * │                                                                        │
 * │ Ama EKRAN için ikisi tek bir sorunun cevabı: "hangi şablon". İki ayrı  │
 * │ URL parametresi taşımak, dallardan birinin birini düşürmesi demekti —  │
 * │ düzeltilen hatanın ta kendisi. Ekran tek `sablon` parametresi taşıyor; │
 * │ UUID mi ön ayar kodu mu olduğu BURADA, tek yerde ayrılıyor.            │
 * └────────────────────────────────────────────────────────────────────────┘
 */
import { VARSAYILAN_SABLONLAR } from './schemas/report.schema';

/** Rapor ekranının URL'de taşıdığı şablon parametresinin adı. */
export const SABLON_PARAM = 'sablon';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ekrandaki tek `sablon` değerini API'nin iki alanına ayırır.
 *
 * TANINMAYAN DEĞER SESSİZCE DÜŞÜYOR ve bu bilinçli: adres çubuğuna elle
 * yazılan ya da silinmiş bir şablona işaret eden bir değer yüzünden raporun
 * hiç üretilmemesi, kullanıcıyı sebebi yazmayan boş bir ekranla baş başa
 * bırakırdı. Sunucu bu durumda varsayılan şablonu üretiyor — ve ekran hangi
 * şablonun kullanıldığını zaten yazıyor.
 */
export function sablonAlanlari(sablon: string | null | undefined): {
  templateId?: string;
  sablon?: string;
} {
  if (!sablon) return {};
  if (UUID.test(sablon)) return { templateId: sablon };
  return VARSAYILAN_SABLONLAR.some((s) => s.kod === sablon) ? { sablon } : {};
}

/**
 * `/reports/preview`, `/reports/pdf` ve `/reports/mail` için sorgu dizesi.
 *
 * ÜÇÜ DE BURADAN GEÇMEK ZORUNDA. `rapor-sorgusu.spec.ts` kaynak taramasıyla
 * bunu kilitliyor: bu üç uca elle kurulmuş bir `URLSearchParams` gitmesi,
 * düzeltilen hatanın geri gelmesi demek.
 */
export function raporSorgusu(p: {
  clientId: string;
  from: string;
  to: string;
  sablon?: string | null;
}): Record<string, string> {
  /*
   * `URLSearchParams` DEĞİL DÜZ NESNE dönüyor: bu paket hem API (Node) hem
   * panel (tarayıcı) tarafından kullanılıyor ve tip kütüphanesi ikisinin
   * kesişimi. Çağıran taraf tek satırda `new URLSearchParams(...)` yapıyor;
   * alanların NE OLDUĞU yine tek yerde kalıyor ve düzeltilen hata da tam
   * olarak oydu.
   */
  return {
    clientId: p.clientId,
    from: p.from,
    to: p.to,
    ...sablonAlanlari(p.sablon),
  };
}
