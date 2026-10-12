import type { Permission } from '../auth/roles';

/**
 * ═══ UÇ LİSTESİ — TEK KAYNAK (strateji/uclar.ts deseni) ═══
 *
 * Ajan 2 controller'ları bu listeye göre yazar; Ajan 4 kaynak taramasıyla
 * controller'daki `@RequirePermissions`/rota çiftlerinin BURAYLA aynı
 * olduğunu kilitler. Bütün uçlar `withTenant` altında. PLATFORM ÇAĞRISI
 * YALNIZ `uygula` (CampaignActionsService) ve `dene` (webhook/SMTP) uçlarında
 * ve ikisi de TRANSACTION DIŞINDA (CLAUDE.md "platform çağrısı
 * transaction'ın içinde olamaz").
 *
 * İZİN KARARLARI (MIMARI Ç-9):
 * - Okuma `rule.read`: Sinyaller İyileştir'in sekmesi ve İyileştir menüsü
 *   `rule.read` ile açılıyor (nav-sections). Müşteri hesabında yok; sinyal
 *   ajansın iç bilgisi.
 * - Kapat/geri aç `rule.write`: platforma dokunmuyor, ama müşteri
 *   hesabının ajansın göreceği bir uyarıyı kapatabilmesi yanlış.
 * - Uygula `budget.write`: İyileştir Uygula ve Reklam Yöneticisi satır içi
 *   durdur ile AYNI izin (aynı platform yazması).
 * - Kanal yazma `client.write`: Marka Merkezi › Workspace ayarları
 *   bölümünün izni. Kanal listesi okuma `rule.read` (kural sihirbazı da
 *   kanalları listeliyor).
 */
export const SINYAL_SAYFA_IZNI: Permission = 'rule.read';

export const SINYAL_UCLARI = [
  { yontem: 'GET', yol: '/sinyaller', izin: 'rule.read', ne: 'Sinyal listesi + hesap durumları + boş neden' },
  { yontem: 'GET', yol: '/sinyaller/:id', izin: 'rule.read', ne: 'Tek sinyal (seri dahil)' },
  { yontem: 'POST', yol: '/sinyaller/:id/kapat', izin: 'rule.write', ne: 'Kullanıcı kapatır (not isteğe bağlı)' },
  { yontem: 'POST', yol: '/sinyaller/:id/geri-ac', izin: 'rule.write', ne: 'Kapatılanı geri açar' },
  { yontem: 'POST', yol: '/sinyaller/:id/uygula', izin: 'budget.write', ne: 'Durdur (özet kontrolü + geri okuma), sonra kapatır' },
  { yontem: 'GET', yol: '/bildirim/kanallar', izin: 'rule.read', ne: 'Workspace kanalları (tam adres YOK)' },
  { yontem: 'POST', yol: '/bildirim/kanallar', izin: 'client.write', ne: 'Kanal ekle (webhook şifreli saklanır)' },
  { yontem: 'PATCH', yol: '/bildirim/kanallar/:id', izin: 'client.write', ne: 'Ad, olaylar, etkin, alıcılar, adres' },
  { yontem: 'DELETE', yol: '/bildirim/kanallar/:id', izin: 'client.write', ne: 'Kanalı sil (gönderim geçmişi kalır)' },
  { yontem: 'POST', yol: '/bildirim/kanallar/:id/dene', izin: 'client.write', ne: 'Deneme mesajı gönder' },
  { yontem: 'POST', yol: '/bildirim/kanallar/:id/dogrula', izin: 'client.write', ne: '"Deneme mesajı geldi mi" cevabı' },
  { yontem: 'GET', yol: '/bildirim/gonderimler', izin: 'rule.read', ne: 'Son gönderimler (teslim durumu, hata)' },
] as const satisfies ReadonlyArray<{ yontem: string; yol: string; izin: Permission; ne: string }>;
