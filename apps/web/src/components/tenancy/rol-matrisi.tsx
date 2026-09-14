'use client';

import { useState } from 'react';
import {
  ROLES,
  ROL_ACIKLAMASI,
  ROL_ETIKETI,
  ROL_SUTUNLARI,
  SAHIP_ACIKLAMASI,
  YETKI_GRUPLARI,
  sutunEtiketi,
  yetkiVar,
  type Role,
} from '@advetics/shared';

/**
 * ═══ ROL KARŞILAŞTIRMA TABLOSU ═══
 *
 * Google Ads'in "hesap erişim düzeyi seç" tablosuyla aynı biçim — kullanıcı
 * tam olarak onu istedi: *"bana bir liste oluştur, yetkilendirme kısmında bu
 * şekilde bir bilgilendirme yap, yetkilendirirken bunları görebilelim."*
 *
 * HÜCRELER YAZILMIYOR, TÜRETİLİYOR (`yetkiVar`): tablo `ROLE_PERMISSIONS`
 * matrisinden hesaplanıyor. Elle işaretlenmiş bir tablo, matris değiştiğinde
 * ekranda yalan söylemeye başlar ve bunu yalnızca "tıkladım, 403" yaşayan
 * kullanıcı fark eder.
 *
 * VARSAYILAN KAPALI, ÖZET AÇIK: dört rolün tek cümlelik tanımı her zaman
 * görünüyor; on dokuz satırlık tablo düğmeyle açılıyor. Ekip ekranının asıl
 * işi kişi listesi; tabloyu hep açık bırakmak listeyi ekranın altına iterdi.
 */
export function RolMatrisi({ baslangictaAcik = false }: { baslangictaAcik?: boolean }) {
  const [acik, setAcik] = useState(baslangictaAcik);

  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Roller — kim ne yapabilir</h2>
          <p className="mt-0.5 max-w-prose text-[11px] text-ink-muted">
            Yetki KİŞİYE değil, kişi × kapsam eşleşmesine veriliyor: aynı kişi bir
            şirkette Yönetici, başka bir workspace’te yalnızca izleyici olabilir.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAcik((a) => !a)}
          aria-expanded={acik}
          className="shrink-0 text-xs font-medium text-brand-strong hover:underline"
        >
          {acik ? 'Ayrıntılı karşılaştırmayı gizle' : 'Ayrıntılı karşılaştırmayı göster'}
        </button>
      </header>

      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4">
        <RolKarti etiket={sutunEtiketi('sahip')} aciklama={SAHIP_ACIKLAMASI} sahip />
        {ROLES.map((r) => (
          <RolKarti key={r} etiket={ROL_ETIKETI[r]} aciklama={ROL_ACIKLAMASI[r]} />
        ))}
      </div>

      {acik && (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead>
              <tr className="border-b border-line text-[11px] text-ink-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  Ne yapabilir
                </th>
                {ROL_SUTUNLARI.map((s) => (
                  <th key={s} scope="col" className="px-3 py-2 text-center font-medium">
                    {sutunEtiketi(s)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {YETKI_GRUPLARI.map((grup) => (
                <GrupSatirlari key={grup.baslik} grup={grup} />
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-ink-muted">
            Yönetici yetkisi verildiği kapsamda geçerli: üst hesapta verilirse bütün
            şirketler, tek şirkette verilirse yalnızca o şirket. Sahip yetkisi panelden
            verilemez.
          </p>
        </div>
      )}
    </section>
  );
}

function GrupSatirlari({ grup }: { grup: (typeof YETKI_GRUPLARI)[number] }) {
  return (
    <>
      <tr className="bg-surface-sunken/60">
        <th
          scope="rowgroup"
          colSpan={ROL_SUTUNLARI.length + 1}
          className="px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
        >
          {grup.baslik}
        </th>
      </tr>
      {grup.satirlar.map((satir) => (
        <tr key={satir.baslik} className="border-b border-line/60">
          <td className="px-4 py-2 text-ink">{satir.baslik}</td>
          {ROL_SUTUNLARI.map((s) => {
            const var_ = yetkiVar(s, satir.izin);
            return (
              <td key={s} className="px-3 py-2 text-center">
                {/* İşaret metin olarak da okunuyor — ekran okuyucu ve kopyala-yapıştır için. */}
                <span
                  aria-label={var_ ? 'evet' : 'hayır'}
                  className={var_ ? 'font-semibold text-ok' : 'text-ink-muted/40'}
                >
                  {var_ ? '✓' : '—'}
                </span>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function RolKarti({
  etiket,
  aciklama,
  sahip = false,
}: {
  etiket: string;
  aciklama: string;
  sahip?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-sunken/40 p-3">
      <p className="text-sm font-semibold text-ink">
        {etiket}
        {sahip && (
          <span className="ml-1.5 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-strong">
            platform
          </span>
        )}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-ink-muted">{aciklama}</p>
    </div>
  );
}

/**
 * Seçicinin altında duran tek satırlık açıklama — kişi ekleme ve yetki
 * verme pencereleri aynı metni buradan alıyor.
 */
export function RolAciklamasi({ rol }: { rol: Role }) {
  return <p className="mt-1 text-[11px] text-ink-muted">{ROL_ACIKLAMASI[rol]}</p>;
}
