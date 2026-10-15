import { cookies, headers } from 'next/headers';
import { DIL_CEREZI, VARSAYILAN_DIL, dilBelirle, sec, tarayiciDili, type Dil, type IkiDil } from '@advetics/shared';

/**
 * SUNUCU BİLEŞENİNİN DİLİ. Çerezden okunur; giriş yapmış kullanıcıda çerez
 * giriş anında ve Hesabım'da profille eşitleniyor (`dil-esitle.tsx`), yani
 * buradaki değer profille aynı. Seçim hiç yapılmadıysa Türkçe çizilir ve
 * seçim penceresi açılır (`dilSecildi === false`).
 */
export async function dilDurumu(): Promise<{ dil: Dil; dilSecildi: boolean; oneri: Dil }> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  const secilen = dilBelirle({ cerez: c.get(DIL_CEREZI)?.value });
  return {
    dil: secilen ?? VARSAYILAN_DIL,
    dilSecildi: secilen !== null,
    oneri: secilen ?? tarayiciDili(h.get('accept-language')),
  };
}

export async function dilAl(): Promise<Dil> {
  return (await dilDurumu()).dil;
}

/** `const d = await sozluk(girisSozlugu)` — sunucu bileşeni için. */
export async function sozluk<T>(s: IkiDil<T>): Promise<T> {
  return sec(s, await dilAl());
}
