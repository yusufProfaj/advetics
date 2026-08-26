'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { PlatformLogo, adAccountKanali, profilKanali } from '@/components/platform-logo';
import type { ChannelKind } from '@advetics/shared';
import { MusteriDetay, DetayBolumu, DetaySatiri } from './musteri-detay';
import { MusteriBilgiFormu } from './musteri-bilgi-formu';
import type { ClientAdAccount, ClientProfile } from './client-assets';

/**
 * ═══ MÜŞTERİ KARTI — KÜÇÜK HÂLİ ═══
 *
 * Kart daha önce müşteriye dair HER ŞEYİ taşıyordu: varlıkların tam listesi,
 * her satırda açılır boost hesabı seçici, havuzdan atama arama kutusu, özel
 * reklam kategorisi onay kutuları ve üç eylem. Üç sütunlu ızgarada tek kart
 * ekranın yarısı kadardı; sekiz müşteri dört ekran kaydırma demekti ve
 * "hangi müşteride kaç varlık bağlı" sorusuna bakışta cevap alınamıyordu.
 *
 * KARTTA YALNIZCA SAYILAR VE HANGİ KANALLARIN BAĞLI OLDUĞU var. Yönetim —
 * atama, kategori, arşivleme — detay penceresine taşındı. İkisi ayrı iş:
 * liste "kim var" sorusuna, pencere "bunda ne var" sorusuna cevap veriyor.
 *
 * SAYI DEĞİL, SAYI + KANAL. Yalnızca "3 varlık" yazmak hangi platformun bağlı
 * olduğunu gizliyor; Meta bağlı olmayan bir müşteride Meta raporu boş geliyor
 * ve sebebi kartta görünmüyordu. Rozetler o boşluğu kapatıyor.
 */

const DURUM_ETIKET: Record<string, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  archived: 'Arşivlendi',
};

export interface MusteriKartiVerisi {
  id: string;
  name: string;
  slug: string;
  status: string;
  timezone: string;
  reportingCurrency: string;
  createdAt: string;
  _count: { adAccounts: number; memberships: number };
  adAccounts: ClientAdAccount[];
  socialProfiles: ClientProfile[];
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  address: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  iban: string | null;
  notes: string | null;
}

/** Kanal rozetlerinin sırası SABİT — kart kart değişen bir sıra okunmuyor. */
const KANAL_SIRASI: ChannelKind[] = [
  'meta_ads',
  'google_ads',
  'facebook',
  'instagram',
  'youtube',
];

const KANAL_ADI: Record<ChannelKind, string> = {
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  facebook: 'Facebook sayfası',
  instagram: 'Instagram hesabı',
  youtube: 'YouTube kanalı',
};

