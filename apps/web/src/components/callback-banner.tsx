'use client';

import { useSearchParams } from 'next/navigation';
import { PLATFORM_LABELS, type Platform } from '@advetics/shared';

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

  const variants: Record<string, { cls: string; title: string; body: string }> = {
    basarili: {
      cls: 'border-ok/30 bg-ok-soft/60 text-ok-strong',
      title: `${platform} bağlantısı kuruldu`,
      body: accounts
        ? `${accounts} reklam hesabı bulundu. İzlemek istediklerini aşağıdan aç — hepsi kapalı başlar.`
        : 'Reklam hesabı bulunamadı. "Hesapları yenile" ile tekrar dene.',
    },
    eksik_izin: {
      cls: 'border-warn/30 bg-warn-soft/60 text-warn-strong',
      title: 'Bağlantı kuruldu ama izinler eksik',
      body: 'Bazı zorunlu izinler verilmedi. Aşağıdaki karttan "Yeniden yetkilendir" ile eksik izinleri tamamla.',
    },
    iptal: {
      cls: 'border-line bg-surface-muted text-ink',
      title: 'Yetkilendirme iptal edildi',
      body: 'İzin ekranında iptal ettin, hiçbir şey değişmedi.',
    },
    hata: {
      cls: 'border-danger/30 bg-danger-soft text-danger-strong',
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
  const olcumVaryantlari: Record<string, { cls: string; title: string; body: string }> = {
    basarili: {
      cls: variants.basarili!.cls,
      title: 'Ölçüm izinleri verildi',
      body: 'Tag Manager ve Analytics adımları artık kurulabilir.',
    },
    eksik_izin: {
      cls: variants.eksik_izin!.cls,
      title: 'Ölçüm izinleri eksik',
      body: 'Google izin ekranında Tag Manager ya da Analytics kutularından biri işaretsiz bırakıldı. "Ölçüm izinlerini ver" ile tekrar dene ve bütün kutuları işaretli bırak.',
    },
    iptal: {
      cls: variants.iptal!.cls,
      title: 'Ölçüm izni iptal edildi',
      body: 'İzin ekranında iptal ettin, hiçbir şey değişmedi.',
    },
    hata: {
      cls: variants.hata!.cls,
      title: 'Ölçüm izni verilemedi',
      body: message ?? 'Bilinmeyen bir hata oluştu.',
    },
  };
  const tablo = params.get('izin') === 'olcum' ? olcumVaryantlari : variants;
  const v = tablo[result] ?? tablo.hata!;

  return (
    <div role="status" className={`rounded-xl border p-4 ${v.cls}`}>
      <p className="text-sm font-semibold">{v.title}</p>
      <p className="mt-1 text-sm">{v.body}</p>
    </div>
  );
}
