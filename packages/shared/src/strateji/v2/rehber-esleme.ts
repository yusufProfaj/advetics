import { siteYokRehberKapisi } from '../../kurulum/site-yok';
import {
  amacGorunurMu,
  platformGorunurMu,
  REHBER_AMACLARI,
  REHBER_KAPALI_SEBEBI,
  REHBER_PLATFORMLARI,
  type RehberPlatformu,
} from '../../reklam/rehber/amaclar';
import type { AnahtarKelime, RehberAlanAdi, RehberAlanlari } from '../../reklam/rehber/alanlar';
import type { AlanKaynagi } from '../../reklam/taslak';
import type { StratejiDurumu } from './durum';
import type { StratejiKalemiGirdisi } from './kalem';

/**
 * ═══ STRATEJİ KALEMİ → ADVCAMPAIGN REHBERİ (YENIDEN-TASARIM.md § 4.2-4.3) ═══
 *
 * Aktarım platforma YAZMAZ; rehber TASLAĞI açar. Yayın, her zamanki gibi
 * rehberin onay penceresinde ("reklam kurmanın tek yolu AdvCampaign").
 *
 * İKİ SAF FONKSİYON, TEK YER: `kalemAktarimEngeli` (aktarılabilir mi,
 * hangi platformlar düşer) ve `kalemdenRehberAlanlari` (rehberin alanları).
 * Servis ikisini çağırır, panelin önizlemesi de aynısını çağırır: v1'de
 * önizleme ile servis aynı fonksiyonu okuyordu ama fonksiyon ESKİ
 * derleyicinin listesine bakıyordu; burada kapı rehberin KENDİ kapıları
 * (`platformGorunurMu`, `siteYokRehberKapisi`), ikinci bir açılış listesi YOK.
 */

/** Stratejiden gelen değerin rehberdeki kaynağı. */
export const STRATEJI_ALAN_KAYNAGI = 'strateji' as const satisfies AlanKaynagi;

/**
 * Stratejinin ASLA yazmadığı rehber alanları: para ve hukuk sözü yalnız
 * rehberde, kullanıcının kendi eliyle verilir. `REHBER_IZINLI_KAYNAKLAR`
 * bu alanlarda `strateji` kabul ETMEZ (test kilitli); bu fonksiyon da
 * onları üretmez.
 */
export const STRATEJIDEN_YAZILMAYAN_ALANLAR = [
  'ekKategoriler',
  'satissizPikselOnayi',
  'googlePromosyon',
  'googleFiyatListesi',
] as const satisfies readonly RehberAlanAdi[];

/**
 * Hesap, sayfa, telefon, form, piksel: strateji taşımaz; rehberin var olan
 * önden doldurması (workspace profili, Marka Merkezi) doldurur. Aktarım
 * önizlemesi bunları "rehberde tamamlanacak" diye önceden gösterir.
 */
export const REHBERDE_TAMAMLANAN_ALANLAR = [
  'metaHesabiId',
  'googleHesabiId',
  'sayfaId',
  'instagramId',
  'youtubeKanaliId',
  'hedefAdres',
  'telefon',
  'whatsappNumarasi',
  'whatsappKarsilama',
  'pikselId',
  'formSablonuId',
  'youtubeVideo',
  'enDusukYas',
  // Kayıtlı kitle ve Google'a özel yaş/konum (hedef kitleler 2. parça):
  // kullanıcı Kime adımında kitleyi seçince kopyalanır. Stratejinin kitle
  // kimliği bugün rehbere taşınmıyor; taşınırsa bu karar yeniden verilir.
  'metaKitlesi',
  'googleKitlesi',
  'googleKonumlari',
  'googleYasAraligi',
] as const satisfies readonly RehberAlanAdi[];

/**
 * Eşleme tablosu — belgede (§ 4.2) ve testte aynı liste. Her rehber alanı
 * üç gruptan TAM BİRİNDE: stratejiden yazılan, rehberde tamamlanan,
 * stratejiden asla yazılmayan (`rehber-esleme` testi kapsamı sayar; rehbere
 * yeni alan eklenince düşer ve kararı ister).
 */
export const STRATEJI_REHBER_ESLEMESI = [
  { kalem: 'amac', rehber: 'amac', not: 'Birebir' },
  { kalem: 'meta/google', rehber: 'platformlar', not: 'Aktaranın görebildiği platformlar; düşen platform sebebiyle yazılır' },
  { kalem: 'metaPayi', rehber: 'metaPayiYuzde', not: 'Yalnız iki platform kalırsa' },
  { kalem: 'butce', rehber: 'butce', not: "tip: 'toplam', kalemin dönem toplamı" },
  { kalem: 'baslangic/bitis', rehber: 'takvim', not: 'Başlangıç geçmişteyse YARIN (Meta geçmişi kurulum anına çekiyor, N-09)' },
  { kalem: 'konumlar', rehber: 'konumlar', not: 'Google karşılığı atılır; sunucu eşler (BULGU-4)' },
  { kalem: 'yasMin/yasMax', rehber: 'yasAraligi', not: 'İpucu aralığı; sert alt sınır (enDusukYas) yazılmaz' },
  { kalem: 'metin', rehber: 'metin', not: "Ajans 'Kullan' dediyse strateji, demediyse ai_onerisi (rehberde onay bekler)" },
  { kalem: 'kelimeGrubu', rehber: 'anahtarKelimeler', not: 'Yalnız Google Arama kurgusu ve Google açıksa; en çok 50' },
  { kalem: 'varlikIdleri', rehber: 'medya', not: 'Silinmiş varlık kalemi durdurur (kaynak_silinmis)' },
] as const satisfies ReadonlyArray<{ kalem: string; rehber: RehberAlanAdi; not: string }>;

