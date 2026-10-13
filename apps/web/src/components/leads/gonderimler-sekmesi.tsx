'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  GERI_BESLEME_ASAMA_ADI,
  GERI_BESLEME_OLAY_DURUM_ADI,
  GERI_BESLEME_OLAY_DURUMLARI,
  type GeriBeslemeOlayDurumu,
  type GeriBeslemeOlaylariYaniti,
  type GeriBeslemeYenidenDeneSonucu,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { bosNedenMetni, durumTonu, olayNotu, yenidenDenenebilir } from '@/lib/geri-besleme';
import { SecimCipi } from '@/components/suzgec-menusu';
import { Dugme } from '@/components/ui/dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '@/components/ui/hal';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { Tablo, type TabloSutunu } from '@/components/ui/tablo';

/**
 * ═══ POTANSİYEL MÜŞTERİLER › META'YA GÖNDERİMLER (MIMARI § 9) ═══
 *
 * DÖRT HÂL AYRI (CLAUDE.md `.catch(() => setX([]))` yasağı): yükleniyor,
 * hata (sunucunun cümlesi), boş + NEDENİ (`emptyReason`), dolu. Sayılar
 * süzgeçten bağımsız ve sessiz kesme yok: "1 - 50 / 61".
 *
 * "İletildi, eşleşmedi" ile "gönderilemedi" AYRI çip ve ayrı cümle: biri
 * yapılacak iş yok, diğeri var (sözleşme `olay.ts` başı).
 */
type Hal = { tur: 'yukleniyor' } | { tur: 'hata'; mesaj: string } | { tur: 'hazir'; y: GeriBeslemeOlaylariYaniti };
type Satir = GeriBeslemeOlaylariYaniti['satirlar'][number];

const SAYFA = 50;

/**
 * Ton → rozet: yalnız sorun kırmızı. Yeşil YALNIZ "Meta kabul etti"
 * (iletildi); eşleşmedi ve iptal de "sessiz" tonda ama yeşil bir iptal
 * başarı gibi okunurdu.
 */
function rozetHali(d: GeriBeslemeOlayDurumu): DurumHali {
  if (d === 'iletildi') return 'ok';
  return durumTonu(d) === 'sorun' ? 'hata' : 'taslak';
}

