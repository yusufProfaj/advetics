'use client';

import { useSearchParams } from 'next/navigation';
import { PLATFORM_LABELS, type Platform } from '@advetics/shared';
import { Serit } from '@/components/ui/hal';
import { useSozluk } from '@/dil/saglayici';
import { baglantilarSozlugu } from '@/dil/sozlukler/ayarlar-baglantilar';

/**
 * OAuth dönüşünde sonucu gösterir.
 *
 * Sonuç sunucudan query string ile geliyor çünkü callback bir tam sayfa
 * yönlendirmesi — istemci state'i o noktada kaybolmuş oluyor.
 */
export function CallbackBanner() {
  const params = useSearchParams();
  const d = useSozluk(baglantilarSozlugu).donus;
  const result = params.get('connection');
  if (!result) return null;

  const raw = params.get('platform') ?? '';
  /*
   * Etiket ORTAK TABLODAN. Üçlü koşul iki platformu tanıyordu; üçüncüsünde
   * kullanıcıya ham `linkedin` yazardı — çirkin değil, GÜVENSİZ: bağlantı
   * kurulduğunu söyleyen bir bandın hangi platformdan bahsettiği belirsiz
   * kalıyordu.
   */
  const platform = PLATFORM_LABELS[raw as Platform] ?? raw;
  const accounts = params.get('hesap');
  const message = params.get('mesaj');

  const variants: Record<string, { ton: 'uyari' | 'hata' | 'bilgi'; title: string; body: string }> = {
    basarili: {
      ton: 'bilgi',
      title: d.kuruldu(platform),
      body: accounts ? d.hesapBulundu(accounts) : d.hesapBulunamadi,
    },
    eksik_izin: {
      ton: 'uyari',
      title: d.izinEksikBaslik,
      body: d.izinEksikGovde,
    },
    iptal: {
      ton: 'bilgi',
      title: d.iptalBaslik,
      body: d.iptalGovde,
    },
    hata: {
      ton: 'hata',
      title: d.hataBaslik,
      body: message ?? d.bilinmeyen,
    },
  };

  /*
   * ÖLÇÜM İZNİ AKIŞI KENDİ CÜMLELERİYLE (`izin=olcum`, connections.service).
   * Kurulum ekranı bu bandı hiç çizmiyordu: kullanıcı Google'dan dönüyor,
   * aynı "Ölçüm izinlerini ver" düğmesini görüyor ve izin mi verilmedi,
   * yanlış hesapla mı girildi, iptal mi etti bilemiyordu. Genel "reklam
   * hesabı bulundu, izlemek istediklerini aç" metni burada YANLIŞ: bu akış
   * hesap bağlamıyor, var olan bağlantıya izin ekliyor.
   */
  const olcumVaryantlari: Record<string, { ton: 'uyari' | 'hata' | 'bilgi'; title: string; body: string }> = {
    basarili: {
      ton: variants.basarili!.ton,
      title: d.olcumVerildi,
      body: d.olcumVerildiGovde,
    },
    eksik_izin: {
      ton: variants.eksik_izin!.ton,
      title: d.olcumEksik,
      body: d.olcumEksikGovde,
    },
    iptal: {
      ton: variants.iptal!.ton,
      title: d.olcumIptal,
      body: d.iptalGovde,
    },
    hata: {
      ton: variants.hata!.ton,
      title: d.olcumHata,
      body: message ?? d.bilinmeyen,
    },
  };
  const tablo = params.get('izin') === 'olcum' ? olcumVaryantlari : variants;
  const v = tablo[result] ?? tablo.hata!;

  return (
    <Serit ton={v.ton} baslik={v.title}>
      {v.body}
    </Serit>
  );
}
