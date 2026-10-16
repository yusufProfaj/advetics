'use client';

import { useState } from 'react';
import { DetaySatiri } from '@/components/tenancy/musteri-detay';
import { MusteriBilgiFormu, type MusteriBilgileri } from '@/components/tenancy/musteri-bilgi-formu';
import { Dugme } from '@/components/ui/dugme';
import { koordinatYaz, sec } from '@advetics/shared';
import { useDil } from '@/dil/saglayici';
import { markaMerkeziBildirimSozlugu } from '@/dil/sozlukler/marka-merkezi-bildirim';

/**
 * ═══ İLETİŞİM VE FİRMA BİLGİLERİ — MARKA MERKEZİ'NDE ═══
 *
 * Bu bilgiler yalnızca Şirketler ekranındaki workspace penceresinde
 * düzenlenebiliyordu ve oraya Marka Merkezi'nden yol yoktu. Kullanıcı
 * workspace'e geçtikten sonra doldurulacak her şeyi tek yerden yapmak
 * istiyor (2026-10-06). Rapor alıcıları bunların içinde ve boşken rapor
 * maili kimseye gitmiyor.
 *
 * FORM PENCEREDEKİYLE AYNI (`MusteriBilgiFormu`): ikinci bir form, alan
 * listesi ilk değiştiğinde ayrışırdı.
 */
export function FirmaBilgileri({
  clientId,
  bilgi,
  saatDilimi,
  paraBirimi,
  canManage,
  kompakt = false,
}: {
  clientId: string;
  bilgi: MusteriBilgileri;
  saatDilimi: string;
  paraBirimi: string;
  canManage: boolean;
  /**
   * Sihirbazın "Workspace bilgileri" adımı: yalnız SAYILAN alanlar (site,
   * iletişim, rapor alıcıları, adres + konum). Vergi, IBAN, saat dilimi
   * sayılmıyor ve adımda göstermek "bunlar da mı eksik" sorusu doğururdu;
   * evleri Workspace bilgileri bölümü. FORM AYNI (`MusteriBilgiFormu`).
   */
  kompakt?: boolean;
}) {
  const { dil } = useDil();
  const d = sec(markaMerkeziBildirimSozlugu, dil).firma;
  const [duzenle, setDuzenle] = useState(false);

  if (duzenle) {
    return <MusteriBilgiFormu clientId={clientId} baslangic={bilgi} onBitti={() => setDuzenle(false)} />;
  }

  if (kompakt) {
    const konum =
      bilgi.addressLatitude != null && bilgi.addressLongitude != null ? koordinatYaz({ enlem: bilgi.addressLatitude, boylam: bilgi.addressLongitude }) : null;
    return (
      <div className="space-y-3">
        <div className="rounded-alan border border-line px-3 py-1">
          <DetaySatiri etiket={d.internetSitesi} deger={bilgi.website} />
          <DetaySatiri etiket={d.yetkiliKisi} deger={bilgi.contactName} />
          <DetaySatiri etiket={d.telefon} deger={bilgi.contactPhone} />
          <DetaySatiri etiket={d.raporAlicilari} deger={bilgi.contactEmails.length > 0 ? bilgi.contactEmails.join(', ') : null} />
          <DetaySatiri etiket={d.adres} deger={bilgi.address} />
          <DetaySatiri etiket={d.haritaKonumu} deger={konum} />
        </div>
        {canManage && (
          <Dugme ton="koyu" boyut="kucuk" onClick={() => setDuzenle(true)}>
            {d.bilgileriDuzenle}
          </Dugme>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold text-ink">{d.iletisim}</p>
          <div className="rounded-alan border border-line px-3 py-1">
            <DetaySatiri etiket={d.yetkiliKisi} deger={bilgi.contactName} />
            <DetaySatiri
              etiket={d.raporAlicilari}
              deger={bilgi.contactEmails.length > 0 ? bilgi.contactEmails.join(', ') : null}
            />
            <DetaySatiri etiket={d.telefon} deger={bilgi.contactPhone} />
            <DetaySatiri etiket={d.internetSitesi} deger={bilgi.website} />
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-ink">{d.firma}</p>
          <div className="rounded-alan border border-line px-3 py-1">
            <DetaySatiri etiket={d.adres} deger={bilgi.address} />
            {/* "Bölgemde çok kişi görsün" reklamının "adresin çevresi" seçeneği bunu okuyor. */}
            <DetaySatiri
              etiket={d.haritaKonumu}
              deger={bilgi.addressLatitude != null && bilgi.addressLongitude != null ? koordinatYaz({ enlem: bilgi.addressLatitude, boylam: bilgi.addressLongitude }) : null}
            />
            <DetaySatiri etiket={d.vergiDairesi} deger={bilgi.taxOffice} />
            <DetaySatiri etiket={d.vergiNumarasi} deger={bilgi.taxNumber} />
            <DetaySatiri etiket="IBAN" deger={bilgi.iban} />
            <DetaySatiri etiket={d.saatDilimi} deger={saatDilimi} />
            <DetaySatiri etiket={d.paraBirimi} deger={paraBirimi} />
          </div>
          {/*
            SALT OKUNUR (MIMARI Ç-16 ⚠): metrik günleri ve tutarlar bu dilim ve
            birimle yazıldı; değiştirmek geçmiş raporları sessizce kaydırırdı.
          */}
          <p className="mt-1 text-[11px] text-ink-muted">{d.saltOkunur}</p>
        </div>
      </div>
      {bilgi.notes && (
        <p className="whitespace-pre-wrap rounded-alan bg-surface-muted px-3 py-2 text-xs text-ink-muted">
          {bilgi.notes}
        </p>
      )}
      {/* RAPOR ALICISI YOKSA SÖYLENİYOR: boş liste, planlanan rapor mailinin
          kimseye gitmemesi demek ve bunu ilk fark eden müşteri olur. */}
      {bilgi.contactEmails.length === 0 && (
        <p className="text-xs text-warn-strong">{d.raporAlicisiYok}</p>
      )}
      {canManage && (
        <Dugme ton="ikincil" boyut="kucuk" onClick={() => setDuzenle(true)}>
          {d.bilgileriDuzenle}
        </Dugme>
      )}
    </div>
  );
}
