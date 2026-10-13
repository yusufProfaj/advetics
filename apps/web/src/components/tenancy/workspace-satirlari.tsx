'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CHANNEL_KINDS, type ChannelKind } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { markaMerkeziAdresi, sihirbazAdresi } from '@/lib/panel-adresleri';
import { PlatformLogo, adAccountKanali, profilKanali } from '@/components/platform-logo';
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { AdHucresi, AracCubugu, Tablo, type TabloSutunu } from '@/components/ui/tablo';
import { Alan, Girdi, Secim } from '@/components/ui/alan';
import { BosDurum, Serit } from '@/components/ui/hal';
import { Rozet } from '@/components/ui/rozet';
import { Pencere } from '@/components/ui/pencere';
import { MenuAyraci, MenuOgesi } from '@/components/ui/acilir-menu';
import { DigerMenusu } from '@/components/ayar-sekmeleri';

/**
 * ═══ ŞİRKETİN WORKSPACE'LERİ — SATIR, PENCERE DEĞİL ═══
 *
 * Her workspace bir karttı ve karta tıklayınca bir PENCERE açılıyordu:
 * hesap ataması, özel reklam kategorisi, firma bilgileri, ekip sayısı ve
 * arşivleme aynı pencerede. O alanların her birinin ikinci bir evi daha
 * vardı (Marka Merkezi, Kurulum, Ekip) ve aynı bilgi iki yerden
 * düzenlenince hangisinin "asıl" olduğu ekrandan okunmuyordu. Kullanıcının
 * onayladığı yapı (2026-10-13): Ayarlar'da workspace DÜZEYİNDE hiçbir alan
 * düzenlenmiyor, satır Marka Merkezi'ne AÇILIYOR (MIMARI Ç-23).
 *
 * SATIRDA DÖRT EYLEM: Marka Merkezi'nde aç (gezinme), Kurulumu tamamla
 * (aynı workspace'in kurulum sihirbazı), Taşı (workspace'in ŞİRKETİNİ
 * değiştirir — şirket düzeyi bir karar) ve Arşivle (listeden çıkarır). Kapıları sunucuda `PANEL_KAPILARI`
 * ile hesaplanıp buraya geliyor; kapalı eylemin düğmesi hiç çizilmiyor.
 *
 * Google Ads "Yönetici hesabı › Hesaplar" tablosunun karşılığı: ad, kimlik,
 * birkaç sayı, durum, tek birincil eylem.
 */
export interface WorkspaceSatiri {
  id: string;
  name: string;
  slug: string;
  status: string;
  _count: { adAccounts: number; memberships: number };
  adAccounts: Array<{ id: string; platform: string; syncEnabled: boolean }>;
  socialProfiles: Array<{ id: string; profileType: string }>;
}

const DURUM_ETIKET: Record<string, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  archived: 'Arşivde',
};

type Panel = { id: string; tur: 'tasi' | 'arsivle' } | null;

/** Türkçe küçültme — varsayılan `toLowerCase()` "İ"yi "i̇" yapıyor. */
const kucult = (s: string): string => s.toLocaleLowerCase('tr');

