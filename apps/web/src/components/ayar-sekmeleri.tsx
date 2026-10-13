'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { aktifMi } from '@/components/nav';
import { SayfaIcMenu } from '@/components/ui/sayfa-ic-menu';
import { AcilirMenu, IKON_TETIK } from '@/components/ui/acilir-menu';
import { Ikon } from '@/components/ui/ikon';

/**
 * ═══ SATIR SONU ⋯ MENÜSÜ (Ayarlar ve Hesabım ekranlarının ortak tetiği) ═══
 *
 * `AcilirMenu` + `IKON_TETIK` + `nokta3` ikonu her satırda aynı üç satırla
 * kuruluyordu; burada bir kez. GRUP 4 SAPMASI (BILESENLER § 8): `ui/`
 * altında bir "⋯ menüsü" bileşeni yok ve yeni ortak bileşen yazılmıyor;
 * başka gruplar da aynı deseni kurarsa `ui/acilir-menu.tsx`e taşınmalı.
 *
 * `etiket` ZORUNLU ve satırın adını taşımalı ("Seasight için işlemler"):
 * on satırlık bir tabloda ekran okuyucu on kez "Diğer" okursa hangi satırın
 * menüsünde olduğu bilinmez.
 */
export function DigerMenusu({ etiket, children }: { etiket: string; children: ReactNode }) {
  return (
    <AcilirMenu
      tasma="portal"
      etiket={etiket}
      hizala="sag"
      genislik="w-64"
      tetik={({ acik: _acik, ...o }) => (
        <button type="button" aria-label={etiket} className={IKON_TETIK} {...o}>
          <Ikon ad="nokta3" />
        </button>
      )}
    >
      {children}
    </AcilirMenu>
  );
}

/**
 * ═══ AYARLAR BÖLÜMLERİ — SAYFA İÇİ YAN MENÜ (kullanıcı kararı 2026-10-14) ═══
 *
 * Ayarlar ekranları üstte alt çizgili bir sekme çubuğuydu; artık içeriğin
 * solunda dikey menü (`SayfaIcMenu`, BILESENLER § 9). Onaylı taslak:
 * `docs/marka/sayfa-taslaklari.html` `#ayarlar`.
 *
 * Seçili öğe `aktifMi` ile bulunuyor, kenar çubuğundakiyle aynı tanım: iki
 * ayrı "bu yolda mı" kuralı yazmak, menüde "Ayarlar" seçili görünürken
 * hiçbir bölümün seçili olmaması demekti.
 *
 * BÖLÜMLER BAĞLANTI: her bölüm kendi adresinde (`/ayarlar/baglantilar`…).
 * Geri tuşu bölümler arasında çalışıyor ve bildirim zilinin çapaları
 * (`#havuz`, `#kisiler`) doğrudan doğru bölümü açıyor.
 *
 * KIRMIZI NOKTA `uyarili`: sorunlu bir platform bağlantısı (yeniden yetki,
 * hata, eksik izin) Ayarlar'ın HER bölümünden görünüyor. Yalnız Bağlantılar
 * bölümünün içinde yazsaydı, Ekip'te çalışan kullanıcı Google'ın veri
 * çekmeyi bıraktığını hiç görmezdi.
 */
export function AyarSekmeleri({
  sekmeler,
  uyarili = [],
}: {
  sekmeler: Array<{ href: string; ekYollar: readonly string[]; ad: string }>;
  /** Kırmızı nokta taşıyacak bölümlerin adresleri. */
  uyarili?: string[];
}) {
  const pathname = usePathname();
  const secili = sekmeler.find((s) => aktifMi(s, pathname))?.href ?? '';
  return (
    <SayfaIcMenu
      etiket="Ayarlar bölümleri"
      secili={secili}
      ogeler={sekmeler.map((s) => ({
        deger: s.href,
        etiket: s.ad,
        href: s.href,
        uyari: uyarili.includes(s.href),
      }))}
    />
  );
}