// ─── Kapı ────────────────────────────────────────────────────────────────

export const KALEM_AKTARIM_ENGELLERI = [
  /** Plan onaylı değil ya da onaydan sonra sürüm değişmiş. */
  'onaysiz',
  /** Amaç bu kullanıcıya hiç açık değil (`REHBER_ACILIS`). */
  'amac_kapali',
  /** Açık platformların hiçbiri kalmadı (açılış, site yok beyanı). */
  'platform_kalmadi',
  /** Kalemin görseli plan onaylandıktan sonra silinmiş. */
  'kaynak_silinmis',
  /** Kalemin bitişi geçmişte: kurulacak gün kalmadı. */
  'tarih_gecti',
  /** Kalem zaten bir rehbere bağlı (atlanmaz: "Rehberde aç" döner). */
  'zaten_aktarildi',
] as const;
export type KalemAktarimEngeli = (typeof KALEM_AKTARIM_ENGELLERI)[number];

export const KALEM_AKTARIM_ENGEL_METNI: Record<KalemAktarimEngeli, string> = {
  onaysiz: 'Strateji onaylanmadı ya da onaydan sonra değişti; yeniden onaylanmalı.',
  amac_kapali: 'Bu amaç AdvCampaign’de henüz açık değil.',
  platform_kalmadi: 'Kampanyanın platformlarının hiçbiri şu an kurulamıyor.',
  kaynak_silinmis: 'Kampanyanın görsellerinden biri silinmiş; onaylanan kreatif seti eksik gitmez.',
  tarih_gecti: 'Kampanyanın bitiş tarihi geçmiş.',
  zaten_aktarildi: 'Bu kampanya AdvCampaign’de zaten açıldı.',
};

export interface KalemAktarimBaglami {
  plan: { durum: StratejiDurumu; surum: number; onaylananSurum: number | null };
  /** Aktaran kişi ajans yöneticisi mi (`deneme` açılışını yalnız o görür). */
  ajansYoneticisi: boolean;
  /** Üç hâlli: `null` = beyanlar okunamadı, KAPATMAZ (`siteYokRehberKapisi`). */
  siteYok: boolean | null;
  /** Kalemin varlıklarından hâlâ var olanlar (aitlik çağıranda denetlenmiş). */
  mevcutVarliklar: ReadonlySet<string>;
  /** Kalem zaten bir rehbere bağlıysa onun kimliği. */
  rehberId: string | null;
  /** İstanbul takvimiyle bugün, `YYYY-MM-DD`. */
  bugun: string;
}

export type KalemAktarimKarari =
  | { tur: 'engel'; engel: KalemAktarimEngeli }
  | {
      tur: 'aktarilabilir';
      platformlar: Record<RehberPlatformu, boolean>;
      /** Kalemde açık olup aktarımda düşen platformlar ve sebebi (sessiz düşme yok). */
      dusenler: Array<{ platform: RehberPlatformu; sebep: string }>;
    };

const GENEL_KAPALI = 'Bu platform bu amaç için AdvCampaign’de henüz açık değil.';

export function kalemAktarimEngeli(
  k: Pick<StratejiKalemiGirdisi, 'amac' | 'meta' | 'google' | 'bitis' | 'varlikIdleri'>,
  b: KalemAktarimBaglami,
): KalemAktarimKarari {
  if (b.plan.durum !== 'onaylandi' || b.plan.onaylananSurum !== b.plan.surum) return { tur: 'engel', engel: 'onaysiz' };
  if (b.rehberId !== null) return { tur: 'engel', engel: 'zaten_aktarildi' };
  if (!amacGorunurMu(k.amac, b.ajansYoneticisi)) return { tur: 'engel', engel: 'amac_kapali' };
  if (k.varlikIdleri.some((v) => !b.mevcutVarliklar.has(v))) return { tur: 'engel', engel: 'kaynak_silinmis' };
  if (k.bitis < yarin(b.bugun)) return { tur: 'engel', engel: 'tarih_gecti' };

  const istenen: Record<RehberPlatformu, boolean> = { meta: k.meta, google: k.google };
  const platformlar: Record<RehberPlatformu, boolean> = { meta: false, google: false };
  const dusenler: Array<{ platform: RehberPlatformu; sebep: string }> = [];
  for (const p of REHBER_PLATFORMLARI) {
    if (!istenen[p]) continue;
    const g = REHBER_AMACLARI[k.amac].google;
    if (p === 'google' && g.kurgu === null) {
      dusenler.push({ platform: p, sebep: g.sebep });
      continue;
    }
    if (!platformGorunurMu(k.amac, p, b.ajansYoneticisi)) {
      dusenler.push({ platform: p, sebep: REHBER_KAPALI_SEBEBI[k.amac]?.[p] ?? GENEL_KAPALI });
      continue;
    }
    const site = siteYokRehberKapisi(k.amac, p, b.siteYok);
    if (!site.acik) {
      dusenler.push({ platform: p, sebep: site.sebep });
      continue;
    }
    platformlar[p] = true;
  }
  if (!platformlar.meta && !platformlar.google) return { tur: 'engel', engel: 'platform_kalmadi' };
  return { tur: 'aktarilabilir', platformlar, dusenler };
}

