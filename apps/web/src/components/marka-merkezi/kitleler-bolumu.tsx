'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  KITLE_PLATFORMLARI,
  KITLE_SINIRLARI,
  kitleOzeti,
  sec,
  kitleSablonuInputSchema,
  type GeoLocationOption,
  type KitleGoogle,
  type KitleIlgi,
  type KitleOzel,
  type KitleKonumu,
  type KitleOnerisi,
  type KitlePlatformu,
  type KitleSablonuListesi,
  type KitleSablonuRecord,
} from '@advetics/shared';
import Link from 'next/link';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { Alan, FormIzgarasi, Girdi, MetinAlani, Secim } from '@/components/ui/alan';
import { AdHucresi, SayfalamaCubugu, Tablo } from '@/components/ui/tablo';
import { BosDurum, HataDurumu, Serit, Yukleniyor } from '@/components/ui/hal';
import { Pencere, YanPanel } from '@/components/ui/pencere';
import { AcilirMenu, IKON_TETIK, MenuOgesi } from '@/components/ui/acilir-menu';
import { BolumluSecici } from '@/components/ui/sekmeler';
import { PlatformLogo } from '@/components/platform-logo';
import { useVarlikYeni } from './varliklar/birincil-eylem';
import { HedeflemeSecici } from '@/components/autoboost/hedefleme-secici';
import { IlgiSecici, kitleBuyuklugu } from './ilgi-secici';
import { OzelKitleSecici } from './ozel-kitle-secici';
import { useDil, useSozluk } from '@/dil/saglayici';
import { kitleSozlugu } from '@/dil/sozlukler/kitle';
import { markaMerkeziVeriSozlugu } from '@/dil/sozlukler/marka-merkezi-veri';

/**
 * ═══ VARLIKLAR → KİTLELER (Bölüm 4; 2026-10-13'ten beri Varlıklar'ın 4. sekmesi) ═══
 *
 * Workspace'in adlı hedeflemeleri. Reklam kurarken görsel ve form gibi
 * SEÇİLEN malzeme; bu yüzden Marka Merkezi'nden Varlıklar'a taşındı
 * (docs/panel-sadelestirme/MIMARI.md Ç-26).
 *
 * VARSAYILAN KİTLE BURADA DEĞİŞMİYOR (Ç-9). İki yerden değişiyordu: buradaki
 * "Varsayılan yap" ve hazırlık kartının konum sorusu; ikisi ayrı şablon
 * işaretleyebiliyordu ve hangisinin geçerli olduğu ekrandan okunmuyordu.
 * Evi Marka Merkezi › Kurulum › Reklam varsayılanları; burada rozet SALT
 * OKUNUR ve oraya bağlantı.
 *
 * HER KİTLE TEK PLATFORM (kullanıcı kararı, 2026-10-20). Meta kitlesi ilgi
 * alanı ve özel kitle, Google kitlesi kategori ve arama kelimesi taşır; form
 * yalnız seçili platformun alanlarını gösterir ve gönderir. Listede platform
 * sütunu ve süzgeç var (Armağan Bey: "hangi platforma ait olduğu belli
 * olsun, filtrelenebilsin"). Konumlar her iki platformda Meta'nın coğrafi
 * anahtarları; Google karşılığı reklam kurulurken eşleniyor.
 *
 * İKİ YERDE AYNI BİLEŞEN: Base › Varlıklar › Kitleler ve Reklam Yöneticisi ›
 * Hedef kitleler. İki ayrı form zamanla sessizce ayrışırdı (MIMARI Ç2).
 *
 * DÖRT HÂL AYRI (CLAUDE.md, `.catch(() => setX([]))` yasağı): yükleniyor,
 * çağrı düştü, şablon yok, şablonlar geldi.
 *
 * TABLO + YAN PANEL (2026-10-14, taslak `#varlik`): kitle formu listenin
 * üstünde satır içi açılıyordu ve uzun formun altında liste kayboluyordu.
 * Artık liste tablo, form sağdan yan panelde; "Yeni kitle" sayfa başlığının
 * sağındaki birincil düğmeden. Silme onayı pencerede (iki adım korunuyor).
 */
