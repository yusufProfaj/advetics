/**
 * ═══ TASARIM SİSTEMİ İSTİSNA LİSTESİ — YALNIZ KÜÇÜLÜR ═══
 *
 * Başlangıç: 2026-10-14, birleşik tasarım sisteminin temeli (Aşama 0) kurulurken
 * bugünkü sayılarla. 86 dosya; toplam dugme 83, modal 11, h1 23, renk 24, degrade 1.
 *
 * Her satır: dosya (`apps/web/src`e göre) → ihlal türü → o dosyada bugün kaç
 * tane olduğu. Türler (`tasarim-sistemi.tarama.ts` `ihlalSay`):
 * - `dugme`  elle birincil/tehlike düğme (`bg-brand`/`bg-danger` + `text-white`
 *            aynı sınıf dizisinde) → `Dugme` / `dugmeSinifi`
 * - `modal`  elle ekranı kaplayan katman (`fixed inset-0`) → `Pencere` / `YanPanel`
 * - `h1`     elle sayfa başlığı → `SayfaBasligi` / `SayfaIskeleti`
 * - `renk`   kılavuz dışı onaltılık renk ya da eski mavi gölge tonu
 * - `degrade` degrade (`bg-gradient-to-*`, `linear/radial-gradient`; maske hariç)
 *
 * KURAL: bir dosyayı düzelttiğinde sayısını DÜŞÜR, sıfırlandıysa satırı SİL.
 * Bekçi iki yönlü: sayı artarsa da azalıp burada eski sayı kalırsa da düşer.
 * Buraya YENİ satır ya da daha BÜYÜK sayı yazmak bu listenin amacını iptal
 * eder; yeni ekran `components/ui/` bileşenleriyle yazılır
 * (`docs/marka/BILESENLER.md`).
 *
 * BİLİNEN KALICI ADAYLAR (sayfa ajanı karar verip gerekçesini yazacak):
 * `components/platform-logo.tsx` (Meta/Google/LinkedIn logolarının kendi
 * renkleri; üçüncü tarafın markası), `components/report/*` belge parçaları
 * (müşteriye giden rapor PDF ile aynı görünmek zorunda), `components/landing/*`
 * (tanıtım sitesi, `.tanitim` kapsamı).
 */
export type IhlalTuru = 'renk' | 'degrade' | 'dugme' | 'modal' | 'h1';

export const ISTISNALAR: Record<string, Partial<Record<IhlalTuru, number>>> = {
  'app/(dashboard)/ads-explorer/galeri/page.tsx': { dugme: 1, h1: 1 },
  'app/(dashboard)/ads-explorer/page.tsx': { h1: 1 },
  'app/(dashboard)/auto-boost/page.tsx': { h1: 1 },
  'app/(dashboard)/dashboard/page.tsx': { h1: 1 },
  'app/(dashboard)/iyilestir/page.tsx': { h1: 2 },
  'app/(dashboard)/kurulum/page.tsx': { h1: 1 },
  'app/(dashboard)/potansiyel-musteriler/page.tsx': { dugme: 1, h1: 1 },
  'app/(dashboard)/raporlar/page.tsx': { h1: 1 },
  'app/(legal)/gizlilik/page.tsx': { h1: 1 },
  'app/(legal)/kosullar/page.tsx': { h1: 1 },
  'app/(legal)/layout.tsx': { dugme: 1 },
  'app/(legal)/veri-silme/page.tsx': { h1: 1 },
  'app/(site)/cozumler/[cozum]/page.tsx': { dugme: 1 },
  'app/(site)/page.tsx': { h1: 1 },
  'app/marka-isareti.tsx': { renk: 1 },
  'components/autoboost/bildirim-havuzu.tsx': { dugme: 3 },
  'components/autoboost/boost-on-ayari.tsx': { modal: 1 },
  'components/autoboost/boost-on-ayarlari-formu.tsx': { dugme: 1 },
  'components/bilgi-bankasi/ai-doldur.tsx': { dugme: 2 },
  'components/bilgi-bankasi/metin-sekmesi.tsx': { dugme: 1 },
  'components/boost/boost-controls.tsx': { dugme: 1 },
  'components/budget/budget-form.tsx': { dugme: 1 },
  'components/budget/pacing-bar.tsx': { degrade: 1 },
  'components/butce/butce-icerik.tsx': { dugme: 1 },
  'components/forms/form-builder.tsx': { dugme: 2 },
  'components/forms/form-onizleme.tsx': { dugme: 1 },
  'components/genel-bakis/kurulum-seridi.tsx': { dugme: 1 },
  'components/kurulum/kurulum-sihirbazi.tsx': { dugme: 2 },
  'components/kurulum/sihirbaz-rayi.tsx': { dugme: 1 },
  'components/landing/kaydirma-filmi.tsx': { renk: 2 },
  'components/landing/site-nav.tsx': { dugme: 2 },
  'components/landing/site-parcalari.tsx': { dugme: 2, h1: 1 },
  'components/leads/geri-besleme-seridi.tsx': { dugme: 2, modal: 1 },
  'components/marka-merkezi/kurulum-listesi.tsx': { dugme: 2 },
  'components/marka-merkezi/varliklar/creative-editor.tsx': { dugme: 1 },
  'components/marka-merkezi/varliklar/creative-library.tsx': { dugme: 1 },
  'components/marka-merkezi/varliklar/formlar.tsx': { dugme: 1 },
  'components/mobil-menu.tsx': { modal: 1 },
  'components/platform-logo.tsx': { renk: 10 },
  'components/rehber/rehber-ekrani.tsx': { h1: 1 },
  'components/rehber/rehber-girisi.tsx': { h1: 2 },
  'components/report/conversion-chart.tsx': { renk: 3 },
  'components/report/faturalar.tsx': { dugme: 1 },
  'components/report/kitle-ozeti.tsx': { renk: 8 },
  'components/report/rapor-gonder.tsx': { dugme: 1, modal: 1 },
  'components/report/rapor-planla.tsx': { dugme: 1, modal: 1 },
  'components/report/report-document.tsx': { h1: 1 },
  'components/report/sablon-yonetimi.tsx': { dugme: 1, modal: 1 },
  'components/report/share-controls.tsx': { dugme: 1 },
  'components/rules/rule-controls.tsx': { dugme: 2 },
  'components/rules/rule-editor.tsx': { dugme: 1 },
  'components/strateji/v2/adim-gonder.tsx': { dugme: 1 },
  'components/strateji/v2/adim-inceleme.tsx': { dugme: 1 },
  'components/strateji/v2/adimlar-soru.tsx': { dugme: 1 },
  'components/strateji/v2/belge.tsx': { h1: 1 },
  'components/tarih-secici.tsx': { dugme: 1 },
  'components/tenancy/danisman-ata.tsx': { dugme: 2 },
  'components/tenancy/iki-adim-sirket-ayari.tsx': { dugme: 1 },
  'components/tenancy/musteri-bilgi-formu.tsx': { dugme: 1 },
  'components/tenancy/musteri-detay.tsx': { dugme: 1, modal: 1 },
  'components/tenancy/special-category-picker.tsx': { dugme: 1 },
  'components/tenancy/team-manager.tsx': { dugme: 2 },
  'components/ust-hesap/ust-hesap-yonetimi.tsx': { dugme: 3 },
  'components/yukleniyor.tsx': { modal: 1 },
};
