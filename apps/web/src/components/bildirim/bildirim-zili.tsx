'use client';

import Link from 'next/link';
import { platformKanali, type BaglantiDurumu, type Uyari } from '@advetics/shared';
import { PlatformLogo } from '@/components/platform-logo';
import { formatRelative } from '@/lib/format';
import { platformBaglantilariAdresi } from '@/lib/panel-adresleri';
import { useBildirimVerisi } from './bildirim-verisi';
import { AcilirMenu, IKON_TETIK, useAcilirMenuKapat } from '@/components/ui/acilir-menu';
import { Ikon } from '@/components/ui/ikon';
import { SayiRozeti } from '@/components/ui/rozet';
import { useDil, useSozluk } from '@/dil/saglayici';
import { bildirimSozlugu } from '@/dil/sozlukler/bildirim';
import { genelBakisSozlugu } from '@/dil/sozlukler/genel-bakis';
import { uyariMetni } from '@/components/uyari-bandi';
import { sec, type Dil } from '@advetics/shared';

/**
 * ═══ BİLDİRİM PANELİ ═══
 *
 * Panelden önce iki ayrı yüzey vardı ve ikisi de eksikti:
 *   · ÜST BANT her şeyi gösteriyordu — "ödeme sorunu" ile "yetki 6 gün
 *     sonra doluyor" aynı kırmızılıkta. Aciliyet ayrımı kaybolunca bant
 *     okunmaz hâle geliyordu.
 *   · BOOST ONAY KUYRUĞU yalnızca `/auto-boost` sayfasındaydı. Kullanıcı o
 *     sayfaya bir onay beklediğini ZATEN bildiğinde giriyor — yani kuyruk
 *     işe yarayacağı anda görünmüyordu. Kullanıcının isteği birebir buydu:
 *     *"hangi şirketteysem ya da ekrandaysam bu bildirim panelinde boostun
 *     da ön planda olması gerekicek."*
 *
 * ÜÇ BÖLÜM, AZALAN ACİLİYET DEĞİL AZALAN EYLEMLİLİK:
 *   1. ONAY BEKLEYEN BOOSTLAR — en üstte. Tek "yapılacak iş" türü bu;
 *      diğerleri bir DURUM bildiriyor.
 *   2. SORUNLAR — `/alerts` çıktısının tamamı (bant yalnızca acil olanı
 *      gösteriyor, panel hepsini).
 *   3. DURUM — yetkilendirme süreleri. UYARI DEĞİL: kaç gün kaldığı sorun
 *      hâline gelmeden önce bakılabilen bir bilgi ve bildirim olarak
 *      dürtmemesi gerekiyor. Kullanıcının cümlesi: *"kaç gün süresi
 *      olduğunu ayrı bir yerde göstermen lazım."*
 */
export function BildirimZili() {
  const { uyarilar, uyariHatasi, boostKuyrugu, boostHatasi, boostKapsamDisi, yukleniyor } =
    useBildirimVerisi();

  const bekleyenBoost = boostKuyrugu?.items.filter((i) => i.status === 'pending') ?? [];
  const sorunlar = uyarilar?.uyarilar ?? [];

  /*
   * ROZET EYLEM GEREKTİREN İŞİ SAYIYOR — her satırı değil.
   *
   * "Durum" bölümü sayıma girmiyor: yetkinin 47 gün sonra dolacağı bir
   * yapılacak iş değil ve rozette görünmesi, kullanıcıyı hiçbir zaman
   * sıfırlanmayan bir sayıya alıştırırdı. Bu depoda "481 hesap izlenmiyor"
   * sayacıyla aynı hata.
   */
  const sayac = bekleyenBoost.length + sorunlar.length;
  const z = useSozluk(bildirimSozlugu).zil;

  /*
   * TEK AÇILIR MENÜ BİLEŞENİ (menü kararı 2026-10-14): panel DOM'da kalıyor,
   * Esc ve dışarı tıklama kapatıyor, hareket azaltılmışsa geçiş yok. Önce
   * kendi `mousedown`/`keydown` dinleyicilerini taşıyordu ve koşullu render
   * ediliyordu. Tetik üst çubuğun yuvarlak ikon düğmesi; sayı varsa kırmızı
   * NOKTA değil sayı (kaç iş beklediği bilgi).
   */
  return (
    <AcilirMenu
      etiket={z.etiket}
      rol="dialog"
      hizala="sag"
      genislik="w-[24rem]"
      tetik={({ acik: _acik, ...o }) => (
        <button
          type="button"
          {...o}
          aria-label={sayac > 0 ? z.etiketSayili(sayac) : z.etiket}
          className={IKON_TETIK}
        >
          <Ikon ad="zil" />
          {sayac > 0 && <SayiRozeti sayi={sayac} className="absolute -right-0.5 -top-0.5 ring-2 ring-surface" />}
        </button>
      )}
    >
      <ZilIcerigi
        bekleyenBoost={bekleyenBoost}
        boostHatasi={boostHatasi}
        boostKapsamDisi={boostKapsamDisi}
        bosSebebi={boostKuyrugu?.emptyReason ?? null}
        istendi={boostKuyrugu !== null}
        sorunlar={sorunlar}
        toplam={uyarilar?.toplam ?? 0}
        uyariHatasi={uyariHatasi}
        yukleniyor={yukleniyor}
        baglantilar={uyarilar?.baglantilar ?? []}
      />
    </AcilirMenu>
  );
}

