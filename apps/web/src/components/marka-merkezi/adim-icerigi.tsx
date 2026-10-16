'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { kapiNedeni } from '@advetics/shared';
import type {
  HazirlamaSorusu,
  HazirlamaYaniti,
  KurulumBeyani,
  KurulumListesiParcasi,
  KurulumYaniti,
  SpecialAdCategory,
  SyncStatusResponse,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import {
  ayarlarAdresi,
  markaMerkeziAdresi,
  veriDurumuAdresi,
  type KurulumListesiAdimi,
  type KurulumPlatformu,
} from '@/lib/panel-adresleri';
import { SpecialCategoryPicker } from '@/components/tenancy/special-category-picker';
import { DanismanAta } from '@/components/tenancy/danisman-ata';
import type { MemberRow } from '@/components/tenancy/team-manager';
import type { MusteriBilgileri } from '@/components/tenancy/musteri-bilgi-formu';
import { SenkronDurumu } from '@/components/sync/senkron-durumu';
import { AiDoldur } from '@/components/bilgi-bankasi/ai-doldur';
import { AdimSatiri } from './kurulum-bolumu';
import { ButceDegistir, Soru } from './hazirlama-karti';
import { OlcumBolumu } from './olcum-bolumu';
import { DurumRozeti, Ga4KaynakDurumu, VarsayilanKitleSecici } from './kurulum-yardimcilari';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { listeDurumu, parcaAdi } from './kurulum-listesi-mantik';
import { useDil, useSozluk } from '@/dil/saglayici';
import { markaMerkeziKurulumSozlugu } from '@/dil/sozlukler/marka-merkezi-kurulum';
import { FirmaBilgileri } from './firma-bilgileri';
import { BildirimlerBolumu } from './bildirimler-bolumu';
import { YouTubeKanalBul } from '@/components/connections/youtube-kanal-bul';
import { BeyanAlani } from './beyan-alani';

/**
 * ═══ BİR KURULUM ADIMININ İÇERİĞİ — LİSTEDE VE SİHİRBAZDA AYNI ═══
 * (docs/kurulum-sihirbazi/MIMARI.md § 4)
 *
 * Marka Merkezi › Kurulum (liste görünümü) ve Kurulum sihirbazı (adım adım)
 * AYNI adımı çiziyor. İçerik iki ayrı yerde yazılsaydı aynı adım iki ekranda
 * ayrışırdı — bu modülün çözmek için doğduğu üç-sayaç hatasının içerik
 * kopyası. Her alanın TEK EVİ var ve burada o ev çağrılıyor: firma bilgileri
 * `FirmaBilgileri`/`MusteriBilgiFormu`, bildirim kanalı `BildirimlerBolumu`,
 * sorumlu kişi `DanismanAta`, kategori `SpecialCategoryPicker`. İkinci form
 * YAZILMIYOR.
 *
 * `kip`: listede marka adımı Marka bölümüne götürüyor; sihirbazda AI
 * doldurma da burada (kullanıcı sihirbazdan çıkmasın). Fark yalnız bu.
 */
export interface AdimYetkileri {
  /** `kurulum.yaz` */
  yazabilir: boolean;
  /** `kurulum.hesap` */
  hesapYazabilir: boolean;
  /** `kurulum.beyan` */
  beyanYazabilir: boolean;
  /** `firma.yaz` */
  firmaYazabilir: boolean;
  /** `bildirim.gor` / `bildirim.yaz` */
  bildirimGor: boolean;
  bildirimYaz: boolean;
  /** `erisim.gor` / `ekip.yonet` */
  erisimGor: boolean;
  ekipYonet: boolean;
  /** `veriDurumu.gor` */
  veriGor: boolean;
  /** `marka.yaz` */
  markaYaz: boolean;
  /** `youtube.ekle` */
  youtubeEkle: boolean;
}

export interface AdimIcerigiOzellikleri {
  a: KurulumListesiAdimi;
  clientId: string;
  workspaceAdi: string;
  kurulum: KurulumYaniti | null;
  sorular: HazirlamaSorusu[];
  hazirlamaVar: boolean;
  /** Workspace'in kayıtlı özel reklam kategorileri; okunamadıysa null. */
  kategoriler: SpecialAdCategory[] | null;
  /** `GET /clients/:id`; okunamadıysa null (firma kartı nedenini yazar). */
  detay: (MusteriBilgileri & { timezone: string; reportingCurrency: string }) | null;
  beyanlar: readonly KurulumBeyani[] | null;
  kullanilmayanlar: readonly KurulumPlatformu[];
  yetki: AdimYetkileri;
  /** Oturumdaki kullanıcının e-postası (bildirim kanalı varsayılanı). */
  ajansAdresi: string;
  kurulumGuncelle: (v: KurulumYaniti) => void;
  hazirlamaGuncelle: (v: HazirlamaYaniti) => void;
  /** Kaynakları yeniden oku (beyan, firma, bildirim yazıldıktan sonra). */
  tazele: () => void;
  kip: 'liste' | 'sihirbaz';
  /** OAuth izin dönüşü; verilmezse Marka Merkezi › Kurulum. */
  izinDonusu?: string;
}

const hataMetniDil = (e: unknown, yedek: string) => (e instanceof ApiRequestError ? e.message : yedek);

export function AdimIcerigi(o: AdimIcerigiOzellikleri) {
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const { dil } = useDil();
  const { a, clientId, kurulum, sorular, yetki } = o;
  const soru = (kod: HazirlamaSorusu['kod']) => sorular.find((q) => q.kod === kod) ?? null;
  const beyan = (
    <BeyanAlani
      adim={a.kod}
      clientId={clientId}
      beyanlar={o.beyanlar}
      kullanilmayanlar={o.kullanilmayanlar}
      yazabilir={yetki.beyanYazabilir}
      tazele={o.tazele}
    />
  );

  /*
   * ADIM BÜTÜNÜYLE KAPALIYSA (kullanılmıyor ya da "web sitemiz yok") parça
   * listesi boş; yalnız kararın kendisi ve "Geri al". Boş bir kutu çizmek
   * "bir şey yüklenmedi" diye okunurdu.
   */
  if (a.durum === 'kullanilmiyor' || (a.durum === 'kapsam_disi' && a.parcalar.length === 0)) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          {a.durum === 'kullanilmiyor' ? d.kullanilmiyorAdim : d.kapsamDisiAdim}
        </p>
        {beyan}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line rounded-kart border border-line bg-surface">
        {a.parcalar.map((p) => {
          const k = p.kaynak === 'kurulum' ? kurulum?.adimlar.find((x) => x.kod === p.kod) : undefined;
          return k && kurulum && p.durum !== 'kapsam_disi' ? (
            <AdimSatiri
              key={`${p.kaynak}-${p.kod}`}
              a={k}
              v={kurulum}
              clientId={clientId}
              yazabilir={yetki.yazabilir}
              hesapYazabilir={yetki.hesapYazabilir}
              guncelle={o.kurulumGuncelle}
              izinDonusAdresi={o.izinDonusu}
            />
          ) : (
            <ParcaSatiri key={`${p.kaynak}-${p.kod}`} p={p} />
          );
        })}
      </ul>

      {a.kod === 'bilgiler' && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink">{d.iletisimFirma}</p>
          {o.detay === null ? (
            <p className="text-xs text-danger-strong">{d.workspaceBilgisiOkunamadi}</p>
          ) : (
            <FirmaBilgileri
              clientId={clientId}
              bilgi={o.detay}
              saatDilimi={o.detay.timezone}
              paraBirimi={o.detay.reportingCurrency}
              canManage={yetki.firmaYazabilir}
              kompakt={o.kip === 'sihirbaz'}
            />
          )}
        </div>
      )}

      {a.kod === 'piksel' && soru('piksel') && <SoruAlani yazabilir={yetki.yazabilir} clientId={clientId} soru={soru('piksel')!} guncelle={o.hazirlamaGuncelle} />}

      {a.kod === 'olcum' && (
        <div className="space-y-3">
          <Ga4KaynakDurumu clientId={clientId} />
          <div>
            <p className="mb-2 text-xs font-semibold text-ink">{d.neyiOlcuyoruz}</p>
            <OlcumBolumu clientId={clientId} yazabilir={yetki.yazabilir} />
          </div>
        </div>
      )}

      {a.kod === 'marka' && (
        <div className="space-y-3">
          {/* SİHİRBAZDA AI DOLDURMA BURADA: kullanıcı sihirbazdan çıkmadan siteden doldurur, onaylar. */}
          {o.kip === 'sihirbaz' && <AiDoldur clientId={clientId} canWrite={yetki.markaYaz} />}
          <p className="flex flex-wrap gap-3 text-xs">
            <Link href={markaMerkeziAdresi('marka', clientId, 'marka-bilgileri')} className="font-semibold text-ink underline-offset-2 hover:underline">
              {d.markaBilgileriniDoldur}
            </Link>
            <Link href={markaMerkeziAdresi('marka', clientId, 'logo')} className="font-semibold text-ink underline-offset-2 hover:underline">
              {d.logoYukle}
            </Link>
          </p>
        </div>
      )}

      {a.kod === 'varsayilanlar' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink">{d.ozelKategori}</p>
            {/*
              İLK BEYAN hazırlama sorusuyla (beyan + "cevaplandı" bayrağı +
              denetim kaydı birlikte). Beyan verildikten sonra DEĞİŞTİRMEK
              workspace kaydından (`PATCH /clients/:id`): hazırlama ucu bekleyen
              soru yokken cevabı bilerek reddediyor (Ajan 4, Ö6).
            */}
            {soru('kategori') ? (
              <SoruAlani yazabilir={yetki.yazabilir} clientId={clientId} soru={soru('kategori')!} guncelle={o.hazirlamaGuncelle} />
            ) : o.kategoriler === null ? (
              <p className="text-xs text-danger-strong">{d.kategoriOkunamadi}</p>
            ) : (
              <SpecialCategoryPicker clientId={clientId} value={o.kategoriler} canManage={yetki.yazabilir} />
            )}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink">{d.konumVeKitle}</p>
            {soru('konum') ? (
              <SoruAlani yazabilir={yetki.yazabilir} clientId={clientId} soru={soru('konum')!} guncelle={o.hazirlamaGuncelle} />
            ) : (
              <VarsayilanKitleSecici clientId={clientId} yazabilir={yetki.yazabilir} />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-ink">{d.gunlukButce}</p>
            {!o.hazirlamaVar ? (
              <p className="text-xs text-ink-muted">{d.hazirlikKosmadi}</p>
            ) : yetki.yazabilir ? (
              <ButceDegistir clientId={clientId} guncelle={o.hazirlamaGuncelle} />
            ) : (
              <p className="text-xs text-ink-muted">{kapiNedeni('kurulum.yaz', dil)}</p>
            )}
          </div>
        </div>
      )}

      {a.kod === 'bildirimler' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink">{d.bildirimKanallari}</p>
            {yetki.bildirimGor ? (
              <BildirimlerBolumu clientId={clientId} yazabilir={yetki.bildirimYaz} ajansAdresi={o.ajansAdresi} />
            ) : (
              <p className="text-xs text-ink-muted">{kapiNedeni('bildirim.gor', dil)}</p>
            )}
          </div>
          <ErisimParcasi clientId={clientId} workspaceAdi={o.workspaceAdi} gor={yetki.erisimGor} yonet={yetki.ekipYonet} />
          {/* MÜŞTERİYE PANEL GİRİŞİ SAYILMAZ (MIMARI § 2b); evi Ayarlar › Ekip, ikinci form yazılmıyor. */}
          <p className="text-xs text-ink-muted">
            {d.musteriHesabi}{' '}
            <Link href={ayarlarAdresi('ekip', { workspace: clientId, capa: 'kisiler' })} className="font-semibold text-ink underline-offset-2 hover:underline">
              {d.kisiEkle}
            </Link>
          </p>
        </div>
      )}

      {/*
        YOUTUBE: kanal bulucunun AYNISI (Marka Merkezi › Bağlı kanallar). Tamam
        ya da beyanla kapalıysa bulucu gizli; ikinci bir form yazılmıyor.
      */}
      {a.kod === 'youtube' && a.durum !== 'tamam' && a.durum !== 'kapsam_disi' && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink">{d.youtubeKanalBul}</p>
          {yetki.youtubeEkle ? (
            <YouTubeKanalBul clientId={clientId} workspaceAdi={o.workspaceAdi} baglandi={o.tazele} />
          ) : (
            <p className="text-xs text-ink-muted">{kapiNedeni('youtube.ekle', dil)}</p>
          )}
        </div>
      )}

      {a.kod === 'veri' && <VeriParcasi clientId={clientId} gor={yetki.veriGor} />}

      {beyan}
    </div>
  );
}

