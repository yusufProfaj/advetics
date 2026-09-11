'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AutoBoostQueueList, UyariYaniti } from '@advetics/shared';
import { ApiRequestError, apiFetch } from '@/lib/api';

/**
 * ═══ BİLDİRİM VERİSİ TEK YERDEN ÇEKİLİYOR ═══
 *
 * İki tüketici var ve DOM'da ayrı yerlerde duruyorlar: üst bardaki zil ile
 * başlığın altındaki acil bandı. İkisinin de `/alerts`i kendi çekmesi akla
 * yakın görünüyordu; değil.
 *
 * `/alerts` ajansın BÜTÜN atanmış reklam hesaplarını ve workspace'lerini
 * tarıyor (üretimde 481 hesaplı bir havuz). Aynı sayfa yüklemesinde iki kez
 * koşturmak, ölçülerek düzeltilen metrik yavaşlığının aynısını bu kez uyarı
 * ucunda üretmek olurdu.
 *
 * İKİ TÜKETİCİNİN AYRIŞMASI DA BİR RİSK: bant "3 sorun" derken zilin "5"
 * demesi, ikisinin de yanlış sanılması demek. Tek kaynak, tek sayı.
 *
 * SAĞLAYICI `layout.tsx`TA ve header ile bandı BİRLİKTE sarıyor; ikisi de
 * istemci bileşeni olduğu için bağlam ikisine de ulaşıyor.
 */
export interface BildirimVerisi {
  uyarilar: UyariYaniti | null;
  /** `/alerts` düştüyse platformun kendi mesajı — yutulmuyor. */
  uyariHatasi: string | null;
  /**
   * Onay bekleyen boost kartları.
   *
   * `null` = HENÜZ İSTENMEDİ ya da istenemez (workspace seçili değil).
   * Boş dizi = istendi ve gerçekten bekleyen yok. İkisi AYRI: "bilmiyorum"
   * ile "yok" aynı ekrana çevrilirse kullanıcı bekleyen bir onayı kaçırır.
   */
  boostKuyrugu: AutoBoostQueueList | null;
  boostHatasi: string | null;
  /** Boost kuyruğu neden istenemedi — ekranda yazılıyor. */
  boostKapsamDisi: boolean;
  yukleniyor: boolean;
}

const Baglam = createContext<BildirimVerisi | null>(null);

export function useBildirimVerisi(): BildirimVerisi {
  const v = useContext(Baglam);
  if (v === null) {
    // Sağlayıcısız kullanım SESSİZ bir boş panel üretirdi — "bildirim yok"
    // ile "bileşen yanlış yere kondu" aynı görünürdü.
    throw new Error('useBildirimVerisi bir <BildirimSaglayici> içinde çağrılmalı');
  }
  return v;
}

export function BildirimSaglayici({
  aktifWorkspaceId,
  boostGorunur,
  children,
}: {
  /** `null` = şirket geneli ya da ajans görünümü. */
  aktifWorkspaceId: string | null;
  /** `boost.read` yoksa kuyruk hiç istenmiyor — 403 yerine sessizlik. */
  boostGorunur: boolean;
  children: ReactNode;
}) {
  const [uyarilar, setUyarilar] = useState<UyariYaniti | null>(null);
  const [uyariHatasi, setUyariHatasi] = useState<string | null>(null);
  const [boostKuyrugu, setBoostKuyrugu] = useState<AutoBoostQueueList | null>(null);
  const [boostHatasi, setBoostHatasi] = useState<string | null>(null);

  useEffect(() => {
    let iptal = false;
    apiFetch<UyariYaniti>('/alerts')
      .then((d) => {
        if (!iptal) setUyarilar(d);
      })
      .catch((e: unknown) => {
        /*
         * HATA YUTULMUYOR ama EKRANI DA KAPLAMIYOR. Uyarı ucu düşerse
         * kullanıcının asıl işi engellenmemeli; sessizce boş bırakmak ise
         * "hiç uyarı yok" ile "uyarılar gelmedi"yi aynı gösterirdi.
         */
        if (!iptal) {
          setUyariHatasi(e instanceof ApiRequestError ? e.message : 'bağlantı kurulamadı');
        }
      });
    return () => {
      iptal = true;
    };
  }, []);

  useEffect(() => {
    /*
     * BOOST KUYRUĞU WORKSPACE İSTİYOR.
     *
     * `/autoboost/queue` zorunlu bir `clientId` alıyor: kuyruk bir
     * workspace'in gönderilerinden oluşuyor. Ajans ya da şirket geneli
     * görünümde sorulacak bir şey yok — uydurma bir kapsamla çağırmak
     * (örneğin ilk workspace) kullanıcıya BAŞKA birinin kuyruğunu
     * göstermek olurdu.
     *
     * Bu, kullanıcının "hangi şirketteysem ya da ekrandaysam" isteğinin
     * doğal sınırı: boost bölümü workspace seçiliyken dolu, değilken
     * SEBEBİNİ yazıyor.
     */
    setBoostKuyrugu(null);
    setBoostHatasi(null);
    if (aktifWorkspaceId === null || !boostGorunur) return;

    let iptal = false;
    apiFetch<AutoBoostQueueList>(`/autoboost/queue?clientId=${aktifWorkspaceId}`)
      .then((d) => {
        if (!iptal) setBoostKuyrugu(d);
      })
      .catch((e: unknown) => {
        if (!iptal) {
          setBoostHatasi(e instanceof ApiRequestError ? e.message : 'bağlantı kurulamadı');
        }
      });
    return () => {
      iptal = true;
    };
  }, [aktifWorkspaceId, boostGorunur]);

  const deger = useMemo<BildirimVerisi>(
    () => ({
      uyarilar,
      uyariHatasi,
      boostKuyrugu,
      boostHatasi,
      boostKapsamDisi: boostGorunur && aktifWorkspaceId === null,
      yukleniyor: uyarilar === null && uyariHatasi === null,
    }),
    [uyarilar, uyariHatasi, boostKuyrugu, boostHatasi, boostGorunur, aktifWorkspaceId],
  );

  return <Baglam.Provider value={deger}>{children}</Baglam.Provider>;
}
