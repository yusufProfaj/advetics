import {
  KALEM_AKTARIM_ENGEL_METNI,
  REHBER_AMACLARI,
  STRATEJI_ADIM_ETIKETI,
  STRATEJI_INCELEME_ETIKETI,
  STRATEJI_INCELEME_PARCALARI,
  STRATEJI_OLUSTURMA_ADIMLARI,
  donemGunSayisi,
  sihirbazButceKontrolu,
  stratejiDonemi,
  type KalemAktarimKarari,
  type RehberAmacKodu,
  type StratejiDurumu,
  type StratejiIncelemeParcasi,
  type StratejiKalemi,
  type StratejiListeSatiri,
  type StratejiOlusturmaAdimi,
  type StratejiSihirbazGirdileri,
} from '@advetics/shared';
import { tutarCoz } from '../hesap';

/**
 * ═══ ADIM ADIM AKIŞIN KARARLARI (SAF) ═══
 * (kullanıcı onaylı taslak `docs/advstrategy/simulasyon.html`)
 *
 * Panelde bileşen render eden test altyapısı yok (`vitest.config.ts`); bir
 * bileşenin içindeki karar yalnız kaynak taramasıyla sınanabilir ve o tarama
 * yanlış şeyi kilitleyebilir (`domaYazilmali` dersi). Hangi adım bitti, hedef
 * sırası nasıl değişir, bütçe adımı ilerletir mi, kurulumda sıradaki kalem
 * hangisi: hepsi burada ve `akis.spec.ts` ÇALIŞTIRARAK sınıyor.
 */

// ─── İlerleme rayı ───────────────────────────────────────────────────────────

export type RayHali = 'bitti' | 'simdi' | 'sirada';

export function adimSirasi(a: StratejiOlusturmaAdimi): number {
  return STRATEJI_OLUSTURMA_ADIMLARI.indexOf(a);
}

/** Yedi parçalı ray: öncekiler bitti, bulunulan kırmızı, sonrakiler sırada. */
export function rayParcalari(simdi: StratejiOlusturmaAdimi): Array<{ adim: StratejiOlusturmaAdimi; etiket: string; hal: RayHali }> {
  const i = adimSirasi(simdi);
  return STRATEJI_OLUSTURMA_ADIMLARI.map((adim, j) => ({ adim, etiket: STRATEJI_ADIM_ETIKETI[adim], hal: j < i ? 'bitti' : j === i ? 'simdi' : 'sirada' }));
}

export function oncekiAdim(a: StratejiOlusturmaAdimi): StratejiOlusturmaAdimi | null {
  return STRATEJI_OLUSTURMA_ADIMLARI[adimSirasi(a) - 1] ?? null;
}

export function sonrakiAdim(a: StratejiOlusturmaAdimi): StratejiOlusturmaAdimi | null {
  return STRATEJI_OLUSTURMA_ADIMLARI[adimSirasi(a) + 1] ?? null;
}

/**
 * Kayıtlı durumdan İLERİDEKİ bir adıma adresle atlanamaz: önceki adımın
 * cevabı yoksa (bütçe yokken bölge, tarif onaylanmadan inceleme) ekran boş
 * bir soruyla açılır ve "Devam" eksik veriyle kaydederdi. İstenen adım
 * kayıtlı adımdan ilerideyse kayıtlı adıma düşülür.
 */
export function gecerliAdim(istenen: StratejiOlusturmaAdimi, kayitli: StratejiOlusturmaAdimi | null, planVar: boolean): StratejiOlusturmaAdimi {
  if (!planVar) return istenen === 'butce' ? 'butce' : 'hedef';
  const ust = kayitli ?? 'hedef';
  return adimSirasi(istenen) <= adimSirasi(ust) ? istenen : ust;
}

// ─── 1 · Hedef ───────────────────────────────────────────────────────────────

/** Seçim sırası = öncelik. Seçili olanı kaldırınca arkasındakiler bir öne kayar. */
export function hedefDegistir(secili: readonly RehberAmacKodu[], amac: RehberAmacKodu): RehberAmacKodu[] {
  return secili.includes(amac) ? secili.filter((a) => a !== amac) : [...secili, amac];
}

