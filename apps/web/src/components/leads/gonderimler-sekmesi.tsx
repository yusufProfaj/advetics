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

/**
 * ═══ POTANSİYEL MÜŞTERİLER › META'YA GÖNDERİMLER (MIMARI § 9) ═══
 *
 * DÖRT HÂL AYRI (CLAUDE.md `.catch(() => setX([]))` yasağı): yükleniyor,
 * hata (sunucunun cümlesi), boş + NEDENİ (`emptyReason`), dolu. Sayılar
 * süzgeçten bağımsız ve sessiz kesme yok: "61 gönderimden 4’ü gösteriliyor".
 *
 * "İletildi, eşleşmedi" ile "gönderilemedi" AYRI çip ve ayrı cümle: biri
 * yapılacak iş yok, diğeri var (sözleşme `olay.ts` başı).
 */
type Hal = { tur: 'yukleniyor' } | { tur: 'hata'; mesaj: string } | { tur: 'hazir'; y: GeriBeslemeOlaylariYaniti };

const SAYFA = 50;

const TON: Record<'sessiz' | 'notr' | 'sorun', string> = {
  sessiz: 'bg-surface-sunken text-ink-muted ring-line',
  notr: 'bg-surface text-ink ring-line',
  sorun: 'bg-danger-soft text-danger-strong ring-danger/30',
};

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => (setDurum(null), setOffset(0))} className={cip(durum === null)}>
          Tümü <span className="opacity-60">{toplamHepsi}</span>
        </button>
        {GERI_BESLEME_OLAY_DURUMLARI.filter((d) => (sayilar?.[d] ?? 0) > 0 || d === durum).map((d) => (
          <button key={d} type="button" onClick={() => (setDurum(d), setOffset(0))} className={cip(durum === d)}>
            {GERI_BESLEME_OLAY_DURUM_ADI[d]} <span className="opacity-60">{sayilar?.[d] ?? 0}</span>
          </button>
        ))}
        {canWrite && denenebilir > 0 && (
          <button
            type="button"
            onClick={() => void tekrarDene()}
            disabled={yeniden.calisiyor}
            className="ml-auto rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-sunken disabled:opacity-60"
          >
            {yeniden.calisiyor ? 'Sıraya alınıyor…' : `Gönderilemeyenleri tekrar dene (${denenebilir})`}
          </button>
        )}
      </div>
      {yeniden.sonuc && (
        <p role="status" className="text-xs text-ink">
          {yeniden.sonuc}
        </p>
      )}

      {hal.tur === 'yukleniyor' && <p className="text-sm text-ink-muted">Gönderimler yükleniyor…</p>}
      {hal.tur === 'hata' && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger-strong ring-1 ring-inset ring-danger/30">
          {hal.mesaj}
        </p>
      )}
      {hal.tur === 'hazir' && hal.y.satirlar.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
          <h2 className="text-sm font-semibold text-ink">Henüz gönderim yok</h2>
          <p className="mx-auto mt-2 max-w-lg text-xs text-ink-muted">{hal.y.emptyReason ? bosNedenMetni(hal.y.emptyReason) : 'Gönderim bulunamadı.'}</p>
        </div>
      )}
      {hal.tur === 'hazir' && hal.y.satirlar.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-3 py-2">Kişi</th>
                  <th className="px-3 py-2">Sonuç</th>
                  <th className="px-3 py-2">Zaman</th>
                  <th className="px-3 py-2">Durum</th>
                </tr>
              </thead>
              <tbody>
                {hal.y.satirlar.map((o) => {
                  const not = olayNotu(o, simdi);
                  return (
                    <tr key={o.id} className="border-t border-line/60 align-top">
                      <td className="px-3 py-2 text-ink">{o.leadAdi ?? 'Adsız kayıt'}</td>
                      <td className="px-3 py-2 text-ink">{GERI_BESLEME_ASAMA_ADI[o.asama]}</td>
                      <td className="px-3 py-2 tabular-nums text-ink-muted">{zaman(o.olayZamani)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TON[durumTonu(o.durum)]}`}>
                          {GERI_BESLEME_OLAY_DURUM_ADI[o.durum]}
                        </span>
                        {not && <p className="mt-1 max-w-xs break-words text-[11px] text-ink-muted">{not}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* SESSİZ KESME YOK */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
            <span>
              {hal.y.satirlar.length} / {hal.y.toplam} gönderim gösteriliyor
            </span>
            {hal.y.toplam > SAYFA && (
              <span className="flex gap-2">
                <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - SAYFA))} className="underline disabled:opacity-40">
                  Önceki
                </button>
                <button type="button" disabled={offset + SAYFA >= hal.y.toplam} onClick={() => setOffset(offset + SAYFA)} className="underline disabled:opacity-40">
                  Sonraki
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function cip(aktif: boolean): string {
  return `rounded-lg border px-2.5 py-1 text-xs font-medium transition ${aktif ? 'border-brand bg-brand-soft text-ink' : 'border-line text-ink-muted hover:bg-surface-sunken'}`;
}

function zaman(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(iso));
}
