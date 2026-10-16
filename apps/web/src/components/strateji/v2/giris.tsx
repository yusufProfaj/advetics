'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { TamEkranYukleniyor } from '@/components/yukleniyor';
import { useDil, useSozluk } from '@/dil/saglayici';
import { stratejiSozlugu } from '@/dil/sozlukler/strateji';
import { stratejiV2Sozlugu } from '@/dil/sozlukler/strateji-v2';
import { menuBolumuEtiketi, menuSatiriEtiketi } from '@/lib/nav-sections';
import { sec, stratejiPanelAdresi, type Dil, type PlanDurumu, type StratejiDurumu, type StratejiListeSatiri, type StratejiOlusturmaAdimi } from '@advetics/shared';
import { AcilirMenu, IKON_TETIK, MenuOgesi } from '@/components/ui/acilir-menu';
import { dugmeSinifi } from '@/components/ui/dugme';
import { BosDurum } from '@/components/ui/hal';
import { Kart } from '@/components/ui/kart';
import { Rozet } from '@/components/ui/rozet';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { BuyukSecim, SecimKarti } from '@/components/ui/sihirbaz';
import { AdHucresi, Tablo, type TabloSutunu } from '@/components/ui/tablo';
import { donemEtiketi, durumEtiketi } from '../hesap';
import { durumTonu, olusturEtiketi, olusturKarti } from './akis';
import { donemMetni, stratejiDurumEtiketi, tarihAraligi } from './hesap';
import { KapatmaPenceresi, iptalEdilebilirMi, type KapatmaHedefi } from './kapatma';
import { StratejiIkonu, durumHali } from './ortak';
import { Tutar } from './tutar';

/** Liste satırının adı: v2 dönemi, v1 ayı + "eski medya planı" (salt okunur). */
export function planSatiriAdi(p: StratejiListeSatiri, dil: Dil = 'tr'): string {
  const d = sec(stratejiV2Sozlugu, dil).giris;
  // Eski (v1) medya planının dönem adı ve durumu v1 ekranının yardımcılarından (dil alıyor).
  if (p.bicim === 1) return `${p.donem ? donemEtiketi(p.donem, dil) : d.tarihsiz} · ${d.eskiPlanKisa}`;
  return p.baslangic && p.bitis ? donemMetni(p.baslangic, p.bitis, dil) : d.tarihsiz;
}

export function planDurumMetni(p: StratejiListeSatiri, dil: Dil = 'tr'): string {
  return p.bicim === 1 ? (durumEtiketi(p.durum as PlanDurumu, dil).metin ?? p.durum) : (stratejiDurumEtiketi(p.durum as StratejiDurumu, dil) ?? p.durum);
}

