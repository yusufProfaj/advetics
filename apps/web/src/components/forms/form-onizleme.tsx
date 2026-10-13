'use client';

import type { FormOnizlemesi } from '@advetics/shared';
import { onizlemeEkranlari, type OnizlemeEkrani } from '@/lib/form-onizleme';

/**
 * ANLIK FORMUN TEK ÖNİZLEMESİ — iki yerde AYNI bileşen: Marka Merkezi ›
 * Formlar oluşturucusunun canlı önizlemesi ve AdvCampaign rehberindeki form
 * seçicisinin "Önizle" penceresi. İkinci bir önizleme yazılsaydı ilk
 * değişiklikte ayrışırdı (CLAUDE.md "AYNI ŞEYİ ÜRETEN İKİNCİ FONKSİYON").
 *
 * Ekranlar Meta'daki sırayla, numaralı: kişinin göreceği akış yukarıdan
 * aşağı okunuyor. Hangi ekranın çizileceği `onizlemeEkranlari`nın kararı
 * (saf, testli); burada yalnız çizim. Verisi olmayan alan çizilmiyor,
 * okunamayan bölüm "Meta'dan okunamadı" diyor.
 */
export function FormOnizleme({ onizleme, baslik = 'Kişinin göreceği form' }: { onizleme: FormOnizlemesi; baslik?: string }) {
  const ekranlar = onizlemeEkranlari(onizleme);
  return (
    <div className="rounded-kart border border-line bg-surface p-3">
      <p className="mb-2 text-12 font-semibold text-ink-muted">{baslik}</p>
      <ol className="space-y-2">
        {ekranlar.map((e, i) => (
          <li key={e.tur} className="rounded-alan bg-surface-sunken p-3">
            <p className="text-12 font-semibold text-ink-muted">
              {i + 1}. {e.ad}
            </p>
            {e.hal === 'var' ? <EkranIcerigi ekran={e} o={onizleme} /> : <p className="mt-1 text-xs text-ink-muted">{e.not}</p>}
            {e.hal === 'var' && e.not && <p className="mt-2 text-[11px] text-ink-muted">{e.not}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function EkranIcerigi({ ekran, o }: { ekran: OnizlemeEkrani; o: FormOnizlemesi }) {
  if (ekran.tur === 'giris' && o.giris) {
    return (
      <div className="mt-1">
        {o.giris.baslik && <p className="text-sm font-semibold text-ink">{o.giris.baslik}</p>}
        {o.giris.maddeler.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {o.giris.maddeler.map((m, i) => (
              <li key={i} className="text-xs text-ink-muted">
                {m}
              </li>
            ))}
          </ul>
        )}
        {o.giris.dugme && <TaklitDugme>{o.giris.dugme}</TaklitDugme>}
      </div>
    );
  }
  if (ekran.tur === 'sorular') {
    return (
      <div className="mt-1">
        {o.soruBasligi && <p className="mb-1 text-sm font-semibold text-ink">{o.soruBasligi}</p>}
        <ul className="space-y-1.5">
          {o.sorular.map((q, i) => (
            <li key={`${q.tur}-${i}`} className="rounded-md bg-surface px-2.5 py-2">
              <span className="text-[11px] text-ink-muted">{q.etiket || 'Soru metni yazılmadı'}</span>
              {/* ÖN DOLU GÖRÜNÜYOR çünkü gerçekten öyle olacak: kişi yazmıyor, onaylıyor. */}
              <p className="text-xs text-ink">
                {q.otomatikDolu ? 'Facebook profilinden otomatik dolar' : q.secenekler.length > 0 ? q.secenekler.join(' / ') : 'Kişi yazar'}
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (ekran.tur === 'gizlilik' && o.gizlilik) {
    return (
      <div className="mt-1">
        {o.onaylar && o.onaylar.length > 0 && (
          <ul className="mb-2 space-y-1">
            {o.onaylar.map((c, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] text-ink-muted">
                <span aria-hidden>☐</span>
                <span>
                  {c.metin || 'Onay metni yazılmadı'}
                  {c.zorunlu && ' (zorunlu)'}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-ink">{o.gizlilik.metin ?? 'Gizlilik politikası'}</p>
        <p className="break-all text-[11px] text-ink-muted">{o.gizlilik.adres}</p>
        <TaklitDugme>Gönder</TaklitDugme>
      </div>
    );
  }
  if (ekran.tur === 'tesekkur' && o.tesekkur) {
    return (
      <div className="mt-1">
        {o.tesekkur.baslik && <p className="text-sm font-semibold text-ink">{o.tesekkur.baslik}</p>}
        {o.tesekkur.metin && <p className="text-xs text-ink-muted">{o.tesekkur.metin}</p>}
        {o.tesekkur.dugme && <TaklitDugme ikincil>{o.tesekkur.dugme}</TaklitDugme>}
        {o.tesekkur.adres && <p className="mt-1 break-all text-[11px] text-ink-muted">{o.tesekkur.adres}</p>}
      </div>
    );
  }
  return null;
}

/*
 * META FORMUNUN DÜĞMESİNİN TAKLİDİ, panelin düğmesi DEĞİL: tıklanmıyor,
 * yalnız kişinin göreceği akışı gösteriyor. O yüzden `Dugme` değil düz kutu;
 * dolu kırmızı da değil, çünkü ekranda tek kırmızı dolu panelin birincil
 * eylemine ait ve taklit onunla karışırdı.
 */
function TaklitDugme({ children, ikincil = false }: { children: React.ReactNode; ikincil?: boolean }) {
  return (
    <div
      className={`mt-2 rounded-alan px-2.5 py-1.5 text-center text-12 font-semibold ${
        ikincil ? 'border border-line-strong text-ink' : 'bg-ink text-surface'
      }`}
    >
      {children}
    </div>
  );
}