export function MusteriKarti({
  client,
  canManage,
  yonetim,
}: {
  client: MusteriKartiVerisi;
  /** Bilgileri yalnızca yazma yetkisi olan düzenleyebiliyor. */
  canManage: boolean;
  /**
   * Atama / kategori / arşivleme kontrolleri. SUNUCUDA kuruluyor ve buraya
   * hazır eleman olarak geliyor — bu bileşene taşımak, içindeki sunucu
   * tarafı çözümleri (havuz, oturum) de taşımak olurdu.
   */
  yonetim: ReactNode;
}) {
  const [acik, setAcik] = useState(false);
  const [duzenle, setDuzenle] = useState(false);

  const toplam = client._count.adAccounts;
  const izlemede = client.adAccounts.filter((a) => a.syncEnabled).length;
  const varlikSayisi = client.adAccounts.length + client.socialProfiles.length;

  const bagliKanallar = KANAL_SIRASI.filter(
    (k) =>
      client.adAccounts.some((a) => adAccountKanali(a.platform) === k) ||
      client.socialProfiles.some((p) => profilKanali(p.profileType) === k),
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setAcik(true)}
        className="flex h-full w-full flex-col rounded-xl border border-line bg-surface p-4 text-left shadow-sm transition hover:border-brand hover:shadow-md"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-semibold uppercase text-white">
            {client.name.slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-ink">{client.name}</h2>
            <p className="truncate text-xs text-ink-muted">{client.slug}</p>
          </div>
          {client.status !== 'active' && (
            <span className="shrink-0 rounded bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
              {DURUM_ETIKET[client.status] ?? client.status}
            </span>
          )}
        </div>

        {/*
          BOŞ HÂL SEBEBİNİ SÖYLÜYOR. "0 varlık" ile "varlık atanmamış" aynı
          şey değil gibi görünse de kullanıcı için farklı: birincisi bir sayı,
          ikincisi yapılacak iş. Aynı şekilde "atanmış ama hiçbiri izlemede
          değil" hâli de veri gelmemesinin ayrı bir sebebi ve panelde birebir
          aynı görünüyor.
        */}
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          {varlikSayisi === 0 ? (
            <span className="text-xs text-ink-muted">Varlık atanmamış</span>
          ) : (
            <span className="flex items-center gap-1.5">
              {bagliKanallar.map((k) => (
                <PlatformLogo key={k} kind={k} className="h-4 w-4" />
              ))}
              <span className="ml-1 text-xs text-ink-muted">
                <strong className="text-ink">{varlikSayisi}</strong> varlık
              </span>
            </span>
          )}
          <span className="text-xs text-ink-muted">{client._count.memberships} kişi</span>
        </div>

        {toplam > 0 && izlemede === 0 && (
          <span className="mt-2 text-[11px] text-ink-muted">
            Hiçbir hesap izlemede değil — veri çekilmiyor.
          </span>
        )}
      </button>

      <MusteriDetay
        acik={acik}
        onKapat={() => setAcik(false)}
        baslik={client.name}
        altBaslik={`${client.slug} · ${DURUM_ETIKET[client.status] ?? client.status}`}
      >
        <DetayBolumu
          baslik="Bağlı varlıklar"
          sag={
            <span className="flex items-center gap-3">
              <span className="text-[11px] text-ink-muted">
                {toplam === 0 ? 'reklam hesabı yok' : `${izlemede} / ${toplam} hesap izlemede`}
              </span>
              {/*
                KANAL KURULUMUNA BAĞLANTI. Kart küçülünce bu bağlantı listeden
                düştü; müşterinin kurulumunun yapıldığı tek ekran orası ve
                başka hiçbir yerden erişilmiyor.
              */}
              <Link
                href={`/ayarlar/musteriler/${client.id}/kanallar`}
                className="text-[11px] text-brand-strong hover:underline"
              >
                Bağlı kanallar →
              </Link>
            </span>
          }
        >
          {varlikSayisi === 0 ? (
            <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
              Atanmış varlık yok — bu müşteride hiç veri görünmeyecek.
            </p>
          ) : (
            <ul className="space-y-1">
              {client.adAccounts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2"
                >
                  <PlatformLogo kind={adAccountKanali(a.platform)} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">{a.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-muted">
                    {a.externalId}
                  </span>
                  {/*
                    İZLEME DURUMU YAZIYLA. Yalnızca soluk bir renkle ayırmak,
                    "atadım ama veri gelmiyor" hâlinin sebebini gizliyordu.
                  */}
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      a.syncEnabled
                        ? 'bg-brand-soft text-brand-strong'
                        : 'bg-surface-sunken text-ink-muted'
                    }`}
                  >
                    {a.syncEnabled ? 'İzlemede' : 'Kapalı'}
                  </span>
                </li>
              ))}
              {client.socialProfiles.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2"
                >
                  <PlatformLogo kind={profilKanali(p.profileType)} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink">{p.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-muted">
                    {KANAL_ADI[profilKanali(p.profileType)]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DetayBolumu>

        <DetayBolumu
          baslik="Ekip"
          sag={
            <Link
              href={`/ayarlar/musteriler/${client.id}/ekip`}
              className="text-[11px] text-brand-strong hover:underline"
            >
              Ekibi yönet →
            </Link>
          }
        >
          {/*
            SAYI VE BAĞLANTI. Üyelerin adları bu uçtan gelmiyor; ismen listelemek
            için ikinci bir çağrı gerekiyordu ve pencere her açıldığında bir tur
            daha demekti. Sayı burada, isimler yönetim ekranında.
          */}
          <p className="text-xs text-ink-muted">
            <strong className="text-ink">{client._count.memberships}</strong> kişinin bu
            workspace&apos;e erişimi var.
          </p>
        </DetayBolumu>

        {duzenle ? (
          <DetayBolumu baslik="Müşteri bilgileri">
            <MusteriBilgiFormu
              clientId={client.id}
              baslangic={client}
              onBitti={() => setDuzenle(false)}
            />
          </DetayBolumu>
        ) : (
          <>
            <DetayBolumu
              baslik="Danışman ve iletişim"
              sag={
                canManage && (
                  <button
                    type="button"
                    onClick={() => setDuzenle(true)}
                    className="text-[11px] text-brand-strong hover:underline"
                  >
                    Bilgileri düzenle
                  </button>
                )
              }
            >
              <div className="rounded-lg border border-line px-3 py-1">
                <DetaySatiri etiket="Yetkili kişi" deger={client.contactName} />
                <DetaySatiri etiket="E-posta" deger={client.contactEmail} />
                <DetaySatiri etiket="Telefon" deger={client.contactPhone} />
                <DetaySatiri etiket="İnternet sitesi" deger={client.website} />
              </div>
            </DetayBolumu>

            <DetayBolumu baslik="Firma bilgileri">
              <div className="rounded-lg border border-line px-3 py-1">
                <DetaySatiri etiket="Adres" deger={client.address} />
                <DetaySatiri etiket="Vergi dairesi" deger={client.taxOffice} />
                <DetaySatiri etiket="Vergi numarası" deger={client.taxNumber} />
                <DetaySatiri etiket="IBAN" deger={client.iban} />
                <DetaySatiri etiket="Saat dilimi" deger={client.timezone} />
                <DetaySatiri etiket="Raporlama para birimi" deger={client.reportingCurrency} />
              </div>
              {client.notes && (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                  {client.notes}
                </p>
              )}
            </DetayBolumu>
          </>
        )}

        <DetayBolumu baslik="Yönetim">{yonetim}</DetayBolumu>
      </MusteriDetay>
    </>
  );
}
