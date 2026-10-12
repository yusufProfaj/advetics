/**
 * ═══ HAFTALIK ÖZET — Paket B sözleşmesi ═══
 *
 * Mimari: `docs/haftalik-ozet/MIMARI.md`. Taslak: `docs/haftalik-ozet/taslak.html`.
 *
 * AYRI MODÜL, `reports`un ALT PARÇASI DEĞİL: zamanlayıcısı ve müşteri
 * gönderim yolu `reports`ta (report_schedules, RaporGonderService) ama
 * içeriği Paket A sinyallerini, Paket C etkilerini ve Genel Bakış bekleyen
 * işlerini okuyor; ajans görünümü Paket A kanallarından gidiyor. Hepsini
 * `reports`a koymak, rapor modülünün üç modüle bağımlı olması demekti.
 * İKİNCİ BİR ZAMANLAYICI VE GÖNDERİCİ YOK (MIMARI § 5).
 */
export * from './hafta';
export * from './yorum';
export * from './ozet';
export * from './baglanti';
