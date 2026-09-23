'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  PLATFORM_LABELS,
  PLATFORMS,
  SPECIAL_AD_CATEGORIES,
  SPECIAL_AD_CATEGORY_META,
  platformKanali,
  type ClientSetupResult,
  type ConnectionSummary,
  type ManagerPaket,
  type Platform,
  type ProviderAvailability,
  type SirketOlusturmaSonucu,
  type SpecialAdCategory,
} from '@advetics/shared';
import { AliciListesiAlani } from '@/components/alici-listesi-alani';
import { AiDoldur } from '@/components/bilgi-bankasi/ai-doldur';
import { CallbackBanner } from '@/components/callback-banner';
import { PlatformLogo } from '@/components/platform-logo';
import { PaketSecici } from '@/components/ust-hesap/ust-hesap-yonetimi';
import { Halka } from '@/components/yukleniyor';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { havuzlariCikar, KANALLAR } from '@/lib/havuz';
import { BoostHesabi, HesapSecimi } from './hesap-secimi';
import {
  ADIM_ADLARI,
  ADIMLAR,
  boostKarari,
  geriGidilebilir,
  kurulumAdresi,
  platformDurumu,
  siteAdresiDuzelt,
  type AdimKodu,
  type KurulumTuru,
} from './kurulum-akisi';
import { KurulumSonucu } from './kurulum-sonucu';

export interface KurulumBaglami {
  platformAdmin: boolean;
  /** Aktif üst hesabın adı — yoksa null. */
  ustHesapAdi: string | null;
  /** Aktif şirketin adı. Üst hesap/şirket kurulduktan sonra YENİ şirket. */
  sirketAdi: string;
  baglantiYonetebilir: boolean;
  bilgiBankasiYazabilir: boolean;
}

/**
 * ═══ KURULUM SİHİRBAZI ═══
 *
 * Kullanıcının isteği: *"bu programı bilmeyen birisi ben anlatmadan da
 * kurulum yapabilecek seviyede kolaylığı olsun"*. Kurulum dört ayrı ekrana
 * dağılmıştı (Üst Hesaplar, Şirketler, Platform Bağlantıları, workspace
 * penceresi) ve aralarındaki sıra hiçbir yerde yazmıyordu:
 *
 *   · yeni şirkete GEÇMEDEN bağlantı kurulursa bağlantı eski şirkete gider,
 *   · yeni şirkette Meta/Google yeniden bağlanmalı (bağlantı şirkete ait),
 *   · sayfa atanıp boost hesabı bağlanmazsa Akıllı Boost çalışmaz,
 *   · Meta'nın özel kategorisi (konut, kredi, istihdam) beyan edilmezse
 *     reklam politika ihlali sayılır.
 *
 * Dördü de SESSİZ: hiçbiri hata vermiyor, yalnızca bir şey çalışmıyor.
 * Sihirbaz bu kuralları adımların sırasına gömüyor; kullanıcının onları
 * bilmesi gerekmiyor.
 *
 * ═══ NEREDE YAZILIYOR ═══
 *
 *   · Üst hesap ve şirket, platform adımına geçerken kuruluyor ve sayfa
 *     TAM yenileniyor: çerez yeni bağlamı gösteriyor, üst bardaki seçiciler
 *     oturumdan besleniyor ve `router.refresh()` onları tazelemiyor.
 *   · Workspace, hesaplar ve boost hesabı son adımda TEK çağrıyla
 *     (`/clients/setup`) kuruluyor. Parça parça çağrı, adımlardan birinin
 *     sessizce atlandığı eski akışı geri getirirdi.
 */
