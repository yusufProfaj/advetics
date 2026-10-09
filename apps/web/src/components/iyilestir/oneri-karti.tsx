'use client';

import Link from 'next/link';
import type { Oneri } from '@advetics/shared';
import { ONERI_TURU_ETIKETI, PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { formatRelative } from '@/lib/format';
import { eylemMetni, kartHali, miniYollar, MINI, seviyeAdi, sonucMetni } from '@/lib/iyilestir';
import i from '@/components/taslak/iyilestir.module.css';
import s from '@/components/taslak/taslak.module.css';

/**
 * ÖNERİ KARTI — taslaktaki `.oneri` (tür + mecra, başlık, yol, kanıtlar +
 * mini grafik, neden, eylem satırı). Kartın hangi hâlde olduğu `kartHali`
 * kararından; burada yalnız çiziliyor.
 *
 * "YENİ KREATİF" BAĞLANTISI yorgunluk kartlarında: yorgun reklamın çaresi
 * yeni kreatif ve reklam kurmanın tek yolu AdvCampaign (kullanıcı kararı
 * 2026-10-07). Sözleşme "setteki tek reklam" bilgisini ayrı bir alan
 * olarak taşımıyor; o durumda uyarı sunucunun `neden` cümlesinde.
 */
export function OneriKarti({
  oneri,
  yazabilir,
  gidiyor,
  hata,
  yoksayiliyor,
  onUygula,
  onYoksay,
}: {
  oneri: Oneri;
  yazabilir: boolean;
  /** Yoksay sonrası çıkış geçişi; kart birazdan listeden düşecek. */
  gidiyor: boolean;
  hata: string | null;
  yoksayiliyor: boolean;
  onUygula: () => void;
  onYoksay: () => void;
}) {
  const hal = kartHali(oneri, yazabilir);
  const metin = eylemMetni(oneri);
  const butce = oneri.tur !== 'kreatif_yorgunlugu';
  const yol = oneri.varlik.ustAd ? `${oneri.varlik.ustAd} › ${oneri.varlik.ad}` : oneri.varlik.ad;

  return (
    <article className={`${s.kart} ${i.oneri} ${gidiyor ? i.gitti : ''}`}>
      <div className={i.oneriUst}>
        <span className={`${i.tur} ${butce ? i.turButce : ''}`}>{ONERI_TURU_ETIKETI[oneri.tur]}</span>
        <span className={i.etiket}>{PLATFORM_KISA_ADLARI[oneri.platform]}</span>
        <span className={i.zaman}>{seviyeAdi(oneri.platform, oneri.varlik.seviye)}</span>
      </div>
      <h3>{oneri.baslik}</h3>
      <p className={i.kim}>{yol}</p>

      <div className={i.kanit}>
        <ul>
          {oneri.kanitlar.map((k) => (
            <li key={k.etiket}>
              <span>{k.etiket}</span>
              <b className={`${s.num} ${k.yon === 'kotu' ? i.kotu : k.yon === 'iyi' ? i.iyi : ''}`}>
                {k.once !== null ? `${k.once} → ${k.simdi}` : k.simdi}
              </b>
            </li>
          ))}
        </ul>
        <MiniGrafik oneri={oneri} />
      </div>

      <div className={i.neden}>{oneri.neden}</div>

      <div className={i.oneriAlt}>
        {hal === 'dogrulandi' || hal === 'uyusmadi' ? (
          (() => {
            const s = sonucMetni(oneri.uygulama!, oneri.platform, metin?.sonra ?? null, formatRelative(oneri.uygulama!.zaman));
            return (
              <span className={`${i.durum} ${s.ton === 'uyari' ? i.durumUyari : ''}`}>
                <i />
                {s.metin}
              </span>
            );
          })()
        ) : hal === 'uygulandi' ? (
          <span className={i.durum}>
            <i />
            Uygulandı · geri okuma sonucu kayıtta yok
          </span>
        ) : (
          <>
            {hal === 'bilgi' && <span className={i.kisit}>{oneri.kisit ?? 'Bu öneri yalnız bilgi; panelden uygulanamıyor.'}</span>}
            {hal === 'yetkisiz' && <span className={i.kisit}>Uygulamak için bütçe yazma yetkisi gerekiyor. Yöneticine sor.</span>}
            {hal === 'uygulanabilir' && metin && (
              <button type="button" className={i.birincil} onClick={onUygula}>
                {metin.dugme}
              </button>
            )}
            {oneri.tur === 'kreatif_yorgunlugu' && (
              <Link className={i.ikincil} href={`/reklam?musteri=${encodeURIComponent(oneri.clientId)}`}>
                Yeni kreatif için AdvCampaign’e geç
              </Link>
            )}
            {yazabilir && (
              <button type="button" className={i.metin} onClick={onYoksay} disabled={yoksayiliyor}>
                {yoksayiliyor ? 'Yoksayılıyor…' : 'Yoksay'}
              </button>
            )}
            {hata && (
              <span className={i.kartHata} role="alert">
                {hata}
              </span>
            )}
          </>
        )}
      </div>
    </article>
  );
}

/**
 * Mini grafik. Çizgiler CSS ile ÇİZİLİYOR (`pathLength=1` + dash): taslak
 * bunu `getTotalLength()` ile JS'te yapıyordu; burada efekt gerekmiyor ve
 * `prefers-reduced-motion` altında animasyon CSS'te kapanıyor.
 * Seri ADLARI sözleşmeden (`adlar`); taslaktaki "Sıklık/Tıklama oranı"
 * varsayılanı yorgunluk dışındaki kartta yanlış ad yazardı.
 */
function MiniGrafik({ oneri }: { oneri: Oneri }) {
  const yollar = miniYollar(oneri.seri);
  if (!yollar || !oneri.seri) return null;
  return (
    <figure className={i.miniK}>
      <svg className={i.mini} viewBox={`0 0 ${MINI.W} ${MINI.H}`} aria-hidden="true">
        <path d={yollar.b} stroke="var(--t-brand)" pathLength={1} className={i.ciz} />
        <path d={yollar.a} stroke="var(--t-ink)" opacity={0.55} pathLength={1} className={i.ciz} />
      </svg>
      <figcaption>
        <span>
          <i style={{ background: 'var(--t-brand)' }} />
          {oneri.seri.adlar[1]}
        </span>
        <span>
          <i style={{ background: 'var(--t-ink)', opacity: 0.55 }} />
          {oneri.seri.adlar[0]}
        </span>
      </figcaption>
    </figure>
  );
}
