/**
 * ═══ DANIŞMAN ATAMA — KARARLAR ═══
 *
 * Bu dosya ekran çizmiyor: kimin atanabileceğine ve toplu atamanın nasıl
 * raporlanacağına burada karar veriliyor.
 *
 * NEDEN AYRI: ikisi de bu projede sessiz hata üretmeye en yatkın türden
 * kararlar (yanlış kişiyi atanabilir göstermek, kısmi başarıyı tam başarı
 * saymak) ve JSX'in içinde kaldıklarında sınanacak bir yüzeyleri yok —
 * mutasyon testi de yapılamıyor.
 */

export interface UyelikOzeti {
  /** NULL = organizasyon geneli erişim (owner/admin). */
  clientId: string | null;
}

/**
 * Bir danışmanın bu workspace'e ATANAMAMA sebebi — atanabiliyorsa `null`.
 *
 * Sebep DÖNÜYOR, satır gizlenmiyor. Gizlemek "bu kişi neden listede yok"
 * sorusunu cevapsız bırakıyor ve yönetici onu başka ekranlarda aramaya
 * başlıyor — panelde defalarca yaşanan hâl.
 */
export function adayEngeli(uyelikler: UyelikOzeti[], clientId: string): string | null {
  // ZATEN BU WORKSPACE'TE: sunucu mükerrer üyeliği 409 ile reddediyor.
  // Reddedileceği belli olan bir seçeneği göstermek, kullanıcıyı hata
  // almaya davet etmek olurdu.
  if (uyelikler.some((u) => u.clientId === clientId)) {
    return 'Bu workspace’e zaten erişiyor';
  }
  /*
   * ORG GENELİ ERİŞİM: sunucu bunu reddetmiyor — `clientId` farklı olduğu
   * için çakışma yok ve ikinci bir üyelik satırı YAZILIYOR. Yani engel
   * teknik değil anlamsal: kişi zaten her müşteriyi görüyor ve eklenen satır
   * yalnızca ekip listesinde kafa karıştıran ikinci bir yetki olurdu.
   */
  if (uyelikler.some((u) => u.clientId === null)) {
    return 'Tüm müşterilere erişiyor — ayrıca atanması gerekmiyor';
  }
  return null;
}

export interface AtamaSonucu {
  basarili: number;
  hatalar: string[];
}

/**
 * Seçilen danışmanları TEK TEK atar ve her birinin sonucunu ayrı sayar.
 *
 * KISMİ BAŞARI DOĞRU DAVRANIŞ: dört kişiden biri çakışıyorsa diğer üçünün
 * atanması gerekiyor. Ama kısmi başarı SÖYLENMEK zorunda — "atandı" deyip
 * üçünü atamak, atandığı sanılan kişinin panelde hiçbir şey görememesi ve
 * sebebinin hiçbir ekranda yazmaması demek.
 *
 * SIRAYLA, PARALEL DEĞİL. `Promise.all` ilk reddedilende geri kalanların
 * sonucunu belirsiz bırakıyor: bazıları yazılmış oluyor, hangileri olduğu
 * ekranda gösterilemiyor.
 *
 * BİR HATA DÖNGÜYÜ KESMİYOR. Kesseydi listenin kuyruğu hiç denenmemiş olur
 * ve kullanıcı "üçü atanmadı" görüp tekrar denerken ilk üçte 409 yerdi.
 */
export async function atamalariYurut(
  hedefler: { id: string; ad: string }[],
  gonder: (id: string) => Promise<unknown>,
): Promise<AtamaSonucu> {
  const hatalar: string[] = [];
  let basarili = 0;

  for (const hedef of hedefler) {
    try {
      await gonder(hedef.id);
      basarili += 1;
    } catch (err) {
      hatalar.push(`${hedef.ad}: ${err instanceof Error ? err.message : 'atanamadı'}`);
    }
  }

  return { basarili, hatalar };
}
