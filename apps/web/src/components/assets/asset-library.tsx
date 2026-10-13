'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import {
  ASSET_KIND_META,
  type AssetListResult,
  type AssetRecord,
  type AssetUploadResult,
} from '@advetics/shared';
import { varliklarAdresi } from '@/lib/panel-adresleri';
import { GORSEL_TURLERI, type GorselTuru } from './gorsel-turleri';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { Kart, KART_BAGLANTISI } from '@/components/ui/kart';
import { Dugme } from '@/components/ui/dugme';
import { Secim } from '@/components/ui/alan';
import { BolumluSecici } from '@/components/ui/sekmeler';
import { AracCubugu, SayfalamaCubugu } from '@/components/ui/tablo';
import { BosDurum, Serit } from '@/components/ui/hal';
import { useVarlikYeni } from '@/components/marka-merkezi/varliklar/birincil-eylem';

/**
 * Varlık arşivi — ızgara, yükleme, silme.
 *
 * MÜKERRER YÜKLEME SESSİZ DEĞİL. Aynı dosya ikinci kez bırakıldığında yeni
 * kayıt açılmıyor ve kullanıcıya bu söyleniyor. Sessizce mevcut kaydı seçmek,
 * kullanıcının "yüklendi mi yüklenmedi mi" diye tekrar denemesine yol açardı.
 *
 * LOGO BURADA YOK (docs/panel-sadelestirme/MIMARI.md Ç-11). Logonun evi
 * Marka Merkezi › Marka › Logo; burada hem süzgeçte hem yükleme türünde
 * olunca aynı dosya iki ekrandan yükleniyor ve "hangi logo kullanılıyor"
 * sorusu iki yerde cevaplanıyordu. Kayıtlar SİLİNMEDİ: sayıları bu ekranda
 * "N logo Marka'da" diye yazıyor (sessiz kesme yok) ve bağlantı oraya.
 *
 * KULLANIM SAYISI HER KARTTA. Silme kararının tek dayanağı bu: kullanımdaki
 * bir görseli silmek, Meta'da çalışan bir reklamın kaydını koparmak demek ve
 * sunucu da bunu reddediyor.
 */
