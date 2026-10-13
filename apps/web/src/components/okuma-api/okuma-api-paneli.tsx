'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  OKUMA_ANAHTARI_SURELERI,
  OKUMA_ANAHTARI_UST_SINIR,
  type OkumaAnahtariOlusturmaYaniti,
  type OkumaAnahtariOzeti,
  type OkumaAraciTanimi,
} from '@advetics/shared';
import { API_URL, ApiRequestError, apiFetch } from '@/lib/api';
import { mcpAdresi, baglantiOrnekleri } from './baglanti-ornekleri';
import { Kart } from '@/components/ui/kart';
import { Dugme } from '@/components/ui/dugme';
import { Alan, Girdi, Secim } from '@/components/ui/alan';
import { BosDurum, Serit } from '@/components/ui/hal';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { AdHucresi, Tablo } from '@/components/ui/tablo';
import { Pencere } from '@/components/ui/pencere';

/* Durum rozeti: yeşil YALNIZ etkin anahtarda (kılavuz: yeşil yalnız durum göstergesi). */
const DURUM_ETIKETI: Record<OkumaAnahtariOzeti['durum'], { ad: string; hal: DurumHali }> = {
  etkin: { ad: 'Etkin', hal: 'ok' },
  suresi_doldu: { ad: 'Süresi doldu', hal: 'taslak' },
  iptal: { ad: 'İptal', hal: 'dur' },
};

