'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  COLUMN_KEYS,
  COLUMN_LABELS,
  REPORT_SECTIONS,
  SECTION_LABELS,
  type ColumnKey,
  type ReportOptions,
  type ReportSection,
  type ReportTemplateSummary,
} from '@advetics/shared';
import { apiFetch, ApiRequestError } from '@/lib/api';

/**
 * ŞABLON YÖNETİMİ — bölüm seçimi ve SIRASI.
 *
 * Sıra bir dizinin doğal özelliği ve şablonda öyle saklanıyor; belge de o
 * diziyi olduğu gibi geziyor. Bu yüzden ekranda da liste + yukarı/aşağı
 * yeterli: sürükle-bırak kütüphanesi eklemek, klavyeyle erişilebilirliği
 * kendimizin kurması gereken bir yük getirirdi ve yedi öğelik bir listede
 * kazancı yok.
 *
 * METRİK SEÇİMİ KAMPANYA BÖLÜMLERİNDE VAR. Bir süre yoktu ve sebebi
 * yazılıydı: belge sütunlarını sabit setlerden kuruyordu ve çalışmayan bir
 * seçim kutusu koymak, olmayan bir özellik vaat etmek olurdu. Belge artık
 * sütunlarını `options`tan kuruyor, seçim de eklendi.
 *
 * SEÇİM YALNIZCA SÜTUNLU BÖLÜMLERDE: kapak, özet ve kapanışta gösterilecek
 * bir sütun listesi yok; oraya da bir seçici koymak boş bir vaat olurdu.
 */
