'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KreatifBrief, KreatifSatiri, KreatifZekaYaniti, Kova } from '@advetics/shared';
import { KOVA_ADI, KREATIF_SAYFA_BOYUTU, formatMoney, formatNumber } from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { hesaplarAdresi } from '@/lib/panel-adresleri';
import {
  advcampaignAdresi,
  aralikEkseni,
  bosMetni,
  briefBosMetni,
  briefKopyaMetni,
  esikMetni,
  etiketCipleri,
  etiketDurumMetni,
  etiketlemeSeridi,
  farkGruplari,
  gorselYolu,
  halkaCizgisi,
  kisaNeden,
  kismiNotu,
  kovaMetni,
  kreatifKutuHali,
  kreatifZekaYolu,
  kumeAdi,
  metrikAdi,
  metrikMetni,
  onerilerAdresi,
  orneklemMetni,
  platformAdi,
  puanYokCumlesi,
  type EtiketleYaniti,
  type GorselHali,
  type KreatifGorunumu,
  type KreatifSonucu,
  type KreatifSorgusu,
} from '@/lib/kreatif-zeka';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { AdHucresi, AracCubugu, SayfalamaCubugu, Tablo } from '@/components/ui/tablo';
import { BolumluSecici } from '@/components/ui/sekmeler';
import { DurumNoktasi, type DurumHali } from '@/components/ui/rozet';
import { BosDurum, HataDurumu, Serit, Yukleniyor } from '@/components/ui/hal';

type BriefHali = { durum: 'bos' } | { durum: 'yukleniyor' } | { durum: 'hata'; mesaj: string };

const hataMesaji = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');

/** Kova → durum noktası. Yeşil YALNIZ "iyi gidiyor" (kılavuz: yeşil yalnız durum noktası). */
const KOVA_HALI: Record<Kova, DurumHali> = { iyi_gidiyor: 'ok', dikkat: 'hata', veri_yetersiz: 'taslak' };

/** Küçük sayı eki (seçenek etiketlerinde "Dikkat 3"). */
function Sayi({ n }: { n: number }) {
  return <span className="ml-1.5 tabular-nums text-ink-muted">{n}</span>;
}

/**
 * ═══ İYİLEŞTİR › KREATİFLER (Paket D, taslak `docs/kreatif-zeka/taslak.html`) ═══
 *
 * Üstte küme seçici ve etiketleme durumu, ortada yeni kreatifler (kova) ya
 * da bütün kreatifler (puan tablosu), altta "Ne işe yarıyor" ve üretim
 * brief'i. Kararlar `lib/kreatif-zeka.ts`te ve çalıştırılarak sınanıyor;
 * burada yalnız çizim ve istek.
 *
 * DÖRT HÂL AYRI (`kreatifKutuHali`): yükleniyor, hata (sunucunun cümlesi),
 * boş (NEDENİYLE), dolu. `.catch(() => setX([]))` YOK.
 *
 * SÜZGEÇ SUNUCUDA (küme, görünüm, kova, sayfa); sıra numarası eski yanıtın
 * yenisini ezmesini engelliyor. Özet ve farklar SON GELEN yanıttan: süzgeç
 * isteği sürerken üst şerit boşalmasın.
 *
 * GÖRÜNÜŞ (birleşik tasarım 2026-10-14): `Kart`, `Tablo`, `BolumluSecici`
 * ve dört hâl bileşenleri. Kreatif kartı ve "ne işe yarıyor" aralık çubuğu
 * `components/ui`da yok; yerel ve yalnız token sınıflarıyla (Grup 3 sapması).
 */