export function KurulumSihirbazi({
  tur,
  ilkAdim,
  baglam,
  uygunluk,
  baglantilar,
  yuklemeHatasi,
}: {
  tur: KurulumTuru;
  ilkAdim: AdimKodu;
  baglam: KurulumBaglami;
  uygunluk: ProviderAvailability[];
  baglantilar: ConnectionSummary[];
  yuklemeHatasi: string | null;
}) {
  const router = useRouter();
  const adimlar = ADIMLAR[tur];
  const [aktif, setAktif] = useState<AdimKodu>(ilkAdim);
  const aktifSira = adimlar.indexOf(aktif);
  const baslikRef = useRef<HTMLHeadingElement>(null);

  // ─── Üst hesap ve şirket ───
  const [ustHesapAdi, setUstHesapAdi] = useState('');
  const [paket, setPaket] = useState<ManagerPaket>('baslangic');
  const [sirketAdi, setSirketAdi] = useState('');
  /*
   * KURULAN KAYDIN KİMLİĞİ TUTULUYOR. Kurulum iki çağrı (oluştur, geç) ve
   * ikincisi düşerse kullanıcı "Tekrar dene"ye basacak. Kimlik tutulmasaydı
   * o basış İKİNCİ bir üst hesap ya da şirket açardı.
   */
  const [kurulanId, setKurulanId] = useState<string | null>(null);

  // ─── Workspace ───
  const [wsAdi, setWsAdi] = useState(tur === 'workspace' ? '' : baglam.sirketAdi);
  const [site, setSite] = useState('');
  const [alicilar, setAlicilar] = useState<string[]>([]);
  const [kategoriler, setKategoriler] = useState<SpecialAdCategory[]>([]);

  // ─── Hesaplar ───
  const havuzlar = useMemo(() => havuzlariCikar(baglantilar), [baglantilar]);
  const [secili, setSecili] = useState<Set<string>>(new Set());
  const [boostSecim, setBoostSecim] = useState<string | null>(null);
  const [girisAcik, setGirisAcik] = useState(false);
  const [giris, setGiris] = useState({ email: '', fullName: '', password: '' });

  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<ClientSetupResult | null>(null);

  const seciliMetaHesaplar = havuzlar.meta_ads.filter((o) => secili.has(o.id));
  const boostSayfaSayisi = [...havuzlar.facebook, ...havuzlar.instagram].filter((o) =>
    secili.has(o.id),
  ).length;
  const boost = boostKarari(
    seciliMetaHesaplar.map((h) => h.id),
    boostSayfaSayisi,
    boostSecim,
  );

  /*
   * ODAK ADIM BAŞLIĞINA TAŞINIYOR. Ekran okuyucu kullanıcısı "Devam"a
   * bastıktan sonra içeriğin değiştiğini ancak böyle öğreniyor; odak düğmede
   * kalsaydı sayfa sessizce yenilenmiş olurdu.
   */
  useEffect(() => {
    baslikRef.current?.focus();
  }, [aktif]);

  /*
   * ADIM ADRESTE TAŞINIYOR, sunucuya gidilmeden. Platform bağlantısı
   * tarayıcıyı başka siteye gönderip geri getiriyor ve dönüş adresi BU
   * adımı göstermeli; `router.replace` sunucu bileşenini yeniden çizip
   * bağlantı listesini (yüzlerce hesap) boşuna tekrar çekerdi.
   */
  function adimaGec(hedef: AdimKodu): void {
    setHata(null);
    setAktif(hedef);
    if (hedef !== 'bitti') window.history.replaceState(null, '', kurulumAdresi(tur, hedef));
  }

  function sonraki(): AdimKodu {
    return adimlar[Math.min(aktifSira + 1, adimlar.length - 1)]!;
  }

  // ─── Sunucuya yazan adımlar ───

  async function ustHesapKur(): Promise<void> {
    setBusy(true);
    setHata(null);
    /*
     * KİMLİK YEREL DEĞİŞKENDE, `catch` onu okuyabilsin diye. `kurulanId`
     * durumu bu çağrının içinde güncellenmiyor (React bir sonraki çizimde
     * yazıyor); `catch` onu okusaydı oluşturma başarılı olup geçiş düştüğünde
     * "kurulamadı" derdi ve kullanıcı var olan kaydı yeniden kurmaya
     * çalışırdı.
     */
    let id = kurulanId;
    try {
      if (id === null) {
        const yeni = await apiFetch<{ id: string }>('/manager-account', {
          method: 'POST',
          body: JSON.stringify({
            name: ustHesapAdi.trim(),
            // PAKET VE ŞİRKET ADI YALNIZCA PLATFORM SAHİBİNDE. Org
            // yöneticisinde ilk şirket açılmıyor (var olanı bağlanıyor) ve
            // sunucu bu alanları reddediyor; göndermek kurulumu düşürürdü.
            ...(baglam.platformAdmin ? { paket, sirketAdi: sirketAdi.trim() } : {}),
          }),
        });
        id = yeni.id;
        setKurulanId(id);
      }
      await apiFetch('/auth/switch-manager', {
        method: 'POST',
        body: JSON.stringify({ managerAccountId: id }),
      });
      /*
       * `replace`, `assign` DEĞİL: geri tuşu kullanıcıyı boş bir "üst hesap
       * adı" formuna döndürürdü ve oradan "Devam" ikinci bir hesap açardı.
       */
      window.location.replace(kurulumAdresi(tur, 'baglantilar'));
    } catch (e) {
      setHata(
        id === null
          ? hataMetni(e, 'Üst hesap kurulamadı.')
          : `Üst hesap kuruldu ama içine geçilemedi. ${hataMetni(e, '')}`.trim(),
      );
      setBusy(false);
    }
  }

  async function sirketKur(): Promise<void> {
    setBusy(true);
    setHata(null);
    /*
     * KİMLİK YEREL DEĞİŞKENDE, `catch` onu okuyabilsin diye. `kurulanId`
     * durumu bu çağrının içinde güncellenmiyor (React bir sonraki çizimde
     * yazıyor); `catch` onu okusaydı oluşturma başarılı olup geçiş düştüğünde
     * "kurulamadı" derdi ve kullanıcı var olan kaydı yeniden kurmaya
     * çalışırdı.
     */
    let id = kurulanId;
    try {
      if (id === null) {
        const r = await apiFetch<SirketOlusturmaSonucu>('/manager-account/organizations', {
          method: 'POST',
          body: JSON.stringify({ name: sirketAdi.trim() }),
        });
        id = r.olusturulanSirketId;
        setKurulanId(id);
      }
      /*
       * YENİ ŞİRKETE GEÇİŞ ŞART. Bağlantı ve workspace AKTİF şirkete
       * kuruluyor; geçmeden devam etmek, Meta'yı ve workspace'i ESKİ şirkete
       * kurardı ve yeni şirket boş kalırdı. Hiçbir ekran bunu söylemezdi.
       */
      await apiFetch('/auth/switch-org', {
        method: 'POST',
        body: JSON.stringify({ organizationId: id }),
      });
      window.location.replace(kurulumAdresi(tur, 'baglantilar'));
    } catch (e) {
      setHata(
        id === null
          ? hataMetni(e, 'Şirket kurulamadı.')
          : `Şirket kuruldu ama içine geçilemedi. ${hataMetni(e, '')}`.trim(),
      );
      setBusy(false);
    }
  }

  async function workspaceKur(): Promise<void> {
    /*
     * SEÇİLENLER TİPİNE GÖRE İKİ LİSTEYE AYRILIYOR. Sunucu reklam hesabı ve
     * sosyal profili ayrı alanlarda bekliyor.
     */
    const tumu = KANALLAR.flatMap((k) => havuzlar[k]);
    const adAccountIds = tumu.filter((o) => o.reklamHesabi && secili.has(o.id)).map((o) => o.id);
    const socialProfileIds = tumu
      .filter((o) => !o.reklamHesabi && secili.has(o.id))
      .map((o) => o.id);
    const girisDolu = girisAcik && giris.email.trim() !== '' && giris.password !== '';

    setBusy(true);
    setHata(null);
    try {
      const r = await apiFetch<ClientSetupResult>('/clients/setup', {
        method: 'POST',
        body: JSON.stringify({
          name: wsAdi.trim(),
          website: site.trim() === '' ? null : siteAdresiDuzelt(site),
          contactEmails: alicilar,
          specialAdCategories: kategoriler,
          adAccountIds,
          socialProfileIds,
          boostHesabiId: boost.hesapId,
          ...(girisDolu
            ? {
                clientUser: {
                  email: giris.email.trim(),
                  fullName: giris.fullName.trim() || wsAdi.trim(),
                  password: giris.password,
                },
              }
            : {}),
        }),
      });
      setSonuc(r);
      /*
       * ADRES SİHİRBAZIN BAŞINA ÇEKİLİYOR. Sonuç yalnızca bellekte; sayfa
       * yenilenirse "Hesaplar" adımı boş bir seçimle açılır ve oradan
       * "Kurulumu tamamla" AYNI workspace'i ikinci kez kurardı.
       */
      window.history.replaceState(null, '', '/kurulum');
      setAktif('bitti');
    } catch (e) {
      setHata(hataMetni(e, 'Workspace kurulamadı.'));
    } finally {
      setBusy(false);
    }
  }

  async function workspaceeGec(): Promise<void> {
    if (!sonuc) return;
    setBusy(true);
    try {
      await apiFetch('/auth/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId: sonuc.clientId }),
      });
      window.location.assign('/dashboard');
    } catch (e) {
      setHata(hataMetni(e, 'Workspace’e geçilemedi.'));
      setBusy(false);
    }
  }

  // ─── Adımlar ───

  const ustHesapGecerli = ustHesapAdi.trim().length >= 2;
  const sirketGecerli = !baglam.platformAdmin && tur === 'ust-hesap' ? true : sirketAdi.trim().length >= 2;
  const wsGecerli = wsAdi.trim().length >= 2;

  const icerik: Record<AdimKodu, AdimTanimi> = {
    'ust-hesap': {
      baslik: 'Üst hesabın adı ne olsun?',
      alt: 'Üst hesap ajansın kendisi. Altında birden çok şirketi tek girişle yönetirsin.',
      eksik: ustHesapGecerli ? null : 'Üst hesap adını yaz',
      dugme: 'Devam',
      eylem: () => {
        // İLK ŞİRKET ÇOĞU ZAMAN ÜST HESAPLA AYNI ADI TAŞIYOR (müşteri tek
        // firmaysa). Boş bir alan bırakmak, bilinen bir cevabı yeniden
        // yazdırmak olurdu; kullanıcı değiştirebilir.
        if (sirketAdi.trim() === '') setSirketAdi(ustHesapAdi.trim());
        adimaGec('sirket');
      },
      govde: (
        <div className="space-y-5">
          <Alan
            etiket="Üst hesap adı"
            deger={ustHesapAdi}
            onChange={setUstHesapAdi}
            ornek="Örn. Yılmaz Danışmanlık"
            autoFocus
          />
          {baglam.platformAdmin ? (
            <PaketSecici deger={paket} onChange={setPaket} disabled={busy} />
          ) : (
            <Bilgi>
              Şu anki şirketin <strong>{baglam.sirketAdi}</strong> bu üst hesabın ilk şirketi olur.
            </Bilgi>
          )}
        </div>
      ),
    },
    sirket: {
      baslik: tur === 'ust-hesap' ? 'İlk şirket hangisi?' : 'Yeni şirketin adı ne?',
      alt: 'Şirket, reklamı verilen firma. Kendi platform bağlantıları ve workspace’leri olur.',
      eksik: sirketGecerli ? null : 'Şirket adını yaz',
      dugme: tur === 'ust-hesap' ? 'Üst hesabı kur' : 'Şirketi kur',
      eylem: () => void (tur === 'ust-hesap' ? ustHesapKur() : sirketKur()),
      govde:
        tur === 'ust-hesap' && !baglam.platformAdmin ? (
          <Bilgi>
            İlk şirket <strong>{baglam.sirketAdi}</strong>. Kurulunca yanına yeni şirketler
            ekleyebilirsin.
          </Bilgi>
        ) : (
          <div className="space-y-3">
            <Alan
              etiket="Şirket adı"
              deger={sirketAdi}
              onChange={setSirketAdi}
              ornek="Örn. Yılmaz Mobilya A.Ş."
              autoFocus
            />
            {tur === 'sirket' && baglam.ustHesapAdi && (
              <p className="text-xs text-ink-muted">
                <strong className="text-ink">{baglam.ustHesapAdi}</strong> altına açılır.
              </p>
            )}
          </div>
        ),
    },
    baglantilar: {
      baslik: 'Reklam platformlarını bağla',
      alt: `${baglam.sirketAdi} için. Reklam hesapları ve sayfalar buradan gelir.`,
      eksik: null,
      dugme: PLATFORMS.some((p) => platformDurumu(p, uygunluk, baglantilar).durum === 'bagli')
        ? 'Devam'
        : 'Bağlamadan devam et',
      eylem: () => adimaGec(sonraki()),
      govde: (
        <PlatformAdimi
          tur={tur}
          uygunluk={uygunluk}
          baglantilar={baglantilar}
          yonetebilir={baglam.baglantiYonetebilir}
          yuklemeHatasi={yuklemeHatasi}
          onHata={setHata}
          onYenile={() => startTransition(() => router.refresh())}
          yenileniyor={isPending}
        />
      ),
    },
    workspace: {
      baslik: 'Workspace bilgileri',
      alt: 'Workspace, firmanın bir markası ya da projesi. Raporlar ve reklamlar burada tutulur.',
      eksik: wsGecerli ? null : 'Workspace adını yaz',
      dugme: 'Devam',
      eylem: () => adimaGec('hesaplar'),
      govde: (
        <div className="space-y-5">
          <Alan
            etiket="Workspace adı"
            deger={wsAdi}
            onChange={setWsAdi}
            ornek="Örn. Mia Yapı"
            autoFocus
          />
          <Alan
            etiket="Web sitesi"
            deger={site}
            onChange={setSite}
            onBlur={() => setSite((s) => siteAdresiDuzelt(s))}
            ornek="miayapi.com"
            ipucu="Yapay zekâ bilgi bankasını bu siteden doldurur."
            tip="url"
          />
          <div>
            <AliciListesiAlani etiket="Rapor alıcıları" degerler={alicilar} onChange={setAlicilar} />
            <p className="mt-1 text-xs text-ink-muted">Raporlar bu adreslere gönderilir.</p>
          </div>
          <OzelKategori secili={kategoriler} onChange={setKategoriler} />
        </div>
      ),
    },
    hesaplar: {
      baslik: 'Hangi hesaplar bu workspace’e ait?',
      alt: 'Seçtiğin hesapların verisi hemen çekilmeye başlar.',
      eksik: boost.durum === 'secilmeli' ? 'Boost hesabını seç' : null,
      dugme: 'Kurulumu tamamla',
      eylem: () => void workspaceKur(),
      govde: (
        <div className="space-y-4">
          <HesapSecimi
            havuzlar={havuzlar}
            secili={secili}
            onDegistir={(id) =>
              setSecili((s) => {
                const n = new Set(s);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
          />
          <BoostHesabi
            karar={boost}
            metaHesaplar={seciliMetaHesaplar}
            secim={boostSecim}
            onSecim={setBoostSecim}
          />
          <MusteriGirisi
            acik={girisAcik}
            onAcik={setGirisAcik}
            deger={giris}
            onChange={setGiris}
          />
        </div>
      ),
    },
    bitti: {
      baslik: sonuc ? `${sonuc.name} hazır` : 'Kurulum tamamlandı',
      alt: 'Son olarak bilgi bankasını doldur. Reklam metinleri buradan beslenir.',
      eksik: null,
      dugme: 'Workspace’e geç',
      eylem: () => void workspaceeGec(),
      govde: sonuc ? (
        <div className="space-y-5">
          <KurulumSonucu sonuc={sonuc} boostSayfaSayisi={boostSayfaSayisi} />
          {site.trim() !== '' ? (
            <AiDoldur clientId={sonuc.clientId} canWrite={baglam.bilgiBankasiYazabilir} />
          ) : (
            <Bilgi>
              Web sitesi girmediğin için bilgi bankası otomatik doldurulamıyor. Sonra{' '}
              <Link
                href="/kutuphane/bilgi-bankasi"
                className="font-medium text-brand-strong hover:underline"
              >
                Bilgi Bankası
              </Link>{' '}
              ekranından elle doldurabilirsin.
            </Bilgi>
          )}
        </div>
      ) : null,
    },
  };

  const adim = icerik[aktif];
  const oncekiAdim = aktifSira > 0 ? adimlar[aktifSira - 1]! : null;
  const geriAcik =
    sonuc === null && oncekiAdim !== null && geriGidilebilir(tur, oncekiAdim) && !busy;

  return (
    <div className="rounded-2xl border border-line bg-surface">
      {/* ═══ RAY ═══ */}
      <nav
        aria-label="Kurulum adımları"
        className="flex items-center gap-1 overflow-x-auto border-b border-line px-3 py-2.5 sm:px-4"
      >
        {adimlar.map((a, i) => {
          const gecti = i < aktifSira;
          const secili = a === aktif;
          /*
           * RAYDAN YALNIZCA GERİYE ve yalnızca bellekteki adımlara gidiliyor.
           * İleri atlamak doğrulamayı (ad, boost hesabı) atlatırdı; sunucuya
           * yazılmış bir adıma dönmek ise onu ikinci kez kurdururdu.
           */
          const gidilebilir = gecti && sonuc === null && geriGidilebilir(tur, a) && !busy;
          return (
            <button
              key={a}
              type="button"
              onClick={() => gidilebilir && adimaGec(a)}
              disabled={!gidilebilir && !secili}
              aria-current={secili ? 'step' : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                secili
                  ? 'bg-brand text-white'
                  : gidilebilir
                    ? 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
                    : gecti
                      ? 'text-ink-muted'
                      : 'text-ink-muted/50'
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold ${
                  secili
                    ? 'bg-white/25 text-white'
                    : gecti || (sonuc !== null && a !== 'bitti')
                      ? 'bg-ok-soft text-ok-strong'
                      : 'bg-surface-sunken text-ink-muted'
                }`}
              >
                {/* TAMAMLANMIŞ ADIM RENKLE DEĞİL İŞARETLE de anlatılıyor. */}
                {gecti ? '✓' : i + 1}
              </span>
              <span className="whitespace-nowrap">{ADIM_ADLARI[a]}</span>
            </button>
          );
        })}
      </nav>

      {/* ═══ PANEL ═══ */}
      <div className="px-4 py-5 sm:px-6">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Adım {aktifSira + 1} / {adimlar.length}
        </p>
        <h2
          ref={baslikRef}
          tabIndex={-1}
          className="mt-1 text-lg font-semibold text-ink focus-visible:outline-none"
        >
          {adim.baslik}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-ink-muted">{adim.alt}</p>
        <div className="mt-5">{adim.govde}</div>
      </div>

      {/* ═══ EYLEM ÇUBUĞU ═══ */}
      <div className="border-t border-line px-4 py-3 sm:px-6">
        {hata && (
          <p
            role="alert"
            className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong ring-1 ring-inset ring-danger/30"
          >
            {hata}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {aktif === 'bitti' ? (
            <Link
              href="/kurulum?tur=workspace"
              className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface-sunken"
            >
              Bir workspace daha kur
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => oncekiAdim && adimaGec(oncekiAdim)}
              disabled={!geriAcik}
              className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              Geri
            </button>
          )}
          <div className="flex items-center gap-3">
            {/* KAPALI DÜĞMENİN SEBEBİ YANINDA YAZILI. */}
            {adim.eksik && <span className="text-xs text-ink-muted">{adim.eksik}</span>}
            <button
              type="button"
              onClick={adim.eylem}
              disabled={busy || adim.eksik !== null}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy && <Halka />}
              {adim.dugme}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface AdimTanimi {
  baslik: string;
  alt: string;
  /** Doluysa düğme kapalı ve sebep yanında yazıyor. */
  eksik: string | null;
  dugme: string;
  eylem: () => void;
  govde: React.ReactNode;
}

function hataMetni(e: unknown, yedek: string): string {
  // SUNUCUNUN KENDİ CÜMLESİ: "paket sınırı dolu", "zaten bir üst hesaba
  // bağlı" gibi mesajlar kullanıcıya ne yapacağını söylüyor.
  return e instanceof ApiRequestError ? e.message : yedek;
}

// ---------------------------------------------------------------------------
// Platform adımı
// ---------------------------------------------------------------------------

function PlatformAdimi({
  tur,
  uygunluk,
  baglantilar,
  yonetebilir,
  yuklemeHatasi,
  onHata,
  onYenile,
  yenileniyor,
}: {
  tur: KurulumTuru;
  uygunluk: ProviderAvailability[];
  baglantilar: ConnectionSummary[];
  yonetebilir: boolean;
  yuklemeHatasi: string | null;
  onHata: (m: string | null) => void;
  onYenile: () => void;
  yenileniyor: boolean;
}) {
  const [bekleyen, setBekleyen] = useState<string | null>(null);

  async function bagla(platform: Platform, yeniden: boolean): Promise<void> {
    onHata(null);
    setBekleyen(platform);
    try {
      const { authorizeUrl } = await apiFetch<{ authorizeUrl: string }>('/connections/authorize', {
        method: 'POST',
        body: JSON.stringify({
          platform,
          // DÖNÜŞ BU ADIMA: sunucu sonucu `&connection=...` olarak ekliyor
          // (`donusAdresi`) ve banner onu okuyor.
          redirectTo: kurulumAdresi(tur, 'baglantilar'),
          ...(yeniden ? { forceReconsent: true } : {}),
        }),
      });
      // Yönlendirmeyi TARAYICI yapmalı: fetch üzerinden gelen bir 302,
      // platformun izin ekranını görünmez kılar.
      window.location.href = authorizeUrl;
    } catch (e) {
      onHata(hataMetni(e, 'Bağlantı başlatılamadı.'));
      setBekleyen(null);
    }
  }

  /*
   * "HESABIM LİSTEDE YOK" EN SIK SORU. Meta'da yeni eklenen bir reklam
   * hesabı, bağlantı kurulduktan SONRA eklendiyse havuza kendiliğinden
   * düşmüyor; çaresi başka bir ekranda duruyordu.
   */
  async function yenile(baglantiId: string): Promise<void> {
    onHata(null);
    setBekleyen(baglantiId);
    try {
      await apiFetch(`/connections/${baglantiId}/refresh-accounts`, { method: 'POST' });
      onYenile();
    } catch (e) {
      onHata(hataMetni(e, 'Hesaplar yenilenemedi.'));
    } finally {
      setBekleyen(null);
    }
  }

  return (
    <div className="space-y-3">
      <CallbackBanner />

      {yuklemeHatasi && (
        <p
          role="alert"
          className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-strong ring-1 ring-inset ring-danger/30"
        >
          Bağlantılar okunamadı: {yuklemeHatasi}
        </p>
      )}

      <ul className="divide-y divide-line rounded-xl border border-line">
        {PLATFORMS.map((p) => {
          const d = platformDurumu(p, uygunluk, baglantilar);
          const meslul = bekleyen !== null || yenileniyor;
          return (
            <li key={p} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
              <PlatformLogo kind={platformKanali(p)} className="h-6 w-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{PLATFORM_LABELS[p]}</p>
                <p className="truncate text-xs text-ink-muted">
                  {d.durum === 'bagli'
                    ? `Bağlı · ${d.bostaHesap} reklam hesabı, ${d.bostaSayfa} sayfa seçilmeyi bekliyor`
                    : d.durum === 'yeniden'
                      ? 'Bağlantının süresi dolmuş, yeniden bağlanmalı'
                      : d.durum === 'ayarsiz'
                        ? 'Sunucu ayarı eksik. Advetics ekibine bildir.'
                        : 'Bağlı değil'}
                </p>
              </div>

              {d.durum === 'bagli' && (
                <span className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok-strong">
                    ✓ Bağlı
                  </span>
                  {yonetebilir && (
                    <button
                      type="button"
                      onClick={() => void yenile(d.baglanti.id)}
                      disabled={meslul}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-surface-sunken disabled:opacity-40"
                    >
                      {bekleyen === d.baglanti.id && <Halka className="h-3.5 w-3.5" />}
                      Hesapları yenile
                    </button>
                  )}
                </span>
              )}

              {(d.durum === 'yok' || d.durum === 'yeniden') && yonetebilir && (
                <button
                  type="button"
                  onClick={() => void bagla(p, d.durum === 'yeniden')}
                  disabled={meslul}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border border-brand px-3.5 py-2 text-sm font-semibold text-brand-strong transition hover:bg-brand-soft disabled:opacity-40"
                >
                  {bekleyen === p && <Halka />}
                  {d.durum === 'yeniden' ? 'Yeniden bağla' : 'Bağla'}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/*
        YENİ ŞİRKET KENDİ BAĞLANTISINI İSTER — ve bunu yalnızca sistemi kuran
        kişi biliyordu. Kardeş şirketteki Meta bağlantısı burada görünmüyor
        (bağlantı tablosu şirkete göre süzülüyor); söylenmezse kullanıcı
        "Meta zaten bağlıydı" deyip boş bir listeye bakar.
      */}
      <p className="text-xs text-ink-muted">
        {yonetebilir
          ? 'Her şirket kendi bağlantısını kullanır. Aynı Meta ya da Google hesabıyla bağlanman yeterli.'
          : 'Platform bağlamak yönetici işi. Bağlıysa devam edebilirsin.'}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Küçük parçalar
// ---------------------------------------------------------------------------

function Alan({
  etiket,
  deger,
  onChange,
  onBlur,
  ornek,
  ipucu,
  tip = 'text',
  autoFocus,
}: {
  etiket: string;
  deger: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  ornek?: string;
  ipucu?: string;
  tip?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block max-w-lg">
      <span className="text-sm font-medium text-ink">{etiket}</span>
      <input
        type={tip}
        value={deger}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={ornek}
        autoFocus={autoFocus}
        className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 sm:text-sm"
      />
      {ipucu && <span className="mt-1 block text-xs text-ink-muted">{ipucu}</span>}
    </label>
  );
}

function Bilgi({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-prose rounded-lg bg-surface-sunken px-3.5 py-3 text-sm text-ink-muted">
      {children}
    </p>
  );
}

/**
 * META ÖZEL KATEGORİSİ — reklam hesabının değil İŞLETMENİN özelliği.
 *
 * Konut, istihdam ve kredi reklamları düzenlemeye tabi ve beyan edilmeden
 * yayınlanan reklamın cezası HESAP seviyesinde. Eski sihirbaz bunu hiç
 * sormuyordu: alan varsayılan boş kalıyordu ve bir emlak müşterisinin
 * reklamı beyansız çıkıyordu. Bir kez, kurulumda soruluyor; kampanya başına
 * sormak bir gün unutulacağı anlamına gelirdi.
 */
function OzelKategori({
  secili,
  onChange,
}: {
  secili: SpecialAdCategory[];
  onChange: (v: SpecialAdCategory[]) => void;
}) {
  return (
    <fieldset className="max-w-lg">
      <legend className="text-sm font-medium text-ink">
        Bu işletme şu alanlardan birinde mi?
      </legend>
      <p className="mt-0.5 text-xs text-ink-muted">
        Meta bu alanlarda beyan istiyor. Hiçbiri değilse boş bırak.
      </p>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {SPECIAL_AD_CATEGORIES.map((k) => {
          const m = SPECIAL_AD_CATEGORY_META[k];
          const acik = secili.includes(k);
          return (
            <label
              key={k}
              title={m.hint}
              className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                acik ? 'border-brand bg-brand-soft text-ink' : 'border-line text-ink hover:bg-surface-sunken'
              }`}
            >
              <input
                type="checkbox"
                checked={acik}
                onChange={() => onChange(acik ? secili.filter((x) => x !== k) : [...secili, k])}
                className="h-4 w-4 shrink-0 accent-brand"
              />
              {m.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function MusteriGirisi({
  acik,
  onAcik,
  deger,
  onChange,
}: {
  acik: boolean;
  onAcik: (v: boolean) => void;
  deger: { email: string; fullName: string; password: string };
  onChange: (v: { email: string; fullName: string; password: string }) => void;
}) {
  return (
    <section className="rounded-xl border border-line">
      <button
        type="button"
        onClick={() => onAcik(!acik)}
        aria-expanded={acik}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition hover:bg-surface-sunken"
      >
        <span>
          <span className="block text-sm font-medium text-ink">Giriş hesabı aç</span>
          <span className="block text-xs text-ink-muted">
            İsteğe bağlı. Bu hesapla giren kişi yalnızca bu workspace’i görür.
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium text-brand-strong">{acik ? 'Kapat' : 'Aç'}</span>
      </button>
      {acik && (
        <div className="grid gap-3 border-t border-line px-3.5 py-3 sm:grid-cols-3">
          <Alan
            etiket="E-posta"
            tip="email"
            deger={deger.email}
            onChange={(v) => onChange({ ...deger, email: v })}
          />
          <Alan
            etiket="Ad soyad"
            deger={deger.fullName}
            onChange={(v) => onChange({ ...deger, fullName: v })}
          />
          <Alan
            etiket="Parola"
            tip="password"
            deger={deger.password}
            onChange={(v) => onChange({ ...deger, password: v })}
            ipucu="En az 10 karakter"
          />
          {/* PAROLA ELDEN İLETİLİYOR ve bu bir kısıt: davet e-postası
              altyapısı yok. Kullanıcıya söylenmezse parolayı nasıl
              ileteceğini bilemez. */}
          <p className="text-xs text-ink-muted sm:col-span-3">
            Davet e-postası gönderilmiyor. Parolayı sen ileteceksin.
          </p>
        </div>
      )}
    </section>
  );
}
