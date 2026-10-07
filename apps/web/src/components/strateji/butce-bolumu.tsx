'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  HUNI_ETIKETLERI,
  HUNI_KATMANLARI,
  PLATFORM_KISA_ADLARI,
  STRATEJI_PLATFORMLARI,
  type DagilimOnerisi,
  type PlanDetayi,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import {
  DAGILIM_BOS_METNI,
  HUCRELER,
  butceOzeti,
  dagilimTaslagi,
  oneriyiUygula,
  tutarCoz,
  ucAdresi,
  type DagilimHucresi,
  type Hucre,
} from './hesap';
import { BolumBasligi, GIRDI_SINIFI, KilitNotu, TabloKabi, planaYaz } from './ortak';

/*
 * Öneri isteğinin dört hâli AYRI: henüz istenmedi / isteniyor / geldi
 * (satırlı ya da NEDENİYLE boş) / çağrı düştü (sunucunun cümlesiyle).
 */
type OneriDurumu =
  | { tur: 'istenmedi' }
  | { tur: 'isteniyor' }
  | { tur: 'geldi'; oneri: DagilimOnerisi; korunanElle: number | null }
  | { tur: 'hata'; mesaj: string };

const KAYNAK_ETIKETI = { gecmis_veri: 'Geçmiş veri', elle: 'Elle' } as const;

/**
 * ═══ BÖLÜM 1 — BÜTÇE DAĞILIMI ═══
 *
 * Platform × kitle katmanı tablosu. Toplam, dağıtılan ve kalan (ya da aşım)
 * HER AN görünür: aşan plan müşteriye onaylattığı tutardan fazla harcama
 * vaat ederdi. Öneri yalnızca workspace'in kendi geçmişinden ve gerekçesiyle;
 * öneri yoksa nedeni yazılır.
 */
