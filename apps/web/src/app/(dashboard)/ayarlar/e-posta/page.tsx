import { redirect } from 'next/navigation';
import { eskiAdresYonu } from '@/lib/panel-adresleri';

/** ESKİ "E-POSTA AYARLARI" — Hesabım'ın `#e-posta` kartı (kişinin kendi ayarı). */
export default function EskiEpostaSayfasi() {
  redirect(eskiAdresYonu('ayarlar/e-posta'));
}
