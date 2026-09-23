import type { AutoBoostPresetSettings } from './schemas/autoboost.schema';

/**
 * ═══ "KİMİ HEDEFLİYORUM" — KARTTA OKUNABİLİR HÂLİ ═══
 *
 * Hedefleme ön ayarın içinde duruyordu ve kartta HİÇ görünmüyordu: kullanıcı
 * onayladığı reklamın kime gideceğini görmek için ön ayarı açmak zorundaydı.
 * Bu ekranda her onay para harcıyor ve kime harcandığı, ne kadar harcandığı
 * kadar önemli.
 *
 * ÖZET TEK YERDE ÜRETİLİYOR. Kart, düzenleme penceresi ve ön ayar formu aynı
 * cümleyi göstermek zorunda; ikinci bir üretici doğduğu anda ayrışır ve iki
 * ekran aynı ön ayar için farklı kitle anlatır.
 */
export interface HedeflemeSatiri {
  etiket: string;
  deger: string;
}

const CINSIYET: Record<string, string> = {
  all: 'Tüm cinsiyetler',
  male: 'Erkek',
  female: 'Kadın',
};

/** Google yaş kovalarının okunabilir karşılığı. */
const YAS_KOVASI: Record<string, string> = {
  AGE_RANGE_18_24: '18-24',
  AGE_RANGE_25_34: '25-34',
  AGE_RANGE_35_44: '35-44',
  AGE_RANGE_45_54: '45-54',
  AGE_RANGE_55_64: '55-64',
  AGE_RANGE_65_UP: '65+',
};

export function hedeflemeOzeti(settings: AutoBoostPresetSettings): HedeflemeSatiri[] {
  if (settings.platform === 'google') {
    const yas =
      settings.ageRanges.length > 0
        ? settings.ageRanges.map((a) => YAS_KOVASI[a] ?? a).join(', ')
        : 'Tüm yaşlar';
    return [
      { etiket: 'Konum', deger: konumMetni(settings.locations.map((k) => ({ key: k }))) },
      { etiket: 'Yaş', deger: yas },
    ];
  }

  /*
   * KAYITLI KİTLE SEÇİLİYSE DİĞER ALANLAR YOK SAYILIYOR — ve özet de bunu
   * söylemek zorunda. Kitlenin yanında yaş ve konum göstermek, uygulanmayan
   * bir hedeflemeyi uygulanıyormuş gibi anlatmak olurdu; kitle Meta'da kendi
   * lokasyonunu ve yaşını taşıyor.
   */
  if (settings.savedAudienceId) {
    return [{ etiket: 'Kitle', deger: 'Meta’da kayıtlı kitle kullanılıyor' }];
  }

  return [
    { etiket: 'Konum', deger: konumMetni(settings.locations) },
    { etiket: 'Yaş', deger: `${settings.ageMin}-${settings.ageMax}` },
    { etiket: 'Cinsiyet', deger: CINSIYET[settings.genders] ?? settings.genders },
  ];
}

/**
 * Lokasyon listesi → tek satır.
 *
 * ADI VARSA AD, YOKSA ANAHTAR. Şehir anahtarı Meta'nın sayısal kimliği ve
 * ekranda "2343687" yazmak hiçbir soruyu cevaplamıyor; ad alanı sonradan
 * eklendiği için eski ön ayarlarda yok ve orada anahtara düşmek, boş
 * bırakmaktan iyi.
 *
 * HİÇ LOKASYON YOKSA "Türkiye geneli": yayın yolu boş listede `countries:
 * ['TR']` gönderiyor (`meta-targeting.ts`) ve ekranın bunu söylememesi,
 * kullanıcının seçmediği bir hedeflemeyi görmemesi demek olurdu.
 */
function konumMetni(locations: Array<{ key: string; label?: string }>): string {
  if (locations.length === 0) return 'Türkiye geneli';
  const adlar = locations.map((l) => l.label ?? l.key);
  if (adlar.length <= 3) return adlar.join(', ');
  // SESSİZ KESME YOK: kaçının gizlendiği yazıyor.
  return `${adlar.slice(0, 3).join(', ')} +${adlar.length - 3}`;
}

/**
 * Seçicinin döndürdüğü lokasyon → hedefleme kovası.
 *
 * ═══ İKİ KOPYA VARDI ═══
 *
 * Ön ayar formu `{ key, type }` yazıyordu, kart düzenleme penceresi ayrı bir
 * fonksiyon taşıyordu. İkisi de "çalışıyordu" ve ikisi de ADI DÜŞÜRÜYORDU;
 * ad alanı eklenince yalnızca birine eklemek, iki ekranın aynı ön ayar için
 * farklı şey göstermesi olurdu. Bu depoda `meta-targeting` ile bir kez
 * yaşandı.
 *
 * TANINMAYAN TÜR ELENMİYOR, PATLIYOR. `as` ile susturmak, Meta bir gün
 * dördüncü bir tür döndürdüğünde onu sessizce geçirmek olurdu ve o istek
 * yayında "integer bekleniyor" gibi sebebi anlaşılmayan bir hatayla düşerdi.
 */
export function hedeflemeLokasyonu(l: { key: string; type: string; label?: string }): {
  key: string;
  type: 'country' | 'region' | 'city';
  label?: string;
} {
  if (l.type === 'country' || l.type === 'region' || l.type === 'city') {
    return { key: l.key, type: l.type, ...(l.label ? { label: l.label } : {}) };
  }
  throw new Error(`Tanınmayan lokasyon türü: ${l.type}`);
}
