'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  FORMAT_TEXT_SPEC,
  packTextsFor,
  type AssetRecord,
  type CreativeFormat,
  type CreativeRecord,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { CreativeEditor } from './creative-editor';
import { useVarlikYeni } from './birincil-eylem';
import { Kart } from '@/components/ui/kart';
import { Dugme } from '@/components/ui/dugme';
import { AdHucresi, SayfalamaCubugu, Tablo } from '@/components/ui/tablo';
import { Rozet } from '@/components/ui/rozet';
import { BosDurum, Serit } from '@/components/ui/hal';
import { Pencere } from '@/components/ui/pencere';
import { AcilirMenu, IKON_TETIK, MenuAyraci, MenuOgesi } from '@/components/ui/acilir-menu';

/**
 * Kreatif kütüphanesi listesi.
 *
 * HER SATIRDA PLATFORM HAZIRLIĞI YAZIYOR. Kreatifin "iyi" olup olmadığı tek
 * başına bir soru değil: aynı kreatif Meta'ya hazır, Google'a hazır
 * olmayabilir ve fark yalnızca metin sayısından geliyor. Listede tek bir
 * "tamam" rozeti göstermek, uzmanın Google kampanyası kurarken neden
 * reddedildiğini anlamaması demek olurdu.
 *
 * TABLO + YAN PANEL (2026-10-14, taslak `#varlik`): her kreatif bir satır,
 * biçim hazırlığı aynı satırda rozet; "Düzenle" dışarıda, Kopyala ve Sil ⋯
 * menüsünde. Düzenleyici sağdan yan panelde (`CreativeEditor`); "Yeni
 * kreatif" sayfa başlığının sağındaki birincil düğmeden geliyor.
 *
 * SİL ONAYLI: eskiden tek tıkla siliniyordu; ⋯ menüsüne taşınınca yanlış
 * tıklama ihtimali arttı ve silme geri alınamıyor.
 */
