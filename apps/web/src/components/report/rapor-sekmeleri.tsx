'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Halka } from '@/components/yukleniyor';
import { SayfaIcMenu } from '@/components/ui/sayfa-ic-menu';
import { useSozluk } from '@/dil/saglayici';
import { raporlarSozlugu } from '@/dil/sozlukler/raporlar';

/**
 * ═══ RAPORLAR BÖLÜMLERİ: SAYFA İÇİ YAN MENÜ (kullanıcı kararı 2026-10-14) ═══
 *
 * Rapor · Haftalık özet · Şablonlar · Faturalar. Üstteki sekme çubuğu
 * "kontrolü karmaşık" yapıyordu; bölümler artık içeriğin solunda
 * (`SayfaIcMenu`). Eksik fatura menüde kırmızı nokta.
 *
 * Faturalar kenar çubuğunda ayrı bir bağlantıydı. Ayrı durmasının bir bedeli
 * vardı: fatura rapor mailinin EKİ ve tek tüketicisi bu ekran, ama kullanıcı
 * onu yüklemek için raporu terk edip başka bir sayfaya gidiyordu; döndüğünde
 * seçtiği dönem ve şablon sıfırlanmış oluyordu.
 *
 * SEÇİM URL'DE. Sayfa sunucu bileşeni; bölümü istemci durumunda tutmak,
 * fatura listesini ikinci kez istemciden çekmek demekti.
 *
 * DİĞER PARAMETRELER KORUNUYOR ve bu kritik. Bağlantıyı elle kurup yalnızca
 * `sekme` yazmak, tarih aralığını ve şablonu düşürürdü; CLAUDE.md'de kayıtlı
 * "BAĞLANTIYI ELLE BİRLEŞTİRME — SÜZGEÇ DÜŞÜYOR" kuralı bire bir bu. Mevcut
 * arama dizesi kopyalanıp yalnızca `sekme` değiştiriliyor.
 */
const SEKMELER = [
  { kod: 'rapor' },
  /*
   * HAFTALIK ÖZET (Paket B) raporun yanında: aynı alıcıya giden ikinci belge
   * ve aynı gönderen. Ayrı sayfa olsaydı "rapor planı" ile "özet planı"
   * kullanıcı için iki ayrı yerde dururdu.
   */
  { kod: 'ozet' },
  { kod: 'sablonlar' },
  { kod: 'faturalar' },
] as const;

export type RaporSekmesi = (typeof SEKMELER)[number]['kod'];

/**
 * `faturalar`: fatura bölümü yalnız paylaşım yetkisiyle (müşteri hesabı
 * raporu ve kendi haftalık özetini görür, faturayı yönetmez).
 */
export function RaporSekmeleri({
  aktif,
  faturalar,
  faturaEksik = false,
  sablonSayisi,
}: {
  aktif: RaporSekmesi;
  faturalar: boolean;
  /** Ekrandaki dönemin faturası eksik (ya da okunamadı): menüde kırmızı nokta. */
  faturaEksik?: boolean;
  /** Kayıtlı şablon sayısı (hazırlar hariç). */
  sablonSayisi?: number;
}) {
  const d = useSozluk(raporlarSozlugu).sekmeler;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function adres(kod: RaporSekmesi): string {
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    /*
     * VARSAYILAN BÖLÜM URL'DEN SİLİNİYOR, `?sekme=rapor` yazılmıyor.
     * Adres çubuğunda taşınan her parametre paylaşılan bağlantıya da giriyor;
     * varsayılanı yazmak, hiçbir şey söylemeyen bir parametre bırakmak olurdu.
     */
    if (kod === 'rapor') p.delete('sekme');
    else p.set('sekme', kod);
    const dize = p.toString();
    return dize ? `${pathname}?${dize}` : pathname;
  }

  function sec(kod: string): void {
    if (kod === aktif) return;
    // `push`, `replace` DEĞİL: bölüm adreste taşınıyor ve geri tuşu önceki
    // bölüme dönmeli (sayfa içi menünün öteki sayfalarında bölümler zaten
    // bağlantı: Varlıklar, İyileştir, Marka Merkezi). `replace` ile
    // Faturalar → geri, kullanıcıyı Raporlar'dan tamamen çıkarıyordu.
    startTransition(() => router.push(adres(kod as RaporSekmesi)));
  }

  return (
    <div className="grid gap-2">
      <SayfaIcMenu
        etiket={d.etiket}
        secili={aktif}
        onSec={sec}
        ogeler={SEKMELER.filter((s) => s.kod !== 'faturalar' || faturalar).map((s) => ({
          deger: s.kod,
          etiket: d[s.kod],
          sayi: s.kod === 'sablonlar' && sablonSayisi ? sablonSayisi : undefined,
          uyari: s.kod === 'faturalar' && faturaEksik,
        }))}
      />
      {/*
        BEKLEME GÖSTERGESİ ŞART. Bölüm değişimi sunucuda veri çekiyor ve
        gecikme fark ediliyor; gösterge olmadan kullanıcı tıklamanın işe
        yaramadığını sanıp tekrar tıklıyor.
      */}
      <span aria-live="polite" className={`flex items-center gap-2 px-3 text-12 text-ink-muted ${isPending ? '' : 'invisible'}`}>
        <Halka className="h-3.5 w-3.5" />
        {d.aciliyor}
      </span>
    </div>
  );
}
