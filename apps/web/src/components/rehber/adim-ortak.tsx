'use client';

import type { RehberAlanlari, RehberHazirligi, RehberKaydi, RehberPlatformu } from '@advetics/shared';
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
}

export function yaz(b: AdimBaglami, alan: Degisiklik['alan'], deger: unknown, kaynak: Degisiklik['kaynak'] = 'kullanici') {
  b.degistir([{ alan, deger, kaynak }]);
}

/** Alanı SİLER (`sil: true`). `yaz(b, alan, null)` silmek değil, null değeri yazmak. */
export function sil(b: AdimBaglami, alan: Degisiklik['alan']) {
  b.degistir([silme(alan)]);
}

export function Soru({ baslik, children }: { baslik: string; children: React.ReactNode }) {
  return (
    <div className={s.soru}>
      <h2>{baslik}</h2>
      <p>{children}</p>
    </div>
  );
}

export function AltCubuk({
  git,
  adim,
  children,
}: {
  git: (n: EkranNo) => void;
  adim: number;
  children?: React.ReactNode;
}) {
  return (
    <div className={s.altCubuk}>
      {adim > 1 && (
        <button type="button" className={s.ikincil} onClick={() => git((adim - 1) as EkranNo)}>
          Geri
        </button>
      )}
      <span className={s.bosluk} />
      {children ?? (
        <button type="button" className={s.birincil} onClick={() => git(Math.min(6, adim + 1) as EkranNo)}>
          Devam
        </button>
      )}
    </div>
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
