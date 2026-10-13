import type { SessionResponse } from '@advetics/shared';

/**
 * ═══ AYARLAR EKRANININ KAPSAMI — BAŞLIĞIN ÜSTÜNDE, HER EKRANDA ═══
 *
 * Ayarlar'daki dört ekran üç farklı düzeyi değiştiriyor ve bu ekrandan
 * okunmuyordu: Şirketler AJANSIN (üst hesabın) altını, Platform
 * bağlantıları ve Ekip ŞİRKETİN kendisini, Hesabım yalnız KİŞİNİN kendisini.
 * Kullanıcı "bu ayarı değiştirince kim etkilenir" sorusunu ekranda
 * göremeyince, şirket geneli bir ayarı kendi hesabının ayarı sanabiliyordu
 * (ya da tersi). Workspace düzeyi Ayarlar'da YOK: workspace'in her alanı
 * Marka Merkezi'nde (MIMARI § Rota ağacı).
 *
 * Google Ads'in "Yönetici hesabı / Hesap" etiketinin karşılığı: küçük, tek
 * satır, ad ile birlikte.
 */
export type AyarDuzeyi = 'ajans' | 'sirket' | 'kisi';

const DUZEY_ADI: Record<AyarDuzeyi, string> = {
  ajans: 'Ajans',
  sirket: 'Şirket',
  kisi: 'Kişisel',
};

const DUZEY_ACIKLAMASI: Record<AyarDuzeyi, string> = {
  ajans: 'Bu ekrandaki değişiklik ajansın altındaki şirketleri etkiler.',
  sirket: 'Bu ekrandaki değişiklik şirketin tamamını etkiler.',
  kisi: 'Bu ekrandaki değişiklik yalnız seni etkiler.',
};

export function AyarKapsami({ duzey, ad }: { duzey: AyarDuzeyi; ad: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
      <span title={DUZEY_ACIKLAMASI[duzey]}>Kapsam: {DUZEY_ADI[duzey]}</span>
      <span aria-hidden>·</span>
      <span className="normal-case tracking-normal text-ink">{ad}</span>
    </p>
  );
}

/**
 * AKTİF ŞİRKETİN ADI. `session.organization` EV şirketi; ajans yöneticisi
 * kardeş bir şirkete geçtiğinde aktif şirket başka (CLAUDE.md "TÜM
 * ŞİRKETLER MODUNDA ctx.orgId EV ŞİRKETİ KALIYOR"). Sihirbaz sayfası da
 * aynı sırayla çözüyor.
 */
export function aktifSirketAdi(session: SessionResponse): string {
  return (
    session.managerAccount?.organizations.find((o) => o.id === session.activeOrganizationId)?.name ??
    session.organization.name
  );
}
