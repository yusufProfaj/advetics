import type { Permission } from '../auth/roles';

/**
 * ═══ UÇ LİSTESİ — TEK KAYNAK (sinyal/uclar.ts deseni) ═══
 *
 * Ajan 2 controller'ları bu listeye göre yazar; Ajan 4 kaynak taramasıyla
 * rota/izin çiftlerinin BURAYLA aynı olduğunu kilitler.
 *
 * KALİTE İŞARETİ İÇİN YENİ UÇ YOK. Var olan `PUT /leads/:id` (`lead.write`)
 * durumu yazıyor; Ajan 2 aynı transaction'da geçmiş satırını ve
 * `asamaPlani` sonucunu yazar. İkinci bir "kalite işaretle" ucu, aynı
 * kararın iki yoldan yazılması ve birinin geçmişi atlaması olurdu.
 *
 * PLATFORM ÇAĞRISI YALNIZ `kontrol` ucunda (dataset okuma) ve gönderim
 * İŞİNDE; ikisi de TRANSACTION DIŞINDA.
 *
 * İZİN KARARLARI (MIMARI Ç-10):
 * - Okuma `lead.read`: Potansiyel Müşteriler ekranının izni.
 * - Ayar yazma `connection.manage`: workspace'in verisini bir platforma
 *   AKTARMAYI başlatıyor ve hangi dataseti eğiteceğini seçiyor; hesap atama
 *   ile aynı ağırlıkta bir karar. `lead.write` yetmez: her lead'i işaretleyen
 *   kişinin veri aktarımını açabilmesi gerekmiyor.
 * - Yeniden dene `lead.write`: platforma yeni bir veri türü göndermiyor,
 *   kalmış olanı tekrar sıraya koyuyor.
 */
export const GERI_BESLEME_UCLARI = [
  { yontem: 'GET', yol: '/geri-besleme/ayar', izin: 'lead.read', ne: 'Ayar + türetilmiş durum + uygunluk + dataset seçenekleri' },
  { yontem: 'PUT', yol: '/geri-besleme/ayar', izin: 'connection.manage', ne: 'Aç/kapat, dataset seç, aydınlatma onayı (denetim kaydı)' },
  { yontem: 'POST', yol: '/geri-besleme/ayar/kontrol', izin: 'connection.manage', ne: 'Dataset erişimini ve is_crm bilgisini Meta’dan oku' },
  { yontem: 'GET', yol: '/geri-besleme/olaylar', izin: 'lead.read', ne: 'Gönderim geçmişi (durum, deneme, platformun cümlesi)' },
  { yontem: 'POST', yol: '/geri-besleme/olaylar/yeniden-dene', izin: 'lead.write', ne: 'Gönderilemeyenleri yeniden sıraya koy (7 gün içindeyse)' },
] as const satisfies ReadonlyArray<{ yontem: string; yol: string; izin: Permission; ne: string }>;
