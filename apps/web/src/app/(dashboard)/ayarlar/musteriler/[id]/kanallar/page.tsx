import { redirect } from 'next/navigation';
import { eskiAdresYonu } from '@/lib/panel-adresleri';

/**
 * ESKİ "BAĞLI KANALLAR" — bir workspace'in hesap ve kanalları artık
 * Marka Merkezi › Kurulum'un `#kanallar` bloğunda (hesap ataması tek
 * kapıdan, MIMARI Ç-21). Adres kimliği taşıyor: yönlendirme o workspace'e
 * gidiyor, oturumdaki seçime değil.
 */
export default async function EskiBagliKanallarSayfasi({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(eskiAdresYonu('ayarlar/musteriler/[id]/kanallar', { id }));
}
