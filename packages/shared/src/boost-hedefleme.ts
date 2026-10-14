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

export const CINSIYET: Record<string, string> = {
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
      /*
       * BOŞ = TÜRKİYE. Yayın yolu konumsuz ön ayarda Türkiye'yi AÇIKÇA
       * gönderiyor; özetin "bütün ülkeler" ya da boş bir satır göstermesi
       * yayınlanan kampanyayı yanlış anlatırdı.
       */
      {
        etiket: 'Konum',
        deger: settings.locations.length > 0 ? konumMetni(settings.locations) : 'Türkiye',
      },
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

  const satirlar: HedeflemeSatiri[] = [
    { etiket: 'Konum', deger: konumMetni(settings.locations) },
    { etiket: 'Yaş', deger: `${settings.ageMin}-${settings.ageMax}` },
    { etiket: 'Cinsiyet', deger: CINSIYET[settings.genders] ?? settings.genders },
  ];
  /*
   * ŞABLONDAN GELEN ALANLAR DA ÖZETTE. `?? []`: alanlar sonradan eklendi ve
   * ham JSON'dan okunan eski bir ön ayarda hiç yok. Kartta görünmeyen bir
   * ilgi alanı, onaylanan reklamın kime gittiğini gizlemek olurdu.
   * SESSİZ KESME YOK: kaçının gizlendiği yazıyor.
   */
  const ilgi = settings.interests ?? [];
  if (ilgi.length > 0) {
    const adlar = ilgi.slice(0, 3).map((i) => i.name).join(', ');
    satirlar.push({ etiket: 'İlgi', deger: `${adlar}${ilgi.length > 3 ? ` +${ilgi.length - 3}` : ''}` });
  }
  const ozel = settings.ozelKitleler ?? [];
  const dahil = ozel.filter((o) => o.mod === 'dahil');
  const haric = ozel.filter((o) => o.mod === 'haric');
  if (dahil.length > 0) satirlar.push({ etiket: 'Özel kitle', deger: dahil.map((o) => o.name).join(', ') });
  if (haric.length > 0) satirlar.push({ etiket: 'Hariç', deger: haric.map((o) => o.name).join(', ') });
  return satirlar;
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
export function konumMetni(locations: Array<{ key: string; label?: string }>): string {
  if (locations.length === 0) return 'Türkiye geneli';
  /*
   * ADI OLMAYAN KONUM HAM ANAHTARLA GÖSTERİLMEZ (2026-10-14 canlı denetim).
   * Ad alanı ön ayara sonradan eklendi; eski ön ayarlarda yalnız Meta
   * anahtarı var ve kart "Konum 3684" yazıyordu: kullanıcı için anlamsız,
   * üstelik bir posta kodu ya da hata kodu sanılabilir. Adsız olanlar
   * SAYILIYOR (sessiz düşürme yok) ve nasıl düzeleceği söyleniyor.
   */
  const adlar = locations.flatMap((l) => (l.label ? [l.label] : []));
  const adsiz = locations.length - adlar.length;
  const gorunen = adlar.length <= 3 ? adlar.join(', ') : `${adlar.slice(0, 3).join(', ')} +${adlar.length - 3}`;
  if (adsiz === 0) return gorunen;
  const adsizMetni = `${adsiz} konum (adı kayıtlı değil; ön ayarı yeniden kaydet)`;
  return gorunen ? `${gorunen} · ${adsizMetni}` : adsizMetni;
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

/**
 * ═══ BOOST NEYİ ÖLÇÜYOR (pazar araştırması 2026-10-15) ═══
 *
 * Kullanıcı boost'tan satış ya da form bekliyordu; boost bunu ölçmüyor.
 * Kart artık neye göre kurulduğunu ve satış/form için yolun AdvCampaign
 * olduğunu söylüyor.
 *
 * ÖN AYARDAKİ AMAÇ META'YA GİTMİYOR. Form "Erişim" ve "Profil ziyareti"
 * sunuyor ama yayın yolu (`meta.provider.ts`, boost reklam seti) her
 * zaman `POST_ENGAGEMENT` yazıyor ve `settings.goal`u okuyan hiçbir kod
 * yok. Kartın seçilen amacı göstermesi, olmayan bir kurulumu anlatmak
 * olurdu: yazılan GERÇEK hedef, fark varsa açıkça söyleniyor. Seçeneği
 * yayına bağlamak platforma yazmak demek, ayrı karar (PROGRESS.md).
 *
 * Google (YouTube Demand Gen) teklifi `TARGET_SPEND` = tıklamayı
 * artırmak (`google-demandgen.ts`); dönüşüm takibi gerektirmiyor.
 */
export const BOOST_AMAC_ETIKETI: Record<string, string> = {
  engagement: 'Etkileşim',
  reach: 'Erişim',
  profile_visits: 'Profil ziyareti',
};

export const BOOST_ADVCAMPAIGN_NOTU = 'Satış ya da form için AdvCampaign';

export interface BoostHedefi {
  /** Platforma GERÇEKTEN yazılan optimizasyonun okunabilir hâli. */
  deger: string;
  /** Ön ayarda seçilen amaç yazılandan farklıysa; yoksa null. */
  fark: string | null;
}

export function boostHedefi(settings: AutoBoostPresetSettings): BoostHedefi {
  if (settings.platform === 'google') {
    return { deger: 'Tıklama (YouTube izleyicisi)', fark: null };
  }
  const secilen = settings.goal ?? 'engagement';
  return {
    deger: 'Etkileşim (beğeni, yorum, kaydetme)',
    fark:
      secilen === 'engagement'
        ? null
        : `Ön ayarda “${BOOST_AMAC_ETIKETI[secilen] ?? secilen}” seçili ama boost bugün etkileşime göre kuruluyor`,
  };
}
