import { ImageResponse } from 'next/og';

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
 */
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Advetics - Meta and Google Ads management dashboard';

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
          background: '#0f1116',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '76px',
              height: '76px',
              borderRadius: '20px',
              background: '#e11d2e',
              fontSize: '40px',
              fontWeight: 700,
            }}
          >
            A
          </div>
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
          Meta and Google Ads, managed from one dashboard
        </div>

        <div style={{ marginTop: '28px', fontSize: '30px', color: '#9aa1ae' }}>
          Unified reporting - automation rules - white-label reports
        </div>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            fontSize: '26px',
            color: '#6b7280',
          }}
        >
          <div style={{ width: '48px', height: '4px', background: '#e11d2e' }} />
          advetics.com
        </div>
      </div>
    ),
    size,
  );
}
