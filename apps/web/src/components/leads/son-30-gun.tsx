'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { useSozluk } from '@/dil/saglayici';
import { leadsSozlugu } from '@/dil/sozlukler/leads';

/**
 * ═══ SON 30 GÜNÜ GETİR ═══
 *
 * Zamanlanmış tarama imleçten devam ediyor ve imleç bir kez ilerledikten
 * sonra geriye dönmüyor. Panel yeni bağlandığında, sayfa sonradan
 * atandığında ya da tarama bir dönem hiç koşmadığında kullanıcının elinde
 * tutulacak hiçbir düğme yoktu: ekran boş, sebep yok, yapılacak iş yok.
 *
 * Akıllı Boost'taki "Geçmiş içerikleri getir" ile aynı gerekçe ve aynı
 * güvence: mükerrer kayıt tehlikesi YOK, `leads_external_uniq` tekil indeksi
 * aynı kaydı ikinci kez yazmıyor.
 */
export function Son30Gun({ clientId }: { clientId: string }) {
  const router = useRouter();
  const d = useSozluk(leadsSozlugu).son30;
  const [bekliyor, setBekliyor] = useState(false);
  const [notlar, setNotlar] = useState<string[] | null>(null);
  const [kayitlar, setKayitlar] = useState<number | null>(null);
  const [notAcik, setNotAcik] = useState(false);

  async function getir(): Promise<void> {
    setBekliyor(true);
    setNotlar(null);
    setKayitlar(null);
    try {
      const r = await apiFetch<{ kayitlar: number; notlar: string[] }>('/leads/son-30-gun', {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
      /*
       * SONUÇ SAYFA BAZINDA YAZILIYOR. "0 kayıt" tek başına düğmenin bozuk
       * olduğunu düşündürüyor; sunucu her sayfa için sebebini söylüyor
       * (token yok, form yok, kaç form tarandı).
       */
      setKayitlar(r.kayitlar);
      setNotlar(r.notlar);
      setNotAcik(true);
      router.refresh();
    } catch (err) {
      setNotlar([
        err instanceof ApiRequestError ? err.message : d.cekilemedi,
      ]);
      setNotAcik(true);
    } finally {
      setBekliyor(false);
    }
  }

  /*
   * SONUÇ DÜĞMENİN ALTINDA, BAŞLIĞIN EYLEM SATIRINDA: ayrı bir şerit sayfayı
   * kaydırıp düğmeden kopardı ve kullanıcı neyin sonucu olduğunu çıkaramazdı.
   */
  return (
    <div className="relative">
      <Dugme
        ton="ikincil"
        onClick={() => void getir()}
        bekliyor={bekliyor}
        title={d.ipucu}
      >
        {bekliyor ? d.cekiliyor : d.dugme}
      </Dugme>

      {/* SONUÇ KUTUSU DOM'DA KALIYOR: kapatınca görünmez + etkisiz, içerik sonraki çekime kadar duruyor. */}
      {notlar && (
        <div
          role="status"
          inert={!notAcik}
          className={`absolute right-0 top-full z-10 mt-1.5 w-[min(22rem,calc(100vw-2rem))] rounded-alan border border-line bg-surface px-3 py-2 text-right shadow-acilir transition-opacity duration-150 motion-reduce:transition-none ${
            notAcik ? 'visible opacity-100' : 'invisible opacity-0'
          }`}
        >
          {kayitlar !== null && <p className="m-0 text-12 font-semibold text-ink">{d.yeniKayit(kayitlar)}</p>}
          <ul className="m-0 grid list-none gap-0.5 p-0 text-12 text-ink-muted">
            {notlar.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <button type="button" onClick={() => setNotAcik(false)} className="mt-1 text-12 font-semibold text-ink underline underline-offset-2">
            {d.kapat}
          </button>
        </div>
      )}
    </div>
  );
}