export function ButceBolumu({
  detay,
  kilit,
  yenile,
  onKirli,
}: {
  detay: PlanDetayi;
  kilit: string | null;
  yenile: () => Promise<PlanDetayi | null>;
  onKirli: (kirli: boolean) => void;
}) {
  const { plan } = detay;
  const para = plan.paraBirimi;
  const [taslak, setTaslak] = useState(() => dagilimTaslagi(detay.dagilim, para));
  const [kirli, setKirli] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState<{ ton: 'tehlike' | 'uyari' | 'basari'; metin: string } | null>(null);
  const [oneri, setOneri] = useState<OneriDurumu>({ tur: 'istenmedi' });

  /*
   * KAYDEDİLMEMİŞ TASLAK EZİLMEZ. Plan yeniden okunduğunda (kayıt, yoklama,
   * başkasının değişikliği) tablo yalnızca kullanıcı bir şey yazmamışsa
   * sunucudaki hâle döner. 409'da da öyle: kullanıcı yazdığını kaybetmez,
   * "kayıtlı hâli yükle" ile kendi seçer.
   */
  useEffect(() => {
    if (!kirli) setTaslak(dagilimTaslagi(detay.dagilim, para));
  }, [detay.dagilim, para, kirli]);
  useEffect(() => onKirli(kirli), [kirli, onKirli]);

  const cozum = useMemo(
    () => Object.fromEntries(HUCRELER.map((h) => [h.anahtar, tutarCoz(taslak[h.anahtar].metin, para)])),
    [taslak, para],
  ) as Record<Hucre, ReturnType<typeof tutarCoz>>;
  const hataliHucre = HUCRELER.filter((h) => cozum[h.anahtar].tur === 'hata').length;
  const tutarlar = HUCRELER.flatMap((h) => {
    const c = cozum[h.anahtar];
    return c.tur === 'tamam' ? [c.micros] : [];
  });
  const ozet = butceOzeti(plan.toplamButceMicros, tutarlar);

  function yaz(h: Hucre, metin: string) {
    // Dokunulan hücre `elle` olur: öneri yeniden uygulanırsa onu ezmez.
    setTaslak((t) => ({ ...t, [h]: { metin, kaynak: 'elle', gerekce: null } satisfies DagilimHucresi }));
    setKirli(true);
    setMesaj(null);
  }

  async function oneriIste() {
    setOneri({ tur: 'isteniyor' });
    try {
      const o = await apiFetch<DagilimOnerisi>(ucAdresi('/strateji/planlar/:id/dagilim-oner', plan.id), {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setOneri({ tur: 'geldi', oneri: o, korunanElle: null });
    } catch (err) {
      setOneri({ tur: 'hata', mesaj: err instanceof ApiRequestError ? err.message : 'Sunucuya ulaşılamadı.' });
    }
  }

  function oneriUygula() {
    if (oneri.tur !== 'geldi' || !oneri.oneri.satirlar) return;
    const r = oneriyiUygula(taslak, oneri.oneri.satirlar, para);
    setTaslak(r.taslak);
    setKirli(true);
    setOneri({ ...oneri, korunanElle: r.korunanElle });
  }

  async function kaydet() {
    setKaydediliyor(true);
    setMesaj(null);
    const satirlar = HUCRELER.filter((h) => cozum[h.anahtar].tur === 'tamam').map((h) => ({
      platform: h.platform,
      katman: h.katman,
      tutar: taslak[h.anahtar].metin.trim(),
    }));
    const r = await planaYaz(ucAdresi('/strateji/planlar/:id/dagilim', plan.id), 'PUT', { surum: plan.surum, satirlar }, yenile, plan.surum);
    setKaydediliyor(false);
    if (r.tur === 'tamam') {
      setKirli(false);
      setMesaj({ ton: 'basari', metin: 'Dağılım kaydedildi.' });
    } else if (r.tur === 'cakisma') {
      setMesaj({ ton: 'uyari', metin: r.mesaj });
    } else {
      setMesaj({ ton: 'tehlike', metin: r.mesaj });
    }
  }

  function kayitliyiYukle() {
    setKirli(false);
    setMesaj(null);
    setOneri((o) => (o.tur === 'geldi' ? { ...o, korunanElle: null } : o));
  }

  const kaydedilebilir = kilit === null && kirli && hataliHucre === 0 && ozet.durum !== 'asim';

  return (
    <section aria-labelledby="butce-baslik" className="space-y-4">
      <BolumBasligi
        id="butce-baslik"
        baslik="Bütçe dağılımı"
        aciklama="Toplam bütçenin platformlara ve kitle katmanlarına bölünüşü."
        eylem={
          kilit === null ? (
            <Dugme ton="ikincil" boyut="kucuk" onClick={oneriIste} bekliyor={oneri.tur === 'isteniyor'}>
              Geçmişten öner
            </Dugme>
          ) : undefined
        }
      />
      {kilit && <KilitNotu neden={kilit} />}

      <ButceOzetSeridi
        toplam={plan.toplamButceMicros}
        dagitilan={ozet.dagitilanMicros}
        durum={ozet.durum}
        fark={ozet.farkMicros}
        para={para}
      />

      <OneriKutusu durum={oneri} para={para} uygula={oneriUygula} uygulanabilir={kilit === null} />

      <TabloKabi etiket="Bütçe dağılımı tablosu">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="px-3 py-2 font-semibold">Platform</th>
              <th className="px-3 py-2 font-semibold">Kitle katmanı</th>
              <th className="px-3 py-2 text-right font-semibold">Tutar ({para})</th>
              <th className="px-3 py-2 font-semibold">Kaynak</th>
            </tr>
          </thead>
          <tbody>
            {STRATEJI_PLATFORMLARI.flatMap((p) =>
              HUNI_KATMANLARI.map((k, i) => {
                const h: Hucre = `${p}:${k}`;
                const hucre = taslak[h];
                const c = cozum[h];
                const hataId = `butce-hata-${h.replace(':', '-')}`;
                return (
                  <tr key={h} className="border-t border-line align-top">
                    {i === 0 && (
                      <th scope="rowgroup" rowSpan={HUNI_KATMANLARI.length} className="px-3 py-2 text-left font-semibold text-ink">
                        {PLATFORM_KISA_ADLARI[p]}
                      </th>
                    )}
                    <td className="px-3 py-2 text-ink">{HUNI_ETIKETLERI[k]}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        inputMode="decimal"
                        aria-label={`${PLATFORM_KISA_ADLARI[p]}, ${HUNI_ETIKETLERI[k]} tutarı`}
                        aria-invalid={c.tur === 'hata' || undefined}
                        aria-describedby={c.tur === 'hata' ? hataId : undefined}
                        className={`${GIRDI_SINIFI} max-w-[10rem] text-right tabular-nums`}
                        value={hucre.metin}
                        placeholder="0"
                        disabled={kilit !== null}
                        onChange={(e) => yaz(h, e.target.value)}
                      />
                      {c.tur === 'hata' && (
                        <p id={hataId} className="mt-1 text-xs text-danger-strong">
                          {c.mesaj}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-ink-muted">
                      {hucre.kaynak ? KAYNAK_ETIKETI[hucre.kaynak] : 'Boş'}
                      {hucre.gerekce && <span className="mt-0.5 block text-ink">{hucre.gerekce}</span>}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </TabloKabi>

      {mesaj && (
        <Uyari
          ton={mesaj.ton}
          eylem={
            mesaj.ton === 'uyari' ? (
              <Dugme ton="ikincil" boyut="kucuk" onClick={kayitliyiYukle}>
                Kayıtlı hâli yükle
              </Dugme>
            ) : undefined
          }
        >
          {mesaj.metin}
          {mesaj.ton === 'uyari' && ' Yazdıkların duruyor; kaydedersen onların yerine geçer.'}
        </Uyari>
      )}

      {kilit === null && (
        <div className="flex flex-wrap items-center gap-3">
          <Dugme onClick={kaydet} disabled={!kaydedilebilir} bekliyor={kaydediliyor}>
            Dağılımı kaydet
          </Dugme>
          {kirli && <span className="text-sm text-ink-muted">Kaydedilmemiş değişiklik var.</span>}
          {hataliHucre > 0 && <span className="text-sm text-danger-strong">{hataliHucre} tutar okunamadı.</span>}
          {ozet.durum === 'asim' && <span className="text-sm text-danger-strong">Dağılım toplam bütçeyi aşıyor.</span>}
          {kirli && (
            <Dugme ton="sade" boyut="kucuk" onClick={kayitliyiYukle}>
              Değişiklikleri at
            </Dugme>
          )}
        </div>
      )}
    </section>
  );
}

function ButceOzetSeridi({
  toplam,
  dagitilan,
  durum,
  fark,
  para,
}: {
  toplam: string;
  dagitilan: bigint;
  durum: 'tam' | 'kalan' | 'asim';
  fark: bigint;
  para: string;
}) {
  const son =
    durum === 'asim'
      ? { ad: 'Aşım', deger: formatMoney(fark.toString(), para), sinif: 'text-danger-strong' }
      : durum === 'kalan'
        ? { ad: 'Dağıtılmamış', deger: formatMoney(fark.toString(), para), sinif: 'text-warn-strong' }
        : { ad: 'Kalan', deger: 'Tamamı dağıtıldı', sinif: 'text-ok-strong' };
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-live="polite">
      <div className="rounded-xl border border-line bg-surface p-3">
        <dt className="text-xs text-ink-muted">Toplam bütçe</dt>
        <dd className="mt-0.5 font-semibold tabular-nums text-ink">{formatMoney(toplam, para)}</dd>
      </div>
      <div className="rounded-xl border border-line bg-surface p-3">
        <dt className="text-xs text-ink-muted">Dağıtılan</dt>
        <dd className="mt-0.5 font-semibold tabular-nums text-ink">{formatMoney(dagitilan.toString(), para)}</dd>
      </div>
      <div className="rounded-xl border border-line bg-surface p-3">
        <dt className="text-xs text-ink-muted">{son.ad}</dt>
        <dd className={`mt-0.5 font-semibold tabular-nums ${son.sinif}`}>{son.deger}</dd>
      </div>
    </dl>
  );
}

function OneriKutusu({
  durum,
  para,
  uygula,
  uygulanabilir,
}: {
  durum: OneriDurumu;
  para: string;
  uygula: () => void;
  uygulanabilir: boolean;
}) {
  if (durum.tur === 'istenmedi') return null;
  if (durum.tur === 'isteniyor') {
    return (
      <p className="text-sm text-ink-muted" role="status">
        Son 90 günün verisine bakılıyor…
      </p>
    );
  }
  if (durum.tur === 'hata') {
    return (
      <Uyari ton="tehlike" baslik="Öneri alınamadı.">
        {durum.mesaj}
      </Uyari>
    );
  }
  const { oneri } = durum;
  const pencere = `${oneri.pencere.from} ile ${oneri.pencere.to} arası`;
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">Geçmişten öneri</p>
          <p className="text-sm text-ink-muted">Dayanak: {pencere}, bu workspace’in kendi hesapları.</p>
        </div>
        {oneri.satirlar && uygulanabilir && (
          <Dugme boyut="kucuk" onClick={uygula}>
            Öneriyi uygula
          </Dugme>
        )}
      </div>

      {oneri.satirlar === null ? (
        <p className="text-sm text-ink">
          {oneri.bosNedeni ? DAGILIM_BOS_METNI[oneri.bosNedeni] : 'Öneri üretilemedi; sunucu bir neden bildirmedi.'}
        </p>
      ) : (
        <ul className="space-y-1 text-sm text-ink">
          {oneri.satirlar.map((s) => (
            <li key={`${s.platform}:${s.katman}`}>
              <span className="font-medium">
                {PLATFORM_KISA_ADLARI[s.platform]} · {HUNI_ETIKETLERI[s.katman]}:
              </span>{' '}
              <span className="tabular-nums">{formatMoney(s.tutarMicros, para)}</span>
              {s.gerekce && <span className="text-ink-muted"> · {s.gerekce}</span>}
            </li>
          ))}
        </ul>
      )}

      {durum.korunanElle !== null && durum.korunanElle > 0 && (
        <p className="text-sm text-warn-strong">
          {durum.korunanElle} hücre elle yazıldığı için değiştirilmedi.
        </p>
      )}

      {oneri.dayanak.length > 0 && (
        <TabloKabi etiket="Önerinin dayanağı">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="px-3 py-2 font-semibold">Platform</th>
                <th className="px-3 py-2 text-right font-semibold">Harcama</th>
                <th className="px-3 py-2 text-right font-semibold">Sonuç</th>
                <th className="px-3 py-2 text-right font-semibold">Sonuç başı maliyet</th>
              </tr>
            </thead>
            <tbody>
              {oneri.dayanak.map((d) => (
                <tr key={d.platform} className="border-t border-line">
                  <td className="px-3 py-2 text-ink">{PLATFORM_KISA_ADLARI[d.platform]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(d.harcamaMicros, para)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{d.donusum.toLocaleString('tr-TR')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {/* `null` = sonuç yok, hesaplanamaz. Sıfır değil. */}
                    {d.donusumBasiMaliyetMicros === null ? 'hesaplanamaz' : formatMoney(d.donusumBasiMaliyetMicros, para)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TabloKabi>
      )}
    </div>
  );
}
