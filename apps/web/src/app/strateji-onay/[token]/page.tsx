import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { stratejiUcYolu } from '@advetics/shared';
import { INTERNAL_API_URL } from '@/lib/api';
import { StratejiBelgesi } from '@/components/strateji/v2/belge';
import { onaySayfasiHali, tokenSorulmaliMi, type OnaySayfasiHali } from '@/components/strateji/v2/hesap';
import { BaglantiOnayKutusu } from '@/components/strateji/v2/onay-kutusu';
import type { BaglantiBelgesi } from '@advetics/shared';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Serit } from '@/components/ui/hal';

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

/**
 * İSTEMCİNİN IP'Sİ API'YE İLETİLİR (Ajan 4 bulgusu). Belge Next SUNUCUSUNDAN
 * okunuyor; başlık iletilmezse API bütün müşterileri tek IP (sunucunun
 * kendisi) olarak görüyor ve deneme sınırı herkes için ORTAK oluyordu: tahmin
 * deneyen biri onay sayfasını bütün müşterilere kapatabilirdi. Ters vekil
 * `X-Forwarded-For`un SONUNA gerçek adresi ekliyor; istemcinin kendi yazdığı
 * değerler solda kalıyor, yani SON eleman alınır. İstek iç adrese
 * (`INTERNAL_API_URL`, vekilsiz) gidiyor; API `trust proxy 1` ile bu başlığın
 * son elemanını IP sayıyor. Vekil üzerinden gidilseydi vekil sunucunun
 * adresini sona ekler ve iletim boşa giderdi.
 */
async function istemciIp(): Promise<string | null> {
  const h = await headers();
  const zincir = (h.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  return zincir.at(-1) ?? h.get('x-real-ip')?.trim() ?? null;
}

async function belgeOku(token: string): Promise<{ status: number | null; govde: BaglantiBelgesi | null }> {
  try {
    const ip = await istemciIp();
    const res = await fetch(`${INTERNAL_API_URL}${stratejiUcYolu('/strateji/v2/onay/:token', { token })}`, {
      cache: 'no-store',
      headers: ip ? { 'X-Forwarded-For': ip } : {},
    });
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
    /*
     * TEK NÖTR CÜMLE, ORTAK BAŞLIKLA (`SayfaBasligi`, elle `h1` değil).
     * Renkler token: eskiden sabit beyaz/siyah ve kılavuz hex'leri elle
     * yazılıydı; karanlık temada sayfanın geri kalanı koyu, bu kutu beyaz
     * kalıyordu.
     */
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
        <div className="grid w-full max-w-md gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/advetics-logo.png" alt="Advetics" width={140} height={29} className="h-[29px] w-auto self-start" />
          <SayfaBasligi baslik={m.baslik} aciklama={m.metin || undefined} />
        </div>
      </main>
    );
  }

  const { belge, yorumlar } = okuma.govde;
  return (
    <main className="min-h-screen bg-surface-muted px-3 py-6 sm:px-4 sm:py-8">
      {hal.not && (
        <div className="mx-auto mb-3 max-w-[860px]">
          {/* Ortak şerit: sol kırmızı çizgi, siyah metin (eskiden aynı görünüş elle yazılıydı). */}
          <Serit baslik={hal.not} />
        </div>
      )}
      <StratejiBelgesi
        veri={belge}
        gerceklesen={null}
        onayYuvasi={<BaglantiOnayKutusu token={token} surum={belge.plan.surum} onay={belge.plan.onay} kararAcik={hal.kararAcik} yorumlar={yorumlar} />}
      />
    </main>
  );
}
