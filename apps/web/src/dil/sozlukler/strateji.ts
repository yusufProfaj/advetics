import { ikiDil } from '@advetics/shared';

/** AdvStrategy oluşturma adımlarının sözlüğe geçmiş metinleri (D3 tamamlanana kadar kısmi). */
export const stratejiSozlugu = ikiDil(
  {
    paraBirimiSec: 'Para birimini seç.',
    paraBirimiSecildi: (p: string) => `Strateji ${p} ile hazırlanacak.`,
    paraBirimiEtiketi: 'Para birimi',
    hedefNotlari: 'Hedefler kapatılmadı, ama bilmen gerekenler var.',
    devamParaBirimi: 'Para birimini seç',
    gecisYeni: 'Strateji hazırlanıyor: hesap ve ölçüm bilgileri okunuyor…',
    gecisDevam: 'Taslak açılıyor…',
    gecisListe: 'Stratejiler açılıyor…',
  },
  {
    paraBirimiSec: 'Choose the currency.',
    paraBirimiSecildi: (p) => `The strategy will be prepared in ${p}.`,
    paraBirimiEtiketi: 'Currency',
    hedefNotlari: 'No goal was closed, but there is something you should know.',
    devamParaBirimi: 'Choose the currency',
    gecisYeni: 'Preparing the strategy: reading account and measurement details…',
    gecisDevam: 'Opening the draft…',
    gecisListe: 'Opening strategies…',
  },
);