/** Adresten gelen hedef listesi (`?amaclar=FORM,SITE`): bilinmeyen ve tekrar eden atılır. */
export function adrestekiHedefler(ham: string | null | undefined): RehberAmacKodu[] {
  const out: RehberAmacKodu[] = [];
  for (const x of (ham ?? '').split(',')) {
    const a = x.trim() as RehberAmacKodu;
    if (a in REHBER_AMACLARI && !out.includes(a)) out.push(a);
  }
  return out;
}

/**
 * Hedef kartının hâli. KAPALI KART NEDENİYLE: sebep motorun kendi kapısından
 * (`StratejiSihirbazGirdileri.amaclar`), ilk cümlesi kartta, hepsi başlıkta.
 * Kapalı kart seçilmiş görünüyorsa (önceden seçilmiş, sonra ölçüm düştü)
 * seçimden çıkarılabilir ama yeniden seçilemez.
 */
export function hedefKarti(g: StratejiSihirbazGirdileri['amaclar'][number] | undefined): { kapali: boolean; neden: string | null; platformlar: string } {
  if (!g) return { kapali: true, neden: 'Bu hedefin durumu okunamadı.', platformlar: '' };
  const ad = (p: string) => (p === 'meta' ? 'Meta' : 'Google');
  const neden = g.sebepler[0] ? g.sebepler[0].replace(/^(Meta|Google): /, '') : null;
  return { kapali: !g.acik, neden: g.acik ? null : neden, platformlar: g.platformlar.map(ad).join(' + ') };
}

// ─── 2 · Bütçe ───────────────────────────────────────────────────────────────

export const SURE_SECENEKLERI = [1, 2, 3] as const;

/**
 * Kaydırıcının aralığı. Bir arayüz denetimi, tavsiye değil: alt sınır sıfır
 * değil bir para birimi (boş bütçe kaydırıcıyla seçilemesin), üst sınır yazılan
 * tutar büyüdükçe büyür (kaydırıcı yazılanı kırpmasın).
 */
export function kaydiriciAraligi(toplamMicros: bigint | null): { min: number; max: number; adim: number } {
  const tl = toplamMicros === null ? 0 : Number(toplamMicros / 1_000_000n);
  return { min: 1_000, max: Math.max(1_000_000, Math.ceil((tl * 2) / 100_000) * 100_000), adim: 1_000 };
}

export interface ButceDurumu {
  tutar: ReturnType<typeof tutarCoz>;
  donem: { baslangic: string; bitis: string };
  gun: number;
  aylik: bigint | null;
  gunluk: bigint | null;
  kontrol: ReturnType<typeof sihirbazButceKontrolu> | null;
  ilerler: boolean;
  /** Bütçe ya da süre kayıtlıdan farklı ve planda kampanya var: Devam onları yeniden kurar. */
  planYenidenKurulur: boolean;
}

/**
 * Bütçe adımının bütün sayıları: aylık, günlük, hedef başına günlük ve
 * platform asgarisi kontrolü (`sihirbazButceKontrolu`, motorla AYNI bölme).
 * Asgariler sunucudan (`asgariGunluk`), uydurma yok.
 */
