import { BadRequestException } from '@nestjs/common';

/**
 * ATANMAMIŞ REKLAM HESABI KONTROLÜ — tek kapı.
 *
 * Bağlantılar ajans seviyesine taşındıktan sonra `ad_accounts.client_id`
 * nullable: NULL demek "ajansın havuzunda duruyor, henüz hiçbir müşteriye
 * atanmadı" demek. Ajansın tek Meta kimliği 157, tek Google girişi 127 hesaba
 * erişiyor ve bunların çoğu hiçbir zaman bir müşteriye atanmayacak.
 *
 * NEDEN ERKEN HATA, NEDEN SESSİZ GEÇİŞ DEĞİL:
 *
 * Atanmamış bir hesap için senkronizasyon kuyruğa girerse `client_id`'si NULL
 * bir `sync_jobs` satırı oluşur. O satırı RLS politikası KİMSEYE göstermez —
 * `app.can_access_client(NULL)` daima NULL, yani false. İş kuyrukta çalışır,
 * belki de yazar, ama panelde hiç görünmez: ne "çalışıyor", ne "başarısız".
 * Bu projedeki hataların neredeyse tamamı tam olarak bu şekilde, SESSİZCE
 * kayboldu.
 *
 * `string | null` alan her yer bu fonksiyondan geçmek zorunda değil — toplu
 * dolaşan kod yollarında (portföy senkronizasyonu gibi) doğru davranış hesabı
 * ATLAMAK ve KAÇ TANE atlandığını raporlamak. Fonksiyon, tek bir hesaba
 * kilitlenmiş yollar içindir: orada atlamak yapacak iş bırakmaz.
 */
export function requireAssignedClientId(account: {
  id: string;
  name?: string;
  clientId: string | null;
}): string {
  if (account.clientId === null) {
    throw new BadRequestException(
      `Bu reklam hesabı (${account.name ?? account.id}) henüz bir müşteriye ` +
        `atanmamış. Platform Bağlantıları ekranından hesabı bir müşteriye atayın; ` +
        `atanmamış hesap senkronize edilmez.`,
    );
  }
  return account.clientId;
}

/** Atanmış hesap: `clientId` daralması tip seviyesinde taşınabilsin diye. */
export type AssignedAdAccount<T extends { clientId: string | null }> = Omit<T, 'clientId'> & {
  clientId: string;
};

/**
 * Hesabı atanmış olarak daraltır. Yukarıdaki fonksiyonun tipi taşıyan hâli:
 * çağıran, `account.clientId`'yi bundan sonra `string` olarak kullanabilir ve
 * her satırda tekrar `!` yazmak zorunda kalmaz.
 */
export function assertAssigned<T extends { id: string; name?: string; clientId: string | null }>(
  account: T,
): AssignedAdAccount<T> {
  requireAssignedClientId(account);
  return account as AssignedAdAccount<T>;
}
