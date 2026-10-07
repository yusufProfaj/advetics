import { z } from 'zod/v4';
import {
  ARACLAR,
  NIYET_KATALOGU,

  siradakiSoru,
  taslakEksikleri,
  tutarAyristir,
  type AracAdi,
  type AracSonucu,
  type HedefKonum,
  type ReklamHazirligi,
  type ReklamTaslakKaydi,
  type Soru,
  type SorulabilirAlan,
  type TaslakAlanlari,
  type TenantContext,
} from '@advetics/shared';
import { AI_NIYETLERI, aiCiktisiniDogrula, aiCiktiSchema } from '../ai-taslak';
import type { AlanDegisikligi } from '../taslak.service';
import type { ProvaGorunumu } from '../yayin.service';

/**
 * ADVCAMPAIGN SOHBETİ — ARAÇ KATMANI (SENTEZ S-47, TASARIM-PLAN § 4.3-4.4).
 *
 * Model platforma ve veritabanına doğrudan dokunmuyor; yalnız buradaki
 * araçları çağırıyor ve her araç kendi kapısını SUNUCUDA uyguluyor. Şemanın
 * modele ne dediği güvence değil: model şemaya uymayan girdi de
 * üretebiliyor, o yüzden her girdi Zod ile yeniden doğrulanıyor ve
 * uymazsa `reddedildi` dönüyor (sessizce düzeltilmiyor).
 *
 * Bütçe, süre ve adres MODELİN TAHMİNİ OLAMAZ: oturumdaki kullanıcı
 * mesajlarında geçmeyen bir rakam ya da adres reddediliyor (mevcut
 * `aiCiktisiniDogrula` kuralı, aynı fonksiyon). Konum anahtarı ancak bu
 * oturumdaki bir konum aramasının sonucundan gelebilir: model Meta'nın
 * sayısal anahtarını uyduramaz.
 *
 * Bağımlılıklar arayüz olarak geliyor: testte sahte, üretimde Nest
 * servisleri. Araç sonucu her zaman dört (+1) hâlden biri; `sonuc_yok` ile
 * `dustu` asla boş diziye çevrilmiyor.
 */

export interface OturumDurumu {
  id: string;
  clientId: string;
  taslakId: string | null;
  /** Oturumdaki BÜTÜN kullanıcı mesajları; rakam ve adres doğrulaması bununla. */
  kullaniciMetni: string;
  /** Oturuma bırakılan medya, sırasıyla. */
  medyalar: Array<{ varlikId: string; kapakVarlikId?: string }>;
  /** Bu oturumdaki konum aramalarının sonuçları: anahtar yalnız buradan seçilir. */
  konumAdaylari: HedefKonum[];
  sorulanlar: SorulabilirAlan[];
  /** Kullanıcının "Bütün Türkiye" gibi bilinçli seçimi bugünün tarihiyle. */
  bugun: string;
}

export interface MarkaProfili {
  sikSayfalar: Array<{ ad: string; adres: string }>;
}

export interface AracBagimliliklari {
  hazirlik(ctx: TenantContext, clientId: string): Promise<ReklamHazirligi>;
  profil(ctx: TenantContext, clientId: string): Promise<MarkaProfili>;
  taslakOlustur(ctx: TenantContext, clientId: string, cumle: string): Promise<ReklamTaslakKaydi>;
  taslakOku(ctx: TenantContext, id: string): Promise<ReklamTaslakKaydi>;
  surumYaz(ctx: TenantContext, id: string, d: AlanDegisikligi): Promise<ReklamTaslakKaydi>;
  provaIste(ctx: TenantContext, taslakId: string): Promise<ProvaGorunumu>;
  provaOku(ctx: TenantContext, taslakId: string): Promise<ProvaGorunumu>;
  konumAra(ctx: TenantContext, clientId: string, adAccountId: string, metin: string): Promise<HedefKonum[]>;
  onayKarti(ctx: TenantContext, o: OturumDurumu): Promise<AracSonucu>;
}

