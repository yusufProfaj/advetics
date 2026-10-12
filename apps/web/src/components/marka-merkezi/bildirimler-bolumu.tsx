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

const hataMetni = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');

const NOKTA_SINIFI: Record<Nokta, string> = {
  yesil: 'bg-ok',
  gri: 'border-2 border-ink-muted',
  kirmizi: 'bg-brand',
};

function NoktaIsareti({ nokta }: { nokta: Nokta }) {
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${NOKTA_SINIFI[nokta]}`} />;
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
      setKanallar({ tur: 'hata', mesaj: hataMetni(e) });
    }
  }, [clientId]);

  const gonderimleriOku = useCallback(async () => {
    try {
      setGonderimler({ tur: 'geldi', veri: await apiFetch<BildirimGonderimleriYaniti>(baglanti('/bildirim/gonderimler', { clientId })) });
    } catch (e) {
      setGonderimler({ tur: 'hata', mesaj: hataMetni(e) });
    }
  }, [clientId]);

  useEffect(() => {
    void kanallariOku();
    void gonderimleriOku();
  }, [kanallariOku, gonderimleriOku]);

  /** Deneme mesajı: teslim sonucu ekranda; gittiyse "geldi mi" sorusu. */
  async function dene(k: BildirimKanali): Promise<string | null> {
    setMesgul(k.id);
    setSatirHatasi(null);
    try {
      const r = denemeSonucuCoz(await apiFetch<unknown>(`/bildirim/kanallar/${encodeURIComponent(k.id)}/dene`, { method: 'POST', body: '{}' }));
      if (r.tur === 'gonderildi') {
        setSoru({ kanal: k, hal: 'soruluyor' });
        return null;
      }
      const mesaj = r.tur === 'dustu' ? `Deneme mesajı gönderilemedi: ${r.mesaj}` : 'Deneme isteği gitti ama teslim sonucu okunamadı. Son gönderimler tablosuna bakın.';
      setSatirHatasi({ id: k.id, mesaj });
      return mesaj;
    } catch (e) {
      const mesaj = `Deneme mesajı gönderilemedi: ${hataMetni(e)}`;
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
      setSatirHatasi({ id: k.id, mesaj: `Cevap kaydedilemedi: ${hataMetni(e)}` });
    }
  }

  async function guncelle(k: BildirimKanali, govde: { etkin?: boolean; olaylar?: BildirimOlayi[] }) {
    setMesgul(k.id);
    setSatirHatasi(null);
    try {
      await apiFetch(`/bildirim/kanallar/${encodeURIComponent(k.id)}`, { method: 'PATCH', body: JSON.stringify(govde) });
      await kanallariOku();
    } catch (e) {
      setSatirHatasi({ id: k.id, mesaj: `Değiştirilemedi: ${hataMetni(e)}` });
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
      setSatirHatasi({ id: k.id, mesaj: `Silinemedi: ${hataMetni(e)}` });
    } finally {
      setMesgul(null);
    }
  }

  const veri = kanallar.tur === 'geldi' ? kanallar.veri : null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface" aria-labelledby="kanallar-baslik">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <h3 id="kanallar-baslik" className="text-sm font-semibold text-ink">
            Bildirim kanalları
          </h3>
          {veri && <span className="text-xs text-ink-muted">{veri.toplam} kanal</span>}
          {yazabilir && (
            <Dugme className="ml-auto" boyut="kucuk" onClick={() => setFormAcik(true)} disabled={formAcik}>
              + Kanal ekle
            </Dugme>
          )}
        </div>

        {kanallar.tur === 'okunuyor' && <p className="px-4 py-5 text-sm text-ink-muted">Kanallar okunuyor…</p>}
        {kanallar.tur === 'hata' && (
          <div className="p-4">
            <Uyari ton="tehlike" baslik="Kanallar alınamadı.">
              {kanallar.mesaj}{' '}
              <button type="button" className="font-semibold underline" onClick={() => void kanallariOku()}>
                Yeniden dene
              </button>
            </Uyari>
          </div>
        )}
        {veri && veri.kanallar.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-semibold text-ink">Bu workspace’te bildirim kanalı yok</p>
            <p className="mx-auto mt-1 max-w-lg text-sm text-ink-muted">
              Sinyaller ve kurallar çalışıyor, ama kimseye haber gitmiyor: her şey yalnız panelde ve kural geçmişinde duruyor.
              {!yazabilir && ' Kanal eklemek için workspace yazma yetkisi gerekiyor.'}
            </p>
          </div>
        )}
        {veri && veri.kanallar.length > 0 && (
          <ul>
            {veri.kanallar.map((k) => (
              <li key={k.id} className="border-t border-line first:border-t-0">
                <div className="grid items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
                  <span className="text-xs font-semibold text-ink-muted">{KANAL_TURU_ADI[k.tur]}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{k.ad}</p>
                    <p className="break-words text-xs text-ink-muted">{kanalAltMetni(k)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${k.durum === 'hata' ? 'text-brand-strong' : 'text-ink'}`}>
                      <NoktaIsareti nokta={KANAL_DURUM_NOKTASI[k.durum]} />
                      {KANAL_DURUM_ADI[k.durum]}
                    </span>
                    {yazabilir && (k.durum === 'dogrulanmadi' || k.durum === 'hata') && (
                      <Dugme ton="ikincil" boyut="kucuk" bekliyor={mesgul === k.id} onClick={() => void dene(k)}>
                        Deneme mesajı gönder
                      </Dugme>
                    )}
                    {yazabilir && (
                      <Dugme ton="sade" boyut="kucuk" disabled={mesgul === k.id} onClick={() => void guncelle(k, { etkin: !k.etkin })}>
                        {k.etkin ? 'Kapat' : 'Aç'}
                      </Dugme>
                    )}
                    {yazabilir &&
                      (silinecek === k.id ? (
                        <>
                          <Dugme ton="tehlike" boyut="kucuk" bekliyor={mesgul === k.id} onClick={() => void sil(k)}>
                            Sil
                          </Dugme>
                          <Dugme ton="sade" boyut="kucuk" onClick={() => setSilinecek(null)}>
                            Vazgeç
                          </Dugme>
                        </>
                      ) : (
                        <Dugme ton="sade" boyut="kucuk" onClick={() => setSilinecek(k.id)}>
                          Sil
                        </Dugme>
                      ))}
                  </div>
                </div>
                {silinecek === k.id && (
                  <p className="px-4 pb-3 text-xs text-ink-muted">Kanal silinir; gönderim geçmişi tabloda kalır. Bu kanalı seçen kurallar kanalsız kalır.</p>
                )}
                {k.durum === 'hata' && k.sonTeslim && (
                  <div className="mx-4 mb-3 border-l-[3px] border-brand pl-3 text-sm">
                    <b className="text-ink">Son gönderim düştü ({new Date(k.sonTeslim.zaman).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}):</b>{' '}
                    {k.sonTeslim.hata ? `"${k.sonTeslim.hata}"` : 'platform nedenini bildirmedi.'}{' '}
                    {k.tur === 'teams'
                      ? 'Teams kanalında Workflows ile yeni bir adres oluşturup kanalı yeniden ekleyin.'
                      : k.tur === 'slack'
                        ? 'Slack’te webhook’un hâlâ kanala bağlı olduğunu kontrol edin.'
                        : 'Alıcı adreslerini kontrol edin.'}
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
  const k = soru.kanal;
  if (soru.hal === 'evet') {
    return (
      <p role="status" className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
        <NoktaIsareti nokta="yesil" />
        <b className="text-ink">Kanal doğrulandı.</b>
        <span className="text-ink-muted">{k.olaylar.includes('sinyal')
            ? 'Sıradaki sinyal özeti buraya gelecek.'
            : k.olaylar.includes('kural')
              ? 'Kural bildirimleri buraya gelecek.'
              : 'Pazartesi sabahı haftalık özet buraya gelecek.'}</span>
      </p>
    );
  }
  if (soru.hal === 'hayir') {
    return (
      <p role="status" className="mx-4 mb-3 rounded-lg border border-line px-3 py-2 text-sm text-ink">
        <b>Mesaj görünmediyse</b> adres başka bir kanala ait olabilir.{' '}
        {k.tur === 'eposta'
          ? 'Alıcıların istenmeyen posta klasörüne bakın, adresleri kontrol edin.'
          : 'Webhook’un bağlı olduğu kanalı kontrol edip kanalı doğru adresle yeniden ekleyin.'}
      </p>
    );
  }
  return (
    <div role="status" className="mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-ink px-3 py-2.5 text-sm">
      <span>
        <b className="text-ink">Deneme mesajı {KANAL_TURU_ADI[k.tur]} kanalına gönderildi.</b> {k.ad} {k.tur === 'eposta' ? 'alıcılarına ulaştı mı?' : 'kanalında göründü mü?'}
      </span>
      <span className="ml-auto flex gap-2">
        <Dugme boyut="kucuk" bekliyor={soru.hal === 'gonderiliyor'} onClick={() => onCevap(true)}>
          Evet, geldi
        </Dugme>
        <Dugme ton="ikincil" boyut="kucuk" disabled={soru.hal === 'gonderiliyor'} onClick={() => onCevap(false)}>
          Hayır
        </Dugme>
      </span>
    </div>
  );
}

const ADRES_IPUCU: Record<'slack' | 'teams', { yer: string; ipucu: string }> = {
  slack: {
    yer: 'https://hooks.slack.com/services/…',
    ipucu:
      'Slack’te "Incoming Webhooks" uygulamasını kanala ekleyin ve verdiği adresi buraya yapıştırın. Adres şifreli saklanır; kaydettikten sonra yalnız son dört karakteri görünür.',
  },
  teams: {
    yer: 'https://…logic.azure.com/workflows/…',
    ipucu:
      'Teams kanalında "Workflows" ile "Bir web kancası isteği alındığında kanala gönder" akışını oluşturun ve adresi yapıştırın. Adres şifreli saklanır.',
  },
};

const TUR_ALT: Record<KanalTuru, string> = {
  slack: 'Bir kanala mesaj',
  teams: 'Bir kanala mesaj',
  eposta: 'Bir ya da daha çok kişiye',
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

  const denetim = kanalFormuDenetle({ tur, clientId, ad, adres, alicilarHam: alicilar, olaylar });

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
      setHata(`Kanal kaydedilemedi: ${hataMetni(e)}`);
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

  const adresIpucu = tur === 'eposta' ? null : ADRES_IPUCU[tur];

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none ${
        acik ? 'grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0'
      }`}
      aria-hidden={!acik}
      inert={!acik}
    >
      <div className="overflow-hidden">
        <section className="rounded-xl border border-line bg-surface" aria-labelledby="kanal-ekle-baslik">
          <div className="border-b border-line px-4 py-3">
            <h3 id="kanal-ekle-baslik" className="text-sm font-semibold text-ink">
              Kanal ekle
            </h3>
          </div>
          <div role="group" aria-label="Kanal türü" className="grid gap-2.5 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {KANAL_TURLERI.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tur === t}
                onClick={() => turSec(t)}
                className={`flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors ${
                  tur === t ? 'border-brand ring-1 ring-brand' : 'border-line hover:border-ink-muted'
                }`}
              >
                <b className="text-sm text-ink">{KANAL_TURU_ADI[t]}</b>
                <small className="text-xs text-ink-muted">{TUR_ALT[t]}</small>
              </button>
            ))}
            {KANAL_DISARIDA.map((d) => (
              <button
                key={d.kod}
                type="button"
                disabled
                title="İlk sürümde yok"
                className="flex cursor-not-allowed flex-col gap-1 rounded-lg border border-line p-3 text-left opacity-50"
              >
                <b className="text-sm text-ink">{d.ad}</b>
                <small className="text-xs text-ink-muted">{d.neden}</small>
              </button>
            ))}
          </div>

          <div className="space-y-3 px-4 pb-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink">Kanal adı</span>
              <input
                type="text"
                value={ad}
                maxLength={80}
                onChange={(e) => setAd(e.target.value)}
                placeholder={tur === 'eposta' ? 'Ajans ekibi' : '#reklam-uyarilari'}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink-muted"
              />
            </label>

            {adresIpucu && tur !== 'eposta' && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-ink">Webhook adresi</span>
                <input
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
                  aria-invalid={adresHatasi !== null}
                  className={`w-full rounded-lg border bg-surface px-3 py-2 text-sm text-ink outline-none ${
                    adresHatasi ? 'border-brand' : 'border-line focus:border-ink-muted'
                  }`}
                />
                {adresHatasi && (
                  <span role="alert" className="mt-1 block text-xs font-semibold text-brand-strong">
                    {adresHatasi}
                  </span>
                )}
                <span className="mt-1 block text-xs text-ink-muted">{adresIpucu.ipucu}</span>
              </label>
            )}

            {tur === 'eposta' && (
              <div className="space-y-2">
                {gonderen && !gonderen.tanimli && (
                  <Uyari ton="uyari" baslik="E-posta kanalı şu an gönderemez.">
                    {gonderen.neden}
                  </Uyari>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink">Alıcılar</span>
                  <textarea
                    rows={2}
                    value={alicilar}
                    onChange={(e) => setAlicilar(e.target.value)}
                    onBlur={alicilariDenetle}
                    placeholder="ad@ajans.com, ikinci@ajans.com"
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ink-muted"
                  />
                  <span className="mt-1 block text-xs text-ink-muted">
                    Virgülle ayırın, en çok {ALICI_UST_SINIRI}.{' '}
                    {gonderen?.tanimli ? `Gönderen: ${gonderen.adres}.` : ''} Sinyaller ajansın iç bilgisidir; ajans dışı bir adres yazarsanız uyarırız.
                  </span>
                </label>
                {aliciUyarisi.gecersiz.length > 0 && (
                  <p role="alert" className="text-xs font-semibold text-brand-strong">
                    Geçersiz adres: {aliciUyarisi.gecersiz.join(', ')}
                  </p>
                )}
                {aliciUyarisi.disarida.length > 0 && (
                  <Uyari ton="uyari" baslik="Ajans dışı adres var.">
                    {aliciUyarisi.disarida.join(', ')} ajansın alan adında değil. Sinyaller ajansın iç bilgisi; bilerek yazdıysanız kaydedebilirsiniz.
                  </Uyari>
                )}
              </div>
            )}

            <fieldset>
              <legend className="mb-1 text-xs font-semibold text-ink">Neler gelsin</legend>
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
                      {o === 'sinyal'
                        ? 'Her sabah 09:00’da yeni açılanların özeti. Yeni sinyal yoksa mesaj gitmez.'
                        : '"Yalnızca bildir" kuralı eşleşince ya da bir kural platformda uygulanamayınca, anında.'}
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

            <div className="flex flex-wrap justify-end gap-2">
              <Dugme ton="ikincil" onClick={onVazgec} disabled={kaydediliyor}>
                Vazgeç
              </Dugme>
              <Dugme onClick={() => void kaydet()} bekliyor={kaydediliyor} disabled={!denetim.gecerli || adresHatasi !== null}>
                Kaydet ve deneme mesajı gönder
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
  return (
    <section className="rounded-xl border border-line bg-surface" aria-labelledby="gonderimler-baslik">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h3 id="gonderimler-baslik" className="text-sm font-semibold text-ink">
          Son gönderimler
        </h3>
        {hal.tur === 'geldi' && (
          <span className="ml-auto text-xs text-ink-muted">
            Gösterilen {hal.veri.gonderimler.length} / {hal.veri.toplam}
          </span>
        )}
      </div>
      {hal.tur === 'okunuyor' && <p className="px-4 py-5 text-sm text-ink-muted">Gönderimler okunuyor…</p>}
      {hal.tur === 'hata' && (
        <div className="p-4">
          <Uyari ton="tehlike" baslik="Gönderim geçmişi alınamadı.">
            {hal.mesaj}{' '}
            <button type="button" className="font-semibold underline" onClick={onYenile}>
              Yeniden dene
            </button>
          </Uyari>
        </div>
      )}
      {hal.tur === 'geldi' && hal.veri.gonderimler.length === 0 && (
        <p className="px-4 py-5 text-sm text-ink-muted">Henüz gönderim yok. Kanal ekleyip deneme mesajı gönderince burada görünür.</p>
      )}
      {hal.tur === 'geldi' && hal.veri.gonderimler.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-muted">
                <th className="px-4 py-2 font-semibold">Zaman</th>
                <th className="px-4 py-2 font-semibold">Kanal</th>
                <th className="px-4 py-2 font-semibold">İçerik</th>
                <th className="px-4 py-2 font-semibold">Durum</th>
              </tr>
            </thead>
            <tbody>
              {hal.veri.gonderimler.map((g) => {
                const d = gonderimDurumu(g);
                return (
                  <tr key={g.id} className="border-b border-line align-top last:border-b-0">
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                      {new Date(g.gonderildi ?? g.olusturuldu).toLocaleString('tr-TR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-2">{g.kanalAdi ?? 'Silinmiş kanal'}</td>
                    <td className="px-4 py-2">{gonderimIcerigi(g)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center gap-1.5 font-semibold ${d.nokta === 'kirmizi' ? 'text-brand-strong' : 'text-ink'}`}>
                        <NoktaIsareti nokta={d.nokta} />
                        {d.etiket}
                      </span>
                      {d.ayrinti && <span className="block text-xs text-ink-muted">{d.ayrinti}</span>}
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

