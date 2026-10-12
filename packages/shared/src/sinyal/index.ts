/**
 * ═══ SİNYALLER + BİLDİRİM KANALLARI — Paket A sözleşmesi ═══
 *
 * Mimari: `docs/sinyal/MIMARI.md`. Taslak: `docs/sinyal/taslak.html`.
 *
 * AYRI MODÜL, İYİLEŞTİR'İN ALT PARÇASI DEĞİL: ekranı İyileştir'in sekmesi
 * ama (1) veri modeli farklı (saklanan gözlem + durum makinesi, öneri ise
 * saklanmıyor), (2) bildirim kanalları İyileştir'den büyük: kural motoru da
 * kullanıyor, ileride haftalık özet (Paket B) de kullanacak. `iyilestir/`
 * içine koymak, kural motorunun İyileştir'e bağımlı olması demekti.
 */
export * from './durum';
export * from './anomali';
export * from './saglik';
export * from './sinyal';
export * from './bildirim';
export * from './uclar';
