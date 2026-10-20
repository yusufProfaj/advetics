'use client';

import type { KitlePerformansi } from '@advetics/shared';
import { Sekmeler } from '@/components/ui/sekmeler';
import { BosDurum } from '@/components/ui/hal';
import { KitlelerBolumu } from '@/components/marka-merkezi/kitleler-bolumu';
import { useSozluk } from '@/dil/saglayici';
import { kitleSozlugu } from '@/dil/sozlukler/kitle';
import { KitlePerformansTablosu } from './kitle-performans-tablosu';

export type KitleAltSekmesi = 'kayitli' | 'performans';

/*
 * ═══ REKLAM YÖNETİCİSİ › HEDEF KİTLELER (2026-10-20) ═══
 *
 * Armağan Bey: "reklam yöneticisinde hedef kitleler eklenebilsin ve
 * düzenlenebilsin". Sekme iki görünüm taşıyor: KAYITLI KİTLELER (ekle,
 * düzenle, sil; Base › Varlıklar › Kitleler ile AYNI bileşen) ve
 * PERFORMANS (aynı hedeflemeli setlerin dönüşü, 2026-10-16'dan beri).
 * Varsayılan alt sekme kayıtlı kitleler: görev kitleyi yönetmek; performans
 * metrik çağrısı yalnız o sekme açılınca yapılıyor.
 *
 * Alt sekme ADRESTE (`kitle=performans`): paylaşılan bağlantı ve tarih
 * seçicinin yeniden yüklemesi aynı görünümü açsın.
 */
export function HedefKitleler({
  alt,
  hrefler,
  clientId,
  yazabilir,
  varsayilanAdresi,
  yeniAc,
  ilkSuzgec,
  performans,
}: {
  alt: KitleAltSekmesi;
  hrefler: Record<KitleAltSekmesi, string>;
  /** Şirket düzeyinde ("Tüm workspace'ler") `null`: kayıtlı kitle listelenemez, NEDENİ yazar. */
  clientId: string | null;
  yazabilir: boolean;
  varsayilanAdresi: string | null;
  yeniAc: boolean;
  ilkSuzgec: string | null;
  /** Yalnız performans alt sekmesinde dolu. */
  performans: { tur: 'veri'; v: KitlePerformansi } | { tur: 'hata'; mesaj: string } | null;
}) {
  const d = useSozluk(kitleSozlugu);
  return (
    <div className="grid min-w-0 gap-4">
      <Sekmeler
        etiket={d.altEtiket}
        secili={alt}
        secenekler={[
          { deger: 'kayitli', etiket: d.altKayitli, href: hrefler.kayitli },
          { deger: 'performans', etiket: d.altPerformans, href: hrefler.performans },
        ]}
      />
      {alt === 'kayitli' && clientId === null ? (
        <BosDurum baslik={d.workspaceYokBaslik} neden={d.workspaceYokNeden} />
      ) : alt === 'kayitli' && clientId !== null ? (
        <KitlelerBolumu
          clientId={clientId}
          yazabilir={yazabilir}
          varsayilanAdresi={varsayilanAdresi}
          yeniAc={yeniAc}
          ilkSuzgec={ilkSuzgec}
        />
      ) : performans ? (
        <KitlePerformansTablosu yanit={performans} kitleKaydedebilir={yazabilir} clientId={clientId} />
      ) : null}
    </div>
  );
}
