import {
  FORM_YAYIN_BELIRSIZ_NOTU,
  PREFILL_LABELS,
  TESEKKUR_DUGME_ETIKETI,
  tesekkurDugmesiTuru,
  type FormOnizlemesi,
  type LeadFormRecord,
  type RehberFormListesi,
} from '@advetics/shared';

/**
 * ANLIK FORM ÖNİZLEMESİ VE REHBERDEKİ FORM AKIŞI — saf karar katmanı.
 *
 * Panelde bileşen render eden test altyapısı yok (`vitest.config.ts`), yani
 * bileşenin içindeki karar yalnız kaynak taramasıyla sınanabilirdi ve o
 * tarama yanlış şeyi kilitleyebiliyor (CLAUDE.md "REACT EFFECT'İNİN İÇİNDEKİ
 * KARAR"). Hangi ekranın çizileceği, yayından sonra neyin seçileceği ve
 * düğmenin neden görünmediği burada; bileşen yalnız çiziyor.
 */

export type EkranHali = 'var' | 'yok' | 'okunamadi';

export interface OnizlemeEkrani {
  tur: 'giris' | 'sorular' | 'gizlilik' | 'tesekkur';
  /** Ekranın kullanıcıya görünen adı (adım başlığı). */
  ad: string;
  hal: EkranHali;
  /** `yok`/`okunamadi` hâlinin cümlesi; `var`da da ek bilgi olabilir. */
  not: string | null;
}

const OKUNAMADI = "Meta'dan okunamadı.";

/**
 * Önizlemenin ekran listesi, Meta'daki SIRAYLA: giriş → sorular → gizlilik →
 * teşekkür.
 *
 * Giriş ekranı Meta'da İSTEĞE BAĞLI: yoksa listeye HİÇ girmez (kişi doğrudan
 * sorulara geçer; boş bir giriş kutusu çizmek formda olmayan bir ekranı
 * göstermek olurdu). Diğer üçü her formda var: Meta'dan gelmediyse
 * `okunamadi` (boş kutu DEĞİL), Advetics taslağında henüz yazılmadıysa `yok`.
 */
export function onizlemeEkranlari(o: FormOnizlemesi): OnizlemeEkrani[] {
  const okunamadi = (b: FormOnizlemesi['okunamayanlar'][number]) => o.okunamayanlar.includes(b);
  const ekranlar: OnizlemeEkrani[] = [];
  if (o.giris) ekranlar.push({ tur: 'giris', ad: 'Giriş', hal: 'var', not: null });

  ekranlar.push(
    okunamadi('sorular')
      ? { tur: 'sorular', ad: 'Sorular', hal: 'okunamadi', not: `Sorular ${OKUNAMADI}` }
      : o.sorular.length > 0
        ? { tur: 'sorular', ad: 'Sorular', hal: 'var', not: null }
        : { tur: 'sorular', ad: 'Sorular', hal: 'yok', not: 'Henüz soru seçilmedi.' },
  );

  ekranlar.push(
    o.gizlilik
      ? {
          tur: 'gizlilik',
          ad: 'Gizlilik',
          hal: 'var',
          // Onay kutuları Meta'dan İSTENMİYOR (alt alanları doğrulanmadı):
          // "yok" demek yanlış olurdu, "okunmuyor" diyoruz.
          not: o.onaylar === null ? "Ek onay kutuları burada gösterilmiyor; varsa Meta'da görünür." : null,
        }
      : okunamadi('gizlilik')
        ? { tur: 'gizlilik', ad: 'Gizlilik', hal: 'okunamadi', not: `Gizlilik politikası adresi ${OKUNAMADI}` }
        : { tur: 'gizlilik', ad: 'Gizlilik', hal: 'yok', not: 'Gizlilik politikası adresi henüz yazılmadı. Meta bu adres olmadan formu kabul etmiyor.' },
  );

  ekranlar.push(
    o.tesekkur
      ? { tur: 'tesekkur', ad: 'Teşekkür', hal: 'var', not: null }
      : okunamadi('tesekkur')
        ? { tur: 'tesekkur', ad: 'Teşekkür', hal: 'okunamadi', not: `Teşekkür ekranı ${OKUNAMADI}` }
        : { tur: 'tesekkur', ad: 'Teşekkür', hal: 'yok', not: 'Teşekkür ekranı henüz yazılmadı.' },
  );
  return ekranlar;
}

