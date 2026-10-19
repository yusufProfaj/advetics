'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ALICI_UST_SINIRI,
  BILDIRIM_OLAYLARI,
  BILDIRIM_OLAYI_ADI,
  KANAL_DISARIDA,
  KANAL_DURUM_ADI,
  KANAL_TURLERI,
  KANAL_TURU_ADI,
  aliciAyristir,
  sec,
  type Dil,
  type BildirimGonderimleriYaniti,
  type BildirimKanali,
  type BildirimKanallariYaniti,
  type BildirimOlayi,
  type KanalTuru,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import {
  KANAL_DURUM_NOKTASI,
  adresAlaniHatasi,
  ajansDisiAlicilar,
  denemeSonucuCoz,
  gonderimDurumu,
  gonderimIcerigi,
  kanalAltMetni,
  kanalFormuDenetle,
  type Nokta,
} from '@/lib/sinyal';
import { Dugme } from '@/components/ui/dugme';
import { Uyari } from '@/components/ui/uyari';
import { DurumNoktasi, type DurumHali } from '@/components/ui/rozet';
import { Alan, Girdi, MetinAlani } from '@/components/ui/alan';
import { BosDurum } from '@/components/ui/hal';
import { useDil } from '@/dil/saglayici';
import { markaMerkeziBildirimSozlugu } from '@/dil/sozlukler/marka-merkezi-bildirim';

/**
 * ═══ MARKA MERKEZİ › BİLDİRİMLER (Paket A, taslak ekran 3) ═══
 *
 * Workspace'in bildirim kanalları, kanal ekleme ve son gönderimler.
 * Sözleşme `packages/shared/src/sinyal/bildirim.ts`; kararlar
 * `lib/sinyal.ts` (çalıştırılarak sınanıyor).
 *
 * "200 DÖNDÜ" DOĞRULAMA DEĞİL: kanal "Evet, geldi" denene kadar
 * "Doğrulanmadı". Kaydet ve deneme İKİ AYRI çağrı (MIMARI § 3): "kanal
 * kaydedildi ama deneme düştü" hâli ayrı yazılsın, kayıt başarısız
 * sanılıp ikinci kez eklenmesin.
 *
 * ADRES ALANI BIRAKILINCA doğrulanıyor, sunucuyla AYNI fonksiyonla
 * (`webhookDenetle`): kullanıcı yanlış adresi "Kaydet"e bastığında değil
 * yapıştırıp çıktığında öğreniyor.
 *
 * DÖRT HÂL AYRI (okunuyor / hata / boş + neden / dolu); kanal listesi ve
 * gönderim geçmişi ayrı çağrı ve biri düşerse diğeri yine çiziliyor.
 */
type Hal<T> = { tur: 'okunuyor' } | { tur: 'hata'; mesaj: string } | { tur: 'geldi'; veri: T };

const hataMetni = (e: unknown, dil: Dil) => (e instanceof ApiRequestError ? e.message : sec(markaMerkeziBildirimSozlugu, dil).sunucuUlasilamadi);

