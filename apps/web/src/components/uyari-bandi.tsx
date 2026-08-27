'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Uyari, UyariYaniti } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { PlatformLogo } from '@/components/platform-logo';
import { formatRelative } from '@/lib/format';

/**
 * ═══ UYARI BANDI ═══
 *
 * Panelde "bir şeyler ters" hâllerinin hepsi ayrı ekranlardaydı ve çoğu
 * yalnızca o ekrana girildiğinde görünüyordu: hesabın platformda kapatılmış
 * olması Platform Bağlantıları'nda, senkronizasyonun düşmesi Senkronizasyon
 * ekranında. Kullanıcı o ekranlara ancak bir sorun olduğunu ZATEN bildiğinde
 * giriyor — yani uyarı, işe yarayacağı anda görünmüyordu.
 *
 * İKİ GÖRÜNÜM, TEK VERİ:
 *   · TÜM MÜŞTERİLER — uyarılar KODA GÖRE toplanıyor: "2 hesapta ödeme
 *     sorunu var". Ajans on iki müşteriye bakıyor ve tek tek satır basmak
 *     bandı okunmaz yapardı.
 *   · TEK MÜŞTERİ — uyarılar tek tek, sayfalı (1/3). Burada hangi hesap
 *     olduğu ve ne yapılacağı asıl bilgi.
 *
 * BANT LAYOUT'TA, sayfa gövdesinde değil: sorun hangi ekranda olursa olsun
 * görünmeli.
 */
export function UyariBandi({ mcc }: { mcc: boolean }) {
  const [veri, setVeri] = useState<UyariYaniti | null>(null);
  const [hata, setHata] = useState<string | null>(null);
  const [gizli, setGizli] = useState<Set<string>>(new Set());
  const [sayfa, setSayfa] = useState(0);

  useEffect(() => {
    let iptal = false;
    /*
     * BANT KENDİ VERİSİNİ ÇEKİYOR. Sunucu bileşeni yapıp her sayfaya
     * eklemek, her sayfanın kendi veri çekiminin yanına bir tur daha
     * koymak demekti; bant sayfanın ASIL içeriğini bekletmemeli.
     */
    // `apiFetch` KULLANILIYOR, ham `fetch` DEĞİL: taban adres, httpOnly
    // cookie'nin gitmesi ve hata biçimi orada tek yerde çözülü. İkinci bir
    // kopya, oturum yenileme davranışının bu bileşende ayrışması demekti.
    apiFetch<UyariYaniti>('/alerts')
      .then((d) => {
        if (!iptal) setVeri(d);
      })
      .catch((e: unknown) => {
        /*
         * HATA YUTULMUYOR ama BANDI DA KAPLAMIYOR. Uyarı ucu düşerse
         * kullanıcının asıl işi engellenmemeli; küçük bir satırla
         * "uyarılar alınamadı" demek yeterli. Sessizce boş bırakmak ise
         * "hiç uyarı yok" ile "uyarılar gelmedi"yi aynı gösterirdi.
         */
        if (!iptal) {
          setHata(e instanceof ApiRequestError ? e.message : 'bağlantı kurulamadı');
        }
      });
    return () => {
      iptal = true;
    };
  }, []);

  // Oturum boyunca gizlenenler. Kalıcı saklamak, düzelmiş sanılan bir sorunu
  // kalıcı olarak görünmez yapardı; sekme kapanınca uyarı geri geliyor.
  useEffect(() => {
    const kayit = sessionStorage.getItem('advetics.gizliUyarilar');
    if (kayit) setGizli(new Set(JSON.parse(kayit) as string[]));
  }, []);

  function gizle(anahtar: string): void {
    const yeni = new Set(gizli).add(anahtar);
    setGizli(yeni);
    sessionStorage.setItem('advetics.gizliUyarilar', JSON.stringify([...yeni]));
    setSayfa(0);
  }

  const gorunen = useMemo(
    () => (veri?.uyarilar ?? []).filter((u) => !gizli.has(anahtarOf(u))),
    [veri, gizli],
  );

  if (hata !== null) {
    return (
      <p className="border-b border-line bg-surface-muted px-4 py-1.5 text-[11px] text-ink-muted">
        Uyarılar alınamadı ({hata}). Panelin geri kalanı çalışmaya devam ediyor.
      </p>
    );
  }
  if (veri === null || gorunen.length === 0) return null;

  return mcc ? (
    <ToplananBant uyarilar={gorunen} toplam={veri.toplam} onGizle={gizle} />
  ) : (
    <TekTekBant
      uyarilar={gorunen}
      toplam={veri.toplam}
      sayfa={Math.min(sayfa, gorunen.length - 1)}
      setSayfa={setSayfa}
      onGizle={gizle}
    />
  );
}

