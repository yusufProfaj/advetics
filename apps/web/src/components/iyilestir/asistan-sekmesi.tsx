'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AsistanMesaji, AsistanOturumu, AsistanParcasi, Oneri, UygulamaSonucu } from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { useDil, useSozluk } from '@/dil/saglayici';
import { asistanSozlugu } from '@/dil/sozlukler/iyilestir-asistan';
import { iyilestirSozlugu } from '@/dil/sozlukler/iyilestir';
import {
  aracIziMetni,
  devretAdresi,
  eylemMetni,
  metinBloklari,
  parcaEkle,
  parcalariAyikla,
  sonucMetni,
  turuBitir,
  yaziyorMu,
  type MetinParcasi,
} from '@/lib/iyilestir';
import { OnayPenceresi } from './onay-penceresi';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Kart, KART_BAGLANTISI } from '@/components/ui/kart';
import { Girdi } from '@/components/ui/alan';
import { DurumNoktasi } from '@/components/ui/rozet';

/*
 * ═══ SOHBET GÖRÜNÜŞÜ (birleşik tasarım, 2026-10-14) ═══
 *
 * Balonlar SADE: kullanıcı gri zeminde sağda, asistan beyaz kartta solda;
 * hata balonu beyaz zemin + KIRMIZI SOL ÇİZGİ (kılavuz şeridi) ve
 * platformun/sunucunun cümlesi olduğu gibi içinde. Kılavuz dışı renk ve
 * gölge yok. Yerel sabitler: `components/ui`da sohbet balonu yok
 * (Grup 3 sapması).
 */
const BALON = 'max-w-[82%] whitespace-pre-wrap break-words rounded-kart px-3.5 py-2.5 text-[13.5px] leading-relaxed';
const BALON_BEN = `${BALON} self-end rounded-br-[4px] bg-surface-sunken text-ink`;
const BALON_O = `${BALON} self-start rounded-bl-[4px] border border-line bg-surface text-ink`;
const BALON_HATA = `${BALON} self-start rounded-bl-[4px] border border-l-4 border-line border-l-danger bg-surface text-ink`;
/** İç kart (Uygula / devir): kart kalıbı, gölgesiz. */
const IC_KART = 'w-[min(420px,100%)] self-start rounded-kart border border-line bg-surface';
const ETIKET = 'inline-flex h-6 items-center rounded-full bg-surface-sunken px-2.5 text-11 font-bold text-ink-muted';
const KISIT = 'text-12 text-ink-muted';

/**
 * `asistanBagli` sözleşmede yok, API ekliyor (model anahtarı tanımlı mı).
 * İsteğe bağlı okunuyor: `false` geldiyse ekran söylüyor, gelmediyse susuyor.
 */
type OkunanOturum = AsistanOturumu & { asistanBagli?: boolean };

export type OturumSonucu =
  | { durum: 'yok' }
  | { durum: 'tamam'; oturum: OkunanOturum }
  | { durum: 'hata'; mesaj: string };


/**
 * ═══ AI ASİSTAN SEKMESİ ═══
 *
 * Asistan OKUR ve ÖNERİR; yazma yalnız kullanıcının onayladığı Uygula
 * kartından, öneri uygulamasıyla AYNI pencere ve AYNI uçtan (MIMARI §6).
 * Reklam kurmaz: devir kartı AdvCampaign'de hazır istekli bir oturum açar,
 * gönder düğmesine kullanıcı basar.
 *
 * OTURUM ADRESTE (`?oturum=`): sayfa yenilenince sohbet kaybolmasın ve
 * sunucu oturumu okuyup ilk hâli versin. Oturum ilk mesajda açılıyor; boş
 * bir sohbet için kayıt açmak, kimsenin yazmadığı satırlar biriktirirdi.
 *
 * AKIŞ BİTİNCE KAYITLI HÂL OKUNUYOR: ekrandaki mesajlar akıştan biriktirildi
 * ve bir parça kaybolduysa (bozuk blok, vekil sunucu) ekran eksik kalır.
 * Sunucunun kaydı tek doğru; akış yalnız beklerken görünen hâl.
 */