export function KreatiflerSekmesi({
  clientId,
  ilk,
  yetki,
}: {
  clientId: string;
  ilk: KreatifSonucu;
  yetki: { yaz: boolean; aktar: boolean };
}) {
  const router = useRouter();
  const [sonuc, setSonuc] = useState<KreatifSonucu | null>(ilk);
  const [son, setSon] = useState<KreatifZekaYaniti | null>(ilk.durum === 'tamam' ? ilk.yanit : null);
  const [q, setQ] = useState<KreatifSorgusu>({ clientId, kume: null, gorunum: 'yeni', kova: null, sayfa: 1 });
  const [brief, setBrief] = useState<KreatifBrief | null>(ilk.durum === 'tamam' ? ilk.yanit.brief : null);
  const [briefHali, setBriefHali] = useState<BriefHali>({ durum: 'bos' });
  const [etiketle, setEtiketle] = useState<{ durum: 'yok' } | { durum: 'gidiyor' } | { durum: 'tamam'; mesaj: string } | { durum: 'hata'; mesaj: string }>({ durum: 'yok' });
  const [aktarim, setAktarim] = useState<{ durum: 'yok' } | { durum: 'gidiyor' } | { durum: 'hata'; mesaj: string }>({ durum: 'yok' });
  const [kopyalandi, setKopyalandi] = useState(false);
  const sira = useRef(0);

  useEffect(() => {
    setSonuc(ilk);
    setSon(ilk.durum === 'tamam' ? ilk.yanit : null);
    setBrief(ilk.durum === 'tamam' ? ilk.yanit.brief : null);
    setQ({ clientId, kume: null, gorunum: 'yeni', kova: null, sayfa: 1 });
  }, [ilk, clientId]);

  const yukle = useCallback(async (yeni: KreatifSorgusu) => {
    setQ(yeni);
    const benim = ++sira.current;
    setSonuc(null);
    try {
      const yanit = await apiFetch<KreatifZekaYaniti>(kreatifZekaYolu(yeni));
      if (benim !== sira.current) return;
      setSonuc({ durum: 'tamam', yanit });
      setSon(yanit);
      setBrief(yanit.brief);
      setBriefHali({ durum: 'bos' });
    } catch (e) {
      if (benim !== sira.current) return;
      setSonuc({ durum: 'hata', mesaj: hataMesaji(e) });
    }
  }, []);

  const suz = (d: Partial<KreatifSorgusu>) => void yukle({ ...q, sayfa: 1, ...d });

  async function etiketleBaslat() {
    setEtiketle({ durum: 'gidiyor' });
    try {
      const r = await apiFetch<EtiketleYaniti>('/kreatif-zeka/etiketle', { method: 'POST', body: JSON.stringify({ clientId }) });
      setEtiketle({ durum: 'tamam', mesaj: r.mesaj });
    } catch (e) {
      setEtiketle({ durum: 'hata', mesaj: hataMesaji(e) });
    }
  }

  async function briefHazirla(kume: string) {
    setBriefHali({ durum: 'yukleniyor' });
    try {
      const b = await apiFetch<KreatifBrief>('/kreatif-zeka/brief', { method: 'POST', body: JSON.stringify({ clientId, kume }) });
      setBrief(b);
      setBriefHali({ durum: 'bos' });
    } catch (e) {
      setBriefHali({ durum: 'hata', mesaj: hataMesaji(e) });
    }
  }

  async function reklamKur(b: KreatifBrief) {
    setAktarim({ durum: 'gidiyor' });
    try {
      const r = await apiFetch<{ oturumId: string; clientId: string }>(`/kreatif-zeka/brief/${encodeURIComponent(b.id)}/advcampaign`, { method: 'POST' });
      router.push(advcampaignAdresi(r.clientId, r.oturumId));
    } catch (e) {
      setAktarim({ durum: 'hata', mesaj: hataMesaji(e) });
    }
  }

  async function kopyala(b: KreatifBrief) {
    try {
      await navigator.clipboard.writeText(briefKopyaMetni(b));
      setKopyalandi(true);
    } catch {
      // Pano izni yoksa metin seçilebilir hâlde zaten ekranda; düğme bunu söylüyor.
      setKopyalandi(false);
      setAktarim({ durum: 'hata', mesaj: 'Panoya kopyalanamadı; metni ekrandan seçip kopyala.' });
    }
  }

  const hal = kreatifKutuHali(sonuc);
  const secili = son?.kume ?? null;
  const kumeOzet = son?.kumeler.find((x) => x.anahtar === secili) ?? null;

  return (
    <>
      {son && son.hatalar.length > 0 && (
        <Serit ton="hata" baslik="Bazı kaynaklar okunamadı; ekran eksik olabilir.">
          {son.hatalar.map((h) => `${h.kaynak}: ${h.mesaj}`).join(' · ')}
        </Serit>
      )}

      {/* Ortak üst: küme seçici + etiketleme durumu */}
      {son && (
        <Kart dolgu={false}>
          {son.kumeler.length > 0 && (
            <AracCubugu sag={<span className="text-12 text-ink-muted">Aynı amaçtaki kreatifler birbiriyle karşılaştırılır</span>}>
              <span className="text-12 font-semibold text-ink-muted">Karşılaştır:</span>
              <BolumluSecici
                etiket="Karşılaştırma kümesi"
                secili={secili ?? ''}
                onSec={(k) => suz({ kume: k })}
                secenekler={son.kumeler.map((x) => ({
                  deger: x.anahtar,
                  etiket: (
                    <>
                      {x.ad}
                      <Sayi n={x.kreatif} />
                    </>
                  ),
                }))}
              />
            </AracCubugu>
          )}
          <EtiketlemeSeridi yanit={son} yazabilir={yetki.yaz} etiketle={etiketle} onEtiketle={() => void etiketleBaslat()} />
        </Kart>
      )}

      {/* Liste */}
      <Kart dolgu={false}>
        <AracCubugu
          sag={
            kumeOzet && (
              <span className="text-12 text-ink-muted">
                {q.gorunum === 'yeni' ? `İlk 14 gün · karar için en az ${esikMetni(son!.paraBirimi)} harcama · ` : 'Puana göre · '}
                {metrikAdi(kumeOzet.anaMetrik).toLocaleLowerCase('tr')}
                {kumeOzet.metrikDusus ? ' (dönüşüm az, tıklama oranına göre)' : ''}
              </span>
            )
          }
        >
          <BolumluSecici
            etiket="Görünüm"
            secili={q.gorunum}
            onSec={(g: KreatifGorunumu) => suz({ gorunum: g, kova: null })}
            secenekler={(['yeni', 'tumu'] as KreatifGorunumu[]).map((g) => ({ deger: g, etiket: g === 'yeni' ? 'Yeni kreatifler' : 'Tümü' }))}
          />
          {q.gorunum === 'yeni' && son && (
            <BolumluSecici
              etiket="Kova"
              secili={q.kova ?? 'hepsi'}
              onSec={(kv) => suz({ kova: kv === 'hepsi' ? null : kv })}
              secenekler={[
                {
                  deger: 'hepsi' as const,
                  etiket: (
                    <>
                      Hepsi
                      <Sayi n={son.kovaSayilari.iyi_gidiyor + son.kovaSayilari.dikkat + son.kovaSayilari.veri_yetersiz} />
                    </>
                  ),
                },
                ...(['iyi_gidiyor', 'dikkat', 'veri_yetersiz'] as Kova[]).map((kv) => ({
                  deger: kv,
                  etiket: (
                    <span className="inline-flex items-center gap-1.5">
                      {kv === 'iyi_gidiyor' && <DurumNoktasi hal="ok" />}
                      {KOVA_ADI[kv]}
                      <Sayi n={son.kovaSayilari[kv]} />
                    </span>
                  ),
                })),
              ]}
            />
          )}
        </AracCubugu>

        {hal === 'yukleniyor' && (
          <div className="p-4">
            <Yukleniyor etiket="Kreatifler yükleniyor" />
          </div>
        )}
        {sonuc?.durum === 'hata' && (
          <div className="p-4">
            <HataDurumu baslik="Kreatifler okunamadı." mesaj={<>Sunucunun cevabı: {sonuc.mesaj}</>} onTekrar={() => void yukle(q)} />
          </div>
        )}
        {hal === 'bos' && sonuc?.durum === 'tamam' && (
          <div className="p-4">
            <BosKutu clientId={clientId} neden={sonuc.yanit.emptyReason} onTumu={() => suz({ gorunum: 'tumu', kova: null })} />
          </div>
        )}
        {hal === 'dolu' && sonuc?.durum === 'tamam' && q.gorunum === 'yeni' && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3 p-4">
            {sonuc.yanit.satirlar.map((x) => (
              <KreatifKarti key={x.creativeId} satir={x} clientId={clientId} />
            ))}
          </div>
        )}
        {hal === 'dolu' && sonuc?.durum === 'tamam' && q.gorunum === 'tumu' && <PuanTablosu yanit={sonuc.yanit} />}
        {/* SESSİZ KESME YOK: "1 - 24 / 80" her hâlde, tek sayfada da. */}
        {sonuc?.durum === 'tamam' && <SayfalamaCubugu {...sayfalamaBilgisi(sonuc.yanit, q.sayfa, (n) => void yukle({ ...q, sayfa: n }))} />}
      </Kart>

      {/* Ne işe yarıyor + brief */}
      {son && secili && (
        <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <NeIseYariyor yanit={son} />
          <BriefKarti
            kume={secili}
            brief={brief}
            bosNeden={son.briefBosNedeni}
            hali={briefHali}
            yetki={yetki}
            aktarim={aktarim}
            kopyalandi={kopyalandi}
            onHazirla={() => void briefHazirla(secili)}
            onKur={(b) => void reklamKur(b)}
            onKopyala={(b) => void kopyala(b)}
          />
        </div>
      )}
    </>
  );
}

