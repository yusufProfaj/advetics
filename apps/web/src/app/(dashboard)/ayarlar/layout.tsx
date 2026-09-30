import { requireSession } from '@/lib/session';
import { AYAR_KISA_AD, kenarBolumleri, visibleSections } from '@/lib/nav-sections';
import { AyarSekmeleri } from '@/components/ayar-sekmeleri';

/**
 * AYARLAR: TEK KAPI, SEKMELİ İÇERİK.
 *
 * Yedi ayar ekranı kenar çubuğunda ayrı satırlardı; artık kenar çubuğunda
 * tek "Ayarlar" satırı var ve ekranlar burada sekme. Sekme listesi menüyle
 * AYNI süzgeçten geçiyor (`visibleSections`): ayrı bir liste yazmak, bir
 * ekranın menüde görünüp sekmede görünmemesi ya da yetkisi olmayana
 * gösterilmesi demekti.
 *
 * Oturum burada ikinci kez isteniyor ama ağa ikinci kez gitmiyor:
 * `getSession` istek başına önbellekli.
 */
export default async function AyarlarDuzeni({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const { ayarlar } = kenarBolumleri(
    visibleSections(session.permissions, {
      ustHesapGorunur: session.platformAdmin || session.managerAccount !== null,
    }),
  );
  const sekmeler = ayarlar.map((a) => ({
    href: a.href,
    ekYollar: a.ekYollar ?? [],
    ad: AYAR_KISA_AD[a.href] ?? a.label,
  }));
  return (
    <div className="space-y-6">
      {sekmeler.length > 1 && <AyarSekmeleri sekmeler={sekmeler} />}
      {children}
    </div>
  );
}
