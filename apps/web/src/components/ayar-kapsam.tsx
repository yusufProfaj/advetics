import type { ReactNode } from 'react';
import type { ConnectionSummary, SessionResponse } from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { kenarBolumleri, visibleSections } from '@/lib/nav-sections';
import { ayarlarYolu } from '@/lib/panel-adresleri';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { SayfaIcDuzen } from '@/components/ui/sayfa-ic-menu';
import { AyarSekmeleri } from '@/components/ayar-sekmeleri';

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
    <p className="m-0 flex flex-wrap items-center gap-x-1.5 text-12 text-ink-muted">
      <span title={DUZEY_ACIKLAMASI[duzey]}>Kapsam: {DUZEY_ADI[duzey]}</span>
      <span aria-hidden>·</span>
      <span className="font-semibold text-ink">{ad}</span>
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

/**
 * SORUNLU BAĞLANTI: yeniden yetki isteyen, hata veren ya da zorunlu izni
 * eksik bağlantı. `revoked` SORUN DEĞİL: kullanıcının kendi kaldırdığı
 * bağlantı, kırmızı nokta onu "düzelt" diye göstermemeli.
 */
export function baglantiSorunluMu(c: Pick<ConnectionSummary, 'status' | 'missingScopes'>): boolean {
  return c.status === 'needs_reauth' || c.status === 'error' || c.missingScopes.length > 0;
}

/**
 * ═══ AYARLAR SAYFASININ ÇERÇEVESİ: başlık + sayfa içi yan menü ═══
 *
 * Başlık tam genişlikte üstte, altında solda bölüm menüsü, sağda içerik
 * (BILESENLER § 9). Bölümün asıl eylemi başlığın SAĞINDA ve metni bölüme
 * göre değişiyor (Yeni workspace · Platform bağla · Kullanıcı ekle); her
 * sayfa kendi `eylemler`ini veriyor çünkü eylemin kapısı o sayfanın işi.
 *
 * GENİŞLİK SABİT. Bölümler `max-w-4xl`, `5xl` ve `7xl` arasında
 * zıplıyordu: yan menüden bölüm değiştiren kullanıcı içeriğin sağa sola
 * kaydığını görüyordu. Hepsi panelin geniş düzeninde (1400).
 *
 * BÖLÜM LİSTESİ MENÜYLE AYNI SÜZGEÇTEN (`visibleSections`): ayrı bir liste
 * yazmak, bir ekranın menüde görünüp burada görünmemesi ya da yetkisi
 * olmayana gösterilmesi demekti. Hesabım bu menüde YOK: kullanıcı kartından
 * açılan kendi sayfası (taslak, "Bugünden farkı").
 */
export async function AyarlarSayfasi({
  session,
  baslik,
  aciklama,
  ust,
  eylemler,
  baglantilar,
  children,
}: {
  session: SessionResponse;
  /** Bölümün adı: menü satırının AYNISI (`nav-sections.spec.ts`). */
  baslik: string;
  aciklama?: ReactNode;
  /** Kapsam satırı (`AyarKapsami`). */
  ust?: ReactNode;
  /** Başlığın sağı: bölümün TEK birincil eylemi. */
  eylemler?: ReactNode;
  /**
   * Sayfa bağlantı listesini zaten çektiyse (Platform bağlantıları) onu
   * verir; ikinci kez istenmez. Verilmezse kırmızı nokta için burada çekilir.
   */
  baglantilar?: ConnectionSummary[] | null;
  children: ReactNode;
}) {
  const { ayarlar } = kenarBolumleri(
    visibleSections(session.permissions, {
      ustHesapGorunur: session.platformAdmin || session.managerAccount !== null,
      platformSahibi: session.platformAdmin,
    }),
  );
  const hesabimYolu = ayarlarYolu('hesabim');
  const baglantilarYolu = ayarlarYolu('baglantilar');
  const sekmeler = ayarlar
    .filter((a) => a.href !== hesabimYolu)
    .map((a) => ({ href: a.href, ekYollar: a.ekYollar ?? [], ad: a.label }));

  /*
   * KIRMIZI NOKTA: bağlantı listesi OKUNAMADIYSA da yanıyor. "Sorun yok" ile
   * "bakamadım" aynı şey değil; okunamayan liste Bağlantılar bölümünde
   * sebebiyle yazılıyor, nokta oraya götürüyor.
   */
  let sorunlu = false;
  if (sekmeler.some((s) => s.href === baglantilarYolu)) {
    if (baglantilar !== undefined) {
      sorunlu = baglantilar === null || baglantilar.some(baglantiSorunluMu);
    } else {
      try {
        sorunlu = ((await serverApiFetch<ConnectionSummary[]>('/connections')) ?? []).some(baglantiSorunluMu);
      } catch {
        sorunlu = true;
      }
    }
  }

  return (
    <div className="grid w-full gap-6">
      <SayfaBasligi ust={ust} bolum="Ayarlar" baslik={baslik} aciklama={aciklama} eylemler={eylemler} />
      {sekmeler.length > 1 ? (
        <SayfaIcDuzen menu={<AyarSekmeleri sekmeler={sekmeler} uyarili={sorunlu ? [baglantilarYolu] : []} />}>
          {children}
        </SayfaIcDuzen>
      ) : (
        <div className="grid min-w-0 content-start gap-5">{children}</div>
      )}
    </div>
  );
}
