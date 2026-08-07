import type { AssetRatio, CampaignGoal } from '@advetics/shared';

/**
 * Kampanya tipi → Meta ayarları.
 *
 * BU DOSYA ÜRÜNÜN ÇEKİRDEĞİ. "Reklamcılık bilmeyen biri kullanabilsin" vaadi,
 * pratikte "Meta'nın sorduğu her soruya biz cevap veriyoruz" demek ve o
 * cevapların tamamı burada.
 *
 * Saf fonksiyonlar: veritabanı yok, ağ yok, doğrudan test edilebilir. Bir
 * eşleme hatası SESSİZ — reklam yayınlanır, yanlış kişilere yanlış hedefle
 * gösterilir ve para harcanır. Hata mesajı yok.
 */

export interface MetaCampaignSpec {
  objective: string;
  optimizationGoal: string;
  billingEvent: string;
  /** Meta'nın `destination_type` alanı. Bazı tiplerde yok. */
  destinationType?: string;
  /** `promoted_object` gerekiyor mu ve neyle. */
  promotedObject?: Record<string, string>;
  callToAction: string;
  /** Kullanıcıya gösterilecek düz Türkçe açıklama. */
  explanation: string;
}

/**
 * Üç tipin tam eşlemesi.
 *
 * Her kararın gerekçesi yanında. Bu gerekçeler yorum olarak değil, ürün
 * kararı olarak duruyor: biri değiştirmek istediğinde neyi bozacağını
 * bilmeli.
 */
export function campaignSpec(goal: CampaignGoal, pageExternalId: string): MetaCampaignSpec {
  switch (goal) {
    /**
     * FORM — anlık form (Instant Form).
     *
     * `OUTCOME_LEADS` + `ON_AD`: form Meta'nın içinde açılıyor, web sitesine
     * gitmiyor. Web sitesi olmayan müşteri için tek çalışan yol ve
     * Türkiye'de dönüşüm maliyeti site formundan belirgin düşük — insanlar
     * uygulamadan çıkmıyor.
     *
     * `optimization_goal: LEAD_GENERATION` şart: `LINK_CLICKS` seçilseydi
     * Meta forma tıklayan ama doldurmayan kitleyi optimize ederdi ve
     * "300 tıklama, 4 form" tablosu çıkardı.
     */
    case 'form':
      return {
        objective: 'OUTCOME_LEADS',
        optimizationGoal: 'LEAD_GENERATION',
        // IMPRESSIONS faturalama: Meta lead başına faturalamayı küçük
        // hesaplarda desteklemiyor ve gösterim başına faturalama standart.
        billingEvent: 'IMPRESSIONS',
        destinationType: 'ON_AD',
        promotedObject: { page_id: pageExternalId },
        callToAction: 'SIGN_UP',
        explanation:
          'Reklama tıklayan kişiye Facebook/Instagram içinde bir form açılır. ' +
          'Form doldurulduğunda bilgiler sana gelir. Web sitesi gerekmez.',
      };

    /**
     * WHATSAPP.
     *
     * `destination_type: WHATSAPP` + `promoted_object.page_id`. Meta bu
     * kombinasyonda "Click to WhatsApp" reklamı üretiyor ve tıklayan kişiyi
     * hazır bir mesajla WhatsApp'a atıyor.
     *
     * `CONVERSATIONS` optimizasyonu, `LINK_CLICKS` yerine: tıklayıp
     * WhatsApp'ı kapatan kişi değil, GERÇEKTEN yazan kişi optimize ediliyor.
     * Fark büyük ve bu, ajansın en çok kullanacağı tip.
     */
    case 'whatsapp':
      return {
        objective: 'OUTCOME_LEADS',
        optimizationGoal: 'CONVERSATIONS',
        billingEvent: 'IMPRESSIONS',
        destinationType: 'WHATSAPP',
        promotedObject: { page_id: pageExternalId },
        callToAction: 'WHATSAPP_MESSAGE',
        explanation:
          'Reklama tıklayan kişi doğrudan WhatsApp’ta sana mesaj yazar. ' +
          'Sohbet hazır bir mesajla açılır.',
      };

    /**
     * WEB SİTESİ.
     *
     * `OUTCOME_TRAFFIC` + `LANDING_PAGE_VIEW`, `LINK_CLICKS` DEĞİL.
     *
     * Fark kritik: `LINK_CLICKS` tıklamayı sayıyor, sayfanın açılmasını
     * değil. Yavaş açılan bir sitede tıklayanların yarısı sayfayı hiç
     * görmeden vazgeçiyor ve rapor "500 tıklama" derken siteye 240 kişi
     * giriyor. `LANDING_PAGE_VIEW` sayfası gerçekten açılanları optimize
     * ediyor — pixel gerektiriyor ama Meta pixel yoksa kendiliğinden
     * `LINK_CLICKS`e düşüyor, yani güvenli.
     *
     * `OUTCOME_SALES` KULLANILMIYOR: satış hedefi pixel + tanımlı dönüşüm
     * olayı istiyor ve ikisi de bu üründe henüz yok. Olmayan bir olayı
     * hedeflemek, kampanyanın hiç öğrenmemesi demek.
     */
    case 'website':
      return {
        objective: 'OUTCOME_TRAFFIC',
        optimizationGoal: 'LANDING_PAGE_VIEWS',
        billingEvent: 'IMPRESSIONS',
        callToAction: 'LEARN_MORE',
        explanation:
          'Reklama tıklayan kişi web sitene gider. Sayfayı gerçekten açanlara ' +
          'göre optimize edilir, sadece tıklayanlara göre değil.',
      };
  }
}