/** Gönderim ve teslim zamanı: dilin kendi yerel biçimi. */
const zamanYaz = (iso: string, dil: Dil) =>
  new Date(iso).toLocaleString(dil === 'en' ? 'en-US' : 'tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Kanal durumu ortak durum noktasıyla: yeşil yalnız doğrulanmış kanalda.
const NOKTA_HALI: Record<Nokta, DurumHali> = {
  yesil: 'ok',
  gri: 'taslak',
  kirmizi: 'hata',
};

function NoktaIsareti({ nokta }: { nokta: Nokta }) {
  return <DurumNoktasi hal={NOKTA_HALI[nokta]} />;
}

/** Deneme mesajı sonrası soru: hangi kanal için ve cevap verildiyse ne dendi. */
type Soru = { kanal: BildirimKanali; hal: 'soruluyor' | 'evet' | 'hayir' | 'gonderiliyor' } | null;

export function BildirimlerBolumu({
  clientId,
  yazabilir,
  ajansAdresi,
}: {
  clientId: string;
  /** `client.write`: kanal ekle, sil, aç/kapat, deneme. */
  yazabilir: boolean;
  /** Oturumdaki kullanıcının adresi; gönderen kimliği yoksa ajans alan adı buradan. */
  ajansAdresi: string;
}) {
  const { dil } = useDil();
  const m = sec(markaMerkeziBildirimSozlugu, dil);
  const d = m.bildirim;
  const [kanallar, setKanallar] = useState<Hal<BildirimKanallariYaniti>>({ tur: 'okunuyor' });
  const [gonderimler, setGonderimler] = useState<Hal<BildirimGonderimleriYaniti>>({ tur: 'okunuyor' });
  const [formAcik, setFormAcik] = useState(false);
  const [soru, setSoru] = useState<Soru>(null);
  const [satirHatasi, setSatirHatasi] = useState<{ id: string; mesaj: string } | null>(null);
  const [mesgul, setMesgul] = useState<string | null>(null);
  const [silinecek, setSilinecek] = useState<string | null>(null);

  const kanallariOku = useCallback(async () => {
    try {
      setKanallar({ tur: 'geldi', veri: await apiFetch<BildirimKanallariYaniti>(baglanti('/bildirim/kanallar', { clientId })) });
    } catch (e) {
      setKanallar({ tur: 'hata', mesaj: hataMetni(e, dil) });
    }
  }, [clientId, dil]);

  const gonderimleriOku = useCallback(async () => {
    try {
      setGonderimler({ tur: 'geldi', veri: await apiFetch<BildirimGonderimleriYaniti>(baglanti('/bildirim/gonderimler', { clientId })) });
    } catch (e) {
      setGonderimler({ tur: 'hata', mesaj: hataMetni(e, dil) });
    }
  }, [clientId, dil]);

  useEffect(() => {
    void kanallariOku();
    void gonderimleriOku();
  }, [kanallariOku, gonderimleriOku]);

  /** Deneme mesajı: teslim sonucu ekranda; gittiyse "geldi mi" sorusu. */
  async function dene(k: BildirimKanali): Promise<string | null> {
    setMesgul(k.id);
    setSatirHatasi(null);
    try {
      const r = denemeSonucuCoz(await apiFetch<unknown>(`/bildirim/kanallar/${encodeURIComponent(k.id)}/dene`, { method: 'POST', body: '{}' }), dil);
      if (r.tur === 'gonderildi') {
        setSoru({ kanal: k, hal: 'soruluyor' });
        return null;
      }
      const mesaj = r.tur === 'dustu' ? d.denemeGonderilemedi(r.mesaj) : d.denemeOkunamadi;
      setSatirHatasi({ id: k.id, mesaj });
      return mesaj;
    } catch (e) {
      const mesaj = d.denemeGonderilemedi(hataMetni(e, dil));
      setSatirHatasi({ id: k.id, mesaj });
      return mesaj;
    } finally {
      setMesgul(null);
      void gonderimleriOku();
      void kanallariOku();
    }
  }

  async function dogrula(geldi: boolean) {
    if (!soru) return;
    const k = soru.kanal;
    setSoru({ kanal: k, hal: 'gonderiliyor' });
    try {
      await apiFetch(`/bildirim/kanallar/${encodeURIComponent(k.id)}/dogrula`, { method: 'POST', body: JSON.stringify({ geldi }) });
      setSoru({ kanal: k, hal: geldi ? 'evet' : 'hayir' });
      void kanallariOku();
    } catch (e) {
      setSoru({ kanal: k, hal: 'soruluyor' });
      setSatirHatasi({ id: k.id, mesaj: d.cevapKaydedilemedi(hataMetni(e, dil)) });
    }
  }

  async function guncelle(k: BildirimKanali, govde: { etkin?: boolean; olaylar?: BildirimOlayi[] }) {
    setMesgul(k.id);
    setSatirHatasi(null);
    try {
      await apiFetch(`/bildirim/kanallar/${encodeURIComponent(k.id)}`, { method: 'PATCH', body: JSON.stringify(govde) });
      await kanallariOku();
    } catch (e) {
      setSatirHatasi({ id: k.id, mesaj: d.degistirilemedi(hataMetni(e, dil)) });
    } finally {
      setMesgul(null);
    }
  }

  async function sil(k: BildirimKanali) {
    setMesgul(k.id);
    setSatirHatasi(null);
    try {
      await apiFetch(`/bildirim/kanallar/${encodeURIComponent(k.id)}`, { method: 'DELETE' });
      setSilinecek(null);
      if (soru?.kanal.id === k.id) setSoru(null);
      await kanallariOku();
    } catch (e) {
      setSatirHatasi({ id: k.id, mesaj: d.silinemedi(hataMetni(e, dil)) });
    } finally {
      setMesgul(null);
    }
  }

  const veri = kanallar.tur === 'geldi' ? kanallar.veri : null;

  return (
    <div className="space-y-4">
      <section className="rounded-kart border border-line bg-surface" aria-labelledby="kanallar-baslik">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h3 id="kanallar-baslik" className="text-sm font-semibold text-ink">
            {d.baslik}
          </h3>
          {veri && <span className="text-xs text-ink-muted">{d.kanalSayisi(veri.toplam)}</span>}
          {yazabilir && (
            <Dugme className="ml-auto" ton="ikincil" boyut="kucuk" onClick={() => setFormAcik(true)} disabled={formAcik}>
              {d.kanalEkle}
            </Dugme>
          )}
        </div>

        {kanallar.tur === 'okunuyor' && <p className="px-4 py-5 text-sm text-ink-muted">{d.okunuyor}</p>}
        {kanallar.tur === 'hata' && (
          <div className="p-4">
            <Uyari
              ton="tehlike"
              baslik={d.alinamadi}
              eylem={
                <Dugme ton="ikincil" boyut="kucuk" onClick={() => void kanallariOku()}>
                  {m.yenidenDene}
                </Dugme>
              }
            >
              {kanallar.mesaj}
            </Uyari>
          </div>
        )}
        {veri && veri.kanallar.length === 0 && (
          <div className="p-4">
            <BosDurum
              baslik={d.bosBaslik}
              neden={
                <>
                  {d.bosNeden}
                  {!yazabilir && d.bosYetki}
                </>
              }
            />
          </div>
        )}
        {veri && veri.kanallar.length > 0 && (
          <ul>
            {veri.kanallar.map((k) => (
              <li key={k.id} className="border-t border-line first:border-t-0">
                <div className="grid grid-cols-1 items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
                  <span className="text-xs font-semibold text-ink-muted">{KANAL_TURU_ADI[k.tur]}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{k.ad}</p>
                    <p className="text-xs text-ink-muted [overflow-wrap:anywhere]">{kanalAltMetni(k)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${k.durum === 'hata' ? 'text-brand-strong' : 'text-ink'}`}>
                      <NoktaIsareti nokta={KANAL_DURUM_NOKTASI[k.durum]} />
                      {KANAL_DURUM_ADI[k.durum]}
                    </span>
                    {yazabilir && (k.durum === 'dogrulanmadi' || k.durum === 'hata') && (
                      <Dugme ton="ikincil" boyut="kucuk" bekliyor={mesgul === k.id} onClick={() => void dene(k)}>
                        {d.denemeGonder}
                      </Dugme>
                    )}
                    {yazabilir && (
                      <Dugme ton="sade" boyut="kucuk" disabled={mesgul === k.id} onClick={() => void guncelle(k, { etkin: !k.etkin })}>
                        {k.etkin ? d.kapat : d.ac}
                      </Dugme>
                    )}
                    {yazabilir &&
                      (silinecek === k.id ? (
                        <>
                          <Dugme ton="tehlike" boyut="kucuk" bekliyor={mesgul === k.id} onClick={() => void sil(k)}>
                            {m.sil}
                          </Dugme>
                          <Dugme ton="sade" boyut="kucuk" onClick={() => setSilinecek(null)}>
                            {m.vazgec}
                          </Dugme>
                        </>
                      ) : (
                        <Dugme ton="sade" boyut="kucuk" onClick={() => setSilinecek(k.id)}>
                          {m.sil}
                        </Dugme>
                      ))}
                  </div>
                </div>
                {silinecek === k.id && (
                  <p className="px-4 pb-3 text-xs text-ink-muted">{d.silNotu}</p>
                )}
                {k.durum === 'hata' && k.sonTeslim && (
                  <div className="mx-4 mb-3 border-l-[3px] border-brand pl-3 text-sm">
                    <b className="text-ink">{d.sonGonderimDustu(zamanYaz(k.sonTeslim.zaman, dil))}</b>{' '}
                    {k.sonTeslim.hata ? `"${k.sonTeslim.hata}"` : d.nedenYok}{' '}
                    {k.tur === 'teams' ? d.teamsIpucu : k.tur === 'slack' ? d.slackIpucu : d.epostaIpucu}
                  </div>
                )}
                {satirHatasi?.id === k.id && (
                  <p role="alert" className="mx-4 mb-3 text-sm text-danger-strong">
                    {satirHatasi.mesaj}
                  </p>
                )}
                {soru?.kanal.id === k.id && <DenemeSorusu soru={soru} onCevap={(g) => void dogrula(g)} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      {yazabilir && (
        <KanalEkleFormu
          acik={formAcik}
          clientId={clientId}
          ajansAdresi={ajansAdresi}
          gonderen={veri?.epostaGonderen ?? null}
          onVazgec={() => setFormAcik(false)}
          onKaydedildi={async (k) => {
            setFormAcik(false);
            await kanallariOku();
            return dene(k);
          }}
        />
      )}

      <SonGonderimler hal={gonderimler} onYenile={() => void gonderimleriOku()} />
    </div>
  );
}

function DenemeSorusu({ soru, onCevap }: { soru: NonNullable<Soru>; onCevap: (geldi: boolean) => void }) {
  const { dil } = useDil();
  const d = sec(markaMerkeziBildirimSozlugu, dil).bildirim;
  const k = soru.kanal;
  if (soru.hal === 'evet') {
    return (
      <p role="status" className="mx-4 mb-3 flex items-center gap-2 rounded-alan border border-line px-3 py-2 text-sm">
        <NoktaIsareti nokta="yesil" />
        <b className="text-ink">{d.dogrulandi}</b>
        <span className="text-ink-muted">{k.olaylar.includes('sinyal')
            ? d.sinyalGelecek
            : k.olaylar.includes('kural')
              ? d.kuralGelecek
              : d.haftalikGelecek}</span>
      </p>
    );
  }
  if (soru.hal === 'hayir') {
    return (
      <p role="status" className="mx-4 mb-3 rounded-alan border border-line px-3 py-2 text-sm text-ink">
        <b>{d.hayirOnce}</b> {d.hayirSonra}{' '}
        {k.tur === 'eposta' ? d.hayirEposta : d.hayirWebhook}
      </p>
    );
  }
  return (
    <div role="status" className="mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-alan border border-ink px-3 py-2.5 text-sm">
      <span>
        <b className="text-ink">{d.denemeGitti(KANAL_TURU_ADI[k.tur])}</b> {k.ad} {k.tur === 'eposta' ? d.ulastiEposta : d.gorunduMu}
      </span>
      <span className="ml-auto flex gap-2">
        <Dugme ton="koyu" boyut="kucuk" bekliyor={soru.hal === 'gonderiliyor'} onClick={() => onCevap(true)}>
          {d.evetGeldi}
        </Dugme>
        <Dugme ton="ikincil" boyut="kucuk" disabled={soru.hal === 'gonderiliyor'} onClick={() => onCevap(false)}>
          {d.hayir}
        </Dugme>
      </span>
    </div>
  );
}

// Adres örneği iki dilde aynı; ipucu cümlesi sözlükte (`slackAdresIpucu`, `teamsAdresIpucu`).
const ADRES_ORNEGI: Record<'slack' | 'teams', string> = {
  slack: 'https://hooks.slack.com/services/…',
  teams: 'https://…logic.azure.com/workflows/…',
};

/**
 * Kanal ekleme. AÇILIP KAPANIRKEN DOM'DAN ÇIKMIYOR (tasarım kuralı):
 * yükseklik ve görünürlük geçişle değişiyor, hareket azaltma tercihinde
 * geçiş kapalı. Kapalıyken `inert`: klavye görünmeyen alanlara girmesin.
 */
function KanalEkleFormu({
  acik,
  clientId,
  ajansAdresi,
  gonderen,
  onVazgec,
  onKaydedildi,
}: {
  acik: boolean;
  clientId: string;
  ajansAdresi: string;
  gonderen: BildirimKanallariYaniti['epostaGonderen'] | null;
  onVazgec: () => void;
  onKaydedildi: (k: BildirimKanali) => Promise<string | null>;
}) {
  const { dil } = useDil();
  const d = sec(markaMerkeziBildirimSozlugu, dil).bildirim;
  const [tur, setTur] = useState<KanalTuru>('slack');
  const [ad, setAd] = useState('');
  const [adres, setAdres] = useState('');
  const [adresHatasi, setAdresHatasi] = useState<string | null>(null);
  const [alicilar, setAlicilar] = useState('');
  const [aliciUyarisi, setAliciUyarisi] = useState<{ gecersiz: string[]; disarida: string[] }>({ gecersiz: [], disarida: [] });
  // YENİ KANALDA haftalık özet de İŞARETLİ (Paket B Ç-B2): ajansın kendi
  // kanalı, pazartesi sabahı tek mesaj; isteyen işareti kaldırır.
  const [olaylar, setOlaylar] = useState<BildirimOlayi[]>(['sinyal', 'haftalik_ozet']);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const denetim = kanalFormuDenetle({ tur, clientId, ad, adres, alicilarHam: alicilar, olaylar }, dil);

  function turSec(t: KanalTuru) {
    setTur(t);
    setAdresHatasi(null);
    setHata(null);
  }

  function alicilariDenetle() {
    const a = aliciAyristir(alicilar);
    setAliciUyarisi({
      gecersiz: a.gecersiz,
      disarida: ajansDisiAlicilar(a.adresler, gonderen?.tanimli ? gonderen.adres : ajansAdresi),
    });
  }

  async function kaydet() {
    if (!denetim.gecerli) {
      setHata(denetim.neden);
      return;
    }
    setKaydediliyor(true);
    setHata(null);
    let kanal: BildirimKanali;
    try {
      kanal = await apiFetch<BildirimKanali>('/bildirim/kanallar', { method: 'POST', body: JSON.stringify(denetim.girdi) });
    } catch (e) {
      setHata(d.kanalKaydedilemedi(hataMetni(e, dil)));
      setKaydediliyor(false);
      return;
    }
    // KAYIT TAMAM; deneme ayrı. Deneme düşerse kanal listede satırının
    // altında nedeniyle görünüyor, form temizleniyor (ikinci kez eklenmesin).
    setAd('');
    setAdres('');
    setAlicilar('');
    setAliciUyarisi({ gecersiz: [], disarida: [] });
    setOlaylar(['sinyal']);
    setKaydediliyor(false);
    await onKaydedildi(kanal);
  }

  const adresIpucu = tur === 'eposta' ? null : { yer: ADRES_ORNEGI[tur], ipucu: tur === 'slack' ? d.slackAdresIpucu : d.teamsAdresIpucu };

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none ${
        acik ? 'grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0'
      }`}
      aria-hidden={!acik}
      inert={!acik}
    >
      <div className="overflow-hidden">
        <section className="rounded-kart border border-line bg-surface" aria-labelledby="kanal-ekle-baslik">
          <div className="border-b border-line px-4 py-3">
            <h3 id="kanal-ekle-baslik" className="text-sm font-semibold text-ink">
              {d.kanalEkleBaslik}
            </h3>
          </div>
          <div role="group" aria-label={d.kanalTuru} className="grid gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {KANAL_TURLERI.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tur === t}
                onClick={() => turSec(t)}
                className={`flex flex-col gap-1 rounded-alan border p-3 text-left transition-colors ${
                  tur === t ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-ink-muted'
                }`}
              >
                <b className="text-sm text-ink">{KANAL_TURU_ADI[t]}</b>
                <small className="text-xs text-ink-muted">{t === 'eposta' ? d.turAltEposta : d.turAltMesaj}</small>
              </button>
            ))}
            {KANAL_DISARIDA.map((disari) => (
              <button
                key={disari.kod}
                type="button"
                disabled
                title={d.ilkSurumdeYok}
                className="flex cursor-not-allowed flex-col gap-1 rounded-alan border border-line p-3 text-left opacity-50"
              >
                <b className="text-sm text-ink">{disari.ad}</b>
                <small className="text-xs text-ink-muted">{disari.neden}</small>
              </button>
            ))}
          </div>

          <div className="space-y-3 px-4 pb-4">
            <Alan etiket={d.kanalAdi}>
              {(id) => (
                <Girdi
                  id={id}
                  type="text"
                  value={ad}
                  maxLength={80}
                  onChange={(e) => setAd(e.target.value)}
                  placeholder={tur === 'eposta' ? d.kanalAdiEposta : d.kanalAdiSlack}
                />
              )}
            </Alan>

            {adresIpucu && tur !== 'eposta' && (
              /* Hata ipucunun YERİNİ alıyor ve alan kırmızı kenarlı (`Alan`); hata
                 `role="alert"` ile duyuruluyor, eskiden olduğu gibi. */
              <Alan etiket={d.webhookAdresi} ipucu={adresIpucu.ipucu} hata={adresHatasi}>
                {(id, aciklamaId, hatali) => (
                  <Girdi
                    id={id}
                    aria-describedby={aciklamaId}
                    hatali={hatali}
                    type="url"
                    value={adres}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={adresIpucu.yer}
                    onChange={(e) => {
                      setAdres(e.target.value);
                      // Hata gösteriliyorken düzelince hemen kalksın; yazarken YENİ hata gösterilmez.
                      if (adresHatasi && adresAlaniHatasi(tur, e.target.value) === null) setAdresHatasi(null);
                    }}
                    onBlur={() => setAdresHatasi(adresAlaniHatasi(tur, adres))}
                  />
                )}
              </Alan>
            )}

            {tur === 'eposta' && (
              <div className="space-y-2">
                {gonderen && !gonderen.tanimli && (
                  <Uyari ton="uyari" baslik={d.epostaGonderemez}>
                    {gonderen.neden}
                  </Uyari>
                )}
                <Alan
                  etiket={d.alicilar}
                  ipucu={d.aliciIpucu(ALICI_UST_SINIRI, gonderen?.tanimli ? gonderen.adres : '')}
                >
                  {(id, aciklamaId) => (
                    <MetinAlani
                      id={id}
                      aria-describedby={aciklamaId}
                      rows={2}
                      value={alicilar}
                      onChange={(e) => setAlicilar(e.target.value)}
                      onBlur={alicilariDenetle}
                      placeholder={d.aliciYerTutucu}
                    />
                  )}
                </Alan>
                {aliciUyarisi.gecersiz.length > 0 && (
                  <p role="alert" className="text-xs font-semibold text-brand-strong">
                    {d.gecersizAdres(aliciUyarisi.gecersiz.join(', '))}
                  </p>
                )}
                {aliciUyarisi.disarida.length > 0 && (
                  <Uyari ton="uyari" baslik={d.ajansDisiBaslik}>
                    {d.ajansDisiMetin(aliciUyarisi.disarida.join(', '))}
                  </Uyari>
                )}
              </div>
            )}

            <fieldset>
              <legend className="mb-1 text-xs font-semibold text-ink">{d.neler}</legend>
              {BILDIRIM_OLAYLARI.map((o) => (
                <label key={o} className="my-1.5 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={olaylar.includes(o)}
                    onChange={(e) => setOlaylar((x) => (e.target.checked ? [...x, o] : x.filter((y) => y !== o)))}
                  />
                  <span>
                    <b className="font-semibold text-ink">{BILDIRIM_OLAYI_ADI[o]}</b>
                    <small className="block text-xs text-ink-muted">
                      {o === 'sinyal' ? d.sinyalAlt : d.kuralAlt}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>

            {hata && (
              <p role="alert" className="text-sm text-danger-strong">
                {hata}
              </p>
            )}

            {/*
              TELEFONDA ALT ALTA VE SARILAN: "Kaydet ve deneme mesajı gönder"
              261 piksel ve `Dugme` tek satır (`whitespace-nowrap`); 375
              piksellik ekranda iç içe iki kartın içinde 259 piksel kalıyor ve
              düğme kartın dışına taşıyordu. Dar ekranda tam genişlik ve gerekirse
              iki satır; geniş ekranda referanstaki hap düğme.
            */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <Dugme ton="ikincil" onClick={onVazgec} disabled={kaydediliyor}>
                {sec(markaMerkeziBildirimSozlugu, dil).vazgec}
              </Dugme>
              <Dugme
                className="max-sm:!h-auto max-sm:min-h-10 max-sm:!whitespace-normal max-sm:py-2.5 max-sm:text-center max-sm:leading-snug"
                onClick={() => void kaydet()}
                bekliyor={kaydediliyor}
                disabled={!denetim.gecerli || adresHatasi !== null}
              >
                {d.kaydetVeDene}
              </Dugme>
            </div>
            {!denetim.gecerli && (ad.trim() !== '' || adres.trim() !== '' || alicilar.trim() !== '') && (
              <p className="text-right text-xs text-ink-muted">{denetim.neden}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SonGonderimler({ hal, onYenile }: { hal: Hal<BildirimGonderimleriYaniti>; onYenile: () => void }) {
  const { dil } = useDil();
  const m = sec(markaMerkeziBildirimSozlugu, dil);
  const d = m.bildirim;
  return (
    <section className="rounded-kart border border-line bg-surface" aria-labelledby="gonderimler-baslik">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h3 id="gonderimler-baslik" className="text-sm font-semibold text-ink">
          {d.sonGonderimler}
        </h3>
        {hal.tur === 'geldi' && (
          <span className="ml-auto text-xs text-ink-muted">
            {d.gosterilen(hal.veri.gonderimler.length, hal.veri.toplam)}
          </span>
        )}
      </div>
      {hal.tur === 'okunuyor' && <p className="px-4 py-5 text-sm text-ink-muted">{d.gonderimlerOkunuyor}</p>}
      {hal.tur === 'hata' && (
        <div className="p-4">
          <Uyari
            ton="tehlike"
            baslik={d.gonderimlerAlinamadi}
            eylem={
              <Dugme ton="ikincil" boyut="kucuk" onClick={onYenile}>
                {m.yenidenDene}
              </Dugme>
            }
          >
            {hal.mesaj}
          </Uyari>
        </div>
      )}
      {hal.tur === 'geldi' && hal.veri.gonderimler.length === 0 && (
        <p className="px-4 py-5 text-sm text-ink-muted">{d.gonderimYok}</p>
      )}
      {hal.tur === 'geldi' && hal.veri.gonderimler.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="px-4 py-2 font-semibold">{d.kolonZaman}</th>
                <th className="px-4 py-2 font-semibold">{d.kolonKanal}</th>
                <th className="px-4 py-2 font-semibold">{d.kolonIcerik}</th>
                <th className="px-4 py-2 font-semibold">{d.kolonDurum}</th>
              </tr>
            </thead>
            <tbody>
              {hal.veri.gonderimler.map((g) => {
                const durum = gonderimDurumu(g, dil);
                return (
                  <tr key={g.id} className="border-b border-line align-top last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                      {zamanYaz(g.gonderildi ?? g.olusturuldu, dil)}
                    </td>
                    <td className="px-4 py-2">{g.kanalAdi ?? d.silinmisKanal}</td>
                    <td className="px-4 py-2">{gonderimIcerigi(g, dil)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1.5 font-semibold ${durum.nokta === 'kirmizi' ? 'text-brand-strong' : 'text-ink'}`}>
                        <NoktaIsareti nokta={durum.nokta} />
                        {durum.etiket}
                      </span>
                      {durum.ayrinti && <span className="block text-xs text-ink-muted">{durum.ayrinti}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

