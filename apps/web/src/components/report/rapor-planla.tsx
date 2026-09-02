'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AYIN_GUNU_MAX,
  HAFTA_GUNLERI,
  PLAN_SONUC_LABELS,
  SIKLIK_LABELS,
  PLAN_SIKLIKLARI,
  pencerelerIcin,
  planZamaniMetni,
  varsayilanPencere,
  type PlanSikligi,
  type RaporPlaniOzeti,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * ═══ PLANLA — DÜZENLİ RAPOR GÖNDERİMİ ═══
 *
 * `docs/DURUM.md` §7'de "Zamanlanmış (otomatik) rapor gönderimi ❌" olarak
 * duran maddenin arayüzü.
 *
 * EKRANIN TAŞIDIĞI TEK MESAJ: burada kurulan şey MÜŞTERİYE GİDEN, TEKRARLAYAN
 * bir mail. Tek seferlik gönderimde kullanıcı sonucu hemen görüyor; burada
 * göremiyor — ilk mail haftaya gidiyor. Bu yüzden modal, kaydetmeden ÖNCE ne
 * olacağını tam cümleyle yazıyor ("Her Pazartesi 09:00'da …").
 *
 * PORTAL KULLANILIYOR. CLAUDE.md: "fixed inset-0 ekranın tamamı demek değil;
 * tam ekran her öğe portal ile document.body altına." Bu tuzağa projede ÜÇ
 * KEZ düşüldü ve bu bileşen paylaşım panelinin İÇİNDE duruyor.
 */

interface Props {
  clientId: string;
  /** Şablon seçimi rapor ekranındaki seçiciyle aynı olsun diye taşınıyor. */
  templateId: string | null;
}

const SAATLER = Array.from({ length: 24 }, (_, i) => i);

