'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { REHBER_AMAC_KODLARI, type RehberAmacKodu, type RehberKaydi, type RehberListesi, type RehberOzeti } from '@advetics/shared';
import { ApiRequestError, apiFetch, onizlemeAdresi } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { formatMoney, formatRelative, formatTarih } from '@/lib/format';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';
import { menuBolumuEtiketi, menuSatiriEtiketi } from '@/lib/nav-sections';
import { useDil, useSozluk } from '@/dil/saglayici';
import { reklamSozlugu } from '@/dil/sozlukler/reklam';
import {
  GIRIS_SEKMELERI,
  aktifSekme,
  birincilEylem,
  bosSekmeMetni,
  butceMetni,
  eksikEtiketi,
  onayMetinleri,
  platformRozetleri,
  satirAdi,
  satirEylemleri,
  sekmeAdlari,
  sekmeyeAyir,
  taslakPlatformlari,
  taslaklariAyir,
  telefonOzeti,
  topluSonucMetni,
  type GirisSekmesi,
  type RozetTonu,
  type SatirEylemi,
} from '@/lib/reklam-girisi';
import { AcilirMenu, IKON_TETIK, MenuOgesi } from '@/components/ui/acilir-menu';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { BosDurum, HataDurumu, Serit } from '@/components/ui/hal';
import { Kart, KART_BAGLANTISI } from '@/components/ui/kart';
import { Pencere } from '@/components/ui/pencere';
import { Rozet, type DurumHali } from '@/components/ui/rozet';
import { SayfaBasligi, SayfaIskeleti } from '@/components/ui/sayfa-basligi';
import { SayfaIcDuzen, SayfaIcMenu } from '@/components/ui/sayfa-ic-menu';
import { AdHucresi, Tablo, type TabloSutunu } from '@/components/ui/tablo';
import { AMAC_IKONU, IKON, Ikon } from './ikonlar';

type OnayTuru = 'taslagi_sil' | 'listeden_kaldir' | 'toplu_sil';

/** Platform rozetinin tonu → ortak durum rozeti. Yeşil yalnız yayında olan için. */
const ROZET_HALI: Readonly<Record<RozetTonu, DurumHali>> = { iyi: 'ok', hata: 'hata', notr: 'taslak' };

/**
 * Rehberin GİRİŞİ (menüden gelinen yer). 2026-10-12'de sadeleşti; kullanıcı:
 * "ilk girişi çok kötü ve görüntü kirliliği hiç bir şey anlaşılmıyor ve
 * silinmiyor". Karar mantığı `lib/reklam-girisi.ts` içinde ve orada sınanıyor.
 *
 * 2026-10-14 BİRLEŞİK TASARIM (onaylı taslak `docs/marka/sayfa-taslaklari.html`
 * `#campaign`): bölümler (Yayındakiler · Taslaklar · Arşiv) SAYFA İÇİ YAN
 * MENÜDE, listeler TABLO (platform rozeti, bütçe sağa yaslı, tek eylem + ⋯),
 * "Yeni reklam" başlığın sağında tek birincil. Bölüm adreste (`?sekme=`):
 * yenileyen ya da bağlantıyı paylaşan kişi aynı bölüme döner.
 *
 * Liste okunamadıysa BOŞ liste gösterilmez, sunucunun mesajı gösterilir:
 * "taslağın yok" ile "taslakları okuyamadım" ayrı iş.
 */