/** Ayrıntı listesi (`<details>`): açılıp kapanan içerik DOM'da kalıyor (yerel tarayıcı davranışı). */
const AYRINTI = 'border-t border-line px-4 py-3 text-13 text-ink-muted';
const AYRINTI_OZET = 'cursor-pointer font-semibold text-ink';
const AYRINTI_LISTE = 'm-0 mt-2 grid list-disc gap-1 pl-5';

function EtiketlemeSeridi({
  yanit,
  yazabilir,
  etiketle,
  onEtiketle,
}: {
  yanit: KreatifZekaYaniti;
  yazabilir: boolean;
  etiketle: { durum: 'yok' } | { durum: 'gidiyor' } | { durum: 'tamam'; mesaj: string } | { durum: 'hata'; mesaj: string };
  onEtiketle: () => void;
}) {
  const d = etiketlemeSeridi(yanit.etiketleme);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-4 py-2.5 text-[12.5px] text-ink">
        <span className="inline-flex items-center gap-1.5">
          <DurumNoktasi hal="ok" /> <b className="font-baslik tabular-nums">{d.incelendi}</b>
        </span>
        {d.sirada && (
          <span className="inline-flex items-center gap-1.5">
            <DurumNoktasi hal="taslak" /> {d.sirada}
          </span>
        )}
        {d.incelenemiyor && <span>{d.incelenemiyor}</span>}
        <span className="ml-auto flex items-center gap-2">
          {d.sonIs && d.hesaplar.length <= 1 && <span className="text-12 text-ink-muted">{d.sonIs}</span>}
          {yazabilir && (
            <Dugme ton="ikincil" boyut="kucuk" bekliyor={etiketle.durum === 'gidiyor'} onClick={onEtiketle}>
              {etiketle.durum === 'gidiyor' ? 'Başlatılıyor' : 'Şimdi incele'}
            </Dugme>
          )}
        </span>
      </div>
      {etiketle.durum === 'tamam' && (
        <div className="px-4 pb-3">
          {/* Sunucunun cümlesi olduğu gibi ("sıraya alındı", "zaten sırada"); başlık uydurulmuyor. */}
          <Serit ton="bilgi" baslik={etiketle.mesaj} />
        </div>
      )}
      {etiketle.durum === 'hata' && (
        <div className="px-4 pb-3">
          <Serit ton="hata" baslik="İnceleme başlatılamadı.">
            {etiketle.mesaj}
          </Serit>
        </div>
      )}
      {d.hesaplar.length > 1 && (
        <details className={AYRINTI} open={d.hesaplar.some((x) => x.sorunlu)}>
          <summary className={AYRINTI_OZET}>Hesap başına son inceleme</summary>
          <ul className={AYRINTI_LISTE}>
            {d.hesaplar.map((x) => (
              <li key={x.ad}>
                <b className="text-ink">{x.ad}</b> {x.cumle}
              </li>
            ))}
          </ul>
        </details>
      )}
      {d.dokum.length > 0 && (
        <details className={AYRINTI}>
          <summary className={AYRINTI_OZET}>Neden incelenemiyor</summary>
          <ul className={AYRINTI_LISTE}>
            {d.dokum.map((x) => (
              <li key={x.cumle}>
                <b className="font-baslik tabular-nums text-ink">{x.sayi}</b> {x.cumle}
              </li>
            ))}
            <li>Performance Max kreatifleri henüz incelenmiyor.</li>
          </ul>
        </details>
      )}
    </>
  );
}