export function butceDurumu(o: {
  metin: string;
  sureAy: number;
  baslangicAyi: string;
  amaclar: readonly RehberAmacKodu[];
  girdiler: Pick<StratejiSihirbazGirdileri, 'amaclar' | 'asgariGunluk' | 'paraBirimi'>;
  kayitli: { toplamMicros: string; baslangic: string; bitis: string; kalemSayisi: number } | null;
}): ButceDurumu {
  const tutar = tutarCoz(o.metin, o.girdiler.paraBirimi);
  const donem = stratejiDonemi(o.baslangicAyi, o.sureAy);
  const gun = donemGunSayisi(donem) ?? 0;
  const micros = tutar.tur === 'tamam' && tutar.micros > 0n ? tutar.micros : null;
  const acik = (amac: RehberAmacKodu) => o.girdiler.amaclar.find((x) => x.amac === amac)?.platformlar ?? [];
  const asgari = {
    meta: o.girdiler.asgariGunluk.meta === null ? null : BigInt(o.girdiler.asgariGunluk.meta),
    googleTalepYaratma: o.girdiler.asgariGunluk.googleTalepYaratma === null ? null : BigInt(o.girdiler.asgariGunluk.googleTalepYaratma),
  };
  const kontrol = micros === null ? null : sihirbazButceKontrolu({ amaclar: o.amaclar, toplamMicros: micros, gun, paraBirimi: o.girdiler.paraBirimi, acikPlatformlar: acik, asgari });
  const planYenidenKurulur =
    !!o.kayitli && o.kayitli.kalemSayisi > 0 && (micros?.toString() !== o.kayitli.toplamMicros || donem.baslangic !== o.kayitli.baslangic || donem.bitis !== o.kayitli.bitis);
  return {
    tutar,
    donem,
    gun,
    aylik: micros === null ? null : micros / BigInt(o.sureAy),
    gunluk: micros === null || gun === 0 ? null : micros / BigInt(gun),
    kontrol,
    ilerler: kontrol?.ilerler === true,
    planYenidenKurulur,
  };
}

// ─── 5 · İnceleme ────────────────────────────────────────────────────────────

/** Satır sırası: altı okuma + bütçe dağıtımı (`POST …/oner`). */
export const INCELEME_SATIRLARI: ReadonlyArray<StratejiIncelemeParcasi | 'dagitim'> = [...STRATEJI_INCELEME_PARCALARI, 'dagitim'];

export function incelemeEtiketi(p: StratejiIncelemeParcasi | 'dagitim'): string {
  return STRATEJI_INCELEME_ETIKETI[p];
}

export type IncelemeSatirHali =
  | { tur: 'sirada' }
  | { tur: 'okunuyor' }
  | { tur: 'bitti'; ozet: string; uyari: boolean }
  | { tur: 'dustu'; mesaj: string };

/**
 * İnceleme adımı açılınca ne olur. İnceleme KALEMLERİN TAMAMINI yeniden
 * yazıyor (`PUT …/kalemler`); kayıtlı kampanya varken kendiliğinden koşmak,
 * Plan adımındaki düzenlemeleri SORMADAN silmek demek (Ajan 4, 2026-10-13):
 *
 * - `ozet`: aynı girdilerle inceleme yapılmış; düzenlemeler durur.
 * - `sor`: kampanya var ama girdiler değişmiş YA DA hiç imza yok (sihirbazdan
 *   önce açılmış v2 taslağı/revizyonu: kalemleri ajans elle kurmuştu ve
 *   "Geri" ile buraya düşen kullanıcı bütün planını motorun seçtiği
 *   amaçlarla kaybediyordu). Kullanıcı "Yeniden incele"ye basar ya da eski
 *   kampanyalarla devam eder; ikisi de ekranda yazılı.
 * - `kos`: kampanya yok (ilk inceleme ya da bütçe değişti, sunucu sildi).
 */
export function incelemeAcilisi(o: { kalemSayisi: number; kayitliImza: string | null; imza: string }): 'ozet' | 'sor' | 'kos' {
  if (o.kalemSayisi === 0) return 'kos';
  return o.kayitliImza === o.imza ? 'ozet' : 'sor';
}

/** Yüzde: biten (düşen dahil) satır / toplam. Animasyon değil sayım: sahte ilerleme yok. */
export function incelemeYuzdesi(haller: readonly IncelemeSatirHali[]): number {
  if (haller.length === 0) return 0;
  return Math.round((haller.filter((h) => h.tur === 'bitti' || h.tur === 'dustu').length / haller.length) * 100);
}

// ─── Giriş ───────────────────────────────────────────────────────────────────

const ACIK: readonly string[] = ['taslak', 'onayda', 'revizyon'];