export function AssetLibrary({
  initial,
  clientId,
  activeKind,
  canWrite,
  logoAdresi,
}: {
  initial: AssetListResult;
  clientId: string;
  activeKind: GorselTuru | null;
  canWrite: boolean;
  /** Marka › Logo — logo kayıtlarının evi. */
  logoAdresi: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Sunucu süzgeçsiz istekte logoları da döndürüyor; burada listelenmez.
  const [rows, setRows] = useState<AssetRecord[]>(initial.rows.filter((r) => r.kind !== 'logo'));
  const [kind, setKind] = useState<GorselTuru>('image');
  const logoSayisi = initial.byKind.logo;
  const gorselToplami = GORSEL_TURLERI.reduce((t, k) => t + initial.byKind[k], 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /*
   * DOSYA SEÇİCİSİ GİZLİ, TETİK BAŞLIKTA ("Görsel yükle", sayfanın birincil
   * eylemi). Eskiden yükleme kutusu listenin üstünde her zaman açıktı ve
   * kırmızı "Dosya seç" düğmesi taşıyordu; ekranda iki birincil vardı.
   * `input.click()` aynı kullanıcı dokunuşunun içinde çağrılıyor (olay
   * eşzamanlı), yoksa tarayıcı seçiciyi açmaz.
   */
  const dosyaRef = useRef<HTMLInputElement>(null);
  useVarlikYeni('gorseller', () => dosyaRef.current?.click(), canWrite);

  async function upload(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    let added = 0;
    let duplicates = 0;

    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append('file', file);
      try {
        // `apiFetch` JSON gövdesi kuruyor; multipart için doğrudan fetch.
        // Content-Type ELLE VERİLMİYOR: tarayıcı boundary'yi kendisi ekliyor.
        const res = await fetch(
          `${API_URL}/assets?clientId=${clientId}&kind=${kind}`,
          { method: 'POST', credentials: 'include', body: form },
        );
        if (!res.ok) {
          const b = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(b?.message ?? `${file.name} yüklenemedi`);
        }
        const result = (await res.json()) as AssetUploadResult;
        if (result.duplicate) duplicates++;
        else {
          added++;
          setRows((cur) => [result.asset, ...cur]);
        }
      } catch (err) {
        // TEK DOSYA PATLASA DA DİĞERLERİ DEVAM EDİYOR. Yirmi dosyalık bir
        // seçimde biri bozuk diye hepsini kaybetmek kabul edilemez.
        setError(err instanceof Error ? err.message : 'Yükleme başarısız');
      }
    }

    if (duplicates > 0) {
      setNotice(
        added > 0
          ? `${added} görsel eklendi, ${duplicates} tanesi zaten arşivde vardı.`
          : `${duplicates} görsel zaten arşivde vardı, tekrar eklenmedi.`,
      );
    }
    setBusy(false);
    startTransition(() => router.refresh());
  }

  async function remove(asset: AssetRecord): Promise<void> {
    setError(null);
    try {
      await apiFetch(`/assets/${asset.id}`, { method: 'DELETE' });
      setRows((cur) => cur.filter((r) => r.id !== asset.id));
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Silinemedi.');
    }
  }

  function navigate(next: GorselTuru | null): void {
    // Varlıklar › Görseller: eski `/kutuphane/gorseller` adresine gitmek her
    // süzgeç tıklamasında bir yönlendirme turu demekti.
    startTransition(() => router.push(varliklarAdresi('gorseller', clientId, { tur: next })));
  }

  const toplam = activeKind ? initial.byKind[activeKind] : gorselToplami;

  return (
    <div className="grid gap-4">
      {canWrite && (
        <input
          ref={dosyaRef}
          type="file"
          multiple
          accept="image/jpeg,image/png"
          disabled={busy || isPending}
          onChange={(e) => {
            void upload(e.target.files);
            // Aynı dosya ikinci kez seçilebilsin (mükerrer bildirimi görünsün).
            e.target.value = '';
          }}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}

      {notice && <Serit ton="bilgi" baslik={notice} />}
      {error && (
        <Serit ton="hata" baslik="Yüklenemedi ya da silinemedi.">
          {error}
        </Serit>
      )}
      {busy && (
        <p role="status" className="m-0 text-12 text-ink-muted">
          Yükleniyor…
        </p>
      )}

      <Kart dolgu={false}>
        <AracCubugu
          sag={
            canWrite ? (
              <label className="flex items-center gap-2 text-12 text-ink-muted">
                Yüklenecek tür
                <Secim
                  value={kind}
                  onChange={(e) => setKind(e.target.value as GorselTuru)}
                  className="h-8 w-auto text-13"
                  title={ASSET_KIND_META[kind].hint}
                >
                  {GORSEL_TURLERI.map((k) => (
                    <option key={k} value={k}>
                      {ASSET_KIND_META[k].label}
                    </option>
                  ))}
                </Secim>
              </label>
            ) : undefined
          }
        >
          {/* GÖRÜNÜM DEĞİŞİMİ = BÖLÜMLÜ SEÇİCİ (BILESENLER § 3.5); sayılar her seçenekte. */}
          <BolumluSecici
            etiket="Görsel türü"
            secili={activeKind ?? 'hepsi'}
            onSec={(d) => navigate(d === 'hepsi' ? null : (d as GorselTuru))}
            secenekler={[
              { deger: 'hepsi', etiket: <>Tümü <span className="text-ink-muted">{gorselToplami}</span></> },
              ...GORSEL_TURLERI.map((k) => ({
                deger: k as string,
                etiket: (
                  <>
                    {ASSET_KIND_META[k].label} <span className="text-ink-muted">{initial.byKind[k]}</span>
                  </>
                ),
              })),
            ]}
          />
        </AracCubugu>
        {/* TÜR SEÇİMİNİN NE DEĞİŞTİRDİĞİ YAZIYOR. */}
        {canWrite && <p className="m-0 border-b border-line px-4 py-2 text-12 text-ink-muted">{ASSET_KIND_META[kind].hint}</p>}

        {rows.length === 0 ? (
          <div className="p-4">
            <BosDurum
              baslik="Arşiv boş"
              neden={
                canWrite
                  ? 'Buraya yüklediğin görselleri her kampanyada yeniden kullanırsın; bir daha yüklemen gerekmez. Sağ üstteki “Görsel yükle” ile başla.'
                  : 'Bu workspace’e henüz görsel yüklenmemiş. Yükleme yetkin yok; yöneticine sor.'
              }
            />
          </div>
        ) : (
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 p-4">
            {rows.map((a) => (
              <li key={a.id} className="overflow-hidden rounded-alan border border-line bg-surface">
                <div className="aspect-square bg-surface-sunken">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${API_URL}${a.previewUrl}`}
                    alt={a.name}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="grid gap-0.5 p-2.5">
                  <p className="m-0 truncate text-13 font-semibold text-ink" title={a.name}>
                    {a.name}
                  </p>
                  <p className="m-0 text-12 text-ink-muted tabular-nums">
                    {a.width}×{a.height} · {Math.round(a.byteSize / 1024)} KB
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    {/* KULLANIM SAYISI — silme kararının dayanağı. */}
                    <span className="text-12 text-ink-muted">
                      {a.usageCount > 0 ? `${a.usageCount} reklamda` : 'kullanılmıyor'}
                    </span>
                    {canWrite && (
                      <Dugme
                        ton="hayalet"
                        boyut="kucuk"
                        onClick={() => void remove(a)}
                        disabled={a.usageCount > 0}
                        title={
                          a.usageCount > 0
                            ? 'Kullanımdaki görsel silinemez; yayındaki reklamların kaydı kopar'
                            : undefined
                        }
                        className="-mr-2"
                      >
                        Sil
                      </Dugme>
                    )}
                  </div>

                  {/* PLATFORM YÜKLEMELERİ. Aynı görselin hesap başına ayrı bir
                      Meta kimliği var; bu satır onu görünür kılıyor. */}
                  {a.platformRefs.length > 0 && (
                    <p className="m-0 text-12 text-ink-muted">{a.platformRefs.length} hesaba yüklendi</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* SESSİZ KESME YOK: kaç görselin gösterildiği ve toplam her zaman. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line">
          <span className="px-4 text-12 text-ink-muted">
            {logoSayisi > 0 && (
              <Link href={logoAdresi} className={KART_BAGLANTISI}>
                {logoSayisi} logo Marka’da
              </Link>
            )}
          </span>
          <SayfalamaCubugu bas={rows.length === 0 ? 0 : 1} son={rows.length} toplam={Math.max(toplam, rows.length)} />
        </div>
      </Kart>
    </div>
  );
}