/** Panelin içi: bağlantıya basınca menüyü kapatan `kapat` bağlamdan geliyor. */
function ZilIcerigi(p: {
  bekleyenBoost: Array<{ id: string; title: string | null; clientName: string; platform: string }>;
  boostHatasi: string | null;
  boostKapsamDisi: boolean;
  bosSebebi: string | null;
  istendi: boolean;
  sorunlar: Uyari[];
  toplam: number;
  uyariHatasi: string | null;
  yukleniyor: boolean;
  baglantilar: BaglantiDurumu[];
}) {
  const kapat = useAcilirMenuKapat();
  return (
    <div className="-m-1.5 max-h-[32rem] overflow-y-auto rounded-[14px]">
      <BoostBolumu
        kartlar={p.bekleyenBoost}
        hata={p.boostHatasi}
        kapsamDisi={p.boostKapsamDisi}
        bosSebebi={p.bosSebebi}
        istendi={p.istendi}
        onGit={kapat}
      />
      <SorunBolumu
        uyarilar={p.sorunlar}
        toplam={p.toplam}
        hata={p.uyariHatasi}
        yukleniyor={p.yukleniyor}
        onGit={kapat}
      />
      <DurumBolumu baglantilar={p.baglantilar} onGit={kapat} />
    </div>
  );
}

function Baslik({ children, sag }: { children: React.ReactNode; sag?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line px-3 pb-1.5 pt-2.5">
      <span className="text-11 font-bold uppercase tracking-[0.08em] text-ink-soluk">
        {children}
      </span>
      {sag}
    </div>
  );
}

