'use client';

import { useState } from 'react';
import { DetaySatiri } from '@/components/tenancy/musteri-detay';
import { MusteriBilgiFormu, type MusteriBilgileri } from '@/components/tenancy/musteri-bilgi-formu';
import { Dugme } from '@/components/ui/dugme';

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
}: {
  clientId: string;
  bilgi: MusteriBilgileri;
  saatDilimi: string;
  paraBirimi: string;
  canManage: boolean;
}) {
  const [duzenle, setDuzenle] = useState(false);

  if (duzenle) {
    return <MusteriBilgiFormu clientId={clientId} baslangic={bilgi} onBitti={() => setDuzenle(false)} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold text-ink">İletişim</p>
          <div className="rounded-lg border border-line px-3 py-1">
            <DetaySatiri etiket="Yetkili kişi" deger={bilgi.contactName} />
            <DetaySatiri
              etiket="Rapor alıcıları"
              deger={bilgi.contactEmails.length > 0 ? bilgi.contactEmails.join(', ') : null}
            />
            <DetaySatiri etiket="Telefon" deger={bilgi.contactPhone} />
            <DetaySatiri etiket="İnternet sitesi" deger={bilgi.website} />
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-ink">Firma</p>
          <div className="rounded-lg border border-line px-3 py-1">
            <DetaySatiri etiket="Adres" deger={bilgi.address} />
            <DetaySatiri etiket="Vergi dairesi" deger={bilgi.taxOffice} />
            <DetaySatiri etiket="Vergi numarası" deger={bilgi.taxNumber} />
            <DetaySatiri etiket="IBAN" deger={bilgi.iban} />
            <DetaySatiri etiket="Saat dilimi" deger={saatDilimi} />
            <DetaySatiri etiket="Raporlama para birimi" deger={paraBirimi} />
          </div>
        </div>
      </div>
      {bilgi.notes && (
        <p className="whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
          {bilgi.notes}
        </p>
      )}
      {/* RAPOR ALICISI YOKSA SÖYLENİYOR: boş liste, planlanan rapor mailinin
          kimseye gitmemesi demek ve bunu ilk fark eden müşteri olur. */}
      {bilgi.contactEmails.length === 0 && (
        <p className="text-xs text-warn-strong">Rapor alıcısı yok. Rapor maili bu workspace için kimseye gitmez.</p>
      )}
      {canManage && (
        <Dugme ton="ikincil" boyut="kucuk" onClick={() => setDuzenle(true)}>
          Bilgileri düzenle
        </Dugme>
      )}
    </div>
  );
}