// ─── Alanlar ─────────────────────────────────────────────────────────────

export interface RehberAlanUretimi {
  alanlar: RehberAlanlari;
  /** Kullanıcıya söylenen değişiklikler (tarih ileri alındı, pay düştü...). */
  notlar: string[];
}

/**
 * Kalem → rehber alanları. `kim` = AKTARAN kişi, `zaman` = sunucu saati.
 * Çıktı `rehberAlanlariSchema` ile geçerli olmak ZORUNDA (testte parse
 * ediliyor); servis yine de yazmadan önce parse eder.
 */
export function kalemdenRehberAlanlari(
  k: StratejiKalemiGirdisi & { butceMicros: bigint },
  karar: Extract<KalemAktarimKarari, { tur: 'aktarilabilir' }>,
  o: { kim: string; zaman: string; bugun: string; kelimeler: readonly AnahtarKelime[] },
): RehberAlanUretimi {
  const notlar: string[] = [];
  const alan = <T>(deger: T, kaynak: AlanKaynagi = STRATEJI_ALAN_KAYNAGI) => ({ deger, kaynak, kim: o.kim, zaman: o.zaman });
  const a: RehberAlanlari = {};
  a.amac = alan(k.amac);
  a.platformlar = alan({ ...karar.platformlar });
  for (const d of karar.dusenler) notlar.push(`${d.platform === 'meta' ? 'Meta' : 'Google'} açılmadı: ${d.sebep}`);

  if (karar.platformlar.meta && karar.platformlar.google && k.metaPayi !== null) {
    a.metaPayiYuzde = alan(k.metaPayi);
  }
  // Kalemin TOPLAM bütçesi. Bir platform düştüyse bütçe kalan platforma
  // KAYMAZ sessizce: rehber tek platformda bütçenin tamamını o platforma
  // verir, bu yüzden not yazılır ve kullanıcı rehberde görüp düzeltir.
  a.butce = alan({ tip: 'toplam' as const, micros: k.butceMicros.toString() });
  if (karar.dusenler.length > 0) notlar.push('Kampanyanın bütçesinin tamamı açık kalan platforma yazıldı; rehberde kontrol et.');

  const ilkGun = yarin(o.bugun);
  const baslangic = k.baslangic < ilkGun ? ilkGun : k.baslangic;
  if (baslangic !== k.baslangic) notlar.push(`Başlangıç geçmişte kaldığı için ${baslangic} yazıldı.`);
  a.takvim = alan({ baslangic, bitis: k.bitis });

  // Google karşılığı ATILIR: istemcinin yazdığı karşılık kabul edilmiyor
  // (rehber BULGU-4); sunucu aktarımdan sonra kendi eşlemesini koşar.
  a.konumlar = alan(k.konumlar.map(({ google: _g, ...r }) => r));
  if (k.yasMin !== null && k.yasMax !== null) a.yasAraligi = alan({ min: k.yasMin, max: k.yasMax });

  if (k.metin) {
    const { kaynak, ...m } = k.metin;
    a.metin = alan(m, kaynak === 'ajans' ? STRATEJI_ALAN_KAYNAGI : 'ai_onerisi');
    if (kaynak === 'ai') notlar.push('Reklam metni öneri olarak geldi; AdvCampaign’de onaylanmalı.');
  }

  const g = REHBER_AMACLARI[k.amac].google;
  if (karar.platformlar.google && g.kurgu === 'ARAMA' && o.kelimeler.length > 0) {
    a.anahtarKelimeler = alan(o.kelimeler.slice(0, 50).map((x) => ({ metin: x.metin, aylikArama: x.aylikArama })));
    if (o.kelimeler.length > 50) notlar.push(`${o.kelimeler.length} kelimeden ilk 50'si aktarıldı.`);
  }
  if (k.varlikIdleri.length > 0) a.medya = alan(k.varlikIdleri.map((varlikId) => ({ varlikId })));
  return { alanlar: a, notlar };
}

/** `YYYY-MM-DD` + 1 gün (UTC aritmetiği, saat dilimi yok). */
export function yarin(gun: string): string {
  const [y, m, d] = gun.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}
