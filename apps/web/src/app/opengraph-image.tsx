import { ImageResponse } from 'next/og';
import { ADVETICS_KIRMIZI, markaIsareti } from './marka-isareti';

/**
 * Open Graph görseli — çalışma anında üretiliyor.
 *
 * Neden ikili dosya değil: Modül 6'da rapor paylaşım linkleri her müşterinin
 * kendi markasıyla önizleme göstermeli. Statik bir PNG bunu yapamaz; burada
 * JSX'ten üretmek, ileride marka rengini ve logoyu parametre almaya izin verir.
 *
 * Meta Sharing Debugger `og:image`'ın AÇIKÇA verilmesini istiyor — başka
 * etiketlerden çıkarılabilse bile. Bu dosya `/opengraph-image` yolunu üretir ve
 * Next.js metadata'ya otomatik ekler.
 *
 * Metin kasıtlı olarak Türkçe'ye özgü karakter içermiyor: ImageResponse'un
 * gömülü fontu genişletilmiş Latin karakterlerini her ortamda doğru
 * çizmiyor ve eksik glif, bozuk bir önizleme demek.
 *
 * Renkler kılavuzun dördü ve beyazın saydam tonları (2026-10-12): eski
 * mavi-gri zemin (#0f1116) ve gri metinler kılavuzun dışındaydı.
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Advetics - Meta, Google and LinkedIn ads in one dashboard';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#000000',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/*
            Sekme ikonuyla AYNI işaret (`markaIsareti`). Burada elle çizilmiş
            kırmızı bir "A" kutusu vardı; işaret değişince unutulmuştu ve
            paylaşım önizlemesi sitedekinden farklı bir logo gösteriyordu.
          */}
          <div style={{ display: 'flex', width: '76px', height: '76px' }}>{markaIsareti(76)}</div>
          <div style={{ fontSize: '52px', fontWeight: 700, letterSpacing: '-1px' }}>
            Advetics
          </div>
        </div>

        <div
          style={{
            marginTop: '44px',
            fontSize: '58px',
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: '-1.5px',
            maxWidth: '900px',
          }}
        >
          Meta, Google and LinkedIn ads in one dashboard
        </div>

        <div style={{ marginTop: '28px', fontSize: '30px', color: 'rgba(255,255,255,0.72)' }}>
          It tells you what to do, and does it with your approval
        </div>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            fontSize: '26px',
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          <div style={{ width: '48px', height: '4px', background: ADVETICS_KIRMIZI }} />
          advetics.com
        </div>
      </div>
    ),
    size,
  );
}