type Durum =
  | { tur: 'yukleniyor' }
  | { tur: 'hata'; mesaj: string }
  | { tur: 'hazir'; veri: KitleSablonuListesi };

interface Form {
  id: string | null;
  platform: KitlePlatformu;
  name: string;
  locations: KitleKonumu[];
  ageMin: number;
  ageMax: number;
  genders: 'all' | 'male' | 'female';
  interests: KitleIlgi[];
  ozelKitleler: KitleOzel[];
  google: KitleGoogle;
}

const BOS_FORM: Form = {
  id: null,
  platform: 'meta',
  name: '',
  locations: [],
  ageMin: 18,
  ageMax: 65,
  genders: 'all',
  interests: [],
  ozelKitleler: [],
  google: { ilgiler: [], kelimeler: [] },
};
const YASLAR = Array.from({ length: 48 }, (_, i) => 18 + i);

type Suzgec = 'hepsi' | KitlePlatformu;
const PLATFORM_ADI: Record<KitlePlatformu, string> = { meta: 'Meta', google: 'Google' };
const PLATFORM_LOGOSU = { meta: 'meta_ads', google: 'google_ads' } as const;

/**
 * Platformun TAŞIMADIĞI alanlar boşaltılmış gövde. Sunucu şeması platform
 * dışı alanı reddediyor (`kitlePlatformKurali`); burada boşaltmak, formda
 * gizli kalmış eski bir değerin kaydı düşürmesini önlüyor.
 */
export function kitleGovdesi(clientId: string, f: Omit<Form, 'id'>) {
  return {
    clientId,
    platform: f.platform,
    name: f.name,
    locations: f.locations,
    ageMin: f.ageMin,
    ageMax: f.ageMax,
    genders: f.genders,
    interests: f.platform === 'meta' ? f.interests : [],
    ozelKitleler: f.platform === 'meta' ? f.ozelKitleler : [],
    google: f.platform === 'google' ? f.google : { ilgiler: [], kelimeler: [] },
  };
}

