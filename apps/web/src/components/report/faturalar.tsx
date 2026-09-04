'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAIL_EK_TOPLAM_SINIRI,
  FATURA_ETIKETLERI,
  FATURA_KABUL,
  FATURA_MAX_BAYT,
  FATURA_PLATFORMLARI,
  FATURA_PLATFORM_ETIKETLERI,
  donemMetni,
  kapsananDonemler,
  type FaturaOzeti,
  type FaturaPlatformu,
} from '@advetics/shared';
import { ApiRequestError, apiFetch, API_URL } from '@/lib/api';

/**
 * ═══ PLATFORM FATURALARI ═══
 *
 * Müşteri raporu alırken Meta/Google faturasını da aynı mailde görsün diye.
 * İstek birebir: "müşteri her şeyi tek pakette görsün."
 *
 * BİR DÖNEME BİRDEN ÇOK FATURA GİREBİLİR. Önceden `(müşteri, platform, dönem)`
 * tekildi ve ikinci yükleme öncekini EZİYORDU; ajans ikisini de yükledim
 * sanıyordu, müşteriye tek belge gidiyordu. Tekillik kaldırılmadı, dosyanın
 * İÇERİĞİNE taşındı: aynı PDF iki kez yüklenemiyor, çünkü o da müşteriye aynı
 * faturanın iki kopyası olarak giderdi.
 *
 * ELLE YÜKLENİYOR ve bu bir eksiklik değil, platformların kısıtı:
 * Google'ın fatura API'si yalnızca aylık faturalama (kredi hattı)
 * hesaplarında çalışıyor — kartla ödeyende hata veriyor. Meta'da ise fatura
 * PDF'i döndüren bir uç hiç yok. Gerekçe `packages/shared/.../fatura.schema.ts`
 * başında ayrıntılı yazılı.
 *
 * EKRAN İKİ YERDE KULLANILIYOR: rapor sayfasında (dönem hazır seçili) ve
 * ayrı "Faturalar" sayfasında (toplu yönetim). Tek bileşen, çünkü ikisinde
 * de aynı kararlar veriliyor — ayrı yazılsalar biri PDF kontrolünü ya da
 * eksik uyarısını kaybederdi.
 */
