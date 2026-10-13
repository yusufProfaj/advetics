'use client';

import Link from 'next/link';
import { ayarlarAdresi } from '@/lib/panel-adresleri';
import { dugmeSinifi } from '@/components/ui/dugme';
import { PAKET_SINIRLARI, type ManagerAccountTree } from '@advetics/shared';

/**
 * ═══ ÜST HESAP ŞERİDİ — "hangi hesaptasın, ne kadarını doldurdun" ═══
 *
 * KART BİR ZAMANLAR YÖNETİM EKRANIYDI ve artık değil: düzenleme, paket
 * seçimi, yeni hesap ve silme aynı sayfanın "Üst hesaplar" kartında
 * (`ust-hesap-yonetimi.tsx`, `#ust-hesaplar`) ve o kart YALNIZ platform
 * sahibine çiziliyor (kullanıcı kararı, 2026-10-13). Ajans yöneticisine
 * bağlantı gösterilmiyor: tıklayınca çizilmeyen bir karta gitmek, var olan
 * bir ayarı aratır.
 *
 * SEBEBİ: bu kart yalnızca AKTİF hesabı biliyor. İkinci bir hesabın adını
 * değiştirmek için önce ona geçmek gerekiyordu — bir ad düzeltmesi için
 * kullanıcının bağlamını, açık şirketini ve workspace seçimini değiştirmek.
 * Silme ise hiç yoktu.
 *
 * ŞERİT KALDI ÇÜNKÜ SORDUĞU SORU BU EKRANA AİT: Şirketler listesi ÜST
 * HESABIN altındakileri gösteriyor ve hangi hesabın altında olduğun
 * yazmazsa liste bağlamsız kalıyor — platform sahibi onlarca hesap arasında
 * geziyor. Doluluk da burada: "3 / 5 şirket" yazmadan, paket sınırına
 * takılan kullanıcı sebebi yalnızca hata mesajından öğrenirdi.
 */
export function UstHesapKarti({ agac, platformSahibi }: { agac: ManagerAccountTree; platformSahibi: boolean }) {
  const sinir = PAKET_SINIRLARI[agac.paket];
  const sirketSayisi = agac.organizations.length;

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-kart border border-line bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="text-11 font-semibold text-brand-strong">
          Üst hesap
        </p>
        <h2 className="truncate text-base font-semibold text-ink">{agac.name}</h2>
        <p className="text-xs text-ink-muted">
          {sinir.etiket} paketi ·{' '}
          <DolulukMetni mevcut={sirketSayisi} sinir={sinir.maxSirket} birim="şirket" />
        </p>
      </div>
      {/*
        AYARLAR AYRI SAYFADA VE BAĞLANTI BURADA. Kullanıcı hesabı bu ekranda
        görüp ayarını başka yerde araması gerektiğini bilmiyorsa, taşıma onu
        özelliği kaybetmiş gibi hissettirir.
      */}
      {platformSahibi && (
        <Link
          href={ayarlarAdresi('sirketler', { capa: 'ust-hesaplar' })}
          className={dugmeSinifi('ikincil', 'kucuk')}
        >
          Üst hesap ayarları
        </Link>
      )}
    </section>
  );
}

/** "3 / 5 şirket" — sınırsızda "3 şirket". `null` sınırsız demek, sıfır değil. */
export function dolulukMetni(mevcut: number, sinir: number | null, birim: string): string {
  return sinir === null ? `${mevcut} ${birim}` : `${mevcut} / ${sinir} ${birim}`;
}

function DolulukMetni({ mevcut, sinir, birim }: { mevcut: number; sinir: number | null; birim: string }) {
  const dolu = sinir !== null && mevcut >= sinir;
  return <span className={dolu ? 'font-medium text-danger-strong' : ''}>{dolulukMetni(mevcut, sinir, birim)}</span>;
}

