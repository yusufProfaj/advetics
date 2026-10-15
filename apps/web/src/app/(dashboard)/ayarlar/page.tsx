import { redirect } from 'next/navigation';
import { AYARLAR_SEKMELERI } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { ayarSekmesiAcik } from '@/lib/ayar-kapilari';

/**
 * ═══ /ayarlar KENDİ BAŞINA BİR SAYFA DEĞİL ═══
 *
 * Adres çubuğuna "/ayarlar" yazan ya da üst yoldan bir basamak geri çıkan
 * kullanıcı markasız İngilizce 404 görüyordu (canlı denetim). Ayarlar dört
 * sekme; adres oturumun AÇABİLDİĞİ ilk sekmeye iniyor. Sıra ve kapı
 * sözleşmeden (`AYARLAR_SEKMELERI`, `ayarSekmesiAcik`): elle yazılmış bir
 * hedef, izni olmayan kullanıcıyı bir kez daha kapalı sayfaya gönderirdi.
 * "Hesabım"ın kapısı yok, yani her oturum bir yere iniyor.
 */
export const dynamic = 'force-dynamic';

export default async function AyarlarKoku() {
  const session = await requireSession();
  const hedef = AYARLAR_SEKMELERI.find((s) => ayarSekmesiAcik(session, s.kod)) ?? AYARLAR_SEKMELERI[AYARLAR_SEKMELERI.length - 1]!;
  redirect(hedef.yol);
}
