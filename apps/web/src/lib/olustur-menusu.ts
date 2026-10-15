import { sec, type Dil, type Permission, type SessionResponse } from '@advetics/shared';
import { kabukSozlugu } from '@/dil/sozlukler/kabuk';
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

/** Metin sözlükten (`kabuk.ts#olustur`), dile göre. */
function secenekler(dil: Dil): Array<OlusturSecenegi & { izin: Permission }> {
  const d = sec(kabukSozlugu, dil).olustur;
  return [
    { ad: d.reklam, aciklama: d.reklamAciklama, href: '/reklam', ikon: 'roket', izin: 'bulk.write' },
    { ad: d.strateji, aciklama: d.stratejiAciklama, href: '/strateji', ikon: 'hedef', izin: 'strategy.write' },
    { ad: d.gonderi, aciklama: d.gonderiAciklama, href: '/auto-boost', ikon: 'resim', izin: 'boost.write' },
    { ad: d.kural, href: '/iyilestir', ikon: 'kural', izin: 'rule.write', ayracOnce: true },
    { ad: d.rapor, href: '/raporlar', ikon: 'rapor', izin: 'report.write' },
  ];
}

export function olusturSecenekleri(
  session: Pick<SessionResponse, 'permissions' | 'rol'>,
  dil: Dil = 'tr',
): OlusturSecenegi[] {
  if (session.rol === 'client_viewer') return [];
  const acik = secenekler(dil).filter((s) => session.permissions.includes(s.izin));
  /*
   * AYRAÇ YALNIZ İKİ TARAF DA DOLUYSA: ana üçlüden hiçbiri yoksa ilk satırın
   * üstünde boşa bir çizgi kalırdı.
   */
  return acik.map(({ izin: _izin, ...s }, i) => ({
    ...s,
    ayracOnce: Boolean(s.ayracOnce) && i > 0,
  }));
}
