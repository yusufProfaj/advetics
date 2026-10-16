import { planZamaniMetni, sec, type Dil, type PlanSikligi } from '@advetics/shared';
import { raporlarSozlugu } from '@/dil/sozlukler/raporlar';

/**
 * Shared'daki `donemMetni` ve `planZamaniMetni` ay/gün adlarını Türkçe
 * sabitten alıyor; İngilizce ekranda "Ekim 2026" ya da "Her Pazartesi"
 * görünmesin diye ekran kabuğu bunları ekranın dilinde kuruyor. Türkçede
 * shared fonksiyonların kendisi (tek kaynak, metin ayrışmasın).
 */
export function donemMetniDil(donem: string, dil: Dil): string {
  // Ay adı Intl'den iki dilde de ("Ekim"/"October"): ayrı bir Türkçe ay tablosu
  // elle yazılmış metin olarak kalırdı.
  const ay = new Date(Date.UTC(2026, Number(donem.slice(5, 7)) - 1, 1)).toLocaleDateString(
    dil === 'en' ? 'en-US' : 'tr-TR',
    { month: 'long', timeZone: 'UTC' },
  );
  return `${ay} ${donem.slice(0, 4)}`;
}

export function planZamaniMetniDil(
  plan: { frequency: PlanSikligi; dayOfWeek?: number | null; dayOfMonth?: number | null; hour: number },
  dil: Dil,
): string {
  if (dil === 'tr') return planZamaniMetni({ ...plan, dayOfWeek: plan.dayOfWeek ?? null, dayOfMonth: plan.dayOfMonth ?? null });
  const d = sec(raporlarSozlugu, dil).planla;
  const saat = `${String(plan.hour).padStart(2, '0')}:00`;
  if (plan.frequency === 'weekly') {
    const gun = d.haftaGunleri[String(plan.dayOfWeek ?? 1) as keyof typeof d.haftaGunleri];
    return d.herGun(gun, saat);
  }
  return d.herAyinGunu(plan.dayOfMonth ?? 1, saat);
}