/** Bir aracın çalışması: sonuç + oturuma etkisi (taslak bağlandı, konum adayı). */
export interface AracCiktisi {
  sonuc: AracSonucu;
  taslakId?: string;
  taslakSurumu?: number;
  konumAdaylari?: HedefKonum[];
  /** Taslak değiştiyse sıradaki soru (modele ve ekrana). */
  soru?: Soru | null;
}

// ---------------------------------------------------------------------------
// Girdi şemaları
// ---------------------------------------------------------------------------

const BOS = z.object({}).strict();

const ALAN_YAZ = z.discriminatedUnion('alan', [
  z.object({ alan: z.literal('niyet'), deger: z.enum(AI_NIYETLERI) }).strict(),
  z.object({ alan: z.literal('butce'), deger: z.object({ tip: z.enum(['gunluk', 'toplam']), tutar: z.number().positive() }).strict() }).strict(),
  z.object({ alan: z.literal('sure_gun'), deger: z.number().int().positive().nullable().describe('null = bitiş yok') }).strict(),
  z
    .object({
      alan: z.literal('konum'),
      deger: z.union([z.literal('marka_kitlesi'), z.literal('butun_turkiye'), z.array(z.string()).min(1).max(25).describe('konum_ara sonuçlarındaki anahtarlar')]),
    })
    .strict(),
  z.object({ alan: z.literal('hedef_adres'), deger: z.string() }).strict(),
  z
    .object({
      alan: z.literal('kavram'),
      deger: z.object({ sira: z.number().int().min(1), baslik: z.string().optional(), metin: z.string().optional() }).strict(),
    })
    .strict(),
  z.object({ alan: z.literal('reklam_hesabi'), deger: z.string().uuid() }).strict(),
  z.object({ alan: z.literal('sayfa'), deger: z.string().uuid() }).strict(),
]);

export const ARAC_SEMALARI = {
  hazirlik_oku: BOS,
  niyet_katalogu: BOS,
  varliklari_listele: BOS,
  konum_ara: z.object({ metin: z.string().min(2).max(80).describe('Şehir, ilçe ya da bölge adı; tek yer.') }).strict(),
  taslak_olustur: aiCiktiSchema,
  taslak_alan_yaz: z.object({ beklenenSurum: z.number().int().min(0).describe('Taslağın şu anki sürümü.'), yazim: ALAN_YAZ }).strict(),
  prova_baslat: BOS,
  prova_sonucu: BOS,
  onay_karti_goster: BOS,
} as const satisfies Record<AracAdi, z.ZodType>;

const ACIKLAMA = {
  hazirlik_oku: 'Workspace’in reklam hesaplarını, Facebook sayfalarını, marka kitlesini ve zorunlu yasal uyarısını okur. Soru sormadan önce ilk iş bunu çağır.',
  niyet_katalogu: 'Şu an kurulabilen reklam amaçlarını ve kurulamayanları sebebiyle listeler.',
  varliklari_listele: 'Bu oturumda bırakılan görsel ve videoları sırasıyla listeler.',
  konum_ara: 'Meta’da bir şehir, ilçe ya da bölgeyi arar. Konum anahtarı yalnız buradan gelebilir.',
  taslak_olustur:
    'Oturumdaki medya ve kullanıcının isteğiyle taslağı ilk kez kurar. Bütçe ve süreyi yalnız kullanıcı rakamla yazdıysa doldur. Taslak zaten varsa kullanılamaz; taslak_alan_yaz kullan.',
  taslak_alan_yaz: 'Taslağın tek bir alanını yazar. Bütçe, süre ve adres yalnız kullanıcının yazdığından gelir. Sonuçta sıradaki soru döner; yalnız onu sor.',
  prova_baslat: 'Taslağı nesne açmadan Meta’nın kontrolüne gönderir. Para harcamaz. Yalnız eksik kalmadığında çağır.',
  prova_sonucu: 'Meta kontrolünün sonucunu okur.',
  onay_karti_goster: 'Kontrol geçtiyse kullanıcıya onay kartını gösterir. Kartın metnini sen yazmazsın; kullanıcı kartta onaylar.',
} as const satisfies Record<AracAdi, string>;

