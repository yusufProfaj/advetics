import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { eskiAdresYonu } from '@/lib/panel-adresleri';

/**
 * ESKİ "SENKRONİZASYON DURUMU" — artık Marka Merkezi › Workspace bilgileri
 * › Veri durumu. Eski ekran OTURUMDAKİ workspace'i okuyordu; adres bir
 * workspace taşıyorsa (`?musteri=`) o, yoksa oturumdaki seçim geçiliyor.
 */
export default async function EskiSenkronizasyonSayfasi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const p = await searchParams;
  const musteri = Array.isArray(p.musteri) ? p.musteri[0] : p.musteri;
  redirect(eskiAdresYonu('ayarlar/senkronizasyon', { musteri: musteri ?? null, aktifMusteri: session.activeClientId }));
}