/** Kurulum kaynaklı olmayan parçanın satırı: durum ve NEDEN. */
export function ParcaSatiri({ p }: { p: KurulumListesiParcasi }) {
  const { dil } = useDil();
  const d = listeDurumu(p.durum, dil);
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
      <span className="mt-0.5 shrink-0">
        <DurumRozeti durum={p.durum} etiket={d.etiket} />
      </span>
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <p className="font-medium text-ink">
          {parcaAdi(p.kod, dil)}
          {p.baslik && <span className="font-normal text-ink-muted"> · {p.baslik}</span>}
        </p>
        <p className="text-xs text-ink-muted">{p.neden}</p>
      </div>
    </li>
  );
}

function SoruAlani({
  yazabilir,
  clientId,
  soru,
  guncelle,
}: {
  yazabilir: boolean;
  clientId: string;
  soru: HazirlamaSorusu;
  guncelle: (v: HazirlamaYaniti) => void;
}) {
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  if (!yazabilir) {
    return (
      <p className="text-xs text-ink-muted">
        {soru.soru} {d.soruYetkisiz}
      </p>
    );
  }
  return <Soru clientId={clientId} soru={soru} guncelle={guncelle} />;
}

type Hal<T> = { tur: 'okunuyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; v: T };

/**
 * SORUMLU KİŞİ — bu workspace'i görenler ve "Danışman ata". DÖRT HÂL AYRI
 * (okunuyor / hata / boş + neden / dolu): `.catch(() => setX([]))` "kimse
 * yok" ile "liste okunamadı"yı aynı boş alana çevirirdi.
 */
function ErisimParcasi({ clientId, workspaceAdi, gor, yonet }: { clientId: string; workspaceAdi: string; gor: boolean; yonet: boolean }) {
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const { dil } = useDil();
  const [uyeler, setUyeler] = useState<Hal<MemberRow[]>>({ tur: 'okunuyor' });
  const oku = useCallback(async () => {
    try {
      setUyeler({ tur: 'geldi', v: await apiFetch<MemberRow[]>(`/members?clientId=${encodeURIComponent(clientId)}`) });
    } catch (e) {
      setUyeler({ tur: 'hata', mesaj: hataMetniDil(e, d.sunucuyaUlasilamadi) });
    }
  }, [clientId, d]);
  useEffect(() => {
    if (gor) void oku();
  }, [gor, oku]);

  if (!gor) {
    return (
      <div className="space-y-1">
        <p className="text-xs font-semibold text-ink">{d.sorumluKisi}</p>
        <p className="text-xs text-ink-muted">{kapiNedeni('erisim.gor', dil)}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-ink">{d.sorumluKisi}</p>
      {uyeler.tur === 'okunuyor' && <p className="text-xs text-ink-muted">{d.ekipOkunuyor}</p>}
      {uyeler.tur === 'hata' && (
        <Serit
          ton="hata"
          baslik={d.ekipOkunamadi}
          eylemler={
            <Dugme ton="ikincil" boyut="kucuk" onClick={() => void oku()}>
              {d.tekrarDene}
            </Dugme>
          }
        >
          {uyeler.mesaj}
        </Serit>
      )}
      {uyeler.tur === 'geldi' && (
        <>
          <p className="text-xs text-ink-muted">
            {uyeler.v.length === 0
              ? d.kimseAtanmamis
              : d.kisiGoruyor(
                  uyeler.v.length,
                  `${uyeler.v
                    .slice(0, 5)
                    .map((m) => m.fullName ?? m.email)
                    .join(', ')}${uyeler.v.length > 5 ? d.veKisiDaha(uyeler.v.length - 5) : ''}`,
                )}
          </p>
          {yonet ? (
            <DanismanAta clientId={clientId} clientName={workspaceAdi} mevcutUyeIdleri={uyeler.v.map((m) => m.id)} />
          ) : (
            <p className="text-xs text-ink-muted">{kapiNedeni('ekip.yonet', dil)}</p>
          )}
        </>
      )}
    </div>
  );
}

/** VERİ AKIŞI — Veri durumu kartının AYNISI (`SenkronDurumu`), adresteki workspace için. */
function VeriParcasi({ clientId, gor }: { clientId: string; gor: boolean }) {
  const d = useSozluk(markaMerkeziKurulumSozlugu);
  const { dil } = useDil();
  const [veri, setVeri] = useState<Hal<SyncStatusResponse>>({ tur: 'okunuyor' });
  const oku = useCallback(async () => {
    try {
      setVeri({ tur: 'geldi', v: await apiFetch<SyncStatusResponse>(`/sync/status?clientId=${encodeURIComponent(clientId)}`) });
    } catch (e) {
      setVeri({ tur: 'hata', mesaj: hataMetniDil(e, d.sunucuyaUlasilamadi) });
    }
  }, [clientId, d]);
  useEffect(() => {
    if (gor) void oku();
  }, [gor, oku]);

  if (!gor) return <p className="text-xs text-ink-muted">{kapiNedeni('veriDurumu.gor', dil)}</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink">{d.hesaplarinVeriDurumu}</p>
        <Link href={veriDurumuAdresi(clientId)} className="text-xs font-semibold text-ink underline-offset-2 hover:underline">
          {d.veriDurumunuAc}
        </Link>
      </div>
      {veri.tur === 'okunuyor' && <p className="text-xs text-ink-muted">{d.veriOkunuyor}</p>}
      {veri.tur === 'hata' && (
        <Serit
          ton="hata"
          baslik={d.veriOkunamadi}
          eylemler={
            <Dugme ton="ikincil" boyut="kucuk" onClick={() => void oku()}>
              {d.tekrarDene}
            </Dugme>
          }
        >
          {veri.mesaj}
        </Serit>
      )}
      {veri.tur === 'geldi' && <SenkronDurumu data={veri.v} />}
    </div>
  );
}
