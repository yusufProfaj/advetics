'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CHANNEL_LABELS,
  type ChannelKind,
  type ConnectionSummary,
} from '@advetics/shared';
import type { ClientSetupResult } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { atamaBildirimi, type AtamaYaniti } from '@/lib/atama-bildirimi';
import {
  havuzlariCikar,
  havuzSuz,
  KANALLAR,
  workspaceAcilacaklar,
  workspaceAdi,
  type HavuzOgesi,
} from '@/lib/havuz';
import { PlatformLogo } from '@/components/platform-logo';
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { Girdi, Secim } from '@/components/ui/alan';
import { BosDurum, Serit } from '@/components/ui/hal';
import { AdHucresi, AracCubugu, Tablo, type TabloSutunu } from '@/components/ui/tablo';
import { BolumluSecici } from '@/components/ui/sekmeler';
import { Pencere } from '@/components/ui/pencere';
import { useDil, useSozluk } from '@/dil/saglayici';
import { baglantilarSozlugu } from '@/dil/sozlukler/ayarlar-baglantilar';

interface Musteri {
  id: string;
  name: string;
}

/** Sayfa başına satır. 374 hesaplık havuzda tek sayfa metrelerce uzuyordu. */
const SAYFA_BOYU = 25;

/**
 * ═══ ATANMAMIŞ HESAPLAR — TEK TABLO (taslak `#ayarlar`) ═══
 *
 * İLK DÜZEN: her bağlantının altında bütün hesaplar SATIR SATIR
 * listeleniyordu. 284 hesapta ekran metrelerce uzuyor ve "hangi hesap
 * boşta" sorusu ancak kaydırarak cevaplanabiliyordu.
 *
 * İKİNCİ DÜZEN: kanal başına bir kart ve "Havuzdan hesap ata" ile açılan bir
 * pop-up. Atanacak hesabı görmek için önce kanalı bilmek ve pencere açmak
 * gerekiyordu; pencere elle yazılmıştı (odak tuzağı yok, DOM'dan çıkıyordu).
 *
 * BUGÜN: Google Ads'in "hesaplar" tablosu. Kanal SÜZGEÇ (Tümü · Meta ·
 * Google…), arama tablonun üstünde, satırda TEK eylem "Ata", hedef workspace
 * araç çubuğunda bir kez seçiliyor. Liste SAYFALI ve "1 - 25 / 374" her zaman
 * yazıyor: sessiz kesme yok, metrelerce liste de yok.
 */
