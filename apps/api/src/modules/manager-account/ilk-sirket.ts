import type { Prisma } from '@prisma/client';
import { uniqueSlug } from '../../common/utils/slug';

/**
 * ═══ ÜST HESAP HİÇBİR ZAMAN ŞİRKETSİZ OLAMAZ ═══
 *
 * Bir üst hesabın altında sıfır şirket varsa içine GİRİLEMİYOR: bağlamın
 * bir `orgId`si olmak zorunda (RLS'in sınırı ve 21 yazma yolunun hedefi) ve
 * girilecek şirket yoksa çözüm ev şirketine düşüyordu. Platform sahibinin
 * ev şirketi Advetics; yani yeni müşterinin hesabına "giren" platform sahibi
 * aslında Advetics'in verisine bakıyordu ve Profaj'ın platform bağlantıları
 * yeni hesapta görünüyordu. Kullanıcının tarifi birebir: *"profaj
 * reklamcılıkta bulunan platform bağlantısı yeni üst hesaba geçiyor."*
 *
 * Çözüm iki yerden aynı fonksiyonu çağırıyor:
 *   · KURULUŞTA — platform sahibi hesap açınca ilk şirket hemen açılıyor.
 *   · GEÇİŞTE — daha önce şirketsiz açılmış bir hesaba girerken (üretimde
 *     böyle bir hesap VAR) ilk şirket o anda açılıyor. Reddetmek, kimsenin
 *     giremediği için kimsenin şirket ekleyemediği bir hesap bırakırdı.
 *
 * İlk şirket üst hesabın ADIYLA açılıyor: müşteri tek şirketse zaten odur,
 * değilse yeniden adlandırır. Boş ad sormak, kurulumu yarım bırakan bir
 * ekran demekti.
 *
 * AYRI DOSYA, DI'SIZ: iki ayrı Nest modülü (auth, manager-account) aynı
 * işi yapıyor. Birinin servisini diğerine enjekte etmek modül grafiğini
 * dolaştırırdı; düz bir fonksiyon `tx` alıyor ve ikisi de çağırıyor.
 */
export async function ilkSirketAc(
  tx: Prisma.TransactionClient,
  girdi: { managerAccountId: string; ad: string; userId: string },
): Promise<{ id: string; slug: string }> {
  const slug = await uniqueSlug(girdi.ad, async (aday) =>
    Boolean(await tx.organization.findUnique({ where: { slug: aday }, select: { id: true } })),
  );
  const org = await tx.organization.create({
    data: { name: girdi.ad, slug, managerAccountId: girdi.managerAccountId },
    select: { id: true, slug: true },
  });
  // ÜYELİK `clientId: null` — org geneli. Henüz workspace yok ve org geneli
  // olmayan bir satır, açan kişiyi kendi şirketinden dışarıda bırakırdı.
  await tx.membership.create({
    data: { userId: girdi.userId, orgId: org.id, clientId: null, role: 'admin' },
  });
  return org;
}
