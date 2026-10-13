import { Prisma } from '@prisma/client';
import {
  OLCUM_TURLERI,
  OLCUM_TURU_ADLARI,
  REHBER_AMACLARI,
  REHBER_AMAC_KODLARI,
  hesaplarAdresi,
  markaMerkeziAdresi,
  sihirbazAdresi,
  type Gecmis,
  type IsletmeSatiri,
  type StratejiOlcumSatiri,
  REHBER_PLATFORMLARI,
  type OlcumDurumuYaniti,
  type OlcumHucreDurumu,
  type OlcumTuru,
  type RehberAmacKodu,
  type RehberHazirligi,
  type RehberKonumu,
  type RehberPlatformu,
  type RiskBaglami,
  type StratejiGirdileri,
} from '@advetics/shared';
import { platformKapisi } from './motor';
import type { GecmisOkumasi } from './gecmis';
import type { Sorgucu } from './satirlar';

/**
 * ═══ MOTORUN GİRDİLERİ — NEREDEN OKUNUYOR ═══ (YENIDEN-TASARIM.md § 2.3, § 4.6)
 *
 * | Girdi | Kaynak |
 * |---|---|
 * | Marka | `client_profiles` + `clients` (Marka Merkezi) |
 * | Site taraması | `workspace_hazirlama.adimlar` 'site' adımı — OKUMA hazırlamayı TETİKLEMEZ (satır doğrudan okunuyor; `hazirlamaSayacYolu` kuralı) |
 * | "Sitemiz yok", "kullanmıyorum" | `kurulum_beyanlari`, `workspace_kurulum.kullanilmayan_platformlar` |
 * | Ölçüm | `OlcumService.durum` (10 dk önbellek; okunamayan hücre `null`) |
 * | Hesaplar, varsayılan kitle, adres konumu, asgari | rehber hazırlığı (`ReklamHazirlikService.rehberOku`) — rehberle AYNI okuma |
 * | Geçmiş | `insights_daily` kampanya seviyesi (`gecmis.ts`) |
 *
 * Bütün okumalar ÜÇ HÂLLİ: okunamayan girdi `null` ve hiçbir kuralda risk
 * ya da kapatma üretmez (RLS'li tabloda "yok" ile "göremiyorum" aynı şey değil).
 */

/** İstanbul takvimiyle bugün (`YYYY-MM-DD`); `Date`'i gün dizgesine çevirmek saat dilimi kaydırır. */
export function istanbulBugun(simdi: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(simdi);
}

/** Marka Merkezi `ana_amac` (CAMPAIGN_GOALS) → rehber amacı. */
export const ANA_AMAC_REHBER: Record<string, RehberAmacKodu> = { form: 'FORM', whatsapp: 'WHATSAPP', website: 'SITE' };

/**
 * Ölçüm hücresi → "hazır mı". İkincil işlem SAYILIYOR ama teklif onu
 * kullanmıyor: reklam o sonuca optimize olamaz, yani hazır DEĞİL. Hesap
 * yokluğu ayrı bir risk (R-HESAP); burada `null` (çift uyarı olmasın).
 */
export const OLCUM_HAZIR: Record<OlcumHucreDurumu, boolean | null> = {
  kaydediliyor: true,
  platform_sayiyor: true,
  ikincil: false,
  sinyal_yok: false,
  tanim_yok: false,
  platformda_yok: false,
  hesap_yok: null,
  bilinmiyor: null,
};

export interface MarkaSatiri {
  ad: string;
  website: string | null;
  ozel_kategoriler: string[] | null;
  marka_adi: string | null;
  profil_var: boolean;
  sektor: string | null;
  urunler: string[] | null;
  vaatler: string[] | null;
  hedef_kitle: string | null;
  ana_amac: string | null;
  bilgi: string | null;
  uslup: string | null;
}

export async function markaOku(t: Sorgucu, clientId: string): Promise<MarkaSatiri | null> {
  const [m] = await t.$queryRaw<MarkaSatiri[]>(Prisma.sql`
    SELECT c.name AS ad, c.website, c.special_ad_categories AS ozel_kategoriler,
           p.marka_adi, (p.id IS NOT NULL) AS profil_var, p.sektor, p.urun_kategorileri AS urunler, p.vaatler,
           p.hedef_kitle, p.ana_amac, p.marka_bilgileri AS bilgi, p.uslup
      FROM clients c LEFT JOIN client_profiles p ON p.client_id = c.id
     WHERE c.id = ${clientId}::uuid`);
  return m ?? null;
}

