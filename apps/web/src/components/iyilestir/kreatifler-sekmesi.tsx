'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KreatifBrief, KreatifSatiri, KreatifZekaYaniti, Kova } from '@advetics/shared';
import { KOVA_ADI, KREATIF_SAYFA_BOYUTU, formatMoney, formatNumber } from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { mmAdresi } from '@/components/marka-merkezi/bolumler';
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
import i from '@/components/taslak/iyilestir.module.css';
import k from '@/components/taslak/kreatif-zeka.module.css';
import s from '@/components/taslak/taslak.module.css';

type BriefHali = { durum: 'bos' } | { durum: 'yukleniyor' } | { durum: 'hata'; mesaj: string };

const hataMesaji = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');

/**
 * ═══ İYİLEŞTİR › KREATİFLER (Paket D, taslak `docs/kreatif-zeka/taslak.html`) ═══
 *
 * Üstte küme seçici ve etiketleme durumu, ortada yeni kreatifler (kova) ya
 * da bütün kreatifler (puan), altta "Ne işe yarıyor" ve üretim brief'i.
 * Kararlar `lib/kreatif-zeka.ts`te ve çalıştırılarak sınanıyor; burada
 * yalnız çizim ve istek.
 *
 * DÖRT HÂL AYRI (`kreatifKutuHali`): yükleniyor, hata (sunucunun cümlesi),
 * boş (NEDENİYLE), dolu. `.catch(() => setX([]))` YOK.
 *
 * SÜZGEÇ SUNUCUDA (küme, görünüm, kova, sayfa); sıra numarası eski yanıtın
 * yenisini ezmesini engelliyor. Özet ve farklar SON GELEN yanıttan: süzgeç
 * isteği sürerken üst şerit boşalmasın.
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
        <div className={`${s.bildirim} ${s.tehlike}`} role="alert">
          <span className={s.bildirimIkon} aria-hidden>
            !
          </span>
          <span className={s.bildirimMetin}>
            <strong>Bazı kaynaklar okunamadı; ekran eksik olabilir.</strong> {son.hatalar.map((h) => `${h.kaynak}: ${h.mesaj}`).join(' · ')}
          </span>
        </div>
      )}

      {/* Ortak üst: küme seçici + etiketleme durumu */}
      <div className={s.kart}>
        {son && son.kumeler.length > 0 && (
          <div className={i.sArac} role="group" aria-label="Karşılaştırma kümesi">
            <span className={i.sEtk}>Karşılaştır:</span>
            {son.kumeler.map((x) => (
              <button key={x.anahtar} type="button" className={i.cip} aria-pressed={x.anahtar === secili} onClick={() => suz({ kume: x.anahtar })}>
                {x.ad} <span className={i.say}>{x.kreatif}</span>
              </button>
            ))}
            <span className={i.zaman}>Aynı amaçtaki kreatifler birbiriyle karşılaştırılır</span>
          </div>
        )}
        {son && <EtiketlemeSeridi yanit={son} yazabilir={yetki.yaz} etiketle={etiketle} onEtiketle={() => void etiketleBaslat()} />}
      </div>

      {/* Liste */}
      <div className={s.kart}>
        <div className={i.sArac} role="group" aria-label="Görünüm">
          {(['yeni', 'tumu'] as KreatifGorunumu[]).map((g) => (
            <button key={g} type="button" className={i.cip} aria-pressed={q.gorunum === g} onClick={() => suz({ gorunum: g, kova: null })}>
              {g === 'yeni' ? 'Yeni kreatifler' : 'Tümü'}
            </button>
          ))}
          {q.gorunum === 'yeni' && son && (
            <>
              <span className={i.sAyrac} />
              <button type="button" className={i.cip} aria-pressed={q.kova === null} onClick={() => suz({ kova: null })}>
                Hepsi <span className={i.say}>{son.kovaSayilari.iyi_gidiyor + son.kovaSayilari.dikkat + son.kovaSayilari.veri_yetersiz}</span>
              </button>
              {(['iyi_gidiyor', 'dikkat', 'veri_yetersiz'] as Kova[]).map((kv) => (
                <button key={kv} type="button" className={i.cip} aria-pressed={q.kova === kv} onClick={() => suz({ kova: kv })}>
                  {kv === 'iyi_gidiyor' && <span className={`${i.sNokta} ${i.sNoktaYesil}`} aria-hidden="true" />}
                  {KOVA_ADI[kv]} <span className={i.say}>{son.kovaSayilari[kv]}</span>
                </button>
              ))}
            </>
          )}
          {kumeOzet && (
            <span className={i.zaman}>
              {q.gorunum === 'yeni' ? `İlk 14 gün · karar için en az ${esikMetni(son!.paraBirimi)} harcama · ` : 'Puana göre · '}
              {metrikAdi(kumeOzet.anaMetrik).toLocaleLowerCase('tr')}
              {kumeOzet.metrikDusus ? ' (dönüşüm az, tıklama oranına göre)' : ''}
            </span>
          )}
        </div>

        {hal === 'yukleniyor' && (
          <div className={i.sYukleniyor} aria-busy="true" aria-label="Kreatifler yükleniyor">
            <i style={{ width: '40%' }} />
            <i style={{ width: '90%' }} />
            <i style={{ width: '75%' }} />
          </div>
        )}
        {sonuc?.durum === 'hata' && (
          <div className={i.sHataKutu} role="alert">
            <b>Kreatifler okunamadı.</b> Sunucunun cevabı: {sonuc.mesaj}{' '}
            <button type="button" className={i.metin} onClick={() => void yukle(q)}>
              Yeniden dene
            </button>
          </div>
        )}
        {hal === 'bos' && sonuc?.durum === 'tamam' && <BosKutu clientId={clientId} neden={sonuc.yanit.emptyReason} onTumu={() => suz({ gorunum: 'tumu', kova: null })} />}
        {hal === 'dolu' && sonuc?.durum === 'tamam' && q.gorunum === 'yeni' && (
          <div className={k.izgara}>
            {sonuc.yanit.satirlar.map((x) => (
              <KreatifKarti key={x.creativeId} satir={x} clientId={clientId} />
            ))}
          </div>
        )}
        {hal === 'dolu' && sonuc?.durum === 'tamam' && q.gorunum === 'tumu' && <Tablo yanit={sonuc.yanit} />}
        {sonuc?.durum === 'tamam' && <Sayfalama yanit={sonuc.yanit} sayfa={q.sayfa} onSayfa={(n) => void yukle({ ...q, sayfa: n })} />}
      </div>

      {/* Ne işe yarıyor + brief */}
      {son && secili && (
        <div className={k.iki}>
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
      <div className={k.durumS}>
        <span>
          <span className={`${i.sNokta} ${i.sNoktaYesil}`} aria-hidden="true" /> <b className={s.num}>{d.incelendi}</b>
        </span>
        {d.sirada && (
          <span>
            <span className={`${i.sNokta} ${i.sNoktaGri}`} aria-hidden="true" /> {d.sirada}
          </span>
        )}
        {d.incelenemiyor && <span>{d.incelenemiyor}</span>}
        <span className={k.sag}>
          {d.sonIs && <span className={i.zaman}>{d.sonIs}</span>}
          {yazabilir && (
            <button type="button" className={i.ikincil} disabled={etiketle.durum === 'gidiyor'} onClick={onEtiketle}>
              {etiketle.durum === 'gidiyor' ? 'Başlatılıyor' : 'Şimdi incele'}
            </button>
          )}
        </span>
      </div>
      {etiketle.durum === 'tamam' && (
        <div className={k.bildirim} role="status">
          {etiketle.mesaj}
        </div>
      )}
      {etiketle.durum === 'hata' && (
        <div className={i.sHataKutu} role="alert">
          <b>İnceleme başlatılamadı.</b> {etiketle.mesaj}
        </div>
      )}
      {d.dokum.length > 0 && (
        <details className={i.sDisarida}>
          <summary>Neden incelenemiyor</summary>
          <ul>
            {d.dokum.map((x) => (
              <li key={x.cumle}>
                <b className={s.num}>{x.sayi}</b> {x.cumle}
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
    <div className={i.sBos}>
      <b>{b.baslik}</b>
      <p>{b.metin}</p>
      {b.suzgec && (
        <button type="button" className={i.ikincil} onClick={onTumu}>
          Tümüne bak
        </button>
      )}
      {b.baglanti === 'baglantilar' && (
        <Link className={i.ikincil} href={mmAdresi(clientId, 'baglantilar')}>
          Marka Merkezi › Bağlantılar
        </Link>
      )}
    </div>
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
  if (g.durum === 'tamam') return <img src={g.adres} alt={alt} />;
  if (g.durum === 'hata') return <span className={k.gorselNot}>{g.mesaj}</span>;
  return <span className={k.gorselNot} aria-busy="true">Görsel yükleniyor</span>;
}

function Halka({ puan }: { puan: number | null }) {
  const c = halkaCizgisi(puan);
  return (
    <div className={`${k.halka} ${puan === null ? k.halkaYok : ''}`} title={puan === null ? 'Puan yok' : `Puan ${puan} / 100`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="19" fill="none" stroke="var(--t-line)" strokeWidth="4" />
        {puan !== null && <circle cx="22" cy="22" r="19" fill="none" stroke="var(--t-ink)" strokeWidth="4" strokeDasharray={`${c.dolu} ${c.cevre}`} strokeLinecap="round" />}
      </svg>
      <b className={s.num}>{puan === null ? 'yok' : puan}</b>
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
    <article className={k.kk}>
      <div className={`${k.gorsel} ${x.etiketler?.en_boy === 'dikey' ? k.gorselDikey : ''}`}>
        <Gorsel creativeId={x.creativeId} alt={x.adAdi ?? 'Kreatif'} />
        <span className={k.platformEt}>{platformAdi(x)}</span>
        {kismi && <span className={k.kisim}>{kismi}</span>}
      </div>
      <div className={k.kkG}>
        <div className={k.kkUst}>
          <Halka puan={x.puan.puan} />
          <div className={k.kkAd} title={puanYok ?? undefined}>
            <b>{x.adAdi ?? 'Adsız reklam'}</b>
            <small>{x.kampanyaAdi ?? ''}</small>
          </div>
        </div>
        {kova && (
          <span className={`${k.kova} ${kova.kova === 'dikkat' ? k.kovaDikkat : kova.kova === 'veri_yetersiz' ? k.kovaYetersiz : ''}`}>
            <span
              className={`${i.sNokta} ${kova.kova === 'iyi_gidiyor' ? i.sNoktaYesil : kova.kova === 'dikkat' ? i.sNoktaKirmizi : i.sNoktaGri}`}
              aria-hidden="true"
            />
            {kova.ad}
          </span>
        )}
        {kova && (
          <div className={k.cumle}>
            {kova.oneriye ? <Link href={onerilerAdresi(clientId)}>{kova.cumle}</Link> : kova.cumle}
          </div>
        )}
        {!kova && puanYok && <div className={k.cumle}>{puanYok}</div>}
        {cipler.length > 0 && (
          <div className={k.etiketler}>
            {cipler.map((c) => (
              <span key={c} className={k.et}>
                {c}
              </span>
            ))}
          </div>
        )}
        {durum && <div className={k.etNot}>{durum}</div>}
        <div className={`${k.metrikler} ${s.num}`}>
          <span>
            Harcama <b>{formatMoney(x.harcamaMicros, x.paraBirimi, { decimals: 0 })}</b>
          </span>
          <span>
            Dönüşüm <b>{formatNumber(x.donusum)}</b>
          </span>
          <span>
            {metrikAdi(x.anaMetrik)} <b>{metrikMetni(x.anaMetrik, x.anaDeger, x.paraBirimi)}</b>
          </span>
        </div>
      </div>
    </article>
  );
}

function KucukGorsel({ creativeId }: { creativeId: string }) {
  const g = useGorsel(creativeId);
  return <span className={k.kucukG}>{g.durum === 'tamam' ? <img src={g.adres} alt="" /> : null}</span>;
}

function Tablo({ yanit }: { yanit: KreatifZekaYaniti }) {
  const metrik = yanit.satirlar[0]?.anaMetrik ?? null;
  return (
    <div className={k.tabloS}>
      <table className={k.tablo}>
        <thead>
          <tr>
            <th aria-label="Görsel" />
            <th>Reklam</th>
            <th className={k.sayi}>Puan</th>
            <th>Özellikler</th>
            <th className={k.sayi}>Harcama</th>
            <th className={k.sayi}>Dönüşüm</th>
            <th className={k.sayi}>{metrikAdi(metrik)}</th>
          </tr>
        </thead>
        <tbody>
          {yanit.satirlar.map((x) => (
            <tr key={x.creativeId}>
              <td>
                <KucukGorsel creativeId={x.creativeId} />
              </td>
              <td>
                {x.adAdi ?? 'Adsız reklam'}
                {x.kampanyaAdi && <div className={i.sYol}>{x.kampanyaAdi}</div>}
              </td>
              <td className={k.sayi} title={puanYokCumlesi(x.puan, x.paraBirimi) ?? undefined}>
                <span className={`${k.puanH} ${s.num}`}>{x.puan.puan ?? '-'}</span>
              </td>
              <td>{etiketCipleri(x.etiketler).join(' · ') || etiketDurumMetni(x)}</td>
              <td className={`${k.sayi} ${s.num}`}>{formatMoney(x.harcamaMicros, x.paraBirimi, { decimals: 0 })}</td>
              <td className={`${k.sayi} ${s.num}`}>{formatNumber(x.donusum)}</td>
              <td className={`${k.sayi} ${s.num}`}>{metrikMetni(x.anaMetrik, x.anaDeger, x.paraBirimi)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "N / M gösteriliyor": sessiz kesme yok. Sayfa boyutu sözleşmeden. */
function Sayfalama({ yanit, sayfa, onSayfa }: { yanit: KreatifZekaYaniti; sayfa: number; onSayfa: (n: number) => void }) {
  const sayfaSayisi = Math.max(1, Math.ceil(yanit.toplam / KREATIF_SAYFA_BOYUTU));
  return (
    <div className={i.sSayfalama}>
      <span>
        <b className={s.num}>{yanit.toplam}</b> kreatiften <b className={s.num}>{yanit.satirlar.length}</b> tanesi gösteriliyor
        {sayfaSayisi > 1 ? ` · sayfa ${sayfa} / ${sayfaSayisi}` : ''}
      </span>
      {sayfaSayisi > 1 && (
        <>
          <button type="button" className={i.metin} disabled={sayfa <= 1} onClick={() => onSayfa(sayfa - 1)}>
            Önceki
          </button>
          <button type="button" className={i.metin} disabled={sayfa >= sayfaSayisi} onClick={() => onSayfa(sayfa + 1)}>
            Sonraki
          </button>
        </>
      )}
    </div>
  );
}

function NeIseYariyor({ yanit }: { yanit: KreatifZekaYaniti }) {
  const { anlamli, diger } = farkGruplari(yanit.farklar);
  const eksen = aralikEkseni(anlamli);
  const kume = yanit.kumeler.find((x) => x.anahtar === yanit.kume);
  return (
    <div className={s.kart}>
      <div className={s.kartUst}>
        <h2>Ne işe yarıyor</h2>
        <span className={i.zaman}>
          {kume ? `${kume.ad} · ${kume.kreatif} kreatif · ${metrikAdi(kume.anaMetrik).toLocaleLowerCase('tr')}` : ''}
        </span>
      </div>
      {anlamli.length === 0 && (
        <div className={i.sBos}>
          <b>Henüz belirgin bir fark yok</b>
          <p>İncelenmiş ve yeterli harcamalı kreatiflerde hiçbir özellik ötekinden belirgin biçimde ayrışmıyor.</p>
        </div>
      )}
      {anlamli.map((f) => {
        const c = eksen(f);
        return (
          <div key={`${f.alan}:${f.deger}`} className={k.fark}>
            <div>
              {f.cumle}
              <small>{orneklemMetni(f)}</small>
            </div>
            {c && (
              <div className={k.aralik} aria-hidden="true">
                <div className={k.eksen} />
                <div className={k.sifir} style={{ left: `${c.sifir}%` }} />
                <div className={k.bant} style={{ left: `${c.sol}%`, width: `${c.genislik}%` }} />
                <div className={k.orta} style={{ left: `${c.orta}%` }} />
              </div>
            )}
          </div>
        );
      })}
      {diger.length > 0 && (
        <details className={i.sDisarida}>
          <summary>Belirgin fark yok ya da veri yetersiz ({diger.length} karşılaştırma)</summary>
          <ul>
            {diger.map((f) => (
              <li key={`${f.alan}:${f.deger}:${f.karsi}`}>{f.cumle}</li>
            ))}
          </ul>
        </details>
      )}
      <div className={k.uyari}>
        <b>Bu bir ilişki, garanti değil.</b> Aynı amaçtaki kreatiflerin geçmişinden; yeni görselle sınayın.
      </div>
    </div>
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
    <div className={s.kart}>
      <div className={s.kartUst}>
        <h2>Üretim brief’i</h2>
        <span className={i.zaman}>Yalnız belirgin farklardan</span>
      </div>
      {hali.durum === 'yukleniyor' && (
        <div className={i.sYukleniyor} aria-busy="true" aria-label="Brief hazırlanıyor">
          <i style={{ width: '70%' }} />
          <i style={{ width: '92%' }} />
          <i style={{ width: '60%' }} />
        </div>
      )}
      {hali.durum === 'hata' && (
        <div className={i.sHataKutu} role="alert">
          <b>Brief hazırlanamadı.</b> {hali.mesaj}
        </div>
      )}
      {!brief && hali.durum !== 'yukleniyor' && (
        <div className={i.sBos}>
          {bosNeden ? (
            <>
              <b>{briefBosMetni(bosNeden).baslik}</b>
              <p>{briefBosMetni(bosNeden).metin}</p>
            </>
          ) : (
            <>
              <b>Bir sonraki görsel için brief</b>
              <p>Belirgin farklardan tasarımcıya ya da AdvCampaign’e verilecek kısa bir yönerge hazırlar ({kumeAdi(kume)}).</p>
              {yetki.yaz ? (
                <button type="button" className={i.birincil} onClick={onHazirla}>
                  Brief hazırla
                </button>
              ) : (
                <p>Brief hazırlama yetkin yok.</p>
              )}
            </>
          )}
        </div>
      )}
      {brief && hali.durum !== 'yukleniyor' && (
        <>
          <div className={k.brief}>
            <div className={k.yon}>{brief.cevap.yon}</div>
            <div className={k.kaynak}>Bulgular (Advetics verisi)</div>
            {brief.bulgular.map((b) => (
              <div key={`${b.alan}:${b.deger}`} className={k.bulgu}>
                {b.cumle}
              </div>
            ))}
            <div className={k.kaynak}>Yönerge (yapay zekâ)</div>
            <ol>
              {brief.cevap.talimatlar.map((t) => (
                <li key={t.alan}>{t.talimat}</li>
              ))}
            </ol>
            {brief.cevap.kacin.length > 0 && (
              <div className={k.kacin}>
                <b>Kaçın:</b> {brief.cevap.kacin.join('; ')}
              </div>
            )}
          </div>
          <div className={k.eylemS}>
            {yetki.aktar && (
              <button type="button" className={i.birincil} disabled={aktarim.durum === 'gidiyor'} onClick={() => onKur(brief)}>
                {aktarim.durum === 'gidiyor' ? 'Açılıyor' : 'Bu brief ile reklam kur'}
              </button>
            )}
            <button type="button" className={i.ikincil} onClick={() => onKopyala(brief)}>
              {kopyalandi ? 'Kopyalandı' : 'Kopyala'}
            </button>
            <span>
              {formatRelative(brief.uretildi)} · aynı bulgularla tekrar istenirse yeniden hazırlanmaz
            </span>
          </div>
          {aktarim.durum === 'hata' && (
            <div className={i.sHataKutu} role="alert">
              {aktarim.mesaj}
            </div>
          )}
        </>
      )}
    </div>
  );
}