function BosKutu({ clientId, neden, onTumu }: { clientId: string; neden: KreatifZekaYaniti['emptyReason']; onTumu: () => void }) {
  const b = bosMetni(neden);
  return (
    <BosDurum
      baslik={b.baslik}
      neden={b.metin}
      eylem={
        <>
          {b.suzgec && (
            <Dugme ton="ikincil" boyut="kucuk" onClick={onTumu}>
              Tümüne bak
            </Dugme>
          )}
          {b.baglanti === 'baglantilar' && (
            <Link className={dugmeSinifi('ikincil', 'kucuk')} href={hesaplarAdresi(clientId)}>
              Marka Merkezi › Kurulum
            </Link>
          )}
        </>
      }
    />
  );
}

/**
 * Kart görseli: KULLANIM ANINDA tazelenen uçtan, çerezle. Hata sunucunun
 * cümlesiyle ("Görsel alınamadı: sunucu 403"); kırık resim ikonu yok.
 * Nesne adresi bileşen kalkınca bırakılıyor (bellek).
 */
function useGorsel(creativeId: string): GorselHali {
  const [hal, setHal] = useState<GorselHali>({ durum: 'yukleniyor' });
  useEffect(() => {
    let iptal = false;
    let adres: string | null = null;
    setHal({ durum: 'yukleniyor' });
    (async () => {
      try {
        const r = await fetch(`${API_URL}${gorselYolu(creativeId)}`, { credentials: 'include' });
        if (!r.ok) {
          // Sunucunun cümlesi gövdede ("Görsel alınamadı: sunucu 403"); gövde
          // okunamazsa en azından HTTP durumu söyleniyor, boş kutu değil.
          let mesaj = `Görsel alınamadı (HTTP ${r.status})`;
          try {
            const g = (await r.json()) as { message?: string };
            if (g?.message) mesaj = g.message;
          } catch {
            /* gövde JSON değil: durum kodlu cümle kalıyor */
          }
          if (!iptal) setHal({ durum: 'hata', mesaj });
          return;
        }
        adres = URL.createObjectURL(await r.blob());
        if (!iptal) setHal({ durum: 'tamam', adres });
      } catch {
        if (!iptal) setHal({ durum: 'hata', mesaj: 'Görsel alınamadı: sunucuya ulaşılamadı' });
      }
    })();
    return () => {
      iptal = true;
      if (adres) URL.revokeObjectURL(adres);
    };
  }, [creativeId]);
  return hal;
}

