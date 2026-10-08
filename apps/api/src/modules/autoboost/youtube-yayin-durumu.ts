import { Prisma } from '@prisma/client';

/**
 * ═══ YOUTUBE KARTININ "YAYINDA MI" SORUSU ═══
 *
 * Meta kartı `boosts` satırı açıyor ve "önceki boost hâlâ yayında" engeli
 * oradan okunuyor. YouTube (Google Demand Gen) yolu `boosts`a HİÇ satır
 * yazmıyor: kimlikler doğrudan kuyruk kartında. Engel yalnızca `boosts`a
 * baktığı için yayındaki bir YouTube kartında "Tekrar yayınla" hemen açık
 * geliyordu ve ikinci onay aynı video için İKİNCİ bir kampanya açıyordu —
 * ikisi birden para harcıyor, hiçbir hata yok (plan P1).
 *
 * Bitiş, kartın KENDİ kaydından: yayın anı + o yayında uygulanan süre
 * (`applied_settings.durationDays`). Ön ayardaki süre değil: ön ayar
 * sonradan değişirse yayındaki kampanyanın bitişi değişmiyor.
 *
 * ESKİ KAYITLAR (uygulanan ayar yazılmadan yayınlanmış): ön ayarın üst
 * sınırı olan 30 gün varsayılıyor. Kısa varsaymak tekrar yayını erken
 * açardı; uzun varsaymanın bedeli yalnızca birkaç gün beklemek.
 *
 * Takma ad `q` (auto_boost_queue_items) — iki sorgu da onu kullanıyor.
 * SQL içinde ters tırnak YOK (şablonu ortasından kapatır).
 */
export const YOUTUBE_ESKI_KAYIT_SURESI_GUN = 30;

export const YOUTUBE_CANLI_BITER_SQL = Prisma.raw(`(
  CASE
    WHEN q.platform = 'google' AND q.status = 'launched' AND q.launched_at IS NOT NULL
     AND q.launched_at + make_interval(days => COALESCE((q.applied_settings->>'durationDays')::int, ${YOUTUBE_ESKI_KAYIT_SURESI_GUN})) > now()
    THEN q.launched_at + make_interval(days => COALESCE((q.applied_settings->>'durationDays')::int, ${YOUTUBE_ESKI_KAYIT_SURESI_GUN}))
  END
)`);

/**
 * Kampanyanın KURULDUĞU ayar — kartta gösterilen ve tekrar kilidinin
 * okuduğu tek kayıt (plan G5). Para string: JSON BigInt taşımıyor.
 */
export function youtubeUygulananAyar(g: {
  dailyBudgetMicros: bigint;
  durationDays: number;
  konumlar: ReadonlyArray<{ key: string; label: string }>;
  yaslar: readonly string[];
}): {
  platform: 'google';
  dailyBudgetMicros: string;
  durationDays: number;
  locations: Array<{ key: string; label: string }>;
  ageRanges: string[];
} {
  return {
    platform: 'google',
    dailyBudgetMicros: g.dailyBudgetMicros.toString(),
    durationDays: g.durationDays,
    locations: g.konumlar.map((l) => ({ key: l.key, label: l.label })),
    ageRanges: [...g.yaslar],
  };
}
