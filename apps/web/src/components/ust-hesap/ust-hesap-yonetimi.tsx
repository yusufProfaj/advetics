'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  MANAGER_PAKETLERI,
  PAKET_SINIRLARI,
  updateManagerAccountSchema,
  type ManagerPaket,
  type UstHesapOzeti,
  type UstHesapSilmeOzeti,
  type UstHesapSilmeYaniti,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { acilisAdresi, ayarlarAdresi } from '@/lib/panel-adresleri';
import { Halka } from '@/components/yukleniyor';
import { Dugme, dugmeSinifi } from '@/components/ui/dugme';
import { Girdi } from '@/components/ui/alan';
import { Rozet } from '@/components/ui/rozet';
import { Uyari } from '@/components/ui/uyari';
import { dolulukMetni } from './ust-hesap-karti';

/**
 * ÜST HESAPLAR KARTI ŞİRKETLER SEKMESİNİN İÇİNDE (2026-10-13, kullanıcı
 * kararı: yalnız platform sahibine). Ayrı sayfaydı (`/ayarlar/ust-hesaplar`,
 * artık yönleniyor); işlem sonrası tam sayfa dönüşü kartın çapasına.
 */
const UST_HESAPLAR_ADRESI = ayarlarAdresi('sirketler', { capa: 'ust-hesaplar' });

/**
 * ═══ ÜST HESAPLAR — SATILAN ÜRÜNÜN ENVANTERİ ═══
 *
 * Üst hesap ayarları uzun süre Şirketler ekranındaki bir kartın içindeydi ve
 * o kart YALNIZCA AKTİF hesabı gösteriyordu: ikinci bir hesabın adını
 * değiştirmek için önce ona geçmek, yani bağlamı, açık şirketi ve workspace
 * seçimini değiştirmek gerekiyordu. Silme ise hiç yoktu — kurulan bir test
 * hesabı panelden kaldırılamıyordu.
 *
 * Bu ekran Şirketler'le AYNI dili konuşuyor (liste + satır içi katlanır
 * panel): panelde iki farklı "yönet" deseni olması, her ekranı yeniden
 * öğrenmek demekti.
 *
 * KİMİN NE GÖRDÜĞÜ SUNUCUDA: platform sahibi bütün hesapları, diğerleri
 * yalnızca üyesi olduklarını. Silme yalnızca platform sahibinde ve ek olarak
 * KENDİ hesabı engelli — silme altındaki şirketleri de götürüyor ve giriş
 * hesabı onlardan birine bağlı.
 */
