/**
 * ═══ ELLE YAZILMIŞ EKRAN METNİ — İSTİSNA LİSTESİ, YALNIZ KÜÇÜLÜR ═══
 *
 * Başlangıç: 2026-10-15, iki dilli panelin altyapısı (D0) kurulurken
 * bugünkü sayılarla. 278 dosya; toplam `turkce` 4929, `jsx` 1740.
 * Sayaçlar `dil-tarama.ts`te.
 *
 * KURAL: bir dosyanın metnini sözlüğe (`dil/sozlukler/`) taşıdığında
 * sayısını DÜŞÜR, sıfırlandıysa satırı SİL. Bekçi iki yönlü: sayı artarsa
 * da (yeni elle yazılmış metin) azalıp burada eski sayı kalırsa da düşer.
 * Buraya YENİ satır ya da daha BÜYÜK sayı yazmak bu listenin amacını iptal
 * eder: o metin İngilizce ekranda Türkçe görünür ve hiçbir test düşmez.
 *
 * Sözlüğe geçiş dalgaları `docs/i18n/MIMARI.md` §6'da (D1 site/yasal/giriş,
 * D2 panel kabuğu, D3 modüller). Bir dosyada kalan sayı bazen ekran metni
 * değil (geliştirici günlüğü, tarih biçimi `'tr-TR'`, Türkçe yol adı):
 * o zaman metin sözlüğe değil, gerekçesiyle `KALICI_ISTISNALAR`a gider.
 */
export type MetinTuru = 'turkce' | 'jsx';

