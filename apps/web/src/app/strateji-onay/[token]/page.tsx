import type { Metadata } from 'next';
import { stratejiUcYolu } from '@advetics/shared';
import { API_URL } from '@/lib/api';
import { StratejiBelgesi } from '@/components/strateji/v2/belge';
import { onaySayfasiHali, tokenSorulmaliMi, type OnaySayfasiHali } from '@/components/strateji/v2/hesap';
import { BaglantiOnayKutusu } from '@/components/strateji/v2/onay-kutusu';
import type { BaglantiBelgesi } from '@/components/strateji/v2/yanit';

/**
 * ═══ GİRİŞSİZ STRATEJİ ONAYI (kullanıcı kararı K-2) — OTURUM GEREKTİRMEZ ═══
 *
 * `/strateji-onay` middleware'in genel erişim listesinde (`/r` gibi). Erişim
 * kararı yoldaki token: sunucu onu hash'leyip TEK satır okur. Bu sayfa bir
 * KARAR yazdırıyor (rapor bağlantısından farkı), kurallar
 * `packages/shared/src/strateji/v2/paylasim.ts`:
 *
 *  - Biçimsiz token sunucuya SORULMAZ (`tokenSorulmaliMi`).
 *  - Geçersiz / süresi dolmuş / iptal / bulunamadı TEK nötr cümle.
 *  - `noindex` + `nocache` + `Referrer-Policy: no-referrer`: token yolda ve
 *    belge müşteri verisi; sayfadan çıkan bir bağlantı onu başka siteye
 *    sızdırmasın, arama motoru dizinlemesin.
 *  - Oturum çerezi GÖNDERİLMEZ: `serverApiFetch` değil düz `fetch`.
 *
 * `force-dynamic`: bağlantının hâli (kullanıldı, sürüm değişti) her açılışta
 * yeniden okunmalı; önbellek tükenmiş bir bağlantıya karar düğmesi gösterirdi.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Strateji onayı',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

async function belgeOku(token: string): Promise<{ status: number | null; govde: BaglantiBelgesi | null }> {
  try {
    const res = await fetch(`${API_URL}${stratejiUcYolu('/strateji/v2/onay/:token', { token })}`, { cache: 'no-store' });
    if (!res.ok) return { status: res.status, govde: null };
    return { status: res.status, govde: (await res.json()) as BaglantiBelgesi };
  } catch {
    // Ağ hatası: "geçersiz" DEĞİL, "şu an açılamıyor" (onaySayfasiHali).
    return { status: null, govde: null };
  }
}

export default async function StratejiOnayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const okuma = tokenSorulmaliMi(token) ? await belgeOku(token) : { status: 404, govde: null };
  const hal: OnaySayfasiHali = onaySayfasiHali(okuma.status, okuma.govde);

  if (hal.tur === 'mesaj' || !okuma.govde?.belge) {
    const m = hal.tur === 'mesaj' ? hal : { baslik: 'Bağlantı geçersiz.', metin: '' };
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-white px-6 text-center text-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/advetics-logo.png" alt="Advetics" width={140} height={29} className="mb-8 h-[29px] w-auto" />
        <h1 className="font-baslik text-lg font-semibold">{m.baslik}</h1>
        {m.metin && <p className="mt-2 text-sm text-[#302e2d]/70">{m.metin}</p>}
      </main>
    );
  }

  const { belge, yorumlar } = okuma.govde;
  return (
    <main className="min-h-screen bg-[#302e2d]/[0.04] px-3 py-6 sm:px-4 sm:py-8">
      {hal.not && (
        <p className="mx-auto mb-3 max-w-[860px] rounded-xl border border-l-4 border-black/10 border-l-[#ff2400] bg-white px-4 py-3 text-sm font-semibold text-black" role="status">
          {hal.not}
        </p>
      )}
      <StratejiBelgesi
        veri={belge}
        gerceklesen={null}
        onayYuvasi={<BaglantiOnayKutusu token={token} surum={belge.plan.surum} onay={belge.plan.onay} kararAcik={hal.kararAcik} yorumlar={yorumlar} />}
      />
    </main>
  );
}
