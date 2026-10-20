import { baglanti } from '@/lib/baglanti';
import { sec, type Dil } from '@advetics/shared';
import { reklamYoneticisiSozlugu } from '@/dil/sozlukler/reklam-yoneticisi';

/**
 * REKLAM YÖNETİCİSİ'NİN ADRESİ — iniş tablolarının (şirket → workspace →
 * hesap → kampanya → reklam seti → reklam) tek hedefi.
 *
 * 2026-10-09'a kadar bu tablolar Genel Bakış'taydı ve bağlantıları
 * `/dashboard` sabitini elle yazıyordu (beş ayrı yerde). Tablo taşınınca biri
 * unutulsaydı kullanıcı bir satıra tıklayıp Genel Bakış'a düşer ve aradığı
 * kampanyayı orada bulamazdı; hata yok, sadece yanlış sayfa. Adres
 * `/ads-explorer` kaldı: paylaşılmış bağlantılar kırılmasın.
 */
export const REKLAM_YONETICISI = '/ads-explorer';

/**
 * ═══ SAĞ ÜSTTEKİ "OLUŞTUR" SEKMEYE GÖRE (kullanıcı, 2026-10-16) ═══
 * Kampanyalar → Yeni kampanya, Reklamlar → Reklam, Hedef kitleler → Hedef
 * kitle. Kampanya ve reklam AdvCampaign'de kuruluyor (reklam kurmanın tek
 * yolu, CLAUDE.md §5); hedef kitle 2026-10-20'den beri Reklam Yöneticisi'nin
 * kendi "Kayıtlı kitleler" görünümünde yeni kitle panelini açıyor (önce
 * kullanıcıyı Base › Varlıklar'a gönderiyordu). Yetkisi olmayana düğme çıkmıyor. Saf fonksiyon: sekme →
 * düğme eşlemesi testte doğrudan sınanıyor.
 */
export function olusturDugmesi(
  sekme: string,
  clientId: string | null,
  yetki: { reklam: boolean; kitle: boolean },
  dil: Dil = 'tr',
): { etiket: string; href: string } | null {
  const e = sec(reklamYoneticisiSozlugu, dil).olustur;
  if (sekme === 'kitle') {
    return yetki.kitle && clientId ? { etiket: e.kitle, href: baglanti(REKLAM_YONETICISI, { seviye: 'kitle', yeni: '1' }) } : null;
  }
  if (!yetki.reklam) return null;
  const href = clientId ? baglanti('/reklam', { musteri: clientId }) : '/reklam';
  if (sekme === 'ad') return { etiket: e.reklam, href };
  return { etiket: e.kampanya, href };
}