export function RehberGirisi({
  clientId,
  workspaceAdi,
  liste,
  listeHatasi,
  sekmeParam,
  devredildi = false,
}: {
  clientId: string;
  workspaceAdi: string;
  liste: RehberListesi | null;
  listeHatasi: string | null;
  /** Adresteki `?sekme=`; geçersizse işi olan sekme seçilir. */
  sekmeParam?: string;
  /** İyileştir asistanından `?oturum=` ile gelindi (eski sohbet devri). */
  devredildi?: boolean;
}) {
  const router = useRouter();
  const { dil } = useDil();
  const d = useSozluk(reklamSozlugu);
  const dg = d.giris;
  const SEKME_ADLARI = sekmeAdlari(dil);
  const [aciliyor, setAciliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [onay, setOnay] = useState<{ tur: OnayTuru; satirlar: RehberOzeti[] } | null>(null);
  const [onayAcik, setOnayAcik] = useState(false);
  const [isleniyor, setIsleniyor] = useState(false);
  const [islemHatasi, setIslemHatasi] = useState<string | null>(null);

  async function yeni() {
    setAciliyor(true);
    setHata(null);
    try {
      const r = await apiFetch<RehberKaydi>('/reklam/rehberler', { method: 'POST', body: JSON.stringify({ clientId }) });
      router.push(baglanti('/reklam', { musteri: clientId, rehber: r.id }));
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : d.ortak.sunucuYok);
      setAciliyor(false);
    }
  }

  /** Sırayla çağırır; kısmi başarısızlık sayısıyla yazılır (sessiz kayıp yok). */
  async function uygula(yol: 'arsivle' | 'geri-getir', satirlar: readonly RehberOzeti[]) {
    setIsleniyor(true);
    setIslemHatasi(null);
    const hatalar: string[] = [];
    for (const r of satirlar) {
      try {
        await apiFetch<RehberKaydi>(`/reklam/rehberler/${encodeURIComponent(r.id)}/${yol}`, { method: 'POST' });
      } catch (e) {
        hatalar.push(e instanceof ApiRequestError ? e.message : d.ortak.sunucuYok);
      }
    }
    setIsleniyor(false);
    setOnayAcik(false);
    setIslemHatasi(satirlar.length === 1 && hatalar[0] ? hatalar[0] : topluSonucMetni(satirlar.length, hatalar, dil));
    router.refresh();
  }

  function eylem(r: RehberOzeti, e: SatirEylemi) {
    if (e === 'geri_getir') return void uygula('geri-getir', [r]);
    setOnay({ tur: e, satirlar: [r] });
    setOnayAcik(true);
  }

  const gruplar = sekmeyeAyir(liste?.satirlar ?? []);
  const sekme = aktifSekme(sekmeParam, gruplar);
  const simdi = Date.now();
  const taslak = taslaklariAyir(gruplar.taslaklar, simdi);
  // Sessiz kesme yok: sunucu listeyi kestiyse kaç tanesinin göründüğü yazılır.
  const kesildi = liste !== null && liste.satirlar.length < liste.toplam;
  const tasinan = { musteri: clientId };
  const satirAdresi = (r: RehberOzeti) => baglanti('/reklam', tasinan, { rehber: r.id });
  const gorunen = sekme === 'taslaklar' ? taslak.guncel : gruplar[sekme];
  const metin = onay ? onayMetinleri(dil)[onay.tur] : null;

  /*
   * TEK EYLEM + ⋯ (taslak `#campaign`). Menü yukarı açılıyor: tablo yatay
   * kaydırma kabının içinde ve aşağı açılan menü son satırda kabın altına
   * taşıp kırpılırdı. Menüdeki eylemlerin hepsi tek öğe, başlık satırı
   * yüksekliğine sığıyor.
   */
  const eylemHucresi = (r: RehberOzeti) => {
    const eylemler = satirEylemleri(r);
    return (
      <span className="inline-flex items-center justify-end gap-1.5">
        <Link className={dugmeSinifi(r.durum === 'taslak' ? 'koyu' : 'ikincil', 'kucuk')} href={satirAdresi(r)}>
          {birincilEylem(r, dil)}
        </Link>
        {eylemler.length > 0 && (
          <AcilirMenu
            tasma="portal"
            etiket={dg.digerIslemler}
            hizala="sag"
            yon="yukari"
            genislik="w-52"
            tetik={({ acik: _acik, ...t }) => (
              <button type="button" {...t} className={IKON_TETIK} aria-label={dg.digerIslemler} disabled={isleniyor}>
                <Ikon d={IKON.dahaFazla} />
              </button>
            )}
          >
            {eylemler.map((e) => (
              <MenuOgesi key={e} tehlike={e !== 'geri_getir'} devreDisi={isleniyor} onClick={() => eylem(r, e)}>
                {EYLEM_ADI(dg)[e]}
              </MenuOgesi>
            ))}
          </AcilirMenu>
        )}
      </span>
    );
  };

  const adSutunu = (baslik: string): TabloSutunu<RehberOzeti> => ({
    anahtar: 'ad',
    baslik,
    hucre: (r) => (
      <span className="flex min-w-0 items-center gap-3">
        <Kucuk r={r} />
        <AdHucresi
          ad={<Link href={satirAdresi(r)}>{satirAdi(r, (iso) => formatTarih(iso, dil), dil)}</Link>}
          alt={
            <>
              {r.durum === 'taslak'
                ? [dg.taslakEtiketi, taslakPlatformlari(r)].filter(Boolean).join(' · ')
                : r.durum === 'arsivlendi'
                  ? dg.listedenKaldirildi
                  : null}
              {/* Telefonda gizlenen bütçe/eksik/platform sütunlarının yerine (telefonOzeti). */}
              {(() => {
                const ozet = telefonOzeti(r, sekme, (m, b) => formatMoney(m, b, { dil }), dil);
                return ozet ? <span className="block sm:hidden">{ozet}</span> : null;
              })()}
            </>
          }
        />
      </span>
    ),
  });
  const butceSutunu: TabloSutunu<RehberOzeti> = {
    anahtar: 'butce',
    baslik: dg.sutun.butce,
    sayi: true,
    // Telefonda ad hücresinin özet satırında (telefonOzeti): "Devam et" ekrana sığsın.
    ikincil: true,
    hucre: (r) => <span className="tutar">{butceMetni(r.butce, (m, b) => formatMoney(m, b, { dil }), dil) ?? '-'}</span>,
  };
  const zamanSutunu = (baslik: string): TabloSutunu<RehberOzeti> => ({
    anahtar: 'zaman',
    baslik,
    ikincil: true,
    hucre: (r) => <span className="whitespace-nowrap text-ink-muted">{formatRelative(r.updatedAt, dil)}</span>,
  });
  const eylemSutunu: TabloSutunu<RehberOzeti> = { anahtar: 'eylem', baslik: '', sayi: true, hucre: eylemHucresi };
  const platformSutunu: TabloSutunu<RehberOzeti> = {
    anahtar: 'platform',
    baslik: 'Platform',
    ikincil: true,
    hucre: (r) => {
      const rozetler = platformRozetleri(r, dil);
      if (rozetler.length === 0) return <span className="text-ink-muted">-</span>;
      return (
        <span className="flex flex-wrap gap-1.5">
          {rozetler.map((z) => (
            <span key={z.platform} className="grid gap-0.5">
              <Rozet hal={ROZET_HALI[z.ton]} title={z.ipucu ?? undefined}>
                {z.etiket}
              </Rozet>
              {z.ipucu && <small className="max-w-[28ch] text-12 text-danger-strong">{z.ipucu}</small>}
            </span>
          ))}
        </span>
      );
    },
  };
  const eksikSutunu: TabloSutunu<RehberOzeti> = {
    anahtar: 'eksik',
    baslik: dg.sutun.eksik,
    ikincil: true,
    hucre: (r) => {
      const e = eksikEtiketi(r, dil);
      return <Rozet hal={e.hata ? 'hata' : 'taslak'}>{e.metin}</Rozet>;
    },
  };
  const sutunlar: Record<GirisSekmesi, Array<TabloSutunu<RehberOzeti>>> = {
    yayindakiler: [adSutunu(dg.sutun.reklam), platformSutunu, butceSutunu, zamanSutunu(dg.sutun.sonDegisiklik), eylemSutunu],
    taslaklar: [adSutunu(dg.sutun.taslak), eksikSutunu, butceSutunu, zamanSutunu(dg.sutun.sonDokunus), eylemSutunu],
    arsiv: [adSutunu(dg.sutun.reklam), platformSutunu, butceSutunu, zamanSutunu(dg.sutun.sonDegisiklik), eylemSutunu],
  };
  const tablo = (satirlar: RehberOzeti[], etiket: string) => (
    <Tablo
      etiket={etiket}
      sutunlar={sutunlar[sekme]}
      satirlar={satirlar}
      satirAnahtari={(r) => r.id}
      sayfalama={{ bas: satirlar.length ? 1 : 0, son: satirlar.length, toplam: satirlar.length }}
    />
  );

  const baslik = (
    <SayfaBasligi
      bolum={menuBolumuEtiketi('/reklam', dil)}
      baslik={menuSatiriEtiketi('/reklam', dil)}
      aciklama={
        <>
          <b className="text-ink">{workspaceAdi}</b> · {dg.aciklama}
        </>
      }
      eylemler={
        <Dugme ikon="＋" bekliyor={aciliyor} onClick={() => void yeni()}>
          {dg.yeniReklam}
        </Dugme>
      }
    />
  );

  return (
    <div className="grid w-full gap-6">
      {baslik}
      {devredildi && (
        <Serit ton="bilgi" baslik={dg.devredildiBaslik}>
          {dg.devredildiGovde}
        </Serit>
      )}
      {hata && (
        <Serit ton="hata" baslik={dg.yeniAcilamadi}>
          {hata}
        </Serit>
      )}
      {islemHatasi && (
        <Serit ton="hata" baslik={dg.islemTamamlanamadi}>
          {islemHatasi}
        </Serit>
      )}
      {listeHatasi ? (
        <HataDurumu baslik={dg.listeOkunamadi} mesaj={listeHatasi} onTekrar={() => router.refresh()} />
      ) : (
        <SayfaIcDuzen
          menu={
            <SayfaIcMenu
              etiket={dg.durumEtiketi}
              secili={sekme}
              ogeler={GIRIS_SEKMELERI.map((k: GirisSekmesi) => ({
                deger: k,
                etiket: SEKME_ADLARI[k],
                href: baglanti('/reklam', tasinan, { sekme: k }),
                sayi: gruplar[k].length,
              }))}
            />
          }
        >
          {kesildi && (
            <Serit ton="bilgi" baslik={dg.kesildi(liste.satirlar.length, liste.toplam)}>
              {dg.kesildiGovde}
            </Serit>
          )}
          {gorunen.length === 0 && !(sekme === 'taslaklar' && taslak.eski.length > 0) ? (
            <BosDurum
              baslik={dg.bosBaslik[sekme]}
              neden={bosSekmeMetni(dil)[sekme]}
              eylem={
                sekme !== 'arsiv' && (
                  <Dugme ton="ikincil" boyut="kucuk" bekliyor={aciliyor} onClick={() => void yeni()}>
                    {dg.yeniReklam}
                  </Dugme>
                )
              }
            />
          ) : (
            gorunen.length > 0 && (
              <Kart dolgu={false}>{tablo(gorunen, SEKME_ADLARI[sekme])}</Kart>
            )
          )}
          {sekme === 'taslaklar' && taslak.eski.length > 0 && (
            <Kart
              dolgu={false}
              baslik={dg.eskiTaslaklar}
              baslikEki={dg.eskiTaslakEki(taslak.eski.length)}
              eylem={
                <Dugme
                  ton="tehlike"
                  boyut="kucuk"
                  disabled={isleniyor}
                  onClick={() => {
                    setOnay({ tur: 'toplu_sil', satirlar: taslak.eski });
                    setOnayAcik(true);
                  }}
                >
                  {dg.hepsiniSil}
                </Dugme>
              }
            >
              {tablo(taslak.eski, dg.eskiTaslaklar)}
            </Kart>
          )}
        </SayfaIcDuzen>
      )}

      {/* Pencere DOM'da kalıyor (`Pencere`): açılıp kapanma görünürlük geçişiyle. */}
      <Pencere
        acik={onayAcik}
        onKapat={() => !isleniyor && setOnayAcik(false)}
        baslik={metin?.baslik ?? ''}
        genislik="dar"
        altEylemler={
          <>
            <Dugme ton="ikincil" disabled={isleniyor} onClick={() => setOnayAcik(false)}>
              {dg.vazgec}
            </Dugme>
            <Dugme
              ton={onay?.tur === 'listeden_kaldir' ? 'birincil' : 'tehlike'}
              bekliyor={isleniyor}
              disabled={!onay}
              onClick={() => onay && void uygula('arsivle', onay.satirlar)}
            >
              {isleniyor ? metin?.suruyor : metin?.dugme}
            </Dugme>
          </>
        }
      >
        <div className="grid gap-3 text-14 text-ink">
          <p className="m-0">
            {metin?.govde}
            {onay && onay.satirlar.length > 1 && ` ${dg.taslakSayisi(onay.satirlar.length)}`}
          </p>
          {onay && onay.satirlar.length === 1 && (
            <p className="m-0">
              <b>{satirAdi(onay.satirlar[0]!, (iso) => formatTarih(iso, dil), dil)}</b>
            </p>
          )}
          {metin?.yoneticiBaglantisi && (
            <p className="m-0">
              <Link className={KART_BAGLANTISI} href={baglanti(REKLAM_YONETICISI, tasinan)}>
                {dg.yoneticiyeGit}
              </Link>
            </p>
          )}
        </div>
      </Pencere>
    </div>
  );
}

