'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PAKET_SINIRLARI, TUM_SIRKETLER, type ManagerPaket } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { gecisHedefi } from '@/lib/kapsam-hedefi';
import { Halka, TamEkranYukleniyor } from './yukleniyor';

export interface KapsamSirketi {
  id: string;
  name: string;
  workspaces: Array<{ id: string; name: string }>;
}

export interface KapsamUstHesabi {
  id: string;
  name: string;
  paket: ManagerPaket;
  sirketSayisi: number;
}

/**
 * ═══ TEK SEÇİCİ — ÜST HESAP › AJANS › ŞİRKET › WORKSPACE ═══
 *
 * ┌─ ÜST BARDA ARTIK TEK KUTU VAR ────────────────────────────────────────┐
 * │ Solda ayrı bir `UstHesapSecici` duruyordu ve gerekçesi "ikisi ayrı     │
 * │ katman"dı. Katman ayrı, ama kullanıcı için ikisi de AYNI SORUNUN       │
 * │ cevabı: neredeyim. Yan yana iki açılır kutu, ikinci bir arama kutusu   │
 * │ ve "hangisine yazayım" sorusu demekti; kullanıcının tarifi birebir     │
 * │ *"üst hesap ikinci bir search barda görünüyor, bu da kafa karıştırıcı"*│
 * │ idi. Referans Google Ads'in hesap seçicisi: TEK kutu, TEK arama, ağaç  │
 * │ olarak inen seviyeler.                                                 │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * ═══ DİĞER ÜST HESAPLARIN ŞİRKETLERİ BU AĞAÇTA YOK ═══
 *
 * Ve bu bir eksiklik değil, bir SINIR: o şirketlerin listesi aktif üst
 * hesabın ağacında (`/manager-account`) bulunmuyor, çünkü ağaç bir seferde
 * TEK hesabı okuyor. Başka bir hesabın satırına tıklamak o hesaba GEÇİRİYOR
 * ve ağaç oradan dolduruyor — tek istek, yarım durum yok.
 *
 * Aramanın bunu SÖYLEMESİ zorunlu: arama kutusuna yazılan bir şirket adı
 * başka bir üst hesaptaysa sonuç boş çıkar ve sessiz boş liste bu depoda
 * yasak. Alttaki sayaç satırı aramanın hangi ağaçta yapıldığını yazıyor.
 *
 * Önce İKİ seçici vardı (şirket ve workspace) ve aralarında bir `›` işareti.
 * İkisi aynı ağacın farklı seviyeleri: ayrı kutulara koymak, kullanıcının
 * "hangisi hangisini kapsıyor" sorusunu ekrandan değil KAFASINDAN cevaplaması
 * demekti — ve bir seviye atlamak (ajanstan doğrudan bir workspace'e) iki
 * ayrı tıklama gerektiriyordu.
 *
 * ÜÇ SEVİYE, ÜÇ TIKLANABİLİR SATIR TÜRÜ:
 *   · AJANS   → üst hesabın altındaki HER şirket tek pencerede
 *   · ŞİRKET  → o şirketin geneli (bütün workspace'leri)
 *   · WORKSPACE → tek workspace
 *
 * Her satır TEK BİR isteğe dönüşüyor; sunucu gerekli cookie'leri kendisi
 * ayarlıyor (workspace seçmek şirketi de değiştiriyor). İstemcide iki çağrı
 * zincirlemek, birincisi başarılı ikincisi başarısız olduğunda yarım bir
 * duruma düşmek demekti.
 *
 * ═══ 49 ŞİRKETTE ÇÖKEN İLK TASARIM ═══
 *
 * İlk hâl her şirketin workspace'lerini AÇIK basıyordu ve workspace'i
 * olmayan her şirkete iki satırlık gri bir açıklama koyuyordu. Beş şirkette
 * hoş, kırk dokuzda birkaç yüz satırlık bir duvar: kullanıcının tarifi
 * *"kullanışsız ve komplike"*. Üç karar bundan çıktı:
 *
 *   1. WORKSPACE'LER KAPALI GELİYOR (aktif şirket hariç). Ağacın ikinci
 *      seviyesi istendiğinde açılıyor; ok TIKLANABİLİR AMA AYRI — şirket
 *      adına basmak hâlâ o şirkete GEÇİYOR. Aynı düğmeye iki iş yüklemek
 *      ("bazen açar bazen geçer") en sinsi arayüz hatası.
 *   2. AKTİF ŞİRKET LİSTENİN BAŞINDA. Alfabetik bir listede nerede
 *      olduğunu bulmak için kaydırmak, "neredeyim" sorusunu ekrandan değil
 *      kaydırma çubuğundan cevaplamaktı.
 *   3. SAYI YAZIYOR. Arama süzdüğünde "49 şirketten 6 tanesi" görünüyor;
 *      sessiz kesme bu projede yasak (CLAUDE.md).
 */
