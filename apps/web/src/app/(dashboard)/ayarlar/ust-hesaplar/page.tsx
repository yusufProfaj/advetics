import { redirect } from 'next/navigation';
import { eskiAdresYonu } from '@/lib/panel-adresleri';

/**
 * ESKİ "ÜST HESAPLAR" ADRESİ — artık Şirketler sekmesinin `#ust-hesaplar`
 * kartı ve kart yalnız platform sahibine çiziliyor (kullanıcı kararı,
 * 2026-10-13). Sahip olmayan buraya düşerse sayfa başından açılıyor; 403
 * yok, çünkü sekmenin kendisi ona açık.
 */
export default function EskiUstHesaplarSayfasi() {
  redirect(eskiAdresYonu('ayarlar/ust-hesaplar'));
}
