'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  MCP_VARSAYILAN_UST_SINIR_BIRIM,
  OKUMA_ANAHTARI_UST_SINIR,
  bicimKodu,
  type AnahtarYetkisi,
  type Dil,
  type McpOnayListesi,
  type OkumaAnahtariOlusturmaYaniti,
  type OkumaAnahtariOzeti,
  type OkumaAraciTanimi,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { mcpAdresi, baglantiOrnekleri } from './baglanti-ornekleri';
import { Kart } from '@/components/ui/kart';
import { Dugme } from '@/components/ui/dugme';
import { Alan, Girdi, Secim } from '@/components/ui/alan';
import { BolumluSecici } from '@/components/ui/sekmeler';
import { BosDurum, HataDurumu, Serit } from '@/components/ui/hal';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { AdHucresi, Tablo } from '@/components/ui/tablo';
import { Pencere } from '@/components/ui/pencere';
import { useDil, useSozluk } from '@/dil/saglayici';
import { hesabimSozlugu } from '@/dil/sozlukler/ayarlar-hesabim';
import { ONAY_DURUM_HALI, ozetSatirlari, sureSecenekleri, sureyiUyarla, ustSiniriAyristir } from './mcp-mantik';

/* Durum rozeti: yeşil YALNIZ etkin anahtarda (kılavuz: yeşil yalnız durum göstergesi). */
/* Etiketi sözlükten (`okuma.durum`). */
const DURUM_HALI: Record<OkumaAnahtariOzeti['durum'], DurumHali> = {
  etkin: 'ok',
  suresi_doldu: 'taslak',
  iptal: 'dur',
};

/**
 * YETKİ ROZETİ: reklam yönetimi KOYU hap, okuma sade. Durum rozeti
 * (`Rozet`) değil: yetki bir durum değil ve yeşil/kırmızı noktası anlam
 * karıştırırdı ("etkin" ile "yazabilir" aynı satırda iki rozet).
 */
