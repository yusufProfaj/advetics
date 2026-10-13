'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { VarlikEylemSonucu } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { varlikEylemMetni, type VarlikEylemHedefi } from '@/lib/varlik-eylemi';
import { Dugme } from '@/components/ui/dugme';
import { YanPanel } from '@/components/ui/pencere';
import { Rozet, DurumNoktasi } from '@/components/ui/rozet';
import { Serit } from '@/components/ui/hal';

/**
 * ═══ REKLAM YÖNETİCİSİ: DURDUR / BAŞLAT ONAYI (2026-10-10) ═══
 *
 * İyileştir'in onayıyla aynı üç adım (platforma gönder → platformdan geri
 * oku → kaydet). Sunucu üç adımı tek istekte yapıyor; istek sürerken yalnız
 * ilk adım dönüyor, cevapla üçü kesinleşiyor (zamanlayıcıyla
 * "ilerliyormuş gibi" göstermek yalan olurdu).
 *
 * YAN PANEL (onaylı taslak `#yonetici`, 2026-10-14): satırdan çıkmadan sağdan
 * açılıyor; Esc, odak tuzağı ve DOM'da kalma ortak bileşenden (`YanPanel`).
 * Sonuç `dogrulandi` ise kısa süre sonra kendiliğinden kapanıp sayfayı
 * yeniliyor; `uyusmadi`da açık kalıyor ki platformun söylediği okunabilsin.
 */
export function VarlikEylemPenceresi({
  hedef,
  onKapat,
}: {
  hedef: VarlikEylemHedefi | null;
  onKapat: () => void;
}) {
  const router = useRouter();
  const [asama, setAsama] = useState<'bekliyor' | 'suruyor' | 'bitti' | 'hata'>('bekliyor');
  const [sonuc, setSonuc] = useState<VarlikEylemSonucu | null>(null);
  const [mesaj, setMesaj] = useState<string | null>(null);
  /*
   * SON HEDEF AKLINDA TUTULUYOR: panel kapanırken `hedef` null'a dönüyor ama
   * panel DOM'da kalıp geçişle kayboluyor. Metin o an "—"ye dönerse kayan
   * panelde başlık bir karede değişirdi.
   */
  const [gosterilen, setGosterilen] = useState<VarlikEylemHedefi | null>(hedef);
  const acik = hedef !== null;

  useEffect(() => {
    if (!hedef) return;
    setGosterilen(hedef);
    setAsama('bekliyor');
    setSonuc(null);
    setMesaj(null);
  }, [hedef]);

  const metin = gosterilen ? varlikEylemMetni(gosterilen) : null;

  function kapat() {
    if (asama === 'suruyor') return;
    const yenile = asama === 'bitti';
    onKapat();
    if (yenile) router.refresh();
  }

  async function onayla() {
    if (!hedef) return;
    setAsama('suruyor');
    setMesaj(null);
    try {
      const r = await apiFetch<VarlikEylemSonucu>(`/campaigns/varliklar/${hedef.seviye}/${hedef.id}/eylem`, {
        method: 'POST',
        body: JSON.stringify({ type: hedef.yayinda ? 'pause' : 'resume' }),
      });
      setSonuc(r);
      setAsama('bitti');
      if (r.dogrulama === 'dogrulandi') {
        setTimeout(() => {
          onKapat();
          router.refresh();
        }, 1200);
      }
    } catch (e) {
      // Sunucunun kendi cümlesi: ajans şalteri, kota, izin, platform hatası
      // AYRI cümleler; "beklenmeyen hata"ya çevirmek teşhisi imkânsız yapar.
      setMesaj(e instanceof ApiRequestError ? e.message : 'İstek gönderilemedi.');
      setAsama('hata');
    }
  }

  const platform = gosterilen ? PLATFORM_KISA_ADLARI[gosterilen.platform] : '';
  const adimHali = (n: number): 'suruyor' | 'bitti' | 'uyari' | 'hata' | undefined => {
    if (asama === 'suruyor') return n === 0 ? 'suruyor' : undefined;
    if (asama === 'bitti') return n === 1 && sonuc?.dogrulama === 'uyusmadi' ? 'uyari' : 'bitti';
    if (asama === 'hata') return n === 0 ? 'hata' : undefined;
    return undefined;
  };
  const once = gosterilen?.yayinda ?? true;

  return (
    <YanPanel
      acik={acik}
      onKapat={kapat}
      baslik={metin?.baslik ?? 'Onay'}
      altEylemler={
        asama === 'bitti' ? (
          <Dugme ton="ikincil" onClick={kapat}>
            Kapat
          </Dugme>
        ) : (
          <>
            <Dugme ton="ikincil" onClick={kapat} disabled={asama === 'suruyor'}>
              Vazgeç
            </Dugme>
            <Dugme onClick={() => void onayla()} bekliyor={asama === 'suruyor'} disabled={!hedef}>
              {asama === 'hata' ? 'Tekrar dene' : 'Onayla ve uygula'}
            </Dugme>
          </>
        )
      }
    >
      {gosterilen && (
        <p className="m-0 text-12 text-ink-muted">
          {gosterilen.ad} · {platform}
        </p>
      )}
      <div className="flex items-center gap-3 rounded-alan border border-line p-3">
        <div className="grid gap-1">
          <small className="text-12 text-ink-muted">Şimdi</small>
          <Rozet hal={once ? 'ok' : 'dur'}>{metin?.once ?? '—'}</Rozet>
        </div>
        <span aria-hidden className="text-ink-muted">
          →
        </span>
        <div className="grid gap-1">
          <small className="text-12 text-ink-muted">Sonra</small>
          <Rozet hal={once ? 'dur' : 'ok'}>{metin?.sonra ?? '—'}</Rozet>
        </div>
      </div>
      <ol className="m-0 grid list-none gap-2 p-0" aria-live="polite">
        {[`${platform}'a gönder`, `${platform}'dan geri oku ve karşılaştır`, 'Kaydet (kim, ne zaman, eski → yeni)'].map(
          (a, n) => {
            const h = adimHali(n);
            return (
              <li key={n} data-hal={h} className="flex items-center gap-2.5 text-13 text-ink">
                <span
                  aria-hidden
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-11 font-bold ${
                    h === 'bitti'
                      ? 'border-ink bg-ink text-surface'
                      : h === 'hata' || h === 'uyari'
                        ? 'border-danger text-danger-strong'
                        : 'border-line-strong text-ink-muted'
                  } ${h === 'suruyor' ? 'advetics-donus border-r-transparent' : ''}`}
                >
                  {h === 'suruyor' ? '' : h === 'bitti' ? '✓' : h === 'hata' || h === 'uyari' ? '!' : n + 1}
                </span>
                {a}
              </li>
            );
          },
        )}
      </ol>
      <p className="m-0 text-13 text-ink-muted">{metin?.aciklama ?? ''}</p>
      {sonuc &&
        (sonuc.dogrulama === 'dogrulandi' ? (
          <p role="status" className="m-0 flex items-center gap-2 text-13 text-ink">
            <DurumNoktasi hal="ok" />
            {`${platform}'da doğrulandı: ${sonuc.platformDegeri}.`}
          </p>
        ) : (
          <Serit baslik={`${platform} isteği kabul etti ama okunan durum farklı`}>{sonuc.platformDegeri}</Serit>
        ))}
      {mesaj && (
        <Serit ton="hata" baslik="Uygulanamadı">
          {mesaj}
        </Serit>
      )}
    </YanPanel>
  );
}