function Gorsel({ creativeId, alt }: { creativeId: string; alt: string }) {
  const g = useGorsel(creativeId);
  if (g.durum === 'tamam') return <img className="block h-full w-full object-cover" src={g.adres} alt={alt} />;
  if (g.durum === 'hata') return <span className="p-3 text-center text-12 text-ink-muted">{g.mesaj}</span>;
  return (
    <span className="p-3 text-center text-12 text-ink-muted" aria-busy="true">
      Görsel yükleniyor
    </span>
  );
}

/** Puan halkası: gri çember + siyah dolu yay; puan yoksa "yok" ve nedeni başlıkta. */
function Halka({ puan }: { puan: number | null }) {
  const c = halkaCizgisi(puan);
  return (
    <div className="relative h-11 w-11 shrink-0" title={puan === null ? 'Puan yok' : `Puan ${puan} / 100`}>
      <svg className="h-11 w-11 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="19" className="fill-none stroke-line" strokeWidth="4" />
        {puan !== null && (
          <circle cx="22" cy="22" r="19" className="fill-none stroke-ink" strokeWidth="4" strokeDasharray={`${c.dolu} ${c.cevre}`} strokeLinecap="round" />
        )}
      </svg>
      <b
        className={`absolute inset-0 grid place-items-center tabular-nums ${
          puan === null ? 'text-11 font-normal text-ink-muted' : 'font-baslik text-14 text-ink'
        }`}
      >
        {puan === null ? 'yok' : puan}
      </b>
    </div>
  );
}