/** Oluşturucunun alanları (kayıt ya da düzenlenen hâl). */
export type FormTaslagi = Pick<
  LeadFormRecord,
  | 'name'
  | 'headline'
  | 'intro'
  | 'prefillQuestions'
  | 'customQuestions'
  | 'privacyPolicyUrl'
  | 'privacyPolicyLinkText'
  | 'consentBoxes'
  | 'thankYouHeadline'
  | 'thankYouBody'
  | 'thankYouCtaText'
  | 'thankYouCtaUrl'
> & {
  status?: LeadFormRecord['status'] | null;
  /** Verilmezse eski kural (adres varsa site düğmesi): `tesekkurDugmesiTuru`. */
  thankYouCtaType?: LeadFormRecord['thankYouCtaType'] | null;
  thankYouPhone?: string | null;
};

const dolu = (v: string | null | undefined): string | null => (v && v.trim() ? v.trim() : null);

/**
 * Advetics taslağı → ortak önizleme biçimi. META'YA GİDECEK HÂLİN AYNASI:
 * eşleme `MetaProvider.createLeadForm` ile aynı kuralları izliyor. Giriş
 * kartı yalnız başlık ya da açıklama varsa gönderiliyor (başlık yoksa form
 * adı, düğme "Devam"); teşekkür düğmesi türüne göre (`tesekkurDugmesiTuru`):
 * site düğmesi adresiyle, "Bizi ara" numarasıyla, "Düğme yok"ta hiç. Burada başka bir
 * kural yazmak, önizlemenin yayınlanacak formdan farklı bir şey göstermesi
 * demek.
 */
export function kayittanOnizleme(f: FormTaslagi): FormOnizlemesi {
  const baslik = dolu(f.headline);
  const aciklama = dolu(f.intro);
  const adres = dolu(f.privacyPolicyUrl);
  const tyTur = tesekkurDugmesiTuru({ thankYouCtaType: f.thankYouCtaType ?? null, thankYouCtaUrl: f.thankYouCtaUrl });
  const tyAdres = tyTur === 'VIEW_WEBSITE' ? dolu(f.thankYouCtaUrl) : tyTur === 'CALL_BUSINESS' ? dolu(f.thankYouPhone) : null;
  const tesekkur = {
    baslik: dolu(f.thankYouHeadline),
    metin: dolu(f.thankYouBody),
    dugme: tyTur === 'NONE' ? null : (dolu(f.thankYouCtaText) ?? TESEKKUR_DUGME_ETIKETI[tyTur]),
    adres: tyAdres,
  };
  return {
    kaynak: 'advetics',
    ad: dolu(f.name) ?? 'Adsız form',
    durum: f.status ?? null,
    giris: baslik || aciklama ? { baslik: baslik ?? dolu(f.name), maddeler: aciklama ? [aciklama] : [], dugme: 'Devam' } : null,
    soruBasligi: null,
    sorular: [
      ...f.prefillQuestions.map((q) => ({ tur: q, etiket: PREFILL_LABELS[q], otomatikDolu: true, secenekler: [] })),
      ...f.customQuestions.map((q) => ({
        tur: 'CUSTOM',
        etiket: q.label.trim(),
        otomatikDolu: false,
        secenekler: q.type === 'multiple_choice' ? q.options : [],
      })),
    ],
    gizlilik: adres ? { adres, metin: dolu(f.privacyPolicyLinkText) } : null,
    onaylar: f.consentBoxes.map((c) => ({ metin: c.text, zorunlu: c.required })),
    tesekkur: tesekkur.baslik || tesekkur.metin || tesekkur.dugme ? tesekkur : null,
    okunamayanlar: [],
  };
}

/**
 * Yeni formun gizlilik adresi ÖNERİSİ: seçili sayfanın Meta'da yayında
 * formlarından ilk https adres. Marka Merkezi'nde gizlilik adresi alanı YOK
 * (`hazirlik.ts` notu); siteden "/gizlilik" türetmek uydurma olurdu. Kaynak
 * kullanıcıya yazılıyor ki yanlışsa değiştirsin. Yoksa `null`: alan boş ve
 * zorunlu kalır.
 */
export function gizlilikOnerisi(satirlar: RehberFormListesi['satirlar']): { adres: string; kaynak: string } | null {
  const f = satirlar.find((x) => x.gizlilikAdresi && /^https:\/\/\S+\.\S+/i.test(x.gizlilikAdresi));
  return f?.gizlilikAdresi ? { adres: f.gizlilikAdresi, kaynak: `"${f.ad}" formundaki adres` } : null;
}

