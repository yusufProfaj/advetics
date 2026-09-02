'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  SABLON_PARAM,
  SECTION_LABELS,
  VARSAYILAN_SABLONLAR,
  varsayilanSablon,
  type ReportTemplateSummary,
} from '@advetics/shared';
import { Halka } from '@/components/yukleniyor';
import { SablonModal } from './sablon-yonetimi';

/**
 * ═══ ŞABLON SEÇİCİ ═══
 *
 * Rapor tek bir biçimde üretiliyordu: Meta ve Google aynı belgede, kitle
 * kırılımı hiç yok. Ajans müşteriye çoğu zaman TEK PLATFORMUN raporunu
 * gönderiyor ve o raporda "kim tıkladı" sorusunun cevabı olması gerekiyor.
 *
 * SEÇİM URL'DE, bileşen durumunda değil. Sayfa sunucu bileşeni ve rapor
 * sunucuda üretiliyor; seçimi istemcide tutmak, seçtikten sonra veriyi
 * ikinci kez istemciden çekmek demekti. URL'de olması aynı zamanda
 * paylaşılabilir kılıyor — "şu raporun Google hâlini aç".
 *
 * ┌─ KAYITLI ŞABLONLAR DA BURADA ─────────────────────────────────────────┐
 * │ Öncesinde bu liste YALNIZCA üç ön ayarı gösteriyordu ve kullanıcının   │
 * │ kendi şablonu ayrı bir sayfada (`/raporlar/sablonlar`) düzenleniyordu. │
 * │ Sonuç, kullanıcının bildirdiği hâl: şablonu düzenliyor, rapor ekranına │
 * │ dönüyor, seçiciden bir şey seçiyor ve DÜZENLEMESİ KAYBOLUYOR — çünkü   │
 * │ `sablon` parametresi konduğu anda sunucu ön ayarı uygulayıp kayıtlı    │
 * │ şablonun bölüm sırasını atıyor. İkisi aynı listede olunca "hangisi     │
 * │ geçerli" sorusu ortadan kalkıyor: seçilen ne ise rapor da PDF de o.    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * DÜZENLEME DE BURADA. Şablonu değiştirmek raporla ilgili bir iş ve
 * kullanıcının onu kenar çubuğunda ayrı bir sayfada aramasının hiçbir
 * sebebi yok — üstelik oraya gidip dönmek yukarıdaki hatayı doğuruyordu.
 *
 * DİĞER SÜZGEÇLER KORUNUYOR. Tarih aralığı ayrı parametrelerde ve elle
 * bağlantı kurmak onları düşürüyordu; mevcut arama dizesi kopyalanıp
 * yalnızca `sablon` değiştiriliyor.
 */
