'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Halka } from '@/components/yukleniyor';

/**
 * ═══ RAPOR / FATURALAR SEKMELERİ ═══
 *
 * Faturalar kenar çubuğunda ayrı bir bağlantıydı. Ayrı durmasının bir bedeli
 * vardı: fatura rapor mailinin EKİ ve tek tüketicisi bu ekran, ama kullanıcı
 * onu yüklemek için raporu terk edip başka bir sayfaya gidiyordu — döndüğünde
 * seçtiği dönem ve şablon sıfırlanmış oluyordu.
 *
 * SEÇİM URL'DE. Sayfa sunucu bileşeni; sekmeyi istemci durumunda tutmak,
 * fatura listesini ikinci kez istemciden çekmek demekti. URL'de olması
 * paylaşılabilir de kılıyor.
 *
 * DİĞER PARAMETRELER KORUNUYOR — ve bu kritik. Bağlantıyı elle kurup yalnızca
 * `sekme` yazmak, tarih aralığını ve şablonu düşürürdü; CLAUDE.md'de kayıtlı
 * "BAĞLANTIYI ELLE BİRLEŞTİRME — SÜZGEÇ DÜŞÜYOR" kuralı bire bir bu. Mevcut
 * arama dizesi kopyalanıp yalnızca `sekme` değiştiriliyor.
 */
const SEKMELER = [
  { kod: 'rapor', ad: 'Rapor' },
  { kod: 'faturalar', ad: 'Faturalar' },
] as const;

export type RaporSekmesi = (typeof SEKMELER)[number]['kod'];

export function RaporSekmeleri({ aktif }: { aktif: RaporSekmesi }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function sec(kod: RaporSekmesi): void {
    if (kod === aktif) return;
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    /*
     * VARSAYILAN SEKME URL'DEN SİLİNİYOR, `?sekme=rapor` yazılmıyor.
     * Adres çubuğunda taşınan her parametre paylaşılan bağlantıya da giriyor;
     * varsayılanı yazmak, hiçbir şey söylemeyen bir parametre bırakmak olurdu.
     */
    if (kod === 'rapor') p.delete('sekme');
    else p.set('sekme', kod);
    const dize = p.toString();
    startTransition(() => router.replace(dize ? `${pathname}?${dize}` : pathname));
  }

  return (
    <div role="tablist" className="flex items-center gap-1 border-b border-line">
      {SEKMELER.map((s) => (
        <button
          key={s.kod}
          type="button"
          role="tab"
          aria-selected={s.kod === aktif}
          onClick={() => sec(s.kod)}
          className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-medium transition ${
            s.kod === aktif
              ? 'border-brand text-ink'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          {s.ad}
        </button>
      ))}
      {/*
        BEKLEME GÖSTERGESİ ŞART. Sekme değişimi sunucuda veri çekiyor ve
        gecikme fark ediliyor; gösterge olmadan kullanıcı tıklamanın işe
        yaramadığını sanıp tekrar tıklıyor.
      */}
      {isPending && <Halka className="ml-1 h-3.5 w-3.5" />}
    </div>
  );
}