function PlanRozeti({ p, dil }: { p: StratejiListeSatiri; dil: Dil }) {
  return <Rozet hal={durumHali(durumTonu(p.durum))}>{planDurumMetni(p, dil)}</Rozet>;
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
  const d = useSozluk(stratejiV2Sozlugu).giris;
  const { dil } = useDil();
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
  const kartBasligi = olusturEtiketi(kart, dil);
  return (
    <div className="grid gap-6">
      <SayfaBasligi
        bolum={menuBolumuEtiketi('/strateji', dil)}
        baslik={menuSatiriEtiketi('/strateji', dil)}
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
          baslik={d.raporuIncele}
          aciklama={d.raporuInceleAciklama}
          alt={
            <span className="flex flex-wrap items-center justify-between gap-2.5">
              {son ? (
                <span className="inline-flex min-w-0 items-center gap-2">
                  <PlanRozeti p={son} dil={dil} />
                  <span className="truncate">{planSatiriAdi(son, dil)}</span>
                </span>
              ) : (
                d.henuzYok
              )}
              <b className="text-ink">{d.ac}</b>
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
              ? d.olusturOnayda
              : kart.tur === 'devam'
                ? kart.revizyon
                  ? d.olusturRevizyon
                  : d.olusturYarim
                : d.olusturYeni
          }
          alt={
            <span className="flex flex-wrap items-center justify-between gap-2.5">
              {kart.tur === 'yeni' ? (
                d.yaklasik5
              ) : kart.tur === 'devam' ? (
                <Rozet hal="hata">{kart.revizyon ? stratejiDurumEtiketi('revizyon', dil) : stratejiDurumEtiketi('taslak', dil)}</Rozet>
              ) : (
                <Rozet hal="hata">{stratejiDurumEtiketi('onayda', dil)}</Rozet>
              )}
              <b className="text-ink">{kart.tur === 'onayda' ? d.raporuAc : kart.tur === 'devam' ? d.devam : d.basla}</b>
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
        bosNeden={d.bosOlustur}
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
  const d = useSozluk(stratejiV2Sozlugu).giris;
  // BOŞ LİSTE NEDENİNİ SÖYLÜYOR: okuyan hesabın yapacağı iş beklemek.
  return <StratejiTablosu clientId={clientId} planlar={planlar} toplam={toplam} kurabilir={kurabilir} yonetebilir={yonetebilir} bosNeden={d.bosAjans} />;
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
  const d = useSozluk(stratejiV2Sozlugu).giris;
  const { dil } = useDil();
  const [hedef, setHedef] = useState<KapatmaHedefi | null>(null);
  const kapatma = (p: StratejiListeSatiri, tur: 'iptal' | 'sil') => setHedef({ tur, id: p.id, surum: p.surum, ad: planSatiriAdi(p, dil), durum: p.durum, bicim: p.bicim });
  const rapor = (p: StratejiListeSatiri) => stratejiPanelAdresi({ musteri: clientId, plan: p.id, adim: 'rapor' });
  const sutunlar: Array<TabloSutunu<StratejiListeSatiri>> = [
    {
      anahtar: 'ad',
      baslik: d.strateji,
      hucre: (p) => (
        <AdHucresi
          ad={
            <Link href={rapor(p)} onClick={(e) => e.stopPropagation()}>
              {p.bicim === 1 ? (p.donem ? donemEtiketi(p.donem, dil) : d.tarihsiz) : planSatiriAdi(p, dil)}
            </Link>
          }
          alt={p.bicim === 1 ? d.eskiPlanSaltOkunur : p.baslangic && p.bitis ? tarihAraligi(p.baslangic, p.bitis, dil) : undefined}
        />
      ),
    },
    { anahtar: 'durum', baslik: d.durum, hucre: (p) => <PlanRozeti p={p} dil={dil} /> },
    { anahtar: 'kampanya', baslik: d.kampanya, sayi: true, hucre: (p) => p.kalemSayisi },
    // TOPLAM bütçe: liste yanıtı aylık tutarı taşımıyor; ay sayısına bölmek bir tahmin olurdu.
    { anahtar: 'butce', baslik: d.butce, sayi: true, hucre: (p) => <Tutar micros={p.toplamButceMicros} para={p.paraBirimi} /> },
    { anahtar: 'surum', baslik: d.surum, ikincil: true, hucre: (p) => p.surum },
    {
      anahtar: 'menu',
      baslik: <span className="sr-only">{d.eylemler}</span>,
      sayi: true,
      hucre: (p) => (
        <span onClick={(e) => e.stopPropagation()} className="inline-flex">
          <AcilirMenu
            tasma="portal"
            etiket={d.satirEylemleri(planSatiriAdi(p, dil))}
            hizala="sag"
            genislik="w-52"
            tetik={({ acik: _acik, ...o }) => (
              <button type="button" {...o} className={IKON_TETIK} aria-label={d.diger}>
                ⋯
              </button>
            )}
          >
            <MenuOgesi href={rapor(p)}>{d.raporuAcMenu}</MenuOgesi>
            {kurabilir && p.bicim === 2 && p.durum === 'onaylandi' && (
              <MenuOgesi href={stratejiPanelAdresi({ musteri: clientId, plan: p.id, adim: 'kur' })}>{d.kampanyalariKur}</MenuOgesi>
            )}
            {yonetebilir && iptalEdilebilirMi(p) && <MenuOgesi onClick={() => kapatma(p, 'iptal')}>{d.iptalEt}</MenuOgesi>}
            {yonetebilir && (
              <MenuOgesi tehlike onClick={() => kapatma(p, 'sil')}>
                {d.sil}
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
      <Kart baslik={d.stratejiler} baslikEki={planlar.length < toplam ? d.gosteriliyor(planlar.length, toplam) : d.stratejiSayisi(toplam)} dolgu={false}>
        <Tablo
          etiket={d.stratejiler}
          sutunlar={sutunlar}
          satirlar={planlar}
          satirAnahtari={(p) => p.id}
          onSatir={(p) => router.push(rapor(p))}
          bos={<BosDurum baslik={d.stratejiYok} neden={bosNeden} />}
          sayfalama={{ bas: planlar.length === 0 ? 0 : 1, son: planlar.length, toplam }}
        />
      </Kart>
    </>
  );
}