export function KitlelerBolumu({
  clientId,
  yazabilir,
  varsayilanAdresi,
  yeniAc = false,
  ilkSuzgec = null,
}: {
  clientId: string;
  yazabilir: boolean;
  /**
   * Süzgecin ilk değeri: Reklam Yöneticisi adresteki platformu geçiriyor
   * (üstteki kartlar o platformu gösterirken liste "Tümü" açılmasın).
   * Meta/Google dışı değer (LinkedIn) "Tümü" açar; süzgeç görünür olduğu
   * için kullanıcı neyi gördüğünü bilir.
   */
  ilkSuzgec?: string | null;
  /**
   * Adreste `yeni=1`: Reklam Yöneticisi'nin "＋ Hedef kitle" düğmesi buraya
   * geliyor ve kullanıcı yeni kitle formunu açık bulmalı (bir tık daha
   * istemek, düğmenin sözünü yarım bırakırdı). Liste geldikten sonra BİR KEZ.
   */
  yeniAc?: boolean;
  /** Varsayılan kitlenin evi (Kurulum › Reklam varsayılanları); görme yetkisi yoksa null. */
  varsayilanAdresi: string | null;
}) {
  const { dil } = useDil();
  const m = sec(markaMerkeziVeriSozlugu, dil).kitleler;
  const [durum, setDurum] = useState<Durum>({ tur: 'yukleniyor' });
  const [form, setForm] = useState<Form | null>(null);
  const [silinecek, setSilinecek] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  /*
   * YAN PANEL DOM'DA KALIYOR (kapanış geçişi için); içindeki form son açılan
   * kitleyi göstermeye devam etsin diye ayrı tutuluyor. Her açılışta yeni
   * `key`: önceki kitlenin "tarif et" önerisi yeni formda kalmasın.
   */
  const [panelFormu, setPanelFormu] = useState<Form>(BOS_FORM);
  const [acilis, setAcilis] = useState(0);
  const [suzgec, setSuzgec] = useState<Suzgec>(
    (KITLE_PLATFORMLARI as readonly string[]).includes(ilkSuzgec ?? '') ? (ilkSuzgec as KitlePlatformu) : 'hepsi',
  );
  // Yeni kitle süzülen platformla açılır: Google listesindeyken "Yeni" Google kitlesi ister.
  const yeniForm = (): Form => ({ ...BOS_FORM, platform: suzgec === 'hepsi' ? 'meta' : suzgec });
  const formAc = (f: Form) => {
    setHata(null);
    setPanelFormu(f);
    setForm(f);
    setAcilis((n) => n + 1);
  };
  // Başlıktaki "Yeni kitle": liste gelmeden açılmıyor (eskisiyle aynı koşul).
  useVarlikYeni('kitleler', () => formAc(yeniForm()), yazabilir && durum.tur === 'hazir');

  const yukle = useCallback(async () => {
    try {
      const veri = await apiFetch<KitleSablonuListesi>(`/audience-templates?clientId=${clientId}`);
      setDurum({ tur: 'hazir', veri });
    } catch (err) {
      setDurum({ tur: 'hata', mesaj: err instanceof ApiRequestError ? err.message : m.yuklenemedi });
    }
  }, [clientId, m]);

  useEffect(() => {
    setDurum({ tur: 'yukleniyor' });
    void yukle();
  }, [yukle]);

  const [yeniAcildi, setYeniAcildi] = useState(false);
  useEffect(() => {
    if (yeniAc && !yeniAcildi && yazabilir && durum.tur === 'hazir') {
      setYeniAcildi(true);
      formAc(yeniForm());
    }
  }, [yeniAc, yeniAcildi, yazabilir, durum.tur]);
  const dk = useSozluk(kitleSozlugu);

  async function islem(fn: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setHata(null);
    try {
      await fn();
      await yukle();
      return true;
    } catch (err) {
      // SUNUCUNUN KENDİ CÜMLESİ: "bu adla şablon var", "ülke + il" gibi.
      setHata(err instanceof ApiRequestError ? err.message : m.islemTamamlanamadi);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function kaydet(): Promise<void> {
    if (!form) return;
    const govde = kitleGovdesi(clientId, form);
    // Sunucuyla AYNI şema: "Türkiye + İzmir" kaydederken reddediliyor, yayında değil.
    const k = kitleSablonuInputSchema.safeParse(govde);
    if (!k.success) {
      setHata(k.error.issues[0]?.message ?? m.alanGecersiz);
      return;
    }
    const tamam = await islem(() =>
      apiFetch(form.id ? `/audience-templates/${form.id}` : '/audience-templates', {
        method: form.id ? 'PUT' : 'POST',
        body: JSON.stringify(govde),
      }),
    );
    if (tamam) setForm(null);
  }

  const formuGuncelle = (f: Form) => {
    setPanelFormu(f);
    setForm(f);
  };
  const vazgec = () => {
    setForm(null);
    setHata(null);
  };
  const silinecekKitle = durum.tur === 'hazir' ? durum.veri.items.find((k) => k.id === silinecek) : undefined;
  const tumu = durum.tur === 'hazir' ? durum.veri.items : [];
  const gorunen = suzgec === 'hepsi' ? tumu : tumu.filter((k) => k.platform === suzgec);
  const sayi = (p: KitlePlatformu) => tumu.filter((k) => k.platform === p).length;

  return (
    <section id="kitleler" aria-label={m.ariaEtiketi} className="grid scroll-mt-24 gap-3">
      <p className="m-0 text-13 text-ink-muted">
        {dk.kullanimNotu}
      </p>

      {hata && form === null && (
        <Serit ton="hata" baslik={m.islemTamamlanamadi}>
          {hata}
        </Serit>
      )}

      <YanPanel
        acik={form !== null}
        onKapat={vazgec}
        genislik={560}
        baslik={panelFormu.id ? m.kitleyiDuzenle : m.yeniKitle}
        altEylemler={
          <>
            <Dugme ton="ikincil" onClick={vazgec} disabled={busy}>
              {dk.vazgec}
            </Dugme>
            <Dugme onClick={() => void kaydet()} bekliyor={busy} disabled={!panelFormu.name.trim()}>
              {m.kaydet}
            </Dugme>
          </>
        }
      >
        <KitleFormu key={acilis} clientId={clientId} form={panelFormu} setForm={formuGuncelle} />
        {/* SUNUCUNUN KENDİ CÜMLESİ panelin içinde: "bu adla şablon var". */}
        {hata && form !== null && (
          <Serit ton="hata" baslik={m.kaydedilemedi}>
            {hata}
          </Serit>
        )}
      </YanPanel>

      <Pencere
        acik={silinecek !== null}
        onKapat={() => setSilinecek(null)}
        genislik="dar"
        baslik={m.silBaslik}
        aciklama={silinecekKitle ? m.silAciklama(silinecekKitle.name) : undefined}
        altEylemler={
          <>
            <Dugme ton="ikincil" onClick={() => setSilinecek(null)} disabled={busy}>
              {dk.vazgec}
            </Dugme>
            <Dugme
              ton="tehlike"
              bekliyor={busy}
              onClick={() => {
                const id = silinecek;
                if (!id) return;
                void islem(() => apiFetch(`/audience-templates/${id}?clientId=${clientId}`, { method: 'DELETE' })).then(() =>
                  setSilinecek(null),
                );
              }}
            >
              {m.sil}
            </Dugme>
          </>
        }
      />

      {durum.tur === 'yukleniyor' && <Yukleniyor satir={3} etiket={m.yukleniyor} />}
      {durum.tur === 'hata' && <HataDurumu baslik={m.yuklenemedi} mesaj={durum.mesaj} onTekrar={() => void yukle()} />}
      {durum.tur === 'hazir' && durum.veri.items.length === 0 && (
        <BosDurum
          baslik={m.bosBaslik}
          neden={
            <>
              {m.bosNedenOnce}
              <strong>{m.bosNedenVurgu}</strong>
              {m.bosNedenSonra}
            </>
          }
        />
      )}
      {durum.tur === 'hazir' && tumu.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <BolumluSecici<Suzgec>
            etiket={dk.platform}
            secili={suzgec}
            onSec={setSuzgec}
            secenekler={[
              { deger: 'hepsi', etiket: <>{dk.tumu} <span className="font-normal opacity-70">{tumu.length}</span></> },
              ...(['meta', 'google'] as const).map((p) => ({
                deger: p,
                etiket: <>{PLATFORM_ADI[p]} <span className="font-normal opacity-70">{sayi(p)}</span></>,
              })),
            ]}
          />
        </div>
      )}
      {durum.tur === 'hazir' && tumu.length > 0 && gorunen.length === 0 && suzgec !== 'hepsi' && (
        <BosDurum baslik={dk.suzgecBos(PLATFORM_ADI[suzgec])} neden={dk.suzgecBosNeden} />
      )}
      {durum.tur === 'hazir' && gorunen.length > 0 && (
        <Kart dolgu={false}>
          <Tablo<KitleSablonuRecord>
            etiket={m.ariaEtiketi}
            satirlar={gorunen}
            satirAnahtari={(k) => k.id}
            sutunlar={[
              {
                anahtar: 'ad',
                baslik: dk.kitle,
                hucre: (k) => (
                  <AdHucresi
                    ad={
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {k.name}
                        {/* SALT OKUNUR ROZET: değiştirmenin tek yeri Kurulum (Ç-9). */}
                        {k.varsayilan && (
                          <span className="rounded-full bg-vurgu px-2 py-0.5 text-11 font-bold text-brand-strong">
                            {m.varsayilan}
                          </span>
                        )}
                      </span>
                    }
                    alt={
                      k.varsayilan && varsayilanAdresi ? (
                        <Link href={varsayilanAdresi} className="text-ink-muted underline-offset-2 hover:text-ink hover:underline">
                          {m.kurulumdaDegistir}
                        </Link>
                      ) : undefined
                    }
                  />
                ),
              },
              { anahtar: 'platform', baslik: dk.platform, hucre: (k) => <PlatformEtiketi platform={k.platform} /> },
              {
                anahtar: 'tanim',
                baslik: m.kolonTanim,
                // Alt sınır: telefonda sütun kelime kelime kırılıyordu (canlı, 375 px); tablo kendi içinde kayar.
                hucre: (k) => <span className="block min-w-[220px] text-13 text-ink-muted">{platformOzeti(k, dk)}</span>,
              },
              {
                anahtar: 'eylem',
                baslik: <span className="sr-only">{m.kolonEylem}</span>,
                sayi: true,
                hucre: (k) =>
                  yazabilir ? (
                    <span className="inline-flex items-center gap-1">
                      <Dugme ton="ikincil" boyut="kucuk" onClick={() => formAc(formdan(k))} disabled={busy}>
                        {m.duzenle}
                      </Dugme>
                      <AcilirMenu
                        tasma="portal"
                        etiket={m.digerEylemlerAd(k.name)}
                        hizala="sag"
                        genislik="w-44"
                        tetik={({ acik: _acik, ...o }) => (
                          <button type="button" {...o} className={IKON_TETIK} aria-label={m.digerEylemler}>
                            ⋯
                          </button>
                        )}
                      >
                        {/* İKİ ADIMLI SİLME (Bölüm 1 deseni): menü + onay penceresi. */}
                        <MenuOgesi tehlike devreDisi={busy} onClick={() => setSilinecek(k.id)}>
                          {m.sil}
                        </MenuOgesi>
                      </AcilirMenu>
                    </span>
                  ) : null,
              },
            ]}
          />
          <SayfalamaCubugu bas={1} son={gorunen.length} toplam={gorunen.length} />
        </Kart>
      )}
    </section>
  );
}

function formdan(k: KitleSablonuRecord): Form {
  return {
    id: k.id,
    platform: k.platform,
    name: k.name,
    locations: k.locations,
    ageMin: k.ageMin,
    ageMax: k.ageMax,
    genders: k.genders,
    interests: k.interests,
    ozelKitleler: k.ozelKitleler,
    google: k.google,
  };
}

/** Platform rozeti: logo + ad. Renk logoda; metin siyah (kılavuz). */
function PlatformEtiketi({ platform }: { platform: KitlePlatformu }) {
  return (
    // w-fit: formdaki `Alan` ızgarasında çocuk satır boyu uzuyordu (canlıda rozet panel genişliğinde çıktı).
    <span className="inline-flex h-6 w-fit items-center gap-1.5 whitespace-nowrap rounded-full border border-line-strong px-2.5 text-12 font-bold text-ink">
      <PlatformLogo kind={PLATFORM_LOGOSU[platform]} className="h-3.5 w-3.5" />
      {PLATFORM_ADI[platform]}
    </span>
  );
}

/** Tanım sütunu: ortak alanlar + YALNIZ kitlenin kendi platformunun alanları. */
function platformOzeti(
  k: Pick<KitleSablonuRecord, 'platform' | 'locations' | 'ageMin' | 'ageMax' | 'genders' | 'interests' | 'ozelKitleler' | 'google'>,
  dk: { googleKelime: (n: number) => string },
): string {
  if (k.platform === 'meta') return kitleOzeti(k);
  const g = googleOzeti(k.google, dk);
  return [kitleOzeti({ ...k, interests: [], ozelKitleler: [] }), g === '—' ? null : g].filter(Boolean).join(' · ');
}

function KitleFormu(p: { clientId: string; form: Form; setForm: (f: Form) => void }) {
  const { dil } = useDil();
  const m = sec(markaMerkeziVeriSozlugu, dil).kitleler;
  const dk = useSozluk(kitleSozlugu);
  const f = p.form;
  const degis = (patch: Partial<Form>) => p.setForm({ ...f, ...patch });
  // Seçici `GeoLocationOption` konuşuyor, şablon `KitleKonumu`; ikisi aynı
  // alanları taşıyor, dönüşüm yalnızca adlandırma.
  const secili: GeoLocationOption[] = f.locations.map((l) => ({
    key: l.key,
    type: l.type,
    name: l.label,
    label: l.label,
    countryCode: l.countryCode ?? '',
  }));

  /*
   * PLATFORM DEĞİŞİNCE ÖBÜR PLATFORMUN ALANLARI BOŞALIR. Gizli kalan bir
   * Meta ilgi alanı Google kitlesiyle gitseydi sunucu kaydı reddederdi ve
   * kullanıcı göremediği bir alan yüzünden kaydedemezdi.
   */
  const platformSec = (pl: KitlePlatformu) =>
    pl !== f.platform &&
    degis({ platform: pl, interests: [], ozelKitleler: [], google: { ilgiler: [], kelimeler: [] } });

  return (
    <div className="grid gap-4">
      <Alan etiket={dk.platformSecimi} ipucu={f.id ? dk.platformKilitli : dk.platformYeni}>
        {() =>
          f.id ? (
            <PlatformEtiketi platform={f.platform} />
          ) : (
            <BolumluSecici<KitlePlatformu>
              etiket={dk.platformSecimi}
              secili={f.platform}
              onSec={platformSec}
              secenekler={(['meta', 'google'] as const).map((pl) => ({
                deger: pl,
                etiket: (
                  <>
                    <PlatformLogo kind={PLATFORM_LOGOSU[pl]} className="h-3.5 w-3.5" />
                    {PLATFORM_ADI[pl]}
                  </>
                ),
              }))}
            />
          )
        }
      </Alan>

      <TarifEt
        clientId={p.clientId}
        uygula={(o) =>
          // Öneri iki platformun karşılığını getiriyor; forma YALNIZ seçili platformunki yazılıyor.
          degis(f.platform === 'meta' ? { ...o, google: { ilgiler: [], kelimeler: [] } } : { ...o, interests: [] })
        }
      />

      <Alan etiket={dk.kitleAdi}>
        {(id) => (
          <Girdi
            id={id}
            value={f.name}
            onChange={(e) => degis({ name: e.target.value })}
            maxLength={KITLE_SINIRLARI.ad}
            placeholder={m.kitleAdiYerTutucu}
          />
        )}
      </Alan>

      <HedeflemeSecici
        clientId={p.clientId}
        lokasyonlar={secili}
        setLokasyonlar={(v) =>
          degis({
            // Arama yalnızca ülke/il/şehir döndürüyor (`searchGeoLocations`
            // location_types); başka bir tür gelirse sunucu şeması reddeder
            // ve sebep ekranda yazar.
            locations: v.map((o) => ({
              key: o.key,
              type: o.type as KitleKonumu['type'],
              label: o.label,
              countryCode: o.countryCode || null,
            })),
          })
        }
        kitleId={null}
        setKitleId={() => undefined}
        kayitliKitle={false}
      />

      <FormIzgarasi>
        <Alan etiket={m.enKucukYas}>
          {(id) => (
            <Secim id={id} value={f.ageMin} onChange={(e) => degis({ ageMin: Number(e.target.value) })}>
              {YASLAR.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket={m.enBuyukYas}>
          {(id) => (
            <Secim id={id} value={f.ageMax} onChange={(e) => degis({ ageMax: Number(e.target.value) })}>
              {YASLAR.map((y) => (
                <option key={y} value={y}>
                  {y === 65 ? m.yasUstu : y}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket={m.cinsiyet}>
          {(id) => (
            <Secim id={id} value={f.genders} onChange={(e) => degis({ genders: e.target.value as Form['genders'] })}>
              <option value="all">{m.tumu}</option>
              <option value="female">{m.kadin}</option>
              <option value="male">{m.erkek}</option>
            </Secim>
          )}
        </Alan>
      </FormIzgarasi>

      {f.platform === 'meta' ? (
        <>
          <IlgiSecici clientId={p.clientId} secili={f.interests} degis={(v) => degis({ interests: v })} />
          <OzelKitleSecici
            clientId={p.clientId}
            secili={f.ozelKitleler}
            degis={(v) => degis({ ozelKitleler: v })}
          />
        </>
      ) : (
        <GoogleKarsiligi google={f.google} degis={(g) => degis({ google: g })} />
      )}

      <p className="m-0 rounded-alan bg-surface-muted px-3 py-2 text-12 text-ink-muted">{m.ozet} {platformOzeti(f, dk)}</p>
    </div>
  );
}

/**
 * ═══ TARİF ET → ÖNERİ ═══
 *
 * Yapay zekâ metni yapılandırıyor, sunucu Meta'nın aramasıyla gerçek
 * kimliklere çözüyor ve sonuç FORMA dolduruluyor — kaydedilmiyor. Kullanıcı
 * ne önerildiğini, neyin bulunamadığını ve neyin Meta'da kurulamadığını
 * görüp düzeltiyor. Önerinin kendisi bir tahmin; kaydeden kullanıcı.
 */
function TarifEt({
  clientId,
  uygula,
}: {
  clientId: string;
  uygula: (o: Pick<Form, 'locations' | 'ageMin' | 'ageMax' | 'genders' | 'interests' | 'google'>) => void;
}) {
  const [metin, setMetin] = useState('');
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [oneri, setOneri] = useState<KitleOnerisi | null>(null);
  const dk = useSozluk(kitleSozlugu);
  const { dil } = useDil();
  const m = sec(markaMerkeziVeriSozlugu, dil).kitleler;

  async function oner(): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      const o = await apiFetch<KitleOnerisi>('/audience-templates/ai-oneri', {
        method: 'POST',
        body: JSON.stringify({ clientId, metin }),
      });
      setOneri(o);
      uygula({
        locations: o.locations,
        ageMin: o.ageMin,
        ageMax: o.ageMax,
        genders: o.genders,
        interests: o.interests.map((i) => ({ id: i.id, name: i.name })),
        google: { ilgiler: o.google.ilgiler.map((g) => ({ id: g.id, ad: g.ad, tur: g.tur })), kelimeler: o.google.kelimeler },
      });
    } catch (err) {
      setHata(err instanceof ApiRequestError ? err.message : m.oneriAlinamadi);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2 rounded-alan bg-surface-muted p-3">
      <Alan etiket={dk.tarifEtiketi}>
        {(id) => (
          <MetinAlani
            id={id}
            value={metin}
            onChange={(e) => setMetin(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={m.tarifYerTutucu}
            className="min-h-0"
          />
        )}
      </Alan>
      <div className="flex items-center gap-2">
        <Dugme ton="ikincil" boyut="kucuk" onClick={() => void oner()} bekliyor={busy} disabled={metin.trim().length < 5}>
          {m.oner}
        </Dugme>
        <span className="text-12 text-ink-muted">{m.oneriNotu}</span>
      </div>
      {hata && (
        <p role="alert" className="m-0 text-12 text-danger-strong">
          {hata}
        </p>
      )}
      {oneri && (
        <div className="grid gap-1 text-12">
          {oneri.hesapAdi && <p className="m-0 text-ink-muted">{m.metaArandi(oneri.hesapAdi)}</p>}
          {oneri.interests.length > 0 && (
            <ul className="m-0 list-none p-0 text-ink">
              {oneri.interests.map((i) => (
                <li key={i.id}>
                  “{i.terim}” → {i.name} <span className="text-ink-muted">({kitleBuyuklugu(i, dil)})</span>
                </li>
              ))}
            </ul>
          )}
          {oneri.eslesmeyen.length > 0 && (
            <p className="m-0 text-danger-strong">
              {m.metaBulunamadi}{' '}
              {oneri.eslesmeyen.map((e) => `“${e.terim}” (${e.tur === 'konum' ? m.terimKonum : m.terimIlgi})`).join(', ')}
            </p>
          )}
          {oneri.google.hesapAdi && <p className="m-0 text-ink-muted">{dk.googleArandi(oneri.google.hesapAdi)}</p>}
          {oneri.google.ilgiler.length > 0 && (
            <ul className="m-0 list-none p-0 text-ink">
              {oneri.google.ilgiler.map((g) => (
                <li key={g.id}>
                  “{g.terim}” → {kategoriAdi(g.ad)} <span className="text-ink-muted">({g.tur === 'in_market' ? dk.ilgiTuruInMarket : dk.ilgiTuruAffinity})</span>
                </li>
              ))}
            </ul>
          )}
          {!oneri.google.hata && oneri.google.hesapAdi && oneri.google.ilgiler.length === 0 && (
            <p className="m-0 text-danger-strong">{dk.googleEslesmeYok(oneri.google.taranan)}</p>
          )}
          {oneri.google.hata && (
            <p className="m-0 text-danger-strong">
              {dk.googleOkunamadi}: {oneri.google.hata}
            </p>
          )}
          {oneri.uygulanamayan.length > 0 && (
            <ul className="m-0 list-none p-0 text-danger-strong">
              {oneri.uygulanamayan.map((u) => (
                <li key={u.ifade}>
                  {m.uygulanamadi(u.ifade, u.sebep)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Google kategori adı yol taşıyor ("/Sports & Fitness/Golf Enthusiasts"): ekranda son parça. */
function kategoriAdi(ad: string): string {
  return ad.split('/').filter(Boolean).at(-1) ?? ad;
}

function googleOzeti(g: KitleGoogle, dk: { googleKelime: (n: number) => string }): string {
  const parcalar: string[] = [];
  if (g.ilgiler.length > 0) parcalar.push(g.ilgiler.slice(0, 2).map((x) => kategoriAdi(x.ad)).join(', ') + (g.ilgiler.length > 2 ? ` +${g.ilgiler.length - 2}` : ''));
  if (g.kelimeler.length > 0) parcalar.push(dk.googleKelime(g.kelimeler.length));
  return parcalar.length > 0 ? parcalar.join(' · ') : '—';
}

/**
 * ═══ GOOGLE KARŞILIĞI (2026-10-16) ═══
 *
 * Kategoriler yalnız "Öner"den geliyor (Google kimliğiyle); burada
 * kaldırılabiliyor ama elle ad yazılarak eklenmiyor: adla uydurulmuş bir
 * kategori Google'da karşılık bulmaz. Kelimeler serbest, her satır bir
 * arama terimi (özel segment).
 */
function GoogleKarsiligi({ google, degis }: { google: KitleGoogle; degis: (g: KitleGoogle) => void }) {
  const dk = useSozluk(kitleSozlugu);
  const [metin, setMetin] = useState(google.kelimeler.join('\n'));
  // "Öner" kelimeleri DIŞARIDAN değiştirince kutu da güncellenmeli; yazarken
  // ayrıştırılmış metin zaten listeye eşit olduğu için imleç oynamıyor.
  useEffect(() => {
    if (kelimeleriAyir(metin).join('\n') !== google.kelimeler.join('\n')) setMetin(google.kelimeler.join('\n'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [google.kelimeler]);
  return (
    <fieldset className="grid gap-2 rounded-alan border border-line p-3">
      <legend className="px-1 text-13 font-semibold text-ink">{dk.googleBaslik}</legend>
      <p className="m-0 text-12 text-ink-muted">{dk.googleAciklama}</p>
      {google.ilgiler.length === 0 ? (
        <p className="m-0 text-12 text-ink-muted">{dk.googleKategoriYok}</p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {google.ilgiler.map((g) => (
            <li key={g.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-12 text-ink">
              {kategoriAdi(g.ad)}
              <span className="text-ink-muted">· {g.tur === 'in_market' ? dk.ilgiTuruInMarket : dk.ilgiTuruAffinity}</span>
              <button
                type="button"
                aria-label={`${dk.kaldir}: ${kategoriAdi(g.ad)}`}
                className="text-ink-muted hover:text-ink"
                onClick={() => degis({ ...google, ilgiler: google.ilgiler.filter((x) => x.id !== g.id) })}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <Alan etiket={dk.kelimelerEtiketi}>
        {(id) => (
          <MetinAlani
            id={id}
            value={metin}
            rows={3}
            placeholder={dk.kelimelerYerTutucu}
            onChange={(e) => {
              setMetin(e.target.value);
              degis({ ...google, kelimeler: kelimeleriAyir(e.target.value) });
            }}
          />
        )}
      </Alan>
    </fieldset>
  );
}

/** Kutudaki metin → tekil, boş olmayan arama terimleri (sunucu şeması 2-80 karakter, en çok 50). */
export function kelimeleriAyir(metin: string): string[] {
  return [...new Set(metin.split('\n').map((x) => x.trim()).filter((x) => x.length >= 2))].slice(0, 50);
}
