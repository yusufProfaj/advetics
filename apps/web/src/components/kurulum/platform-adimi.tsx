'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  PLATFORM_LABELS,
  PLATFORMS,
  platformKanali,
  type ConnectionSummary,
  type Platform,
  type ProviderAvailability,
} from '@advetics/shared';
import { CallbackBanner } from '@/components/callback-banner';
import { PlatformLogo } from '@/components/platform-logo';
import { Dugme } from '@/components/ui/dugme';
import { Serit } from '@/components/ui/hal';
import { Rozet } from '@/components/ui/rozet';
import { ApiRequestError, apiFetch } from '@/lib/api';
import { PANEL_YERLERI, platformBaglantilariAdresi } from '@/lib/panel-adresleri';
import { platformDurumu } from './kurulum-akisi';

/**
 * ═══ PLATFORM BAĞLANTILARI ADIMI — AÇILIŞTA VE SİHİRBAZIN ŞİRKET ADIMINDA AYNI ═══
 * (docs/kurulum-sihirbazi/MIMARI.md Ç-2)
 *
 * AJANSIN BAĞLANTISI BİR KEZ KURULUR. Liste PARAMETRESİZ `/connections`tan
 * geliyor ve RLS (`havuz_kapsaminda`) ajansın bağlantısını müşteri şirketinde
 * de gösteriyor. Görünen ETKİN bir bağlantı varsa "Bağla" ÇİZİLMEZ: ajansın
 * kimliğini şirket başına yeniden yetkilendirmek önceki token'ı geçersiz kılıp
 * bütün şirketlerin bağlantısını koparıyordu.
 *
 * AJANSIN BAĞLANTISININ YETKİSİ DÜŞTÜYSE burada yeniden yetkilendirme
 * SUNULMAZ: yanlış kişinin token'ı ajansın satırına yazılırdı. Ekran ajansa
 * yönlendirir. Şirketin KENDİ bağlantısı düştüyse "Yeniden bağla" var.
 *
 * Bu bileşen eskiden açılış sihirbazının içindeydi; şirket adımı (S1) aynı
 * işi yapıyor ve iki kopya ayrışırdı.
 */
export function PlatformAdimi({
  redirectTo,
  uygunluk,
  baglantilar,
  yonetebilir,
  yuklemeHatasi,
  onHata,
  onYenile,
  yenileniyor,
}: {
  /** OAuth dönüşü — sihirbazın AYNI adımı (`kurulumAdresi` ya da `sihirbazAdresi`). */
  redirectTo: string;
  uygunluk: readonly ProviderAvailability[];
  baglantilar: readonly ConnectionSummary[];
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
          redirectTo,
          ...(yeniden ? { forceReconsent: true } : {}),
        }),
      });
      // Yönlendirmeyi TARAYICI yapmalı: fetch üzerinden gelen bir 302,
      // platformun izin ekranını görünmez kılar.
      window.location.href = authorizeUrl;
    } catch (e) {
      onHata(e instanceof ApiRequestError ? e.message : 'Bağlantı başlatılamadı.');
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
      onHata(e instanceof ApiRequestError ? e.message : 'Hesaplar yenilenemedi.');
    } finally {
      setBekleyen(null);
    }
  }

  return (
    <div className="space-y-3">
      <CallbackBanner />

      {yuklemeHatasi && (
        <Serit ton="hata" baslik={<>Bağlantılar okunamadı: {yuklemeHatasi}</>} />
      )}

      <ul className="divide-y divide-line rounded-kart border border-line">
        {PLATFORMS.map((p) => {
          const d = platformDurumu(p, uygunluk, baglantilar);
          const meslul = bekleyen !== null || yenileniyor;
          const ajansin = (d.durum === 'bagli' || d.durum === 'yeniden') && d.baglanti.sahip === 'ajans';
          return (
            <li key={p} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
              <PlatformLogo kind={platformKanali(p)} className="h-6 w-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-14 font-semibold text-ink">{PLATFORM_LABELS[p]}</p>
                <p className="text-12 text-ink-muted">
                  {d.durum === 'bagli'
                    ? `${ajansin ? 'Ajansın bağlantısı kullanılıyor' : 'Bağlı'} · ${d.bostaHesap} reklam hesabı, ${d.bostaSayfa} sayfa seçilmeyi bekliyor`
                    : d.durum === 'yeniden'
                      ? ajansin
                        ? `Ajansın bağlantısının yetkisi düşmüş. Ajans yöneticisi ${PANEL_YERLERI.platformBaglantilari} ekranından yeniler.`
                        : 'Bağlantının süresi dolmuş, yeniden bağlanmalı'
                      : d.durum === 'ayarsiz'
                        ? 'Sunucu ayarı eksik. Advetics ekibine bildir.'
                        : 'Bağlı değil'}
                </p>
              </div>

              {d.durum === 'bagli' && (
                <span className="flex shrink-0 items-center gap-2">
                  <Rozet hal="ok">Bağlı</Rozet>
                  {yonetebilir && (
                    <Dugme
                      ton="ikincil"
                      boyut="kucuk"
                      onClick={() => void yenile(d.baglanti.id)}
                      disabled={meslul}
                      bekliyor={bekleyen === d.baglanti.id}
                    >
                      Hesapları yenile
                    </Dugme>
                  )}
                </span>
              )}

              {/* AJANSIN DÜŞMÜŞ BAĞLANTISI için düğme YOK (yukarıdaki gerekçe). */}
              {(d.durum === 'yok' || (d.durum === 'yeniden' && !ajansin)) && yonetebilir && (
                // İKİNCİL: sihirbazın tek birincil düğmesi alt çubukta ("Devam").
                <Dugme
                  ton="ikincil"
                  boyut="kucuk"
                  onClick={() => void bagla(p, d.durum === 'yeniden')}
                  disabled={meslul}
                  bekliyor={bekleyen === p}
                >
                  {d.durum === 'yeniden' ? 'Yeniden bağla' : 'Bağla'}
                </Dugme>
              )}
            </li>
          );
        })}
      </ul>

      {/*
        AJANSIN BAĞLANTISI YENİ ŞİRKETTE DE GÖRÜNÜR (Ç-2). Burada bir süre
        "her şirket kendi bağlantısını kullanır, yeniden bağlan" yazıyordu;
        o cümle kullanıcıyı ajansın kimliğini yeniden yetkilendirmeye ve bütün
        şirketlerin bağlantısını koparmaya gönderiyordu.
      */}
      <p className="text-12 text-ink-muted">
        {yonetebilir
          ? 'Ajansın Meta ve Google bağlantısı bu şirkette de kullanılır; yeniden bağlanma. Şirket kendi hesabıyla bağlanmak isterse:'
          : 'Platform bağlamak yönetici işi. Bağlıysa devam edebilirsin.'}{' '}
        <Link href={platformBaglantilariAdresi()} className="font-semibold text-ink underline-offset-2 hover:underline">
          {PANEL_YERLERI.platformBaglantilari}
        </Link>
      </p>
    </div>
  );
}
