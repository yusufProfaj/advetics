import type { Metadata } from 'next';
import type { Dil } from '@advetics/shared';
import { ingilizceYolu, yerelYol } from './site-yollari';

/**
 * Tanıtım/yasal sayfasının dil bağlantıları: kanonik adres SAYFANIN KENDİ
 * dilindeki adres, `languages` iki dilin eşi. Sayfalar kanonik adresi elle
 * `'/ozellikler'` yazıyordu; `/en/features` aynı sayfayı çizince kanonik
 * Türkçe adresi gösterecek ve arama motoru İngilizce sayfayı kopya sayıp
 * dizinden atacaktı.
 */
export function dilBaglantilari(trYol: string, dil: Dil): Metadata['alternates'] {
  const en = ingilizceYolu(trYol);
  return {
    canonical: yerelYol(trYol, dil),
    ...(en ? { languages: { tr: trYol, en, 'x-default': trYol } } : {}),
  };
}
