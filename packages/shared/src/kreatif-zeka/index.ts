/**
 * ═══ KREATİF ZEKÂSI — Paket D sözleşmesi ═══
 *
 * Mimari: `docs/kreatif-zeka/MIMARI.md`. Taslak: `docs/kreatif-zeka/taslak.html`.
 *
 * AYRI MODÜL: ekranı İyileştir'in sekmesi, ama veri modeli (saklanan etiket,
 * maliyet sayacı, brief) İyileştir önerilerinden farklı ve brief
 * AdvCampaign'e de akıyor. Yorgunluk önerisi İyileştir'de KALIR; burası onu
 * okur, tekrar üretmez (`puan.ts#KovaSonucu.yorgunlukOnerisi`).
 *
 * `kreatif-adres.ts` (kök) ayrı ve dokunulmadı: o "bu değer bir adres mi"
 * süzgeci, bu modül onu KULLANIR.
 */
export * from './etiket';
export * from './durum';
export * from './istatistik';
export * from './puan';
export * from './brief';
export * from './ozet';