/** Gizleme anahtarı — aynı hesabın aynı sorunu tekrar gösterilmesin. */
function anahtarOf(u: Uyari): string {
  return `${u.kod}:${u.adAccountId ?? u.clientId ?? '-'}`;
}

/**
 * TÜM MÜŞTERİLER görünümü — koda göre toplanmış.
 *
 * Google Ads'in üst bandıyla aynı fikir: "2 hesapta ödeme yöntemlerini
 * güncelleyin". Kaç hesabın etkilendiği sayı olarak yazılıyor; hangileri
 * olduğu tıklayınca açılıyor.
 */
function ToplananBant({
  uyarilar,
  toplam,
  onGizle,
}: {
  uyarilar: Uyari[];
  toplam: number;
  onGizle: (anahtar: string) => void;
}) {
  const [acik, setAcik] = useState<string | null>(null);

  const gruplar = useMemo(() => {
    const m = new Map<string, Uyari[]>();
    for (const u of uyarilar) {
      const g = m.get(u.kod) ?? [];
      g.push(u);
      m.set(u.kod, g);
    }
    return [...m.entries()];
  }, [uyarilar]);

  return (
    <div className="border-b border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        {gruplar.map(([kod, grup]) => {
          const ilk = grup[0]!;
          const hata = ilk.siddet === 'error';
          return (
            <button
              key={kod}
              type="button"
              onClick={() => setAcik(acik === kod ? null : kod)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${
                hata
                  ? 'border-danger/30 bg-danger/5 text-danger hover:bg-danger/10'
                  : 'border-warn/30 bg-warn/5 text-warn hover:bg-warn/10'
              }`}
            >
              <span aria-hidden>{hata ? '⚠' : '!'}</span>
              {/*
                SAYIYLA BİRLİKTE: "ödeme sorunu var" kaç hesabı etkilediğini
                söylemiyor ve ajans hangi ölçekte bir sorunla karşı karşıya
                olduğunu bilemiyordu.
              */}
              <span>
                <strong>{grup.length}</strong> hesapta {kisaBaslik(ilk)}
              </span>
              <span className="text-[10px] opacity-70">{acik === kod ? 'Gizle' : 'Görüntüle'}</span>
            </button>
          );
        })}

        {/* SESSİZ KESME YOK: liste kesilmişse toplam yazılı. */}
        {toplam > uyarilar.length && (
          <span className="text-[11px] text-ink-muted">
            gösterilen {uyarilar.length}, toplam {toplam}
          </span>
        )}
      </div>

      {acik !== null && (
        <ul className="divide-y divide-line border-t border-line">
          {gruplar
            .find(([k]) => k === acik)?.[1]
            .map((u) => (
              <li key={anahtarOf(u)} className="flex flex-wrap items-center gap-2 px-4 py-2">
                {u.platform && (
                  <PlatformLogo
                    kind={u.platform === 'google' ? 'google_ads' : 'meta_ads'}
                    className="h-3.5 w-3.5 shrink-0"
                  />
                )}
                <span className="min-w-0 flex-1 text-xs">
                  <strong className="text-ink">{u.clientName ?? 'Ajans'}</strong>
                  {u.adAccountName && (
                    <span className="text-ink-muted"> · {u.adAccountName}</span>
                  )}
                  <span className="block text-[11px] text-ink-muted">{u.detay}</span>
                </span>
                <Eylem uyari={u} onGizle={onGizle} />
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/**
 * TEK MÜŞTERİ görünümü — sayfalı.
 *
 * Referans Google Ads'in müşteri içi bandı: tek satır, sol/sağ ok ve "1/3".
 * Üç uyarıyı alt alta basmak, bandı sayfanın üçte birine çıkarıyordu.
 */
function TekTekBant({
  uyarilar,
  toplam,
  sayfa,
  setSayfa,
  onGizle,
}: {
  uyarilar: Uyari[];
  toplam: number;
  sayfa: number;
  setSayfa: (n: number) => void;
  onGizle: (anahtar: string) => void;
}) {
  const u = uyarilar[sayfa]!;
  const hata = u.siddet === 'error';

  return (
    <div
      className={`flex flex-wrap items-center gap-3 border-b px-4 py-2.5 ${
        hata ? 'border-danger/30 bg-danger/5' : 'border-warn/30 bg-warn/5'
      }`}
    >
      {uyarilar.length > 1 && (
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-ink-muted">
          <button
            type="button"
            onClick={() => setSayfa((sayfa - 1 + uyarilar.length) % uyarilar.length)}
            className="rounded px-1.5 py-0.5 transition hover:bg-surface-sunken"
            aria-label="Önceki uyarı"
          >
            ‹
          </button>
          {sayfa + 1}/{uyarilar.length}
          <button
            type="button"
            onClick={() => setSayfa((sayfa + 1) % uyarilar.length)}
            className="rounded px-1.5 py-0.5 transition hover:bg-surface-sunken"
            aria-label="Sonraki uyarı"
          >
            ›
          </button>
        </span>
      )}

      <span aria-hidden className={`shrink-0 ${hata ? 'text-danger' : 'text-warn'}`}>
        {hata ? '⚠' : '!'}
      </span>

      <span className="min-w-0 flex-1 text-sm">
        <strong className={hata ? 'text-danger' : 'text-warn'}>{u.baslik}</strong>
        {u.adAccountName && (
          <span className="text-ink-muted"> — {u.adAccountName}</span>
        )}
        <span className="block text-xs text-ink-muted">{u.detay}</span>
      </span>

      <Eylem uyari={u} onGizle={onGizle} />

      {/* SESSİZ KESME YOK. */}
      {toplam > uyarilar.length && (
        <span className="text-[11px] text-ink-muted">toplam {toplam}</span>
      )}
    </div>
  );
}

/**
 * Eylem düğmeleri ve bayatlık.
 *
 * "SORUNU ÇÖZ" YALNIZCA PANELDEN ÇÖZÜLEBİLENLERDE. Ödeme sorununda bir çöz
 * düğmesi göstermek, tıklayınca hiçbir şey yapmayan bir düğme demekti.
 */
function Eylem({ uyari, onGizle }: { uyari: Uyari; onGizle: (anahtar: string) => void }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      {/*
        VERİNİN OKUNMA ANI YAZILI. Hesabın platformdaki durumu yalnızca hesap
        listesi tazelenirken güncelleniyor ve haftalarca eski kalabiliyor.
        Tarihi göstermeyen bir uyarı, düzeltilmiş bir sorunu haftalarca
        ekranda tutar ve kullanıcı bütün uyarılara güvenmeyi bırakır.
      */}
      {uyari.veriZamani && (
        <span className="text-[10px] text-ink-muted" title="Bu bilginin son okunma anı">
          {formatRelative(uyari.veriZamani)}
        </span>
      )}
      {uyari.eylem && (
        <Link
          href={uyari.eylem.href}
          className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white transition hover:opacity-90"
        >
          {uyari.eylem.etiket}
        </Link>
      )}
      <button
        type="button"
        onClick={() => onGizle(anahtarOf(uyari))}
        className="rounded px-1.5 py-1 text-[11px] text-ink-muted transition hover:text-ink"
      >
        Gizle
      </button>
    </span>
  );
}

/** Toplanmış bantta kullanılan kısa hâl — başlık orada tek satıra sığmıyor. */
function kisaBaslik(u: Uyari): string {
  switch (u.kod) {
    case 'hesap_odeme_sorunu':
      return 'ödeme sorunu var';
    case 'hesap_platformda_kapali':
      return 'hesap platformda kapalı';
    case 'hesap_risk_incelemesi':
      return 'risk incelemesi var';
    case 'baglanti_yetki_istiyor':
      return 'bağlantı yeniden yetki istiyor';
    case 'baglanti_token_suresi':
      return 'bağlantı yetkisi doluyor';
    case 'hesap_izleme_kapali':
      return 'izleme kapalı';
    case 'musteride_hesap_yok':
      return 'reklam hesabı atanmamış';
    case 'veri_hic_gelmedi':
      return 'hiç veri gelmedi';
    case 'veri_bayat':
      return 'veri güncellenmiyor';
    case 'is_dusuyor':
      return 'senkronizasyon düşüyor';
  }
}
