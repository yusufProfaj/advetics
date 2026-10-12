import type { Permission } from '../auth/roles';

/**
 * ═══ UÇ LİSTESİ — TEK KAYNAK (sinyal/strateji deseni) ═══
 *
 * Ajan 2 controller'ları bu listeye göre yazar; Ajan 4 controller'daki
 * rota/izin çiftlerinin BURAYLA aynı olduğunu kaynak taramasıyla kilitler.
 * Bütün uçlar `withTenant` altında; platform çağrısı yapanlar (`secenekler`,
 * `yenile`) çağrıyı TRANSACTION DIŞINDA yapar (5 sn sınırı).
 *
 * İZİN KARARLARI (MIMARI Ç-8):
 * - Bağla/kaldır `connection.manage`: kaynak bağlamak hesap ATAMASIYLA aynı
 *   ağırlıkta, bir workspace'in verisinin NEREDEN geldiğine karar veriyor;
 *   yanlış mülk iki müşterinin sitesini karıştırır.
 * - Seçenekler `connection.write`: platforma gidip mülk listesi çekiyor.
 * - Yenile/duraklat `connection.write` (izlemeyi aç/kapat ile aynı iş).
 * - Rapor okuma `insights.read`: müşteri hesabı da görür (Raporlar ve
 *   Genel Bakış'ta olduğu gibi); bağlantı ekranını görmez.
 */
export const KAYNAK_UCLARI = [
  { yontem: 'GET', yol: '/veri-kaynaklari', izin: 'client.read', paket: 'F1', ne: 'Workspace kaynakları + bağlanabilir türler ve engeli' },
  { yontem: 'GET', yol: '/veri-kaynaklari/secenekler', izin: 'connection.write', paket: 'F1', ne: 'Türe göre seçilebilir mülkler (Google/Meta bağlantısından, platforma gider)' },
  { yontem: 'POST', yol: '/veri-kaynaklari', izin: 'connection.manage', paket: 'F1', ne: 'Bağla (kaynakBaglaSchema); yapı + geçmiş kuyruğa' },
  { yontem: 'DELETE', yol: '/veri-kaynaklari/:id', izin: 'connection.manage', paket: 'F1', ne: 'Kaldır (durum=kaldirildi, veri kalır)' },
  { yontem: 'POST', yol: '/veri-kaynaklari/:id/yenile', izin: 'connection.write', paket: 'F1', ne: 'Şimdi yenile (etkileşimli katman)' },
  { yontem: 'POST', yol: '/veri-kaynaklari/:id/duraklat', izin: 'connection.write', paket: 'F1', ne: 'Çekimi durdur / sürdür' },
  { yontem: 'GET', yol: '/veri-kaynaklari/ga4/trafik', izin: 'insights.read', paket: 'F1', ne: 'Dönem trafiği: kaynak/ortam/kampanya, eşleme sonucu' },
  { yontem: 'GET', yol: '/veri-kaynaklari/takip-acigi', izin: 'insights.read', paket: 'F1', ne: 'TakipAcigiYaniti' },
  { yontem: 'GET', yol: '/veri-kaynaklari/arama-ortusmesi', izin: 'insights.read', paket: 'F2', ne: 'Organik + ücretli arama örtüşmesi' },
  { yontem: 'GET', yol: '/veri-kaynaklari/urun-performansi', izin: 'insights.read', paket: 'F3', ne: 'Ürün başına harcama → gelir + etiket' },
] as const satisfies ReadonlyArray<{ yontem: string; yol: string; izin: Permission; paket: 'F1' | 'F2' | 'F3'; ne: string }>;
