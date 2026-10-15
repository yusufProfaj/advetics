'use client';

import { useState } from 'react';
import { DILLER, dilMi } from '@advetics/shared';
import { ApiRequestError } from '@/lib/api';
import { useDil, useSozluk } from '@/dil/saglayici';
import { DIL_ADLARI, dilSecimiSozlugu } from '@/dil/sozlukler/dil-secimi';
import { Secim } from '@/components/ui/alan';
import { Serit } from '@/components/ui/hal';

/**
 * HESABIM › ARAYÜZ DİLİ (taslak C). Değişiklik ANINDA uygulanır, ayrı
 * "Kaydet" yok: seçim kutusunun kendisi karar. Profil yazılamazsa çerez
 * yine de yazılmış olur (bu cihazda geçerli) ve bu AÇIKÇA söylenir;
 * sessizce geçmek, kişinin diğer cihazında eski dili görüp nedenini
 * bilmemesi demek. Rapor dili ayrı (workspace ayarı, kullanıcı kararı Ç8)
 * ve karışmasın diye notu burada.
 */
export function DilAyari() {
  const { dil, degistir } = useDil();
  const d = useSozluk(dilSecimiSozlugu);
  const [hata, setHata] = useState<string | null>(null);
  const [bekliyor, setBekliyor] = useState(false);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <label htmlFor="arayuz-dili" className="block text-14 font-semibold text-ink">
            {d.hesabimBaslik}
          </label>
          <p className="m-0 text-13 text-ink-muted">{d.hesabimAciklama}</p>
        </div>
        <Secim
          id="arayuz-dili"
          className="w-40"
          value={dil}
          disabled={bekliyor}
          onChange={async (e) => {
            const yeni = e.target.value;
            if (!dilMi(yeni)) return;
            setHata(null);
            setBekliyor(true);
            try {
              await degistir(yeni, { profileYaz: true });
            } catch (err) {
              setHata(`${d.kaydedilemedi}${err instanceof ApiRequestError ? ` (${err.message})` : ''}`);
            } finally {
              setBekliyor(false);
            }
          }}
        >
          {DILLER.map((k) => (
            <option key={k} value={k} lang={k}>
              {DIL_ADLARI[k]}
            </option>
          ))}
        </Secim>
      </div>
      {hata && <Serit ton="hata" baslik={hata} />}
      <p className="m-0 text-12 text-ink-muted">{d.hesabimRaporNotu}</p>
    </div>
  );
}