/**
 * Yayından sonra rehberde ne seçilecek. Seçimin değeri Meta form kimliği
 * (seçici listesi Meta'nın): yalnız `published` ve sayısal kimlik taşıyan
 * kayıt seçilir. Yayın düştüyse SEÇİM YAPILMAZ ve sebep Meta'nın cümlesi
 * (`error`); form taslak olarak durur, kaybolmaz.
 */
export function yayinSonrasiSecim(
  r: Pick<LeadFormRecord, 'status' | 'externalFormId' | 'error'> & { readbackWarning?: string | null },
): { tur: 'sec'; formId: string } | { tur: 'uyari'; formId: string; uyari: string } | { tur: 'secilmedi'; sebep: string } {
  if (r.status === 'published' && r.externalFormId && /^\d{1,30}$/.test(r.externalFormId)) {
    // GERİ OKUMA UYARISI VARSA OTOMATİK SEÇİLMEZ: KVKK kutusu düşmüş (ya da
    // doğrulanamamış) bir form sessizce reklama bağlanırdı. Ekran uyarıyı
    // gösterir; seçim kullanıcının bilinçli "Yine de kullan"ıyla.
    if (r.readbackWarning) return { tur: 'uyari', formId: r.externalFormId, uyari: r.readbackWarning };
    return { tur: 'sec', formId: r.externalFormId };
  }
  return { tur: 'secilmedi', sebep: r.error ?? "Form Meta'da yayınlanmadı; taslak olarak duruyor." };
}

/**
 * "Form oluştur" düğmesi görünsün mü; görünmüyorsa NEDEN. Rehbere zaten
 * `bulk.write` ile giriliyor (sayfa kapısı); seçilebilir bir form için
 * YAYIN gerekiyor (`bulk.publish`). Yayınlayamayan kullanıcıya düğmeyi
 * göstermek, seçemeyeceği bir taslak ürettirmek olurdu.
 */
export function formOlusturmaDurumu(p: { sayfaId: string | null; yayinIzni: boolean }): { goster: true } | { goster: false; sebep: string } {
  if (!p.sayfaId) return { goster: false, sebep: 'Form oluşturmak için önce Nerede adımında Facebook sayfasını seç.' };
  if (!p.yayinIzni) return { goster: false, sebep: 'Form yayınlama yetkin yok; yeni form için workspace yöneticine danış.' };
  return { goster: true };
}

/**
 * Seçili sayfanın Meta'ya ÇIKMAMIŞ Advetics formları (taslak ya da yayını
 * düşmüş): rehberde "yarım kalan formlar" olarak görünür, kullanıcı açıp
 * yayınlayabilir. Yayın düşünce pencere kapatılırsa form KAYBOLMAMALI.
 */
/**
 * DÖRT HÂL, DÖRDÜ DE LİSTEDE: taslak, yayınlanamadı (yarıda kaldıysa da),
 * yayınlanıyor ve yayın belirsiz. Belirsizi listeden düşürmek, Meta'da
 * açılmış olabilecek bir formu kullanıcının gözünden kaçırmak olurdu.
 */
const YARIM_DURUMLAR: readonly LeadFormRecord['status'][] = ['draft', 'failed', 'publishing', 'uncertain'];

/** Rehberin "Yarım kalan formlar" satırındaki durum cümlesi. */
export function yarimFormDurumu(k: Pick<LeadFormRecord, 'status' | 'error'>): string {
  if (k.status === 'publishing') return 'Yayınlanıyor; birkaç dakika sonra listeyi yenile';
  if (k.status === 'uncertain') return `${FORM_YAYIN_BELIRSIZ_NOTU} Yeniden deneme Formlar'da, onayla.`;
  if (k.status === 'failed') return `Yayınlanamadı${k.error ? `: ${k.error}` : ''}`;
  return 'Taslak';
}

export function sayfaTaslaklari(kayitlar: readonly LeadFormRecord[], sayfaId: string | null): LeadFormRecord[] {
  if (!sayfaId) return [];
  return kayitlar
    .filter((k) => k.socialProfileId === sayfaId && YARIM_DURUMLAR.includes(k.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Yarım kalan form YENİDEN yayınlanabilir mi. Yayını belirsiz (`publishing`)
 * ya da Meta kimliği olan satır HAYIR: Meta'da form açılmış olabilir ve
 * yeniden yayın ikinci form açar (form silinemiyor). Sunucu da reddediyor
 * (`publishBlockers`); düğme yine de gösterilmez.
 */
export function yenidenYayinlanabilir(k: Pick<LeadFormRecord, 'status' | 'externalFormId'>): boolean {
  return (k.status === 'draft' || k.status === 'failed') && !k.externalFormId;
}