export function AsistanSekmesi({
  clientId,
  clientAdi,
  ilk,
  yazabilir,
}: {
  clientId: string;
  clientAdi: string;
  ilk: OturumSonucu;
  yazabilir: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const { dil } = useDil();
  const d = useSozluk(asistanSozlugu);
  /** Taslaktaki üç soru; metinleri olduğu gibi gönderiliyor (arayüz dilinde). */
  const sikSorulanlar = [d.sorular.bosaGiden, d.sorular.yorulan, d.sorular.yeniKampanya];
  const [oturumId, setOturumId] = useState<string | null>(ilk.durum === 'tamam' ? ilk.oturum.id : null);
  const [mesajlar, setMesajlar] = useState<AsistanMesaji[]>(ilk.durum === 'tamam' ? ilk.oturum.mesajlar : []);
  const [okumaHatasi, setOkumaHatasi] = useState<string | null>(ilk.durum === 'hata' ? ilk.mesaj : null);
  const [metin, setMetin] = useState('');
  const [akis, setAkis] = useState(false);
  const [akisSorunu, setAkisSorunu] = useState<string | null>(null);
  const [onayda, setOnayda] = useState<Oneri | null>(null);
  const [sonuclar, setSonuclar] = useState<Record<string, UygulamaSonucu>>({});
  const [vazgecilen, setVazgecilen] = useState<ReadonlySet<string>>(new Set());
  const [bagliDegil, setBagliDegil] = useState(ilk.durum === 'tamam' && ilk.oturum.asistanBagli === false);
  const kutu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Yeni parça gelince en alta kay; kullanıcı yukarı kaydırıp okuyorsa da
    // yeni cevap görünmeli (taslak her eklemede kaydırıyor).
    kutu.current?.scrollTo({ top: kutu.current.scrollHeight });
  }, [mesajlar]);

  const kayitliOku = useCallback(async (id: string) => {
    try {
      const o = await apiFetch<AsistanOturumu>(`/iyilestir/asistan/oturumlar/${encodeURIComponent(id)}`);
      setMesajlar(o.mesajlar);
      setOkumaHatasi(null);
    } catch (e) {
      setOkumaHatasi(e instanceof ApiRequestError ? e.message : d.baglantiKurulamadi);
    }
  }, [d]);

  function adreseYaz(id: string | null) {
    const p = new URLSearchParams(params.toString());
    p.set('sekme', 'asistan');
    if (id) p.set('oturum', id);
    else p.delete('oturum');
    /*
     * `history.replaceState`, `router.replace` DEĞİL: router sunucu
     * bileşenini yeniden çalıştırır, öneri ve kural listelerini boşuna
     * yeniden çeker ve akış sürerken bu bileşene yeni bir `ilk` verir.
     * Next.js 15 bu çağrıyı `useSearchParams` ile eşliyor.
     */
    window.history.replaceState(null, '', `${pathname}?${p}`);
  }

  function yeniSohbet() {
    setOturumId(null);
    setMesajlar([]);
    setOkumaHatasi(null);
    setAkisSorunu(null);
    adreseYaz(null);
  }

  async function gonder(soru: string) {
    const temiz = soru.trim();
    if (!temiz || akis) return;
    setAkisSorunu(null);
    let id = oturumId;
    if (!id) {
      try {
        const o = await apiFetch<OkunanOturum>('/iyilestir/asistan/oturumlar', {
          method: 'POST',
          body: JSON.stringify({ clientId }),
        });
        id = o.id;
        setOturumId(id);
        setBagliDegil(o.asistanBagli === false);
        adreseYaz(id);
      } catch (e) {
        setAkisSorunu(d.sohbetAcilamadi(e instanceof ApiRequestError ? e.message : d.baglantiKurulamadi));
        return;
      }
    }
    const simdi = new Date().toISOString();
    setMesajlar((l) => [
      ...l,
      { id: `yerel-k-${l.length}`, rol: 'kullanici', parcalar: [{ tur: 'metin', metin: temiz }], zaman: simdi },
      { id: `yerel-a-${l.length}`, rol: 'asistan', parcalar: [], zaman: simdi },
    ]);
    setMetin('');
    setAkis(true);

    let res: Response;
    try {
      res = await fetch(`${API_URL}/iyilestir/asistan/oturumlar/${encodeURIComponent(id)}/mesajlar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ metin: temiz }),
      });
    } catch {
      setAkis(false);
      setAkisSorunu(d.baglantiKoptu);
      void kayitliOku(id);
      return;
    }
    if (!res.ok || !res.body) {
      const g = (await res.json().catch(() => null)) as { message?: string } | null;
      setAkis(false);
      setAkisSorunu(g?.message ?? d.mesajGonderilemedi(res.status));
      void kayitliOku(id);
      return;
    }

    const okuyucu = res.body.getReader();
    const cozucu = new TextDecoder();
    let tampon = '';
    let sorun = 0;
    try {
      for (;;) {
        const { done, value } = await okuyucu.read();
        if (done) break;
        tampon += cozucu.decode(value, { stream: true });
        const r = parcalariAyikla(tampon);
        tampon = r.kalan;
        sorun += r.bozuk + r.taninmayan;
        if (r.parcalar.length > 0) {
          setMesajlar((l) => r.parcalar.reduce<AsistanMesaji[]>((acc, p) => parcaEkle(acc, p), l));
        }
        const bitti = r.bitti;
        if (bitti) setMesajlar((l) => turuBitir(l, bitti));
      }
    } catch {
      setAkisSorunu(d.akisKesildi);
    } finally {
      setAkis(false);
    }
    /*
     * OKUNAMAYAN PARÇA SESSİZCE ATILMIYOR: sayısı yazılıyor ve kayıtlı hâl
     * okunuyor. Kayıt da okunamazsa üstteki hata kutusu çıkıyor.
     */
    if (sorun > 0) setAkisSorunu(d.parcaOkunamadi(sorun));
    void kayitliOku(id);
  }

  const yaziyor = yaziyorMu(akis, mesajlar);
  /*
   * UZUN BEKLEME SÖYLENİYOR: model bazen yavaşlıyor (canlıda bir istek 180
   * sn zaman aşımına kadar sürdü, aynı dakikada AdvCampaign 47 sn). Üç
   * nokta üç dakika boyunca açıklamasız dönerse kullanıcı ekranın donduğunu
   * sanar. 20 saniyeden sonra ne olduğu ve en fazla ne kadar süreceği yazıyor.
   */
  const [uzunSuruyor, setUzunSuruyor] = useState(false);
  useEffect(() => {
    if (!yaziyor) return setUzunSuruyor(false);
    const t = window.setTimeout(() => setUzunSuruyor(true), 20_000);
    return () => window.clearTimeout(t);
  }, [yaziyor]);

  return (
    <div className="grid items-start gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
      <Kart
        dolgu={false}
        baslik={d.baslik}
        baslikEki={clientAdi}
        eylem={
          mesajlar.length > 0 && (
            <Dugme ton="hayalet" boyut="kucuk" onClick={yeniSohbet} disabled={akis}>
              {d.yeniSohbet}
            </Dugme>
          )
        }
        altEylem={
          <form
            className="flex w-full items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void gonder(metin);
            }}
          >
            <Girdi
              value={metin}
              onChange={(e) => setMetin(e.target.value)}
              placeholder={d.soruYeri}
              autoComplete="off"
              maxLength={2000}
              aria-label={d.soruEtiketi}
              className="min-w-0 flex-1"
            />
            <Dugme ton="koyu" type="submit" disabled={metin.trim() === ''} bekliyor={akis}>
              {d.sor}
            </Dugme>
          </form>
        }
      >
        <p className="m-0 border-b border-line px-5 py-2.5 text-12 text-ink-muted">{d.ozet}</p>
        <div className="flex h-[560px] flex-col gap-3.5 overflow-y-auto p-4" ref={kutu} aria-live="polite">
          <div className={BALON_O}>
            {d.selam(clientAdi)}
          </div>
          {bagliDegil && (
            <div className={BALON_HATA} role="alert">
              {d.bagliDegil}
            </div>
          )}
          {okumaHatasi && (
            <div className={BALON_HATA} role="alert">
              {d.sohbetOkunamadi(okumaHatasi)}{' '}
              {oturumId && (
                <button type="button" className={KART_BAGLANTISI} onClick={() => void kayitliOku(oturumId)}>
                  {d.yenidenDene}
                </button>
              )}
            </div>
          )}
          {mesajlar.map((m) =>
            m.rol === 'kullanici' ? (
              <div key={m.id} className={BALON_BEN}>
                {m.parcalar.map((p) => (p.tur === 'metin' ? p.metin : '')).join('')}
              </div>
            ) : (
              <AsistanParcalari
                key={m.id}
                mesaj={m}
                clientId={clientId}
                yazabilir={yazabilir}
                sonuclar={sonuclar}
                vazgecilen={vazgecilen}
                onUygula={setOnayda}
                onVazgec={(anahtar) => setVazgecilen((x) => new Set(x).add(`${m.id}:${anahtar}`))}
              />
            ),
          )}
          {yaziyor && (
            <div className={BALON_O} aria-label={d.yaziyor}>
              {/* Üç nokta yalnız hareket serbestse nabız atıyor; değilse durağan. */}
              <span className="inline-flex gap-1" aria-hidden>
                {[0, 150, 300].map((g) => (
                  <span
                    key={g}
                    className="inline-block h-1.5 w-1.5 rounded-full bg-ink-muted motion-safe:animate-pulse"
                    style={{ animationDelay: `${g}ms` }}
                  />
                ))}
              </span>
              {uzunSuruyor && (
                <span className="mt-1.5 block text-12 text-ink-muted">
                  {d.yavas}
                </span>
              )}
            </div>
          )}
          {akisSorunu && (
            <div className={BALON_HATA} role="alert">
              {akisSorunu}
            </div>
          )}
        </div>
      </Kart>

      <div className="grid min-w-0 content-start gap-4">
        <Kart baslik={d.sikSorulanlarBaslik}>
          {/*
           * Hazır sorular BAĞLANTI görünüşünde (kartın eylemi bağlantıdır,
           * BILESENLER §3.3): `Dugme` tek satırlık hap ve uzun soru metni
           * taşıp kesilirdi.
           */}
          <ul className="m-0 grid list-none gap-2.5 p-0">
            {sikSorulanlar.map((soru) => (
              <li key={soru}>
                <button
                  type="button"
                  className={`${KART_BAGLANTISI} text-left disabled:cursor-not-allowed disabled:opacity-40`}
                  onClick={() => void gonder(soru)}
                  disabled={akis}
                >
                  {soru}
                </button>
              </li>
            ))}
          </ul>
        </Kart>
        <Kart baslik={d.neYapabilir}>
          <p className="m-0 text-13 leading-relaxed text-ink-muted">
            <b className="text-ink">{d.okurBaslik}</b> {d.okur}
            <br />
            <b className="text-ink">{d.uygularBaslik}</b> {d.uygular}
            <br />
            <b className="text-ink">{d.yapmazBaslik}</b> {d.yapmaz}
          </p>
        </Kart>
      </div>

      <OnayPenceresi
        oneri={onayda}
        onKapat={() => setOnayda(null)}
        onSonuc={(anahtar, r) => setSonuclar((x) => ({ ...x, [anahtar]: r }))}
      />
    </div>
  );
}

/**
 * Bir asistan mesajının parçaları, sırasıyla: araç izleri tek satırda
 * toplanıyor (taslaktaki `.iz`), metin balon, Uygula ve devir kartları ayrı.
 */
function AsistanParcalari({
  mesaj,
  clientId,
  yazabilir,
  sonuclar,
  vazgecilen,
  onUygula,
  onVazgec,
}: {
  mesaj: AsistanMesaji;
  clientId: string;
  yazabilir: boolean;
  sonuclar: Record<string, UygulamaSonucu>;
  vazgecilen: ReadonlySet<string>;
  onUygula: (o: Oneri) => void;
  onVazgec: (anahtar: string) => void;
}) {
  const { dil } = useDil();
  const d = useSozluk(asistanSozlugu);
  const iy = useSozluk(iyilestirSozlugu);
  // Ardışık araç parçalarını tek iz satırında topla.
  const gruplar: Array<{ tur: 'iz'; izler: string[] } | { tur: 'parca'; parca: AsistanParcasi }> = [];
  for (const p of mesaj.parcalar) {
    // BOŞ METİN PARÇASI ÇİZİLMİYOR: model araç çağırmadan önce boş metin
    // gönderiyor ve her biri boş bir balon oluyordu; ayrıca araç izlerini
    // bölüp aynı satırda toplanmalarını engelliyordu (canlı denetim).
    if (p.tur === 'metin' && p.metin.trim() === '') continue;
    const son = gruplar.at(-1);
    if (p.tur === 'arac') {
      if (son?.tur === 'iz') son.izler.push(aracIziMetni(p, dil));
      else gruplar.push({ tur: 'iz', izler: [aracIziMetni(p, dil)] });
    } else {
      gruplar.push({ tur: 'parca', parca: p });
    }
  }

  return (
    <>
      {gruplar.map((g, n) => {
        if (g.tur === 'iz') {
          return (
            <div key={n} className="flex flex-wrap gap-1.5 self-start">
              {g.izler.map((t, k) => (
                <span key={k} className="rounded-full border border-line px-2.5 py-0.5 text-11 text-ink-muted">
                  {t}
                </span>
              ))}
            </div>
          );
        }
        const p = g.parca;
        if (p.tur === 'metin') {
          return (
            <div key={n} className={BALON_O}>
              <BicimliMetin metin={p.metin} />
            </div>
          );
        }
        if (p.tur === 'hata') {
          return (
            <div key={n} className={BALON_HATA} role="alert">
              {p.mesaj}
            </div>
          );
        }
        if (p.tur === 'devret') {
          return (
            <div key={n} className={IC_KART}>
              <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
                <span className={ETIKET}>{d.devret}</span>
              </div>
              <p className="m-0 px-3 py-2.5 text-13 leading-normal text-ink">
                {d.devretCumle(p.istem)}
              </p>
              <div className="flex justify-end border-t border-line px-3 py-2.5">
                <Link className={dugmeSinifi('koyu', 'kucuk')} href={devretAdresi(clientId, p.oturumId)}>
                  {d.devretAc}
                </Link>
              </div>
            </div>
          );
        }
        if (p.tur !== 'uygula_karti') return null;
        // uygula_karti
        const o = p.oneri;
        const metin = eylemMetni(o, dil);
        const sonuc = sonuclar[o.anahtar] ?? (o.durum === 'uygulandi' ? o.uygulama : null);
        const vazgecildi = vazgecilen.has(`${mesaj.id}:${o.anahtar}`);
        return (
          <div key={n} className={IC_KART}>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 text-[12.5px] font-bold text-ink">
              <span className={ETIKET}>{d.uygulaKarti}</span> {metin?.dugme ?? o.baslik}
            </div>
            <p className="m-0 px-3 py-2.5 text-13 leading-normal text-ink">
              {o.baslik}. {metin ? `${metin.once} → ${metin.sonra}.` : ''} {o.neden}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-3 py-2.5">
              {sonuc ? (
                (() => {
                  const t = sonucMetni(sonuc, o.platform, metin?.sonra ?? null, iy.azOnce, dil);
                  return (
                    <span className="mr-auto inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                      <DurumNoktasi hal={t.ton === 'uyari' ? 'hata' : 'ok'} />
                      {t.metin}
                    </span>
                  );
                })()
              ) : o.durum === 'yoksayildi' ? (
                <span className={`${KISIT} mr-auto`}>{d.yoksayilmis}</span>
              ) : o.eylem === null ? (
                <span className={`${KISIT} mr-auto`}>{o.kisit ?? iy.kart.yalnizBilgi}</span>
              ) : !yazabilir ? (
                <span className={`${KISIT} mr-auto`}>{iy.kart.yetkisiz}</span>
              ) : vazgecildi ? (
                <span className={`${KISIT} mr-auto`}>{d.vazgecildi}</span>
              ) : (
                <>
                  <Dugme ton="hayalet" boyut="kucuk" onClick={() => onVazgec(o.anahtar)}>
                    {iy.onay.vazgec}
                  </Dugme>
                  <Dugme ton="koyu" boyut="kucuk" onClick={() => onUygula(o)}>
                    {iy.onay.onaylaUygula}
                  </Dugme>
                </>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** `metinBloklari`nın çizimi: yalnız React düğümleri, HTML enjeksiyonu yok. */
function BicimliMetin({ metin }: { metin: string }) {
  const satir = (parcalar: MetinParcasi[], k: number) => (
    <span key={k}>
      {parcalar.map((p, j) => (p.kalin ? <strong key={j}>{p.metin}</strong> : <span key={j}>{p.metin}</span>))}
    </span>
  );
  return (
    <>
      {metinBloklari(metin).map((b, n) =>
        b.tur === 'liste' ? (
          <ul key={n} className="mb-2 mt-1 list-disc pl-[18px]">
            {b.ogeler.map((o, k) => (
              <li key={k}>{satir(o, k)}</li>
            ))}
          </ul>
        ) : (
          <p key={n} className="m-0 mb-2 last:mb-0">
            {b.satirlar.map((s, k) => (
              <span key={k}>
                {k > 0 && <br />}
                {satir(s, k)}
              </span>
            ))}
          </p>
        ),
      )}
    </>
  );
}
