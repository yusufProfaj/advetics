'use client';

import { useEffect, useState } from 'react';
import {
  MANAGER_PAKETLERI,
  PAKET_SINIRLARI,
  createManagerAccountSchema,
  updateManagerAccountSchema,
  type ManagerPaket,
  type UstHesapOzeti,
  type UstHesapSilmeOzeti,
  type UstHesapSilmeYaniti,
} from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { Halka } from '@/components/yukleniyor';
import { dolulukMetni } from './ust-hesap-karti';

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
  const [yeniAcik, setYeniAcik] = useState(false);
  const [acikPanel, setAcikPanel] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface">
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
            <button
              type="button"
              onClick={() => setYeniAcik((a) => !a)}
              aria-expanded={yeniAcik}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                yeniAcik
                  ? 'border-brand bg-brand-soft text-brand-strong'
                  : 'border-brand bg-brand text-white hover:opacity-90'
              }`}
            >
              + Yeni üst hesap
            </button>
          )}
        </header>

        {yuklemeHatasi && (
          <p role="alert" className="border-b border-line px-4 py-2 text-xs text-danger">
            Üst hesaplar yüklenemedi: {yuklemeHatasi}
          </p>
        )}

        {yeniAcik && platformAdmin && (
          <div className="border-b border-line px-4 py-4">
            <YeniUstHesap onVazgec={() => setYeniAcik(false)} />
          </div>
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
              <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-strong">
                şu an buradasın
              </span>
            )}
            {hesap.evHesabi && (
              <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                kendi hesabın
              </span>
            )}
            {hesap.status !== 'active' && (
              <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[10px] font-medium text-warn">
                askıda
              </span>
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
      window.location.assign('/ayarlar/ust-hesaplar');
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Geçilemedi.');
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => void gec()}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-muted disabled:opacity-40"
      >
        {pending && <Halka />}
        Bu hesaba geç
      </button>
      {hata && (
        <span role="alert" className="text-[11px] text-danger">
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
  const taban = 'rounded-lg border px-3 py-1.5 text-xs font-medium transition';
  const sinif = aktif
    ? tehlike
      ? 'border-danger bg-danger/10 text-danger'
      : 'border-brand bg-brand-soft text-brand-strong'
    : tehlike
      ? 'border-line text-ink-muted hover:border-danger hover:text-danger'
      : 'border-line text-ink hover:bg-surface-muted';
  return (
    <button type="button" onClick={onClick} aria-expanded={aktif} className={`${taban} ${sinif}`}>
      {children}
    </button>
  );
}

/** Paket seçimi — üç kart, her birinde ne aldığı yazılı. */
function PaketSecici({
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
            className={`cursor-pointer rounded-lg border p-3 text-left transition ${
              secili ? 'border-brand bg-brand-soft' : 'border-line hover:bg-surface-muted'
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
      window.location.assign('/ayarlar/ust-hesaplar');
    } catch (e) {
      setHata(e instanceof ApiRequestError ? e.message : 'Kaydedilemedi.');
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <label className="block max-w-md">
        <span className="text-[11px] text-ink-muted">Üst hesap adı</span>
        <input
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          disabled={pending}
          className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
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
        <p role="alert" className="text-xs text-danger">
          {hata}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !degisti}
          onClick={() => void kaydet()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending && <Halka />}
          Kaydet
        </button>
        <button
          type="button"
          onClick={() => {
            onBitti();
            onVazgec();
          }}
          className="text-xs text-ink-muted transition hover:text-ink"
        >
          Vazgeç
        </button>
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
      window.location.assign(sonuc.aktifti ? '/dashboard' : '/ayarlar/ust-hesaplar');
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
        <p role="alert" className="text-xs text-danger">
          {hata ?? 'Özet alınamadı.'}
        </p>
        <button type="button" onClick={onVazgec} className="text-xs text-ink-muted hover:text-ink">
          Kapat
        </button>
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
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">{ozet.engel}</p>
      ) : (
        <div className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-ink">
          <p className="font-semibold text-danger">
            {bosHesap
              ? 'Bu hesap boş — silmek geri alınamaz ama kaybedilecek veri yok.'
              : 'Bu hesapla birlikte ALTINDAKİ HER ŞEY silinir ve geri alınamaz:'}
          </p>
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
                  <strong>{ozet.kullanici} kullanıcı</strong> — silinince giriş yapamazlar
                </li>
              )}
              {ozet.metrikGunu > 0 && (
                <li>
                  {ozet.metrikGunu} günlük ölçüm — Meta 37 aydan eskisini vermiyor, Google&apos;da
                  yeniden çekmek kota harcıyor
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {ozet.engel === null && ozet.adOnayiGerekli && (
        <label className="block max-w-md">
          <span className="text-[11px] text-ink-muted">
            Onaylamak için üst hesap adını birebir yaz: <strong>{ozet.name}</strong>
          </span>
          <input
            value={onay}
            onChange={(e) => setOnay(e.target.value)}
            disabled={pending}
            className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-danger"
          />
        </label>
      )}

      {hata && (
        <p role="alert" className="text-xs text-danger">
          {hata}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={
            pending ||
            ozet.engel !== null ||
            (ozet.adOnayiGerekli && onay.trim() !== ozet.name)
          }
          onClick={() => void sil()}
          className="inline-flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending && <Halka />}
          Kalıcı olarak sil
        </button>
        <button type="button" onClick={onVazgec} className="text-xs text-ink-muted hover:text-ink">
          Vazgeç
        </button>
      </div>
    </div>
  );
}

/**
 * Platform sahibi için yeni üst hesap.
 *
 * KURULUNCA O HESABA GEÇİLİYOR. Kurup eski hesapta kalmak, kullanıcının
 * "kurdum ama nerede" diye seçiciyi aramasıydı — ve kurduğu hesabı hemen
 * ayarlaması gerekiyor (şirket açmak, ekip eklemek).
 */
function YeniUstHesap({ onVazgec }: { onVazgec: () => void }) {
  const [ad, setAd] = useState('');
  const [paket, setPaket] = useState<ManagerPaket>('baslangic');
  const [pending, setPending] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  async function kur(): Promise<void> {
    const parsed = createManagerAccountSchema.safeParse({ name: ad, paket });
    if (!parsed.success) {
      setHata(parsed.error.issues[0]?.message ?? 'Geçersiz değer');
      return;
    }
    setPending(true);
    setHata(null);
    try {
      const yeni = await apiFetch<{ id: string }>('/manager-account', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      await apiFetch('/auth/switch-manager', {
        method: 'POST',
        body: JSON.stringify({ managerAccountId: yeni.id }),
      });
      window.location.assign('/ayarlar/ust-hesaplar');
    } catch (e) {
      // HATA YUTULMUYOR. İki adım var (kur, geç); ikincisi düşerse hesap
      // kurulmuş ama geçilmemiş olur ve bunu kullanıcıya söylemek şart.
      setHata(e instanceof ApiRequestError ? e.message : 'Üst hesap kurulamadı.');
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="max-w-prose text-sm text-ink-muted">
        Satılan her üst hesap için bir tane açılır. Kendi şirketin bu hesaba{' '}
        <strong>bağlanmaz</strong>; kurulunca o hesaba geçersin ve içine şirket açarsın.
      </p>
      <label className="block max-w-md">
        <span className="text-[11px] text-ink-muted">Üst hesap adı</span>
        <input
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          disabled={pending}
          autoFocus
          placeholder="Örn. Yılmaz Mobilya"
          className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>
      <PaketSecici deger={paket} onChange={setPaket} disabled={pending} />
      {hata && (
        <p role="alert" className="text-xs text-danger">
          {hata}
        </p>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => void kur()}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending && <Halka />}
          Kur ve geç
        </button>
        <button type="button" onClick={onVazgec} className="text-xs text-ink-muted transition hover:text-ink">
          Vazgeç
        </button>
      </div>
    </div>
  );
}
