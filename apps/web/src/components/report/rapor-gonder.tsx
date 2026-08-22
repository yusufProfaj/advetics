'use client';

import { useState } from 'react';
import type { ReportMailDraft } from '@advetics/shared';
import { ApiRequestError, apiFetch, API_URL } from '@/lib/api';

/**
 * ═══ PAYLAŞ VE GÖNDER ═══
 *
 * Üç yol, biri diğerinin yerine geçmiyor:
 *
 *   · PDF İNDİR — belgeyi kendin göndermek ya da arşivlemek için.
 *   · LİNK KOPYALA — oturum gerektirmeyen, tarih aralığı SABİT bir sayfa.
 *   · MAİLLE GÖNDER — PDF eki + özet, danışmanın kendi adresinden.
 *
 * MAİL TASLAĞI DÜZENLENEBİLİR ve bu kasıtlı. Sayılar rapordan geliyor ama
 * anlatı ("Urla bölgesindeki konut aramalarında...") veriden çıkarılamıyor;
 * uydurmak müşteriye yanlış bir strateji anlatmak olurdu. Gönderen kişi
 * göndermeden önce okuyor ve düzenliyor.
 */
export function RaporGonder({
  clientId,
  from,
  to,
  hasData,
}: {
  clientId: string;
  from: string;
  to: string;
  hasData: boolean;
}) {
  const [acik, setAcik] = useState(false);
  const [taslak, setTaslak] = useState<ReportMailDraft | null>(null);
  const [alici, setAlici] = useState('');
  const [konu, setKonu] = useState('');
  const [govde, setGovde] = useState('');
  const [ekPdf, setEkPdf] = useState(true);
  const [bekleyen, setBekleyen] = useState<'taslak' | 'gonder' | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<string | null>(null);

  const qs = new URLSearchParams({ clientId, from, to });

  async function taslakAc() {
    setAcik(true);
    setBekleyen('taslak');
    setHata(null);
    setSonuc(null);
    try {
      const t = await apiFetch<ReportMailDraft>(`/reports/mail-draft?${qs}`);
      setTaslak(t);
      setKonu(t.subject);
      setGovde(t.html);
      setAlici(t.defaultTo ?? '');
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Taslak alınamadı.');
    } finally {
      setBekleyen(null);
    }
  }

  async function gonder() {
    setBekleyen('gonder');
    setHata(null);
    try {
      const r = await apiFetch<{ to: string }>('/reports/send', {
        method: 'POST',
        body: JSON.stringify({
          clientId,
          from,
          to,
          to_email: alici.trim() || undefined,
          subject: konu.trim(),
          html: govde,
          attachPdf: ekPdf,
        }),
      });
      setSonuc(`Rapor ${r.to} adresine gönderildi.`);
      setAcik(false);
    } catch (err) {
      // Sunucunun KENDİ mesajı: "kimlik doğrulanamadı" ile "alıcı reddedildi"
      // farklı işler ve ikisini tek cümleye çevirmek kullanıcıyı tahmine
      // bırakır.
      setHata(err instanceof ApiRequestError ? err.message : 'Gönderilemedi.');
    } finally {
      setBekleyen(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {/*
          PDF DÜZ BİR BAĞLANTI. `fetch` ile indirmek gövdeyi belleğe alıp
          blob üretmek demek; tarayıcının kendi indirme akışı hem daha ucuz
          hem de büyük dosyada ilerleme gösteriyor.
        */}
        <a
          href={`${API_URL}/reports/pdf?${qs}`}
          className={`rounded-lg border border-line px-3.5 py-2 text-sm transition hover:bg-surface-muted ${
            hasData ? '' : 'pointer-events-none opacity-50'
          }`}
          title={hasData ? undefined : 'Bu dönemde veri yok'}
        >
          PDF indir
        </a>
        <button
          type="button"
          onClick={taslakAc}
          disabled={!hasData || bekleyen !== null}
          className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {bekleyen === 'taslak' ? 'Hazırlanıyor…' : 'Müşteriye gönder'}
        </button>
      </div>

      {sonuc && (
        <p className="rounded border border-ok/40 bg-ok/5 px-3 py-2 text-sm">{sonuc}</p>
      )}
      {hata && !acik && (
        <p className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger">
          {hata}
        </p>
      )}

      {acik && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAcik(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-xl border border-line bg-surface p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Raporu müşteriye gönder</h2>

            {taslak && !taslak.senderReady && (
              /*
                DOĞRULANMAMIŞ HESAPLA GÖNDERİM KAPALI — ve sebebi burada
                yazıyor. Sunucu da reddediyor; ekranda söylemek, kullanıcıyı
                bir hata mesajıyla karşılaşmadan doğru yere yönlendiriyor.
              */
              <div className="mt-3 rounded border border-warn/40 bg-warn/5 px-3 py-2 text-sm">
                <p className="font-medium">E-posta ayarların doğrulanmamış.</p>
                <p className="mt-1 text-ink-muted">
                  Ayarlar → E-posta Ayarları ekranından kendine test maili gönder.
                  Doğrulanmamış bir hesapla müşteriye mail atmak, ilk hatanın
                  müşteriye gitmesi demek.
                </p>
              </div>
            )}

            {taslak && taslak.senderReady && (
              <p className="mt-1 text-xs text-ink-muted">
                Gönderen: <strong>{taslak.senderEmail}</strong> · yanıtlar sana gelir
              </p>
            )}

            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="text-xs text-ink-muted">Alıcı</span>
                <input
                  value={alici}
                  onChange={(e) => setAlici(e.target.value)}
                  placeholder="musteri@ornek.com"
                  className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
                {taslak && taslak.defaultTo === null && (
                  // Sessizce boş bırakmak, "gönder"e basınca hata almak demek.
                  <span className="mt-1 block text-[11px] text-warn">
                    Bu müşterinin kayıtlı iletişim adresi yok — Müşteriler ekranından
                    ekleyebilirsin.
                  </span>
                )}
              </label>

              <label className="block">
                <span className="text-xs text-ink-muted">Konu</span>
                <input
                  value={konu}
                  onChange={(e) => setKonu(e.target.value)}
                  className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="text-xs text-ink-muted">
                  Mail metni — sayılar rapordan geldi, değerlendirme kısmını sen yaz
                </span>
                <textarea
                  value={govde}
                  onChange={(e) => setGovde(e.target.value)}
                  rows={12}
                  spellCheck={false}
                  className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs focus:border-brand focus:outline-none"
                />
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ekPdf}
                  onChange={(e) => setEkPdf(e.target.checked)}
                />
                PDF raporu ekle
              </label>
            </div>

            {hata && (
              <p className="mt-3 rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
                {hata}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAcik(false)}
                className="rounded-lg px-3 py-2 text-sm text-ink-muted transition hover:text-ink"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={gonder}
                disabled={
                  bekleyen !== null ||
                  !taslak?.senderReady ||
                  alici.trim().length === 0 ||
                  konu.trim().length === 0
                }
                className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {bekleyen === 'gonder' ? 'Gönderiliyor…' : 'Gönder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