export function KapsamSecici({
  ajans,
  sirketler,
  aktifSirketId,
  aktifWorkspaceId,
  tumSirketler,
  yonetimGorunur,
  ustHesaplar,
  aktifUstHesapId,
}: {
  /** Üst hesap adı — yoksa `null` (bağımsız şirket). */
  ajans: string | null;
  sirketler: KapsamSirketi[];
  aktifSirketId: string;
  aktifWorkspaceId: string | null;
  tumSirketler: boolean;
  /** "Yönetim paneli" bağlantısı — `org.write` yoksa basılmıyor. */
  yonetimGorunur: boolean;
  /**
   * Geçilebilecek ÜST HESAPLAR (oturumdan). Tek elemanlıysa ağacın o
   * seviyesi hiç çizilmiyor: geçilecek yer yokken bir bölüm başlığı,
   * kullanıcıyı olmayan bir özelliği aramaya gönderir.
   */
  ustHesaplar: KapsamUstHesabi[];
  aktifUstHesapId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [gecilen, setGecilen] = useState<string | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [arama, setArama] = useState('');
  /*
   * AÇIK ŞİRKETLER — AKTİF OLAN BAŞLANGIÇTA AÇIK.
   *
   * Kullanıcı bulunduğu şirketin workspace'lerini görmek için fazladan bir
   * tık atmamalı; orası zaten "neredeyim" sorusunun cevabı.
   */
  const [acikSirketler, setAcikSirketler] = useState<ReadonlySet<string>>(
    () => new Set(tumSirketler ? [] : [aktifSirketId]),
  );
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function disari(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', disari);
    return () => document.removeEventListener('mousedown', disari);
  }, []);

  const aktifSirket = sirketler.find((s) => s.id === aktifSirketId) ?? null;
  const aktifWorkspace = aktifSirket?.workspaces.find((w) => w.id === aktifWorkspaceId) ?? null;
  const bekliyor = pending || isPending;

  /*
   * ARAMA BÜTÜN AĞAÇTA. Kullanıcı bir workspace adı yazıyor ve onun hangi
   * şirkette olduğunu BİLMEK ZORUNDA DEĞİL — zaten aradığı şey o.
   * Eşleşen workspace'i olan şirket, kendi adı eşleşmese bile listede
   * kalıyor; yoksa sonuç "bulunamadı" gibi görünürdü.
   *
   * Türkçe küçültme AÇIKÇA veriliyor: varsayılanda "İ" → "i̇" oluyor ve
   * "İkon" araması "ikon" ile eşleşmiyor.
   */
  const suzulmus = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr');
    if (!q) return sirketler;
    const uyar = (m: string) => m.toLocaleLowerCase('tr').includes(q);
    return sirketler
      .map((s) => (uyar(s.name) ? s : { ...s, workspaces: s.workspaces.filter((w) => uyar(w.name)) }))
      .filter((s) => uyar(s.name) || s.workspaces.length > 0);
  }, [sirketler, arama]);

  /*
   * DİĞER ÜST HESAPLAR — aktif olan listede YOK.
   *
   * Aktif hesap zaten ağacın kökü: adı en üstteki "tüm şirketler" satırında
   * ve altındaki her şirket görünüyor. Bir de aşağıda tekrar listelemek,
   * aynı hesabı iki kez göstermek ve "bu ikisi farklı mı" sorusunu açmak
   * olurdu.
   */
  const digerUstHesaplar = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr');
    const digerleri = ustHesaplar.filter((h) => h.id !== aktifUstHesapId);
    if (!q) return digerleri;
    return digerleri.filter((h) => h.name.toLocaleLowerCase('tr').includes(q));
  }, [ustHesaplar, aktifUstHesapId, arama]);

  /*
   * AKTİF ŞİRKET BAŞTA, GERİSİ SIRASIYLA — AMA YALNIZCA ARAMA YOKKEN.
   *
   * Arama sonucunu bölmek, eşleşmeleri iki ayrı yığına dağıtmak demek:
   * kullanıcı yazdığı şeyi arıyor, bulunduğu yeri değil.
   */
  const aramaVar = arama.trim().length > 0;
  const { once, digerleri } = useMemo(() => {
    if (aramaVar || tumSirketler) return { once: [] as KapsamSirketi[], digerleri: suzulmus };
    return {
      once: suzulmus.filter((s) => s.id === aktifSirketId),
      digerleri: suzulmus.filter((s) => s.id !== aktifSirketId),
    };
  }, [suzulmus, aramaVar, tumSirketler, aktifSirketId]);

  async function git(
    etiket: string,
    yol: '/auth/switch-org' | '/auth/switch-client' | '/auth/switch-manager',
    govde: Record<string, string | null>,
    tamSayfa: boolean,
  ) {
    setOpen(false);
    setArama('');
    setPending(true);
    setHata(null);
    setGecilen(etiket);
    try {
      await apiFetch(yol, { method: 'POST', body: JSON.stringify(govde) });
      if (tamSayfa) {
        /*
         * KAPSAM DEĞİŞİNCE TAM SAYFA. Kenar çubuğu, marka renkleri ve
         * bütün sunucu bileşenlerinin verisi değişiyor; istemci
         * bileşenlerinin state'i (açık süzgeçler, seçili hesap kimlikleri)
         * önceki kapsamdan kalırsa anlamsız kimlikler taşıyor ve sessizce
         * boş listeler üretiyor.
         *
         * AMA AYNI SAYFADA KALIYORUZ. Buraya uzun süre `/dashboard` sabiti
         * yazılıydı: kurallar ekranında şirket değiştiren kişi genel bakışa
         * düşüyordu. `gecisHedefi` yalnızca ESKİ KAPSAMIN KİMLİĞİNİ taşıyan
         * yol parçalarını kesiyor.
         */
        const hedef = gecisHedefi(pathname, Object.fromEntries(searchParams?.entries() ?? []));
        startTransition(() => window.location.assign(hedef));
        return;
      }
      // URL'DEKİ `?musteri=` TEMİZLENİYOR: sayfalar aktif workspace'i
      // `params.musteri ?? session.activeClientId` sırasıyla çözüyor, yani
      // URL cookie'yi EZİYOR ve üst bar ile gövde ayrışıyor.
      const kalan = Object.fromEntries(searchParams?.entries() ?? []);
      delete kalan.musteri;
      router.replace(baglanti(pathname, kalan, {}));
      startTransition(() => {
        router.refresh();
        setPending(false);
      });
    } catch (e) {
      // HATA YUTULMUYOR: sessizce eski kapsamda kalmak "tıkladım ama
      // değişmedi" hâli demek (CLAUDE.md).
      setHata(e instanceof ApiRequestError ? e.message : 'Kapsam değiştirilemedi.');
      setPending(false);
      setGecilen(null);
    }
  }

  const ajansaGec = () =>
    void git('Tüm şirketler', '/auth/switch-org', { organizationId: TUM_SIRKETLER }, true);

  /*
   * ÜST HESAP DEĞİŞİMİ HER ZAMAN TAM SAYFA.
   *
   * Yeni hesabın altında eski şirket ve workspace kimlikleri geçersiz
   * (sunucu ikisini de sıfırlıyor). `router.refresh()` ile yetinmek, istemci
   * bileşenlerinin state'inde önceki ağacın kimliklerini bırakmak ve sessizce
   * boş listeler üretmek demekti.
   */
  const ustHesabaGec = (h: KapsamUstHesabi) =>
    void git(h.name, '/auth/switch-manager', { managerAccountId: h.id }, true);

  const sirketeGec = (s: KapsamSirketi) => {
    const buradayiz = s.id === aktifSirketId && !tumSirketler;
    if (buradayiz && !aktifWorkspaceId) {
      /*
       * ZATEN ŞİRKET GENELİNDEYİZ — istek ATILMIYOR.
       *
       * Hiçbir şey değiştirmeyen bir tur, kullanıcıya bir bekleme örtüsü
       * ve sonunda aynı ekranı göstermek demek. Eski workspace seçicideki
       * aynı karar; seviye değişti, gerekçe değişmedi.
       */
      setOpen(false);
      return;
    }
    if (buradayiz) {
      // AYNI ŞİRKET, WORKSPACE SEÇİLİ: geçiş değil, DARALTMAYI KALDIRMA.
      void git(s.name, '/auth/switch-client', { clientId: null }, false);
      return;
    }
    void git(s.name, '/auth/switch-org', { organizationId: s.id }, true);
  };

  const workspaceeGec = (w: { id: string; name: string }, sirketId: string) =>
    void git(
      w.name,
      '/auth/switch-client',
      { clientId: w.id },
      // ŞİRKET DE DEĞİŞİYORSA tam sayfa: kenar çubuğu ve marka değişiyor.
      sirketId !== aktifSirketId || tumSirketler,
    );

  const acKapa = (id: string) =>
    setAcikSirketler((onceki) => {
      const yeni = new Set(onceki);
      if (yeni.has(id)) yeni.delete(id);
      else yeni.add(id);
      return yeni;
    });

  const baslik = tumSirketler
    ? (ajans ?? 'Tüm şirketler')
    : (aktifWorkspace?.name ?? aktifSirket?.name ?? 'Kapsam');
  const altBaslikGovdesi = tumSirketler
    ? `Tüm şirketler · ${sirketler.length} şirket`
    : aktifWorkspace
      ? (aktifSirket?.name ?? 'Workspace')
      : `${aktifSirket?.workspaces.length ?? 0} workspace · şirket geneli`;
  /*
   * BİRDEN ÇOK ÜST HESAPTA AJANS ADI DÜĞMEDE YAZIYOR.
   *
   * Ayrı seçici kaldırılınca "hangi danışmanlığın ağacındayım" sorusunun
   * cevabı ekrandan kalkmıştı: menü kapalıyken yalnızca şirket/workspace
   * adı görünüyordu ve iki farklı üst hesapta aynı adlı şirket olabilir.
   * Yanlış ağaçta iş yapmak, bu seçicinin engellemesi gereken tam o hata.
   *
   * TEK HESAPTA BASILMIYOR: her zaman aynı değeri yazan bir önek, bir
   * bilgi değil bir dekor.
   */
  const altBaslik =
    ajans && ustHesaplar.length > 1 && !tumSirketler
      ? `${ajans} · ${altBaslikGovdesi}`
      : altBaslikGovdesi;

  const sirketDugumu = (s: KapsamSirketi) => (
    <SirketDugumu
      key={s.id}
      sirket={s}
      aktif={!tumSirketler && s.id === aktifSirketId}
      aktifWorkspaceId={aktifWorkspaceId}
      // ARAMADA HEPSİ AÇIK: eşleşen workspace kapalı bir düğümün içinde
      // kalsaydı arama "sonuç yok" gibi görünürdü.
      acik={aramaVar || acikSirketler.has(s.id)}
      okGorunur={!aramaVar}
      onAcKapa={() => acKapa(s.id)}
      onSirket={() => sirketeGec(s)}
      onWorkspace={(w) => workspaceeGec(w, s.id)}
    />
  );

  return (
    <div ref={boxRef} className="relative">
      {bekliyor && <TamEkranYukleniyor mesaj={`${gecilen ?? 'Kapsam'} görünümüne geçiliyor…`} />}

      <button
        type="button"
        onClick={() => {
          setArama('');
          setOpen((v) => !v);
        }}
        disabled={bekliyor}
        aria-expanded={open}
        aria-haspopup="tree"
        className="flex min-w-[15rem] items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2 text-left transition hover:bg-surface-muted disabled:opacity-60"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-[11px] font-semibold uppercase text-white">
          {baslik.slice(0, 2)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium leading-tight">{baslik}</span>
          <span className="block truncate text-[11px] leading-tight text-ink-muted">{altBaslik}</span>
        </span>
        {bekliyor ? (
          <Halka />
        ) : (
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className={`h-4 w-4 shrink-0 text-ink-muted transition ${open ? 'rotate-180' : ''}`}
            aria-hidden
          >
            <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {hata && (
        <p
          role="alert"
          className="absolute left-0 top-full z-30 mt-1 w-max max-w-sm rounded-lg border border-danger/30 bg-danger-soft px-2.5 py-1.5 text-xs text-danger-strong"
        >
          {hata}
        </p>
      )}

      {open && (
        <div
          role="tree"
          className="absolute left-0 top-full z-30 mt-1.5 flex w-[21rem] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          <div className="border-b border-line p-2">
            <input
              autoFocus
              type="search"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              // ESC KAPATIYOR. Klavyeyle açılan bir menüyü yalnızca fareyle
              // kapatılabilir bırakmak, klavye kullanıcısını odak tuzağında
              // bırakmak demekti.
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
              placeholder="Şirket ya da workspace ara…"
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-brand"
            />
          </div>

          {/*
            AJANS SATIRI YALNIZCA ÜST HESAP VARSA. Bağımsız bir şirkette
            "hepsi" ile "o şirket" aynı şey ve aynı sonucu veren iki satır,
            aralarında bir fark varmış gibi düşündürürdü.
          */}
          {ajans && (
            <button
              type="button"
              role="treeitem"
              aria-selected={tumSirketler}
              onClick={ajansaGec}
              className={`flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2 text-left text-sm transition hover:bg-surface-muted ${
                tumSirketler ? 'font-semibold text-brand-strong' : 'text-ink'
              }`}
            >
              <span className="min-w-0 truncate">{ajans}</span>
              <span className="shrink-0 text-[11px] text-ink-muted">
                {tumSirketler ? 'seçili' : 'tüm şirketler'}
              </span>
            </button>
          )}

          <div className="max-h-[24rem] flex-1 overflow-y-auto py-1">
            {suzulmus.length === 0 && digerUstHesaplar.length === 0 ? (
              // BOŞ SONUÇ SEBEBİYLE yazılıyor: sessiz boş liste "hiç yok"
              // ile "arama tutmadı" hâllerini aynı ekrana çeviriyor.
              <p className="px-3 py-4 text-center text-xs text-ink-muted">
                “{arama}” ile eşleşen şirket ya da workspace yok.
              </p>
            ) : (
              <>
                {once.length > 0 && (
                  <>
                    <BolumBasligi>Şu an buradasın</BolumBasligi>
                    {once.map(sirketDugumu)}
                    {digerleri.length > 0 && <BolumBasligi>Diğer şirketler</BolumBasligi>}
                  </>
                )}
                {digerleri.map(sirketDugumu)}

                {/*
                  ═══ AĞACIN EN ÜST SEVİYESİ — DİĞER ÜST HESAPLAR ═══

                  EN ALTTA VE BAŞLIKLI. Şirket satırlarının arasına
                  karışsaydı ayırt edilemezdi: ikisi de "bir isim ve bir
                  sayı" olarak görünüyor ama biri kapsamı DARALTIYOR,
                  diğeri bambaşka bir ağaca GEÇİRİYOR.
                */}
                {digerUstHesaplar.length > 0 && (
                  <>
                    <BolumBasligi>Diğer üst hesaplar</BolumBasligi>
                    {digerUstHesaplar.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        role="treeitem"
                        aria-selected={false}
                        onClick={() => ustHesabaGec(h)}
                        className="flex w-full items-center justify-between gap-2 py-1.5 pl-10 pr-3 text-left text-sm text-ink transition hover:bg-surface-muted"
                      >
                        <span className="min-w-0 truncate">{h.name}</span>
                        {/*
                          PAKET VE ŞİRKET SAYISI SATIRDA: kırk dokuz şirketli
                          bir ajansla tek şirketli bir müşteriyi aynı satırda
                          göstermek, yanlış hesaba girip fark etmemek demekti.
                        */}
                        <span className="shrink-0 text-[11px] text-ink-muted">
                          {PAKET_SINIRLARI[h.paket].etiket} · {h.sirketSayisi} şirket
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {/*
            SAYI HER ZAMAN GÖRÜNÜYOR — SESSİZ KESME YOK.
            Kırk dokuz şirketin altısı listeleniyorsa bunu kaydırma çubuğunun
            uzunluğundan tahmin etmek zorunda kalmamalı.
          */}
          {/*
            ARAMANIN KAPSAMI DA YAZIYOR — VE BU SAYIDAN DAHA ÖNEMLİ.

            Ağaç yalnızca AKTİF üst hesabın şirketlerini taşıyor. Başka bir
            hesaptaki şirketin adını arayan kullanıcı boş sonuç görür ve
            sebebini bilmezse o şirketin SİLİNDİĞİNİ sanar. Cümle yalnızca
            geçilebilecek başka hesap VARKEN basılıyor: tek hesaplı
            kullanıcıya hiçbir zaman görünmeyen bir uyarı, gürültüden başka
            bir şey değil.
          */}
          <p className="border-t border-line px-3 py-1.5 text-[11px] text-ink-muted">
            {aramaVar
              ? `${sirketler.length} şirketten ${suzulmus.length} tanesi gösteriliyor`
              : `${sirketler.length} şirket`}
            {ajans && digerUstHesaplar.length > 0 && (
              <span className="mt-0.5 block">
                {aramaVar
                  ? `Arama ${ajans} ağacında yapıldı. Diğer üst hesapların şirketleri için önce o hesaba geç.`
                  : `${ustHesaplar.length} üst hesap`}
              </span>
            )}
          </p>

          {/*
            MARKA RENGİNDE DOLU VE BEYAZ YAZILI — bir kapsam SEÇMİYOR, yeni
            bir ekran açıyor. Diğer satırlarla aynı görünseydi "bu da bir
            şirket mi" diye okunurdu.

            YETKİSİ OLMAYANA GÖSTERİLMİYOR. Sayfa `org.write` istiyor ve
            yetkisiz kullanıcıyı `/dashboard`a yönlendiriyor: bağlantıyı
            herkese basmak, tıklayınca sebepsizce başka bir ekrana atılan
            bir düğme demekti.
          */}
          {yonetimGorunur && (
            <Link
              href="/ayarlar/ust-hesap"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-t border-line bg-brand px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Yönetim paneli
            </Link>
          )}

          {/*
            "ÜST HESAP AYARLARI" YALNIZCA BİRDEN ÇOK HESAPTA.

            Ayrı seçici kaldırılınca onun altındaki sabit sekme de sahipsiz
            kaldı ve hedefi buraya taşındı. Tek hesaplı kullanıcıya
            basılmıyor: hesaplar ARASINDA çalışan bir ekran (ad, paket, silme,
            yeni hesap) ve geçilecek ikinci bir hesap yokken kenar çubuğundaki
            aynı bağlantının kopyasından ibaret olurdu.
          */}
          {yonetimGorunur && ustHesaplar.length > 1 && (
            <Link
              href="/ayarlar/ust-hesaplar"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 border-t border-line bg-ink px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
                <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Üst hesap ayarları
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function BolumBasligi({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
      {children}
    </p>
  );
}

/**
 * Bir şirket ve (istenirse açılan) workspace'leri.
 *
 * OK AYRI BİR DÜĞME. Şirket adına basmak o şirkete GEÇİYOR, oka basmak
 * yalnızca AÇIYOR. Tek düğmeye iki iş yüklemek ("workspace'i varsa açar,
 * yoksa geçer") kullanıcının her tıklamada sonucu tahmin etmesi demekti.
 */
function SirketDugumu({
  sirket,
  aktif,
  aktifWorkspaceId,
  acik,
  okGorunur,
  onAcKapa,
  onSirket,
  onWorkspace,
}: {
  sirket: KapsamSirketi;
  aktif: boolean;
  aktifWorkspaceId: string | null;
  acik: boolean;
  /** Aramada ağaç zaten açık; oku basmak yalnızca kafa karıştırırdı. */
  okGorunur: boolean;
  onAcKapa: () => void;
  onSirket: () => void;
  onWorkspace: (w: { id: string; name: string }) => void;
}) {
  const workspaceVar = sirket.workspaces.length > 0;
  const sirketGeneli = aktif && aktifWorkspaceId === null;

  return (
    <div>
      <div className={`flex items-center ${aktif ? 'bg-surface-muted/60' : ''}`}>
        {workspaceVar && okGorunur ? (
          <button
            type="button"
            onClick={onAcKapa}
            aria-expanded={acik}
            aria-label={`${sirket.name} workspace’leri`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition hover:bg-surface-muted"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className={`h-3.5 w-3.5 transition ${acik ? 'rotate-90' : ''}`}
              aria-hidden
            >
              <path d="m8 6 4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        ) : (
          <span className="h-7 w-7 shrink-0" aria-hidden />
        )}

        <button
          type="button"
          role="treeitem"
          aria-selected={sirketGeneli}
          onClick={onSirket}
          className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md py-1.5 pr-3 text-left text-sm transition hover:bg-surface-muted ${
            aktif ? 'font-semibold text-brand-strong' : 'text-ink'
          }`}
        >
          <span className="min-w-0 truncate">{sirket.name}</span>
          <span className="shrink-0 text-[11px] font-normal text-ink-muted">
            {sirketGeneli
              ? 'şirket geneli'
              : workspaceVar
                ? `${sirket.workspaces.length} workspace`
                : /*
                     "YOK" DEĞİL "ERİŞİMİN YOK".
                     Liste kullanıcının ERİŞTİĞİ workspace'leri taşıyor;
                     şirkette başkaları olabilir. "Workspace yok" demek,
                     görmediği şeyi var olmayan diye göstermekti.
                   */
                  'erişimin yok'}
          </span>
        </button>
      </div>

      {workspaceVar && acik && (
        <ul>
          {sirket.workspaces.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                role="treeitem"
                aria-selected={w.id === aktifWorkspaceId}
                onClick={() => onWorkspace(w)}
                className={`flex w-full items-center gap-2 py-1.5 pl-10 pr-3 text-left text-sm transition hover:bg-surface-muted ${
                  w.id === aktifWorkspaceId ? 'font-semibold text-brand-strong' : 'text-ink'
                }`}
              >
                <span className="min-w-0 truncate">{w.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
