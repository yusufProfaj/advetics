import { redirect } from 'next/navigation';
import { eskiAdresYonu } from '@/lib/panel-adresleri';

/**
 * ESKİ WORKSPACE LİSTESİ — Şirketler ve workspace'ler sekmesinin
 * `#workspaceler` bölümüne yönleniyor. Bu adres panelin birkaç yerinden
 * bağlanıyordu ve yer imlerinde duruyor; silmek onları 404'e düşürürdü.
 */
export default function EskiMusterilerSayfasi() {
  redirect(eskiAdresYonu('ayarlar/musteriler'));
}
