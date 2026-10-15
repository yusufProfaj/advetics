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
import { useSozluk } from '@/dil/saglayici';
import { sirketlerSozlugu } from '@/dil/sozlukler/ayarlar-sirketler';

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

/* Durum etiketi sözlükte (`workspace.durum`); tanınmayan durum ham adıyla yazılıyor. */

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
  const t = useSozluk(sirketlerSozlugu);
  const d = t.workspace;
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
      hataYaz(s.id, e, d.gecilemedi);
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
      hataYaz(s.id, e, d.arsivlenemedi);
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
      hataYaz(s.id, e, d.tasinamadi);
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
          alt={mesgul === `ac:${s.id}` || mesgul === `kurulum:${s.id}` ? d.aciliyor : s.slug}
        />
      ),
    },
    {
      anahtar: 'hesaplar',
      baslik: d.hesaplar,
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
              <span className="text-13 text-ink-muted">{d.hesapAtanmamis}</span>
            ) : (
              <span className="flex flex-wrap items-center gap-1.5">
                {kanallar.map((k) => (
                  <PlatformLogo key={k} kind={k} className="h-4 w-4" />
                ))}
                <span className="text-13 text-ink-muted">
                  <strong className="text-ink">{s._count.adAccounts}</strong>
                  {d.hesapIzlemede(izlemede)}
                </span>
              </span>
            )}
            {s._count.adAccounts > 0 && izlemede === 0 && (
              <span className="mt-0.5 block text-12 font-semibold text-danger-strong">{d.veriCekilmiyor}</span>
            )}
          </>
        );
      },
    },
    {
      anahtar: 'ekip',
      baslik: d.ekip,
      sayi: true,
      ikincil: true,
      hucre: (s) => t.ortak.kisiSayisi(s._count.memberships),
    },
    {
      anahtar: 'durum',
      baslik: d.durumBaslik,
      /* YEŞİL YALNIZ DURUM GÖSTERGESİ (TASARIM-DILI) — `Rozet` bunu taşıyor. */
      hucre: (s) => (
        <Rozet hal={s.status === 'active' ? 'ok' : s.status === 'paused' ? 'dur' : 'taslak'}>
          {d.durum[s.status] ?? s.status}
        </Rozet>
      ),
    },
    {
      anahtar: 'eylem',
      baslik: <span className="sr-only">{t.ortak.eylemler}</span>,
      sayi: true,
      hucre: (s) => (
        <DigerMenusu etiket={t.ortak.islemler(s.name)}>
          {/* İŞ SÜRERKEN KAPALI: eski düğmeler `mesgul` iken pasifti; menüde
              aynı kapı yoksa geçiş bitmeden ikinci bir geçiş başlıyordu. */}
          <MenuOgesi devreDisi={mesgul !== null} onClick={() => void ac(s)}>{d.markaMerkezindeAc}</MenuOgesi>
          <MenuOgesi devreDisi={mesgul !== null} onClick={() => void ac(s, 'sihirbaz')}>{d.kurulumuTamamla}</MenuOgesi>
          {tasiAcik && (
            <MenuOgesi devreDisi={mesgul !== null} onClick={() => panelAc(s.id, 'tasi')}>{d.baskaSirketeTasi}</MenuOgesi>
          )}
          {arsivleyebilir && (
            <>
              <MenuAyraci />
              <MenuOgesi tehlike devreDisi={mesgul !== null} onClick={() => panelAc(s.id, 'arsivle')}>
                {d.arsivle}
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
        {d.toplam(satirlar.length, toplamHesap, toplamIzlenen)}
      </p>

      {hata && (
        <Serit ton="hata" baslik={hataSatiri ? d.satirHatasi(hataSatiri.name) : t.ortak.islemYapilamadi}>
          {hata.metin}
        </Serit>
      )}

      <Kart dolgu={false}>
        <Tablo
          etiket={d.tablo}
          sutunlar={sutunlar}
          satirlar={suzulmus}
          satirAnahtari={(s) => s.id}
          aracCubugu={
            <AracCubugu
              sag={
                /* SESSİZ KESME YOK: süzülmüş listede kaçının göründüğü yazılı. */
                <span className="text-12 text-ink-muted">
                  {q === ''
                    ? t.ortak.workspaceSayisi(satirlar.length)
                    : d.gosteriliyor(satirlar.length, suzulmus.length)}
                </span>
              }
            >
              <div className="w-full max-w-sm">
                <Girdi
                  type="search"
                  value={arama}
                  onChange={(e) => setArama(e.target.value)}
                  placeholder={d.araYer}
                  aria-label={d.ara}
                />
              </div>
            </AracCubugu>
          }
          bos={
            <BosDurum
              baslik={d.eslesenYok(arama)}
              neden={d.eslesenYokNeden}
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
        baslik={d.arsivleBaslik}
        genislik="dar"
        altEylemler={
          panelSatiri && (
            <>
              <Dugme ton="ikincil" onClick={() => setPanel(null)}>
                {t.ortak.vazgec}
              </Dugme>
              <Dugme
                ton="tehlike"
                bekliyor={mesgul === `arsiv:${panelSatiri.id}`}
                onClick={() => void arsivle(panelSatiri)}
              >
                {d.arsivle}
              </Dugme>
            </>
          )
        }
      >
        {panelSatiri && hata?.id === panelSatiri.id && <PencereHatasi metin={hata.metin} />}
        {panelSatiri && (
          <p className="m-0 text-14 text-ink">
            <strong>{panelSatiri.name}</strong>
            {d.arsivleGovde}
          </p>
        )}
      </Pencere>

      <Pencere
        acik={panel?.tur === 'tasi' && panelSatiri !== null}
        onKapat={() => setPanel(null)}
        baslik={d.baskaSirketeTasi}
        aciklama={d.tasiAciklama}
        altEylemler={
          panelSatiri && (
            <>
              <Dugme ton="ikincil" onClick={() => setPanel(null)}>
                {t.ortak.vazgec}
              </Dugme>
              <Dugme
                disabled={hedefSirket === ''}
                bekliyor={mesgul === `tasi:${panelSatiri.id}`}
                onClick={() => void tasi(panelSatiri)}
              >
                {d.tasi}
              </Dugme>
            </>
          )
        }
      >
        {panelSatiri && hata?.id === panelSatiri.id && <PencereHatasi metin={hata.metin} />}
        {panelSatiri && (
          <Alan etiket={d.tasinsin(panelSatiri.name)} id={`tasi-${panelSatiri.id}`}>
            <Secim
              id={`tasi-${panelSatiri.id}`}
              value={hedefSirket}
              onChange={(e) => setHedefSirket(e.target.value)}
              disabled={mesgul !== null}
            >
              <option value="">{d.sirketSec}</option>
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

/*
 * HATA PENCERENİN İÇİNDE DE. Taşı/Arşivle düşünce pencere açık kalıyor ama
 * hata şeridi sayfada, perdenin ARKASINDA çiziliyordu: kullanıcı "Taşı"ya
 * basıp hiçbir şey olmadığını görüyor ve tekrar basıyordu (Ajan 4 denetimi).
 */
function PencereHatasi({ metin }: { metin: string }) {
  const t = useSozluk(sirketlerSozlugu);
  return (
    <div className="mb-3">
      <Serit ton="hata" baslik={t.ortak.islemYapilamadi}>
        {metin}
      </Serit>
    </div>
  );
}
