'use client';

import { useState } from 'react';
import {
  ROLES,
  ROL_SUTUNLARI,
  YETKI_GRUPLARI,
  rolAciklamasi,
  rolEtiketi,
  sahipAciklamasi,
  sahipEtiketi,
  yetkiVar,
  type Dil,
  type Role,
  type RolSutunu,
} from '@advetics/shared';
import { Kart } from '@/components/ui/kart';
import { Dugme } from '@/components/ui/dugme';
import { useDil, useSozluk } from '@/dil/saglayici';
import { ekipSozlugu } from '@/dil/sozlukler/ayarlar-ekip';

/** Sütun adı ekranın dilinde (shared'daki `sutunEtiketi` yalnız Türkçe). */
function sutunEtiketi(s: RolSutunu, dil: Dil): string {
  return s === 'sahip' ? sahipEtiketi(dil) : rolEtiketi(s, dil);
}

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
  const { dil } = useDil();
  const d = useSozluk(ekipSozlugu).roller;

  return (
    <Kart
      dolgu={false}
      baslik={d.baslik}
      eylem={
        <Dugme ton="hayalet" boyut="kucuk" onClick={() => setAcik((a) => !a)} aria-expanded={acik}>
          {acik ? d.gizle : d.goster}
        </Dugme>
      }
    >
      <p className="m-0 border-b border-line px-5 py-3 text-13 text-ink-muted">{d.aciklama}</p>

      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <RolKarti etiket={sutunEtiketi('sahip', dil)} aciklama={sahipAciklamasi(dil)} sahip />
        {ROLES.map((r) => (
          <RolKarti key={r} etiket={rolEtiketi(r, dil)} aciklama={rolAciklamasi(r, dil)} />
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
                {d.neYapabilir}
              </th>
              {ROL_SUTUNLARI.map((s) => (
                <th
                  key={s}
                  scope="col"
                  className="border-b border-line px-3 py-2.5 text-center text-12 font-semibold text-ink-muted"
                >
                  {sutunEtiketi(s, dil)}
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
        <p className="m-0 px-4 py-3 text-12 text-ink-muted">{d.dipnot}</p>
      </div>
    </Kart>
  );
}

/*
 * GRUP VE SATIR BAŞLIKLARI SHARED'DA (`YETKI_GRUPLARI`) VE HENÜZ YALNIZ
 * TÜRKÇE: İngilizcesi D4'te shared etiketleriyle birlikte. Burada
 * çevrilmeleri ikinci bir liste doğurur ve matris değişince ayrışırdı.
 */
function GrupSatirlari({ grup }: { grup: (typeof YETKI_GRUPLARI)[number] }) {
  const d = useSozluk(ekipSozlugu).roller;
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
                <span aria-label={var_ ? d.evet : d.hayir} className={var_ ? 'font-bold text-ink' : 'text-ink-soluk'}>
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
  const { dil } = useDil();
  return <span className="block text-12 text-ink-muted">{rolAciklamasi(rol, dil)}</span>;
}
