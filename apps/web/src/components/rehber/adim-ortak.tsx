'use client';

import { REHBER_ADIMLARI, type RehberAdimi, type RehberAlanlari, type RehberHazirligi, type RehberKaydi, type RehberPlatformu } from '@advetics/shared';
import { AltCubuk as OrtakAltCubuk, Soru as OrtakSoru } from '@/components/ui/sihirbaz';
import { silme, type Degisiklik, type EkranNo } from './rehber-mantik';
import { IKON, Ikon } from './ikonlar';
import s from './rehber.module.css';

/** Her adımın aldığı ortak bağlam: ekranda görünen alanlar ve tek yazma yolu. */
export interface AdimBaglami {
  /** Sunucunun kaydı + henüz yazılmamış değişiklikler (`yerelAlanlar`). */
  a: RehberAlanlari;
  kayit: RehberKaydi;
  h: RehberHazirligi;
  /** Kullanıcı seçimi ∩ görünürlük (`acikPlatformlar`, shared). */
  acik: Record<RehberPlatformu, boolean>;
  /** TEK yazma yolu: kaydediciye gider, 600 ms sonra PUT. */
  degistir: (d: Degisiklik[]) => void;
  paraBirimi: string;
  saatDilimi: string;
  clientId: string;
  /**
   * Form yayınlama yetkisi (`bulk.publish`). Rehberin "Form oluştur"u buna
   * bağlı: seçilebilir form Meta'da yayında olmak zorunda, yayınlayamayan
   * kullanıcıya düğme gösterilmez, sebebi yazılır.
   */
  formYayinIzni: boolean;
  /**
   * "Web sitemiz yok" beyanı (kurulum sihirbazı) — ÜÇ HÂLLİ: `null` beyanlar
   * okunamadı ve HİÇBİR amacı kapatmaz (`siteYokRehberKapisi`).
   */
  siteYok: boolean | null;
}

export function yaz(b: AdimBaglami, alan: Degisiklik['alan'], deger: unknown, kaynak: Degisiklik['kaynak'] = 'kullanici') {
  b.degistir([{ alan, deger, kaynak }]);
}

/** Alanı SİLER (`sil: true`). `yaz(b, alan, null)` silmek değil, null değeri yazmak. */
export function sil(b: AdimBaglami, alan: Degisiklik['alan']) {
  b.degistir([silme(alan)]);
}

/**
 * Adımın tek sorusu: ortak `Soru` (kırmızı üst başlık "3 / 6 · Kime", büyük
 * soru, bir satır açıklama). Üst başlık adım tablosundan: adım adı iki yerde
 * elle yazılırsa ray ile soru ayrışır.
 */
export function Soru({ adim, baslik, children }: { adim: RehberAdimi; baslik: string; children: React.ReactNode }) {
  const ad = REHBER_ADIMLARI.find((x) => x.no === adim)?.ad ?? '';
  return <OrtakSoru ust={`${adim} / ${REHBER_ADIMLARI.length} · ${ad}`} soru={baslik} aciklama={children} />;
}

/**
 * Alt eylem çubuğu: ortak YAPIŞKAN `AltCubuk` (Geri solda, birincil sağda).
 * `children` verilirse varsayılan "Devam" yerine o düğmeler sağda durur
 * (son kontrol: Prova + Yayınla).
 */
export function AltCubuk({
  git,
  adim,
  ileri,
  not,
  children,
}: {
  git: (n: EkranNo) => void;
  adim: number;
  /** Devam'ın hedefi; verilmezse bir sonraki adım (kısa akış: `amactanSonraki`). */
  ileri?: EkranNo;
  /** Ortadaki not: Devam kapalıysa nedeni. */
  not?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <OrtakAltCubuk
      geri={adim > 1 ? { onClick: () => git((adim - 1) as EkranNo) } : null}
      not={not}
      ek={children}
      devam={children ? null : { etiket: 'Devam', onClick: () => git(ileri ?? (Math.min(6, adim + 1) as EkranNo)) }}
    />
  );
}

export function Uyari({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`${s.uyari} ${className ?? ''}`} role="status">
      <Ikon d={IKON.ucgen} />
      <span>{children}</span>
    </div>
  );
}
