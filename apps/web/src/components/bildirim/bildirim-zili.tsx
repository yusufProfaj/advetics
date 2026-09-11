'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { platformKanali, type BaglantiDurumu, type Uyari } from '@advetics/shared';
import { PlatformLogo } from '@/components/platform-logo';
import { formatRelative } from '@/lib/format';
import { useBildirimVerisi } from './bildirim-verisi';

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
  const [acik, setAcik] = useState(false);
  const kutuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function disari(e: MouseEvent) {
      if (kutuRef.current && !kutuRef.current.contains(e.target as Node)) setAcik(false);
    }
    function tus(e: KeyboardEvent) {
      if (e.key === 'Escape') setAcik(false);
    }
    document.addEventListener('mousedown', disari);
    document.addEventListener('keydown', tus);
    return () => {
      document.removeEventListener('mousedown', disari);
      document.removeEventListener('keydown', tus);
    };
  }, []);

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

  return (
    <div ref={kutuRef} className="relative">
      <button
        type="button"
        onClick={() => setAcik((v) => !v)}
        aria-expanded={acik}
        aria-haspopup="dialog"
        aria-label={sayac > 0 ? `Bildirimler (${sayac})` : 'Bildirimler'}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface transition hover:bg-surface-muted"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px] text-ink" aria-hidden>
          <path
            d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3-1 4-1.5 4.5h12c-.5-.5-1.5-1.5-1.5-4.5A4.5 4.5 0 0 0 10 3ZM8.5 15a1.5 1.5 0 0 0 3 0"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {sayac > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-[18px] text-white">
            {sayac > 99 ? '99+' : sayac}
          </span>
        )}
      </button>

      {acik && (
        <div
          role="dialog"
          aria-label="Bildirimler"
          className="absolute right-0 top-full z-30 mt-1.5 flex max-h-[32rem] w-[24rem] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          <div className="flex-1 overflow-y-auto">
            <BoostBolumu
              kartlar={bekleyenBoost}
              hata={boostHatasi}
              kapsamDisi={boostKapsamDisi}
              bosSebebi={boostKuyrugu?.emptyReason ?? null}
              istendi={boostKuyrugu !== null}
              onGit={() => setAcik(false)}
            />
            <SorunBolumu
              uyarilar={sorunlar}
              toplam={uyarilar?.toplam ?? 0}
              hata={uyariHatasi}
              yukleniyor={yukleniyor}
              onGit={() => setAcik(false)}
            />
            <DurumBolumu baglantilar={uyarilar?.baglantilar ?? []} onGit={() => setAcik(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function Baslik({ children, sag }: { children: React.ReactNode; sag?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-muted/60 px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
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
  return (
    <section>
      <Baslik
        sag={
          kartlar.length > 0 ? (
            <Link
              href="/auto-boost"
              onClick={onGit}
              className="text-[11px] font-medium text-brand hover:underline"
            >
              Tümünü aç
            </Link>
          ) : undefined
        }
      >
        Onay bekleyen boostlar
      </Baslik>

      {/*
        DÖRT HÂL AYRI AYRI YAZILIYOR: istenmedi / kapsam dışı / hata / boş.
        Dördünü aynı boş alana çevirmek bu depodaki en sık hata deseni —
        kullanıcı bekleyen bir onayı "yok" sanarak kaçırır.
      */}
      {hata !== null ? (
        <BosSatir>Boost kuyruğu alınamadı ({hata}).</BosSatir>
      ) : kapsamDisi ? (
        <BosSatir>
          Boost kuyruğu workspace bazlı. Üstteki seçiciden bir workspace seçtiğinde onay
          bekleyen gönderiler burada görünür.
        </BosSatir>
      ) : !istendi ? (
        <BosSatir>Yükleniyor…</BosSatir>
      ) : kartlar.length === 0 ? (
        <BosSatir>{bosSebebi ?? 'Onay bekleyen gönderi yok.'}</BosSatir>
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
                    {k.title ?? 'Başlıksız gönderi'}
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
              {kartlar.length} gönderiden 5 tanesi gösteriliyor.
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
  return (
    <section>
      <Baslik>Sorunlar</Baslik>
      {hata !== null ? (
        <BosSatir>Uyarılar alınamadı ({hata}). Panelin geri kalanı çalışmaya devam ediyor.</BosSatir>
      ) : yukleniyor ? (
        <BosSatir>Yükleniyor…</BosSatir>
      ) : uyarilar.length === 0 ? (
        <BosSatir>Açık bir sorun yok.</BosSatir>
      ) : (
        <ul>
          {uyarilar.map((u) => (
            <li key={`${u.kod}:${u.adAccountId ?? u.clientId ?? '-'}`} className="px-3 py-2">
              <div className="flex items-start gap-2">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    u.siddet === 'error' ? 'bg-red-500' : 'bg-amber-500'
                  }`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{u.baslik}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">
                    {u.clientName ?? 'Ajans geneli'}
                    {/* BAYATLIK GÖRÜNÜR: tarihi göstermeyen bir uyarı,
                        düzeltilmiş bir sorunu haftalarca ekranda tutar. */}
                    {u.veriZamani !== null && ` · ${formatRelative(u.veriZamani)}`}
                  </p>
                  {u.eylem !== null && (
                    <Link
                      href={u.eylem.href}
                      onClick={onGit}
                      className="mt-1 inline-block text-[11px] font-medium text-brand hover:underline"
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
              {toplam} sorundan {uyarilar.length} tanesi gösteriliyor.
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
  return (
    <section>
      <Baslik
        sag={
          <Link
            href="/ayarlar/baglantilar"
            onClick={onGit}
            className="text-[11px] font-medium text-brand hover:underline"
          >
            Bağlantılar
          </Link>
        }
      >
        Yetkilendirme durumu
      </Baslik>
      {baglantilar.length === 0 ? (
        <BosSatir>Bu kapsamda hesabı atanmış bir platform bağlantısı yok.</BosSatir>
      ) : (
        <ul className="pb-1">
          {baglantilar.map((b) => (
            <li key={b.id} className="flex items-center gap-2.5 px-3 py-1.5">
              <PlatformLogo kind={platformKanali(b.platform)} className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs">
                {b.etiket ?? b.platform}
                <span className="text-ink-muted"> · {b.etkilenenHesap} hesap</span>
              </span>
              <span className={`shrink-0 text-[11px] font-medium ${renk(b)}`}>{sureMetni(b)}</span>
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
export function sureMetni(b: Pick<BaglantiDurumu, 'durum' | 'kalanGun'>): string {
  if (b.durum !== 'active') return 'yetki gerekiyor';
  if (b.kalanGun === null) return 'otomatik';
  if (b.kalanGun < 0) return `${Math.abs(b.kalanGun)} gün önce doldu`;
  if (b.kalanGun === 0) return 'bugün doluyor';
  return `${b.kalanGun} gün`;
}

/** Eşikler `uyari-kurallari.ts` içindeki `TOKEN_UYARI_GUNU` ile aynı fikirde. */
function renk(b: BaglantiDurumu): string {
  if (b.durum !== 'active') return 'text-red-600';
  if (b.kalanGun !== null && b.kalanGun <= 0) return 'text-red-600';
  if (b.kalanGun !== null && b.kalanGun <= 7) return 'text-amber-600';
  return 'text-ink-muted';
}
