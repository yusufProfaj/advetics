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
 * Bir danışman × workspace eşleşmesinin ATANAMAMA sebebi — atanabiliyorsa
 * `null`.
 *
 * KOD DÖNÜYOR, CÜMLE DEĞİL. Aynı karar iki ekranda birden veriliyor ve ikisi
 * farklı yönden bakıyor: workspace ekibi ekranı KİŞİ listeliyor ("Bu
 * workspace'e zaten erişiyor"), Ekip & Yetkiler ekranı WORKSPACE listeliyor
 * ("Zaten yetkisi var"). Cümleyi burada üretmek, iki ekrandan birinin ters
 * okunan bir metin göstermesi demekti; kararı iki yerde yazmak ise doğduğu
 * anda ayrışırdı.
 */
export type AtamaEngeli = 'zaten_uye' | 'org_geneli';

export function atamaEngeli(uyelikler: UyelikOzeti[], clientId: string): AtamaEngeli | null {
  // ZATEN BU WORKSPACE'TE: sunucu mükerrer üyeliği 409 ile reddediyor.
  // Reddedileceği belli olan bir seçeneği göstermek, kullanıcıyı hata
  // almaya davet etmek olurdu.
  if (uyelikler.some((u) => u.clientId === clientId)) return 'zaten_uye';
  /*
   * ORG GENELİ ERİŞİM: sunucu bunu reddetmiyor — `clientId` farklı olduğu
   * için çakışma yok ve ikinci bir üyelik satırı YAZILIYOR. Yani engel
   * teknik değil anlamsal: kişi zaten her müşteriyi görüyor ve eklenen satır
   * yalnızca ekip listesinde kafa karıştıran ikinci bir yetki olurdu.
   */
  if (uyelikler.some((u) => u.clientId === null)) return 'org_geneli';
  return null;
}

/** KİŞİ listeleyen ekran için (bir workspace'e kimler atanabilir). */
export const ENGEL_KISI: Record<AtamaEngeli, string> = {
  zaten_uye: 'Bu workspace’e zaten erişiyor',
  org_geneli: 'Tüm müşterilere erişiyor — ayrıca atanması gerekmiyor',
};

/** WORKSPACE listeleyen ekran için (bir danışman nerelere atanabilir). */
export const ENGEL_WORKSPACE: Record<AtamaEngeli, string> = {
  zaten_uye: 'Zaten yetkisi var',
  org_geneli: 'Tüm müşterilere erişiyor',
};

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