/**
 * Girişteki "Strateji oluştur" kartı. Workspace başına TEK açık strateji
 * (sunucunun kısmi tekil indeksi): açık taslak varsa kart "Taslağa devam et"
 * olur; onay bekleyen varsa yeni oluşturulamaz ve kart nedenini söyleyip
 * rapora götürür. 409'u beklemek kullanıcıya yedi ekranı doldurtup en
 * sonda "zaten var" demek olurdu.
 */
export type OlusturKarti = { tur: 'yeni' } | { tur: 'devam'; planId: string; revizyon: boolean } | { tur: 'onayda'; planId: string };

export function olusturKarti(planlar: readonly StratejiListeSatiri[]): OlusturKarti {
  const acik = planlar.find((p) => p.bicim === 2 && ACIK.includes(p.durum));
  if (!acik) return { tur: 'yeni' };
  if (acik.durum === 'onayda') return { tur: 'onayda', planId: acik.id };
  return { tur: 'devam', planId: acik.id, revizyon: acik.durum === 'revizyon' };
}

// ─── Kampanyaları kur (tek tek) ──────────────────────────────────────────────

export type KurulumHali = 'acildi' | 'hazir' | 'bekliyor' | 'bilinmiyor';

/** Kalemin kurulum hâli: KARAR SUNUCUNUN (`kalemAktarimEngeli`, aktarım önizlemesi). */
export function kurulumSatiri(k: Pick<StratejiKalemi, 'durum'>, karar: KalemAktarimKarari | null): { hal: KurulumHali; neden: string | null } {
  if (k.durum.tur === 'aktarildi') return { hal: 'acildi', neden: null };
  if (!karar) return { hal: 'bilinmiyor', neden: 'Kurulum önizlemesi bu kampanyayı içermiyor.' };
  if (karar.tur === 'engel') return { hal: karar.engel === 'zaten_aktarildi' ? 'acildi' : 'bekliyor', neden: KALEM_AKTARIM_ENGEL_METNI[karar.engel] };
  return { hal: 'hazir', neden: null };
}

/**
 * Sıradaki kalem: adresteki (`?kalem=`) geçerliyse o, değilse taslağı
 * açılmamış İLK kalem; hepsi açıldıysa `null` (bitiş ekranı). Kalem durumu
 * sunucudan türediği için yarıda bırakılan kurulum kaldığı yerden açılır.
 */
export function siradakiKalem(kalemler: ReadonlyArray<Pick<StratejiKalemi, 'id' | 'durum'>>, adresteki: string | null, atlanan: ReadonlySet<string>): string | null {
  if (adresteki && kalemler.some((k) => k.id === adresteki)) return adresteki;
  return kalemler.find((k) => k.durum.tur !== 'aktarildi' && !atlanan.has(k.id))?.id ?? null;
}

export function kurulumSirasi(
  kalemler: ReadonlyArray<Pick<StratejiKalemi, 'id' | 'durum'>>,
  simdi: string | null,
): Array<{ id: string; hal: RayHali; acildi: boolean }> {
  return kalemler.map((k) => ({ id: k.id, acildi: k.durum.tur === 'aktarildi', hal: k.durum.tur === 'aktarildi' ? 'bitti' : k.id === simdi ? 'simdi' : 'sirada' }));
}

/** Plan aktarılabilir mi: onaylı ve onaylanan sürüm bu sürüm. */
export function kurulabilirMi(p: { durum: StratejiDurumu; surum: number; onaylananSurum: number | null }): boolean {
  return p.durum === 'onaylandi' && p.onaylananSurum === p.surum;
}

// ─── Rapor listesi ───────────────────────────────────────────────────────────

/** Liste rozetinin tonu: yeşil YALNIZ durum ("Onaylandı"), kırmızı bekleyen iş. */
export function durumTonu(durum: string): 'ok' | 'uyari' | 'notr' {
  if (durum === 'onaylandi' || durum === 'aktarildi') return 'ok';
  if (durum === 'onayda' || durum === 'revizyon') return 'uyari';
  return 'notr';
}
