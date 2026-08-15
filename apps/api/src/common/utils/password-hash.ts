import * as argon2 from 'argon2';

/**
 * Parola hash parametreleri — TEK KAYNAK.
 *
 * İki yerde parola hash'leniyor: kayıt/sıfırlama akışları (`auth.service.ts`)
 * ve ekibe kullanıcı ekleme (`members.service.ts`). Parametreleri iki dosyada
 * ayrı ayrı tutmak, birini güncelleyip diğerini unutmanın kapısıydı — ve bu
 * sessiz bir sapma olurdu: argon2 doğrulama sırasında parametreleri hash'in
 * içinden okuduğu için giriş yine çalışır, yalnızca bir grup kullanıcının
 * parolası diğerlerinden zayıf korunmuş olurdu. Hiçbir test, hiçbir log bunu
 * göstermezdi.
 *
 * Değerler OWASP'ın argon2id önerisi: 19 MiB bellek, 2 tur, tek iş parçacığı.
 */
export const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP önerisi
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTIONS);
}