/**
 * Hedefleme — yaş, cinsiyet, ilgi alanı SORULMUYOR.
 *
 * Sebep hem ürünsel hem teknik:
 *
 *   · ÜRÜNSEL: reklamcılık bilmeyen biri "25-44 yaş, mobilya ilgisi" gibi bir
 *     daraltmayı yanlış yapar ve kitleyi öldürür. Meta'nın algoritması geniş
 *     kitlede kendi buluyor ve 2023'ten beri geniş hedefleme daraltmadan
 *     tutarlı biçimde daha iyi sonuç veriyor.
 *
 *   · TEKNİK: ilgi alanı seçimi ayrı bir arama uç noktası ve ayrı bir ekran
 *     demek. Kütüphane (BASE) bölümü yazıldığında kayıtlı kitleler buraya
 *     bağlanacak; o zamana kadar geniş hedefleme doğru varsayılan.
 *
 * ÜLKE sabit TR: bu ajansın müşterileri Türkiye'de. Yanlış ülkeye reklam
 * vermek en pahalı sessiz hata olurdu.
 */
export function defaultTargeting(): Record<string, unknown> {
  return {
    geo_locations: { countries: ['TR'] },
    age_min: 18,
    // ÜST YAŞ SINIRI YOK. 65+ Meta'da tek kova ve dışlamak, satın alma gücü
    // yüksek bir kitleyi sebepsiz atmak olur.
  };
}

/**
 * Yerleşimler — hangi görsel oranı yüklendiğine göre.
 *
 * Meta "otomatik yerleşim" öneriyor ve genelde doğru. Ama otomatik yerleşim,
 * dikey görsel yokken de Hikâyeler'de gösteriyor ve kare görseli oraya
 * kırpıyor: metin kesiliyor, sonuç kötü görünüyor.
 *
 * Bu yüzden yerleşimi YÜKLENEN GÖRSELE göre kısıtlıyoruz. Kullanıcı dikey
 * görsel yüklerse Hikâyeler açılıyor, yüklemezse açılmıyor.
 */
export function placementsFor(ratios: AssetRatio[]): Record<string, string[]> {
  const has = (r: AssetRatio): boolean => ratios.includes(r);

  const facebook: string[] = ['feed'];
  const instagram: string[] = ['stream'];

  if (has('vertical')) {
    facebook.push('story', 'facebook_reels');
    instagram.push('story', 'reels');
  }
  if (has('horizontal')) {
    // Sağ sütun yalnızca masaüstü ve yalnızca yatay/kare görselle mantıklı.
    facebook.push('right_hand_column', 'video_feeds');
  }

  return {
    publisher_platforms: ['facebook', 'instagram'],
    facebook_positions: facebook,
    instagram_positions: instagram,
  };
}

/**
 * Görsel oranı → yerleşim eşlemesi (asset_customization_rules için).
 *
 * Meta bu kuralları "hangi yerleşimde hangi görsel" diye okuyor. Her
 * yerleşimin BİR kuralda karşılığı olmak zorunda; karşılıksız kalan bir
 * yerleşimde reklam hiç gösterilmiyor ve Meta bunu hata olarak da bildirmiyor.
 *
 * Bu yüzden kare her zaman VARSAYILAN kural: diğerlerinin kapsamadığı ne
 * varsa oraya düşüyor.
 */
export function customizationRules(ratios: AssetRatio[]): Array<Record<string, unknown>> {
  const rules: Array<Record<string, unknown>> = [];

  if (ratios.includes('vertical')) {
    rules.push({
      customization_spec: {
        publisher_platforms: ['facebook', 'instagram'],
        facebook_positions: ['story', 'facebook_reels'],
        instagram_positions: ['story', 'reels'],
      },
      image_label: { name: labelFor('vertical') },
    });
  }

  if (ratios.includes('horizontal')) {
    rules.push({
      customization_spec: {
        publisher_platforms: ['facebook'],
        facebook_positions: ['right_hand_column', 'video_feeds'],
      },
      image_label: { name: labelFor('horizontal') },
    });
  }

  // VARSAYILAN KURAL EN SONDA. Meta kuralları sırayla değerlendiriyor ve
  // ilk eşleşen kazanıyor; varsayılanı başa koymak diğer kuralları
  // işlevsiz bırakırdı.
  rules.push({
    customization_spec: {
      publisher_platforms: ['facebook', 'instagram'],
      facebook_positions: ['feed'],
      instagram_positions: ['stream'],
    },
    image_label: { name: labelFor('square') },
  });

  return rules;
}

export function labelFor(ratio: AssetRatio): string {
  return `advetics_${ratio}`;
}

/**
 * Bitiş zamanı.
 *
 * `durationDays = 0` süresiz demek ve Meta'ya `end_time` göndermiyoruz.
 * Süresiz kampanya bilinçli bir seçim olmalı; arayüz varsayılan olarak 7 gün
 * öneriyor çünkü "unutulan kampanya" bu üründe en pahalı kullanıcı hatası.
 */
export function endTimeFor(durationDays: number, now: Date): Date | null {
  if (durationDays <= 0) return null;
  return new Date(now.getTime() + durationDays * 86_400_000);
}

/**
 * Toplam taahhüt.
 *
 * Süresiz kampanyada `null` — "sonsuz" diye bir sayı göstermek yerine
 * arayüz "süresiz" yazıyor ve bunun ne demek olduğunu açıklıyor.
 */
export function totalCommitmentMicros(
  dailyBudgetMicros: bigint,
  durationDays: number,
): bigint | null {
  return durationDays > 0 ? dailyBudgetMicros * BigInt(durationDays) : null;
}
