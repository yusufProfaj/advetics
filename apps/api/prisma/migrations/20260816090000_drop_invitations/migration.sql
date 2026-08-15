-- DAVET AKIŞI KALDIRILDI — kullanıcı doğrudan ekleniyor
--
-- Tablo üretimde ÇALIŞMIYORDU ve bu tasarımdan değil, eksiklikten geliyordu:
-- `members.service.ts` daveti oluştururken rastgele bir token üretiyor,
-- SHA-256 hash'ini bu tabloya yazıyor ve DÜZ METNİ ATIYORDU — token yalnızca
-- `NODE_ENV !== 'production'` iken log'a düşüyordu. E-posta altyapısı da
-- olmadığı için (bildirim katmanı hiç yazılmadı) üretimde kimsenin daveti
-- kabul etmesine imkân yoktu. Panel bunu ekranda itiraf ediyordu bile:
-- "Davet bağlantısı e-postayla GÖNDERİLMİYOR".
--
-- Yani tablo yalnızca kullanılamayan satırlar biriktiriyordu. Yerine ekibe
-- doğrudan kullanıcı ekleme geldi: parolayı ekleyen yönetici belirliyor ve
-- kullanıcıya kendi iletiyor.
--
-- VERİ KAYBI: bekleyen davetler siliniyor. Zaten kabul edilemez durumdaydılar;
-- kimin kimi davet ettiği bilgisi `audit_logs` içinde duruyor ve o tablo
-- append-only.
--
-- E-posta altyapısı geldiğinde davet akışı geri istenirse bu migration'ı geri
-- almak değil, yeniden tasarlamak gerekir — çünkü asıl eksik olan tablo değil
-- gönderim katmanıydı.

DROP TABLE "invitations";

-- Enum tabloyla birlikte gidiyor. Ayrı satır olmak zorunda: Postgres tabloyu
-- düşürünce tipi kendiliğinden düşürmüyor ve geride kimsenin kullanmadığı bir
-- tip kalırdı.
DROP TYPE "InvitationStatus";