function KreatifKarti({ satir: x, clientId }: { satir: KreatifSatiri; clientId: string }) {
  const kova = kovaMetni(x);
  const kismi = kismiNotu(x.kismiEtiket);
  const cipler = etiketCipleri(x.etiketler);
  const durum = etiketDurumMetni(x);
  const puanYok = puanYokCumlesi(x.puan, x.paraBirimi);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-kart border border-line bg-surface">
      <div
        className={`relative grid place-items-center overflow-hidden bg-surface-sunken ${
          x.etiketler?.en_boy === 'dikey' ? 'aspect-[4/5]' : 'aspect-square'
        }`}
      >
        <Gorsel creativeId={x.creativeId} alt={x.adAdi ?? 'Kreatif'} />
        <span className="absolute right-2 top-2 rounded-full border border-line bg-surface px-2 py-0.5 text-11 font-bold text-ink">
          {platformAdi(x)}
        </span>
        {kismi && <span className="absolute bottom-2 left-2 rounded-full bg-ink px-2 py-0.5 text-11 font-bold text-surface">{kismi}</span>}
      </div>
      <div className="flex flex-col gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <Halka puan={x.puan.puan} />
          <div className="min-w-0" title={puanYok ?? undefined}>
            <b className="block truncate text-13 text-ink">{x.adAdi ?? 'Adsız reklam'}</b>
            <small className="block truncate text-12 text-ink-muted">{x.kampanyaAdi ?? ''}</small>
          </div>
        </div>
        {kova && (
          <span
            className={`inline-flex items-center gap-1.5 text-12 font-bold ${
              kova.kova === 'dikkat' ? 'text-danger-strong' : kova.kova === 'veri_yetersiz' ? 'text-ink-muted' : 'text-ink'
            }`}
          >
            <DurumNoktasi hal={KOVA_HALI[kova.kova]} />
            {kova.ad}
          </span>
        )}
        {kova && (
          <div className="text-[12.5px] text-ink">
            {kova.oneriye ? (
              <Link className="font-semibold text-ink underline hover:text-brand-strong" href={onerilerAdresi(clientId)}>
                {kova.cumle}
              </Link>
            ) : (
              kova.cumle
            )}
          </div>
        )}
        {!kova && puanYok && <div className="text-[12.5px] text-ink">{puanYok}</div>}
        {cipler.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {cipler.map((c) => (
              <span key={c} className="rounded-full bg-surface-sunken px-2 py-0.5 text-11 font-semibold text-ink">
                {c}
              </span>
            ))}
          </div>
        )}
        {durum && <div className="text-12 text-ink-muted">{durum}</div>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-2 text-12 text-ink-muted">
          <span>
            Harcama <b className="font-baslik tabular-nums text-ink">{formatMoney(x.harcamaMicros, x.paraBirimi, { decimals: 0 })}</b>
          </span>
          <span>
            Dönüşüm <b className="font-baslik tabular-nums text-ink">{formatNumber(x.donusum)}</b>
          </span>
          <span>
            {metrikAdi(x.anaMetrik)} <b className="font-baslik tabular-nums text-ink">{metrikMetni(x.anaMetrik, x.anaDeger, x.paraBirimi)}</b>
          </span>
        </div>
      </div>
    </article>
  );
}

function KucukGorsel({ creativeId }: { creativeId: string }) {
  const g = useGorsel(creativeId);
  const kap = 'grid h-10 w-10 place-items-center overflow-hidden rounded-alan bg-surface-sunken';
  // HATA HÂLİ BOŞ KUTU DEĞİL (Ajan 4 N): nedeni kısa yazılıyor, tamamı başlıkta.
  if (g.durum === 'hata') {
    return (
      <span className={kap} title={g.mesaj}>
        <span className="break-words p-0.5 text-center text-[9px] leading-tight text-ink-muted">{kisaNeden(g.mesaj)}</span>
      </span>
    );
  }
  return <span className={kap}>{g.durum === 'tamam' ? <img className="h-full w-full object-cover" src={g.adres} alt="" /> : null}</span>;
}