function YetkiRozeti({ yetki, metin }: { yetki: AnahtarYetkisi; metin: string }) {
  return (
    <span
      className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-12 font-bold ${
        yetki === 'yazma' ? 'bg-ink text-surface' : 'border border-line-strong text-ink'
      }`}
    >
      {metin}
    </span>
  );
}

function tarih(iso: string | null, dil: Dil): string {
  return iso === null ? '-' : new Date(iso).toLocaleString(bicimKodu(dil), { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * ANAHTAR YÖNETİMİ — oluştur, bir kez göster, iptal et.
 *
 * DÜZ ANAHTAR YALNIZCA OLUŞTURMA YANITINDA: sunucu özetini saklıyor ve bir
 * daha üretemiyor. Bu yüzden yeni anahtar kutusu sayfa yenilenene kadar
 * duruyor ve bağlantı örnekleri anahtarla DOLU geliyor; kullanıcı anahtarı
 * kopyalayıp ayrıca bir komuta yapıştırmak zorunda kalmıyor.
 *
 * İPTAL ONAYI ORTAK `Pencere`DE (eskiden `window.confirm`): tarayıcının onay
 * kutusu panelin dilinde değildi ve iptalin neyi durduracağını söyleyen
 * cümle ancak oraya sığıyordu.
 */
export function OkumaApiPaneli({
  anahtarlar,
  araclar,
  yazmaAraclari,
  onaylar,
}: {
  anahtarlar: OkumaAnahtariOzeti[];
  araclar: OkumaAraciTanimi[];
  /** Okunamadıysa hata metni: bölüm kendi yerinde söyler, panelin geri kalanı çalışır. */
  yazmaAraclari: OkumaAraciTanimi[] | { hata: string };
  onaylar: McpOnayListesi | { hata: string };
}) {
  const router = useRouter();
  const { dil } = useDil();
  const d = useSozluk(hesabimSozlugu).okuma;
  const [ad, setAd] = useState('Claude');
  /*
   * VARSAYILAN OKUMA: reklam yönetimi bilinçli bir seçim olmalı. Ad alanını
   * doldurup "Oluştur"a basan kullanıcı yazabilen bir anahtar almamalı.
   */
  const [yetki, setYetki] = useState<AnahtarYetkisi>('okuma');
  const [sure, setSure] = useState<string>('90');
  /** Boş = sunucunun varsayılanı; yalnız yazma anahtarında gönderiliyor. */
  const [ustSinir, setUstSinir] = useState('');
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [yeni, setYeni] = useState<OkumaAnahtariOlusturmaYaniti | null>(null);
  const [kopyalanan, setKopyalanan] = useState<string | null>(null);
  const [iptalEdilecek, setIptalEdilecek] = useState<OkumaAnahtariOzeti | null>(null);
  /*
   * MCP ADRESİ TARAYICIDA KURULUYOR: `NEXT_PUBLIC_API_URL` göreli olabilir
   * ("/api") ve sunucuda render edilen sayfa kullanıcının gördüğü alan
   * adını bilmiyor. İlk çizimde API_URL'nin kendisi, sonra mutlak hâli.
   */
  const [mcpUrl, setMcpUrl] = useState(mcpAdresi(API_URL, null));
  useEffect(() => setMcpUrl(mcpAdresi(API_URL, window.location.origin)), []);

  const etkinSayisi = anahtarlar.filter((a) => a.durum === 'etkin').length;
  const sinir = ustSiniriAyristir(ustSinir);
  const sayi = (n: number) => n.toLocaleString(bicimKodu(dil));

  async function olustur() {
    setBekleyen('olustur');
    setHata(null);
    try {
      const r = await apiFetch<OkumaAnahtariOlusturmaYaniti>('/okuma-api/anahtarlar', {
        method: 'POST',
        body: JSON.stringify({
          ad: ad.trim(),
          gecerlilikGun: sure === 'suresiz' ? null : Number(sure),
          yetki,
          tekIslemUstSiniri: yetki === 'yazma' && 'deger' in sinir ? sinir.deger : null,
        }),
      });
      setYeni(r);
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : d.olusturulamadi);
    } finally {
      setBekleyen(null);
    }
  }

  async function iptalEt(a: OkumaAnahtariOzeti) {
    setBekleyen(a.id);
    setHata(null);
    try {
      await apiFetch<OkumaAnahtariOzeti>(`/okuma-api/anahtarlar/${a.id}`, { method: 'DELETE' });
      if (yeni?.ozet.id === a.id) setYeni(null);
      setIptalEdilecek(null);
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : d.iptalEdilemedi);
      setIptalEdilecek(null);
    } finally {
      setBekleyen(null);
    }
  }

  async function kopyala(anahtar: string, metin: string) {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalanan(anahtar);
      setTimeout(() => setKopyalanan((k) => (k === anahtar ? null : k)), 2000);
    } catch {
      // Pano izni yoksa kullanıcı metni elle seçebiliyor; hatayı söyle.
      setHata(d.panoyaKopyalanamadi);
    }
  }

  // Yer tutucunun öneki seçili yetkiden: yazma anahtarı için "adv_ro_" örneği kopyalanırsa yanlış anahtar aranır.
  const ornekler = baglantiOrnekleri(mcpUrl, yeni?.anahtar ?? null, dil, yeni?.ozet.yetki ?? yetki);
  const anahtarAdi = new Map(anahtarlar.map((a) => [a.id, a.ad]));
  const yazmaVar = yetki === 'yazma' || anahtarlar.some((a) => a.yetki === 'yazma' && a.durum === 'etkin');

  function yetkiSec(y: AnahtarYetkisi) {
    setYetki(y);
    setSure((s) => sureyiUyarla(y, s));
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      {hata && (
        <Serit ton="hata" baslik={d.islemYapilamadi}>
          {hata}
        </Serit>
      )}

      {yeni && (
        <Serit
          baslik={d.yeniAnahtar(yeni.ozet.ad)}
          eylemler={
            <Dugme ton="koyu" boyut="kucuk" onClick={() => kopyala('anahtar', yeni.anahtar)}>
              {kopyalanan === 'anahtar' ? d.kopyalandi : d.kopyala}
            </Dugme>
          }
        >
          {d.birKez}
          <code className="mt-2 block break-all rounded-alan border border-line bg-surface-muted px-3 py-2 font-mono text-12 text-ink">
            {yeni.anahtar}
          </code>
        </Serit>
      )}

      <Kart baslik={d.yeniAnahtarBaslik} baslikEki={d.etkinSayisi(etkinSayisi, OKUMA_ANAHTARI_UST_SINIR)}>
        <div className="grid grid-cols-1 gap-4">
          <p className="m-0 text-13 text-ink-muted">{d.yeniAciklama(OKUMA_ANAHTARI_UST_SINIR, etkinSayisi)}</p>
          <div className="grid min-w-0 grid-cols-1 gap-2">
            <p className="m-0 text-13 font-bold text-ink">{d.yetki}</p>
            <BolumluSecici
              etiket={d.yetki}
              secili={yetki}
              onSec={yetkiSec}
              secenekler={[
                { deger: 'okuma', etiket: d.yetkiAdi.okuma },
                { deger: 'yazma', etiket: d.yetkiAdi.yazma },
              ]}
            />
            {yetki === 'okuma' ? (
              <p className="m-0 text-13 text-ink-muted">{d.okumaNeYapar}</p>
            ) : (
              /* Kırmızı sol çizgi + siyah metin: kılavuzun uyarı dili (degrade, renkli zemin yok). */
              <div className="grid grid-cols-1 gap-1 rounded-r-alan border-l-[3px] border-l-danger bg-surface-muted px-3.5 py-3 text-13 text-ink">
                <p className="m-0 font-bold">{d.yazmaNeYapar}</p>
                <ul className="m-0 grid list-disc grid-cols-1 gap-0.5 pl-4">
                  {d.yazmaMaddeleri.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {yetki === 'yazma' && (
            <div className="grid grid-cols-1 sm:max-w-sm">
              <Alan
                etiket={d.ustSinir}
                ipucu={d.ustSinirIpucu(sayi(MCP_VARSAYILAN_UST_SINIR_BIRIM))}
                hata={'hata' in sinir ? d.ustSinirHata[sinir.hata] : undefined}
              >
                {(id, aciklamaId, hatali) => (
                  <Girdi
                    id={id}
                    aria-describedby={aciklamaId}
                    hatali={hatali}
                    inputMode="numeric"
                    value={ustSinir}
                    onChange={(e) => setUstSinir(e.target.value)}
                    placeholder={sayi(MCP_VARSAYILAN_UST_SINIR_BIRIM)}
                  />
                )}
              </Alan>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <Alan etiket={d.ad}>
              <Girdi value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} placeholder={d.adYer} />
            </Alan>
            <Alan etiket={d.gecerlilik}>
              <Secim value={sure} onChange={(e) => setSure(e.target.value)}>
                {sureSecenekleri(yetki).map((g) => (
                  <option key={g} value={String(g)}>
                    {g === 'suresiz' ? d.suresiz : d.gun(g)}
                  </option>
                ))}
              </Secim>
            </Alan>
            <Dugme
              ton={yetki === 'yazma' ? 'birincil' : 'koyu'}
              onClick={olustur}
              bekliyor={bekleyen === 'olustur'}
              disabled={bekleyen !== null || ad.trim() === '' || etkinSayisi >= OKUMA_ANAHTARI_UST_SINIR || (yetki === 'yazma' && 'hata' in sinir)}
            >
              {d.olustur}
            </Dugme>
          </div>
          {/* Not ızgaranın DIŞINDA: süre sütununun altında durunca Ad alanını aşağı itip hizayı bozuyordu. */}
          {yetki === 'yazma' && <p className="m-0 text-12 text-ink-muted">{d.yazmaSureNotu}</p>}
        </div>
      </Kart>

      <Kart
        dolgu={false}
        baslik={d.anahtarlar}
        baslikEki={d.anahtarSayisi(anahtarlar.length)}
      >
        <Tablo
          etiket={d.tabloEtiketi}
          satirlar={anahtarlar}
          satirAnahtari={(a) => a.id}
          sutunlar={[
            {
              anahtar: 'ad',
              baslik: d.anahtar,
              hucre: (a) => <AdHucresi ad={a.ad} alt={<span className="font-mono">{a.gorunenOnek}…</span>} />,
            },
            {
              anahtar: 'yetki',
              baslik: d.yetki,
              hucre: (a) => (
                <span className="grid justify-items-start gap-1">
                  <YetkiRozeti yetki={a.yetki} metin={d.yetkiAdi[a.yetki]} />
                  {a.tekIslemUstSiniriMicros && (
                    <span className="text-12 text-ink-muted">
                      {d.ustSinirSatiri(sayi(Number(BigInt(a.tekIslemUstSiniriMicros) / 1_000_000n)))}
                    </span>
                  )}
                </span>
              ),
            },
            {
              anahtar: 'durum',
              baslik: d.durumBaslik,
              hucre: (a) => <Rozet hal={DURUM_HALI[a.durum]}>{d.durum[a.durum]}</Rozet>,
            },
            {
              anahtar: 'bitis',
              baslik: d.bitis,
              ikincil: true,
              hucre: (a) => <span className="text-13">{a.bitis === null ? d.suresiz : tarih(a.bitis, dil)}</span>,
            },
            {
              anahtar: 'son',
              baslik: d.sonKullanim,
              ikincil: true,
              hucre: (a) => (
                <span className="text-13">
                  {a.sonKullanim === null ? d.hicKullanilmadi : tarih(a.sonKullanim, dil)}
                  {a.sonKullanimIp && <span className="block text-12 text-ink-muted">{a.sonKullanimIp}</span>}
                </span>
              ),
            },
            {
              anahtar: 'eylem',
              baslik: <span className="sr-only">{d.eylemler}</span>,
              sayi: true,
              hucre: (a) =>
                a.durum === 'etkin' ? (
                  <Dugme
                    ton="tehlike"
                    boyut="kucuk"
                    disabled={bekleyen !== null}
                    onClick={() => setIptalEdilecek(a)}
                  >
                    {d.iptalEt}
                  </Dugme>
                ) : null,
            },
          ]}
          bos={<BosDurum baslik={d.bosBaslik} neden={d.bosNeden} />}
          sayfalama={{ bas: anahtarlar.length === 0 ? 0 : 1, son: anahtarlar.length, toplam: anahtarlar.length }}
        />
      </Kart>

      <Kart dolgu={false} baslik={d.islemler} baslikEki={'hata' in onaylar ? undefined : d.gosterilen(onaylar.satirlar.length, onaylar.toplam)}>
        <p className="m-0 px-5 pt-1 text-13 text-ink-muted">{d.islemlerAciklama}</p>
        {'hata' in onaylar ? (
          <div className="p-4">
            <HataDurumu baslik={d.islemlerOkunamadi} mesaj={onaylar.hata} />
          </div>
        ) : (
          <Tablo
            etiket={d.islemler}
            satirlar={onaylar.satirlar}
            satirAnahtari={(o) => o.id}
            sutunlar={[
              {
                anahtar: 'zaman',
                baslik: d.zaman,
                hucre: (o) => <span className="whitespace-nowrap text-13">{tarih(o.olusturulma, dil)}</span>,
              },
              { anahtar: 'islem', baslik: d.islem, hucre: (o) => <span className="text-13 font-bold">{d.islemAdi[o.islem]}</span> },
              {
                anahtar: 'ozet',
                baslik: d.neYapildi,
                hucre: (o) => {
                  const z = ozetSatirlari(o.ozet);
                  // En az genişlik: telefonda sütun kelime kelime kırılıyordu; tablo daralmak yerine kendi kabında kayıyor.
                  return (
                    <span className="block min-w-[15rem]">
                      <AdHucresi ad={<span title={z.tam}>{z.ana}</span>} alt={z.alt} />
                    </span>
                  );
                },
              },
              {
                anahtar: 'durum',
                baslik: d.durumBaslik,
                hucre: (o) => (
                  <span className="grid justify-items-start gap-1">
                    <Rozet hal={ONAY_DURUM_HALI[o.durum]}>{d.onayDurumu[o.durum]}</Rozet>
                    {o.hata && <span className="block max-w-[22rem] text-12 text-ink-muted [overflow-wrap:anywhere]">{o.hata}</span>}
                  </span>
                ),
              },
              {
                anahtar: 'anahtar',
                baslik: d.anahtar,
                ikincil: true,
                hucre: (o) => <span className="text-13">{anahtarAdi.get(o.anahtarId) ?? '-'}</span>,
              },
            ]}
            bos={<BosDurum baslik={d.islemYokBaslik} neden={d.islemYokNeden} />}
            sayfalama={{ bas: onaylar.satirlar.length === 0 ? 0 : 1, son: onaylar.satirlar.length, toplam: onaylar.toplam }}
          />
        )}
      </Kart>

      <Kart baslik={d.baglan}>
        <div className="grid grid-cols-1 gap-4">
          <p className="m-0 text-13 text-ink-muted">
            {d.mcpAdresi}
            <code className="font-mono [overflow-wrap:anywhere]">{mcpUrl}</code>.{' '}
            {yeni ? d.ornekDolu : d.ornekBos}
          </p>
          {ornekler.map((o) => (
            <div key={o.baslik} className="grid min-w-0 grid-cols-1 gap-1">
              <div className="flex items-center justify-between gap-2">
                <p className="m-0 text-14 font-bold text-ink">{o.baslik}</p>
                <Dugme ton="ikincil" boyut="kucuk" onClick={() => kopyala(o.baslik, o.metin)}>
                  {kopyalanan === o.baslik ? d.kopyalandi : d.kopyala}
                </Dugme>
              </div>
              <p className="m-0 text-12 text-ink-muted">{o.aciklama}</p>
              <pre className="m-0 overflow-x-auto rounded-alan border border-line bg-surface-muted px-3 py-2 font-mono text-12">
                {o.metin}
              </pre>
            </div>
          ))}
          {yazmaVar && (
            <>
              <Serit baslik={d.onaylaUyariBaslik}>{d.onaylaUyari}</Serit>
              <div className="grid min-w-0 grid-cols-1 gap-1">
                <p className="m-0 text-14 font-bold text-ink">{d.onayOrnegiBaslik}</p>
                <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-alan bg-ink px-4 py-3 font-mono text-12 text-surface [overflow-wrap:anywhere]">
                  {d.onayOrnegi}
                </pre>
              </div>
            </>
          )}
        </div>
      </Kart>

      <Kart baslik={d.araclar} baslikEki={d.aracSayisi(araclar.length + ('hata' in yazmaAraclari ? 0 : yazmaAraclari.length))}>
        <div className="grid grid-cols-1 gap-3">
          <p className="m-0 text-13 text-ink-muted">{d.araclarAciklama}</p>
          <AracListesi araclar={araclar} />
          <p className="m-0 mt-2 text-14 font-bold text-ink">{d.yazmaAraclariBaslik}</p>
          <p className="m-0 text-13 text-ink-muted">{d.yazmaAraclariAciklama}</p>
          {'hata' in yazmaAraclari ? (
            <HataDurumu baslik={d.yazmaAraclariOkunamadi} mesaj={yazmaAraclari.hata} />
          ) : (
            <AracListesi araclar={yazmaAraclari} />
          )}
        </div>
      </Kart>

      <Pencere
        acik={iptalEdilecek !== null}
        onKapat={() => setIptalEdilecek(null)}
        baslik={d.iptalBaslik}
        genislik="dar"
        altEylemler={
          <>
            <Dugme ton="ikincil" onClick={() => setIptalEdilecek(null)}>
              {d.vazgec}
            </Dugme>
            <Dugme
              ton="tehlike"
              bekliyor={iptalEdilecek !== null && bekleyen === iptalEdilecek.id}
              onClick={() => iptalEdilecek && void iptalEt(iptalEdilecek)}
            >
              {d.iptalEt}
            </Dugme>
          </>
        }
      >
        {iptalEdilecek && (
          <p className="m-0 text-14 text-ink">
            <strong>{iptalEdilecek.ad}</strong>
            {d.iptalSoru}
          </p>
        )}
      </Pencere>
    </div>
  );
}

function AracListesi({ araclar }: { araclar: OkumaAraciTanimi[] }) {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 text-14">
      {araclar.map((a) => (
        <li key={a.ad} className="min-w-0">
          <code className="font-mono text-12">{a.ad}</code> <span className="font-bold">{a.baslik}</span>
          <p className="m-0 text-12 text-ink-muted">{a.aciklama}</p>
        </li>
      ))}
    </ul>
  );
}
