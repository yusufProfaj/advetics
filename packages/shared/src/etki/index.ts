/**
 * ═══ DEĞİŞİKLİK ETKİSİ (Impact) — Paket C sözleşmesi ═══
 *
 * Mimari: `docs/etki/MIMARI.md`. Taslak: `docs/etki/taslak.html`.
 *
 * AYRI MODÜL, İYİLEŞTİR'İN ALT PARÇASI DEĞİL: ekranı İyileştir'in sekmesi
 * ama ölçtüğü değişiklikler İyileştir'den büyük (kural motoru, Reklam
 * Yöneticisi satır içi durdur, AI asistan kartı, Paket A Sinyal Uygula) ve
 * Paket B'nin haftalık özeti de onu okuyor. `iyilestir/` içine koymak,
 * kuralların ve özetin İyileştir'e bağımlı olması demekti (Paket A ile
 * aynı gerekçe, `sinyal/index.ts`).
 */
export * from './yontem';
export * from './durum';
export * from './etki';