/** "Tümü" görünümü: puan tablosu. Sütunlar TEK listeden (`Tablo`), sayılar sağa yaslı. */
function PuanTablosu({ yanit }: { yanit: KreatifZekaYaniti }) {
  const metrik = yanit.satirlar[0]?.anaMetrik ?? null;
  return (
    <Tablo<KreatifSatiri>
      etiket="Kreatif puanları"
      satirlar={yanit.satirlar}
      satirAnahtari={(x) => x.creativeId}
      sutunlar={[
        { anahtar: 'gorsel', baslik: <span className="sr-only">Görsel</span>, hucre: (x) => <KucukGorsel creativeId={x.creativeId} /> },
        { anahtar: 'reklam', baslik: 'Reklam', hucre: (x) => <AdHucresi ad={x.adAdi ?? 'Adsız reklam'} alt={x.kampanyaAdi ?? undefined} /> },
        {
          anahtar: 'puan',
          baslik: 'Puan',
          sayi: true,
          hucre: (x) => (
            <span className="font-baslik font-bold" title={puanYokCumlesi(x.puan, x.paraBirimi) ?? undefined}>
              {x.puan.puan ?? '-'}
            </span>
          ),
        },
        { anahtar: 'ozellik', baslik: 'Özellikler', ikincil: true, hucre: (x) => etiketCipleri(x.etiketler).join(' · ') || etiketDurumMetni(x) },
        { anahtar: 'harcama', baslik: 'Harcama', sayi: true, hucre: (x) => formatMoney(x.harcamaMicros, x.paraBirimi, { decimals: 0 }) },
        { anahtar: 'donusum', baslik: 'Dönüşüm', sayi: true, hucre: (x) => formatNumber(x.donusum) },
        { anahtar: 'metrik', baslik: metrikAdi(metrik), sayi: true, hucre: (x) => metrikMetni(x.anaMetrik, x.anaDeger, x.paraBirimi) },
      ]}
    />
  );
}

/** Sayfalama bilgisi; sayfa boyutu sözleşmeden (`KREATIF_SAYFA_BOYUTU`). */
function sayfalamaBilgisi(yanit: KreatifZekaYaniti, sayfa: number, onSayfa: (n: number) => void) {
  const sayfaSayisi = Math.max(1, Math.ceil(yanit.toplam / KREATIF_SAYFA_BOYUTU));
  const bas = (sayfa - 1) * KREATIF_SAYFA_BOYUTU;
  return {
    bas: yanit.satirlar.length === 0 ? 0 : bas + 1,
    son: bas + yanit.satirlar.length,
    toplam: yanit.toplam,
    onceki: sayfa > 1 ? () => onSayfa(sayfa - 1) : undefined,
    sonraki: sayfa < sayfaSayisi ? () => onSayfa(sayfa + 1) : undefined,
  };
}

