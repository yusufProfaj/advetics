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
import { Kart } from '@/components/ui/kart';
import { Dugme } from '@/components/ui/dugme';

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
    <Kart
      dolgu={false}
      baslik="Roller: kim ne yapabilir"
      eylem={
        <Dugme ton="hayalet" boyut="kucuk" onClick={() => setAcik((a) => !a)} aria-expanded={acik}>
          {acik ? 'Ayrıntılı karşılaştırmayı gizle' : 'Ayrıntılı karşılaştırmayı göster'}
        </Dugme>
      }
    >
      <p className="m-0 border-b border-line px-5 py-3 text-13 text-ink-muted">
        Yetki KİŞİYE değil, kişi × kapsam eşleşmesine veriliyor: aynı kişi bir şirkette Yönetici, başka bir
        workspace’te yalnızca izleyici olabilir.
      </p>

      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <RolKarti etiket={sutunEtiketi('sahip')} aciklama={SAHIP_ACIKLAMASI} sahip />
        {ROLES.map((r) => (
          <RolKarti key={r} etiket={ROL_ETIKETI[r]} aciklama={ROL_ACIKLAMASI[r]} />
        ))}
      </div>

      {/*
        TABLO DOM'DA KALIYOR, `hidden` İLE GİZLENİYOR (CLAUDE.md §3 Tasarım):
        açılıp kapanan öğe DOM'dan çıkmıyor; ekran okuyucu ve sayfa içi
        arama da gizliyken onu görmüyor.
      */}
      <div hidden={!acik} className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[40rem] border-collapse text-left text-13">
          <thead>
            <tr>
              <th scope="col" className="border-b border-line px-4 py-2.5 text-12 font-semibold text-ink-muted">
                Ne yapabilir
              </th>
              {ROL_SUTUNLARI.map((s) => (
                <th
                  key={s}
                  scope="col"
                  className="border-b border-line px-3 py-2.5 text-center text-12 font-semibold text-ink-muted"
                >
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
        <p className="m-0 px-4 py-3 text-12 text-ink-muted">
          Yönetici yetkisi verildiği kapsamda geçerli: üst hesapta verilirse bütün şirketler, tek şirkette
          verilirse yalnızca o şirket. Sahip yetkisi panelden verilemez.
        </p>
      </div>
    </Kart>
  );
}

function GrupSatirlari({ grup }: { grup: (typeof YETKI_GRUPLARI)[number] }) {
  return (
    <>
      <tr className="bg-surface-muted">
        {/* GRUP BAŞLIĞI BÜYÜK HARF DEĞİL (BILESENLER § 2 Tablo): Türkçe "İ/ı" büyük harfte kırılıyordu. */}
        <th
          scope="rowgroup"
          colSpan={ROL_SUTUNLARI.length + 1}
          className="px-4 py-2 text-left text-12 font-bold text-ink"
        >
          {grup.baslik}
        </th>
      </tr>
      {grup.satirlar.map((satir) => (
        <tr key={satir.baslik} className="border-b border-line">
          <td className="px-4 py-2 text-ink">{satir.baslik}</td>
          {ROL_SUTUNLARI.map((s) => {
            const var_ = yetkiVar(s, satir.izin);
            return (
              <td key={s} className="px-3 py-2 text-center">
                {/* İşaret metin olarak da okunuyor — ekran okuyucu ve kopyala-yapıştır için. */}
                <span aria-label={var_ ? 'evet' : 'hayır'} className={var_ ? 'font-bold text-ink' : 'text-ink-soluk'}>
                  {var_ ? '✓' : '-'}
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
    <div className="rounded-alan border border-line bg-surface-muted p-3">
      <p className="m-0 flex flex-wrap items-center gap-1.5 text-14 font-bold text-ink">
        {etiket}
        {sahip && (
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-11 font-semibold text-ink-muted">platform</span>
        )}
      </p>
      <p className="m-0 mt-1 text-12 leading-snug text-ink-muted">{aciklama}</p>
    </div>
  );
}

/**
 * Seçicinin altında duran tek satırlık açıklama — kişi ekleme ve yetki
 * verme pencereleri aynı metni buradan alıyor. `span` (blok): `Alan`ın
 * ipucu kutusu bir `small` ve içine `p` koymak geçersiz HTML.
 */
export function RolAciklamasi({ rol }: { rol: Role }) {
  return <span className="block text-12 text-ink-muted">{ROL_ACIKLAMASI[rol]}</span>;
}