export async function siteTaramasiOku(t: Sorgucu, clientId: string): Promise<{ durum: string; baslik: string; neden: string } | null> {
  const [h] = await t.$queryRaw<Array<{ adimlar: unknown }>>(Prisma.sql`SELECT adimlar FROM workspace_hazirlama WHERE client_id = ${clientId}::uuid`);
  const adim = Array.isArray(h?.adimlar) ? (h!.adimlar as Array<{ kod?: string; durum?: string; baslik?: string; neden?: string }>).find((a) => a?.kod === 'site') : undefined;
  if (!adim || typeof adim.baslik !== 'string') return null;
  return { durum: String(adim.durum ?? ''), baslik: adim.baslik, neden: String(adim.neden ?? '') };
}

export async function kullanilmayanPlatformlar(t: Sorgucu, clientId: string): Promise<RehberPlatformu[]> {
  const [k] = await t.$queryRaw<Array<{ k: string[] | null }>>(Prisma.sql`
    SELECT kullanilmayan_platformlar AS k FROM workspace_kurulum WHERE client_id = ${clientId}::uuid`);
  return (k?.k ?? []).filter((p): p is RehberPlatformu => (REHBER_PLATFORMLARI as readonly string[]).includes(p));
}

export async function videoVarMi(t: Sorgucu, clientId: string): Promise<boolean> {
  const [r] = await t.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT count(*)::int AS n FROM assets WHERE client_id = ${clientId}::uuid AND kind = 'video'`);
  return (r?.n ?? 0) > 0;
}

/** En çok SEÇİLİ kelimesi olan grup (Google Arama kalemine). */
export async function enGucluKelimeGrubu(t: Sorgucu, planId: string): Promise<string | null> {
  const [r] = await t.$queryRaw<Array<{ grup: string }>>(Prisma.sql`
    SELECT grup FROM strateji_kelimeleri
     WHERE plan_id = ${planId}::uuid AND secili AND grup IS NOT NULL
     GROUP BY grup ORDER BY count(*) DESC, grup LIMIT 1`);
  return r?.grup ?? null;
}

/** Ölçüm yanıtı → motorun/riskin ölçüm haritası ve ekrandaki hücreler. */
type OlcumHucreleri = Partial<Record<OlcumTuru, Record<RehberPlatformu, { hazir: boolean | null; etiket: string }>>>;

export function olcumHaritasi(o: OlcumDurumuYaniti | null): { harita: RiskBaglami['olcum']; satirlar: OlcumHucreleri; hatalar: string[] } {
  const harita: RiskBaglami['olcum'] = {};
  const satirlar: OlcumHucreleri = {};
  if (!o) return { harita, satirlar, hatalar: ['Ölçüm durumu okunamadı; ölçüme bağlı uyarı üretilmedi.'] };
  for (const s of o.satirlar) {
    harita[s.tur] = { meta: OLCUM_HAZIR[s.meta.durum], google: OLCUM_HAZIR[s.google.durum] };
    satirlar[s.tur] = {
      meta: { hazir: OLCUM_HAZIR[s.meta.durum], etiket: s.meta.etiket },
      google: { hazir: OLCUM_HAZIR[s.google.durum], etiket: s.google.etiket },
    };
  }
  return { harita, satirlar, hatalar: o.okumaHatalari.map((h) => `${h.kaynak}: ${h.mesaj}`) };
}

export interface GirdiParcalari {
  clientId: string;
  marka: MarkaSatiri | null;
  siteTaramasi: { durum: string; baslik: string; neden: string } | null;
  siteYok: boolean | null;
  kullanilmayan: RehberPlatformu[];
  olcum: OlcumDurumuYaniti | null;
  hazirlik: RehberHazirligi;
  gecmis: GecmisOkumasi;
  pencere: { baslangic: string; bitis: string };
  kelimeGruplari: Array<{ grup: string; kelime: number }>;
}

const PLATFORM_ADI: Record<RehberPlatformu, string> = { meta: 'Meta', google: 'Google' };

export function ozelKategoriVar(g: Pick<GirdiParcalari, 'marka' | 'hazirlik'>): boolean {
  return (g.marka?.ozel_kategoriler ?? []).length > 0 || g.hazirlik.ozelKategoriTabani.length > 0;
}

export function acilisTablosu(g: Pick<GirdiParcalari, 'hazirlik' | 'kullanilmayan' | 'siteYok'>): StratejiGirdileri['acilis'] {
  const hesap: Record<RehberPlatformu, boolean> = { meta: g.hazirlik.hesaplar.length > 0, google: g.hazirlik.googleHesaplari.length > 0 };
  const kapiGirdisi = { ajansYoneticisi: g.hazirlik.ajansYoneticisi, kullanilmayan: new Set(g.kullanilmayan), hesap, siteYok: g.siteYok };
  return Object.fromEntries(
    REHBER_AMAC_KODLARI.map((a) => [
      a,
      Object.fromEntries(
        REHBER_PLATFORMLARI.map((p) => {
          const k = platformKapisi(a, p, kapiGirdisi);
          return [p, k.acik ? { acik: true, sebep: null } : { acik: false, sebep: k.sebep }];
        }),
      ),
    ]),
  ) as StratejiGirdileri['acilis'];
}

/**
 * Ekrandaki "önerinin dayandığı bilgiler" (`GET …/girdiler`). SAF. Her satır
 * NEDENİYLE: boş Marka Merkezi alanı "bos", okunamayan ölçüm "bilinmiyor"
 * (eksik gibi gösterilmez, yanlış alarm), eksiğin ekranı `baglanti`.
 */
export function girdileriDerle(g: GirdiParcalari): StratejiGirdileri {
  const m = g.marka;
  const satirlar: StratejiGirdileri['satirlar'] = [];
  const bos = [
    !m?.sektor && 'sektör',
    !(m?.urunler ?? []).length && 'ürünler',
    !(m?.vaatler ?? []).length && 'vaatler',
    !m?.hedef_kitle && 'hedef kitle',
  ].filter((x): x is string => !!x);
  satirlar.push({
    kod: 'marka',
    baslik: 'Marka Merkezi',
    durum: !m?.profil_var ? 'bos' : bos.length ? 'eksik' : 'hazir',
    ayrinti: !m?.profil_var ? 'Marka profili kurulmamış.' : bos.length ? `Boş: ${bos.join(', ')}.` : null,
    baglanti: markaMerkeziAdresi('marka', g.clientId),
  });
  const anaAmac = m?.ana_amac ? (ANA_AMAC_REHBER[m.ana_amac] ?? null) : null;
  satirlar.push({
    kod: 'ana_amac',
    baslik: 'Ana amaç',
    durum: anaAmac ? 'hazir' : 'bos',
    ayrinti: anaAmac ? REHBER_AMACLARI[anaAmac].ekranAdi : 'Seçilmedi; öneri ölçümü hazır ilk dönüşüm amacından başlar.',
    baglanti: markaMerkeziAdresi('marka', g.clientId),
  });
  const site = m?.website ?? g.hazirlik.iletisim.siteAdresi ?? null;
  satirlar.push({
    kod: 'site',
    baslik: 'Web sitesi',
    durum: g.siteYok === true ? 'hazir' : site ? 'hazir' : g.siteYok === null ? 'bilinmiyor' : 'eksik',
    ayrinti:
      g.siteYok === true
        ? '"Web sitemiz yok" dendi: site isteyen amaçlar önerilmez.'
        : [site, g.siteTaramasi ? `Tarama: ${g.siteTaramasi.baslik}` : null].filter(Boolean).join(' · ') || 'Site adresi girilmedi.',
    baglanti: sihirbazAdresi(g.clientId),
  });
  for (const p of REHBER_PLATFORMLARI) {
    const hesaplar = p === 'meta' ? g.hazirlik.hesaplar : g.hazirlik.googleHesaplari;
    const kullanilmiyor = g.kullanilmayan.includes(p);
    satirlar.push({
      kod: `hesap_${p}`,
      baslik: `${PLATFORM_ADI[p]} reklam hesabı`,
      durum: kullanilmiyor || hesaplar.length > 0 ? 'hazir' : 'eksik',
      ayrinti: kullanilmiyor ? 'Kullanılmıyor (Kurulum beyanı).' : hesaplar.length ? hesaplar.map((h) => h.ad).join(', ') : 'Atanmadı.',
      baglanti: hesaplarAdresi(g.clientId),
    });
  }
  const olcum = olcumHaritasi(g.olcum);
  for (const tur of OLCUM_TURLERI) {
    const h = olcum.satirlar[tur];
    const degerler = h ? REHBER_PLATFORMLARI.map((p) => h[p].hazir) : [];
    const durum: 'hazir' | 'eksik' | 'bilinmiyor' = degerler.some((x) => x === true)
      ? 'hazir'
      : degerler.length && degerler.every((x) => x === false)
        ? 'eksik'
        : 'bilinmiyor';
    satirlar.push({
      kod: `olcum_${tur}`,
      baslik: `Ölçüm · ${OLCUM_TURU_ADLARI[tur].ad}`,
      durum,
      ayrinti: h ? REHBER_PLATFORMLARI.map((p) => `${PLATFORM_ADI[p]}: ${h[p].etiket}`).join(' · ') : (olcum.hatalar[0] ?? null),
      baglanti: markaMerkeziAdresi('kurulum', g.clientId, 'olcum'),
    });
  }
  satirlar.push({
    kod: 'gecmis',
    baslik: 'Hesabın geçmiş verisi',
    durum: g.gecmis.ozet.length ? 'hazir' : 'bos',
    ayrinti: g.gecmis.ozet.length
      ? `${g.pencere.baslangic} – ${g.pencere.bitis} verisinden; platformlar ayrı.`
      : g.gecmis.hesapVar
        ? 'Son üç ayda amaçla eşlenebilen harcama yok; beklenen sonuç gösterilmez.'
        : 'İzlenen hesap yok; beklenen sonuç gösterilmez.',
    baglanti: null,
  });
  satirlar.push({
    kod: 'asgari_meta',
    baslik: 'Meta günlük asgari bütçe',
    durum: g.hazirlik.asgariGunluk.meta === null ? 'bilinmiyor' : 'hazir',
    ayrinti: g.hazirlik.asgariGunluk.meta === null ? 'Okunamadı; asgari kontrolü "Strateji öner"de yeniden denenir.' : null,
    baglanti: null,
  });
  return {
    satirlar,
    konumHesabi: g.hazirlik.hesaplar[0]?.id ?? null,
    kelimeGruplari: g.kelimeGruplari,
    ozelKategori: ozelKategoriVar(g),
    acilis: acilisTablosu(g),
  };
}

/** Belgenin "İşletme ve pazar" satırları; boş alan `null` ("Marka Merkezi'nde boş"). */
export function isletmeSatirlari(m: MarkaSatiri | null, siteTaramasi: { baslik: string } | null): IsletmeSatiri[] {
  const liste = (x: string[] | null | undefined) => (x && x.length ? x.join(', ') : null);
  return [
    { etiket: 'İşletme', deger: m?.marka_adi ?? m?.ad ?? null },
    { etiket: 'Sektör', deger: m?.sektor ?? null },
    { etiket: 'Ürünler', deger: liste(m?.urunler) },
    { etiket: 'Vaatler', deger: liste(m?.vaatler) },
    { etiket: 'Hedef kitle', deger: m?.hedef_kitle ?? null },
    { etiket: 'Web sitesi', deger: m?.website ?? null },
    { etiket: 'Site taraması', deger: siteTaramasi?.baslik ?? null },
  ];
}

/** Belgenin "Bugüne kadar" bölümü. */
export function belgeGecmisi(g: GecmisOkumasi, pencere: { baslangic: string; bitis: string }): Gecmis {
  const gun = Math.round((Date.parse(pencere.bitis) - Date.parse(pencere.baslangic)) / 86_400_000) + 1;
  return {
    gun,
    satirlar: g.belgeSatirlari,
    bosNedeni: !g.hesapVar ? 'Bu workspace’e atanmış ve izlenen reklam hesabı yok.' : g.belgeSatirlari.length ? null : 'Son üç ayda harcama yok.',
  };
}

/** Ölçüm bölümünün KAYIT ANINDAKİ satırları. Platformda olmayan hücre satır üretmez. */
export function olcumOzeti(o: OlcumDurumuYaniti | null): StratejiOlcumSatiri[] {
  if (!o) return [{ etiket: 'Ölçüm durumu', platform: null, durum: 'bilinmiyor' }];
  const out: StratejiOlcumSatiri[] = [];
  for (const s of o.satirlar) {
    for (const p of REHBER_PLATFORMLARI) {
      const h = s[p];
      if (h.durum === 'platformda_yok' || h.durum === 'hesap_yok') continue;
      const hazir = OLCUM_HAZIR[h.durum];
      out.push({ etiket: `${OLCUM_TURU_ADLARI[s.tur].ad} · ${h.etiket}`, platform: p, durum: hazir === true ? 'hazir' : hazir === false ? 'kurulmali' : 'bilinmiyor' });
    }
  }
  return out;
}

/** Marka Merkezi'nin varsayılan kitle konumları (rehberin önden doldurduğuyla AYNI kaynak). */
export function markaKonumlari(h: RehberHazirligi): RehberKonumu[] {
  return (h.varsayilanKitle?.konumlar ?? []) as RehberKonumu[];
}