export function GonderimlerSekmesi({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const [hal, setHal] = useState<Hal>({ tur: 'yukleniyor' });
  const [durum, setDurum] = useState<GeriBeslemeOlayDurumu | null>(null);
  const [offset, setOffset] = useState(0);
  const [yeniden, setYeniden] = useState<{ calisiyor: boolean; sonuc: string | null }>({ calisiyor: false, sonuc: null });

  const yukle = useCallback(async () => {
    setHal({ tur: 'yukleniyor' });
    try {
      const y = await apiFetch<GeriBeslemeOlaylariYaniti>(
        baglanti('/geri-besleme/olaylar', { clientId, durum: durum ?? undefined, limit: String(SAYFA), offset: String(offset) }),
      );
      setHal({ tur: 'hazir', y });
    } catch (e) {
      setHal({ tur: 'hata', mesaj: e instanceof ApiRequestError ? e.message : 'Gönderimler okunamadı.' });
    }
  }, [clientId, durum, offset]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  async function tekrarDene(): Promise<void> {
    setYeniden({ calisiyor: true, sonuc: null });
    try {
      const r = await apiFetch<GeriBeslemeYenidenDeneSonucu>('/geri-besleme/olaylar/yeniden-dene', {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
      // 7 günü geçenler ve zaten ulaşanlar AYRI söyleniyor, sessizce atlanmıyor.
      const p = [`${r.kuyruga} sonuç yeniden sıraya alındı.`];
      if (r.suresiGecen > 0) p.push(`${r.suresiGecen} tanesi 7 günü geçtiği için gönderilemez.`);
      setYeniden({ calisiyor: false, sonuc: p.join(' ') });
      await yukle();
    } catch (e) {
      setYeniden({ calisiyor: false, sonuc: e instanceof ApiRequestError ? e.message : 'Yeniden denenemedi.' });
    }
  }

  const sayilar = hal.tur === 'hazir' ? hal.y.sayilar : null;
  const toplamHepsi = sayilar ? Object.values(sayilar).reduce((a, b) => a + b, 0) : 0;
  const denenebilir = sayilar ? yenidenDenenebilir(sayilar) : 0;
  const simdi = Date.now();

  const sutunlar: Array<TabloSutunu<Satir>> = [
    { anahtar: 'kisi', baslik: 'Kişi', hucre: (o) => <b className="font-semibold text-ink">{o.leadAdi ?? 'Adsız kayıt'}</b> },
    { anahtar: 'sonuc', baslik: 'Sonuç', hucre: (o) => GERI_BESLEME_ASAMA_ADI[o.asama] },
    {
      anahtar: 'zaman',
      baslik: 'Zaman',
      hucre: (o) => <span className="whitespace-nowrap tabular-nums text-ink-muted">{zaman(o.olayZamani)}</span>,
    },
    {
      anahtar: 'durum',
      baslik: 'Durum',
      hucre: (o) => {
        const not = olayNotu(o, simdi);
        return (
          <span className="grid justify-items-start gap-1">
            <Rozet hal={rozetHali(o.durum)}>{GERI_BESLEME_OLAY_DURUM_ADI[o.durum]}</Rozet>
            {not && <small className="max-w-xs break-words text-12 text-ink-muted">{not}</small>}
          </span>
        );
      },
    },
  ];

  return (
    <section className="min-w-0 rounded-kart border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <SecimCipi secili={durum === null} sayi={toplamHepsi} onClick={() => (setDurum(null), setOffset(0))}>
          Tümü
        </SecimCipi>
        {GERI_BESLEME_OLAY_DURUMLARI.filter((d) => (sayilar?.[d] ?? 0) > 0 || d === durum).map((d) => (
          <SecimCipi key={d} secili={durum === d} sayi={sayilar?.[d] ?? 0} onClick={() => (setDurum(d), setOffset(0))}>
            {GERI_BESLEME_OLAY_DURUM_ADI[d]}
          </SecimCipi>
        ))}
        <span className="flex-1" />
        {canWrite && denenebilir > 0 && (
          <Dugme ton="ikincil" boyut="kucuk" onClick={() => void tekrarDene()} bekliyor={yeniden.calisiyor}>
            {`Gönderilemeyenleri tekrar dene (${denenebilir})`}
          </Dugme>
        )}
      </div>
      {yeniden.sonuc && (
        <p role="status" className="m-0 border-b border-line px-4 py-2.5 text-13 text-ink">
          {yeniden.sonuc}
        </p>
      )}

      {hal.tur === 'yukleniyor' && (
        <div className="p-4">
          <Yukleniyor etiket="Gönderimler yükleniyor" />
        </div>
      )}
      {hal.tur === 'hata' && (
        <div className="p-4">
          <HataDurumu baslik="Gönderimler okunamadı" mesaj={hal.mesaj} onTekrar={() => void yukle()} />
        </div>
      )}
      {hal.tur === 'hazir' && (
        <Tablo
          etiket="Meta'ya gönderimler"
          sutunlar={sutunlar}
          satirlar={hal.y.satirlar}
          satirAnahtari={(o) => o.id}
          bos={
            <BosDurum
              baslik="Henüz gönderim yok"
              neden={hal.y.emptyReason ? bosNedenMetni(hal.y.emptyReason) : 'Gönderim bulunamadı.'}
            />
          }
          /* SESSİZ KESME YOK: kaç gönderim gösteriliyor, toplam kaç ("1 - 50 / 61"). */
          sayfalama={{
            bas: hal.y.satirlar.length === 0 ? 0 : offset + 1,
            son: offset + hal.y.satirlar.length,
            toplam: hal.y.toplam,
            onceki: offset > 0 ? () => setOffset(Math.max(0, offset - SAYFA)) : undefined,
            sonraki: offset + SAYFA < hal.y.toplam ? () => setOffset(offset + SAYFA) : undefined,
          }}
        />
      )}
    </section>
  );
}

function zaman(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(iso));
}