const EYLEM_ADI = (dg: { eylem: { taslagiSil: string; listedenKaldir: string; geriGetir: string } }): Readonly<Record<SatirEylemi, string>> => ({
  taslagi_sil: dg.eylem.taslagiSil,
  listeden_kaldir: dg.eylem.listedenKaldir,
  geri_getir: dg.eylem.geriGetir,
});

/**
 * Satırın küçük görseli: ilk medyanın görseli (video ise kapağı). Yoksa ya
 * da yüklenemezse amaç simgesi; yüklenemediği `title`da yazıyor (boş kutu
 * "görsel yok" ile "görsel okunamadı"yı ayırt ettirmezdi).
 */
function Kucuk({ r }: { r: RehberOzeti }) {
  const d = useSozluk(reklamSozlugu);
  const [dustu, setDustu] = useState(false);
  const amac = r.amac && (REHBER_AMAC_KODLARI as readonly string[]).includes(r.amac) ? (r.amac as RehberAmacKodu) : null;
  const kutu = 'h-10 w-10 shrink-0 rounded-alan border border-line bg-surface-sunken';
  if (r.gorselVarlikId && !dustu) {
    // Düz <img>: önizleme kimlik doğrulamalı API ucu, next/image onu optimize edemez.
    return (
      <img className={`${kutu} object-cover`} src={onizlemeAdresi(`/assets/${r.gorselVarlikId}/preview`)} alt="" loading="lazy" onError={() => setDustu(true)} />
    );
  }
  return (
    <span className={`${kutu} grid place-items-center text-ink-muted`} title={dustu ? d.giris.gorselYuklenemedi : undefined} aria-hidden>
      {amac ? <Ikon d={AMAC_IKONU[amac]} boyut={20} /> : <Ikon d={IKON.bilgi} boyut={20} />}
    </span>
  );
}

/** Rehber açılamadığında (okuma hatası, yanlış workspace, yetki) tek kutu. */
export function RehberMesaji({ baslik, children, geri }: { baslik: string; children: React.ReactNode; geri?: string }) {
  const { dil } = useDil();
  const d = useSozluk(reklamSozlugu);
  return (
    <SayfaIskeleti bolum={menuBolumuEtiketi('/reklam', dil)} baslik={menuSatiriEtiketi('/reklam', dil)}>
      <HataDurumu
        baslik={baslik}
        mesaj={children}
        eylem={
          geri && (
            <Link className={KART_BAGLANTISI} href={geri}>
              {d.giris.listeyeDon}
            </Link>
          )
        }
      />
    </SayfaIskeleti>
  );
}