export function SablonYonetimi({
  sablonlar,
  musteriler,
  isOrgAdmin,
}: {
  sablonlar: ReportTemplateSummary[];
  musteriler: Array<{ id: string; name: string }>;
  isOrgAdmin: boolean;
}) {
  const [duzenlenen, setDuzenlenen] = useState<ReportTemplateSummary | 'yeni' | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setDuzenlenen('yeni')}
          className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Yeni şablon
        </button>
      </div>

      {sablonlar.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="text-sm font-medium text-ink">Henüz şablon yok.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            Şablon olmadan rapor <strong>bütün bölümleri</strong> varsayılan
            sırayla gösteriyor. Bir şablon oluşturmak, yalnızca istediğin
            bölümleri ve sırayı sabitlemeni sağlıyor.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sablonlar.map((t) => (
            <li key={t.id} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{t.name}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {t.clientId === null ? (
                      <span className="rounded bg-surface-sunken px-1.5 py-0.5">
                        Organizasyon varsayılanı
                      </span>
                    ) : (
                      <>Müşteri: {t.clientName ?? '—'}</>
                    )}{' '}
                    · {t.sections.length} bölüm
                    {t.shareCount > 0 && <> · {t.shareCount} paylaşım linki</>}
                  </p>
                  <p className="mt-1.5 text-xs text-ink-muted">
                    {t.sections.map((s) => SECTION_LABELS[s]).join(' → ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDuzenlenen(t)}
                  className="rounded-lg border border-line px-3 py-1.5 text-sm transition hover:bg-surface-muted"
                >
                  Düzenle
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {duzenlenen !== null && (
        <SablonModal
          sablon={duzenlenen === 'yeni' ? null : duzenlenen}
          musteriler={musteriler}
          isOrgAdmin={isOrgAdmin}
          onKapat={() => setDuzenlenen(null)}
        />
      )}
    </div>
  );
}

function SablonModal({
  sablon,
  musteriler,
  isOrgAdmin,
  onKapat,
}: {
  sablon: ReportTemplateSummary | null;
  musteriler: Array<{ id: string; name: string }>;
  isOrgAdmin: boolean;
  onKapat: () => void;
}) {
  const router = useRouter();
  const [ad, setAd] = useState(sablon?.name ?? 'Aylık müşteri raporu');
  const [baslik, setBaslik] = useState(sablon?.title ?? '');
  const [kapanis, setKapanis] = useState(sablon?.closingText ?? '');
  const [clientId, setClientId] = useState<string | null>(sablon?.clientId ?? null);
  const [secili, setSecili] = useState<ReportSection[]>(
    sablon?.sections ?? [...REPORT_SECTIONS],
  );
  const [ayarlar, setAyarlar] = useState<ReportOptions>(sablon?.options ?? {});

  function sutunlariDegistir(bolum: ReportSection, sutunlar: ColumnKey[]) {
    setAyarlar((a) => ({
      ...a,
      // BOŞ DİZİ SAKLANMIYOR. Kullanıcı hepsini kaldırdıysa bunu bir seçim
      // olarak yazmak, bir dahaki açılışta boş bir tablo göstermek olurdu;
      // belge boş seçimi zaten varsayılana çeviriyor.
      [bolum]: sutunlar.length === 0 ? {} : { ...a[bolum], metrics: sutunlar },
    }));
  }
  const [bekleyen, setBekleyen] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [silOnay, setSilOnay] = useState(false);

  const disaridakiler = REPORT_SECTIONS.filter((s) => !secili.includes(s));

  function tasi(i: number, yon: -1 | 1) {
    const j = i + yon;
    if (j < 0 || j >= secili.length) return;
    const kopya = [...secili];
    [kopya[i], kopya[j]] = [kopya[j]!, kopya[i]!];
    setSecili(kopya);
  }

  async function kaydet() {
    setBekleyen(true);
    setHata(null);
    try {
      const govde = {
        name: ad.trim(),
        title: baslik.trim() || undefined,
        closingText: kapanis.trim() || undefined,
        clientId,
        sections: secili,
        options: ayarlar,
      };
      if (sablon) {
        await apiFetch(`/reports/templates/${sablon.id}`, {
          method: 'PATCH',
          body: JSON.stringify(govde),
        });
      } else {
        await apiFetch('/reports/templates', { method: 'POST', body: JSON.stringify(govde) });
      }
      onKapat();
      router.refresh();
    } catch (err) {
      // PLATFORMUN/SUNUCUNUN KENDİ MESAJI EKRANDA. "Bir hata oluştu" demek,
      // "org varsayılanını yalnızca yönetici değiştirebilir" gibi
      // düzeltilebilir bir sebebi gizlerdi.
      setHata(err instanceof ApiRequestError ? err.message : 'Kaydedilemedi.');
      setBekleyen(false);
    }
  }

  async function sil() {
    if (!sablon) return;
    setBekleyen(true);
    setHata(null);
    try {
      await apiFetch(`/reports/templates/${sablon.id}`, { method: 'DELETE' });
      onKapat();
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Silinemedi.');
      setBekleyen(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onKapat();
      }}
    >
      {/*
        KART EKRANDAN UZUN OLAMAZ.
        14 bölümlü bir şablonda kart viewport'u aşıyordu ve dış kapsayıcı
        `sm:items-center` ile ortaladığı için taşan kısım YUKARIDAN
        kırpılıyordu — "Kaydet" düğmesi ekrana hiç girmiyor, kullanıcı
        tarayıcıyı %67'ye küçültmek zorunda kalıyordu.
        Çözüm: kartı ekran yüksekliğiyle sınırla, GÖVDEYİ kaydır, başlık ve
        düğmeler sabit kalsın.
      */}
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col rounded-xl border border-line bg-surface p-5 shadow-xl">
        <h2 className="shrink-0 text-lg font-semibold">
          {sablon ? 'Şablonu düzenle' : 'Yeni şablon'}
        </h2>

        <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
          <Alan label="Şablon adı">
            <input
              value={ad}
              onChange={(e) => setAd(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </Alan>

          <Alan label="Kapsam">
            <select
              value={clientId ?? ''}
              onChange={(e) => setClientId(e.target.value || null)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
            >
              {/*
                ORG VARSAYILANINI YALNIZCA YÖNETİCİ DEĞİŞTİREBİLİYOR — RLS bunu
                zaten uyguluyor ama SESSİZCE (0 satır) ve ekran "kaydedildi"
                derdi. Seçenek kapalı ve sebebi yazılı.
              */}
              <option value="" disabled={!isOrgAdmin}>
                Organizasyon varsayılanı{isOrgAdmin ? '' : ' (yalnızca yönetici)'}
              </option>
              {musteriler.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Alan>

          <Alan label="Rapor başlığı (boşsa varsayılan)">
            <input
              value={baslik}
              onChange={(e) => setBaslik(e.target.value)}
              placeholder="Dijital Pazarlama Raporu"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </Alan>

          <Alan label="Kapanış metni">
            <textarea
              value={kapanis}
              onChange={(e) => setKapanis(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </Alan>

          <div>
            <p className="text-sm font-medium">Bölümler ve sıra</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Rapor bu sırayla üretiliyor. Hiç bölüm bırakmazsan kaydedilemez —
              boş bir rapor müşteriye gönderilecek bir belge değil.
            </p>
            {/*
              LİSTE KENDİ İÇİNDE KAYDIRILIYOR. Bölüm sayısı şablona göre
              14'e çıkabiliyor; hepsini birden göstermek gövdeyi uzatıp
              alttaki sütun ayarlarını erişilemez yapıyordu.
            */}
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
              {secili.map((s, i) => (
                <li
                  key={s}
                  className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-1.5 text-sm"
                >
                  <span className="w-5 text-xs text-ink-muted">{i + 1}.</span>
                  <span className="flex-1">{SECTION_LABELS[s]}</span>
                  <button
                    type="button"
                    onClick={() => tasi(i, -1)}
                    disabled={i === 0}
                    aria-label="Yukarı taşı"
                    className="rounded px-1.5 text-ink-muted transition hover:text-ink disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => tasi(i, 1)}
                    disabled={i === secili.length - 1}
                    aria-label="Aşağı taşı"
                    className="rounded px-1.5 text-ink-muted transition hover:text-ink disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecili(secili.filter((x) => x !== s))}
                    aria-label="Kaldır"
                    className="rounded px-1.5 text-ink-muted transition hover:text-danger"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>

            {/* SÜTUN SEÇİMİ — yalnızca tablosu olan bölümlerde. */}
            {secili
              .filter((s): s is 'meta_campaigns' | 'google_campaigns' =>
                s === 'meta_campaigns' || s === 'google_campaigns',
              )
              .map((s) => (
                <SutunSecici
                  key={s}
                  bolum={s}
                  secim={ayarlar[s]?.metrics}
                  onDegis={(v) => sutunlariDegistir(s, v)}
                />
              ))}
            {disaridakiler.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {disaridakiler.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSecili([...secili, s])}
                    className="rounded-lg border border-dashed border-line px-2.5 py-1 text-xs text-ink-muted transition hover:text-ink"
                  >
                    + {SECTION_LABELS[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {hata && (
          <p className="mt-3 rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {hata}
          </p>
        )}

        {/*
          SİLME ONAYI KAÇ LİNKİN GİDECEĞİNİ SÖYLÜYOR.
          Şablonu silmek ona bağlı bütün paylaşım linklerini de siliyor;
          müşteriye gönderilmiş bir rapor haber vermeden 404 olur.
        */}
        {silOnay && sablon && (
          <div className="mt-3 rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs">
            <p className="font-medium text-danger">Bu şablon silinecek.</p>
            {sablon.shareCount > 0 ? (
              <p className="mt-1">
                Bu şablondan üretilmiş <strong>{sablon.shareCount} paylaşım linki</strong> de
                silinecek. Müşteriye gönderdiğin raporlar çalışmayacak.
              </p>
            ) : (
              <p className="mt-1">Bu şablona bağlı paylaşım linki yok.</p>
            )}
          </div>
        )}

        <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          {sablon ? (
            <button
              type="button"
              onClick={() => (silOnay ? sil() : setSilOnay(true))}
              disabled={bekleyen}
              className="rounded-lg px-3 py-2 text-sm text-danger transition hover:bg-danger/10 disabled:opacity-50"
            >
              {silOnay ? 'Evet, sil' : 'Sil'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onKapat}
              className="rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:text-ink"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={kaydet}
              disabled={bekleyen || secili.length === 0 || ad.trim().length === 0}
              className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {bekleyen ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Alan({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="mt-0.5 block">{children}</span>
    </label>
  );
}

/**
 * BÖLÜM SÜTUNLARI — seçim VE sıra.
 *
 * Seçim yapılmazsa belge varsayılan sütunlara dönüyor ve bu ekranda yazılı:
 * boş bir tablo göstermek, kullanıcının bir ayarı yanlış girdiğini
 * anlamasının en zor yolu olurdu.
 *
 * FORM VE MESAJ GOOGLE'DA HER ZAMAN SIFIR ÇIKAR — Google `actions` dizisi
 * döndürmüyor ve o dökümü hiç vermiyor. Gizlemek yerine sebebiyle söylüyoruz:
 * gizlense kullanıcı "neden bu seçenek yok" diye sorar, sıfır gösterilse
 * "hiç form gelmedi" diye okur.
 */
function SutunSecici({
  bolum,
  secim,
  onDegis,
}: {
  bolum: 'meta_campaigns' | 'google_campaigns';
  secim: ColumnKey[] | undefined;
  onDegis: (v: ColumnKey[]) => void;
}) {
  const secili = secim ?? [];
  const disaridakiler = COLUMN_KEYS.filter((k) => !secili.includes(k));
  const kovaUyarisi =
    bolum === 'google_campaigns' && secili.some((k) => k === 'form' || k === 'message');

  function tasi(i: number, yon: -1 | 1) {
    const j = i + yon;
    if (j < 0 || j >= secili.length) return;
    const kopya = [...secili];
    [kopya[i], kopya[j]] = [kopya[j]!, kopya[i]!];
    onDegis(kopya);
  }

  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-muted p-3">
      <p className="text-xs font-medium">{SECTION_LABELS[bolum]} — sütunlar</p>
      {secili.length === 0 ? (
        <p className="mt-1 text-[11px] text-ink-muted">
          Seçim yok — varsayılan sütunlar kullanılacak.
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {secili.map((k, i) => (
            <li
              key={k}
              className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-xs"
            >
              <button
                type="button"
                onClick={() => tasi(i, -1)}
                disabled={i === 0}
                aria-label="Sola al"
                className="text-ink-muted transition hover:text-ink disabled:opacity-30"
              >
                ‹
              </button>
              {COLUMN_LABELS[k]}
              <button
                type="button"
                onClick={() => tasi(i, 1)}
                disabled={i === secili.length - 1}
                aria-label="Sağa al"
                className="text-ink-muted transition hover:text-ink disabled:opacity-30"
              >
                ›
              </button>
              <button
                type="button"
                onClick={() => onDegis(secili.filter((x) => x !== k))}
                aria-label="Sütunu kaldır"
                className="ml-0.5 text-ink-muted transition hover:text-danger"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {disaridakiler.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {disaridakiler.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onDegis([...secili, k])}
              className="rounded-md border border-dashed border-line px-2 py-0.5 text-[11px] text-ink-muted transition hover:text-ink"
            >
              + {COLUMN_LABELS[k]}
            </button>
          ))}
        </div>
      )}

      {kovaUyarisi && (
        <p className="mt-1.5 rounded border border-warn/40 bg-warn/5 px-2 py-1 text-[11px]">
          Google Ads form ve mesaj dökümü <strong>vermiyor</strong> — bu sütunlar
          raporda her zaman 0 görünecek.
        </p>
      )}
    </div>
  );
}