export const ISTISNALAR: Record<string, Partial<Record<MetinTuru, number>>> = {
  'app/(dashboard)/error.tsx': { turkce: 1 },
  'app/(dashboard)/kurulum/page.tsx': { turkce: 19, jsx: 1 },
  'app/(dashboard)/reklam/page.tsx': { jsx: 1 },
  'app/(dashboard)/strateji/page.tsx': { jsx: 1 },
  'app/(legal)/veri-silme/page.tsx': { jsx: 1 },
  'app/opengraph-image.tsx': { jsx: 4 },
  'app/r/[token]/page.tsx': { turkce: 4 },
  'components/advetics-logo.tsx': { turkce: 1, jsx: 3 },
  'components/autoboost/youtube-prova-sonucu.tsx': { jsx: 1 },
  'components/bilgi-bankasi/sekmeler.ts': { turkce: 3 },
  'components/budget/butce-temposu.ts': { turkce: 8 },
  'components/connections/kanal-kartlari.tsx': { jsx: 1 },
  'components/email/eposta-ayarlari.tsx': { jsx: 1 },
  'components/forms/form-builder.tsx': { turkce: 3, jsx: 5 },
  'components/forms/form-onizleme.tsx': { turkce: 2, jsx: 1 },
  'components/guncelleme-hali.ts': { turkce: 1 },
  'components/hesap/iki-adim-paneli.tsx': { jsx: 1 },
  'components/iyilestir/asistan-sekmesi.tsx': { jsx: 1 },
  'components/iyilestir/sinyaller-sekmesi.tsx': { jsx: 1 },
  'components/kurulum/baslangic.tsx': { turkce: 38, jsx: 2 },
  'components/kurulum/kurulum-akisi.ts': { turkce: 2 },
  'components/kurulum/kurulum-sihirbazi.tsx': { turkce: 42, jsx: 7 },
  'components/kurulum/kurulum-sonucu.tsx': { turkce: 9, jsx: 4 },
  'components/kurulum/platform-adimi.tsx': { turkce: 12, jsx: 2 },
  'components/kurulum/sihirbaz-akisi.ts': { turkce: 26 },
  'components/kurulum/sihirbaz-rayi.tsx': { turkce: 11, jsx: 2 },
  'components/kurulum/sirket-sec.tsx': { turkce: 6 },
  'components/kurulum/tamamlama.tsx': { turkce: 60, jsx: 17 },
  'components/landing/cerez.ts': { turkce: 22 },
  'components/landing/site-footer.tsx': { jsx: 2 },
  'components/leads/lead-table.tsx': { jsx: 2 },
  'components/logout-button.tsx': { turkce: 1 },
  'components/marka-merkezi/bildirimler-bolumu.tsx': { jsx: 1 },
  'components/marka-merkezi/kitleler-bolumu.tsx': { jsx: 1 },
  'components/marka-merkezi/veri-kaynaklari.tsx': { jsx: 2 },
  'components/rehber/adim-butce.tsx': { jsx: 2 },
  'components/rehber/adim-reklam.tsx': { jsx: 10 },
  'components/rehber/ikonlar.tsx': { jsx: 3 },
  'components/rehber/rehber-ekrani.tsx': { jsx: 2 },
  'components/rehber/rehber-kaydedici.ts': { jsx: 1 },
  'components/rehber/rehber-mantik.ts': { jsx: 2 },
  'components/report/conversion-chart.tsx': { turkce: 2, jsx: 1 },
  'components/report/kitle-ozeti.tsx': { turkce: 8, jsx: 2 },
  'components/report/print-button.tsx': { jsx: 1 },
  'components/report/report-document.tsx': { turkce: 49, jsx: 41 },
  'components/rules/rule-controls.tsx': { jsx: 1 },
  'components/strateji/arama-bolumu.tsx': { jsx: 1 },
  'components/strateji/butce-bolumu.tsx': { jsx: 3 },
  'components/strateji/hesap.ts': { turkce: 3 },
  'components/strateji/matris-bolumu.tsx': { jsx: 2 },
  'components/strateji/ortak.tsx': { jsx: 1 },
  'components/strateji/v2/adim-gonder.tsx': { jsx: 1 },
  'components/strateji/v2/adim-inceleme.tsx': { turkce: 1, jsx: 1 },
  'components/strateji/v2/adim-plan.tsx': { turkce: 2, jsx: 5 },
  'components/strateji/v2/belge.tsx': { jsx: 5 },
  'components/strateji/v2/gonder.tsx': { jsx: 1 },
  'components/strateji/v2/hesap.ts': { jsx: 2 },
  'components/strateji/v2/kalem-duzenleyici.tsx': { jsx: 2 },
  'components/strateji/v2/kelime-bolumu.tsx': { jsx: 2 },
  'components/strateji/v2/onay-kutusu.tsx': { jsx: 1 },
  'components/strateji/v2/ortak.tsx': { jsx: 1 },
  'components/tenancy/danisman-atama.ts': { jsx: 1 },
  'components/tenancy/rol-matrisi.tsx': { jsx: 1 },
  'components/tenancy/team-manager.tsx': { jsx: 1 },
  'components/tenancy/team-screen.tsx': { jsx: 1 },
  'components/tenancy/ust-hesap-ekibi.tsx': { jsx: 1 },
  'components/ui/pencere.tsx': { jsx: 1 },
  'lib/api.ts': { turkce: 7 },
  'lib/form-onizleme.ts': { turkce: 1 },
  'lib/format.ts': { turkce: 5 },
  'lib/kurulum-beyanlari.ts': { jsx: 1 },
  'lib/nav-sections.ts': { turkce: 11 },
  'lib/sayfa-workspace.ts': { turkce: 1 },
  'lib/sayfa-yardimcilari.ts': { turkce: 1 },
  'lib/terimler.ts': { turkce: 21 },
};

/**
 * KALICI İSTİSNALAR — gerekçeli, AYNI kesinlikle sayılıyor (büyüyemez).
 */
export const KALICI_ISTISNALAR: Record<string, Partial<Record<MetinTuru, number>>> = {
  // İlk ziyaret ekranının başlığı İKİ DİLDE BİRDEN yazılı ("Dilinizi seçin /
  // Choose your language"): kişinin hangisini okuduğunu henüz bilmiyoruz,
  // sözlükten seçmek tam olarak sorulan soruyu varsaymak olurdu.
  'components/ui/dil-secimi.tsx': { turkce: 1, jsx: 2 },
};