function NeIseYariyor({ yanit }: { yanit: KreatifZekaYaniti }) {
  const { anlamli, diger } = farkGruplari(yanit.farklar);
  const eksen = aralikEkseni(anlamli);
  const kume = yanit.kumeler.find((x) => x.anahtar === yanit.kume);
  return (
    <Kart
      dolgu={false}
      baslik="Ne işe yarıyor"
      baslikEki={kume ? `${kume.ad} · ${kume.kreatif} kreatif · ${metrikAdi(kume.anaMetrik).toLocaleLowerCase('tr')}` : undefined}
    >
      {anlamli.length === 0 && (
        <div className="p-4">
          <BosDurum
            baslik="Henüz belirgin bir fark yok"
            neden="İncelenmiş ve yeterli harcamalı kreatiflerde hiçbir özellik ötekinden belirgin biçimde ayrışmıyor."
          />
        </div>
      )}
      {anlamli.map((f, n) => {
        const c = eksen(f);
        return (
          <div
            key={`${f.alan}:${f.deger}`}
            className={`grid items-center gap-x-4 gap-y-2 px-4 py-3 text-13 text-ink min-[700px]:grid-cols-[minmax(0,1fr)_170px] ${
              n > 0 ? 'border-t border-line' : ''
            }`}
          >
            <div>
              {f.cumle}
              <small className="mt-0.5 block text-12 text-ink-muted">{orneklemMetni(f)}</small>
            </div>
            {/* Güven aralığı çubuğu: gri eksen, siyah sıfır çizgisi ve bant, kırmızı orta nokta. */}
            {c && (
              <div className="relative h-7" aria-hidden="true">
                <div className="absolute inset-x-0 top-[13px] h-px bg-line" />
                <div className="absolute top-1 h-5 w-px bg-ink" style={{ left: `${c.sifir}%` }} />
                <div className="absolute top-[9px] h-[9px] rounded-full bg-ink" style={{ left: `${c.sol}%`, width: `${c.genislik}%` }} />
                <div className="absolute top-1.5 h-[15px] w-[3px] rounded-sm bg-brand" style={{ left: `${c.orta}%` }} />
              </div>
            )}
          </div>
        );
      })}
      {diger.length > 0 && (
        <details className={AYRINTI}>
          <summary className={AYRINTI_OZET}>Belirgin fark yok ya da veri yetersiz ({diger.length} karşılaştırma)</summary>
          <ul className={AYRINTI_LISTE}>
            {diger.map((f) => (
              <li key={`${f.alan}:${f.deger}:${f.karsi}`}>{f.cumle}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="m-0 border-t border-line px-4 py-2.5 text-12 text-ink-muted">
        <b className="text-ink">Bu bir ilişki, garanti değil.</b> Aynı amaçtaki kreatiflerin geçmişinden; yeni görselle sınayın.
      </p>
    </Kart>
  );
}

function BriefKarti({
  kume,
  brief,
  bosNeden,
  hali,
  yetki,
  aktarim,
  kopyalandi,
  onHazirla,
  onKur,
  onKopyala,
}: {
  kume: string;
  brief: KreatifBrief | null;
  bosNeden: KreatifZekaYaniti['briefBosNedeni'];
  hali: BriefHali;
  yetki: { yaz: boolean; aktar: boolean };
  aktarim: { durum: 'yok' } | { durum: 'gidiyor' } | { durum: 'hata'; mesaj: string };
  kopyalandi: boolean;
  onHazirla: () => void;
  onKur: (b: KreatifBrief) => void;
  onKopyala: (b: KreatifBrief) => void;
}) {
  return (
    <Kart baslik="Üretim brief’i" baslikEki="Yalnız belirgin farklardan">
      <div className="grid gap-3">
        {hali.durum === 'yukleniyor' && <Yukleniyor etiket="Brief hazırlanıyor" />}
        {hali.durum === 'hata' && <HataDurumu baslik="Brief hazırlanamadı." mesaj={hali.mesaj} />}
        {!brief &&
          hali.durum !== 'yukleniyor' &&
          (bosNeden ? (
            <BosDurum baslik={briefBosMetni(bosNeden).baslik} neden={briefBosMetni(bosNeden).metin} />
          ) : (
            <BosDurum
              baslik="Bir sonraki görsel için brief"
              neden={`Belirgin farklardan tasarımcıya ya da AdvCampaign’e verilecek kısa bir yönerge hazırlar (${kumeAdi(kume)}).`}
              eylem={
                yetki.yaz ? (
                  <Dugme ton="koyu" boyut="kucuk" onClick={onHazirla}>
                    Brief hazırla
                  </Dugme>
                ) : (
                  <p className="m-0 text-12 text-ink-muted">Brief hazırlama yetkin yok.</p>
                )
              }
            />
          ))}
        {brief && hali.durum !== 'yukleniyor' && (
          <>
            <div className="grid gap-3">
              <div className="font-baslik text-15 font-bold text-ink">{brief.cevap.yon}</div>
              <div className="text-12 text-ink-muted">Bulgular (Advetics verisi)</div>
              {brief.bulgular.map((b) => (
                <div key={`${b.alan}:${b.deger}`} className="border-l-[3px] border-ink py-0.5 pl-2.5 text-[12.5px] text-ink">
                  {b.cumle}
                </div>
              ))}
              <div className="text-12 text-ink-muted">Yönerge (yapay zekâ)</div>
              <ol className="m-0 grid list-decimal gap-1.5 pl-[18px] text-13 text-ink">
                {brief.cevap.talimatlar.map((t) => (
                  <li key={t.alan}>{t.talimat}</li>
                ))}
              </ol>
              {brief.cevap.kacin.length > 0 && (
                <div className="text-[12.5px] text-ink">
                  <b>Kaçın:</b> {brief.cevap.kacin.join('; ')}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <span className="mr-auto text-12 text-ink-muted">
                {formatRelative(brief.uretildi)} · aynı bulgularla tekrar istenirse yeniden hazırlanmaz
              </span>
              <Dugme ton="ikincil" boyut="kucuk" onClick={() => onKopyala(brief)}>
                {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
              </Dugme>
              {yetki.aktar && (
                <Dugme ton="koyu" boyut="kucuk" bekliyor={aktarim.durum === 'gidiyor'} onClick={() => onKur(brief)}>
                  {aktarim.durum === 'gidiyor' ? 'Açılıyor' : 'Bu brief ile reklam kur'}
                </Dugme>
              )}
            </div>
            {aktarim.durum === 'hata' && (
              // Aktarım ya da pano hatası: sunucunun/tarayıcının cümlesi başlıkta.
              <Serit ton="hata" baslik={aktarim.mesaj} />
            )}
          </>
        )}
      </div>
    </Kart>
  );
}