export function CreativeLibrary({
  clientId,
  creatives,
  libraryAssets,
}: {
  clientId: string;
  creatives: CreativeRecord[];
  libraryAssets: AssetRecord[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CreativeRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [silinecek, setSilinecek] = useState<CreativeRecord | null>(null);
  /*
   * DÜZENLEYİCİNİN KİMLİĞİ: her açılışta yeni bir `key`, yoksa yan panel
   * DOM'da kaldığı için bir önceki kreatifin yarım yazısıyla açılırdı.
   */
  const [acilis, setAcilis] = useState(0);
  useVarlikYeni('kreatifler', () => {
    setEditing(null);
    setCreating(true);
    setAcilis((n) => n + 1);
  });

  async function kopyala(id: string): Promise<void> {
    setBusy(id);
    setError(null);
    try {
      const kopya = await apiFetch<CreativeRecord>(`/creatives/${id}/duplicate`, {
        method: 'POST',
      });
      router.refresh();
      // KOPYA HEMEN DÜZENLEMEYE AÇILIYOR: kullanıcı kopyalamayı düzenlemek
      // için istedi, listede bulup tıklamak fazladan bir adım.
      setEditing(kopya);
      setAcilis((n) => n + 1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Kopyalanamadı');
    } finally {
      setBusy(null);
    }
  }

  async function sil(id: string): Promise<void> {
    setBusy(id);
    setError(null);
    try {
      await apiFetch(`/creatives/${id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Silinemedi');
    } finally {
      setBusy(null);
    }
  }

  const kapat = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <div className="grid gap-3">
      <CreativeEditor
        key={acilis}
        acik={creating || editing !== null}
        clientId={clientId}
        creative={editing}
        libraryAssets={libraryAssets}
        onDone={kapat}
        onCancel={kapat}
      />

      <Pencere
        acik={silinecek !== null}
        onKapat={() => setSilinecek(null)}
        genislik="dar"
        baslik="Kreatif silinsin mi?"
        aciklama={silinecek ? `“${silinecek.name}” kütüphaneden kalkar. Bu geri alınamaz.` : undefined}
        altEylemler={
          <>
            <Dugme ton="ikincil" onClick={() => setSilinecek(null)}>
              Vazgeç
            </Dugme>
            <Dugme
              ton="tehlike"
              bekliyor={busy !== null}
              onClick={() => {
                const c = silinecek;
                if (!c) return;
                void sil(c.id).then(() => setSilinecek(null));
              }}
            >
              Sil
            </Dugme>
          </>
        }
      />

      {error && (
        <Serit ton="hata" baslik="İşlem tamamlanamadı.">
          {error}
        </Serit>
      )}

      {creatives.length === 0 ? (
        <BosDurum
          baslik="Bu workspace’te henüz kreatif yok."
          neden="Kreatif metin ve görsel havuzu; bir kez yazılır, her kampanyada kullanılır. Sağ üstteki “Yeni kreatif” ile başla."
        />
      ) : (
        <Kart dolgu={false}>
          <Tablo<CreativeRecord>
            etiket="Kreatifler"
            satirlar={creatives}
            satirAnahtari={(c) => c.id}
            sutunlar={[
              {
                anahtar: 'ad',
                baslik: 'Kreatif',
                hucre: (c) => (
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="h-10 w-10 shrink-0 overflow-hidden rounded-alan bg-surface-sunken">
                      {c.assets[0] && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${API_URL}${c.assets[0].previewUrl}`}
                          alt=""
                          className="h-full w-full object-contain"
                          loading="lazy"
                        />
                      )}
                    </span>
                    <AdHucresi
                      ad={
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(c);
                            setAcilis((n) => n + 1);
                          }}
                          className="truncate text-left font-semibold text-ink hover:text-brand-strong hover:underline"
                        >
                          {c.name}
                        </button>
                      }
                    />
                  </span>
                ),
              },
              {
                anahtar: 'icerik',
                baslik: 'İçerik',
                ikincil: true,
                hucre: (c) => (
                  <span className="text-13 text-ink-muted">
                    {c.assets.length} görsel · {c.texts.headlines.length} başlık · {c.texts.descriptions.length} açıklama
                  </span>
                ),
              },
              {
                anahtar: 'hazir',
                baslik: 'Biçim hazır mı',
                hucre: (c) => (
                  /* PLATFORM HAZIRLIĞI SATIR SATIR. Aynı kreatif Meta'ya
                     hazır, Google'a hazır olmayabilir. */
                  <span className="flex flex-wrap gap-1.5">
                    {(['meta_single_image', 'google_rsa'] as CreativeFormat[]).map((f) => {
                      const p = packTextsFor(f, c.texts);
                      const hazir = p.blockers.length === 0;
                      return (
                        <Rozet key={f} hal={hazir ? 'ok' : 'hata'} title={hazir ? 'Hazır' : p.blockers.join(' ')}>
                          {FORMAT_TEXT_SPEC[f].label.split(' — ')[0]}: {hazir ? 'hazır' : 'eksik'}
                        </Rozet>
                      );
                    })}
                  </span>
                ),
              },
              {
                anahtar: 'eylem',
                baslik: <span className="sr-only">Eylem</span>,
                sayi: true,
                hucre: (c) => (
                  <span className="inline-flex items-center gap-1">
                    <Dugme
                      ton="ikincil"
                      boyut="kucuk"
                      onClick={() => {
                        setEditing(c);
                        setAcilis((n) => n + 1);
                      }}
                    >
                      Düzenle
                    </Dugme>
                    <AcilirMenu
                      tasma="portal"
                      etiket={`${c.name}: diğer eylemler`}
                      hizala="sag"
                      genislik="w-48"
                      tetik={({ acik: _acik, ...o }) => (
                        <button type="button" {...o} className={IKON_TETIK} aria-label="Diğer eylemler">
                          ⋯
                        </button>
                      )}
                    >
                      {/* KOPYALA HER ZAMAN AÇIK: yayınlanmış kreatifi düzenlemenin
                          tek yolu bu ve düzenle düğmesi o durumda sunucudan hata
                          alıyor; mesaj da kopyalamayı söylüyor. */}
                      <MenuOgesi devreDisi={busy !== null} onClick={() => void kopyala(c.id)}>
                        Kopyala
                      </MenuOgesi>
                      <MenuAyraci />
                      <MenuOgesi tehlike devreDisi={busy !== null} onClick={() => setSilinecek(c)}>
                        Sil
                      </MenuOgesi>
                    </AcilirMenu>
                  </span>
                ),
              },
            ]}
          />
          <SayfalamaCubugu bas={1} son={creatives.length} toplam={creatives.length} />
        </Kart>
      )}
    </div>
  );
}
