# Bir ekranı iki dile geçirme rehberi (D2 ve sonrası)

Mimari ve kararlar `MIMARI.md`'de, terimler `SOZLUK.md`'de. Bu belge
"bir dosyayı sözlüğe nasıl geçiririm" sorusunun kısa cevabı.

## 1. Metin nereye

- **Ekran metni** → `apps/web/src/dil/sozlukler/<ad-alani>.ts`, biçim:
  `export const xSozlugu = ikiDil({ ...tr }, { ...en })` (`@advetics/shared`).
  `en` tipi `tr`den türüyor: eksik/fazla anahtar derlemede kırılır.
  Fonksiyon değer interpolasyon ve çoğul için (`(n: number) => ...`).
  İç içe nesne ve dizi serbest; İngilizce aynı şekilde olmalı.
- **Uzun düzyazı** (yasal metin gibi) → içerik dosyası çifti
  `x.tr.tsx` + `x.en.tsx`.
- **Shared'daki etiketler** (rol, Ayarlar sekmesi, kapı nedeni, paket,
  Marka Merkezi bölümü, Varlıklar sekmesi) → Türkçe sabiti doğrudan
  okuma; `rolEtiketi(rol, dil)`, `ayarSekmesiAdi(kod, dil)`,
  `kapiNedeni(anahtar, dil)`, `paketEtiketi`, `markaBolumuAdi`,
  `varlikSekmesiAdi`, `sahipEtiketi`, `acilisAdi` (`@advetics/shared`).
- İki dilde AYNI kalan ad (marka, ürün adı, "Workspace", "Demo") sözlüğe
  GİRMEZ (bekçi aynı değeri "çevrilmemiş" sayar); kodda sabit kalır.

## 2. Dili nereden al

- Sunucu bileşeni: `const dil = await dilAl()` ya da
  `const d = await sozluk(xSozlugu)` (`@/dil/sunucu`).
- İstemci bileşeni (`'use client'`): `const d = useSozluk(xSozlugu)`,
  dil kodu `useDil().dil` (`@/dil/saglayici`).
- Sunucudaki sayfanın `metadata`sı → `generateMetadata()` (dil istek
  anında belli).
- Saf yardımcı (`lib/*.ts`) dile ihtiyaç duyuyorsa `dil` PARAMETRESİ alır
  (varsayılan `'tr'`); modül düzeyinde "şu anki dil" tutulmaz (sunucuda
  eşzamanlı istekler farklı dilde).

## 3. Biçim

`formatMoney(x, cur, { dil })`, `formatNumber(n, dil)`,
`formatPercent(n, digits, dil)`, `formatDecimal(n, digits, dil)`,
`formatRoas(n, dil)`; panelde `formatTarih(iso, dil)`,
`formatRelative(iso, dil)`, `formatDayShort/Long(iso, dil)`. Para birimi
dile göre DEĞİŞMEZ (Ç12). `toLocaleString('tr-TR')` elle yazma:
`bicimKodu(dil)`.

## 4. Bitince

- `npx --no-install tsc --noEmit -p apps/web` temiz.
- `apps/web/src/dil/dil-tarama.spec.ts` "LİSTEYİ KÜÇÜLT" diyorsa
  `dil-tarama.istisnalar.ts`te o dosyanın sayısını DÜŞÜR ya da satırı sil.
  ASLA yeni satır ya da büyük sayı yazma; bir dosyada kalan Türkçe ekran
  metni değilse (geliştirici günlüğü, Türkçe yol adı) gerekçesiyle
  `KALICI_ISTISNALAR`a.
- Ekran metnini kaynakta arayan eski bir test kırılırsa iddiayı SÖZLÜĞE
  taşı (değer + bileşenin anahtarı kullandığı); kapsamı düşürme.
- Kullanıcıya görünen İngilizcede uzun tire (—) yok; kısa, sade cümle.
- Platformdan gelen ham hata mesajı çevrilmez (Ç7); API'nin kendi
  cümlesi D4'te çevrilecek, şimdilik olduğu gibi gösterilir.