export function Faturalar({
  clientId,
  /** Rapor sayfasından geliyor: o dönem hazır seçili gelsin ve eksikse uyarsın. */
  odakDonemler,
  canWrite,
  baslikGoster = true,
}: {
  clientId: string;
  odakDonemler?: string[];
  canWrite: boolean;
  baslikGoster?: boolean;
}) {
  const [liste, setListe] = useState<FaturaOzeti[] | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [uyari, setUyari] = useState<string | null>(null);

  const varsayilanDonem = odakDonemler?.[odakDonemler.length - 1] ?? buAy();
  const [donem, setDonem] = useState(varsayilanDonem);
  const [platform, setPlatform] = useState<FaturaPlatformu>('meta');
  const [aciklama, setAciklama] = useState('');
  const dosyaRef = useRef<HTMLInputElement>(null);

  const yukle = useCallback(() => {
    apiFetch<FaturaOzeti[]>(`/reports/faturalar?clientId=${clientId}`)
      .then((r) => {
        setListe(r);
        setHata(null);
      })
      /*
       * HATA YUTULMUYOR. `.catch(() => setListe([]))` yazmak "henüz
       * yüklemedim", "fatura yok" ve "çağrı düştü"yü aynı boş alana
       * çevirirdi — bu projede tekrar eden hata türü.
       */
      .catch((err: unknown) => {
        setListe(null);
        setHata(err instanceof ApiRequestError ? err.message : 'Faturalar okunamadı.');
      });
  }, [clientId]);

  useEffect(() => {
    yukle();
  }, [yukle]);

  async function gonder(): Promise<void> {
    const dosya = dosyaRef.current?.files?.[0];
    if (!dosya) {
      setHata(`Önce bir dosya seç (${FATURA_ETIKETLERI}).`);
      return;
    }
    /*
     * BOYUT TARAYICIDA DA KONTROL EDİLİYOR. Sunucu zaten reddediyor ama
     * 20 MB'lık bir dosyayı yükleyip sonra reddedilmek, kullanıcının
     * bağlantısını boşa harcamak demek.
     */
    if (dosya.size > FATURA_MAX_BAYT) {
      /*
       * SINIR SABİTTEN YAZILIYOR. Burada "10 MB" ELLE yazılıydı ve sınır
       * 20 MB'a çıkınca kullanıcıya YANLIŞ sayıyı söylemeye başladı — mesaj
       * kodla birlikte güncellenmeyen her sabit gibi.
       */
      setHata(
        `Dosya çok büyük (${Math.round(dosya.size / 1024 / 1024)} MB). ` +
          `Üst sınır ${Math.round(FATURA_MAX_BAYT / 1024 / 1024)} MB.`,
      );
      return;
    }

    /*
     * MAİLE SIĞMAYACAK DOSYA YÜKLEME ANINDA SÖYLENİYOR — ve yükleme
     * DURDURULMUYOR.
     *
     * Dosya sınırı (20 MB) ile bir maildeki toplam ek bütçesi (22 MB) ayrı
     * şeyler: 20 MB'lık tek bir arşiv yüklenebiliyor ama yanına rapor PDF'i
     * de eklenince bütçeyi aşabiliyor ve o fatura maile GİRMİYOR. Kullanıcı
     * bunu "Gönder"e bastığında değil, dosyayı seçtiğinde bilmeli.
     *
     * Yükleme yine de yapılıyor: dosya panelde duruyor ve oradan indirilip
     * elle iletilebiliyor. Reddetmek, saklamanın tek faydasını da götürürdü.
     */
    const sigmaz = dosya.size > MAIL_EK_TOPLAM_SINIRI * 0.85;
    setUyari(
      sigmaz
        ? `Bu dosya ${Math.round(dosya.size / 1024 / 1024)} MB — rapor PDF'iyle birlikte ` +
            'mail sınırını aşabilir ve maile eklenmeyebilir. Yüklendikten sonra panelden ' +
            'indirip elle iletebilirsin.'
        : null,
    );

    setYukleniyor(true);
    setHata(null);
    try {
      const fd = new FormData();
      fd.append('file', dosya);
      const qs = new URLSearchParams({ clientId, platform, donem });
      if (aciklama.trim()) qs.set('aciklama', aciklama.trim());

      /*
       * `apiFetch` KULLANILMIYOR: o JSON gövdesi kuruyor ve `Content-Type`
       * yazıyor. `FormData` için tarayıcının `boundary` üretebilmesi
       * gerekiyor, yani başlık ELLE YAZILMAMALI.
       */
      const res = await fetch(`${API_URL}/reports/faturalar?${qs}`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!res.ok) {
        const govde = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(govde?.message ?? `Yükleme başarısız (HTTP ${res.status}).`);
      }
      if (dosyaRef.current) dosyaRef.current.value = '';
      setAciklama('');
      yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : 'Fatura yüklenemedi.');
    } finally {
      setYukleniyor(false);
    }
  }

  async function sil(f: FaturaOzeti): Promise<void> {
    setHata(null);
    try {
      await apiFetch(`/reports/faturalar/${f.id}?clientId=${clientId}`, { method: 'DELETE' });
      yukle();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Silinemedi.');
    }
  }

  /*
   * ODAKTAKİ DÖNEMDE EKSİK OLAN PLATFORMLAR.
   *
   * Bu bileşenin ASIL işi: ajans yüklemeyi unutursa rapor faturasız gider ve
   * kimse fark etmez. Kullanıcı kararı "uyar ama gönder" olduğu için uyarının
   * GÖRÜNÜR olması şart — yoksa karar yarım uygulanmış olur.
   *
   * PLATFORM BAŞINA DEĞİL DÖNEM BAŞINA bakılıyor: müşterinin yalnızca
   * Meta'da reklamı olabilir ve "Google faturası eksik" her ay yanlış bir
   * uyarı üretirdi. Okunmaz hâle gelen uyarı, hiç olmayandan kötü.
   */
  const eksikOdak =
    liste === null || !odakDonemler
      ? []
      : odakDonemler.filter((d) => !liste.some((f) => f.donem === d));

  return (
    <section className="min-w-0 space-y-3 rounded-xl border border-line bg-surface p-4">
      {baslikGoster && (
        <div>
          <h2 className="text-sm font-semibold text-ink">Platform faturaları</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Yüklediğin fatura, o dönemi kapsayan rapor mailine <strong>ayrı ek</strong>{' '}
            olarak eklenir.
          </p>
        </div>
      )}

      {uyari !== null && (
        <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-ink">
          {uyari}
        </p>
      )}

      {hata !== null && (
        <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          {hata}
        </p>
      )}

      {eksikOdak.length > 0 && (
        <p className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-xs text-ink">
          <strong>{eksikOdak.map(donemMetni).join(', ')}</strong> dönemi için fatura
          yüklenmemiş. Rapor yine gönderilir, ama fatura eki olmadan.
        </p>
      )}

      {canWrite && (
        <div className="rounded-lg border border-line p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="text-[11px] text-ink-muted">Dönem</span>
              <input
                type="month"
                value={donem}
                onChange={(e) => setDonem(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-ink-muted">Platform</span>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as FaturaPlatformu)}
                className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
              >
                {FATURA_PLATFORMLARI.map((p) => (
                  <option key={p} value={p}>
                    {FATURA_PLATFORM_ETIKETLERI[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-ink-muted">Not (isteğe bağlı)</span>
              <input
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                placeholder="Fatura no"
                className="mt-0.5 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* PDF ya da ZIP. Ekran görüntüsü HÂLÂ kabul edilmiyor — fatura
                resmi bir belge. Sunucu biçimi sihirli baytlardan doğruluyor;
                buradaki `accept` yalnızca dosya seçiciyi daraltıyor. */}
            <input
              ref={dosyaRef}
              type="file"
              accept={FATURA_KABUL}
              className="text-xs text-ink-muted file:mr-2 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-xs"
            />
            <button
              type="button"
              onClick={() => void gonder()}
              disabled={yukleniyor}
              className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {yukleniyor ? 'Yükleniyor…' : 'Yükle'}
            </button>
            <span className="text-[11px] text-ink-muted">
              {FATURA_ETIKETLERI}. Aynı döneme birden çok fatura yükleyebilirsin; hepsi
              maile eklenir. Aynı dosya iki kez yüklenemez.{' '}
              {/*
                PAROLA KORUMALI ARŞİV SESSİZ RET ÜRETİYOR: kurumsal mail
                sunucuları onları koşulsuz engelliyor ve sunucumuz bunu sihirli
                bayttan AYIRT EDEMİYOR (`PK\x03\x04` ikisinde de aynı).
                Belirtisi "mail gitti ama müşteriye ulaşmadı" oluyor — bu
                projenin en pahalı hata türü. Söylemek tek çare.
              */}
              <strong>Parola korumalı arşiv yükleme</strong> — mail sunucuları onları
              engelliyor ve mail sessizce ulaşmıyor.
            </span>
          </div>
        </div>
      )}

      {liste === null && hata === null && (
        <p className="text-xs text-ink-muted">Yükleniyor…</p>
      )}

      {liste !== null && liste.length === 0 && (
        <p className="rounded-lg border border-dashed border-line px-3 py-3 text-sm text-ink-muted">
          Bu müşteri için yüklenmiş fatura yok.
        </p>
      )}

      {liste !== null && liste.length > 0 && (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {liste.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    <strong>{donemMetni(f.donem)}</strong> ·{' '}
                    {FATURA_PLATFORM_ETIKETLERI[f.platform]}
                    {f.aciklama ? ` · ${f.aciklama}` : ''}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {/* TÜR GÖRÜNÜYOR: bir ZIP'in içinde ne olduğu açmadan
                        bilinmiyor ve maile giden şey o. */}
                    {f.mimeType === 'application/zip' ? 'ZIP' : 'PDF'} · {f.fileName} ·{' '}
                    {Math.max(1, Math.round(f.byteSize / 1024))} KB
                    {f.uploadedByName ? ` · ${f.uploadedByName}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <a
                    href={`${API_URL}/reports/faturalar/${f.id}/dosya?clientId=${clientId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-line px-2 py-1 text-xs hover:bg-surface-muted"
                  >
                    Aç
                  </a>
                  {canWrite && (
                    <button
                      type="button"
                      onClick={() => void sil(f)}
                      className="rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/5"
                    >
                      Sil
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {/* SAYAÇ KOŞULSUZ — "sessiz kesme yok". */}
          <p className="text-[11px] text-ink-muted">{liste.length} fatura yüklü</p>
        </>
      )}
    </section>
  );
}

function buAy(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Rapor aralığından odak dönemleri — sayfa bunu bileşene geçiriyor. */
export { kapsananDonemler };