export function RaporPlanla({ clientId, templateId }: Props) {
  const [acik, setAcik] = useState(false);
  const [planlar, setPlanlar] = useState<RaporPlaniOzeti[] | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  // Form durumu
  const [frequency, setFrequency] = useState<PlanSikligi>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hour, setHour] = useState(9);
  const [rangeKey, setRangeKey] = useState(varsayilanPencere('weekly'));
  const [toEmail, setToEmail] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [duzenlenen, setDuzenlenen] = useState<string | null>(null);

  const secilebilir = pencerelerIcin(frequency);

  useEffect(() => {
    if (!acik) return;
    void listeyiGetir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);

  /*
   * SIKLIK DEĞİŞİNCE PENCERE DE DEĞİŞEBİLİR.
   *
   * "Haftada 1 + Son 7 gün" kurup "Ayda 1"e geçen kullanıcıda "Son 7 gün"
   * artık geçersiz (matris onu haftalığa özel tutuyor). Seçimi olduğu gibi
   * bırakmak, kaydete basınca sunucudan hata almak demekti — CLAUDE.md:
   * "Doğrulama kullanım anında değil, giriş anında."
   */
  useEffect(() => {
    if (!secilebilir.some((p) => p.key === rangeKey)) {
      setRangeKey(varsayilanPencere(frequency));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frequency]);

  useEffect(() => {
    if (!acik) return;
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAcik(false);
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [acik]);

  async function listeyiGetir() {
    setYukleniyor(true);
    setHata(null);
    try {
      setPlanlar(await apiFetch<RaporPlaniOzeti[]>(`/reports/schedules?clientId=${clientId}`));
    } catch (err) {
      /*
       * HATA YUTULMUYOR. CLAUDE.md: ".catch(() => setX([])) YASAK" —
       * "henüz aramadım", "arıyorum", "sonuç yok" ve "çağrı düştü" dördü
       * ayrı iş ve ayrı gösterilmeli.
       */
      setPlanlar(null);
      setHata(err instanceof ApiRequestError ? err.message : 'Planlamalar okunamadı.');
    } finally {
      setYukleniyor(false);
    }
  }

  function formuSifirla() {
    setDuzenlenen(null);
    setFrequency('weekly');
    setDayOfWeek(1);
    setDayOfMonth(1);
    setHour(9);
    setRangeKey(varsayilanPencere('weekly'));
    setToEmail('');
    setAttachPdf(true);
  }

  function duzenlemeyeAl(p: RaporPlaniOzeti) {
    setDuzenlenen(p.id);
    setFrequency(p.frequency);
    setDayOfWeek(p.dayOfWeek ?? 1);
    setDayOfMonth(p.dayOfMonth ?? 1);
    setHour(p.hour);
    setRangeKey(p.rangeKey);
    setToEmail(p.toEmail ?? '');
    setAttachPdf(p.attachPdf);
  }

  async function kaydet() {
    setKaydediliyor(true);
    setHata(null);
    try {
      const govde = {
        clientId,
        frequency,
        dayOfWeek: frequency === 'weekly' ? dayOfWeek : null,
        dayOfMonth: frequency === 'monthly' ? dayOfMonth : null,
        hour,
        rangeKey,
        templateId,
        toEmail: toEmail.trim() || null,
        attachPdf,
        enabled: true,
      };
      await apiFetch(
        duzenlenen ? `/reports/schedules/${duzenlenen}` : '/reports/schedules',
        { method: duzenlenen ? 'PATCH' : 'POST', body: JSON.stringify(govde) },
      );
      formuSifirla();
      await listeyiGetir();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Planlama kaydedilemedi.');
    } finally {
      setKaydediliyor(false);
    }
  }

  async function durumDegistir(p: RaporPlaniOzeti) {
    setHata(null);
    try {
      await apiFetch(`/reports/schedules/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          clientId: p.clientId,
          frequency: p.frequency,
          dayOfWeek: p.dayOfWeek,
          dayOfMonth: p.dayOfMonth,
          hour: p.hour,
          rangeKey: p.rangeKey,
          templateId: p.templateId,
          toEmail: p.toEmail,
          attachPdf: p.attachPdf,
          enabled: !p.enabled,
        }),
      });
      await listeyiGetir();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Değiştirilemedi.');
    }
  }

  async function sil(p: RaporPlaniOzeti) {
    setHata(null);
    try {
      await apiFetch(`/reports/schedules/${p.id}?clientId=${p.clientId}`, { method: 'DELETE' });
      await listeyiGetir();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Silinemedi.');
    }
  }

  const acikSayisi = planlar?.filter((p) => p.enabled).length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="rounded-lg border border-line px-3.5 py-2 text-sm transition hover:bg-surface-muted"
      >
        {/*
          DÜĞME DURUMU TAŞIYOR. "Planla" yazan bir düğme, plan KURULU olup
          olmadığını göstermiyor ve kullanıcı her seferinde açıp bakıyor.
        */}
        {acikSayisi > 0 ? `Planlı (${acikSayisi})` : 'Planla'}
      </button>

      {acik &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setAcik(false);
            }}
          >
            <div className="my-8 w-full max-w-3xl rounded-xl border border-line bg-surface p-5 shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-ink">Düzenli rapor gönderimi</h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Rapor seçtiğin sıklıkta otomatik hazırlanıp müşteriye mail atılır.
                    Mail SENİN adresinden gider.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAcik(false)}
                  className="rounded-lg px-2 py-1 text-sm text-ink-muted hover:text-ink"
                >
                  Kapat
                </button>
              </div>

              {hata && (
                <p className="mt-3 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
                  {hata}
                </p>
              )}

              {/* ── MEVCUT PLANLAR ── */}
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-ink">Kurulu planlar</h3>
                {yukleniyor && <p className="mt-2 text-sm text-ink-muted">Yükleniyor…</p>}
                {!yukleniyor && planlar !== null && planlar.length === 0 && (
                  <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-3 text-sm text-ink-muted">
                    Bu müşteri için kurulu planlama yok.
                  </p>
                )}
                {!yukleniyor && planlar !== null && planlar.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {planlar.map((p) => (
                      <li
                        key={p.id}
                        className="rounded-lg border border-line px-3 py-2.5 text-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-ink">
                              {planZamaniMetni(p)}
                              {!p.enabled && (
                                <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-ink-muted">
                                  Duraklatıldı
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-xs text-ink-muted">
                              {pencereEtiketi(p.rangeKey)} · {p.cozulenAlici ?? 'alıcı yok'}
                              {p.attachPdf ? ' · PDF ekli' : ''}
                            </p>
                            {p.nextRunAt && p.enabled && (
                              <p className="mt-0.5 text-xs text-ink-muted">
                                Bir sonraki: {tarihMetni(p.nextRunAt)}
                              </p>
                            )}
                            {/*
                              GÖNDEREN HAZIR DEĞİLSE EN ÜSTTE SÖYLENİYOR.
                              Plan "açık" görünüp hiç göndermeyen bir durum,
                              bu projedeki en pahalı hata türü.
                            */}
                            {!p.senderReady && (
                              <p className="mt-1 rounded border border-warn/40 bg-warn/5 px-2 py-1 text-[11px] text-ink">
                                {p.createdByEmail} adresinin e-posta kimliği doğrulanmamış —
                                bu plan çalışmayacak.
                              </p>
                            )}
                            {p.lastStatus && (
                              <p
                                className={`mt-1 text-xs ${
                                  p.lastStatus === 'failed' ? 'text-danger' : 'text-ink-muted'
                                }`}
                              >
                                Son tur: {PLAN_SONUC_LABELS[p.lastStatus]}
                                {p.lastRunAt ? ` · ${tarihMetni(p.lastRunAt)}` : ''}
                                {p.lastSentTo ? ` · ${p.lastSentTo}` : ''}
                                {p.lastError ? ` — ${p.lastError}` : ''}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <button
                              type="button"
                              onClick={() => duzenlemeyeAl(p)}
                              className="rounded-md border border-line px-2 py-1 text-xs hover:bg-surface-muted"
                            >
                              Düzenle
                            </button>
                            <button
                              type="button"
                              onClick={() => void durumDegistir(p)}
                              className="rounded-md border border-line px-2 py-1 text-xs hover:bg-surface-muted"
                            >
                              {p.enabled ? 'Duraklat' : 'Sürdür'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void sil(p)}
                              className="rounded-md border border-danger/40 px-2 py-1 text-xs text-danger hover:bg-danger/5"
                            >
                              Sil
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ── YENİ / DÜZENLE ── */}
              <div className="mt-5 rounded-lg border border-line p-3.5">
                <h3 className="text-sm font-semibold text-ink">
                  {duzenlenen ? 'Planlamayı düzenle' : 'Yeni planlama'}
                </h3>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs text-ink-muted">Sıklık</span>
                    <select
                      value={frequency}
                      onChange={(e) => setFrequency(e.target.value as PlanSikligi)}
                      className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                    >
                      {PLAN_SIKLIKLARI.map((s) => (
                        <option key={s} value={s}>
                          {SIKLIK_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </label>

                  {frequency === 'weekly' ? (
                    <label className="block">
                      <span className="text-xs text-ink-muted">Haftanın günü</span>
                      <select
                        value={dayOfWeek}
                        onChange={(e) => setDayOfWeek(Number(e.target.value))}
                        className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                      >
                        {HAFTA_GUNLERI.map((g) => (
                          <option key={g.no} value={g.no}>
                            {g.ad}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="block">
                      <span className="text-xs text-ink-muted">
                        Ayın günü (1–{AYIN_GUNU_MAX})
                      </span>
                      <select
                        value={dayOfMonth}
                        onChange={(e) => setDayOfMonth(Number(e.target.value))}
                        className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                      >
                        {Array.from({ length: AYIN_GUNU_MAX }, (_, i) => i + 1).map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                      {/*
                        KISIT SÖYLENİYOR. CLAUDE.md: "Tahmin etmektense
                        kısıtla ... ve kısıtı kullanıcıya SÖYLE."
                      */}
                      <span className="mt-1 block text-[11px] text-ink-muted">
                        28’den büyük günler her ayda bulunmuyor — Şubat’ta rapor
                        atlanırdı.
                      </span>
                    </label>
                  )}

                  <label className="block">
                    <span className="text-xs text-ink-muted">Saat (İstanbul)</span>
                    <select
                      value={hour}
                      onChange={(e) => setHour(Number(e.target.value))}
                      className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                    >
                      {SAATLER.map((s) => (
                        <option key={s} value={s}>
                          {String(s).padStart(2, '0')}:00
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-xs text-ink-muted">Rapor dönemi</span>
                    <select
                      value={rangeKey}
                      onChange={(e) => setRangeKey(e.target.value)}
                      className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                    >
                      {/*
                        YALNIZCA UYUMLU DÖNEMLER. Haftalık bir planda "Geçen
                        ay" aynı raporu ayda dört kez göndermek demek; listede
                        hiç görünmüyor. Sonradan uyarmak, kullanıcının o hatayı
                        yapmasına izin vermek olurdu.
                      */}
                      {secilebilir.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <span className="mt-1 block text-[11px] text-ink-muted">
                      {secilebilir.find((p) => p.key === rangeKey)?.aciklama}
                    </span>
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="text-xs text-ink-muted">
                      Alıcı — boş bırakılırsa müşterinin kayıtlı adresi kullanılır
                    </span>
                    <input
                      value={toEmail}
                      onChange={(e) => setToEmail(e.target.value)}
                      placeholder="musteri@ornek.com"
                      className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="flex items-center gap-2 text-sm sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={attachPdf}
                      onChange={(e) => setAttachPdf(e.target.checked)}
                    />
                    PDF raporu ekle
                  </label>
                </div>

                {/*
                  ═══ NE OLACAĞI TAM CÜMLEYLE ═══

                  Tek seferlik gönderimde kullanıcı sonucu hemen görüyor;
                  burada göremiyor — ilk mail haftaya gidiyor. Kaydetmeden
                  önce kurduğu şeyi okuyabilmeli.
                */}
                <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">
                  {planZamaniMetni({ frequency, dayOfWeek, dayOfMonth, hour })}’da,{' '}
                  <strong>{secilebilir.find((p) => p.key === rangeKey)?.label}</strong> dönemini
                  kapsayan rapor{' '}
                  <strong>{toEmail.trim() || 'müşterinin kayıtlı adresine'}</strong> gönderilecek.
                </p>
                <p className="mt-1 text-[11px] text-ink-muted">
                  Dönemde hiç harcama yoksa mail gönderilmez — sıfırlarla dolu bir rapor
                  müşteriye “sistem bozulmuş” diye okunuyor. Atlanan tur bu listede
                  sebebiyle görünür.
                </p>

                <div className="mt-3 flex justify-end gap-2">
                  {duzenlenen && (
                    <button
                      type="button"
                      onClick={formuSifirla}
                      className="rounded-lg px-3 py-2 text-sm text-ink-muted hover:text-ink"
                    >
                      Vazgeç
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void kaydet()}
                    disabled={kaydediliyor}
                    className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {kaydediliyor ? 'Kaydediliyor…' : duzenlenen ? 'Güncelle' : 'Planlamayı kur'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function pencereEtiketi(key: string): string {
  return (
    pencerelerIcin('weekly').concat(pencerelerIcin('monthly')).find((p) => p.key === key)?.label ??
    key
  );
}

function tarihMetni(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}