/** Anthropic araç tanımları. Sıra sabit (önbellek önekinin bir parçası). */
export function aracTanimlari(): Array<{ name: AracAdi; description: string; input_schema: Record<string, unknown> }> {
  return ARACLAR.map((name) => {
    const { $schema: _s, ...input_schema } = z.toJSONSchema(ARAC_SEMALARI[name]) as Record<string, unknown>;
    return { name, description: ACIKLAMA[name], input_schema };
  });
}

// ---------------------------------------------------------------------------
// Çalıştırıcı
// ---------------------------------------------------------------------------

export class AracCalistirici {
  constructor(private readonly d: AracBagimliliklari) {}

  async calistir(ctx: TenantContext, o: OturumDurumu, ad: string, girdi: unknown): Promise<AracCiktisi> {
    if (!(ARACLAR as readonly string[]).includes(ad)) {
      return { sonuc: { hal: 'reddedildi', neden: `Böyle bir araç yok: ${ad}` } };
    }
    const arac = ad as AracAdi;
    const p = ARAC_SEMALARI[arac].safeParse(girdi);
    if (!p.success) {
      return { sonuc: { hal: 'reddedildi', neden: `Girdi geçersiz: ${p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` } };
    }
    try {
      return await this.yonlendir(ctx, o, arac, p.data);
    } catch (e) {
      // Servis hatası (izin, çakışma, platform) modelden SAKLANMAZ: mesajıyla
      // döner, model kullanıcıya platformun cümlesini aktarır.
      return { sonuc: { hal: 'dustu', platformMesaji: e instanceof Error ? e.message : String(e) } };
    }
  }

  private async yonlendir(ctx: TenantContext, o: OturumDurumu, arac: AracAdi, g: unknown): Promise<AracCiktisi> {
    switch (arac) {
      case 'hazirlik_oku':
        return { sonuc: { hal: 'tamam', veri: hazirlikOzeti(await this.d.hazirlik(ctx, o.clientId)) } };
      case 'niyet_katalogu':
        return { sonuc: { hal: 'tamam', veri: niyetKatalogu() } };
      case 'varliklari_listele':
        if (o.medyalar.length === 0) return { sonuc: { hal: 'sonuc_yok', neden: 'Bu oturumda henüz görsel ya da video bırakılmadı.' } };
        return {
          sonuc: {
            hal: 'tamam',
            veri: o.medyalar.map((m, i) => ({ sira: i + 1, tur: m.kapakVarlikId ? 'video' : 'gorsel', varlikId: m.varlikId })),
          },
        };
      case 'konum_ara':
        return this.konumAra(ctx, o, (g as { metin: string }).metin);
      case 'taslak_olustur':
        return this.taslakOlustur(ctx, o, g as z.infer<typeof aiCiktiSchema>);
      case 'taslak_alan_yaz':
        return this.alanYaz(ctx, o, g as z.infer<(typeof ARAC_SEMALARI)['taslak_alan_yaz']>);
      case 'prova_baslat': {
        if (!o.taslakId) return { sonuc: { hal: 'reddedildi', neden: 'Önce taslak kurulmalı.' } };
        const t = await this.d.taslakOku(ctx, o.taslakId);
        const kalan = t.eksikler.filter((e) => e.kod !== 'OK-17' && e.kod !== 'KAYNAK');
        if (kalan.length > 0) {
          return { sonuc: { hal: 'reddedildi', neden: `Önce eksikler: ${kalan.map((e) => e.metin).join(', ')}` }, soru: this.soru(t, o) };
        }
        return { sonuc: provaSonucu(await this.d.provaIste(ctx, o.taslakId)) };
      }
      case 'prova_sonucu':
        if (!o.taslakId) return { sonuc: { hal: 'sonuc_yok', neden: 'Taslak yok, kontrol de yok.' } };
        return { sonuc: provaSonucu(await this.d.provaOku(ctx, o.taslakId)) };
      case 'onay_karti_goster':
        if (!o.taslakId) return { sonuc: { hal: 'reddedildi', neden: 'Önce taslak kurulmalı.' } };
        return { sonuc: await this.d.onayKarti(ctx, o) };
    }
  }

