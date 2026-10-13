import { redirect } from 'next/navigation';
import { eskiAdresYonu } from '@/lib/panel-adresleri';

/**
 * ESKİ "OKUMA API" — Hesabım'ın `#okuma-api` kartı. Yönlendirme HERKESE:
 * kart yalnız platform sahibine çiziliyor, sahip olmayan Hesabım'ın başına
 * düşüyor ve kartın VARLIĞI sızmıyor (eskiden aynı amaçla 404 veriliyordu).
 */
export default function EskiOkumaApiSayfasi() {
  redirect(eskiAdresYonu('ayarlar/okuma-api'));
}
