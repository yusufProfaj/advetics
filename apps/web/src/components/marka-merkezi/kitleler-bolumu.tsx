'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  KITLE_SINIRLARI,
  kitleOzeti,
  kitleSablonuInputSchema,
  type GeoLocationOption,
  type KitleGoogle,
  type KitleIlgi,
  type KitleOzel,
  type KitleKonumu,
  type KitleOnerisi,
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
import { useVarlikYeni } from './varliklar/birincil-eylem';
import { HedeflemeSecici } from '@/components/autoboost/hedefleme-secici';
import { IlgiSecici, kitleBuyuklugu } from './ilgi-secici';
import { OzelKitleSecici } from './ozel-kitle-secici';
import { useSozluk } from '@/dil/saglayici';
import { kitleSozlugu } from '@/dil/sozlukler/kitle';

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
 * YALNIZCA META. Konumlar Meta'nın coğrafi aramasından geliyor ve Google'ın
 * konum kimlikleri ayrı bir uzay; ekran bunu söylüyor.
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

export function KitlelerBolumu({
  clientId,
  yazabilir,
  varsayilanAdresi,
  yeniAc = false,
}: {
  clientId: string;
  yazabilir: boolean;
  /**
   * Adreste `yeni=1`: Reklam Yöneticisi'nin "＋ Hedef kitle" düğmesi buraya
   * geliyor ve kullanıcı yeni kitle formunu açık bulmalı (bir tık daha
   * istemek, düğmenin sözünü yarım bırakırdı). Liste geldikten sonra BİR KEZ.
   */
  yeniAc?: boolean;
  /** Varsayılan kitlenin evi (Kurulum › Reklam varsayılanları); görme yetkisi yoksa null. */
  varsayilanAdresi: string | null;
}) {
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
  const formAc = (f: Form) => {
    setHata(null);
    setPanelFormu(f);
    setForm(f);
    setAcilis((n) => n + 1);
  };
  // Başlıktaki "Yeni kitle": liste gelmeden açılmıyor (eskisiyle aynı koşul).
  useVarlikYeni('kitleler', () => formAc(BOS_FORM), yazabilir && durum.tur === 'hazir');

  const yukle = useCallback(async () => {
    try {
      const veri = await apiFetch<KitleSablonuListesi>(`/audience-templates?clientId=${clientId}`);
      setDurum({ tur: 'hazir', veri });
    } catch (err) {
      setDurum({ tur: 'hata', mesaj: err instanceof ApiRequestError ? err.message : 'Kitleler yüklenemedi.' });
    }
  }, [clientId]);

  useEffect(() => {
    setDurum({ tur: 'yukleniyor' });
    void yukle();
  }, [yukle]);

  const [yeniAcildi, setYeniAcildi] = useState(false);
  useEffect(() => {
    if (yeniAc && !yeniAcildi && yazabilir && durum.tur === 'hazir') {
      setYeniAcildi(true);
      formAc(BOS_FORM);
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
      setHata(err instanceof ApiRequestError ? err.message : 'İşlem tamamlanamadı.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function kaydet(): Promise<void> {
    if (!form) return;
    const govde = {
      clientId,
      name: form.name,
      locations: form.locations,
      ageMin: form.ageMin,
      ageMax: form.ageMax,
      genders: form.genders,
      interests: form.interests,
      ozelKitleler: form.ozelKitleler,
      google: form.google,
    };
    // Sunucuyla AYNI şema: "Türkiye + İzmir" kaydederken reddediliyor, yayında değil.
    const k = kitleSablonuInputSchema.safeParse(govde);
    if (!k.success) {
      setHata(k.error.issues[0]?.message ?? 'Alanlardan biri geçersiz.');
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

  return (
    <section id="kitleler" aria-label="Kitleler" className="grid scroll-mt-24 gap-3">
      <p className="m-0 text-13 text-ink-muted">
        Kime gösterileceği: konum, yaş, cinsiyet, ilgi. Varsayılan kitle reklam kurarken kendiliğinden seçilir ve Kurulum’da
        değişir. {dk.kullanimNotu}
      </p>

      {hata && form === null && (
        <Serit ton="hata" baslik="İşlem tamamlanamadı.">
          {hata}
        </Serit>
      )}

      <YanPanel
        acik={form !== null}
        onKapat={vazgec}
        genislik={560}
        baslik={panelFormu.id ? 'Kitleyi düzenle' : 'Yeni kitle'}
        altEylemler={
          <>
            <Dugme ton="ikincil" onClick={vazgec} disabled={busy}>
              Vazgeç
            </Dugme>
            <Dugme onClick={() => void kaydet()} bekliyor={busy} disabled={!panelFormu.name.trim()}>
              Kaydet
            </Dugme>
          </>
        }
      >
        <KitleFormu key={acilis} clientId={clientId} form={panelFormu} setForm={formuGuncelle} />
        {/* SUNUCUNUN KENDİ CÜMLESİ panelin içinde: "bu adla şablon var". */}
        {hata && form !== null && (
          <Serit ton="hata" baslik="Kaydedilemedi.">
            {hata}
          </Serit>
        )}
      </YanPanel>

      <Pencere
        acik={silinecek !== null}
        onKapat={() => setSilinecek(null)}
        genislik="dar"
        baslik="Kitle silinsin mi?"
        aciklama={silinecekKitle ? `“${silinecekKitle.name}” silinir. Bu geri alınamaz.` : undefined}
        altEylemler={
          <>
            <Dugme ton="ikincil" onClick={() => setSilinecek(null)} disabled={busy}>
              Vazgeç
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
              Sil
            </Dugme>
          </>
        }
      />

      {durum.tur === 'yukleniyor' && <Yukleniyor satir={3} etiket="Kitleler yükleniyor" />}
      {durum.tur === 'hata' && <HataDurumu baslik="Kitleler yüklenemedi." mesaj={durum.mesaj} onTekrar={() => void yukle()} />}
      {durum.tur === 'hazir' && durum.veri.items.length === 0 && (
        <BosDurum
          baslik="Kayıtlı kitle yok"
          neden={
            <>
              Kitle olmadan reklam <strong>Türkiye geneli, 18 yaş ve üzeri</strong> gösterilir. Varsayılan konum
              Kurulum’da seçilir.
            </>
          }
        />
      )}
      {durum.tur === 'hazir' && durum.veri.items.length > 0 && (
        <Kart dolgu={false}>
          <Tablo<KitleSablonuRecord>
            etiket="Kitleler"
            satirlar={durum.veri.items}
            satirAnahtari={(k) => k.id}
            sutunlar={[
              {
                anahtar: 'ad',
                baslik: 'Kitle',
                hucre: (k) => (
                  <AdHucresi
                    ad={
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {k.name}
                        {/* SALT OKUNUR ROZET: değiştirmenin tek yeri Kurulum (Ç-9). */}
                        {k.varsayilan && (
                          <span className="rounded-full bg-vurgu px-2 py-0.5 text-11 font-bold text-brand-strong">
                            Varsayılan
                          </span>
                        )}
                      </span>
                    }
                    alt={
                      k.varsayilan && varsayilanAdresi ? (
                        <Link href={varsayilanAdresi} className="text-ink-muted underline-offset-2 hover:text-ink hover:underline">
                          Kurulum’da değiştir
                        </Link>
                      ) : undefined
                    }
                  />
                ),
              },
              { anahtar: 'tanim', baslik: 'Tanım', hucre: (k) => <span className="text-13 text-ink-muted">{kitleOzeti(k)}</span> },
              {
                anahtar: 'google',
                baslik: 'Google',
                ikincil: true,
                hucre: (k) => <span className="text-13 text-ink-muted">{googleOzeti(k.google, dk)}</span>,
              },
              {
                anahtar: 'eylem',
                baslik: <span className="sr-only">Eylem</span>,
                sayi: true,
                hucre: (k) =>
                  yazabilir ? (
                    <span className="inline-flex items-center gap-1">
                      <Dugme ton="ikincil" boyut="kucuk" onClick={() => formAc(formdan(k))} disabled={busy}>
                        Düzenle
                      </Dugme>
                      <AcilirMenu
                        tasma="portal"
                        etiket={`${k.name}: diğer eylemler`}
                        hizala="sag"
                        genislik="w-44"
                        tetik={({ acik: _acik, ...o }) => (
                          <button type="button" {...o} className={IKON_TETIK} aria-label="Diğer eylemler">
                            ⋯
                          </button>
                        )}
                      >
                        {/* İKİ ADIMLI SİLME (Bölüm 1 deseni): menü + onay penceresi. */}
                        <MenuOgesi tehlike devreDisi={busy} onClick={() => setSilinecek(k.id)}>
                          Sil
                        </MenuOgesi>
                      </AcilirMenu>
                    </span>
                  ) : null,
              },
            ]}
          />
          <SayfalamaCubugu bas={1} son={durum.veri.items.length} toplam={durum.veri.items.length} />
        </Kart>
      )}
    </section>
  );
}

function formdan(k: KitleSablonuRecord): Form {
  return {
    id: k.id,
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

function KitleFormu(p: { clientId: string; form: Form; setForm: (f: Form) => void }) {
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

  return (
    <div className="grid gap-4">
      <TarifEt clientId={p.clientId} uygula={(o) => degis(o)} />

      <Alan etiket="Kitle adı">
        {(id) => (
          <Girdi
            id={id}
            value={f.name}
            onChange={(e) => degis({ name: e.target.value })}
            maxLength={KITLE_SINIRLARI.ad}
            placeholder="Örn. İzmir, 25-45 kadın"
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
        <Alan etiket="En küçük yaş">
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
        <Alan etiket="En büyük yaş">
          {(id) => (
            <Secim id={id} value={f.ageMax} onChange={(e) => degis({ ageMax: Number(e.target.value) })}>
              {YASLAR.map((y) => (
                <option key={y} value={y}>
                  {y === 65 ? '65 ve üzeri' : y}
                </option>
              ))}
            </Secim>
          )}
        </Alan>
        <Alan etiket="Cinsiyet">
          {(id) => (
            <Secim id={id} value={f.genders} onChange={(e) => degis({ genders: e.target.value as Form['genders'] })}>
              <option value="all">Tümü</option>
              <option value="female">Kadın</option>
              <option value="male">Erkek</option>
            </Secim>
          )}
        </Alan>
      </FormIzgarasi>

      <IlgiSecici clientId={p.clientId} secili={f.interests} degis={(v) => degis({ interests: v })} />

      <OzelKitleSecici
        clientId={p.clientId}
        secili={f.ozelKitleler}
        degis={(v) => degis({ ozelKitleler: v })}
      />

      <GoogleKarsiligi google={f.google} degis={(g) => degis({ google: g })} />

      <p className="m-0 rounded-alan bg-surface-muted px-3 py-2 text-12 text-ink-muted">Özet: {kitleOzeti(f)}</p>
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
      setHata(err instanceof ApiRequestError ? err.message : 'Öneri alınamadı.');
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
            placeholder="Örn. İzmir’de lüks araçlarla ilgilenen 30-55 yaş erkekler"
            className="min-h-0"
          />
        )}
      </Alan>
      <div className="flex items-center gap-2">
        <Dugme ton="ikincil" boyut="kucuk" onClick={() => void oner()} bekliyor={busy} disabled={metin.trim().length < 5}>
          Öner
        </Dugme>
        <span className="text-12 text-ink-muted">
          Öneri aşağıdaki alanları doldurur; kaydetmeden önce kontrol et.
        </span>
      </div>
      {hata && (
        <p role="alert" className="m-0 text-12 text-danger-strong">
          {hata}
        </p>
      )}
      {oneri && (
        <div className="grid gap-1 text-12">
          {oneri.hesapAdi && <p className="m-0 text-ink-muted">Meta’da arandı: {oneri.hesapAdi}</p>}
          {oneri.interests.length > 0 && (
            <ul className="m-0 list-none p-0 text-ink">
              {oneri.interests.map((i) => (
                <li key={i.id}>
                  “{i.terim}” → {i.name} <span className="text-ink-muted">({kitleBuyuklugu(i)})</span>
                </li>
              ))}
            </ul>
          )}
          {oneri.eslesmeyen.length > 0 && (
            <p className="m-0 text-danger-strong">
              Meta’da bulunamadı:{' '}
              {oneri.eslesmeyen.map((e) => `“${e.terim}” (${e.tur === 'konum' ? 'konum' : 'ilgi'})`).join(', ')}
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
                  Uygulanamadı: “{u.ifade}”, {u.sebep}
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
