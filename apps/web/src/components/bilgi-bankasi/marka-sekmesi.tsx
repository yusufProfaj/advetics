'use client';

import { useEffect, useState } from 'react';
import {
  CAMPAIGN_GOALS,
  CALISMA_GUNLERI,
  GOAL_META,
  GUN_ADI,
  calismaAraligiSchema,
  type CalismaAraligi,
  type CalismaSaatleri,
  type HaftaGunu,
  MARKA_SINIRLARI,
  sikSayfaSchema,
  upsertClientProfileSchema,
  type CampaignGoal,
  type ClientProfileRecord,
  type SikSayfa,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import type { ReactNode } from 'react';
import { Dugme } from '@/components/ui/dugme';
import { Kart } from '@/components/ui/kart';
import { Alan, Girdi, MetinAlani } from '@/components/ui/alan';
import { HataDurumu, Serit, Yukleniyor } from '@/components/ui/hal';

/**
 * ═══ MARKA SEKMESİ — YAPILANDIRILMIŞ ALANLAR ═══
 *
 * Bu sekme bir süre tek bir serbest metin kutusuydu ("Marka Bilgileri").
 * Ekranda dolu görünüyordu ama makine onu kullanamıyordu: Reklam Oluştur
 * hedef adresi ve amacı her seferinde yeniden soruyordu. Alanlar artık ayrı
 * ve Reklam Oluştur ile AI asistan onları doğrudan okuyor.
 *
 * ESKİ METİN KAYBOLMADI: "Ek notlar" kutusu aynı kolonu (`markaBilgileri`)
 * gösteriyor. İçindeki metni yeni alanlara otomatik ayırmak bir tahmin olurdu.
 *
 * DOĞRULAMA GİRİŞTE: sayfa adresi kutudan çıkınca denetleniyor ve kayıt
 * düğmesi paylaşılan şemayla (`upsertClientProfileSchema`) aynı kuralı
 * uyguluyor. Kullanıcı hatalı adresi kaydederken öğreniyor, reklamı
 * yayınlarken değil.
 *
 * WEB SİTESİ BURADA DÜZENLENMİYOR: `clients.website` zaten var ve AI
 * doldurma onu okuyor; ikinci bir kutu iki ayrı adres demek.
 */
type Durum =
  | { tur: 'yukleniyor' }
  | { tur: 'hata'; mesaj: string }
  | { tur: 'hazir' };

interface Form {
  markaAdi: string;
  sektor: string;
  urunKategorileri: string[];
  sikSayfalar: SikSayfa[];
  anaAmac: CampaignGoal | null;
  uslup: string;
  vaatler: string[];
  metinSablonlari: string[];
  yasalUyari: string;
  markaBilgileri: string;
  /** Boş dizi = bilinmiyor (kayıtta NULL). */
  calismaSaatleri: CalismaSaatleri;
}

const BOS: Form = {
  markaAdi: '',
  sektor: '',
  urunKategorileri: [],
  sikSayfalar: [],
  anaAmac: null,
  uslup: '',
  vaatler: [],
  metinSablonlari: [],
  yasalUyari: '',
  markaBilgileri: '',
  calismaSaatleri: [],
};


export function MarkaSekmesi({ clientId, canWrite }: { clientId: string; canWrite: boolean }) {
  const [durum, setDurum] = useState<Durum>({ tur: 'yukleniyor' });
  const [form, setForm] = useState<Form>(BOS);
  const [busy, setBusy] = useState(false);
  const [kayitHatasi, setKayitHatasi] = useState<string | null>(null);
  const [kaydedildi, setKaydedildi] = useState(false);

  useEffect(() => {
    let iptal = false;
    setDurum({ tur: 'yukleniyor' });
    apiFetch<ClientProfileRecord>(`/client-profile?clientId=${clientId}`)
      .then((p) => {
        if (iptal) return;
        setForm({
          markaAdi: p.markaAdi ?? '',
          sektor: p.sektor ?? '',
          urunKategorileri: p.urunKategorileri,
          sikSayfalar: p.sikSayfalar,
          anaAmac: p.anaAmac,
          uslup: p.uslup ?? '',
          vaatler: p.vaatler,
          metinSablonlari: p.metinSablonlari,
          yasalUyari: p.yasalUyari ?? '',
          markaBilgileri: p.markaBilgileri ?? '',
          calismaSaatleri: p.calismaSaatleri ?? [],
        });
        setDurum({ tur: 'hazir' });
      })
      .catch((err) => {
        // Hata BOŞ FORMA ÇEVRİLMİYOR: boş form "henüz doldurulmadı" gibi
        // görünür ve kullanıcı kaydedip dolu profili silebilirdi.
        if (!iptal) {
          setDurum({
            tur: 'hata',
            mesaj: err instanceof ApiRequestError ? err.message : 'Marka bilgileri yüklenemedi.',
          });
        }
      });
    return () => {
      iptal = true;
    };
  }, [clientId]);

  const degis = <K extends keyof Form>(k: K, v: Form[K]): void => {
    setKaydedildi(false);
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function kaydet(): Promise<void> {
    setKayitHatasi(null);
    const govde = {
      clientId,
      markaAdi: form.markaAdi.trim() || null,
      sektor: form.sektor.trim() || null,
      urunKategorileri: form.urunKategorileri,
      sikSayfalar: form.sikSayfalar,
      anaAmac: form.anaAmac,
      uslup: form.uslup.trim() || null,
      vaatler: form.vaatler,
      metinSablonlari: form.metinSablonlari,
      yasalUyari: form.yasalUyari.trim() || null,
      markaBilgileri: form.markaBilgileri.trim() || null,
      calismaSaatleri: form.calismaSaatleri.length ? form.calismaSaatleri : null,
    };
    // Sunucuyla AYNI şema: burada geçen gövde orada reddedilmez.
    const kontrol = upsertClientProfileSchema.safeParse(govde);
    if (!kontrol.success) {
      setKayitHatasi(kontrol.error.issues[0]?.message ?? 'Alanlardan biri geçersiz.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/client-profile', { method: 'POST', body: JSON.stringify(govde) });
      setKaydedildi(true);
    } catch (err) {
      setKayitHatasi(err instanceof ApiRequestError ? err.message : 'Kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  if (durum.tur === 'yukleniyor') {
    return (
      <Kart baslik="Marka bilgileri">
        <Yukleniyor satir={4} etiket="Marka bilgileri yükleniyor" />
      </Kart>
    );
  }
  if (durum.tur === 'hata') {
    return <HataDurumu baslik="Marka bilgileri yüklenemedi." mesaj={durum.mesaj} />;
  }

  const kapali = !canWrite || busy;

  return (
    /*
      KARTIN KENDİSİ BURADA (2026-10-14, taslak `#marka`): başlık kartın
      başlık satırında, Kaydet kartın SAĞ ALTINDA koyu küçük düğme. Eskiden
      sayfa çerçeveyi, bileşen başlığı ve kırmızı Kaydet'i çiziyordu; ekranda
      birden çok kırmızı dolu düğme "asıl eylem hangisi" sorusunu açıyordu.
      Marka Merkezi artık bu bileşeni yalnız bir çapa kabına (`Capa`) koyuyor.
    */
    <Kart
      baslik="Marka bilgileri"
      altEylem={
        canWrite ? (
          <div className="flex items-center gap-3">
            {kaydedildi && (
              <span role="status" className="text-12 text-ink-muted">
                Kaydedildi.
              </span>
            )}
            <Dugme ton="koyu" boyut="kucuk" onClick={() => void kaydet()} bekliyor={busy}>
              Kaydet
            </Dugme>
          </div>
        ) : (
          <span className="text-12 text-ink-muted">Bu bilgileri düzenleme yetkin yok.</span>
        )
      }
    >
    <div className="grid gap-5">
      <p className="m-0 text-13 text-ink-muted">Marka adı, amaç, üslup ve öne çıkan vaatler.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Marka adı" ipucu="Boşsa workspace adı kullanılır.">
          {(id, aciklamaId) => (
            <Girdi
              id={id}
              aria-describedby={aciklamaId}
              value={form.markaAdi}
              onChange={(e) => degis('markaAdi', e.target.value)}
              maxLength={MARKA_SINIRLARI.markaAdi}
              disabled={kapali}
            />
          )}
        </Alan>
        <Alan etiket="Sektör" ipucu="Örn. Konut inşaatı, Diş kliniği">
          {(id, aciklamaId) => (
            <Girdi
              id={id}
              aria-describedby={aciklamaId}
              value={form.sektor}
              onChange={(e) => degis('sektor', e.target.value)}
              maxLength={MARKA_SINIRLARI.sektor}
              disabled={kapali}
            />
          )}
        </Alan>
      </div>

      <Grup etiket="Ana amaç" ipucu="AdvCampaign bu amaçla açılır; istersen orada değiştirirsin.">
        <div className="grid gap-2 sm:grid-cols-3">
          {CAMPAIGN_GOALS.map((g) => (
            <button
              key={g}
              type="button"
              disabled={kapali}
              aria-pressed={form.anaAmac === g}
              onClick={() => degis('anaAmac', form.anaAmac === g ? null : g)}
              className={`rounded-alan border p-3 text-left transition-colors disabled:cursor-not-allowed motion-reduce:transition-none ${
                form.anaAmac === g ? 'border-brand bg-vurgu' : 'border-line-strong hover:bg-surface-sunken'
              }`}
            >
              <span className="block text-13 font-bold text-ink">{GOAL_META[g].label}</span>
              <span className="mt-0.5 block text-12 text-ink-muted">{GOAL_META[g].promise}</span>
            </button>
          ))}
        </div>
      </Grup>

      <ListeAlani
        etiket="Ürün ve hizmet kategorileri"
        ipucu="Örn. Daire, Villa, Ofis"
        degerler={form.urunKategorileri}
        sinir={MARKA_SINIRLARI.kategori}
        kapali={kapali}
        degis={(v) => degis('urunKategorileri', v)}
      />

      <SayfaListesi
        sayfalar={form.sikSayfalar}
        kapali={kapali}
        degis={(v) => degis('sikSayfalar', v)}
      />

      <Alan etiket="Üslup" ipucu="Reklam metninin tonu. Örn. Güven veren, sade, kurumsal">
        {(id, aciklamaId) => (
          <Girdi
            id={id}
            aria-describedby={aciklamaId}
            value={form.uslup}
            onChange={(e) => degis('uslup', e.target.value)}
            maxLength={MARKA_SINIRLARI.uslup}
            disabled={kapali}
          />
        )}
      </Alan>

      <ListeAlani
        etiket="Öne çıkan vaatler"
        ipucu="Seni rakiplerinden ayıran, doğruluğu kanıtlanabilir cümleler. AI yalnızca bunlara dayanır."
        degerler={form.vaatler}
        sinir={MARKA_SINIRLARI.vaat}
        kapali={kapali}
        degis={(v) => degis('vaatler', v)}
      />

      <ListeAlani
        etiket="Metin şablonları"
        ipucu="Sık kullandığın cümleler. AdvCampaign’de tek tıkla metne eklenir. Örn. Hemen arayın, ücretsiz keşif."
        degerler={form.metinSablonlari}
        sinir={MARKA_SINIRLARI.sablon}
        kapali={kapali}
        degis={(v) => degis('metinSablonlari', v)}
      />

      <Alan
        etiket="Zorunlu yasal uyarı"
        ipucu="Doluysa her Meta reklamının ana metninin sonuna eklenir ve metinde yoksa reklam yayınlanmaz. Örn. sağlık, finans, konut sektörlerindeki zorunlu cümle."
      >
        {(id, aciklamaId) => (
          <MetinAlani
            id={id}
            aria-describedby={aciklamaId}
            value={form.yasalUyari}
            onChange={(e) => degis('yasalUyari', e.target.value)}
            rows={2}
            maxLength={MARKA_SINIRLARI.yasalUyari}
            disabled={kapali}
            className="min-h-0"
          />
        )}
      </Alan>

      <CalismaSaatleriAlani saatler={form.calismaSaatleri} kapali={kapali} degis={(v) => degis('calismaSaatleri', v)} />

      <Alan etiket="Ek notlar" ipucu="Kaçınılacak ifadeler, dikkat edilecek şeyler.">
        {(id, aciklamaId) => (
          <MetinAlani
            id={id}
            aria-describedby={aciklamaId}
            value={form.markaBilgileri}
            onChange={(e) => degis('markaBilgileri', e.target.value)}
            rows={3}
            maxLength={2000}
            disabled={kapali}
          />
        )}
      </Alan>

      {kayitHatasi && (
        <Serit ton="hata" baslik="Kaydedilemedi.">
          {kayitHatasi}
        </Serit>
      )}
    </div>
    </Kart>
  );
}

/**
 * BİRDEN ÇOK DENETİMLİ ALAN (seçim kartları, liste, gün satırları): ortak
 * `Alan` bir `<label for>` çiziyor ve tek bir girdiye bağlanıyor; burada
 * bağlanacak tek girdi yok. Aynı görünüş (13 kalın etiket, 12 gri ipucu)
 * `fieldset` + `legend` ile; ekran okuyucu grubun adını okuyor.
 * (Grup 3 sapması: ortak bileşende grup alanı yok.)
 */
function Grup({ etiket, ipucu, children }: { etiket: string; ipucu?: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 text-13 font-semibold text-ink">{etiket}</legend>
      {children}
      {ipucu && <small className="text-12 text-ink-muted">{ipucu}</small>}
    </fieldset>
  );
}

/**
 * Kısa metin listesi. Sayaç SINIRDAN türüyor, elle yazılmıyor.
 * Tekrar eden öğe eklenmiyor ve bunun sebebi yazıyor.
 */
function ListeAlani({
  etiket,
  ipucu,
  degerler,
  sinir,
  kapali,
  degis,
}: {
  etiket: string;
  ipucu: string;
  degerler: string[];
  sinir: { adet: number; uzunluk: number };
  kapali: boolean;
  degis: (v: string[]) => void;
}) {
  const [yeni, setYeni] = useState('');
  const [uyari, setUyari] = useState<string | null>(null);
  const dolu = degerler.length >= sinir.adet;

  function ekle(): void {
    const v = yeni.trim();
    if (!v) return;
    if (degerler.some((d) => d.toLocaleLowerCase('tr') === v.toLocaleLowerCase('tr'))) {
      setUyari(`"${v}" zaten listede.`);
      return;
    }
    degis([...degerler, v]);
    setYeni('');
    setUyari(null);
  }

  return (
    <Grup etiket={`${etiket} (${degerler.length}/${sinir.adet})`} ipucu={ipucu}>
      {degerler.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {degerler.map((d) => (
            <li
              key={d}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-surface-sunken px-3 text-[12.5px] font-semibold text-ink"
            >
              {d}
              {!kapali && (
                <button
                  type="button"
                  onClick={() => degis(degerler.filter((x) => x !== d))}
                  aria-label={`${d} kaldır`}
                  className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:bg-surface hover:text-ink"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!kapali && !dolu && (
        <div className="flex gap-2">
          <Girdi
            value={yeni}
            onChange={(e) => setYeni(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                ekle();
              }
            }}
            maxLength={sinir.uzunluk}
            placeholder="Yaz ve Enter’a bas"
            aria-label={`${etiket}: yeni öğe`}
          />
          <Dugme ton="ikincil" boyut="kucuk" onClick={ekle} disabled={!yeni.trim()}>
            Ekle
          </Dugme>
        </div>
      )}
      {dolu && !kapali && (
        <span className="block text-12 text-ink-muted">Sınıra ulaşıldı: en fazla {sinir.adet}.</span>
      )}
      {uyari && (
        <span role="alert" className="block text-12 text-danger-strong">
          {uyari}
        </span>
      )}
    </Grup>
  );
}

/**
 * Sık kullanılan sayfalar. Adres kutudan ÇIKINCA denetleniyor (giriş anında
 * doğrulama) ve hatalı satır eklenmiyor.
 */
function SayfaListesi({
  sayfalar,
  kapali,
  degis,
}: {
  sayfalar: SikSayfa[];
  kapali: boolean;
  degis: (v: SikSayfa[]) => void;
}) {
  const [ad, setAd] = useState('');
  const [url, setUrl] = useState('');
  const [hata, setHata] = useState<string | null>(null);
  const s = MARKA_SINIRLARI.sayfa;
  const dolu = sayfalar.length >= s.adet;

  function denetle(): SikSayfa | null {
    const r = sikSayfaSchema.safeParse({ ad, url });
    if (!r.success) {
      setHata(r.error.issues[0]?.message ?? 'Geçersiz sayfa.');
      return null;
    }
    if (sayfalar.some((p) => p.url.toLocaleLowerCase('tr') === r.data.url.toLocaleLowerCase('tr'))) {
      setHata('Bu adres zaten listede.');
      return null;
    }
    setHata(null);
    return r.data;
  }

  function ekle(): void {
    const yeni = denetle();
    if (!yeni) return;
    degis([...sayfalar, yeni]);
    setAd('');
    setUrl('');
  }

  return (
    <Grup
      etiket={`Sık kullanılan sayfalar (${sayfalar.length}/${s.adet})`}
      ipucu="Reklamın gideceği sayfalar. AdvCampaign hedef adresi bu listeden seçer."
    >
      {sayfalar.length > 0 && (
        <ul className="m-0 list-none divide-y divide-line rounded-alan border border-line p-0">
          {sayfalar.map((p) => (
            <li key={p.url} className="flex items-center gap-3 px-3 py-2 text-13">
              <span className="w-32 shrink-0 truncate font-semibold text-ink">{p.ad}</span>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-12 text-ink-muted hover:text-brand-strong hover:underline"
              >
                {p.url}
              </a>
              {!kapali && (
                <Dugme ton="hayalet" boyut="kucuk" onClick={() => degis(sayfalar.filter((x) => x.url !== p.url))}>
                  Kaldır
                </Dugme>
              )}
            </li>
          ))}
        </ul>
      )}
      {!kapali && !dolu && (
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
          <Girdi
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            maxLength={s.ad}
            placeholder="Ad (örn. Projeler)"
            aria-label="Sayfa adı"
          />
          <Girdi
            aria-label="Sayfa adresi"
            hatali={hata !== null}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => {
              if (url.trim()) denetle();
            }}
            maxLength={s.url}
            placeholder="https://…"
            inputMode="url"
          />
          <Dugme ton="ikincil" boyut="kucuk" onClick={ekle} disabled={!ad.trim() || !url.trim()}>
            Ekle
          </Dugme>
        </div>
      )}
      {hata && (
        <span role="alert" className="block text-12 text-danger-strong">
          {hata}
        </span>
      )}
    </Grup>
  );
}

/**
 * ÇALIŞMA SAATLERİ. Gün başına tek aralık; işaretsiz gün KAPALI. Hiç gün
 * işaretlenmezse kayıt "bilinmiyor" ve Google arama düğmesi her saatte
 * görünür (bu ipucunda yazılı). Hata SATIRIN ALTINDA ve yazarken: dakika
 * 15'in katı değilse kullanıcı bunu kaydederken değil girerken öğrenir.
 * Bir güne iki aralık API'den gelmişse (ekran tek aralık yazıyor) o gün
 * ilk aralıkla gösterilir ve değiştirilirse tek aralığa iner.
 */
function CalismaSaatleriAlani({
  saatler,
  kapali,
  degis,
}: {
  saatler: CalismaSaatleri;
  kapali: boolean;
  degis: (v: CalismaSaatleri) => void;
}) {
  const gunun = (g: HaftaGunu): CalismaAraligi | undefined => saatler.find((x) => x.gun === g);
  const yaz = (g: HaftaGunu, a: CalismaAraligi | null): void => {
    const digerleri = saatler.filter((x) => x.gun !== g);
    const yeni = a ? [...digerleri, a] : digerleri;
    degis(CALISMA_GUNLERI.flatMap((gg) => yeni.filter((x) => x.gun === gg)));
  };
  return (
    <Grup
      etiket="Çalışma saatleri"
      ipucu="Telefonla aranmak istediğin saatler. Google arama düğmesini yalnız bu saatlerde gösterir; boş bırakırsan her saatte gösterir. Meta'da saat sınırı uygulanamıyor."
    >
      <ul className="m-0 list-none divide-y divide-line rounded-alan border border-line p-0">
        {CALISMA_GUNLERI.map((g) => {
          const a = gunun(g);
          const hata = a ? calismaAraligiSchema.safeParse(a) : null;
          return (
            <li key={g} className="flex flex-wrap items-center gap-3 px-3 py-2 text-13">
              <label className="flex w-32 shrink-0 items-center gap-2 text-ink">
                <input
                  type="checkbox"
                  checked={!!a}
                  disabled={kapali}
                  onChange={(e) => yaz(g, e.target.checked ? { gun: g, acilis: '09:00', kapanis: '18:00' } : null)}
                />
                {GUN_ADI[g]}
              </label>
              {a ? (
                <span className="flex items-center gap-2">
                  <Girdi
                    type="time"
                    step={900}
                    value={a.acilis}
                    disabled={kapali}
                    onChange={(e) => yaz(g, { ...a, acilis: e.target.value })}
                    aria-label={`${GUN_ADI[g]} açılış`}
                    className="w-28"
                  />
                  <span className="text-ink-muted">-</span>
                  <Girdi
                    type="time"
                    step={900}
                    value={a.kapanis === '24:00' ? '23:59' : a.kapanis}
                    disabled={kapali}
                    onChange={(e) => yaz(g, { ...a, kapanis: e.target.value === '23:59' ? '24:00' : e.target.value })}
                    aria-label={`${GUN_ADI[g]} kapanış`}
                    className="w-28"
                  />
                </span>
              ) : (
                <span className="text-12 text-ink-muted">Kapalı</span>
              )}
              {hata && !hata.success && (
                <span role="alert" className="basis-full text-12 text-danger-strong">
                  {hata.error.issues[0]?.message}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Grup>
  );
}