export function SablonSecici({
  secili,
  sablonlar,
  musteriler,
  isOrgAdmin,
  duzenleyebilir,
}: {
  /** Ön ayar kodu ya da kayıtlı şablonun UUID'si. */
  secili: string | null;
  sablonlar: ReportTemplateSummary[];
  musteriler: Array<{ id: string; name: string }>;
  isOrgAdmin: boolean;
  /** `report.write` — müşteri hesabı raporu okuyor, biçimini değiştirmiyor. */
  duzenleyebilir: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [acik, setAcik] = useState(false);
  const [duzenlenen, setDuzenlenen] = useState<ReportTemplateSummary | 'yeni' | null>(null);
  const [isPending, startTransition] = useTransition();
  const kutuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function disari(e: MouseEvent): void {
      if (!kutuRef.current?.contains(e.target as Node)) setAcik(false);
    }
    document.addEventListener('mousedown', disari);
    return () => document.removeEventListener('mousedown', disari);
  }, []);

  const kayitli = sablonlar.find((s) => s.id === secili) ?? null;
  const aktifAd = kayitli ? kayitli.name : varsayilanSablon(secili).ad;

  function sec(deger: string): void {
    setAcik(false);
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    p.set(SABLON_PARAM, deger);
    /*
     * `replace`, `push` DEĞİL: şablon değiştirmek bir gezinme değil aynı
     * ekranın başka bir görünümü. Geri düğmesi kullanıcıyı bir önceki
     * şablona değil, geldiği sayfaya götürmeli.
     */
    startTransition(() => router.replace(`${pathname}?${p.toString()}`));
  }

  return (
    <div ref={kutuRef} className="relative">
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        disabled={isPending}
        aria-haspopup="listbox"
        aria-expanded={acik}
        className="flex min-w-[15rem] items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-left transition hover:bg-surface-muted disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight text-ink">
            {aktifAd}
          </span>
          <span className="block truncate text-[11px] leading-tight text-ink-muted">
            Rapor şablonu
          </span>
        </span>
        {isPending ? (
          <Halka className="h-3.5 w-3.5" />
        ) : (
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className="h-4 w-4 shrink-0 text-ink-muted"
            aria-hidden
          >
            <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {acik && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1.5 max-h-[26rem] w-[24rem] overflow-y-auto rounded-xl border border-line bg-surface shadow-lg"
        >
          <p className="px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            Hazır şablonlar
          </p>
          {VARSAYILAN_SABLONLAR.map((s) => (
            <button
              key={s.kod}
              type="button"
              role="option"
              aria-selected={!kayitli && s.kod === varsayilanSablon(secili).kod}
              onClick={() => sec(s.kod)}
              className={`block w-full px-3.5 py-2.5 text-left transition hover:bg-surface-muted ${
                !kayitli && s.kod === varsayilanSablon(secili).kod ? 'bg-surface-sunken' : ''
              }`}
            >
              <span className="block text-sm font-medium text-ink">{s.ad}</span>
              {/*
                AÇIKLAMA ŞART. "Google Ads Şablonu" tek başına neyin
                değiştiğini söylemiyor; kullanıcı seçip raporun yarısının
                kaybolduğunu görünce bunu bir arıza sanıyor.
              */}
              <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">
                {s.aciklama}
              </span>
            </button>
          ))}

          {sablonlar.length > 0 && (
            <>
              <div className="mt-1 h-px bg-line" />
              <p className="px-3.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Kendi şablonların
              </p>
              {sablonlar.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-start gap-1 pr-1.5 transition hover:bg-surface-muted ${
                    t.id === secili ? 'bg-surface-sunken' : ''
                  }`}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={t.id === secili}
                    onClick={() => sec(t.id)}
                    className="min-w-0 flex-1 px-3.5 py-2.5 text-left"
                  >
                    <span className="block truncate text-sm font-medium text-ink">{t.name}</span>
                    {/*
                      KAPSAM VE BÖLÜM SIRASI GÖRÜNÜYOR. İki şablonun adı
                      benzer olabiliyor; ayırt eden şey ne içerdikleri.
                    */}
                    <span className="mt-0.5 block truncate text-[11px] leading-snug text-ink-muted">
                      {t.clientId === null ? 'Organizasyon varsayılanı' : (t.clientName ?? 'Müşteri')}{' '}
                      · {t.sections.map((s) => SECTION_LABELS[s]).join(' → ')}
                    </span>
                  </button>
                  {duzenleyebilir && (
                    <button
                      type="button"
                      onClick={() => {
                        setAcik(false);
                        setDuzenlenen(t);
                      }}
                      className="mt-2.5 shrink-0 rounded-md border border-line px-2 py-1 text-[11px] text-ink-muted transition hover:bg-surface hover:text-ink"
                    >
                      Düzenle
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {duzenleyebilir && (
            <>
              <div className="mt-1 h-px bg-line" />
              {/*
                "YENİ ŞABLON" LİSTENİN SONUNDA, seçeneklerin arasında değil:
                bu bir rapor seçimi değil, bir yönetim işi. Ayrı bir sayfaya
                götürmüyor — oraya gidip dönmek tam da düzeltilen hatayı
                üretiyordu (düzenleme yapılıyor, dönüşte seçici ön ayara
                geçiyor ve düzenleme kayboluyor).
              */}
              <button
                type="button"
                onClick={() => {
                  setAcik(false);
                  setDuzenlenen('yeni');
                }}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-ink-muted transition hover:bg-surface-muted hover:text-ink"
              >
                <span aria-hidden="true">＋</span>
                Yeni şablon oluştur
              </button>
            </>
          )}
        </div>
      )}

      {duzenlenen !== null && (
        <SablonModal
          sablon={duzenlenen === 'yeni' ? null : duzenlenen}
          musteriler={musteriler}
          isOrgAdmin={isOrgAdmin}
          onKapat={() => setDuzenlenen(null)}
          /*
           * KAYDEDİLEN ŞABLON HEMEN SEÇİLİYOR.
           *
           * Kaydedip ekranda hiçbir şeyin değişmediğini görmek, düzeltilen
           * hatanın ta kendisiydi: kullanıcı düzenlemesinin uygulanmadığını
           * sanıyor. Yeni şablon da seçiliyor, çünkü onu oluşturmanın tek
           * sebebi kullanmak.
           */
          onKaydedildi={(id) => {
            setDuzenlenen(null);
            sec(id);
          }}
        />
      )}
    </div>
  );
}