function tarih(iso: string | null): string {
  return iso === null ? '-' : new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
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
}: {
  anahtarlar: OkumaAnahtariOzeti[];
  araclar: OkumaAraciTanimi[];
}) {
  const router = useRouter();
  const [ad, setAd] = useState('Claude');
  const [sure, setSure] = useState<string>('90');
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

  async function olustur() {
    setBekleyen('olustur');
    setHata(null);
    try {
      const r = await apiFetch<OkumaAnahtariOlusturmaYaniti>('/okuma-api/anahtarlar', {
        method: 'POST',
        body: JSON.stringify({ ad: ad.trim(), gecerlilikGun: sure === 'suresiz' ? null : Number(sure) }),
      });
      setYeni(r);
      router.refresh();
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : 'Anahtar oluşturulamadı.');
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
      setHata(err instanceof ApiRequestError ? err.message : 'İptal edilemedi.');
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
      setHata('Panoya kopyalanamadı. Metni seçip elle kopyala.');
    }
  }

  const ornekler = baglantiOrnekleri(mcpUrl, yeni?.anahtar ?? null);

  return (
    <div className="grid gap-5">
      {hata && (
        <Serit ton="hata" baslik="İşlem yapılamadı">
          {hata}
        </Serit>
      )}

      {yeni && (
        <Serit
          baslik={`Yeni anahtar: ${yeni.ozet.ad}`}
          eylemler={
            <Dugme ton="koyu" boyut="kucuk" onClick={() => kopyala('anahtar', yeni.anahtar)}>
              {kopyalanan === 'anahtar' ? 'Kopyalandı' : 'Kopyala'}
            </Dugme>
          }
        >
          Bu anahtar yalnızca şimdi görünüyor. Sayfadan çıkınca bir daha gösterilemez; kaybedersen iptal edip
          yenisini oluştur.
          <code className="mt-2 block break-all rounded-alan border border-line bg-surface-muted px-3 py-2 font-mono text-12 text-ink">
            {yeni.anahtar}
          </code>
        </Serit>
      )}

      <Kart
        dolgu={false}
        baslik="Anahtarlar"
        baslikEki={`${etkinSayisi} etkin · en çok ${OKUMA_ANAHTARI_UST_SINIR}`}
      >
        <Tablo
          etiket="Okuma API anahtarları"
          satirlar={anahtarlar}
          satirAnahtari={(a) => a.id}
          sutunlar={[
            {
              anahtar: 'ad',
              baslik: 'Anahtar',
              hucre: (a) => <AdHucresi ad={a.ad} alt={<span className="font-mono">{a.gorunenOnek}…</span>} />,
            },
            {
              anahtar: 'durum',
              baslik: 'Durum',
              hucre: (a) => <Rozet hal={DURUM_ETIKETI[a.durum].hal}>{DURUM_ETIKETI[a.durum].ad}</Rozet>,
            },
            {
              anahtar: 'bitis',
              baslik: 'Bitiş',
              ikincil: true,
              hucre: (a) => <span className="text-13">{a.bitis === null ? 'Süresiz' : tarih(a.bitis)}</span>,
            },
            {
              anahtar: 'son',
              baslik: 'Son kullanım',
              ikincil: true,
              hucre: (a) => (
                <span className="text-13">
                  {a.sonKullanim === null ? 'Hiç kullanılmadı' : tarih(a.sonKullanim)}
                  {a.sonKullanimIp && <span className="block text-12 text-ink-muted">{a.sonKullanimIp}</span>}
                </span>
              ),
            },
            {
              anahtar: 'eylem',
              baslik: <span className="sr-only">Eylemler</span>,
              sayi: true,
              hucre: (a) =>
                a.durum === 'etkin' ? (
                  <Dugme
                    ton="tehlike"
                    boyut="kucuk"
                    disabled={bekleyen !== null}
                    onClick={() => setIptalEdilecek(a)}
                  >
                    İptal et
                  </Dugme>
                ) : null,
            },
          ]}
          bos={<BosDurum baslik="Henüz anahtar yok" neden="Aşağıdan bir tane oluştur; her araç için ayrı anahtar önerilir." />}
          sayfalama={{ bas: anahtarlar.length === 0 ? 0 : 1, son: anahtarlar.length, toplam: anahtarlar.length }}
        />
      </Kart>

      <Kart baslik="Yeni anahtar">
        <div className="grid gap-4">
          <p className="m-0 text-13 text-ink-muted">
            Her araç için ayrı anahtar oluştur; biri sızarsa yalnızca onu iptal edersin. En çok{' '}
            {OKUMA_ANAHTARI_UST_SINIR} etkin anahtar olabilir ({etkinSayisi} etkin).
          </p>
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
            <Alan etiket="Ad">
              <Girdi value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} placeholder="Örn. Claude Desktop, dizüstü" />
            </Alan>
            <Alan etiket="Geçerlilik">
              <Secim value={sure} onChange={(e) => setSure(e.target.value)}>
                {OKUMA_ANAHTARI_SURELERI.map((g) => (
                  <option key={g} value={String(g)}>
                    {g} gün
                  </option>
                ))}
                <option value="suresiz">Süresiz</option>
              </Secim>
            </Alan>
            <Dugme
              ton="koyu"
              onClick={olustur}
              bekliyor={bekleyen === 'olustur'}
              disabled={bekleyen !== null || ad.trim() === '' || etkinSayisi >= OKUMA_ANAHTARI_UST_SINIR}
            >
              Anahtar oluştur
            </Dugme>
          </div>
        </div>
      </Kart>

      <Kart baslik="Bağlan">
        <div className="grid gap-4">
          <p className="m-0 text-13 text-ink-muted">
            MCP adresi: <code className="font-mono">{mcpUrl}</code>.{' '}
            {yeni ? 'Örnekler yeni anahtarla dolduruldu.' : 'Anahtar oluşturunca örnekler anahtarla dolar.'}
          </p>
          {ornekler.map((o) => (
            <div key={o.baslik} className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <p className="m-0 text-14 font-bold text-ink">{o.baslik}</p>
                <Dugme ton="ikincil" boyut="kucuk" onClick={() => kopyala(o.baslik, o.metin)}>
                  {kopyalanan === o.baslik ? 'Kopyalandı' : 'Kopyala'}
                </Dugme>
              </div>
              <p className="m-0 text-12 text-ink-muted">{o.aciklama}</p>
              <pre className="m-0 overflow-x-auto rounded-alan border border-line bg-surface-muted px-3 py-2 font-mono text-12">
                {o.metin}
              </pre>
            </div>
          ))}
        </div>
      </Kart>

      <Kart baslik="Araçlar" baslikEki={`${araclar.length} araç`}>
        <div className="grid gap-3">
          <p className="m-0 text-13 text-ink-muted">Yapay zekânın kullanabildiği okuma araçları. Hiçbiri veri değiştirmez.</p>
          <ul className="m-0 grid list-none gap-2 p-0 text-14">
            {araclar.map((a) => (
              <li key={a.ad}>
                <code className="font-mono text-12">{a.ad}</code> <span className="font-bold">{a.baslik}</span>
                <p className="m-0 text-12 text-ink-muted">{a.aciklama}</p>
              </li>
            ))}
          </ul>
        </div>
      </Kart>

      <Pencere
        acik={iptalEdilecek !== null}
        onKapat={() => setIptalEdilecek(null)}
        baslik="Anahtarı iptal et"
        genislik="dar"
        altEylemler={
          <>
            <Dugme ton="ikincil" onClick={() => setIptalEdilecek(null)}>
              Vazgeç
            </Dugme>
            <Dugme
              ton="tehlike"
              bekliyor={iptalEdilecek !== null && bekleyen === iptalEdilecek.id}
              onClick={() => iptalEdilecek && void iptalEt(iptalEdilecek)}
            >
              İptal et
            </Dugme>
          </>
        }
      >
        {iptalEdilecek && (
          <p className="m-0 text-14 text-ink">
            <strong>{iptalEdilecek.ad}</strong> anahtarı iptal edilsin mi? Bu anahtarı kullanan bağlantılar hemen
            durur.
          </p>
        )}
      </Pencere>
    </div>
  );
}
