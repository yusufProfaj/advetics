import type { Dil } from '@advetics/shared';
import { apiFetch } from '@/lib/api';

/**
 * GİRİŞ EKRANINDA SEÇİLEN DİL PROFİLE YAZILIR (MIMARI §2): kişinin son
 * eylemi o, ve başka cihazda da geçerli olmalı. Yazılamazsa GİRİŞ
 * DURMAZ: dil bir tercih, oturum değil; çerez bu cihazda zaten doğru.
 * Hata konsola yazılıyor, yutulmuyor; bir sonraki girişte yeniden
 * denenir. İKİ ÇAĞIRAN VAR ve ikisi de şart: parolayla doğrudan giriş
 * (`login-form.tsx`) ve iki adımlı girişin son adımı (`iki-adim-giris.tsx`);
 * biri unutulursa panel profildeki ESKİ dili çereze geri yazar
 * (`dil-esitle.tsx`) ve giriş ekranındaki seçim sessizce geri alınır.
 */
export async function dilProfileYaz(dil: Dil): Promise<void> {
  try {
    await apiFetch('/auth/locale', { method: 'PATCH', body: JSON.stringify({ locale: dil }) });
  } catch (err) {
    console.error('Dil profile yazılamadı', err);
  }
}

