/**
 * ═══ ARAMALI SEÇİCİNİN EŞLEŞME KURALI (Kurulum › hesap / mülk / sayfa) ═══
 *
 * Ajansın tek Google kimliği yüzlerce Analytics mülkü, Meta kimliği yüzlerce
 * hesap ve 500'e kadar sayfa görüyor; düz açılır listede doğru satırı bulmak
 * imkânsızdı (kullanıcı, 2026-10-14: *"ege yazdığımda asdfasdf ege.com da
 * gözüksün"*). Kural bu yüzden BAŞTAN DEĞİL İÇİNDEN eşleşme: yazılan metin
 * adın, notun (Analytics hesabı, GTM hesabı…) ya da kimliğin HERHANGİ bir
 * yerinde geçiyorsa satır listede.
 *
 * Türkçe küçük harf katlaması şart: `toLowerCase()` "İ"yi "i̇" (noktalı iki
 * karakter) yapıyor ve "İzmir" araması "izmir"i bulamıyordu.
 *
 * Kimlikte TİRE YOK SAYILIR: Google Ads hesabı listede "516-174-6317",
 * kullanıcının elindeki ise çoğu zaman "5161746317". Yalnız rakam taşıyan bir
 * aramada iki taraf da rakama indirgeniyor; harfli aramada indirgeme yok
 * (yoksa "a1" gibi bir arama "1" geçen her satırı getirirdi).
 *
 * Saf fonksiyon: panelde bileşen çizen test altyapısı yok, karar burada
 * sınanıyor (`secenek-arama.spec.ts`).
 */
export interface AranabilirSecenek {
  deger: string;
  etiket: string;
  not?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Satırın altında gösterilecek kimlik. Hesap ve sayfa seçeneklerinde `deger`
 * bizim veritabanı satırımızın UUID'si: kullanıcı onu hiçbir yerde görmüyor,
 * ekrana basmak yalnız gürültü (platform kimliği zaten etikette). GA4 mülk
 * numarası, piksel numarası, GTM yolu ise kullanıcının platformda gördüğü
 * şey ve aynı adlı iki mülkü ayıran tek bilgi.
 */
export function gosterilenKimlik(deger: string): string | null {
  return UUID.test(deger) ? null : deger;
}

const katla = (s: string) => s.toLocaleLowerCase('tr');
const rakam = (s: string) => s.replace(/\D/g, '');

export function secenekEslesirMi(s: AranabilirSecenek, arama: string): boolean {
  const q = katla(arama.trim());
  if (!q) return true;
  // ARANAN ALANLAR = GÖRÜNEN ALANLAR. UUID aranırsa "ab" gibi bir arama,
  // ekranda hiçbir harfi eşleşmeyen satırları getirir ve liste yalan söyler.
  const alanlar = [s.etiket, s.not ?? '', gosterilenKimlik(s.deger) ?? ''];
  if (alanlar.some((a) => katla(a).includes(q))) return true;
  // Yalnız rakam ve ayırıcı içeren arama: kimlik araması (tireler/boşluklar yok sayılır).
  if (/^[\d\s-]+$/.test(q) && rakam(q).length >= 3) return alanlar.some((a) => rakam(a).includes(rakam(q)));
  return false;
}

export function secenekSuz<T extends AranabilirSecenek>(secenekler: readonly T[], arama: string): T[] {
  return secenekler.filter((s) => secenekEslesirMi(s, arama));
}

/**
 * Eşleşen parçayı kalın göstermek için metni üçe böler. Eşleşme yoksa
 * (ör. satır nottan ya da kimlikten eşleşti) `null` döner. Türkçe yerelde
 * "İ" → "i" tek karakter ve konumlar örtüşüyor; katlama uzunluğu yine de
 * değiştirirse vurgulamadan vazgeçilir: yanlış harfi kalın yapmak, eşleşmeyi
 * olduğundan başka yerde gösterir.
 */
export function vurguParcalari(metin: string, arama: string): { once: string; eslesen: string; sonra: string } | null {
  const q = katla(arama.trim());
  if (!q) return null;
  const k = katla(metin);
  if (k.length !== metin.length) return null;
  const i = k.indexOf(q);
  if (i < 0) return null;
  return { once: metin.slice(0, i), eslesen: metin.slice(i, i + q.length), sonra: metin.slice(i + q.length) };
}
