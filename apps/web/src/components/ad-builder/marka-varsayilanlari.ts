import { kitleOzeti, type CampaignGoal, type KitleHedefi, type KitleSablonuRecord, type SikSayfa } from '@advetics/shared';

/**
 * ═══ REKLAM OLUŞTUR, MARKA MERKEZİ'NİN BİLDİĞİNİ SORMUYOR ═══
 *
 * Marka sekmesinde ana amaç ve sık kullanılan sayfalar kaydediliyor; bu
 * dosya olmadan sihirbaz ikisini de her seferinde boş açıyordu ve
 * kullanıcı aynı bilgiyi ikinci kez veriyordu.
 *
 * SAF FONKSİYON, effect değil: panelde bileşen render eden test altyapısı
 * yok ve effect içindeki karar yalnızca kaynak taramasıyla sınanabiliyordu
 * (CLAUDE.md, `domaYazilmali` dersi).
 */

/**
 * "Siteye trafik" hedefinin ilk adresi. Kayıtlı sayfa varsa İLKİ: kullanıcı
 * listeyi reklamın gideceği yerler olarak kurdu. Yoksa workspace kartındaki
 * site. İkisi de yoksa boş — adres UYDURULMUYOR.
 */
export function varsayilanAdres(sikSayfalar: readonly SikSayfa[], clientWebsite: string | null): string {
  return sikSayfalar[0]?.url ?? clientWebsite ?? '';
}

/**
 * Sihirbazın açılış seçimi. Amaç kayıtlıysa seçili gelir (kullanıcı yine
 * değiştirebilir); adres yalnızca amaç "site" ise doldurulur — başka bir
 * amaçta dolu bir adres, gönderilmeyecek bir alanı dolu gösterirdi.
 */
export function baslangicSecimi(p: {
  anaAmac: CampaignGoal | null;
  sikSayfalar: readonly SikSayfa[];
  clientWebsite: string | null;
}): { goal: CampaignGoal | null; linkUrl: string } {
  return {
    goal: p.anaAmac,
    linkUrl: p.anaAmac === 'website' ? varsayilanAdres(p.sikSayfalar, p.clientWebsite) : '',
  };
}

/**
 * ═══ SEÇİLEN KİTLE ŞABLONU → TASLAĞA GİDEN KOPYA ═══
 *
 * KOPYA, referans değil: şablonu sonradan düzenlemek kurulmuş taslağın
 * kitlesini sessizce değiştirmemeli. Boş seçim (`''`) = şablonsuz, sunucu
 * varsayılanı (Türkiye geneli, 18+).
 *
 * LİSTEDE OLMAYAN KİMLİK `null` DEĞİL, HATA: seçili şablon bu arada
 * silindiyse sessizce Türkiye geneline düşmek, kullanıcının "İzmir" görüp
 * ülke geneline reklam vermesi olurdu.
 */
export function kitleHedefi(
  kitleler: readonly KitleSablonuRecord[],
  secilenId: string,
): { hedef: KitleHedefi | null; ozet: string; hata: string | null } {
  if (!secilenId) {
    return { hedef: null, ozet: 'Türkiye geneli · 18+ yaş', hata: null };
  }
  const k = kitleler.find((x) => x.id === secilenId);
  if (!k) {
    return { hedef: null, ozet: '', hata: 'Seçilen kitle artık yok; başka bir kitle seç.' };
  }
  const hedef: KitleHedefi = {
    sablonId: k.id,
    name: k.name,
    locations: k.locations,
    ageMin: k.ageMin,
    ageMax: k.ageMax,
    genders: k.genders,
    interests: k.interests,
  };
  return { hedef, ozet: kitleOzeti(hedef), hata: null };
}