export function HavuzKartlari({
  connections,
  clients,
  canManage,
  workspaceAcabilir,
}: {
  connections: ConnectionSummary[];
  clients: Musteri[];
  canManage: boolean;
  /** `client.write` — toplu workspace açma ancak onunla. */
  workspaceAcabilir: boolean;
}) {
  const router = useRouter();
  const { dil } = useDil();
  const d = useSozluk(baglantilarSozlugu).havuz;
  const havuzlar = useMemo(() => havuzlariCikar(connections), [connections]);
  const [kanal, setKanal] = useState<ChannelKind | 'tumu'>('tumu');
  const [arama, setArama] = useState('');
  const [sayfa, setSayfa] = useState(0);
  const [hedef, setHedef] = useState<string>(clients[0]?.id ?? '');
  const [bekleyen, setBekleyen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [bildirim, setBildirim] = useState<string | null>(null);

  /*
   * SÜZGEÇ YALNIZ KANAL: "Tümü" bütün kanalların havuzu. Aynı hesap iki
   * kanalda birden durmuyor (`havuzlariCikar` kanal başına ayırıyor), yani
   * birleşim sayıyı şişirmiyor.
   */
  const ogeler = useMemo(
    () => (kanal === 'tumu' ? KANALLAR.flatMap((k) => havuzlar[k]) : havuzlar[kanal]),
    [havuzlar, kanal],
  );
  const suzulmus = useMemo(() => havuzSuz(ogeler, arama), [ogeler, arama]);
  const sonSayfa = Math.max(0, Math.ceil(suzulmus.length / SAYFA_BOYU) - 1);
  const gecerliSayfa = Math.min(sayfa, sonSayfa);
  const gorunen = suzulmus.slice(gecerliSayfa * SAYFA_BOYU, (gecerliSayfa + 1) * SAYFA_BOYU);

  /*
   * ═══ HER BİRİNE WORKSPACE AÇ ═══
   *
   * Aday listesi ARAMADAN BAĞIMSIZ: arama bir görünüm, toplu işlem bir
   * karar. Arama kutusunda bir şey yazılıyken düğmeye basıp yalnızca
   * görünenlere workspace açmak, kullanıcının ne yaptığını bilmediği bir
   * kısmi işlem olurdu. Kanal süzgecine ise BAĞLI: "Meta"yı seçen kişi
   * Meta hesaplarına workspace açtığını biliyor ve sayı onayda yazıyor.
   *
   * İKİ ADIM: önce kaç workspace açılacağı yazıyor, sonra onay. Açılan
   * workspace geri alınabilir ama tek tek; bir yanlış tık on workspace'lik
   * bir temizlik demekti.
   *
   * SIRAYLA, PARALEL DEĞİL: her istek sunucuda bir kurulum sihirbazı turu
   * (workspace + atama + izleme + geçmiş kuyruğu). Hepsini birden atmak
   * paylaşımlı sunucuda bir yük dalgası ve kuyrukta aynı anda on yapı
   * taraması demekti.
   */
  const adaylar = useMemo(() => workspaceAcilacaklar(ogeler), [ogeler]);
  const [topluOnay, setTopluOnay] = useState(false);
  const [toplu, setToplu] = useState<{
    sira: number;
    toplam: number;
    acilan: string[];
    hatalar: Array<{ ad: string; sebep: string }>;
    bitti: boolean;
  } | null>(null);

  async function herBirineWorkspaceAc(): Promise<void> {
    const liste = adaylar;
    setTopluOnay(false);
    setHata(null);
    setBildirim(null);
    const acilan: string[] = [];
    const hatalar: Array<{ ad: string; sebep: string }> = [];
    setToplu({ sira: 0, toplam: liste.length, acilan, hatalar, bitti: false });
    for (const [i, o] of liste.entries()) {
      const ad = workspaceAdi(o);
      try {
        const r = await apiFetch<ClientSetupResult>('/clients/setup', {
          method: 'POST',
          body: JSON.stringify({ name: ad, adAccountIds: [o.id] }),
        });
        /*
         * WORKSPACE AÇILDI AMA HESAP ATANAMADIYSA BU BİR BAŞARI DEĞİL.
         * Sihirbaz kısmi başarıyı geri almıyor ve sebebi `failures` içinde
         * dönüyor; onu yutmak "açtım ama boş" workspace'i sessiz bırakırdı.
         */
        const atanamadi = r?.failures.find((f) => f.kind === 'adAccount');
        if (atanamadi) hatalar.push({ ad, sebep: d.workspaceAcildiHesapAtanamadi(atanamadi.reason) });
        else acilan.push(ad);
      } catch (e) {
        hatalar.push({ ad, sebep: e instanceof ApiRequestError ? e.message : d.istekBasarisiz });
      }
      setToplu({ sira: i + 1, toplam: liste.length, acilan: [...acilan], hatalar: [...hatalar], bitti: false });
    }
    setToplu({ sira: liste.length, toplam: liste.length, acilan, hatalar, bitti: true });
    router.refresh();
  }

  async function ata(oge: HavuzOgesi): Promise<void> {
    if (!hedef) {
      setHata(d.onceWorkspaceSec);
      return;
    }
    setBekleyen(oge.id);
    setHata(null);
    setBildirim(null);
    try {
      // UÇ ÖĞENİN KENDİSİNDE (`havuz.ts`): burada seçmek, YouTube kanalının
      // hub aboneliğini kuran ucu atlamanın en kolay yoluydu.
      const res = await apiFetch<AtamaYaniti>(oge.atamaYolu, {
        method: 'PATCH',
        body: JSON.stringify({ clientId: hedef }),
      });
      /*
       * HAVUZDAKİ HESAP DA VERİ TAŞIYABİLİR. "Havuz" hesabın kimseye atanmamış
       * olması demek; DAHA ÖNCE bir müşteride bulunmuş ve oradan kaldırılmış
       * olabilir. O hâlde eski müşterinin kampanya ve metrik satırları hâlâ
       * duruyor ve bu atama onları taşıyor — sayı burada da yazılmalı.
       */
      setBildirim(atamaBildirimi(res ?? {}, true, dil));
      // ATAMA İZLEMEYİ AÇIP 90 GÜNLÜK GEÇMİŞİ KUYRUĞA ALIYOR.
      router.refresh();
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : d.atamaBasarisiz);
    } finally {
      setBekleyen(null);
    }
  }

  const toplamHavuz = KANALLAR.reduce((n, k) => n + havuzlar[k].length, 0);

  const sutunlar: Array<TabloSutunu<HavuzOgesi>> = [
    {
      anahtar: 'hesap',
      baslik: d.hesap,
      hucre: (o) => (
        <AdHucresi
          ad={o.name}
          alt={
            <>
              {o.externalId}
              {/* BAĞLANTI ETİKETİ AD VE KİMLİKTEN SONRA GELİYOR ÇÜNKÜ
                  İKİSİ DE AYNI OLABİLİYOR: aynı reklam hesabı iki
                  şirket altında iki satır açabiliyor (tekil anahtar
                  `[platform, externalId, orgId]`) ve üretimde iki
                  "Biltaş · 3421122929" yan yana çıktı. Ayıran tek şey
                  satırın hangi bağlantıdan geldiği. */}
              {o.baglanti.etiket && ` · ${o.baglanti.etiket}`}
              {/* KALDIRILMIŞ BAĞLANTININ SATIRI ATANABİLİR AMA VERİ
                  ÇEKMEZ: token'ı silinmiş bir bağlantıya bağlı. Bunu
                  söylememek, kullanıcıyı "atadım ama veri gelmiyor"
                  turuna sokar. */}
              {o.baglanti.durum === 'revoked' && (
                <span className="block font-semibold text-danger-strong">
                  {d.baglantiKaldirilmis}
                </span>
              )}
            </>
          }
        />
      ),
    },
    {
      anahtar: 'kaynak',
      baslik: d.kaynak,
      ikincil: true,
      /* SAHİP YAZILI: ajansın hesabı her şirkete, şirketinki yalnızca
         kendi workspace'lerine atanabiliyor. Bunu atamaya basınca öğrenmek,
         girişte değil kullanım anında doğrulama olurdu (CLAUDE.md). */
      hucre: (o) => (
        <span className="text-13 text-ink-muted">
          {o.isManager ? d.yonetici : o.baglanti.sahip === 'ajans' ? d.ajansBaglantisi : d.sirketBaglantisi}
        </span>
      ),
    },
    {
      anahtar: 'eylem',
      baslik: <span className="sr-only">{d.eylemler}</span>,
      sayi: true,
      hucre: (o) =>
        /* YÖNETİCİ (MCC) HESABI LİSTEDE DURUYOR ama atanamıyor —
           reklam yayınlamıyor ve sebebi kaynak sütununda yazılı. */
        o.isManager ? (
          <span className="text-12 text-ink-soluk">{d.atanamaz}</span>
        ) : (
          <Dugme
            ton="koyu"
            boyut="kucuk"
            bekliyor={bekleyen === o.id}
            disabled={!canManage || bekleyen !== null || clients.length === 0}
            onClick={() => void ata(o)}
          >
            {d.ata}
          </Dugme>
        ),
    },
  ];

  return (
    <Kart
      dolgu={false}
      baslik={d.baslik}
      baslikEki={d.havuzda(toplamHavuz)}
      eylem={
        workspaceAcabilir &&
        adaylar.length > 0 &&
        toplu === null && (
          <Dugme ton="ikincil" boyut="kucuk" onClick={() => setTopluOnay(true)} disabled={bekleyen !== null}>
            {d.herBirineAc}
          </Dugme>
        )
      }
    >
      <div className="grid gap-3 border-b border-line px-4 py-3">
        {/*
          HEDEF ÖNCE: hesap satırına "Ata" demeden hangi workspace'e gideceği
          seçili olmalı. Satır başına seçici koymak 25 seçici demekti ve
          yanlış satırda yanlış hedef bırakmak kolaylaşıyordu.
        */}
        {clients.length === 0 ? (
          <p className="m-0 text-13 font-semibold text-danger-strong">{d.workspaceYok}</p>
        ) : (
          <label className="flex flex-wrap items-center gap-2 text-13 font-semibold text-ink">
            {d.atanacakWorkspace}
            <span className="w-full max-w-xs">
              <Secim value={hedef} onChange={(e) => setHedef(e.target.value)}>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Secim>
            </span>
          </label>
        )}
        {!canManage && <p className="m-0 text-12 text-ink-muted">{d.yoneticininIsi}</p>}
        {hata && (
          <Serit ton="hata" baslik={d.atanamadi}>
            {hata}
          </Serit>
        )}
        {bildirim && (
          <Serit ton="bilgi" baslik={d.atandi}>
            {bildirim}
          </Serit>
        )}
        {/* İLERLEME VE SONUÇ — hangi hesabın açıldığı, hangisinin neden
            açılamadığı AYRI AYRI. "Tamamlandı" deyip eksiklerini saklamak,
            eksik workspace'i aylarca fark ettirmezdi. */}
        {toplu && (
          <Serit
            ton={toplu.hatalar.length > 0 ? 'hata' : 'bilgi'}
            baslik={
              toplu.bitti
                ? d.topluBitti(toplu.acilan.length, toplu.hatalar.length)
                : d.aciliyor(toplu.sira, toplu.toplam)
            }
          >
            {toplu.hatalar.length > 0 && (
              <ul className="m-0 mt-1 list-none p-0">
                {toplu.hatalar.map((h) => (
                  <li key={h.ad}>
                    {h.ad}: {h.sebep}
                  </li>
                ))}
              </ul>
            )}
          </Serit>
        )}
      </div>

      <Tablo
        etiket={d.baslik}
        sutunlar={sutunlar}
        satirlar={gorunen}
        satirAnahtari={(o) => o.id}
        aracCubugu={
          <AracCubugu
            sag={
              /* SESSİZ KESME YOK: kaç sonuç gösterildiği ve toplam yazılı. */
              <span className="text-12 text-ink-muted">
                {d.sayac(suzulmus.length, ogeler.length)}
              </span>
            }
          >
            <BolumluSecici
              etiket={d.kanal}
              secili={kanal}
              onSec={(k) => {
                setKanal(k);
                setSayfa(0);
              }}
              secenekler={[
                { deger: 'tumu' as const, etiket: d.tumu },
                ...KANALLAR.filter((k) => havuzlar[k].length > 0).map((k) => ({
                  deger: k,
                  etiket: (
                    <span className="inline-flex items-center gap-1.5">
                      <PlatformLogo kind={k} className="h-3.5 w-3.5" />
                      {CHANNEL_LABELS[k]} {havuzlar[k].length}
                    </span>
                  ),
                })),
              ]}
            />
            <div className="w-full max-w-xs">
              <Girdi
                type="search"
                value={arama}
                onChange={(e) => {
                  setArama(e.target.value);
                  setSayfa(0);
                }}
                placeholder={d.aramaYer}
                aria-label={d.hesapAra}
              />
            </div>
          </AracCubugu>
        }
        bos={
          <BosDurum
            baslik={ogeler.length === 0 ? d.havuzBos : d.aramayaUyanYok}
            neden={
              ogeler.length === 0
                ? d.havuzBosNeden
                : d.aramaNeden
            }
          />
        }
        sayfalama={{
          bas: suzulmus.length === 0 ? 0 : gecerliSayfa * SAYFA_BOYU + 1,
          son: gecerliSayfa * SAYFA_BOYU + gorunen.length,
          toplam: suzulmus.length,
          onceki: gecerliSayfa > 0 ? () => setSayfa(gecerliSayfa - 1) : undefined,
          sonraki: gecerliSayfa < sonSayfa ? () => setSayfa(gecerliSayfa + 1) : undefined,
        }}
      />
      <p className="m-0 border-t border-line px-4 py-2.5 text-12 text-ink-muted">
        {d.atamaNotu}
      </p>

      <Pencere
        acik={topluOnay}
        onKapat={() => setTopluOnay(false)}
        baslik={d.herBirineAc}
        genislik="dar"
        altEylemler={
          <>
            <Dugme ton="ikincil" onClick={() => setTopluOnay(false)}>
              {d.vazgec}
            </Dugme>
            <Dugme onClick={() => void herBirineWorkspaceAc()}>{d.onayla}</Dugme>
          </>
        }
      >
        <p className="m-0 text-14 text-ink">{d.topluOnay(adaylar.length)}</p>
      </Pencere>
    </Kart>
  );
}
