/**
 * ═══ ADVCAMPAIGN META REKLAMI — KAMPANYA ETİKETİ (docs/veri-kaynagi/MIMARI.md Ç-6) ═══
 *
 * GA4 trafiğini Meta kampanyasına bağlamanın KESİN yolu `utm_campaign` =
 * kampanya KİMLİĞİ: ad değişince ad eşlemesi kopar, aynı adlı iki kampanya
 * belirsiz kalır (shared veri-kaynagi/esleme.ts). Meta `url_tags`taki
 * `{{campaign.id}}` makrosunu tıklama anında doldurur; kimlik adla değişmez.
 *
 * KOŞUL (yönetici kararı, 2026-10-12): bağlantıda ZATEN bir `utm_` parametresi
 * varsa DOKUNULMAZ. Müşterinin kendi kampanya etiketi (CRM'i, raporu ona
 * bağlı) ezilmez; o kampanya ad eşlemesine düşer ve ekran bunu "adla
 * eşlendi" diye yazar. İki etiket birden göndermek de olmaz: Meta `url_tags`i
 * bağlantıya EKLİYOR, aynı anahtar iki kez gider ve Analytics hangisini
 * okuyacağını kendisi seçer.
 *
 * YALNIZ SİTEYE GİDEN TIKLAMA: form, WhatsApp ve arama niyetinde tıklama
 * siteye düşmüyor; etiket ya işe yaramaz ya da (WhatsApp sabit bağlantısı)
 * Meta'nın beklediği adresi değiştirir.
 *
 * ÖLÇÜLMEDİ (Ajan 5): Meta'nın geri okumada `url_tags`i makrosuyla AYNEN
 * döndürdüğü (yanki.ts genel kıyası fark derse yayın "fark"ta durur ve bu
 * doğru davranış: bilinmeyen farkta açılmaz).
 */
export const ADV_UTM_ETIKETI = 'utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}';

const SITE_DISI_NIYETLER: ReadonlySet<string> = new Set(['FORM', 'WHATSAPP', 'TELEFON']);

/**
 * AÇIK MI — `META_UTM_ETIKETI=1` (configuration.ts doğruluyor). Varsayılan
 * KAPALI; nedeni yukarıdaki "ÖLÇÜLMEDİ" maddesi: ölçülmemiş bir alanı canlı
 * yayın yoluna sokmak, bugün çalışan her yayını "fark"ta durdurabilir.
 * Ortamdan okunuyor çünkü taslak derleyicisi saf bir fonksiyon ve servis
 * bağlamı taşımıyor; kapatmak için yeniden derleme gerekmesin.
 */
export function utmEtiketiAcik(ortam: NodeJS.ProcessEnv = process.env): boolean {
  return ortam.META_UTM_ETIKETI === '1';
}

export function advUtmEtiketi(
  niyet: string,
  hedefAdres: string | null | undefined,
  acik: boolean = utmEtiketiAcik(),
): string | null {
  if (!acik) return null;
  if (SITE_DISI_NIYETLER.has(niyet)) return null;
  if (!hedefAdres || !/^https?:\/\//i.test(hedefAdres)) return null;
  // Sorgu VE parça (#) içinde ara: bazı siteler etiketi parçaya koyuyor ve
  // Analytics onu okuyorsa ikinci bir etiket yine çakışır. Büyük/küçük harf
  // duyarsız: "UTM_Source" da bir etiket.
  const kuyruk = hedefAdres.slice(hedefAdres.search(/[?#]/) >= 0 ? hedefAdres.search(/[?#]/) : hedefAdres.length);
  if (/(^|[?&#])utm_[a-z_]+=/i.test(kuyruk)) return null;
  return ADV_UTM_ETIKETI;
}
