'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import {
  PLATFORMS,
  SPECIAL_AD_CATEGORIES,
  SPECIAL_AD_CATEGORY_META,
  type ClientSetupResult,
  type ConnectionSummary,
  type ManagerPaket,
  type ProviderAvailability,
  type SirketOlusturmaSonucu,
  type SpecialAdCategory,
} from '@advetics/shared';
import { AliciListesiAlani } from '@/components/alici-listesi-alani';
import { PaketSecici } from '@/components/ust-hesap/ust-hesap-yonetimi';
import { Halka } from '@/components/yukleniyor';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { sihirbazAdresi } from '@/lib/panel-adresleri';
import {
  ADIM_ADLARI,
  ADIMLAR,
  geriGidilebilir,
  kurulumAdresi,
  platformDurumu,
  siteAdresiDuzelt,
  type AdimKodu,
  type KurulumTuru,
} from './kurulum-akisi';
import { KurulumSonucu } from './kurulum-sonucu';
import { PlatformAdimi } from './platform-adimi';

export interface KurulumBaglami {
  platformAdmin: boolean;
  /** Aktif üst hesabın adı — yoksa null. */
  ustHesapAdi: string | null;
  /** Aktif şirketin adı. Üst hesap/şirket kurulduktan sonra YENİ şirket. */
  sirketAdi: string;
  baglantiYonetebilir: boolean;
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
 *   · Meta'nın özel kategorisi (konut, kredi, istihdam) beyan edilmezse
 *     reklam politika ihlali sayılır.
 *
 * İkisi de SESSİZ: hata vermiyor, yalnızca bir şey çalışmıyor. Sihirbaz bu
 * kuralları adımların sırasına gömüyor.
 *
 * ═══ AÇILIŞ YALNIZ AÇAR (kurulum sihirbazı, MIMARI Ç-7) ═══
 *
 *   · Üst hesap ve şirket, platform adımına geçerken kuruluyor ve sayfa
 *     TAM yenileniyor: çerez yeni bağlamı gösteriyor, üst bardaki seçiciler
 *     oturumdan besleniyor ve `router.refresh()` onları tazelemiyor.
 *   · Workspace son adımda TEK çağrıyla (`/clients/setup`, kategori dahil,
 *     `adAccountIds: []`) açılıyor; sonra ona GEÇİLİYOR ve aynı sayfa
 *     tamamlama moduna dönüyor (`sihirbazAdresi`). Hesap, sayfa, boost
 *     hesabı, piksel, ölçüm, bildirim: hepsi oradaki adımlardan, TEK yoldan.
 *     Geçiş HER YAZMADAN ÖNCE: kurulum yazmaları aktif workspace istiyor.
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

  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [hata, setHata] = useState<string | null>(null);
  /*
   * YALNIZ KISMİ BAŞARIDA DOLU. Workspace açıldı ama kategori yazılamadıysa
   * (`failures`) sonuç ekranda kalır ve geçiş kullanıcının tıkıyla olur;
   * sessizce kuruluma geçmek "kuruldu" deyip eksiği gizlerdi.
   */
  const [sonuc, setSonuc] = useState<ClientSetupResult | null>(null);

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
    window.history.replaceState(null, '', kurulumAdresi(tur, hedef));
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
     * İKİNCİ BASIŞ İKİNCİ WORKSPACE AÇMAZ: kısmi başarıda sonuç ekranda ve
     * düğme yalnız GEÇİŞİ yapıyor.
     */
    if (sonuc) return workspaceeGec(sonuc.clientId);
    setBusy(true);
    setHata(null);
    let r: ClientSetupResult;
    try {
      r = await apiFetch<ClientSetupResult>('/clients/setup', {
        method: 'POST',
        body: JSON.stringify({
          name: wsAdi.trim(),
          website: site.trim() === '' ? null : siteAdresiDuzelt(site),
          contactEmails: alicilar,
          specialAdCategories: kategoriler,
          // HESAP ATAMASI KURULUM ADIMLARINDAN (Ç-7): iki atama yolu ayrışırdı.
          adAccountIds: [],
          socialProfileIds: [],
        }),
      });
    } catch (e) {
      setHata(hataMetni(e, 'Workspace kurulamadı.'));
      setBusy(false);
      return;
    }
    /*
     * ADRES SİHİRBAZIN BAŞINA ÇEKİLİYOR: workspace açıldı; geri tuşu ya da
     * yenileme bu formu yeniden açarsa "Devam" AYNI adla ikinci bir
     * workspace açardı.
     */
    window.history.replaceState(null, '', kurulumAdresi(tur, ADIMLAR[tur][0]!));
    if (r.failures.length > 0) {
      setSonuc(r);
      setBusy(false);
      return;
    }
    await workspaceeGec(r.clientId);
  }

  /**
   * YENİ WORKSPACE'E GEÇ, SONRA TAMAMLAMA MODU. Kurulum yazmaları aktif
   * workspace istiyor (`kurulum.service.ts#erisim`); geçmeden açılan
   * tamamlama ekranı her yazmada "önce bu workspace'i seç" derdi.
   * `assign` (tam sayfa): üst bardaki seçiciler oturumdan besleniyor.
   */
  async function workspaceeGec(clientId: string): Promise<void> {
    setBusy(true);
    setHata(null);
    try {
      await apiFetch('/auth/switch-client', {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      });
      window.location.assign(sihirbazAdresi(clientId));
    } catch (e) {
      setHata(`Workspace açıldı ama içine geçilemedi. ${hataMetni(e, '')}`.trim());
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
          redirectTo={kurulumAdresi(tur, 'baglantilar')}
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
      baslik: sonuc ? `${sonuc.name} açıldı` : 'Workspace bilgileri',
      alt: sonuc
        ? 'Bazı adımlar tamamlanamadı; sebepleri aşağıda. Kalanı kurulumda adım adım tamamlanır.'
        : 'Workspace, firmanın bir markası ya da projesi. Hesaplar, ölçüm ve marka bir sonraki ekranda adım adım kurulur.',
      eksik: wsGecerli ? null : 'Workspace adını yaz',
      dugme: sonuc ? 'Kuruluma geç' : 'Workspace’i aç ve kuruluma geç',
      eylem: () => void workspaceKur(),
      govde: sonuc ? (
        <KurulumSonucu sonuc={sonuc} boostSayfaSayisi={0} />
      ) : (
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
                    : gecti
                      ? 'bg-ink text-surface'
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
          <button
            type="button"
            onClick={() => oncekiAdim && adimaGec(oncekiAdim)}
            disabled={!geriAcik}
            className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium text-ink transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          >
            Geri
          </button>
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
