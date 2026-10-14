import type { Metadata } from 'next';
import Link from 'next/link';

import { GUVENLIK } from '@/components/landing/site-icerik';
import { Bolum, KapanisBandi, SayfaGirisi } from '@/components/landing/site-parcalari';

/**
 * Veri gizliliği ve güvenlik.
 *
 * YALNIZCA KODDA KARŞILIĞI OLAN cümleler: satır düzeyi güvenlik
 * (`prisma/sql/02_rls.sql`), şifreli erişim anahtarları, salt okunur MCP,
 * rol tabanlı yetki, denetim kaydı (`audit_logs`). Sertifika, "banka
 * düzeyinde" gibi ölçülemeyen sözler YOK: güvenlik sayfasında abartı,
 * güveni artırmıyor, ilk teknik soruda düşürüyor.
 *
 * Her maddenin altında teknik okuyucu için tek satır var; ana metin sade.
 */
export const metadata: Metadata = {
  title: 'Güvenlik | Advetics',
  description:
    'Advetics her şirketin verisini veritabanı düzeyinde ayırır, parola istemez, erişim ' +
    'anahtarlarını şifreli saklar ve yapay zekâ bağlantısını salt okunur tutar.',
  alternates: { canonical: '/guvenlik' },
};

export default function GuvenlikSayfasi() {
  return (
    <>
      <SayfaGirisi
        ust="Güvenlik"
        baslik="Verileriniz sizde, ayrı ve korunuyor"
        ozet={
          'Reklam hesaplarınızın verisi işinizin bilgisidir. Aşağıda onu nasıl ' +
          'koruduğumuzu teknik terimlere boğmadan anlatıyoruz.'
        }
        ikincil={{ href: '/gizlilik', etiket: 'Gizlilik Politikası' }}
      />

      <Bolum baslik="Nasıl koruyoruz">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GUVENLIK.map((g) => (
            <li key={g.baslik} className="kart flex flex-col p-6">
              <h3 className="font-baslik text-base font-bold text-ink">{g.baslik}</h3>
              <p className="mt-2.5 flex-1 text-sm leading-relaxed text-ink-muted">{g.metin}</p>
              <p className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">{g.teknik}</p>
            </li>
          ))}
        </ul>
      </Bolum>

      <Bolum baslik="Verinizin kontrolü sizde" koyu>
        <div className="grid gap-5 md:grid-cols-2">
          <Link
            href="/veri-silme"
            className="kart p-6 motion-safe:transition-colors"
          >
            <h3 className="font-baslik text-base font-bold text-ink">Verilerinizi silin</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
              {'Hesabınızın ve verilerinizin silinmesini nasıl isteyeceğiniz.'}
            </p>
          </Link>
          <Link
            href="/gizlilik"
            className="kart p-6 motion-safe:transition-colors"
          >
            <h3 className="font-baslik text-base font-bold text-ink">Gizlilik politikası</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">
              {'Hangi veriyi neden topladığımız ve kiminle paylaştığımız.'}
            </p>
          </Link>
        </div>
      </Bolum>

      <KapanisBandi />
    </>
  );
}