  private async konumAra(ctx: TenantContext, o: OturumDurumu, metin: string): Promise<AracCiktisi> {
    const h = await this.d.hazirlik(ctx, o.clientId);
    const hesap = h.hesaplar[0];
    if (!hesap) return { sonuc: { hal: 'reddedildi', neden: 'Bu workspace’e atanmış Meta reklam hesabı yok; konum aranamıyor.' } };
    const bulunan = await this.d.konumAra(ctx, o.clientId, hesap.id, metin);
    // HTTP 200 + boş dizi bir HATA DEĞİL, "eşleşme yok" (CLAUDE.md, ilgi alanı
    // araması dersi). Ayrı hâl, ayrı cümle.
    if (bulunan.length === 0) return { sonuc: { hal: 'sonuc_yok', neden: `"${metin}" için Meta’da eşleşen konum yok; daha kısa ya da farklı yaz.` } };
    return {
      // Tam konum nesnesi dönüyor: sonraki turda anahtar yalnız bu sonuçtan
      // seçilebilsin diye geçmişten yeniden okunuyor (dongu.ts konumAdaylariAl).
      sonuc: { hal: 'tamam', veri: bulunan.slice(0, 10) },
      konumAdaylari: bulunan.slice(0, 10),
    };
  }

  private async taslakOlustur(ctx: TenantContext, o: OturumDurumu, c: z.infer<typeof aiCiktiSchema>): Promise<AracCiktisi> {
    if (o.taslakId) return { sonuc: { hal: 'reddedildi', neden: 'Bu oturumun taslağı zaten var; taslak_alan_yaz kullan.' } };
    if (o.medyalar.length === 0) return { sonuc: { hal: 'reddedildi', neden: 'Önce görsel ya da video bırakılmalı.' } };
    const [h, p] = await Promise.all([this.d.hazirlik(ctx, o.clientId), this.d.profil(ctx, o.clientId)]);
    const dogru = aiCiktisiniDogrula(c, {
      cumle: o.kullaniciMetni,
      varliklar: o.medyalar,
      sikSayfalar: p.sikSayfalar,
      markaKitlesi: h.varsayilanKitle?.konumlar ?? null,
      yasalUyari: h.marka.yasalUyari,
      tekHesap: h.hesaplar.length === 1 ? h.hesaplar[0]!.id : null,
      tekSayfa: h.sayfalar.length === 1 ? h.sayfalar[0]!.id : null,
      bugun: o.bugun,
    });
    const t0 = await this.d.taslakOlustur(ctx, o.clientId, o.kullaniciMetni.slice(0, 2000));
    const t = await this.d.surumYaz(ctx, t0.id, dogru.degisiklikler as AlanDegisikligi);
    const soru = this.soru(t, o);
    return {
      sonuc: { hal: 'tamam', veri: { taslakSurumu: t.aktifSurumNo, notlar: dogru.notlar, siradakiSoru: soru } },
      taslakId: t.id,
      taslakSurumu: t.aktifSurumNo,
      soru,
    };
  }

