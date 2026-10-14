'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { REHBER_AMAC_KODLARI, type RehberAmacKodu, type RehberKaydi, type RehberListesi, type RehberOzeti } from '@advetics/shared';
import { ApiRequestError, apiFetch, onizlemeAdresi } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { formatMoney, formatRelative, formatTarih } from '@/lib/format';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';
import {
  BOS_SEKME_METNI,
  GIRIS_SEKMELERI,
  ONAY_METINLERI,
  SEKME_ADLARI,
  aktifSekme,
  birincilEylem,
  butceMetni,
  eksikEtiketi,
  platformRozetleri,
  satirAdi,
  satirEylemleri,
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
      setHata(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
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
        hatalar.push(e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
      }
    }
    setIsleniyor(false);
    setOnayAcik(false);
    setIslemHatasi(satirlar.length === 1 && hatalar[0] ? hatalar[0] : topluSonucMetni(satirlar.length, hatalar));
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
  const metin = onay ? ONAY_METINLERI[onay.tur] : null;

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
          {birincilEylem(r)}
        </Link>
        {eylemler.length > 0 && (
          <AcilirMenu
            tasma="portal"
            etiket="Diğer işlemler"
            hizala="sag"
            yon="yukari"
            genislik="w-52"
            tetik={({ acik: _acik, ...t }) => (
              <button type="button" {...t} className={IKON_TETIK} aria-label="Diğer işlemler" disabled={isleniyor}>
                <Ikon d={IKON.dahaFazla} />
              </button>
            )}
          >
            {eylemler.map((e) => (
              <MenuOgesi key={e} tehlike={e !== 'geri_getir'} devreDisi={isleniyor} onClick={() => eylem(r, e)}>
                {EYLEM_ADI[e]}
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
          ad={<Link href={satirAdresi(r)}>{satirAdi(r, formatTarih)}</Link>}
          alt={
            <>
              {r.durum === 'taslak'
                ? ['Taslak', taslakPlatformlari(r)].filter(Boolean).join(' · ')
                : r.durum === 'arsivlendi'
                  ? 'Listeden kaldırıldı'
                  : null}
              {/* Telefonda gizlenen bütçe/eksik/platform sütunlarının yerine (telefonOzeti). */}
              {(() => {
                const ozet = telefonOzeti(r, sekme, (m, b) => formatMoney(m, b));
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
    baslik: 'Bütçe',
    sayi: true,
    // Telefonda ad hücresinin özet satırında (telefonOzeti): "Devam et" ekrana sığsın.
    ikincil: true,
    hucre: (r) => <span className="tutar">{butceMetni(r.butce, (m, b) => formatMoney(m, b)) ?? '-'}</span>,
  };
  const zamanSutunu = (baslik: string): TabloSutunu<RehberOzeti> => ({
    anahtar: 'zaman',
    baslik,
    ikincil: true,
    hucre: (r) => <span className="whitespace-nowrap text-ink-muted">{formatRelative(r.updatedAt)}</span>,
  });
  const eylemSutunu: TabloSutunu<RehberOzeti> = { anahtar: 'eylem', baslik: '', sayi: true, hucre: eylemHucresi };
  const platformSutunu: TabloSutunu<RehberOzeti> = {
    anahtar: 'platform',
    baslik: 'Platform',
    ikincil: true,
    hucre: (r) => {
      const rozetler = platformRozetleri(r);
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
    baslik: 'Eksik',
    ikincil: true,
    hucre: (r) => {
      const e = eksikEtiketi(r);
      return <Rozet hal={e.hata ? 'hata' : 'taslak'}>{e.metin}</Rozet>;
    },
  };
  const sutunlar: Record<GirisSekmesi, Array<TabloSutunu<RehberOzeti>>> = {
    yayindakiler: [adSutunu('Reklam'), platformSutunu, butceSutunu, zamanSutunu('Son değişiklik'), eylemSutunu],
    taslaklar: [adSutunu('Taslak'), eksikSutunu, butceSutunu, zamanSutunu('Son dokunuş'), eylemSutunu],
    arsiv: [adSutunu('Reklam'), platformSutunu, butceSutunu, zamanSutunu('Son değişiklik'), eylemSutunu],
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
      bolum="Oluştur"
      baslik="AdvCampaign"
      aciklama={
        <>
          <b className="text-ink">{workspaceAdi}</b> · Meta ve Google reklamını altı adımda kur
        </>
      }
      eylemler={
        <Dugme ikon="＋" bekliyor={aciliyor} onClick={() => void yeni()}>
          Yeni reklam
        </Dugme>
      }
    />
  );

  return (
    <div className="grid w-full gap-6">
      {baslik}
      {devredildi && (
        <Serit ton="bilgi" baslik="İyileştir'den gelen istek rehberle kuruluyor">
          Sohbet kalktı. &quot;Yeni reklam&quot;la başla; amaç, bütçe ve metni adım adım seçersin.
        </Serit>
      )}
      {hata && (
        <Serit ton="hata" baslik="Yeni reklam açılamadı">
          {hata}
        </Serit>
      )}
      {islemHatasi && (
        <Serit ton="hata" baslik="İşlem tamamlanamadı">
          {islemHatasi}
        </Serit>
      )}
      {listeHatasi ? (
        <HataDurumu baslik="Reklam listesi okunamadı" mesaj={listeHatasi} onTekrar={() => router.refresh()} />
      ) : (
        <SayfaIcDuzen
          menu={
            <SayfaIcMenu
              etiket="Reklam durumu"
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
            <Serit ton="bilgi" baslik={`${liste.satirlar.length} / ${liste.toplam} kayıt gösteriliyor`}>
              Bölüm sayıları gösterilenlere göre. En eski arşiv kayıtları listede yok.
            </Serit>
          )}
          {gorunen.length === 0 && !(sekme === 'taslaklar' && taslak.eski.length > 0) ? (
            <BosDurum
              baslik={`${SEKME_ADLARI[sekme]} boş`}
              neden={BOS_SEKME_METNI[sekme]}
              eylem={
                sekme !== 'arsiv' && (
                  <Dugme ton="ikincil" boyut="kucuk" bekliyor={aciliyor} onClick={() => void yeni()}>
                    Yeni reklam
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
              baslik="Eski taslaklar"
              baslikEki={`${taslak.eski.length} taslak · amaç seçilmemiş ya da bir haftadır dokunulmamış`}
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
                  Hepsini sil
                </Dugme>
              }
            >
              {tablo(taslak.eski, 'Eski taslaklar')}
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
              Vazgeç
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
            {onay && onay.satirlar.length > 1 && ` (${onay.satirlar.length} taslak)`}
          </p>
          {onay && onay.satirlar.length === 1 && (
            <p className="m-0">
              <b>{satirAdi(onay.satirlar[0]!, formatTarih)}</b>
            </p>
          )}
          {metin?.yoneticiBaglantisi && (
            <p className="m-0">
              <Link className={KART_BAGLANTISI} href={baglanti(REKLAM_YONETICISI, tasinan)}>
                Reklam Yöneticisi&apos;ne git →
              </Link>
            </p>
          )}
        </div>
      </Pencere>
    </div>
  );
}

const EYLEM_ADI: Readonly<Record<SatirEylemi, string>> = {
  taslagi_sil: 'Taslağı sil',
  listeden_kaldir: 'Listeden kaldır',
  geri_getir: 'Geri getir',
};

/**
 * Satırın küçük görseli: ilk medyanın görseli (video ise kapağı). Yoksa ya
 * da yüklenemezse amaç simgesi; yüklenemediği `title`da yazıyor (boş kutu
 * "görsel yok" ile "görsel okunamadı"yı ayırt ettirmezdi).
 */
function Kucuk({ r }: { r: RehberOzeti }) {
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
    <span className={`${kutu} grid place-items-center text-ink-muted`} title={dustu ? 'Görsel yüklenemedi' : undefined} aria-hidden>
      {amac ? <Ikon d={AMAC_IKONU[amac]} boyut={20} /> : <Ikon d={IKON.bilgi} boyut={20} />}
    </span>
  );
}

/** Rehber açılamadığında (okuma hatası, yanlış workspace, yetki) tek kutu. */
export function RehberMesaji({ baslik, children, geri }: { baslik: string; children: React.ReactNode; geri?: string }) {
  return (
    <SayfaIskeleti bolum="Oluştur" baslik="AdvCampaign">
      <HataDurumu
        baslik={baslik}
        mesaj={children}
        eylem={
          geri && (
            <Link className={KART_BAGLANTISI} href={geri}>
              Reklam listesine dön →
            </Link>
          )
        }
      />
    </SayfaIskeleti>
  );
}
