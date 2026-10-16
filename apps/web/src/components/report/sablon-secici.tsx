'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import {
  SABLON_PARAM,
  SECTION_LABELS,
  VARSAYILAN_SABLONLAR,
  varsayilanSablon,
  type ReportTemplateSummary,
} from '@advetics/shared';
import { Halka } from '@/components/yukleniyor';
import { useSozluk } from '@/dil/saglayici';
import { raporlarSozlugu } from '@/dil/sozlukler/raporlar';
import { AcilirMenu, MenuAyraci, MenuBasligi, MenuOgesi } from '@/components/ui/acilir-menu';

/**
 * ═══ ŞABLON SEÇİCİ: RAPOR BÖLÜMÜNDE ÇİP ═══
 *
 * Rapor tek bir biçimde üretiliyordu: Meta ve Google aynı belgede, kitle
 * kırılımı hiç yok. Ajans müşteriye çoğu zaman TEK PLATFORMUN raporunu
 * gönderiyor ve o raporda "kim tıkladı" sorusunun cevabı olması gerekiyor.
 *
 * SEÇİM URL'DE, bileşen durumunda değil. Sayfa sunucu bileşeni ve rapor
 * sunucuda üretiliyor; seçimi istemcide tutmak, seçtikten sonra veriyi
 * ikinci kez istemciden çekmek demekti. URL'de olması aynı zamanda
 * paylaşılabilir kılıyor: "şu raporun Google hâlini aç".
 *
 * ┌─ KAYITLI ŞABLONLAR DA BURADA ─────────────────────────────────────────┐
 * │ Öncesinde bu liste YALNIZCA üç ön ayarı gösteriyordu ve kullanıcının   │
 * │ kendi şablonu ayrı bir sayfada düzenleniyordu. Sonuç, kullanıcının     │
 * │ bildirdiği hâl: şablonu düzenliyor, rapor ekranına dönüyor, seçiciden  │
 * │ bir şey seçiyor ve DÜZENLEMESİ KAYBOLUYOR. İkisi aynı listede olunca   │
 * │ "hangisi geçerli" sorusu ortadan kalkıyor: seçilen ne ise rapor da PDF │
 * │ de o.                                                                  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * DÜZENLEME AYNI SAYFANIN "Şablonlar" BÖLÜMÜNDE (onaylı taslak, 2026-10-14):
 * seçici yalnız seçiyor; listenin sonundaki "Şablonları yönet" o bölüme
 * götürüyor ve tarih aralığını koruyor. Ayrı sayfa DEĞİL: oraya gidip dönmek
 * yukarıdaki hatayı doğuruyordu.
 *
 * DİĞER SÜZGEÇLER KORUNUYOR. Tarih aralığı ayrı parametrelerde ve elle
 * bağlantı kurmak onları düşürüyordu; mevcut arama dizesi kopyalanıp
 * yalnızca `sablon` değiştiriliyor.
 */
export function SablonSecici({
  secili,
  sablonlar,
  duzenleyebilir,
}: {
  /** Ön ayar kodu ya da kayıtlı şablonun UUID'si. */
  secili: string | null;
  sablonlar: ReportTemplateSummary[];
  /** `report.write`: müşteri hesabı raporu okuyor, biçimini değiştirmiyor. */
  duzenleyebilir: boolean;
}) {
  const d = useSozluk(raporlarSozlugu).sablonSecici;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const kayitli = sablonlar.find((s) => s.id === secili) ?? null;
  const aktifAd = kayitli ? kayitli.name : varsayilanSablon(secili).ad;

  function sec(deger: string): void {
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    p.set(SABLON_PARAM, deger);
    /*
     * `replace`, `push` DEĞİL: şablon değiştirmek bir gezinme değil aynı
     * ekranın başka bir görünümü. Geri düğmesi kullanıcıyı bir önceki
     * şablona değil, geldiği sayfaya götürmeli.
     */
    startTransition(() => router.replace(`${pathname}?${p.toString()}`));
  }

  const yonetHref = (() => {
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    p.set('sekme', 'sablonlar');
    return `${pathname}?${p.toString()}`;
  })();

  return (
    <AcilirMenu
      etiket={d.etiket}
      genislik="w-[min(24rem,calc(100vw-2rem))]"
      tetik={({ acik, ...o }) => (
        <button
          type="button"
          {...o}
          disabled={isPending}
          className="inline-flex h-[30px] max-w-[20rem] items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-sunken px-3 text-[12.5px] font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
        >
          <span className="text-ink-muted">{d.onEk}</span>
          <b className="min-w-0 truncate" title={aktifAd}>
            {aktifAd}
          </b>
          {isPending ? (
            <Halka className="h-3 w-3" />
          ) : (
            <span aria-hidden className={`text-[10px] transition-transform motion-reduce:transition-none ${acik ? 'rotate-180' : ''}`}>
              ▾
            </span>
          )}
        </button>
      )}
    >
      <div className="max-h-[26rem] overflow-y-auto">
        <MenuBasligi>{d.hazirlar}</MenuBasligi>
        {VARSAYILAN_SABLONLAR.map((s) => (
          <MenuOgesi
            key={s.kod}
            secili={!kayitli && s.kod === varsayilanSablon(secili).kod}
            onClick={() => sec(s.kod)}
            /*
              AÇIKLAMA ŞART. "Google Ads Şablonu" tek başına neyin
              değiştiğini söylemiyor; kullanıcı seçip raporun yarısının
              kaybolduğunu görünce bunu bir arıza sanıyor.
            */
            aciklama={s.aciklama}
          >
            {s.ad}
          </MenuOgesi>
        ))}

        {sablonlar.length > 0 && (
          <>
            <MenuAyraci />
            <MenuBasligi>{d.kendi}</MenuBasligi>
            {sablonlar.map((t) => (
              <MenuOgesi
                key={t.id}
                secili={t.id === secili}
                onClick={() => sec(t.id)}
                /* KAPSAM VE BÖLÜM SIRASI GÖRÜNÜYOR: iki şablonun adı benzer olabiliyor. */
                aciklama={`${t.clientId === null ? d.orgVarsayilani : (t.clientName ?? 'Workspace')} · ${t.sections
                  .map((s) => SECTION_LABELS[s])
                  .join(' → ')}`}
              >
                {t.name}
              </MenuOgesi>
            ))}
          </>
        )}

        {duzenleyebilir && (
          <>
            <MenuAyraci />
            <MenuOgesi href={yonetHref}>{d.yonet}</MenuOgesi>
          </>
        )}
      </div>
    </AcilirMenu>
  );
}