export function UstHesapYonetimi({
  hesaplar,
  platformAdmin,
  yuklemeHatasi,
}: {
  hesaplar: UstHesapOzeti[];
  platformAdmin: boolean;
  yuklemeHatasi: string | null;
}) {
  const [acikPanel, setAcikPanel] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <section className="rounded-kart border border-line bg-surface">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-ink">
              Üst hesaplar
              {/* SESSİZ KESME YOK: kaç hesap listelendiği yazılı. */}
              <span className="ml-2 text-xs font-normal text-ink-muted">
                {hesaplar.length} hesap
              </span>
            </h2>
            <p className="mt-0.5 max-w-prose text-[11px] text-ink-muted">
              {platformAdmin
                ? 'Advetics’in açtığı bütün üst hesaplar. Her biri ayrı bir alıcıya satılıyor ve altındaki şirketleri tek girişle yönetiyor.'
                : 'Yönetici olduğun üst hesaplar. Adını değiştirebilirsin; paketi yalnızca Advetics değiştirir.'}
            </p>
          </div>
          {platformAdmin && (
            /*
              YENİ HESAP SİHİRBAZDA KURULUYOR. Buradaki form yalnızca ad ve
              paket soruyordu; hesap şirketsiz bir kabuk gibi açılıyor ve
              içine platform bağlamak, workspace kurmak ayrı ekranlarda,
              hiçbir yerde yazmayan bir sırayla yapılıyordu.
            */
            <Link
              href={acilisAdresi('ust-hesap')}
              className={dugmeSinifi('koyu', 'kucuk')}
            >
              + Yeni üst hesap
            </Link>
          )}
        </header>

        {yuklemeHatasi && (
          <p role="alert" className="border-b border-line px-4 py-2 text-xs text-danger-strong">
            Üst hesaplar yüklenemedi: {yuklemeHatasi}
          </p>
        )}

        {hesaplar.length === 0 && !yuklemeHatasi ? (
          <p className="px-4 py-6 text-sm text-ink-muted">
            Yönetebildiğin bir üst hesap yok.
          </p>
        ) : (
          <ul className="divide-y divide-line/60">
            {hesaplar.map((h) => (
              <li key={h.id}>
                <HesapSatiri
                  hesap={h}
                  platformAdmin={platformAdmin}
                  acik={acikPanel?.startsWith(h.id) ? acikPanel.slice(h.id.length + 1) : null}
                  onPanel={(p) => setAcikPanel(p === null ? null : `${h.id}:${p}`)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type Panel = 'duzenle' | 'sil';

function HesapSatiri({
  hesap,
  platformAdmin,
  acik,
  onPanel,
}: {
  hesap: UstHesapOzeti;
  platformAdmin: boolean;
  acik: string | null;
  onPanel: (p: Panel | null) => void;
}) {
  const sinir = PAKET_SINIRLARI[hesap.paket];

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
            <span className="truncate">{hesap.name}</span>
            {/* İKİ ROZET, İKİ AYRI BİLGİ: nerede duruyorsun · hangisi seni
                barındırıyor. İkincisi silinemez olmasının sebebi. */}
            {hesap.aktif && (
              <span className="rounded-full bg-vurgu px-2 py-0.5 text-11 font-semibold text-brand-strong">
                şu an buradasın
              </span>
            )}
            {hesap.evHesabi && (
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-11 font-semibold text-ink-muted">
                kendi hesabın
              </span>
            )}
            {hesap.status !== 'active' && (
              <Rozet hal="dur">askıda</Rozet>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-muted">
            {sinir.etiket} paketi · {dolulukMetni(hesap.sirketSayisi, sinir.maxSirket, 'şirket')} ·{' '}
            {hesap.workspaceSayisi} workspace · {hesap.uyeSayisi} kişi
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/*
            GEÇİŞ TAM SAYFA. Üst hesap değişince bütün ağaç değişiyor:
            şirket listesi, workspace seçimi, bağlantılar. `router.refresh()`
            sunucu bileşenlerini tazeler ama çerezi okuyan istemci
            durumlarını değil.
          */}
          {!hesap.aktif && <GecisDugmesi id={hesap.id} />}
          <SatirDugmesi aktif={acik === 'duzenle'} onClick={() => onPanel(acik === 'duzenle' ? null : 'duzenle')}>
            Düzenle
          </SatirDugmesi>
          {platformAdmin && (
            <SatirDugmesi
              aktif={acik === 'sil'}
              tehlike
              onClick={() => onPanel(acik === 'sil' ? null : 'sil')}
            >
              Sil
            </SatirDugmesi>
          )}
        </div>
      </div>

      {acik === 'duzenle' && (
        <div className="mt-3 border-t border-line pt-3">
          <UstHesapDuzenle
            hesap={hesap}
            platformAdmin={platformAdmin}
            onBitti={() => onPanel(null)}
            onVazgec={() => onPanel(null)}
          />
        </div>
      )}
      {acik === 'sil' && platformAdmin && (
        <div className="mt-3 border-t border-line pt-3">
          <UstHesapSil hesap={hesap} onVazgec={() => onPanel(null)} />
        </div>
      )}
    </div>
  );
}

function GecisDugmesi({ id }: { id: string }) {
  const [pending, setPending] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function gec(): Promise<void> {
    setPending(true);
    setHata(null);
    try {
      await apiFetch('/auth/switch-manager', {
        method: 'POST',
        body: JSON.stringify({ managerAccountId: id }),
      });
      window.location.assign(UST_HESAPLAR_ADRESI);
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Geçilemedi.');
      setPending(false);
    }
  }

  return (
    <>
      <Dugme ton="ikincil" boyut="kucuk" bekliyor={pending} onClick={() => void gec()}>
        Bu hesaba geç
      </Dugme>
      {hata && (
        <span role="alert" className="text-12 text-danger-strong">
          {hata}
        </span>
      )}
    </>
  );
}

function SatirDugmesi({
  aktif,
  tehlike,
  onClick,
  children,
}: {
  aktif: boolean;
  tehlike?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  // Açık panelin düğmesi KOYU: hangi satırın düzenlendiği bakışta görünsün.
  return (
    <Dugme ton={tehlike ? 'tehlike' : aktif ? 'koyu' : 'ikincil'} boyut="kucuk" onClick={onClick} aria-expanded={aktif}>
      {children}
    </Dugme>
  );
}

/** Paket seçimi — üç kart, her birinde ne aldığı yazılı. */
export function PaketSecici({
  deger,
  onChange,
  disabled,
}: {
  deger: ManagerPaket;
  onChange: (p: ManagerPaket) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-3">
      <legend className="mb-1 text-[11px] text-ink-muted">Paket</legend>
      {MANAGER_PAKETLERI.map((p) => {
        const s = PAKET_SINIRLARI[p];
        const secili = p === deger;
        return (
          <label
            key={p}
            className={`cursor-pointer rounded-alan border p-3 text-left transition-colors ${
              secili ? 'border-brand bg-vurgu' : 'border-line hover:bg-surface-muted'
            } ${disabled ? 'opacity-60' : ''}`}
          >
            <input
              type="radio"
              name={`paket-${deger}`}
              value={p}
              checked={secili}
              disabled={disabled}
              onChange={() => onChange(p)}
              className="sr-only"
            />
            <span className="block text-sm font-semibold text-ink">{s.etiket}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">{s.aciklama}</span>
            {/* SINIR SAYIYLA: "1 şirket · 2 reklam hesabı" — açıklama cümlesi yetmez. */}
            <span className="mt-1 block text-[11px] text-ink">
              {s.maxSirket === null ? 'Sınırsız şirket' : `${s.maxSirket} şirket`} ·{' '}
              {s.maxReklamHesabi === null
                ? 'sınırsız reklam hesabı'
                : `${s.maxReklamHesabi} reklam hesabı`}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function UstHesapDuzenle({
  hesap,
  platformAdmin,
  onBitti,
  onVazgec,
}: {
  hesap: UstHesapOzeti;
  platformAdmin: boolean;
  onBitti: () => void;
  onVazgec: () => void;
}) {
  const [ad, setAd] = useState(hesap.name);
  const [paket, setPaket] = useState<ManagerPaket>(hesap.paket);
  const [pending, setPending] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const degisti = ad !== hesap.name || paket !== hesap.paket;

  async function kaydet(): Promise<void> {
    /*
     * PAKET YALNIZCA DEĞİŞTİYSE GÖNDERİLİYOR. Platform sahibi olmayan biri
     * için paketi göndermek — değişmemiş olsa bile — sunucuda REDDEDİLİYOR
     * ("yalnızca platform sahibi"); ad değişikliği o yüzden düşerdi.
     */
    const govde = {
      ...(ad !== hesap.name ? { name: ad } : {}),
      ...(paket !== hesap.paket ? { paket } : {}),
    };
    const parsed = updateManagerAccountSchema.safeParse(govde);
    if (!parsed.success) {
      setHata(parsed.error.issues[0]?.message ?? 'Geçersiz değer');
      return;
    }
    setPending(true);
    setHata(null);
    try {
      await apiFetch(`/manager-account/${hesap.id}`, {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
      /*
       * TAM SAYFA YENİLEME — `router.refresh()` DEĞİL. Üst hesabın adı üst
       * bardaki seçicide ve sayfa başlığında da duruyor; ikisi oturum
       * yanıtından besleniyor ve o yanıt yalnızca yeni bir istekte
       * tazeleniyor. Yarısı yenilenmiş bir ekran, kullanıcıya kaydın
       * yapılmadığını düşündürüyor.
       */
      window.location.assign(UST_HESAPLAR_ADRESI);
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Kaydedilemedi.');
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block max-w-md">
        <span className="mb-1.5 block text-13 font-semibold text-ink">Üst hesap adı</span>
        <Girdi value={ad} onChange={(e) => setAd(e.target.value)} disabled={pending} />
      </label>

      {platformAdmin ? (
        <PaketSecici deger={paket} onChange={setPaket} disabled={pending} />
      ) : (
        // PAKET GÖRÜNÜYOR AMA DEĞİŞMİYOR — ve neden değişmediği yazılı.
        <p className="text-xs text-ink-muted">
          Paket: <strong>{PAKET_SINIRLARI[hesap.paket].etiket}</strong>. Paketi yalnızca Advetics
          değiştirebilir.
        </p>
      )}

      {hata && (
        <p role="alert" className="text-xs text-danger-strong">
          {hata}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Dugme ton="koyu" boyut="kucuk" bekliyor={pending} disabled={!degisti} onClick={() => void kaydet()}>
          Kaydet
        </Dugme>
        <Dugme
          ton="hayalet"
          boyut="kucuk"
          onClick={() => {
            onBitti();
            onVazgec();
          }}
        >
          Vazgeç
        </Dugme>
      </div>
    </div>
  );
}

/**
 * ═══ ÜST HESAP SİLME — NE GİDECEĞİ ÖNCE YAZILIYOR ═══
 *
 * İKİ ADIM: özet sunucudan çekiliyor, sonra siliniyor. "Emin misiniz?" deyip
 * ne gideceğini söylememek bu depoda `reset-clients`in yarım kalmasıyla aynı
 * sınıf hata — pahalı yarısı yapılır, kullanıcı ne kaybettiğini sonra
 * öğrenir. Özet İSTEMCİDE HESAPLANMIYOR: liste satırındaki sayılar aktif
 * şirketleri sayıyor, silme ise pasif olanları da götürüyor.
 */
function UstHesapSil({ hesap, onVazgec }: { hesap: UstHesapOzeti; onVazgec: () => void }) {
  const [ozet, setOzet] = useState<UstHesapSilmeOzeti | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [onay, setOnay] = useState('');
  const [pending, setPending] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  /*
   * PANEL AÇILINCA ÇEKİLİYOR — kullanıcı düğmeye basmadan ne kaybedeceğini
   * görmeli. `useEffect`, `useState` başlatıcısı DEĞİL: başlatıcı render
   * sırasında koşuyor ve StrictMode'da iki kez çağrılıyor, yani özet iki
   * kez istenirdi.
   */
  useEffect(() => {
    let iptal = false;
    void (async () => {
      try {
        const o = await apiFetch<UstHesapSilmeOzeti>(`/manager-account/${hesap.id}/silme-ozeti`);
        if (!iptal) setOzet(o);
      } catch (e) {
        if (!iptal) setHata(e instanceof ApiRequestError ? e.message : 'Özet alınamadı.');
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();
    return () => {
      iptal = true;
    };
  }, [hesap.id]);

  async function sil(): Promise<void> {
    setPending(true);
    setHata(null);
    try {
      const sonuc = await apiFetch<UstHesapSilmeYaniti>(`/manager-account/${hesap.id}`, {
        method: 'DELETE',
        body: JSON.stringify(ozet?.adOnayiGerekli ? { onayAdi: onay.trim() } : {}),
      });
      /*
       * TAM SAYFA. Silinen hesap AKTİF olabiliyor; o hâlde sunucu çerezleri
       * ev hesabına taşıyor ve panelin bütün bağlamı (şirket listesi,
       * workspace seçimi, bağlantılar) değişiyor.
       */
      window.location.assign(sonuc.aktifti ? '/dashboard' : UST_HESAPLAR_ADRESI);
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Silinemedi.');
      setPending(false);
    }
  }

  if (yukleniyor) {
    return (
      <p className="flex items-center gap-2 text-xs text-ink-muted">
        <Halka /> Ne silineceği hesaplanıyor…
      </p>
    );
  }

  if (!ozet) {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-xs text-danger-strong">
          {hata ?? 'Özet alınamadı.'}
        </p>
        <Dugme ton="hayalet" boyut="kucuk" onClick={onVazgec}>
          Kapat
        </Dugme>
      </div>
    );
  }

  const bosHesap =
    ozet.sirketAdlari.length === 0 &&
    ozet.workspaceSayisi === 0 &&
    ozet.reklamHesabi === 0 &&
    ozet.kullanici === 0 &&
    ozet.metrikGunu === 0;

  return (
    <div className="space-y-3">
      {/* ENGEL VARSA SEBEBİ YAZILI — düğme sessizce kapanmıyor. */}
      {ozet.engel !== null ? (
        <Uyari ton="uyari">{ozet.engel}</Uyari>
      ) : (
        <Uyari
          ton="tehlike"
          baslik={
            bosHesap
              ? 'Bu hesap boş; silmek geri alınamaz ama kaybedilecek veri yok.'
              : 'Bu hesapla birlikte ALTINDAKİ HER ŞEY silinir ve geri alınamaz:'
          }
        >
          {!bosHesap && (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {/* SAYI DEĞİL AD: "3 şirket" kimseye ne kaybedeceğini söylemiyor. */}
              {ozet.sirketAdlari.length > 0 && (
                <li>
                  <strong>{ozet.sirketAdlari.length} şirket</strong>: {ozet.sirketAdlari.join(', ')}
                </li>
              )}
              {ozet.workspaceSayisi > 0 && <li>{ozet.workspaceSayisi} workspace</li>}
              {ozet.reklamHesabi > 0 && <li>{ozet.reklamHesabi} reklam hesabı</li>}
              {ozet.kullanici > 0 && (
                <li>
                  <strong>{ozet.kullanici} kullanıcı</strong>: silinince giriş yapamazlar
                </li>
              )}
              {ozet.metrikGunu > 0 && (
                <li>
                  {ozet.metrikGunu} günlük ölçüm: Meta 37 aydan eskisini vermiyor, Google&apos;da
                  yeniden çekmek kota harcıyor
                </li>
              )}
            </ul>
          )}
        </Uyari>
      )}

      {ozet.engel === null && ozet.adOnayiGerekli && (
        <label className="block max-w-md">
          <span className="mb-1.5 block text-13 text-ink-muted">
            Onaylamak için üst hesap adını birebir yaz: <strong className="text-ink">{ozet.name}</strong>
          </span>
          <Girdi value={onay} onChange={(e) => setOnay(e.target.value)} disabled={pending} />
        </label>
      )}

      {hata && (
        <p role="alert" className="text-xs text-danger-strong">
          {hata}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Dugme
          ton="tehlike"
          boyut="kucuk"
          bekliyor={pending}
          disabled={
            pending ||
            ozet.engel !== null ||
            (ozet.adOnayiGerekli && onay.trim() !== ozet.name)
          }
          onClick={() => void sil()}
        >
          Kalıcı olarak sil
        </Dugme>
        <Dugme ton="hayalet" boyut="kucuk" onClick={onVazgec}>
          Vazgeç
        </Dugme>
      </div>
    </div>
  );
}