  private async alanYaz(ctx: TenantContext, o: OturumDurumu, g: z.infer<(typeof ARAC_SEMALARI)['taslak_alan_yaz']>): Promise<AracCiktisi> {
    if (!o.taslakId) return { sonuc: { hal: 'reddedildi', neden: 'Önce taslak_olustur ile taslak kurulmalı.' } };
    const t = await this.d.taslakOku(ctx, o.taslakId);
    // İYİMSER KİLİT: kullanıcı panelden bir alanı değiştirdiyse model eski
    // sürüme göre yazıp onun kararını ezmesin.
    if (t.aktifSurumNo !== g.beklenenSurum) {
      return { sonuc: { hal: 'reddedildi', neden: `SURUM_ESKI: taslak şu an sürüm ${t.aktifSurumNo}; önce güncel hâli düşün.` } };
    }
    const ai = (deger: unknown) => ({ deger, kaynak: 'ai_onerisi' as const });
    const d: AlanDegisikligi = {};
    const y = g.yazim;
    switch (y.alan) {
      case 'niyet':
        d.niyet = ai(y.deger);
        break;
      case 'butce': {
        // Rakam kullanıcının metninde geçmeli; "1.500 TL" ve "1500" aynı sayı.
        if (!sayiMetindeMi(y.deger.tutar, o.kullaniciMetni)) return reddet('Bu tutarı kullanıcı yazmadı; tahmin edilemez, kullanıcıya sor.');
        const h = await this.d.hazirlik(ctx, o.clientId);
        const paraBirimi = (h.hesaplar.find((x) => x.id === t.adAccountId) ?? h.hesaplar[0])?.paraBirimi;
        if (!paraBirimi) return reddet('Reklam hesabı yok; para birimi bilinmiyor.');
        const r = tutarAyristir(String(y.deger.tutar).replace('.', ','), paraBirimi);
        if (r.tur !== 'tamam') return reddet(r.mesaj);
        d.butce = ai({ tip: y.deger.tip, micros: r.micros.toString() });
        break;
      }
      case 'sure_gun': {
        if (y.deger === null) {
          if (!/bitiş yok|bitis yok|süresiz|suresiz|durdurana kadar/i.test(o.kullaniciMetni)) return reddet('Kullanıcı bitişsiz demedi; sor.');
          d.takvim = ai({ baslangic: o.bugun, bitis: null });
        } else {
          if (!sayiMetindeMi(y.deger, o.kullaniciMetni)) return reddet('Bu süreyi kullanıcı yazmadı; sor.');
          d.takvim = ai({ baslangic: o.bugun, bitis: gunEkle(o.bugun, y.deger - 1) });
        }
        break;
      }
      case 'konum': {
        if (y.deger === 'butun_turkiye') d.konumlar = ai([{ tur: 'country', key: 'TR', etiket: 'Bütün Türkiye', ulkeKodu: 'TR' }]);
        else if (y.deger === 'marka_kitlesi') {
          const k = (await this.d.hazirlik(ctx, o.clientId)).varsayilanKitle;
          if (!k?.konumlar.length) return reddet('Marka Merkezi’nde marka kitlesi tanımlı değil.');
          d.konumlar = { deger: k.konumlar, kaynak: 'marka_merkezi' };
        } else {
          const secilen = y.deger.map((a) => o.konumAdaylari.find((k) => k.key === a));
          if (secilen.some((k) => !k)) return reddet('Konum anahtarı bu oturumdaki konum aramasından gelmeli; önce konum_ara çağır.');
          d.konumlar = ai(secilen as HedefKonum[]);
        }
        break;
      }
      case 'hedef_adres': {
        const p = await this.d.profil(ctx, o.clientId);
        const bilinen = p.sikSayfalar.some((s) => s.adres === y.deger) || o.kullaniciMetni.includes(y.deger);
        if (!bilinen || !/^https:\/\//.test(y.deger)) return reddet('Adres Marka Merkezi’nde ya da kullanıcının mesajında yok; uydurulamaz.');
        d.hedefAdres = ai(y.deger);
        break;
      }
      case 'kavram': {
        const k = [...(t.alanlar.kavramlar?.deger ?? [])];
        const hedef = k[y.deger.sira - 1];
        if (!hedef) return reddet(`Fikir ${y.deger.sira} yok.`);
        k[y.deger.sira - 1] = { ...hedef, ...(y.deger.baslik !== undefined && { baslik: y.deger.baslik }), ...(y.deger.metin !== undefined && { metin: y.deger.metin }) };
        d.kavramlar = ai(k);
        break;
      }
      case 'reklam_hesabi':
      case 'sayfa': {
        const h = await this.d.hazirlik(ctx, o.clientId);
        const liste = y.alan === 'reklam_hesabi' ? h.hesaplar : h.sayfalar;
        if (!liste.some((x) => x.id === y.deger)) return reddet('Bu kimlik bu workspace’in listesinde yok.');
        if (y.alan === 'reklam_hesabi') d.reklamHesabiId = ai(y.deger);
        else d.sayfaId = ai(y.deger);
        break;
      }
    }
    const yeni = await this.d.surumYaz(ctx, o.taslakId, d);
    const soru = this.soru(yeni, o);
    return {
      sonuc: { hal: 'tamam', veri: { taslakSurumu: yeni.aktifSurumNo, eksikler: kullaniciEksikleri(yeni), siradakiSoru: soru } },
      taslakId: yeni.id,
      taslakSurumu: yeni.aktifSurumNo,
      soru,
    };
  }

  private soru(t: ReklamTaslakKaydi, o: OturumDurumu): Soru | null {
    return siradakiSoru(t.eksikler, o.sorulanlar, {
      niyetler: AI_NIYETLERI.map((k) => ({ kod: k, ekranAdi: NIYET_KATALOGU[k].ekranAdi })),
    });
  }
}

function reddet(neden: string): AracCiktisi {
  return { sonuc: { hal: 'reddedildi', neden } };
}

function kullaniciEksikleri(t: ReklamTaslakKaydi): string[] {
  return t.eksikler.filter((e) => e.kod !== 'OK-17' && e.kod !== 'KAYNAK').map((e) => e.metin);
}

/** "1.500 TL" → 1500; "10 gün" → 10. Model rakamı uydurduysa metinde yok. */
export function sayiMetindeMi(n: number, metin: string): boolean {
  const sayilar = [...metin.replace(/(\d)\.(\d{3})/g, '$1$2').matchAll(/\d+(?:,\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));
  return sayilar.includes(n);
}

function gunEkle(tarih: string, gun: number): string {
  const [y, a, g] = tarih.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, a - 1, g, 12) + gun * 86_400_000).toISOString().slice(0, 10);
}

