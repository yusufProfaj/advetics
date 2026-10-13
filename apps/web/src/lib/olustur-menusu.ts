import type { Permission, SessionResponse } from '@advetics/shared';
import type { IkonAdi } from '@/components/ui/ikon';

/**
 * ═══ "+ OLUŞTUR" SEÇENEKLERİ (menü kararı 2026-10-14) ═══
 *
 * Oluşturma yolları tek kapıdan: menünün başındaki kırmızı hap. Seçenekler
 * ve açıklamaları kullanıcının onayladığı taslaktan
 * (`docs/marka/menu-sistemi-b.html` `#ac-olustur`). Hedef adresler menünün
 * kendi satırlarıyla AYNI yollar (`nav-sections.ts`); izinler de aynı
 * anahtarlar ve BİR ADIM SIKI: menü satırı okumayla açılıyor (`strategy.read`
 * müşteri onayı için), "oluştur" ise yazma ister. Yazamayacağı bir şeyi
 * "oluştur" diye göstermek, kullanıcıyı kaydedemeyeceği bir forma götürür.
 *
 * MÜŞTERİ HESABINA (client_viewer) HİÇ ÇIKMAZ: izinleri zaten hiçbirini
 * açmıyor, ama karar izin matrisinin bir gün genişlemesine bırakılmasın
 * diye rol açıkça da süzülüyor.
 *
 * Saf fonksiyon, `'use client'` YOK: düzen (sunucu) listeyi kurup kenar
 * çubuğuna veri olarak veriyor; ikon adı dizge, bileşen değil.
 */
export interface OlusturSecenegi {
  ad: string;
  aciklama?: string;
  href: string;
  ikon: IkonAdi;
  /** Bu seçenekten ÖNCE ayraç (ana üç ile yan iki arasında). */
  ayracOnce?: boolean;
}

const SECENEKLER: Array<OlusturSecenegi & { izin: Permission }> = [
  { ad: 'Reklam', aciklama: 'Yedi amaçtan biriyle, adım adım', href: '/reklam', ikon: 'roket', izin: 'bulk.write' },
  { ad: 'Strateji', aciklama: 'Plan, rapor ve müşteri onayı', href: '/strateji', ikon: 'hedef', izin: 'strategy.write' },
  {
    ad: 'Gönderi öne çıkar',
    aciklama: 'Instagram gönderisini boostla',
    href: '/auto-boost',
    ikon: 'resim',
    izin: 'boost.write',
  },
  { ad: 'Kural', href: '/iyilestir', ikon: 'kural', izin: 'rule.write', ayracOnce: true },
  { ad: 'Rapor', href: '/raporlar', ikon: 'rapor', izin: 'report.write' },
];

export function olusturSecenekleri(session: Pick<SessionResponse, 'permissions' | 'rol'>): OlusturSecenegi[] {
  if (session.rol === 'client_viewer') return [];
  const acik = SECENEKLER.filter((s) => session.permissions.includes(s.izin));
  /*
   * AYRAÇ YALNIZ İKİ TARAF DA DOLUYSA: ana üçlüden hiçbiri yoksa ilk satırın
   * üstünde boşa bir çizgi kalırdı.
   */
  return acik.map(({ izin: _izin, ...s }, i) => ({
    ...s,
    ayracOnce: Boolean(s.ayracOnce) && i > 0,
  }));
}
