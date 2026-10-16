'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  OZET_KITLESI_ADI,
  YORUM_DURUMU_ADI,
  isoHaftaAraligi,
  sec,
  type HaftalikOzetOnizleme,
  type HaftalikOzetPlani,
  type OzetKitlesi,
} from '@advetics/shared';
import { AliciListesiAlani } from '@/components/alici-listesi-alani';
import { markaMerkeziAdresi } from '@/lib/panel-adresleri';
import { Halka } from '@/components/yukleniyor';
import { apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { BosDurum, HataDurumu, Yukleniyor } from '@/components/ui/hal';
import { DurumNoktasi } from '@/components/ui/rozet';
import { BolumluSecici } from '@/components/ui/sekmeler';
import { useDil } from '@/dil/saglayici';
import { raporlarSozlugu } from '@/dil/sozlukler/raporlar';
import {
  aralikMetni,
  cerceveIcerigi,
  haftaSec,
  haftaSecenekleri,
  kanalDurumMetni,
  musteriGonderimMetni,
  onizlemeYolu,
  ozetHali,
  zamanMetni,
} from '@/lib/haftalik-ozet';

/**
 * ═══ RAPORLAR › HAFTALIK ÖZET (Paket B, MIMARI § 7, taslak.html) ═══
 *
 * MAİL PANELDE İKİNCİ KEZ YAZILMIYOR: API'nin ürettiği HTML yalıtılmış bir
 * çerçevede (`sandbox`, betik YOK) gösteriliyor. Ekranda ayrı bir şablon,
 * gönderilen ile görülenin zamanla ayrışması demekti.
 *
 * DÖRT HÂL AYRI: yükleniyor, hata (sunucunun cümlesi), boş hafta ("harcama
 * yok, gönderilmeyecek") ve dolu. Ajans görünümü yalnız `rule.read` ile
 * (sunucu da ayrıca reddediyor); müşteri hesabı kendi özetini görür.
 */
export function HaftalikOzetSekmesi({
  clientId,
  haftaParam,
  ajansGorur,
  planYetkisi,
}: {
  clientId: string;
  haftaParam: string | undefined;
  ajansGorur: boolean;
  planYetkisi: boolean;
}) {
  const { dil } = useDil();
  const d = sec(raporlarSozlugu, dil).ozet;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Seçenekler sayfa açılışında bir kez: gece yarısı açık kalan sekme
  // seçiciyi kendiliğinden kaydırmasın.
  const secenekler = useMemo(() => haftaSecenekleri(new Date(), undefined, dil), [dil]);
  const { kod: hafta, duzeltildi } = haftaSec(haftaParam, secenekler);
  const [kitle, setKitle] = useState<OzetKitlesi>(ajansGorur ? 'ajans' : 'musteri');
  const [veri, setVeri] = useState<HaftalikOzetOnizleme | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [deneme, setDeneme] = useState(0);

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    setHata(null);
    apiFetch<HaftalikOzetOnizleme>(onizlemeYolu(clientId, kitle, hafta))
      .then((v) => {
        if (!iptal) setVeri(v);
      })
      .catch((e: unknown) => {
        // Hata YUTULMUYOR: sunucunun cümlesi ekranda (boş özetle karışmasın).
        if (!iptal) setHata(e instanceof Error ? e.message : d.baglantiYok);
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, kitle, hafta, deneme]);

  function haftaDegistir(kod: string): void {
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    p.set('hafta', kod);
    router.replace(`${pathname}?${p.toString()}`);
  }

  const hal = ozetHali({ yukleniyor, hata, veri });
  const aralik = isoHaftaAraligi(hafta)!;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-13 text-ink-muted">{d.aciklama}</p>
        <label className="flex items-center gap-2 text-13">
          <span className="font-semibold text-ink-muted">{d.hafta}</span>
          <select
            value={hafta}
            onChange={(e) => haftaDegistir(e.target.value)}
            className="h-8 rounded-full border border-line-strong bg-surface px-3 text-13 font-semibold text-ink"
          >
            {secenekler.map((s) => (
              <option key={s.kod} value={s.kod}>
                {s.etiket}
              </option>
            ))}
          </select>
        </label>
      </div>
      {duzeltildi && (
        <p role="status" className="m-0 text-12 text-ink-muted">
          {d.duzeltildi(aralikMetni(aralik, dil))}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 rounded-kart border border-line bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            {ajansGorur ? (
              <BolumluSecici
                etiket={d.gorunum}
                secili={kitle}
                onSec={setKitle}
                secenekler={(['musteri', 'ajans'] as const).map((k) => ({ deger: k, etiket: OZET_KITLESI_ADI[k] }))}
              />
            ) : (
              <span className="font-baslik text-15 font-bold text-ink">{OZET_KITLESI_ADI.musteri}</span>
            )}
            {veri && hal !== 'hata' && (
              <small className="ml-auto text-12 text-ink-muted">
                {d.uretildi(zamanMetni(veri.ozet.uretildi, dil))}
              </small>
            )}
            {yukleniyor && veri && <Halka className="h-3.5 w-3.5" />}
          </div>

          {hal === 'yukleniyor' && (
            <div className="p-4">
              <Yukleniyor satir={4} etiket={d.hazirlaniyor} />
            </div>
          )}

          {hal === 'hata' && (
            <div className="p-4">
              <HataDurumu baslik={d.hazirlanamadi} mesaj={hata ?? sec(raporlarSozlugu, dil).sayfa.sunucuSebepYok} onTekrar={() => setDeneme((n) => n + 1)} />
            </div>
          )}

          {hal === 'bos' && (
            <div className="p-4">
              <BosDurum
                baslik={d.bosBaslik}
                neden={d.bosNeden(aralikMetni(aralik, dil))}
              />
            </div>
          )}

          {hal === 'dolu' && veri && <MailOnizleme veri={veri} />}
        </section>

        <div className="flex min-w-0 flex-col gap-4">
          {planYetkisi && <MusteriPlaniKarti clientId={clientId} gonderim={veri?.gonderim.musteri ?? null} />}
          {ajansGorur && (
            <section className="rounded-kart border border-line bg-surface">
              <div className="border-b border-line px-5 py-4">
                <h3 className="m-0 font-baslik text-15 font-bold text-ink">{d.ajansKanallari}</h3>
              </div>
              <div className="grid gap-2 px-5 py-4 text-13">
                {kitle !== 'ajans' ? (
                  <p className="text-ink-muted">{d.kanalDurumuAjansta}</p>
                ) : veri && veri.gonderim.kanallar.length > 0 ? (
                  <ul className="space-y-1.5">
                    {veri.gonderim.kanallar.map((k) => (
                      <li key={k.kanalId} className="flex items-center gap-2">
                        <Nokta durum={k.durum === 'gonderildi' ? 'iyi' : k.durum === 'vazgecildi' || k.durum === 'basarisiz' ? 'kotu' : 'notr'} />
                        <span className="font-medium text-ink">{k.ad}</span>
                        <span className="text-ink-muted">· {kanalDurumMetni(k.durum, dil)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-muted">{d.kanalYok}</p>
                )}
                <Link href={markaMerkeziAdresi('workspace', clientId, 'bildirimler')} className="inline-block text-xs font-semibold text-ink underline">
                  {d.markaMerkezi}
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Nokta({ durum }: { durum: 'iyi' | 'kotu' | 'notr' }) {
  // Yeşil YALNIZ durum noktası (kılavuz, ortak `DurumNoktasi`); kötü kırmızı, nötr gri.
  return <DurumNoktasi hal={durum === 'iyi' ? 'ok' : durum === 'kotu' ? 'hata' : 'taslak'} />;
}

function MailOnizleme({ veri }: { veri: HaftalikOzetOnizleme }) {
  const { dil } = useDil();
  const d = sec(raporlarSozlugu, dil).ozet;
  const cerceve = useRef<HTMLIFrameElement>(null);
  const [yukseklik, setYukseklik] = useState(900);
  const ajans = veri.kitle === 'ajans';

  /*
   * ÇERÇEVE İÇERİĞİ KADAR UZUN. `allow-same-origin` yalnız yüksekliği
   * ölçmek için; betik izni YOK, yani mail HTML'i hiçbir kod çalıştıramaz.
   * Ölçülemezse sabit yükseklik ve çerçevenin kendi kaydırması kalır.
   */
  function olc(): void {
    try {
      const h = cerceve.current?.contentDocument?.body?.scrollHeight;
      if (h && h > 0) setYukseklik(h + 8);
    } catch {
      /* ölçülemedi: sabit yükseklik kalıyor */
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-0.5 border-b border-line px-4 py-3 text-xs text-ink-muted">
        <span>
          {d.konu}
          <b className="text-ink">{veri.eposta.konu}</b>
        </span>
        {!ajans && (
          <span>
            {d.kime}
            {veri.gonderim.musteri.alicilar.length > 0 ? veri.gonderim.musteri.alicilar.join(', ') : d.alicisiz}
          </span>
        )}
        <span>{musteriGonderimMetni(veri.gonderim.musteri, dil)}</span>
      </div>
      <div className="bg-surface-sunken p-2 sm:p-4">
        <iframe
          ref={cerceve}
          title={d.cerceveBaslik(OZET_KITLESI_ADI[veri.kitle])}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          srcDoc={cerceveIcerigi(veri.eposta.html)}
          onLoad={olc}
          className="block w-full rounded-lg border-0 bg-white"
          style={{ height: yukseklik }}
        />
      </div>
      {ajans && (
        <div className="space-y-3 border-t border-line px-4 py-4">
          {veri.kisa && (
            <div>
              <h3 className="m-0 mb-1.5 text-13 font-semibold text-ink">{d.kisaSurum}</h3>
              <div className="rounded-alan border border-line px-3 py-2.5 text-13">
                <p className="font-semibold text-ink">{veri.kisa.baslik}</p>
                <ul className="mt-1 space-y-0.5 text-ink">
                  {veri.kisa.satirlar.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <p className="text-xs text-ink-muted">
            {d.yorumDurumu}
            {YORUM_DURUMU_ADI[veri.ozet.yorum.durum]}
            {veri.ozet.yorum.not ? ` (${veri.ozet.yorum.not})` : ''}
          </p>
          {veri.ozet.hatalar.length > 0 && (
            <ul role="alert" className="space-y-0.5 text-xs text-danger-strong">
              {veri.ozet.hatalar.map((h, i) => (
                <li key={i}>{h.mesaj}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const SAATLER = Array.from({ length: 24 }, (_, i) => i);

/**
 * Müşteriye giden özet planı: aç/kapat, saat, alıcılar, "Kendime gönder".
 * VARSAYILAN KAPALI (MIMARI Ç-B2): mail müşteriye danışmanın adresinden
 * gidiyor ve kimse açmadan başlamamalı. Açmak sunucuda SMTP doğrulamasını
 * istiyor; reddin cümlesi burada görünüyor (giriş anında doğrulama).
 */
function MusteriPlaniKarti({
  clientId,
  gonderim,
}: {
  clientId: string;
  gonderim: HaftalikOzetOnizleme['gonderim']['musteri'] | null;
}) {
  const { dil } = useDil();
  const d = sec(raporlarSozlugu, dil).ozet.plan;
  const [plan, setPlan] = useState<HaftalikOzetPlani | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [saat, setSaat] = useState(9);
  const [alicilar, setAlicilar] = useState<string[]>([]);
  const [denemeSonucu, setDenemeSonucu] = useState<{ tur: 'tamam' | 'hata'; metin: string } | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);

  useEffect(() => {
    let iptal = false;
    setHata(null);
    apiFetch<HaftalikOzetPlani>(`/haftalik-ozet/plan?clientId=${encodeURIComponent(clientId)}`)
      .then((p) => {
        if (iptal) return;
        setPlan(p);
        setSaat(p.saat);
        setAlicilar(p.toEmails);
      })
      .catch((e: unknown) => {
        if (!iptal) setHata(e instanceof Error ? e.message : d.planOkunamadi);
      });
    return () => {
      iptal = true;
    };
  }, [clientId]);

  async function kaydet(etkin: boolean, s = saat, a = alicilar): Promise<void> {
    setKaydediliyor(true);
    setHata(null);
    try {
      const p = await apiFetch<HaftalikOzetPlani>('/haftalik-ozet/plan', {
        method: 'PUT',
        body: JSON.stringify({ clientId, etkin, saat: s, toEmails: a }),
      });
      setPlan(p);
    } catch (e) {
      setHata(e instanceof Error ? e.message : d.kaydedilemedi);
    } finally {
      setKaydediliyor(false);
    }
  }

  async function kendimeGonder(): Promise<void> {
    setGonderiliyor(true);
    setDenemeSonucu(null);
    try {
      const r = await apiFetch<{ to: string[]; reddedilen: Array<{ adres: string; sebep: string }> }>('/haftalik-ozet/deneme', {
        method: 'POST',
        body: JSON.stringify({ clientId, kitle: 'musteri' }),
      });
      setDenemeSonucu(
        r.reddedilen.length > 0
          ? { tur: 'hata', metin: d.reddedildi(r.reddedilen.map((x) => `${x.adres} (${x.sebep})`).join(', ')) }
          : { tur: 'tamam', metin: d.gonderildi(r.to.join(', ')) },
      );
    } catch (e) {
      setDenemeSonucu({ tur: 'hata', metin: e instanceof Error ? e.message : d.gonderilemedi });
    } finally {
      setGonderiliyor(false);
    }
  }

  const etkin = plan?.etkin ?? false;
  return (
    <section className="rounded-kart border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <h3 className="m-0 font-baslik text-15 font-bold text-ink">{sec(raporlarSozlugu, dil).ozet.musteriOzeti}</h3>
        <button
          type="button"
          role="switch"
          aria-checked={etkin}
          aria-label={sec(raporlarSozlugu, dil).ozet.musteriOzeti}
          disabled={plan === null || kaydediliyor}
          onClick={() => void kaydet(!etkin)}
          className={`relative ml-auto h-5 w-9 shrink-0 rounded-full transition-colors motion-reduce:transition-none disabled:opacity-50 ${
            etkin ? 'bg-ink' : 'bg-line-strong'
          }`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-surface transition-transform motion-reduce:transition-none ${
              etkin ? 'translate-x-4' : ''
            }`}
          />
        </button>
      </div>
      <div className="flex items-center gap-2 border-b border-line px-5 py-2.5 text-12">
        <Nokta durum={etkin ? 'iyi' : 'notr'} />
        <span className="text-ink-muted">
          {plan === null && !hata ? d.okunuyor : etkin ? d.acik : d.kapali}
        </span>
      </div>
      {hata && (
        <p role="alert" className="m-0 border-b border-line px-5 py-2.5 text-12 text-danger-strong">
          {hata}
        </p>
      )}
      {plan && (
        <div className="grid gap-3 px-5 py-4 text-13">
          <label className="grid gap-1.5">
            <span className="text-13 font-semibold text-ink">{d.saat}</span>
            <select
              value={saat}
              disabled={kaydediliyor}
              onChange={(e) => {
                const s = Number(e.target.value);
                setSaat(s);
                if (plan.kurulu) void kaydet(etkin, s);
              }}
              className="h-10 w-full rounded-alan border border-line-strong bg-surface px-3 text-14 text-ink"
            >
              {SAATLER.map((s) => (
                <option key={s} value={s}>
                  {String(s).padStart(2, '0')}:00
                </option>
              ))}
            </select>
          </label>
          <AliciListesiAlani
            degerler={alicilar}
            onChange={(a) => {
              setAlicilar(a);
              if (plan.kurulu) void kaydet(etkin, saat, a);
            }}
            etiket={d.alicilar}
            yardim={d.alicilarYardim}
            bosVarsayilan={plan.cozulenAliciListesi}
          />
          {plan.cozulenAliciListesi.length === 0 && (
            <p role="alert" className="m-0 text-12 text-danger-strong">
              {d.aliciYok}
            </p>
          )}
          <Satir etiket={d.gonderen} deger={plan.gonderen ? [plan.gonderen.ad, plan.gonderen.eposta].filter(Boolean).join(' · ') : d.gonderenYok} />
          {plan.senderReady === false && (
            <p role="alert" className="m-0 text-12 text-danger-strong">{d.dogrulanmadi}</p>
          )}
          <Satir
            etiket={d.sonGonderim}
            deger={plan.son ? `${zamanMetni(plan.son.zaman, dil)} · ${plan.son.durum === 'sent' ? d.gonderildiDurum : plan.son.durum === 'skipped' ? d.atlandiDurum : d.basarisizDurum}` : d.henuzYok}
          />
          {plan.son?.hata && <p className="m-0 text-12 text-danger-strong">{plan.son.hata}</p>}
          <Satir etiket={d.siradaki} deger={plan.siradaki ? zamanMetni(plan.siradaki, dil) : etkin ? '-' : d.kapaliKisa} />
          {gonderim && <p className="m-0 text-12 text-ink-muted">{d.buHafta(musteriGonderimMetni(gonderim, dil))}</p>}
          <Dugme ton="ikincil" boyut="kucuk" onClick={() => void kendimeGonder()} bekliyor={gonderiliyor} className="justify-self-start">
            {d.kendimeGonder}
          </Dugme>
          {denemeSonucu && (
            <p role={denemeSonucu.tur === 'hata' ? 'alert' : 'status'} className={`m-0 text-12 ${denemeSonucu.tur === 'hata' ? 'text-danger-strong' : 'text-ink-muted'}`}>
              {denemeSonucu.metin}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function Satir({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-13">
      <span className="text-12 text-ink-muted">{etiket}</span>
      <span className="text-right text-ink">{deger}</span>
    </div>
  );
}
