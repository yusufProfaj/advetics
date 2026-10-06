'use client';

import { useEffect, useState } from 'react';
import {
  CAMPAIGN_GOALS,
  GOAL_META,
  MARKA_SINIRLARI,
  sikSayfaSchema,
  upsertClientProfileSchema,
  type CampaignGoal,
  type ClientProfileRecord,
  type SikSayfa,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Halka } from '@/components/yukleniyor';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';

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
};

const girdi =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand disabled:bg-surface-sunken';

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
      <div className="flex items-center gap-2 p-4 text-sm text-ink-muted">
        <Halka className="h-4 w-4" /> Marka bilgileri yükleniyor…
      </div>
    );
  }
  if (durum.tur === 'hata') {
    return <Uyari ton="tehlike" baslik="Marka bilgileri yüklenemedi">{durum.mesaj}</Uyari>;
  }

  const kapali = !canWrite || busy;

  return (
    /*
      ÇERÇEVESİZ: Marka Merkezi bu bileşeni zaten bir kartın (`Kart`) içine
      koyuyor ve kendi çerçevesi kart içinde kart üretiyordu. Açıklama
      cümlesi de bölüm başlığında yazılı; burada ikinci kez yazıyordu.
    */
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-ink">Marka bilgileri</h2>
        <p className="mt-0.5 text-xs text-ink-muted">Marka adı, amaç, üslup ve öne çıkan vaatler.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Alan etiket="Marka adı" ipucu="Boşsa workspace adı kullanılır.">
          <input
            value={form.markaAdi}
            onChange={(e) => degis('markaAdi', e.target.value)}
            maxLength={MARKA_SINIRLARI.markaAdi}
            disabled={kapali}
            className={girdi}
          />
        </Alan>
        <Alan etiket="Sektör" ipucu="Örn. Konut inşaatı, Diş kliniği">
          <input
            value={form.sektor}
            onChange={(e) => degis('sektor', e.target.value)}
            maxLength={MARKA_SINIRLARI.sektor}
            disabled={kapali}
            className={girdi}
          />
        </Alan>
      </div>

      <Alan etiket="Ana amaç" ipucu="Reklam Oluştur bu amaçla açılır; istersen orada değiştirirsin.">
        <div className="grid gap-2 sm:grid-cols-3">
          {CAMPAIGN_GOALS.map((g) => (
            <button
              key={g}
              type="button"
              disabled={kapali}
              aria-pressed={form.anaAmac === g}
              onClick={() => degis('anaAmac', form.anaAmac === g ? null : g)}
              className={`rounded-lg border p-2.5 text-left transition disabled:cursor-not-allowed ${
                form.anaAmac === g ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-sunken'
              }`}
            >
              <span className="block text-sm font-semibold text-ink">{GOAL_META[g].label}</span>
              <span className="mt-0.5 block text-xs text-ink-muted">{GOAL_META[g].promise}</span>
            </button>
          ))}
        </div>
      </Alan>

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
        <input
          value={form.uslup}
          onChange={(e) => degis('uslup', e.target.value)}
          maxLength={MARKA_SINIRLARI.uslup}
          disabled={kapali}
          className={girdi}
        />
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
        ipucu="Sık kullandığın cümleler. Reklam Oluştur’da tek tıkla metne eklenir. Örn. Hemen arayın, ücretsiz keşif."
        degerler={form.metinSablonlari}
        sinir={MARKA_SINIRLARI.sablon}
        kapali={kapali}
        degis={(v) => degis('metinSablonlari', v)}
      />

      <Alan
        etiket="Zorunlu yasal uyarı"
        ipucu="Doluysa her Meta reklamının ana metninin sonuna eklenir ve metinde yoksa reklam yayınlanmaz. Örn. sağlık, finans, konut sektörlerindeki zorunlu cümle."
      >
        <textarea
          value={form.yasalUyari}
          onChange={(e) => degis('yasalUyari', e.target.value)}
          rows={2}
          maxLength={MARKA_SINIRLARI.yasalUyari}
          disabled={kapali}
          className={girdi}
        />
      </Alan>

      <Alan etiket="Ek notlar" ipucu="Kaçınılacak ifadeler, dikkat edilecek şeyler.">
        <textarea
          value={form.markaBilgileri}
          onChange={(e) => degis('markaBilgileri', e.target.value)}
          rows={3}
          maxLength={2000}
          disabled={kapali}
          className={girdi}
        />
      </Alan>

      {kayitHatasi && <Uyari ton="tehlike">{kayitHatasi}</Uyari>}

      {canWrite ? (
        <div className="flex items-center gap-3">
          <Dugme onClick={() => void kaydet()} bekliyor={busy}>
            Kaydet
          </Dugme>
          {kaydedildi && (
            <span role="status" className="text-xs text-ok-strong">
              Kaydedildi.
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">Bu bilgileri düzenleme yetkin yok.</p>
      )}
    </div>
  );
}

function Alan({
  etiket,
  ipucu,
  children,
}: {
  etiket: string;
  ipucu?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block space-y-1">
      <span className="block text-xs font-medium text-ink">{etiket}</span>
      {children}
      {ipucu && <span className="block text-[11px] text-ink-muted">{ipucu}</span>}
    </div>
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
    <Alan etiket={`${etiket} (${degerler.length}/${sinir.adet})`} ipucu={ipucu}>
      {degerler.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {degerler.map((d) => (
            <li
              key={d}
              className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-1 text-xs text-ink"
            >
              {d}
              {!kapali && (
                <button
                  type="button"
                  onClick={() => degis(degerler.filter((x) => x !== d))}
                  aria-label={`${d} kaldır`}
                  className="text-ink-muted hover:text-danger"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!kapali && !dolu && (
        <div className="flex gap-2">
          <input
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
            className={girdi}
          />
          <Dugme ton="ikincil" boyut="kucuk" onClick={ekle} disabled={!yeni.trim()}>
            Ekle
          </Dugme>
        </div>
      )}
      {dolu && !kapali && (
        <span className="block text-[11px] text-ink-muted">Sınıra ulaşıldı: en fazla {sinir.adet}.</span>
      )}
      {uyari && <span className="block text-[11px] text-warn-strong">{uyari}</span>}
    </Alan>
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
    <Alan
      etiket={`Sık kullanılan sayfalar (${sayfalar.length}/${s.adet})`}
      ipucu="Reklamın gideceği sayfalar. Reklam Oluştur hedef adresi bu listeden seçer."
    >
      {sayfalar.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {sayfalar.map((p) => (
            <li key={p.url} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-32 shrink-0 truncate font-medium text-ink">{p.ad}</span>
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-xs text-brand-strong hover:underline"
              >
                {p.url}
              </a>
              {!kapali && (
                <button
                  type="button"
                  onClick={() => degis(sayfalar.filter((x) => x.url !== p.url))}
                  className="text-xs text-ink-muted hover:text-danger"
                >
                  Kaldır
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!kapali && !dolu && (
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
          <input
            value={ad}
            onChange={(e) => setAd(e.target.value)}
            maxLength={s.ad}
            placeholder="Ad (örn. Projeler)"
            className={girdi}
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={() => {
              if (url.trim()) denetle();
            }}
            maxLength={s.url}
            placeholder="https://…"
            inputMode="url"
            className={girdi}
          />
          <Dugme ton="ikincil" boyut="kucuk" onClick={ekle} disabled={!ad.trim() || !url.trim()}>
            Ekle
          </Dugme>
        </div>
      )}
      {hata && <span className="block text-[11px] text-danger-strong">{hata}</span>}
    </Alan>
  );
}
