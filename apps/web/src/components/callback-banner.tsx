'use client';

import { useSearchParams } from 'next/navigation';
import { PLATFORM_LABELS, type Platform } from '@advetics/shared';
import { Serit } from '@/components/ui/hal';

/**
 * OAuth dönüşünde sonucu gösterir.
 *
 * Sonuç sunucudan query string ile geliyor çünkü callback bir tam sayfa
 * yönlendirmesi — istemci state'i o noktada kaybolmuş oluyor.
 */
export function CallbackBanner() {
  const params = useSearchParams();
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
      title: `${platform} bağlantısı kuruldu`,
      body: accounts
        ? `${accounts} reklam hesabı bulundu. İzlemek istediklerini aşağıdan aç; hepsi kapalı başlar.`
        : 'Reklam hesabı bulunamadı. "Hesapları yenile" ile tekrar dene.',
    },
    eksik_izin: {
      ton: 'uyari',
      title: 'Bağlantı kuruldu ama izinler eksik',
      body: 'Bazı zorunlu izinler verilmedi. Aşağıdaki karttan "Yeniden yetkilendir" ile eksik izinleri tamamla.',
    },
    iptal: {
      ton: 'bilgi',
      title: 'Yetkilendirme iptal edildi',
      body: 'İzin ekranında iptal ettin, hiçbir şey değişmedi.',
    },
    hata: {
      ton: 'hata',
      title: 'Bağlantı kurulamadı',
      body: message ?? 'Bilinmeyen bir hata oluştu.',
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
      title: 'Ölçüm izinleri verildi',
      body: 'Tag Manager ve Analytics adımları artık kurulabilir.',
    },
    eksik_izin: {
      ton: variants.eksik_izin!.ton,
      title: 'Ölçüm izinleri eksik',
      body: 'Google izin ekranında Tag Manager ya da Analytics kutularından biri işaretsiz bırakıldı. "Ölçüm izinlerini ver" ile tekrar dene ve bütün kutuları işaretli bırak.',
    },
    iptal: {
      ton: variants.iptal!.ton,
      title: 'Ölçüm izni iptal edildi',
      body: 'İzin ekranında iptal ettin, hiçbir şey değişmedi.',
    },
    hata: {
      ton: variants.hata!.ton,
      title: 'Ölçüm izni verilemedi',
      body: message ?? 'Bilinmeyen bir hata oluştu.',
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
