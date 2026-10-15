'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { hazirlamaSayacYolu, type HazirlamaYaniti, type KurulumYaniti, type WorkspaceHazirlik } from '@advetics/shared';
import { apiFetch } from '@/lib/api';
import { beyanGirdisi, beyanlariOku } from '@/lib/kurulum-beyanlari';
import { kurulumListesi, kurulumSayaci, sihirbazAdresi, type KurulumSayaci } from '@/lib/panel-adresleri';
import { seritAnahtari, seritGorunur, seritMetni } from '@/components/kurulum/sihirbaz-akisi';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { useSozluk } from '@/dil/saglayici';
import { genelBakisSozlugu } from '@/dil/sozlukler/genel-bakis';

/**
 * ═══ GENEL BAKIŞ — "KURULUM EKSİK" ŞERİDİ (docs/kurulum-sihirbazi/MIMARI.md § 3a) ═══
 *
 * Yalnız kurulumu yapabilene (`kurulum.yaz`), müşteri hesabına DEĞİL — çağıran
 * kapıyı sunucuda sınıyor ve bileşeni hiç çizmiyor. Aktif workspace bitmemişse
 * "Kurulum eksik: 3 adım · Sihirbazla tamamla".
 *
 * "KAPAT" O WORKSPACE İÇİN 7 GÜN GİZLER: her gün duran bir uyarı okunmaz hâle
 * gelir (CLAUDE.md, rapor uyarısı dersi). Tercih yerel (localStorage) ve
 * TRY/CATCH içinde: özel pencerede ya da engelli depoda erişim fırlatıyor ve
 * Genel Bakış'ın tamamını düşürmemeli. Okunamazsa şerit GÖRÜNÜR — tercihi
 * okuyamamak uyarıyı susturmamalı.
 *
 * TEMBEL: sayaç dört uç; gizliyse hiç okunmuyor. Okunamazsa şerit ÇIKMAZ:
 * bilinmeyen bir şeyi "eksik" diye ilan etmek yanlış alarm (karar
 * `seritGorunur`te, saf ve sınanıyor).
 */
function gizlendiOku(clientId: string): number | null {
  try {
    const v = window.localStorage.getItem(seritAnahtari(clientId));
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function gizlendiYaz(clientId: string): void {
  try {
    window.localStorage.setItem(seritAnahtari(clientId), String(Date.now()));
  } catch {
    /* depo kapalı: bu oturumda gizlemek yine çalışıyor (durum), yalnız hatırlanmıyor */
  }
}

export function KurulumSeridi({ clientId }: { clientId: string }) {
  const [sayac, setSayac] = useState<KurulumSayaci | null>(null);
  const [gizli, setGizli] = useState(true);
  const d = useSozluk(genelBakisSozlugu).kurulum;

  useEffect(() => {
    const gizlendi = gizlendiOku(clientId);
    // Gizliyse uçlara hiç gidilmez: yedi gün boyunca boş yere dört istek.
    if (!seritGorunur({ yazabilir: true, sayac: { tamam: 0, toplam: 1, kapsamDisi: 0, bilinmiyor: 0, bitti: false }, gizlendi, simdi: Date.now() })) return;
    let iptal = false;
    void (async () => {
      const oku = async <T,>(yol: string): Promise<T | null> => {
        return apiFetch<T>(yol).catch((): null => null);
      };
      // Hazırlama TETİKLEMEDEN (`hazirlamaSayacYolu`): Genel Bakış her açılışta
      // bu sayacı okuyor; tetikleseydi panelin ana sayfası AI işi başlatırdı.
      const [k, hz, hk, by] = await Promise.all([
        oku<KurulumYaniti>(`/clients/${clientId}/kurulum`),
        oku<HazirlamaYaniti>(hazirlamaSayacYolu(clientId)),
        oku<WorkspaceHazirlik>(`/clients/${clientId}/hazirlik`),
        beyanlariOku(apiFetch, clientId),
      ]);
      if (iptal) return;
      const s = kurulumSayaci(
        kurulumListesi({ kurulum: k, hazirlama: hz, hazirlik: hk, kullanilmayanlar: k?.kullanilmayanPlatformlar ?? [], beyanlar: beyanGirdisi(by) }),
      );
      setSayac(s);
      setGizli(!seritGorunur({ yazabilir: true, sayac: s, gizlendi, simdi: Date.now() }));
    })();
    return () => {
      iptal = true;
    };
  }, [clientId]);

  if (gizli || !sayac) return null;
  /*
   * ORTAK ŞERİT (onaylı taslak `#genel`): sol kırmızı çizgi, kalın cümle,
   * sağda "7 gün gizle" (hayalet) ve "Kurulumu tamamla" (koyu). Eski
   * şeridin kırmızı dolu "!" karosu kılavuzdaki birincil düğmeyle
   * karışıyordu; ekranın tek kırmızı dolgusu birincil eylem.
   */
  return (
    <Serit
      baslik={seritMetni(sayac)}
      eylemler={
        <>
          <Dugme
            ton="hayalet"
            boyut="kucuk"
            onClick={() => {
              gizlendiYaz(clientId);
              setGizli(true);
            }}
            aria-label={d.gizleEtiket}
          >
            {d.gizle}
          </Dugme>
          <Link href={sihirbazAdresi(clientId)} className={dugmeSinifi('koyu', 'kucuk')}>
            {d.tamamla}
          </Link>
        </>
      }
    />
  );
}