/** Modele giden hazırlık: kimlik + ad; token, ham satır yok. */
function hazirlikOzeti(h: ReklamHazirligi) {
  return {
    reklamHesaplari: h.hesaplar.map((x) => ({ id: x.id, ad: x.ad, paraBirimi: x.paraBirimi })),
    sayfalar: h.sayfalar.map((x) => ({ id: x.id, ad: x.ad })),
    instagramHesaplari: h.instagramHesaplari.map((x) => ({ id: x.id, ad: x.ad })),
    markaKitlesi: h.varsayilanKitle ? h.varsayilanKitle.ozet : null,
    zorunluYasalUyari: h.marka.yasalUyari,
    eksikBaglanti: h.hesaplar.length === 0 ? 'Meta reklam hesabı atanmamış' : h.sayfalar.length === 0 ? 'Facebook sayfası yok' : null,
  };
}

function niyetKatalogu() {
  return {
    kurulabilen: AI_NIYETLERI.map((k) => ({ kod: k, ad: NIYET_KATALOGU[k].ekranAdi })),
    // Kapalı olanlar SEBEBİYLE: model "yapamam" deyip susmasın, kullanıcıya
    // neyin ne zaman açılacağını söyleyebilsin.
    henuzKurulamayan: Object.values(NIYET_KATALOGU)
      .filter((n) => !(AI_NIYETLERI as readonly string[]).includes(n.kod))
      .map((n) => ({ kod: n.kod, ad: n.ekranAdi, sebep: n.kod === 'ONE_CIKAR' ? 'Paylaşım öne çıkarma Akıllı Boost’ta.' : 'Canlıda doğrulanınca açılacak.' })),
  };
}

function provaSonucu(p: ProvaGorunumu): AracSonucu {
  const veri = { durum: p.durum.tur, metin: p.durum.metin, parcalar: p.sonuclar };
  if (p.durum.tur === 'bekliyor') return { hal: 'bekliyor', neden: p.durum.metin };
  if (p.durum.tur === 'yok') return { hal: 'sonuc_yok', neden: p.durum.metin };
  return { hal: 'tamam', veri };
}

/** Test ve sınır taraması için dışa açık. */
export const _ic = { taslakEksikleri, kullaniciEksikleri };
export type { TaslakAlanlari };
