/**
 * ═══ LEAD KALİTESİNİ PLATFORMA GERİ BESLEME — Paket E sözleşmesi ═══
 *
 * Mimari: `docs/geri-besleme/MIMARI.md`. Taslak: `docs/geri-besleme/taslak.html`.
 *
 * AYRI MODÜL, `leads`in ALT PARÇASI DEĞİL: lead modülü kaydı ALIYOR
 * (webhook, mutabakat), bu modül sonucu platforma GÖNDERİYOR. Gönderim kendi
 * kuyruğu, kendi durum makinesi ve kendi platform hatası sözlüğüyle geliyor;
 * `leads.service` içine koymak, okuma servisinin platform yazmasına bağımlı
 * olması demekti. Paket A'nın (`sinyal`) HTTP sınıflandırıcısını tüketir,
 * değiştirmez.
 */
export * from './asama';
export * from './olay';
export * from './google';
export * from './ayar';
export * from './uclar';