export function WorkspaceSatirlari({
  satirlar,
  arsivleyebilir,
  arsivNedeni,
  tasiyabilir,
  tasiHedefleri,
}: {
  satirlar: WorkspaceSatiri[];
  /** `PANEL_KAPILARI['workspace.arsivle']` — sunucuda hesaplandı. */
  arsivleyebilir: boolean;
  /** Kapı kapalıysa ekranda yazan kısa sebep. */
  arsivNedeni: string;
  /** `PANEL_KAPILARI['workspace.tasi']`. */
  tasiyabilir: boolean;
  /** Taşınabilecek şirketler — aktif şirket HARİÇ (kendine taşımak boş bir işlem). */
  tasiHedefleri: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [arama, setArama] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [hata, setHata] = useState<{ id: string; metin: string } | null>(null);
  const [hedefSirket, setHedefSirket] = useState('');

  const q = kucult(arama.trim());
  const suzulmus = useMemo(
    () => (q === '' ? satirlar : satirlar.filter((s) => kucult(s.name).includes(q) || kucult(s.slug).includes(q))),
    [satirlar, q],
  );

  const tasiAcik = tasiyabilir && tasiHedefleri.length > 0;

  function hataYaz(id: string, e: unknown, yedek: string) {
    setHata({ id, metin: e instanceof ApiRequestError ? e.message : yedek });
  }

  /**
   * MARKA MERKEZİ'NDE AÇ — önce o workspace'e GEÇ, sonra aç.
   *
   * Marka Merkezi adresteki `?musteri=` ile açılıyor; geçiş yine de şart:
   * kenar çubuğu, kapsam seçici ve diğer ekranlar OTURUMDAKİ workspace'i
   * okuyor. Geçmeden açmak, başlıkta A yazıp menüde B'nin verisini
   * gösteren bir panel bırakırdı — eski "Hesapları yönet" düğmesinin
   * yaşadığı hatanın aynısı (Ege'nin kartından Çiftçi Grup'un hesapları).
   */
  async function ac(s: WorkspaceSatiri, hedef: 'marka' | 'sihirbaz' = 'marka') {
    setMesgul(`${hedef === 'marka' ? 'ac' : 'kurulum'}:${s.id}`);
    setHata(null);
    try {
      await apiFetch('/auth/switch-client', { method: 'POST', body: JSON.stringify({ clientId: s.id }) });
      /*
       * KURULUMU TAMAMLA = SİHİRBAZ (MIMARI § 3a). Satırda sayaç YOK: her
       * satırın sayacı dört uç ve hazırlık okuması imzası değişmiş
       * workspace'te AI hazırlığını başlatıyor; Şirketler'i açmak her
       * workspace'te hazırlık başlatmamalı. Sayaç sihirbazın kendisinde.
       */
      router.push(hedef === 'marka' ? markaMerkeziAdresi('kurulum', s.id) : sihirbazAdresi(s.id));
    } catch (e) {
      hataYaz(s.id, e, 'Workspace’e geçilemedi.');
      setMesgul(null);
    }
  }

  /** ARŞİV SİLME DEĞİL: satır, hesaplar ve geçmiş duruyor; aşağıdaki Arşiv'den geri alınır. */
  async function arsivle(s: WorkspaceSatiri) {
    setMesgul(`arsiv:${s.id}`);
    setHata(null);
    try {
      await apiFetch(`/clients/${s.id}`, { method: 'DELETE' });
      setPanel(null);
      router.refresh();
    } catch (e) {
      hataYaz(s.id, e, 'Arşivlenemedi.');
    } finally {
      setMesgul(null);
    }
  }

  /**
   * TAŞI — workspace'i BAŞKA bir şirkete. Hesaplar, kampanyalar ve geçmiş
   * birlikte gidiyor (sunucu 30 tabloda `org_id` yazıyor). Hedef bir
   * listeden seçiliyor ve liste aktif şirketi İÇERMİYOR.
   */
  async function tasi(s: WorkspaceSatiri) {
    if (hedefSirket === '') return;
    setMesgul(`tasi:${s.id}`);
    setHata(null);
    try {
      await apiFetch('/manager-account/workspaces/move', {
        method: 'POST',
        body: JSON.stringify({ clientId: s.id, organizationId: hedefSirket }),
      });
      setPanel(null);
      setHedefSirket('');
      router.refresh();
    } catch (e) {
      hataYaz(s.id, e, 'Workspace taşınamadı.');
    } finally {
      setMesgul(null);
    }
  }

  function panelAc(id: string, tur: 'tasi' | 'arsivle') {
    setHata(null);
    setHedefSirket('');
    setPanel({ id, tur });
  }

  /*
   * PENCERE TEK, SATIR DEĞİŞKEN: hangi satırın taşındığı/arşivlendiği
   * `panel`de. Pencere DOM'da kalıyor; satır bulunamazsa (liste tazelendi)
   * içerik boş ve pencere kapalı.
   */
  const panelSatiri = panel ? (satirlar.find((s) => s.id === panel.id) ?? null) : null;
  const hataSatiri = hata ? (satirlar.find((s) => s.id === hata.id) ?? null) : null;
  const toplamHesap = satirlar.reduce((n, s) => n + s._count.adAccounts, 0);
  const toplamIzlenen = satirlar.reduce((n, s) => n + s.adAccounts.filter((a) => a.syncEnabled).length, 0);

  const sutunlar: Array<TabloSutunu<WorkspaceSatiri>> = [
    {
      anahtar: 'ad',
      baslik: 'Workspace',
      hucre: (s) => (
        <AdHucresi
          /*
            AD BİR BAĞLANTI GİBİ: taslakta satırın adı Marka Merkezi'ne
            açılıyor (Google Ads'te hesap adı hesaba girer). Düğme, bağlantı
            DEĞİL: açmadan önce o workspace'e geçmek gerekiyor (`ac`).
          */
          ad={
            <button
              type="button"
              disabled={mesgul !== null}
              onClick={() => void ac(s)}
              className="text-left font-semibold text-ink hover:text-brand-strong hover:underline disabled:opacity-60"
            >
              {s.name}
            </button>
          }
          alt={mesgul === `ac:${s.id}` || mesgul === `kurulum:${s.id}` ? 'Açılıyor…' : s.slug}
        />
      ),
    },
    {
      anahtar: 'hesaplar',
      baslik: 'Hesaplar',
      hucre: (s) => {
        const izlemede = s.adAccounts.filter((a) => a.syncEnabled).length;
        const kanallar = CHANNEL_KINDS.filter(
          (k: ChannelKind) =>
            s.adAccounts.some((a) => adAccountKanali(a.platform) === k) ||
            s.socialProfiles.some((p) => profilKanali(p.profileType) === k),
        );
        return (
          <>
            {/*
              BOŞ HÂL SEBEBİYLE: "0" bir sayı, "atanmamış" yapılacak
              bir iş. "Atanmış ama hiçbiri izlemede değil" ise veri
              gelmemesinin AYRI bir sebebi ve ayrı yazılıyor.
            */}
            {s._count.adAccounts === 0 && s.socialProfiles.length === 0 ? (
              <span className="text-13 text-ink-muted">Hesap atanmamış</span>
            ) : (
              <span className="flex flex-wrap items-center gap-1.5">
                {kanallar.map((k) => (
                  <PlatformLogo key={k} kind={k} className="h-4 w-4" />
                ))}
                <span className="text-13 text-ink-muted">
                  <strong className="text-ink">{s._count.adAccounts}</strong> hesap · {izlemede} izlemede
                </span>
              </span>
            )}
            {s._count.adAccounts > 0 && izlemede === 0 && (
              <span className="mt-0.5 block text-12 font-semibold text-danger-strong">Veri çekilmiyor</span>
            )}
          </>
        );
      },
    },
    {
      anahtar: 'ekip',
      baslik: 'Ekip',
      sayi: true,
      ikincil: true,
      hucre: (s) => `${s._count.memberships} kişi`,
    },
    {
      anahtar: 'durum',
      baslik: 'Durum',
      /* YEŞİL YALNIZ DURUM GÖSTERGESİ (TASARIM-DILI) — `Rozet` bunu taşıyor. */
      hucre: (s) => (
        <Rozet hal={s.status === 'active' ? 'ok' : s.status === 'paused' ? 'dur' : 'taslak'}>
          {DURUM_ETIKET[s.status] ?? s.status}
        </Rozet>
      ),
    },
    {
      anahtar: 'eylem',
      baslik: <span className="sr-only">Eylemler</span>,
      sayi: true,
      hucre: (s) => (
        <DigerMenusu etiket={`${s.name} için işlemler`}>
          <MenuOgesi onClick={() => void ac(s)}>Marka Merkezi’nde aç</MenuOgesi>
          <MenuOgesi onClick={() => void ac(s, 'sihirbaz')}>Kurulumu tamamla</MenuOgesi>
          {tasiAcik && (
            <MenuOgesi onClick={() => panelAc(s.id, 'tasi')}>Başka şirkete taşı</MenuOgesi>
          )}
          {arsivleyebilir && (
            <>
              <MenuAyraci />
              <MenuOgesi tehlike onClick={() => panelAc(s.id, 'arsivle')}>
                Arşivle
              </MenuOgesi>
            </>
          )}
        </DigerMenusu>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      {/* TOPLAM HER ZAMAN YAZILI: hesabı olup izlenmeyen workspace "veri gelmiyor" diye okunur. */}
      <p className="m-0 text-13 text-ink-muted">
        {satirlar.length} workspace · {toplamHesap} reklam hesabı · {toplamIzlenen} tanesi izlemede
      </p>

      {hata && (
        <Serit ton="hata" baslik={hataSatiri ? `${hataSatiri.name}: işlem yapılamadı` : 'İşlem yapılamadı'}>
          {hata.metin}
        </Serit>
      )}

      <Kart dolgu={false}>
        <Tablo
          etiket="Workspace’ler"
          sutunlar={sutunlar}
          satirlar={suzulmus}
          satirAnahtari={(s) => s.id}
          aracCubugu={
            <AracCubugu
              sag={
                /* SESSİZ KESME YOK: süzülmüş listede kaçının göründüğü yazılı. */
                <span className="text-12 text-ink-muted">
                  {q === ''
                    ? `${satirlar.length} workspace`
                    : `${satirlar.length} workspace’ten ${suzulmus.length} tanesi gösteriliyor`}
                </span>
              }
            >
              <div className="w-full max-w-sm">
                <Girdi
                  type="search"
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                  placeholder="Workspace adı ya da kısa adı"
                  aria-label="Workspace ara"
                />
              </div>
            </AracCubugu>
          }
          bos={
            <BosDurum
              baslik={`“${arama}” ile eşleşen workspace yok.`}
              neden="Ad ya da kısa adın bir parçasını yaz; aramayı temizleyince bütün liste döner."
            />
          }
          sayfalama={{ bas: suzulmus.length === 0 ? 0 : 1, son: suzulmus.length, toplam: suzulmus.length }}
        />
        {/* KAPI KAPALIYSA SEBEBİ YAZIYOR, düğme sessizce kaybolmuyor. */}
        {!arsivleyebilir && (
          <p className="m-0 border-t border-line px-4 py-2.5 text-12 text-ink-muted">{arsivNedeni}</p>
        )}
      </Kart>

      <Pencere
        acik={panel?.tur === 'arsivle' && panelSatiri !== null}
        onKapat={() => setPanel(null)}
        baslik="Workspace’i arşivle"
        genislik="dar"
        altEylemler={
          panelSatiri && (
            <>
              <Dugme ton="ikincil" onClick={() => setPanel(null)}>
                Vazgeç
              </Dugme>
              <Dugme
                ton="tehlike"
                bekliyor={mesgul === `arsiv:${panelSatiri.id}`}
                onClick={() => void arsivle(panelSatiri)}
              >
                Arşivle
              </Dugme>
            </>
          )
        }
      >
        {panelSatiri && (
          <p className="m-0 text-14 text-ink">
            <strong>{panelSatiri.name}</strong> listeden kalkar. Hesaplar ve geçmiş veri silinmez;
            aşağıdaki Arşiv’den geri alabilirsin.
          </p>
        )}
      </Pencere>

      <Pencere
        acik={panel?.tur === 'tasi' && panelSatiri !== null}
        onKapat={() => setPanel(null)}
        baslik="Başka şirkete taşı"
        aciklama="Reklam hesapları, kampanyalar ve geçmiş veri birlikte taşınır."
        altEylemler={
          panelSatiri && (
            <>
              <Dugme ton="ikincil" onClick={() => setPanel(null)}>
                Vazgeç
              </Dugme>
              <Dugme
                disabled={hedefSirket === ''}
                bekliyor={mesgul === `tasi:${panelSatiri.id}`}
                onClick={() => void tasi(panelSatiri)}
              >
                Taşı
              </Dugme>
            </>
          )
        }
      >
        {panelSatiri && (
          <Alan etiket={`${panelSatiri.name} şu şirkete taşınsın`} id={`tasi-${panelSatiri.id}`}>
            <Secim
              id={`tasi-${panelSatiri.id}`}
              value={hedefSirket}
              onChange={(e) => setHedefSirket(e.target.value)}
              disabled={mesgul !== null}
            >
              <option value="">Şirket seç</option>
              {tasiHedefleri.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Secim>
          </Alan>
        )}
      </Pencere>
    </div>
  );
}
