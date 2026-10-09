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
