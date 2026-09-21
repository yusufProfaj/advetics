'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { TUM_SIRKETLER } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';

/**
 * ═══ EKMEK KIRINTISI — ŞİRKET › WORKSPACE › KAMPANYA › REKLAM SETİ ═══
 *
 * Kullanıcının isteği birebir: Google Ads'teki kampanya hiyerarşisi ve her
 * basamak tıklanabilir.
 *
 * ═══ NEDEN GEREKLİ ═══
 *
 * İnmek zaten mümkündü (şirket tablosu → workspace tablosu → kampanya
 * listesi) ama ÇIKMAK değildi: bir kampanyanın içine girdikten sonra geri
 * dönmenin tek yolu tarayıcının geri düğmesiydi ve nerede olduğun hiçbir
 * yerde yazmıyordu. Derinleşen bir ekranda "neredeyim" sorusunun cevabı
 * ekranda durmak zorunda.
 *
 * ═══ İKİ FARKLI GEZİNME, TEK ŞERİT ═══
 *
 * İlk iki basamak KAPSAM DEĞİŞİMİ (sunucudaki seçim cookie'si), son ikisi
 * URL süzgeci. Kullanıcı için ikisi aynı şey; teknik fark şeride
 * sızdırılmıyor. Kapsam değişimi bir istek gerektirdiği için düğme,
 * süzgeçler bağlantı: bağlantı olanlar paylaşılabiliyor ve yeni sekmede
 * açılabiliyor, düğme olanlar olamaz — bu fark kabul edilmiş bir kalıntı.
 *
 * SON BASAMAK BAĞLANTI DEĞİL. Bulunduğun yere tıklamak hiçbir şey yapmaz ve
 * tıklanabilir görünmesi kullanıcıya bir şey olacağını söyler.
 */
export interface YolBasamagi {
  ad: string;
  /** Kapsam değişimi — sunucuya yazılıyor. */
  kapsam?: { tip: 'ajans' } | { tip: 'sirket' };
  /** URL süzgeci — bağlantı. */
  sorgu?: Record<string, string | undefined>;
}

export function HiyerarsiYolu({
  basamaklar,
  tasinan,
}: {
  basamaklar: YolBasamagi[];
  tasinan: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [bekleyen, setBekleyen] = useState<number | null>(null);
  const [hata, setHata] = useState<string | null>(null);

  async function kapsamaGec(i: number, kapsam: NonNullable<YolBasamagi['kapsam']>): Promise<void> {
    setBekleyen(i);
    setHata(null);
    try {
      /*
       * AJANS KAPSAMI ŞİRKET DEĞİŞTİRİCİDEN GEÇİYOR, workspace'ten değil:
       * "Tüm şirketler" bir şirket seçimi (sentinel) ve workspace seçimini
       * sunucu kendisi sıfırlıyor.
       *
       * ŞİRKET KAPSAMI ise workspace seçimini KALDIRMAK demek — ayrı bir
       * "yukarı çık" ucu yazmak, iki yolun bir gün ayrışması olurdu.
       */
      if (kapsam.tip === 'ajans') {
        await apiFetch('/auth/switch-org', {
          method: 'POST',
          body: JSON.stringify({ organizationId: TUM_SIRKETLER }),
        });
      } else {
        await apiFetch('/auth/switch-client', {
          method: 'POST',
          body: JSON.stringify({ clientId: null }),
        });
      }
      startTransition(() => {
        /*
         * ADRES TEMİZLENİYOR. Sayfalar aktif kapsamı `params.* ??
         * session.*` sırasıyla çözüyor, yani URL parametresi cookie'yi
         * EZİYOR: `?musteri=` ya da `?kampanya=` kalırsa üst bar yeni
         * kapsamı yazarken gövde eskisini gösterir.
         */
        router.replace('/dashboard');
        router.refresh();
      });
    } catch (e) {
      // HATA YUTULMUYOR: geçiş sessizce düşerse kullanıcı tıklıyor, hiçbir
      // şey olmuyor ve sebebi hiçbir ekranda yazmıyor.
      setHata(e instanceof ApiRequestError ? e.message : 'Kapsam değiştirilemedi.');
      setBekleyen(null);
    }
  }

  return (
    <div>
      <nav aria-label="Konum" className="flex flex-wrap items-center gap-1 text-xs">
        {basamaklar.map((b, i) => {
          const sonuncu = i === basamaklar.length - 1;
          return (
            <span key={`${b.ad}-${i}`} className="flex items-center gap-1">
              {i > 0 && (
                <span aria-hidden="true" className="text-ink-muted">
                  ›
                </span>
              )}
              {sonuncu ? (
                <span aria-current="page" className="font-medium text-ink">
                  {b.ad}
                </span>
              ) : b.kapsam ? (
                <button
                  type="button"
                  onClick={() => void kapsamaGec(i, b.kapsam!)}
                  disabled={bekleyen !== null || isPending}
                  className="rounded px-1 py-0.5 text-ink-muted transition hover:text-brand-strong disabled:opacity-40"
                >
                  {bekleyen === i ? '…' : b.ad}
                </button>
              ) : (
                <Link
                  href={baglanti('/dashboard', tasinan, b.sorgu ?? {})}
                  className="rounded px-1 py-0.5 text-ink-muted transition hover:text-brand-strong"
                >
                  {b.ad}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
      {hata && (
        <p role="alert" className="mt-1 text-[11px] text-danger">
          {hata}
        </p>
      )}
    </div>
  );
}
