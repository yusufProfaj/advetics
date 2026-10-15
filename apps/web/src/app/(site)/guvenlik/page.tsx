import type { Metadata } from 'next';
import Link from 'next/link';

import { sec } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { siteArayuzSozlugu } from '@/dil/sozlukler/site-arayuz';
import { dilBaglantilari } from '@/lib/site-metadata';
import { yerelYol } from '@/lib/site-yollari';
import { menuEtiketi, siteIcerigi } from '@/components/landing/site-icerik';
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
export async function generateMetadata(): Promise<Metadata> {
  const dil = await dilAl();
  return {
    title: `${menuEtiketi(dil, '/guvenlik')} | Advetics`,
    description: sec(siteArayuzSozlugu, dil).guvenlik.metaAciklama,
    alternates: dilBaglantilari('/guvenlik', dil),
  };
}

export default async function GuvenlikSayfasi() {
  const dil = await dilAl();
  const d = sec(siteArayuzSozlugu, dil).guvenlik;
  const { GUVENLIK, YASAL_BELGELER } = siteIcerigi(dil);
  const gizlilik = YASAL_BELGELER.find((y) => y.href === '/gizlilik')!;
  return (
    <>
      <SayfaGirisi
        ust={menuEtiketi(dil, '/guvenlik')}
        baslik={d.baslik}
        ozet={d.ozet}
        ikincil={{ href: gizlilik.href, etiket: gizlilik.etiket }}
      />

      <Bolum baslik={d.nasilKoruyoruz}>
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

      <Bolum baslik={d.kontrol} koyu>
        <div className="grid gap-5 md:grid-cols-2">
          <Link
            href={yerelYol('/veri-silme', dil)}
            className="kart p-6 motion-safe:transition-colors"
          >
            <h3 className="font-baslik text-base font-bold text-ink">{d.silBaslik}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{d.silMetin}</p>
          </Link>
          <Link
            href={yerelYol('/gizlilik', dil)}
            className="kart p-6 motion-safe:transition-colors"
          >
            <h3 className="font-baslik text-base font-bold text-ink">{d.gizlilikBaslik}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{d.gizlilikMetin}</p>
          </Link>
        </div>
      </Bolum>

      <KapanisBandi />
    </>
  );
}
