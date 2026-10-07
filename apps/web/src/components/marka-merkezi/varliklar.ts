import type { Permission } from '@advetics/shared';

/**
 * ═══ VARLIKLAR — MENÜDEN MARKA MERKEZİ'NE İNEN ÜÇ EKRAN ═══
 *
 * TEK LİSTE: menünün "seçili satır" kararı (`nav-sections.ts` →
 * `ekYollar`) ve Marka Merkezi'ndeki kartlar bu diziden türüyor. Ayrı
 * yazılsaydı dördüncü bir varlık ekranı kartlara eklenip menüye
 * eklenmediğinde kullanıcı o ekranda menüde kaybolurdu.
 *
 * Bu dosya `'use client'` TAŞIMIYOR: hem sunucu sayfası hem istemci menüsü
 * okuyor.
 */
export interface Varlik {
  href: string;
  ad: string;
  aciklama: string;
  /** Ekranın kendi okuma yetkisi — kart yalnızca bu varsa görünüyor. */
  izin: Permission;
}

export const VARLIKLAR: readonly Varlik[] = [
  {
    href: '/kutuphane/gorseller',
    ad: 'Görsel Arşivi',
    aciklama: 'Görseller, videolar ve logo. AdvCampaign buradan seçer.',
    izin: 'bulk.read',
  },
  {
    href: '/kutuphane/kreatifler',
    ad: 'Kreatifler',
    aciklama: 'Yayındaki ve geçmiş reklamların kreatifleri, performansıyla.',
    izin: 'bulk.read',
  },
  {
    href: '/kutuphane/formlar',
    ad: 'Formlar',
    aciklama: 'Meta anlık formları ve gelen potansiyel müşteriler.',
    izin: 'bulk.read',
  },
];

export const VARLIK_YOLLARI: readonly string[] = VARLIKLAR.map((v) => v.href);
