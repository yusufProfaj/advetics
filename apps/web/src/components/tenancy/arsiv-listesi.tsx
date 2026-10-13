'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ArsivWorkspaceSatiri } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { AdHucresi, Tablo } from '@/components/ui/tablo';

/**
 * ═══ ARŞİV — ARŞİVLENEN WORKSPACE GERİ ALINABİLİYOR ═══
 *
 * Arşivleme silme değildi ama arşivlenen workspace panelden bir daha HİÇ
 * görünmüyordu: liste ucu arşivlileri eliyordu, geri alma ucu yoktu ve
 * eski pencere "geri almak için durumu aktif yap" diyordu — o alanı
 * gösteren bir ekran olmadan. Yanlışlıkla arşivlenen bir workspace için
 * tek yol veritabanına elle girmekti (MIMARI Ç-4).
 *
 * Geri alma yalnız durumu değiştiriyor: hesap atamaları, izleme ve geçmiş
 * arşivdeyken de yerinde duruyordu.
 */
export function ArsivListesi({
  satirlar,
  geriAlabilir,
}: {
  satirlar: ArsivWorkspaceSatiri[];
  /** `PANEL_KAPILARI['workspace.geriAl']` — sunucuda hesaplandı. */
  geriAlabilir: boolean;
}) {
  const router = useRouter();
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [hata, setHata] = useState<{ id: string; metin: string } | null>(null);

  async function geriAl(s: ArsivWorkspaceSatiri) {
    setMesgul(s.id);
    setHata(null);
    try {
      await apiFetch(`/clients/${s.id}/geri-al`, { method: 'POST' });
      router.refresh();
    } catch (e) {
      setHata({ id: s.id, metin: e instanceof ApiRequestError ? e.message : 'Arşivden alınamadı.' });
    } finally {
      setMesgul(null);
    }
  }

  if (satirlar.length === 0) {
    return <p className="m-0 px-5 py-4 text-13 text-ink-muted">Arşivde workspace yok.</p>;
  }

  const hataSatiri = hata ? (satirlar.find((s) => s.id === hata.id) ?? null) : null;

  return (
    <>
      {hata && (
        <div className="px-4 pt-4">
          <Serit ton="hata" baslik={hataSatiri ? `${hataSatiri.name} arşivden alınamadı` : 'Arşivden alınamadı'}>
            {hata.metin}
          </Serit>
        </div>
      )}
      <Tablo
        etiket="Arşivdeki workspace’ler"
        satirlar={satirlar}
        satirAnahtari={(s) => s.id}
        sutunlar={[
          {
            anahtar: 'ad',
            baslik: 'Workspace',
            hucre: (s) => <AdHucresi ad={s.name} alt={s.slug} />,
          },
          { anahtar: 'hesap', baslik: 'Hesaplar', sayi: true, hucre: (s) => `${s._count.adAccounts} hesap` },
          {
            anahtar: 'tarih',
            baslik: 'Arşivlendi',
            ikincil: true,
            hucre: (s) =>
              s.archivedAt
                ? new Date(s.archivedAt).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })
                : 'Tarih kayıtlı değil',
          },
          {
            anahtar: 'eylem',
            baslik: <span className="sr-only">Eylemler</span>,
            sayi: true,
            hucre: (s) =>
              geriAlabilir ? (
                <Dugme
                  ton="ikincil"
                  boyut="kucuk"
                  bekliyor={mesgul === s.id}
                  disabled={mesgul !== null}
                  onClick={() => void geriAl(s)}
                >
                  Geri al
                </Dugme>
              ) : null,
          },
        ]}
        sayfalama={{ bas: 1, son: satirlar.length, toplam: satirlar.length }}
      />
    </>
  );
}
