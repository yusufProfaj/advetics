'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { PlatformLogo } from '@/components/platform-logo';
import { Kart } from '@/components/ui/kart';
import { Girdi } from '@/components/ui/alan';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { useSozluk } from '@/dil/saglayici';
import { baglantilarSozlugu } from '@/dil/sozlukler/ayarlar-baglantilar';

/**
 * YOUTUBE KANALINI HAVUZA EKLER.
 *
 * ═══ NEDEN YAPIŞTIRMA, NEDEN LİSTE DEĞİL ═══
 *
 * Instagram hesapları kendiliğinden listeleniyor çünkü Meta yetkilendirmesi
 * sayfaları ve onlara bağlı Instagram hesaplarını bize VERİYOR. Google
 * yetkilendirmesi yalnızca Google Ads kapsamı taşıyor; "bu hesabın kanalları"
 * sorusunu sormak ayrı bir YouTube kapsamı ve BÜTÜN Google bağlantısının
 * yeniden yetkilendirilmesi demek. Bu projede yeniden yetkilendirme daha önce
 * canlı bağlantıları kopardı.
 *
 * Yapıştırma aynı sonucu API anahtarıyla veriyor: kanal doğrulanıyor, adı ve
 * görseli okunuyor ve havuza düşüyor. Oradan sonrası Instagram hesabıyla
 * BİREBİR AYNI — aynı havuz kartı, aynı atama penceresi.
 *
 * KANAL DOĞRUDAN BİR WORKSPACE'E EKLENMİYOR. Kanalı ekleyen kişi o an
 * hangi müşteriye ait olduğunu seçmek zorunda kalırdı; seçim yanlışsa kanal
 * yanlış müşteride abone olur ve videoları başka bir markanın paneline
 * düşerdi.
 */
export function YouTubeKanalEkle({ canManage, children }: { canManage: boolean; children?: ReactNode }) {
  const router = useRouter();
  const d = useSozluk(baglantilarSozlugu).ytEkle;
  const [girdi, setGirdi] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);

  async function ekle(): Promise<void> {
    if (!girdi.trim()) return;
    setBekliyor(true);
    setHata(null);
    setSonuc(null);
    try {
      const r = await apiFetch<{ title: string; channelId: string }>(
        '/autoboost/youtube/channels',
        {
          method: 'POST',
          // `clientId` GÖNDERİLMİYOR: kanal havuza giriyor, atama ayrı adım.
          body: JSON.stringify({ channelInput: girdi.trim() }),
        },
      );
      setGirdi('');
      setSonuc(d.havuzaEklendi(r.title));
      // Havuz sayacı sunucu tarafında hesaplanıyor; yenilemeden kanal
      // listede görünmez ve kullanıcı ekleme başarısız sanır.
      startTransition(() => router.refresh());
    } catch (err) {
      /*
       * SUNUCUNUN KENDİ CÜMLESİ. "Kanal eklenemedi" demek, kullanıcıyı
       * yapıştırdığı adresi suçlamaya gönderiyor; oysa mesaj çoğu zaman
       * doğrudan söylüyor (Google Ads bağlantısı yok, kanal bulunamadı,
       * API anahtarı tanımsız).
       */
      setHata(err instanceof ApiRequestError ? err.message : d.kanalEklenemedi);
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <Kart
      baslik={
        <span className="flex items-center gap-2">
          <PlatformLogo kind="youtube" className="h-5 w-5" />
          {d.baslik}
        </span>
      }
    >
      <div className="grid gap-3">
        <p className="m-0 text-13 text-ink-muted">{d.aciklama}</p>

        <div className="flex flex-wrap gap-2">
          <div className="min-w-0 flex-1">
            <Girdi
              type="text"
              value={girdi}
              onChange={(e) => setGirdi(e.target.value)}
              onKeyDown={(e) => {
                // Enter ile eklemek, kısa bir alanda düğmeye uzanmaktan hızlı.
                if (e.key === 'Enter') void ekle();
              }}
              disabled={!canManage || bekliyor}
              placeholder={d.adresYer}
              aria-label={d.adresEtiketi}
            />
          </div>
          <Dugme
            ton="koyu"
            onClick={() => void ekle()}
            disabled={!canManage || girdi.trim() === ''}
            bekliyor={bekliyor || isPending}
          >
            {d.ekle}
          </Dugme>
        </div>

        {!canManage && <p className="m-0 text-12 text-ink-muted">{d.yoneticininIsi}</p>}
        {hata && (
          <Serit ton="hata" baslik={d.kanalEklenemediBaslik}>
            {hata}
          </Serit>
        )}
        {sonuc && (
          <Serit ton="bilgi" baslik={d.eklendi}>
            {sonuc}
          </Serit>
        )}

        {/*
          KANALIN KENDİSİ NEREDE BULUNUR — kullanıcı "kanal kimliği" kavramını
          bilmek zorunda değil ve bilmediğinde yapıştırdığı şey genelde video
          adresi oluyor.
        */}
        <p className="m-0 text-12 text-ink-muted">{d.ipucu}</p>

        {/* Adresi bilmeyen için isimle arama (sayfa veriyor): aynı işin ikinci yolu, aynı kartta. */}
        {children && <div className="grid gap-2 border-t border-line pt-4">{children}</div>}
      </div>
    </Kart>
  );
}