/** Boş bir bölümün NEDEN boş olduğu — bu projede zorunlu. */
function BosSatir({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-3 text-xs leading-snug text-ink-muted">{children}</p>;
}

function BoostBolumu({
  kartlar,
  hata,
  kapsamDisi,
  bosSebebi,
  istendi,
  onGit,
}: {
  kartlar: Array<{ id: string; title: string | null; clientName: string; platform: string }>;
  hata: string | null;
  kapsamDisi: boolean;
  bosSebebi: string | null;
  istendi: boolean;
  onGit: () => void;
}) {
  const z = useSozluk(bildirimSozlugu).zil;
  return (
    <section>
      <Baslik
        sag={
          kartlar.length > 0 ? (
            <Link
              href="/auto-boost"
              onClick={onGit}
              className="text-[11px] font-medium text-brand-strong hover:underline"
            >
              {z.tumunuAc}
            </Link>
          ) : undefined
        }
      >
        {z.onayBekleyen}
      </Baslik>

      {/*
        DÖRT HÂL AYRI AYRI YAZILIYOR: istenmedi / kapsam dışı / hata / boş.
        Dördünü aynı boş alana çevirmek bu depodaki en sık hata deseni —
        kullanıcı bekleyen bir onayı "yok" sanarak kaçırır.
      */}
      {hata !== null ? (
        <BosSatir>{z.boostAlinamadi(hata)}</BosSatir>
      ) : kapsamDisi ? (
        <BosSatir>{z.boostKapsamDisi}</BosSatir>
      ) : !istendi ? (
        <BosSatir>{z.yukleniyor}</BosSatir>
      ) : kartlar.length === 0 ? (
        <BosSatir>{bosSebebi ?? z.onayBekleyenYok}</BosSatir>
      ) : (
        <ul>
          {kartlar.slice(0, 5).map((k) => (
            <li key={k.id}>
              <Link
                href="/auto-boost"
                onClick={onGit}
                className="flex items-center gap-2.5 px-3 py-2 transition hover:bg-surface-muted"
              >
                {/* Boost kartı `instagram` ya da `youtube` — reklam
                    platformu değil KANAL. `platformKanali` reklam
                    platformundan kanala çeviriyor; buradaki yön tersi. */}
                <PlatformLogo
                  kind={k.platform === 'youtube' ? 'youtube' : 'instagram'}
                  className="h-4 w-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm leading-tight">
                    {k.title ?? z.basliksiz}
                  </span>
                  <span className="block truncate text-[11px] leading-tight text-ink-muted">
                    {k.clientName}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {kartlar.length > 5 && (
            // SESSİZ KESME YOK.
            <li className="px-3 py-1.5 text-[11px] text-ink-muted">
              {z.gonderiKesme(kartlar.length)}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function SorunBolumu({
  uyarilar,
  toplam,
  hata,
  yukleniyor,
  onGit,
}: {
  uyarilar: Uyari[];
  toplam: number;
  hata: string | null;
  yukleniyor: boolean;
  onGit: () => void;
}) {
  const gb = useSozluk(genelBakisSozlugu).uyari;
  const z = useSozluk(bildirimSozlugu).zil;
  const { dil } = useDil();
  return (
    <section>
      <Baslik>{z.sorunlar}</Baslik>
      {hata !== null ? (
        <BosSatir>{z.uyariAlinamadi(hata)}</BosSatir>
      ) : yukleniyor ? (
        <BosSatir>{z.yukleniyor}</BosSatir>
      ) : uyarilar.length === 0 ? (
        <BosSatir>{z.sorunYok}</BosSatir>
      ) : (
        <ul>
          {uyarilar.map((u) => (
            <li key={`${u.kod}:${u.adAccountId ?? u.clientId ?? '-'}`} className="px-3 py-2">
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    u.siddet === 'error' ? 'bg-danger' : 'bg-warn'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  {/* Ödeme uyarısı sözlükten (iki dil); bantla aynı yardımcı. */}
                  <p className="text-sm font-medium leading-tight">{uyariMetni(u, gb).baslik}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
                    {u.clientName ?? z.ajansGeneli}
                    {/* BAYATLIK GÖRÜNÜR: tarihi göstermeyen bir uyarı,
                        düzeltilmiş bir sorunu haftalarca ekranda tutar. */}
                    {u.veriZamani !== null && ` · ${formatRelative(u.veriZamani, dil)}`}
                  </p>
                  {u.odemeAdresi && (
                    <a
                      href={u.odemeAdresi}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={gb.odeme.yeniSekme}
                      className="mt-1 inline-block text-[11px] font-medium text-brand-strong hover:underline"
                    >
                      {u.platform === 'meta' ? gb.odeme.eylemMeta : gb.odeme.eylemGoogle} ↗
                    </a>
                  )}
                  {u.eylem !== null && (
                    <Link
                      href={u.eylem.href}
                      onClick={onGit}
                      className="mt-1 inline-block text-[11px] font-medium text-brand-strong hover:underline"
                    >
                      {u.eylem.etiket}
                    </Link>
                  )}
                </div>
              </div>
            </li>
          ))}
          {toplam > uyarilar.length && (
            <li className="px-3 py-1.5 text-[11px] text-ink-muted">
              {z.sorunKesme(toplam, uyarilar.length)}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * ═══ DURUM — BİLDİRİM DEĞİL ═══
 *
 * Yetkinin kaç gün sonra dolacağı bir SORUN değil. Uyarı listesine koymak
 * her gün "yeniden yetkilendir" diye dürtmek demekti ve kullanıcının
 * bildirdiği arıza tam olarak buydu.
 *
 * Burada sessiz duruyor: merak eden bakıyor, kimse dürtülmüyor. Rozet
 * sayımına da girmiyor.
 */
function DurumBolumu({
  baglantilar,
  onGit,
}: {
  baglantilar: BaglantiDurumu[];
  onGit: () => void;
}) {
  const z = useSozluk(bildirimSozlugu).zil;
  const { dil } = useDil();
  return (
    <section>
      <Baslik
        sag={
          <Link
            href={platformBaglantilariAdresi()}
            onClick={onGit}
            className="text-[11px] font-medium text-brand-strong hover:underline"
          >
            {z.baglantilar}
          </Link>
        }
      >
        {z.yetkiDurumu}
      </Baslik>
      {baglantilar.length === 0 ? (
        <BosSatir>{z.baglantiYok}</BosSatir>
      ) : (
        <ul className="pb-1">
          {baglantilar.map((b) => (
            <li key={b.id} className="flex items-center gap-2.5 px-3 py-1.5">
              <PlatformLogo kind={platformKanali(b.platform)} className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs">
                {b.etiket ?? b.platform}
                <span className="text-ink-muted"> · {z.hesapSayisi(b.etkilenenHesap)}</span>
              </span>
              <span className={`shrink-0 text-[11px] font-medium ${renk(b)}`}>{sureMetni(b, dil)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Kalan süre metni.
 *
 * `null` = platform bir son tarih bildirmiyor (Google'da refresh token
 * süresiz). "Süresiz" YAZILMIYOR, "otomatik" yazılıyor: ilkini okuyan
 * "hiç dokunmam gerekmeyecek" diye anlıyor, oysa iptal edilen bir yetki
 * her platformda mümkün.
 */
export function sureMetni(b: Pick<BaglantiDurumu, 'durum' | 'kalanGun'>, dil: Dil = 'tr'): string {
  const z = sec(bildirimSozlugu, dil).zil;
  if (b.durum !== 'active') return z.yetkiGerekiyor;
  if (b.kalanGun === null) return z.otomatik;
  if (b.kalanGun < 0) return z.dolduGunOnce(Math.abs(b.kalanGun));
  if (b.kalanGun === 0) return z.bugunDoluyor;
  return z.gunKaldi(b.kalanGun);
}

/** Eşikler `uyari-kurallari.ts` içindeki `TOKEN_UYARI_GUNU` ile aynı fikirde. */
function renk(b: BaglantiDurumu): string {
  if (b.durum !== 'active') return 'text-danger-strong';
  if (b.kalanGun !== null && b.kalanGun <= 0) return 'text-danger-strong';
  if (b.kalanGun !== null && b.kalanGun <= 7) return 'text-warn-strong';
  return 'text-ink-muted';
}
