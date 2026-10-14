import type { ComponentType } from 'react';

import {
  AsistanSahnesi,
  BoostSahnesi,
  KuralSahnesi,
  KurmaSahnesi,
  OlcumSahnesi,
  PlanSahnesi,
  RaporSahnesi,
  TabloSahnesi,
} from './simulasyonlar';

export { HeroSahnesi } from './simulasyonlar';

/**
 * Özellik → sahne eşlemesi. Ana sayfadaki modül bölümü ve özellik
 * sayfasının girişi AYNI eşlemeden okuyor: bir özelliğin iki yerde iki ayrı
 * sahne göstermesi, ziyaretçiye iki ayrı ürün anlatmak olurdu.
 *
 * Bu dosya `'use client'` TAŞIMIYOR: sunucu bileşenleri (sayfalar) eşlemeyi
 * okuyabilsin diye. Değerler istemci bileşeni ve sunucuda istemci referansı
 * olarak render ediliyor. `simulasyon.spec.ts` her özelliğin bir sahnesi
 * olduğunu kilitliyor.
 */
export const OZELLIK_SAHNELERI: Record<string, ComponentType> = {
  'tek-panel': TabloSahnesi,
  'reklam-kurma': KurmaSahnesi,
  planlama: PlanSahnesi,
  'akilli-boost': BoostSahnesi,
  iyilestirme: KuralSahnesi,
  raporlama: RaporSahnesi,
  'olcum-kurulumu': OlcumSahnesi,
  'yapay-zeka-asistani': AsistanSahnesi,
};
