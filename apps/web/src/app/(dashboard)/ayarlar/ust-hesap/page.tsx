import { redirect } from 'next/navigation';
import { eskiAdresYonu } from '@/lib/panel-adresleri';

/**
 * ESKİ "ŞİRKETLER" ADRESİ — Ayarlar › Şirketler ve workspace'ler'e yönleniyor
 * (2026-10-13). Silinmedi: yer imleri ve maillerde duran bağlantılar 404'e
 * düşmesin. Eşleme tek yerde (`ESKI_ADRESLER`).
 */
export default function EskiSirketlerSayfasi() {
  redirect(eskiAdresYonu('ayarlar/ust-hesap'));
}
