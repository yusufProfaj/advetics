'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { TamEkranYukleniyor } from '@/components/yukleniyor';
import { useSozluk } from '@/dil/saglayici';
import { stratejiSozlugu } from '@/dil/sozlukler/strateji';
import { stratejiPanelAdresi, type PlanDurumu, type StratejiDurumu, type StratejiListeSatiri, type StratejiOlusturmaAdimi } from '@advetics/shared';
import { AcilirMenu, IKON_TETIK, MenuOgesi } from '@/components/ui/acilir-menu';
import { dugmeSinifi } from '@/components/ui/dugme';
import { BosDurum } from '@/components/ui/hal';
import { Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { BuyukSecim, SecimKarti } from '@/components/ui/sihirbaz';
import { AdHucresi, Tablo, type TabloSutunu } from '@/components/ui/tablo';
import { DURUM_ETIKETI, donemEtiketi } from '../hesap';
import { durumTonu, olusturEtiketi, olusturKarti } from './akis';
import { STRATEJI_DURUM_ETIKETI, donemMetni, tarihAraligi } from './hesap';
import { KapatmaPenceresi, iptalEdilebilirMi, type KapatmaHedefi } from './kapatma';
import { StratejiIkonu, durumHali } from './ortak';
import { Tutar } from './tutar';

/** Liste satırının adı: v2 dönemi, v1 ayı + "eski medya planı" (salt okunur). */
export function planSatiriAdi(p: StratejiListeSatiri): string {
  if (p.bicim === 1) return `${p.donem ? donemEtiketi(p.donem) : 'Tarihsiz'} · eski medya planı`;
  return p.baslangic && p.bitis ? donemMetni(p.baslangic, p.bitis) : 'Tarihsiz';
}

export function planDurumMetni(p: StratejiListeSatiri): string {
  return p.bicim === 1 ? (DURUM_ETIKETI[p.durum as PlanDurumu]?.metin ?? p.durum) : (STRATEJI_DURUM_ETIKETI[p.durum as StratejiDurumu] ?? p.durum);
}

function PlanRozeti({ p }: { p: StratejiListeSatiri }) {
  return <Rozet hal={durumHali(durumTonu(p.durum))}>{planDurumMetni(p)}</Rozet>;
}

/**
 * ═══ GİRİŞ: İKİ BÜYÜK KART + STRATEJİLER TABLOSU (taslak `sayfa-taslaklari.html` "strateji") ═══
 *
 * "Raporu incele" (altta son stratejinin durumu) ve "Strateji oluştur"
 * (altta süre tahmini). Açık taslak varsa ikinci kart "Taslağa devam et"
 * olur ve kaldığı adımı açar; onay bekleyen varsa yeni oluşturulamayacağı
 * (workspace başına tek açık strateji) kartta yazar ve rapora götürür.
 * Üçüncü bir yol eklenmedi. Birincil düğme başlığın sağında ve kartla AYNI
 * adrese gider; onay bekleyen strateji varken çizilmez (yeni oluşturulamaz,
 * kırmızı düğme yanlış bir şey vaat ederdi).
 * İstek atmaz: yalnız gezinme.
 */
export function StratejiGirisi({
  clientId,
  planlar,
  toplam,
  devamAdimi,
  aciklama,
  kurabilir,
  yonetebilir,
}: {
  clientId: string;
  planlar: StratejiListeSatiri[];
  toplam: number;
  devamAdimi: StratejiOlusturmaAdimi | null;
  aciklama?: ReactNode;
  kurabilir: boolean;
  /** `strategy.write`: ⋯ menüsünde iptal ve sil. */
  yonetebilir: boolean;
}) {
  const router = useRouter();
  /*
   * ═══ GEÇİŞ GÖRÜNÜR (2026-10-16, kullanıcı: "strateji oluştur dediğimde çok
   * geç açılıyor") ═══
   * Kartlar AYNI sayfanın adres parametresini değiştiriyor (`/strateji` →
   * `?adim=hedef`); Next aynı segmentte `loading.tsx` göstermiyor ve eski
   * ekranı sunucu render'ı bitene kadar (hedef adımında ölçüldü: 3,3 sn)
   * donmuş tutuyordu. Kullanıcı tekrar tıklıyor ve her tıklama platform
   * okuması tetikliyordu (09:07'de bir saniyede 8 istek, ardından Google
   * kotası doldu). Geçiş `useTransition` içinde, beklerken tam ekran örtü
   * ne açıldığını yazıyor ve ikinci tıklamayı kapatıyor.
   */
  const [geciyor, gecisBaslat] = useTransition();
  const [gecisMesaji, setGecisMesaji] = useState('');
  const ds = useSozluk(stratejiSozlugu);
  const git = (adres: string, mesaj: string) => {
    if (geciyor) return;
    setGecisMesaji(mesaj);
    gecisBaslat(() => router.push(adres));
  };
  const son = planlar[0] ?? null;
  const kart = olusturKarti(planlar);
  const olusturAdresi =
    kart.tur === 'yeni'
      ? stratejiPanelAdresi({ musteri: clientId, adim: 'hedef' })
      : kart.tur === 'devam'
        ? stratejiPanelAdresi({ musteri: clientId, plan: kart.planId, adim: kart.revizyon ? 'plan' : (devamAdimi ?? 'plan') })
        : stratejiPanelAdresi({ musteri: clientId, plan: kart.planId, adim: 'rapor' });
  const kartBasligi = olusturEtiketi(kart);
  return (
    <div className="grid gap-6">
      <SayfaBasligi
        bolum="Planla"
        baslik="AdvStrategy"
        aciklama={aciklama}
        eylemler={
          kart.tur !== 'onayda' && (
            <Link href={olusturAdresi} className={dugmeSinifi('birincil')}>
              {kartBasligi}
            </Link>
          )
        }
      />
      <BuyukSecim>
        <SecimKarti
          ikon={<StratejiIkonu ad="rapor" />}
          baslik="Raporu incele"
          aciklama="Hazırlanan stratejiyi oku, onayla ya da değişiklik iste. Onaylanan planın kampanyalarını burada kurarsın."
          alt={
            <span className="flex flex-wrap items-center justify-between gap-2.5">
              {son ? (
                <span className="inline-flex min-w-0 items-center gap-2">
                  <PlanRozeti p={son} />
                  <span className="truncate">{planSatiriAdi(son)}</span>
                </span>
              ) : (
                'Henüz strateji yok'
              )}
              <b className="text-ink">Aç →</b>
            </span>
          }
          onClick={() => git(stratejiPanelAdresi({ musteri: clientId, adim: 'raporlar' }), ds.gecisListe)}
        />
        <SecimKarti
          ikon={<StratejiIkonu ad="yeni" />}
          kirmizi
          baslik={kartBasligi}
          aciklama={
            kart.tur === 'onayda'
              ? 'Açık bir strateji onay bekliyor. Yenisi için önce onu iptal et ya da sil (aşağıdaki listede ⋯) ya da sonuçlanmasını bekle.'
              : kart.tur === 'devam'
                ? kart.revizyon
                  ? 'Müşteri değişiklik istedi. Planı düzeltip yeniden gönder.'
                  : 'Yarım kalan strateji kaldığın adımdan açılır.'
                : 'Yedi kısa soru. Hesabının geçmişine bakıp sana bir plan önereceğiz; her kampanyayı tek tek onaylayarak ilerlersin.'
          }
          alt={
            <span className="flex flex-wrap items-center justify-between gap-2.5">
              {kart.tur === 'yeni' ? (
                'Yaklaşık 5 dakika'
              ) : kart.tur === 'devam' ? (
                <Rozet hal="hata">{kart.revizyon ? 'Revizyon istendi' : 'Taslak'}</Rozet>
              ) : (
                <Rozet hal="hata">Onay bekliyor</Rozet>
              )}
              <b className="text-ink">{kart.tur === 'onayda' ? 'Raporu aç →' : kart.tur === 'devam' ? 'Devam →' : 'Başla →'}</b>
            </span>
          }
          onClick={() => git(olusturAdresi, kart.tur === 'yeni' ? ds.gecisYeni : ds.gecisDevam)}
        />
      </BuyukSecim>
      {geciyor && <TamEkranYukleniyor mesaj={gecisMesaji} />}
      <StratejiTablosu
        clientId={clientId}
        planlar={planlar}
        toplam={toplam}
        kurabilir={kurabilir}
        yonetebilir={yonetebilir}
        bosNeden="Bu workspace için henüz strateji yok. Strateji oluştur ile başla."
      />
    </div>
  );
}

/**
 * ═══ RAPORU İNCELE: STRATEJİLER ═══ Müşteri hesabı yalnız bu ekranı görür
 * (oluşturma izni yok), o yüzden başlıkta oluşturma düğmesi yok.
 */
export function StratejiListesiEkrani({
  clientId,
  planlar,
  toplam,
  kurabilir,
  yonetebilir,
}: {
  clientId: string;
  planlar: StratejiListeSatiri[];
  toplam: number;
  kurabilir: boolean;
  yonetebilir: boolean;
}) {
  // BOŞ LİSTE NEDENİNİ SÖYLÜYOR: okuyan hesabın yapacağı iş beklemek.
  return <StratejiTablosu clientId={clientId} planlar={planlar} toplam={toplam} kurabilir={kurabilir} yonetebilir={yonetebilir} bosNeden="Bu workspace için henüz strateji yok. Ajans hazırlayınca burada görünür." />;
}

/**
 * Stratejiler tablosu: durum rozeti, kampanya sayısı, bütçe ve sürüm aynı
 * satırda; satır rapora açılır. Sessiz kesme yok: sunucu listeyi keserse
 * sayfalama satırı "1 - N / toplam" yazar. Eski aylık medya planları (v1)
 * aynı listede, salt okunur açılır.
 *
 * ⋯ MENÜSÜ YALNIZ BUGÜN VAR OLAN EYLEMLER: rapor ve (onaylı v2 stratejide,
 * kurma izni olana) kampanyaları kurma. Kopyalama ya da iptal ucu yok;
 * menüye koymak çalışmayan bir seçenek göstermek olurdu.
 */
function StratejiTablosu({
  clientId,
  planlar,
  toplam,
  kurabilir,
  yonetebilir,
  bosNeden,
}: {
  clientId: string;
  planlar: StratejiListeSatiri[];
  toplam: number;
  kurabilir: boolean;
  yonetebilir: boolean;
  bosNeden: string;
}) {
  const router = useRouter();
  const [hedef, setHedef] = useState<KapatmaHedefi | null>(null);
  const kapatma = (p: StratejiListeSatiri, tur: 'iptal' | 'sil') => setHedef({ tur, id: p.id, surum: p.surum, ad: planSatiriAdi(p), durum: p.durum, bicim: p.bicim });
  const rapor = (p: StratejiListeSatiri) => stratejiPanelAdresi({ musteri: clientId, plan: p.id, adim: 'rapor' });
  const sutunlar: Array<TabloSutunu<StratejiListeSatiri>> = [
    {
      anahtar: 'ad',
      baslik: 'Strateji',
      hucre: (p) => (
        <AdHucresi
          ad={
            <Link href={rapor(p)} onClick={(e) => e.stopPropagation()}>
              {p.bicim === 1 ? (p.donem ? donemEtiketi(p.donem) : 'Tarihsiz') : planSatiriAdi(p)}
            </Link>
          }
          alt={p.bicim === 1 ? 'Eski medya planı, salt okunur' : p.baslangic && p.bitis ? tarihAraligi(p.baslangic, p.bitis) : undefined}
        />
      ),
    },
    { anahtar: 'durum', baslik: 'Durum', hucre: (p) => <PlanRozeti p={p} /> },
    { anahtar: 'kampanya', baslik: 'Kampanya', sayi: true, hucre: (p) => p.kalemSayisi },
    // TOPLAM bütçe: liste yanıtı aylık tutarı taşımıyor; ay sayısına bölmek bir tahmin olurdu.
    { anahtar: 'butce', baslik: 'Bütçe', sayi: true, hucre: (p) => <Tutar micros={p.toplamButceMicros} para={p.paraBirimi} /> },
    { anahtar: 'surum', baslik: 'Sürüm', ikincil: true, hucre: (p) => p.surum },
    {
      anahtar: 'menu',
      baslik: <span className="sr-only">Eylemler</span>,
      sayi: true,
      hucre: (p) => (
        <span onClick={(e) => e.stopPropagation()} className="inline-flex">
          <AcilirMenu
            tasma="portal"
            etiket={`${planSatiriAdi(p)} eylemleri`}
            hizala="sag"
            genislik="w-52"
            tetik={({ acik: _acik, ...o }) => (
              <button type="button" {...o} className={IKON_TETIK} aria-label="Diğer">
                ⋯
              </button>
            )}
          >
            <MenuOgesi href={rapor(p)}>Raporu aç</MenuOgesi>
            {kurabilir && p.bicim === 2 && p.durum === 'onaylandi' && (
              <MenuOgesi href={stratejiPanelAdresi({ musteri: clientId, plan: p.id, adim: 'kur' })}>Kampanyaları kur</MenuOgesi>
            )}
            {yonetebilir && iptalEdilebilirMi(p) && <MenuOgesi onClick={() => kapatma(p, 'iptal')}>İptal et</MenuOgesi>}
            {yonetebilir && (
              <MenuOgesi tehlike onClick={() => kapatma(p, 'sil')}>
                Sil
              </MenuOgesi>
            )}
          </AcilirMenu>
        </span>
      ),
    },
  ];
  return (
    <>
      <KapatmaPenceresi
        hedef={hedef}
        onKapat={() => setHedef(null)}
        onBitti={() => {
          setHedef(null);
          // Liste sunucu bileşeninden geliyor: tazelenmezse silinen satır ve "onay bekliyor" kartı ekranda kalır.
          router.refresh();
        }}
      />
      <Kart baslik="Stratejiler" baslikEki={planlar.length < toplam ? `${planlar.length} / ${toplam} gösteriliyor` : `${toplam} strateji`} dolgu={false}>
        <Tablo
          etiket="Stratejiler"
          sutunlar={sutunlar}
          satirlar={planlar}
          satirAnahtari={(p) => p.id}
          onSatir={(p) => router.push(rapor(p))}
          bos={<BosDurum baslik="Strateji yok" neden={bosNeden} />}
          sayfalama={{ bas: planlar.length === 0 ? 0 : 1, son: planlar.length, toplam }}
        />
      </Kart>
    </>
  );
}
