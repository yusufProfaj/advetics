import {
  ARAMA_HACMI_ESIGI,
  HUNI_ETIKETLERI,
  MUSTERI_ADINA_GEREKCE_EN_AZ,
  PILOT_PLAN_SON_DURUMLARI,
  PILOT_UCLARI,
  eylemArtirirMi,
  gercekYayinSchema,
  planDegistirSchema,
  workspaceBeyaniSchema,
  tutarGoster,
  type BosNedeni,
  type HuniKatmani,
  type Kaynak,
  type KaynakTuru,
  type KurulumSatirDurumu,
  type OnayKapisiSonucu,
  type OneriDurumu,
  type OneriEylemi,
  type OneriKarti,
  type OneriTuru,
  type PilotPlanDurumu,
  type PilotPlatformu,
  type PlanOnerisi,
  type UyumBulgusu,
  type UyumDurumu,
  type UyumIsareti,
} from '@advetics/shared';
import { ApiRequestError } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { mmAdresi, type MmBolumKodu } from '@/components/marka-merkezi/bolumler';
import type { OzelKategori, PilotGercekYayinDurumu, PilotWorkspaceBeyani, UyumSektoru, OneriBosNedeni, PilotBugun, PilotEkranEylemi, PilotPlanDetayi, PilotPlanSatiriOzeti } from '@advetics/shared';

/**
 * ═══ PİLOT EKRANLARININ SAF KARARLARI ═══
 *
 * Panelde bileşen render eden test altyapısı yok (`vitest.config.ts` bunu
 * bilinçli reddediyor). JSX ya da effect içinde duran bir karar yalnız
 * kaynak taramasıyla sınanabiliyor ve o tarama yanlış şeyi kilitleyebiliyor
 * (CLAUDE.md `domaYazilmali` dersi). "Hangi düğme birincil", "boş hücre ne
 * desin", "şerit dilimleri toplama eşit mi" gibi her karar burada ve
 * `hesap.spec.ts` onları ÇALIŞTIRARAK sınıyor. Bileşenler yalnız çiziyor.
 */

// ─── Dört hâl ───────────────────────────────────────────────────────────────

/**
 * İSTENMEDİ / YÜKLENİYOR / SONUÇ YOK / DÜŞTÜ ayrı hâller. `.catch(() => [])`
 * dördünü aynı boş alana çeviriyordu ve lokasyon aramasının neden boş
 * döndüğü bu yüzden teşhis edilemedi (CLAUDE.md).
 */
export type Hal<T> =
  | { tur: 'istenmedi' }
  | { tur: 'yukleniyor' }
  | { tur: 'tamam'; v: T }
  | { tur: 'hata'; mesaj: string };

/** Sunucunun kendi cümlesi; ağ düştüyse onu söyleyen ayrı cümle. */
export function okumaHatasi(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : 'Sunucuya ulaşılamadı.';
}

/**
 * Yazma hatası: başlık + kapının retleri OLDUĞU GİBİ. Sunucu 409'da bütün
 * retleri bir kerede yolluyor (`{ message, retler }`); yalnız başlığı
 * göstermek ("Plan müşteriye gönderilemez.") NEDENİ saklardı. Aynı cümle iki
 * retten gelirse bir kez yazılır.
 */
export function yazmaHatasi(err: unknown): { mesaj: string; retler: string[] } {
  if (!(err instanceof ApiRequestError)) return { mesaj: 'Sunucuya ulaşılamadı.', retler: [] };
  const retler = [...new Set((err.retler ?? []).map((r) => r.mesaj.trim()).filter((m) => m.length > 0 && m !== err.message))];
  return { mesaj: err.message, retler };
}

// ─── Uçlar ve adresler ─────────────────────────────────────────────────────

/*
 * YOL SÖZLEŞMEDEN. Tip `PILOT_UCLARI`daki yolların birleşimi; listede olmayan
 * bir yol derlenmiyor. Elle yazılan yol controller'dan ayrışırsa istek 404
 * alır ve ekran bunu "plan yok" diye okuyabilirdi.
 */
export type PilotYolu = (typeof PILOT_UCLARI)[number]['yol'];

export function pilotUcAdresi(yol: PilotYolu, id?: string): string {
  if (yol.includes(':id')) {
    if (!id) throw new Error(`${yol} bir kimlik istiyor`);
    return yol.replace(':id', encodeURIComponent(id));
  }
  return yol;
}

/**
 * Bir ucun izni sözleşmeden. Panel "bu kişi bu ucu okuyabilir mi" diye
 * sorarken izni ELLE yazarsa sözleşme değişince ekran 403 alan bir okuma
 * yapar ya da okuyabileceği bir şeyi hiç sormaz.
 */
export function ucIzni(yontem: 'GET' | 'POST' | 'PUT', yol: PilotYolu): (typeof PILOT_UCLARI)[number]['izin'] {
  const u = PILOT_UCLARI.find((x) => x.yontem === yontem && x.yol === yol);
  if (!u) throw new Error(`${yontem} ${yol} sözleşmede yok`);
  return u.izin;
}

/**
 * AdvStrategy içindeki bir yer. `musteri` TAŞINIYOR: sayfa aktif workspace'i
 * `?musteri` ile çözüyor ve parametresiz bağlantı başka sekmede başka
 * workspace seçmiş kullanıcıyı sessizce başka bir planına götürürdü.
 * `eski: true` eski ekranın kapısı (geri dönüş yolu, yeni ekran canlıdan
 * geçene kadar).
 */
export function planAdresi(clientId: string, hedef: { plan?: string | undefined; eski?: boolean } = {}): string {
  return baglanti('/strateji', { musteri: clientId, plan: hedef.plan, eski: hedef.eski ? '1' : undefined });
}

export function pilotAdresi(clientId: string, hedef: { eski?: boolean } = {}): string {
  return baglanti('/reklam', { musteri: clientId, eski: hedef.eski ? '1' : undefined });
}

/**
 * ESKİ EKRAN NE ZAMAN AÇILIR. `?eski=1` açık istek; `?oturum=` ise eski
 * sohbetin bir oturumuna giden bağlantı (eski AdvStrategy aktarımı ve
 * kayıtlı yer imleri onu üretiyor). İkincisini yeni ekrana çevirmek o
 * bağlantıları sessizce kırardı.
 */
export function eskiEkranMi(params: { eski?: string | undefined; oturum?: string | undefined }): boolean {
  return params.eski === '1' || Boolean(params.oturum);
}

// ─── Dönem ─────────────────────────────────────────────────────────────────

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export function donemEtiketi(donem: string): string {
  const [y, a] = donem.split('-').map(Number) as [number, number];
  return `${AYLAR[a - 1] ?? donem} ${y}`;
}

export function ayAdi(donem: string): string {
  const a = Number(donem.split('-')[1]);
  return AYLAR[a - 1] ?? donem;
}

/** "2026-11-01" → "1 Kasım". */
export function gunEtiketi(tarih: string): string {
  const [, a, g] = tarih.split('-').map(Number) as [number, number, number];
  return `${g} ${AYLAR[a - 1] ?? ''}`.trim();
}

/** Ayın 20'sinden sonra bu ayın kalanı küçük: önerilen dönem gelecek ay. */
export const GELECEK_AY_ESIGI_GUN = 20;

export function donemSecenekleri(bugun: string): { buAy: string; gelecekAy: string; varsayilan: string } {
  const [y, a, g] = bugun.split('-').map(Number) as [number, number, number];
  const buAy = `${y}-${String(a).padStart(2, '0')}`;
  const gelecekAy = a === 12 ? `${y + 1}-01` : `${y}-${String(a + 1).padStart(2, '0')}`;
  return { buAy, gelecekAy, varsayilan: g >= GELECEK_AY_ESIGI_GUN ? gelecekAy : buAy };
}

/**
 * Hangi plan açılır. Adresteki plan önce; yoksa en yeni AÇIK plan (son
 * durumda olmayan), o da yoksa en yeni plan. Adresteki plan bulunamadıysa
 * bu SÖYLENİR: sessizce başka bir plan göstermek, paylaşılan bağlantıyı
 * okuduğunu sandırırdı.
 */
export function planSec(
  planlar: readonly PilotPlanSatiriOzeti[],
  raw: string | undefined,
): { plan: PilotPlanSatiriOzeti | null; adrestekiYok: boolean } {
  const bulunan = raw ? planlar.find((p) => p.id === raw) : undefined;
  if (bulunan) return { plan: bulunan, adrestekiYok: false };
  const acik = planlar.find((p) => !PILOT_PLAN_SON_DURUMLARI.includes(p.durum));
  return { plan: acik ?? planlar[0] ?? null, adrestekiYok: Boolean(raw) };
}

/**
 * GEÇİŞ DÖNEMİ (S-4): aynı ay için eski AdvStrategy'de AÇIK bir plan
 * varsa yeni plan ekranı bunu SÖYLER; eski plan kendiliğinden iptal
 * edilmez. Söylenmezse ajans aynı ay için iki plan yürütüp iki kez
 * kampanya kurabilir: para harcayan mükerrerlik.
 */
export function eskiPlanNotu(eskiPlanlar: ReadonlyArray<{ donem: string; durum: string }>, donem: string): string | null {
  const acik = eskiPlanlar.some((p) => p.donem === donem && ['taslak', 'onayda', 'onaylandi'].includes(p.durum));
  return acik ? `${donemEtiketi(donem)} için eski AdvStrategy ekranında açık bir plan da var. Eski plan kendiliğinden iptal edilmez.` : null;
}

// ─── Para ──────────────────────────────────────────────────────────────────

/**
 * Ekrandaki tutar. Kuruşu sıfırsa YAZILMAZ: plan tutarları tam birime
 * yuvarlanıyor (M-4) ve her satırda ",00" okunacak bilgiyi gürültüye
 * gömerdi. Kuruşu olan tutar (Google "en çok" hesabı) olduğu gibi kalır;
 * onu yuvarlamak "en çok" sözünü küçültmek olurdu.
 */
export function para(micros: string | bigint, paraBirimi: string | null): string {
  const m = typeof micros === 'bigint' ? micros : BigInt(micros);
  return tutarGoster(m, paraBirimi ?? 'TRY').replace(/,0+ /, ' ');
}

/** Satırın bütçe biçimi ekranda: günlükse "x / gün", dönem toplamıysa "dönem toplamı". */
export function butceAltSatiri(butce: { tip: 'toplam' | 'gunluk'; micros: string }, paraBirimi: string | null): string {
  return butce.tip === 'gunluk' ? `${para(butce.micros, paraBirimi)} / gün` : 'dönem toplamı, aşılmaz';
}

// ─── Kaynak çipi ───────────────────────────────────────────────────────────

/** Çipin kısa adı. Tablo `Record`: yeni kaynak türü eklenip adı yazılmazsa derleme kırılır. */
export const KAYNAK_ETIKETI: Record<KaynakTuru, string> = {
  aylik_butce: 'Aylık Bütçe',
  gecmis_veri: 'Geçmiş veri',
  marka_merkezi: 'Marka Merkezi',
  kitle_sablonu: 'Kitle şablonu',
  varlik_performansi: 'Görsel performansı',
  kelime_fikri: 'Keyword Planner',
  arama_terimi: 'Arama terimleri',
  sabit_kural: 'Ajans kuralı',
  kullanici: 'Elle değişiklik',
  onayli_plan: 'Onaylı plan',
  platform_okumasi: 'Platformdan okundu',
  workspace_profili: 'Workspace',
  yz_metin: 'Yapay zekâ metni',
};

/** Pencereli kaynakta pencere çipe yazılır: "Geçmiş veri · 90 gün". */
export function kaynakEtiketi(k: Kaynak): string {
  const ad = KAYNAK_ETIKETI[k.tur];
  if (!k.pencere) return ad;
  const gun = gunFarki(k.pencere.from, k.pencere.to) + 1;
  return `${ad} · ${gun} gün`;
}

function gunFarki(a: string, b: string): number {
  const n = (t: string) => {
    const [y, m, d] = t.split('-').map(Number) as [number, number, number];
    return Math.floor(Date.UTC(y, m - 1, d, 12) / 86_400_000);
  };
  return n(b) - n(a);
}

/**
 * Çipe tıklayınca kaynağın kendisi. Yalnız panelde EKRANI olan kaynak
 * bağlanır; sabit kural, yapay zekâ metni ve elle değişiklik bir yere
 * gitmez (açıklama satırı onları anlatır). Ölü bağlantı vermektense hiç
 * vermemek: tıklanınca boş açılan bir sayfa "kaynak yok" demekten kötü.
 */
const KAYNAK_BOLUMU: Partial<Record<KaynakTuru, MmBolumKodu>> = {
  aylik_butce: 'butce',
  marka_merkezi: 'marka',
  kitle_sablonu: 'kitleler',
  varlik_performansi: 'varliklar',
  workspace_profili: 'ayarlar',
};

export function kaynakHedefi(k: Kaynak, clientId: string): string | null {
  if (k.tur === 'gecmis_veri') return baglanti('/dashboard', { musteri: clientId });
  const b = KAYNAK_BOLUMU[k.tur];
  return b ? mmAdresi(clientId, b) : null;
}

// ─── Boş hücre: neden + ne yapmalı (TEK TABLO) ─────────────────────────────

type NeYapmaliHedefi = MmBolumKodu | 'yeniden_hazirla' | null;

/**
 * Her boş hücrenin cümlesi BURADA ve yalnız burada. `Record`: sözleşmeye
 * yeni bir neden eklenip cümlesi yazılmazsa derleme kırılır ve ekran "veri
 * yok" gibi tek bir cümleye düşemez. Her nedenin yapılacak işi farklı
 * (`emptyReason` deseni); hepsini aynı boş alana çevirmek kullanıcıyı
 * yanlış yere gönderirdi.
 */
export const BOS_NEDENI_METNI: Record<BosNedeni, { ne: string; neYapmali: string; hedef: NeYapmaliHedefi }> = {
  aylik_butce_yok: { ne: 'Bu ay için bütçe yok.', neYapmali: 'Aylık Bütçe gir, sonra planı yeniden hazırla.', hedef: 'butce' },
  karisik_birim: { ne: 'Hesapların para birimi farklı.', neYapmali: 'Aynı para birimindeki hesapları ata.', hedef: 'baglantilar' },
  hesap_yok: { ne: 'Atanmış reklam hesabı yok.', neYapmali: 'Bağlantılardan bir reklam hesabı ata.', hedef: 'baglantilar' },
  gecmis_yok: { ne: 'Geçmiş sonuç verisi yok.', neYapmali: 'Hesap atandıktan sonra veri gelir; ajans kuralı kullanıldı.', hedef: null },
  donusum_yok: { ne: 'Son 90 günde dönüşüm yok.', neYapmali: 'Dönüşüm ölçümünü kontrol et.', hedef: null },
  kitle_yok: { ne: 'Kitle şablonu yok.', neYapmali: 'Kitleler bölümünde bir şablon oluştur.', hedef: 'kitleler' },
  varlik_yok: { ne: 'Kullanılabilir görsel yok.', neYapmali: 'Varlıklar bölümüne görsel yükle.', hedef: 'varliklar' },
  kelime_yok: { ne: 'Seçilecek arama kelimesi yok.', neYapmali: `Ayda ${ARAMA_HACMI_ESIGI.toLocaleString('tr-TR')} aramanın üstünde kelime bulunamadı; ürün kategorilerini genişlet.`, hedef: 'marka' },
  ana_amac_yok: { ne: 'Reklamın ana amacı seçilmemiş.', neYapmali: 'Marka bölümünde ana amacı seç.', hedef: 'marka' },
  niyet_derlenmiyor: { ne: 'Bu amaçla reklam henüz kurulamıyor.', neYapmali: 'Ana amacı değiştir ya da satırı çıkar.', hedef: 'marka' },
  marka_profili_yok: { ne: 'Marka bilgileri doldurulmamış.', neYapmali: 'Marka bölümünü doldur.', hedef: 'marka' },
  sayfa_yok: { ne: 'Facebook sayfası bağlı değil.', neYapmali: 'Bağlantılardan sayfayı bağla.', hedef: 'baglantilar' },
  adres_yok: { ne: 'Site adresi yok.', neYapmali: 'Marka bölümüne site adresini yaz.', hedef: 'marka' },
  form_yok: { ne: 'Form yok.', neYapmali: 'Varlıklar bölümünde bir form oluştur.', hedef: 'varliklar' },
  ozel_kategori_sorulmadi: { ne: 'Özel reklam kategorisi cevaplanmadı.', neYapmali: 'Reklam beyanında bir kez cevapla.', hedef: 'beyan' },
  donem_gecti: { ne: 'Bu dönem bitti.', neYapmali: 'Gelecek ay için yeni plan hazırla.', hedef: null },
  yz_yazmadi: { ne: 'Gerekçe yazılamadı.', neYapmali: 'Rakamlar etkilenmedi; istersen planı yeniden hazırla.', hedef: 'yeniden_hazirla' },
  kullanici_cikardi: { ne: 'Satır plandan çıkarıldı.', neYapmali: 'Tutarı dağıtılmamış kaldı.', hedef: null },
  harcanan_bilinmiyor: { ne: 'Bu ay harcanan okunamadı.', neYapmali: 'Senkronizasyon tamamlanınca planı yeniden hazırla.', hedef: 'yeniden_hazirla' },
  ay_butcesi_bitti: { ne: 'Bu ayın bütçesi harcandı.', neYapmali: 'Aylık Bütçe’yi artır ya da gelecek ay için hazırla.', hedef: 'butce' },
  // Reklam metni planın parçası (karar (a), 2026-10-08). Ajan 1 yalnız cümleleri
  // ekledi (derleme kırılmasın); metin önizlemesi Ajan 3'te.
  metin_bekliyor: { ne: 'Reklam metni henüz yazılmadı.', neYapmali: 'Planı yeniden hazırla; metin yazılır.', hedef: 'yeniden_hazirla' },
  metin_yazilamadi: { ne: 'Reklam metni yazılamadı.', neYapmali: 'Biraz sonra planı yeniden hazırla.', hedef: 'yeniden_hazirla' },
  yz_kapali: { ne: 'Yapay zekâ bağlı değil.', neYapmali: 'Ajans ayarlarından yapay zekâ bağlanmalı.', hedef: null },
  metin_denetimden_gecmedi: { ne: 'Reklam metni kontrolden geçmedi.', neYapmali: 'Marka bilgilerini kontrol et, sonra planı yeniden hazırla.', hedef: 'marka' },
  plan_eski_bicim: { ne: 'Bu plan reklam metni taşımıyor.', neYapmali: 'Planı yeniden hazırla.', hedef: 'yeniden_hazirla' },
};

export function bosNedeniBaglantisi(neden: BosNedeni, clientId: string): string | null {
  const h = BOS_NEDENI_METNI[neden].hedef;
  return h && h !== 'yeniden_hazirla' ? mmAdresi(clientId, h) : null;
}

// ─── Bütçe şeridi ──────────────────────────────────────────────────────────

export interface SeritDilimi {
  anahtar: string;
  platform: PilotPlatformu | 'dagitilmamis';
  etiket: string;
  micros: bigint;
  /** On binde pay (6200 = %62); şeridin `flex-grow`u. */
  payBaz: number;
  /** Aynı platformun kaçıncı tonu (0 en koyu). */
  ton: number;
}

const PLATFORM_ADI: Record<PilotPlatformu, string> = { meta: 'Meta', google: 'Google' };
const KATMAN_SIRASI: readonly HuniKatmani[] = ['soguk', 'sicak', 'yeniden_pazarlama'];

/**
 * Şerit, satırları PLATFORM × KATMAN olarak toplar. Satır tek tek çizilseydi
 * altı kampanyalık planda şerit okunmaz incelikte dilimlere bölünürdü.
 *
 * DAĞITILMAMIŞ PARA ŞERİTTE GÖRÜNÜR. Kullanıcı bir satırı çıkarınca tutarı
 * "dağıtılmamış"a dönüyor; şeritten düşürmek, planın toplamı ile şeridin
 * toplamını sessizce ayrıştırırdı. Dilim toplamı plan toplamına EŞİT
 * (testte).
 */
export function seritDilimleri(p: PlanOnerisi): SeritDilimi[] {
  const toplam = p.toplam.dolu ? BigInt(p.toplam.deger) : 0n;
  if (toplam <= 0n) return [];
  const gruplar = new Map<string, { platform: PilotPlatformu; katman: HuniKatmani; micros: bigint }>();
  for (const s of p.satirlar) {
    const k = `${s.platform}:${s.katman}`;
    const g = gruplar.get(k) ?? { platform: s.platform, katman: s.katman, micros: 0n };
    g.micros += BigInt(s.tutar.deger);
    gruplar.set(k, g);
  }
  const sirali = [...gruplar.entries()].sort(([, a], [, b]) =>
    a.platform === b.platform ? KATMAN_SIRASI.indexOf(a.katman) - KATMAN_SIRASI.indexOf(b.katman) : a.platform === 'meta' ? -1 : 1,
  );
  const tonSayaci: Partial<Record<PilotPlatformu, number>> = {};
  const dilimler: SeritDilimi[] = sirali
    .filter(([, g]) => g.micros > 0n)
    .map(([anahtar, g]) => {
      const ton = tonSayaci[g.platform] ?? 0;
      tonSayaci[g.platform] = ton + 1;
      const etiket = g.platform === 'google' ? 'Google · arama' : `Meta · ${HUNI_ETIKETLERI[g.katman].toLocaleLowerCase('tr-TR')}`;
      return { anahtar, platform: g.platform, etiket, micros: g.micros, payBaz: Number((g.micros * 10_000n) / toplam), ton };
    });
  const dagitilmamis = BigInt(p.dagitilmamis.micros);
  if (dagitilmamis > 0n) {
    dilimler.push({
      anahtar: 'dagitilmamis',
      platform: 'dagitilmamis',
      etiket: 'Dağıtılmamış',
      micros: dagitilmamis,
      payBaz: Number((dagitilmamis * 10_000n) / toplam),
      ton: 0,
    });
  }
  return dilimler;
}

/** On binde payı "%62" yazar; %1'in altını "%1'den az" (sıfır yazmak dilimi yok sayar). */
export function payMetni(payBaz: number): string {
  if (payBaz > 0 && payBaz < 100) return '%1’den az';
  return `%${Math.round(payBaz / 100)}`;
}

export function platformAdi(p: PilotPlatformu): string {
  return PLATFORM_ADI[p];
}

// ─── Kelimeler ─────────────────────────────────────────────────────────────

export interface KelimeGrubuSatiri {
  anahtar: string;
  grup: string;
  ornekler: string[];
  kalan: number;
  sayi: number;
  satir: PlanOnerisi['satirlar'][number];
}

/** Kelime bölümünün üst notu; eşik sözleşmenin sabitinden (elle yazılan sayı sabitle ayrışır). */
export const ARAMA_ESIGI_METNI = `ayda ${ARAMA_HACMI_ESIGI.toLocaleString('tr-TR')} aramanın üstü seçili`;

/** Google satırlarının kelime grupları; ilk iki kelime örnek, kalanı sayı ("+17"). */
export function kelimeGruplari(p: PlanOnerisi): KelimeGrubuSatiri[] {
  return p.satirlar
    .filter((s) => s.platform === 'google' && s.kelimeGrubu)
    .map((s) => {
      const k = s.kelimeGrubu!.kelimeler.deger;
      return { anahtar: s.anahtar, grup: s.kelimeGrubu!.grup, ornekler: k.slice(0, 2), kalan: Math.max(0, k.length - 2), sayi: k.length, satir: s };
    });
}

/** Kampanya özeti alt satırı: "5 Meta · 1 Google". Sıfır olan platform yazılmaz. */
export function kampanyaDagilimi(p: PlanOnerisi): string {
  const say = (pl: PilotPlatformu) => p.satirlar.filter((s) => s.platform === pl).length;
  return (['meta', 'google'] as const)
    .map((pl) => [pl, say(pl)] as const)
    .filter(([, n]) => n > 0)
    .map(([pl, n]) => `${n} ${PLATFORM_ADI[pl]}`)
    .join(' · ');
}

// ─── Plan durumu, adım şeridi ───────────────────────────────────────────────

export const DURUM_ETIKETI: Record<PilotPlanDurumu, string> = {
  taslak: 'Ajans incelemesinde',
  musteride: 'Müşteri onayı bekliyor',
  onaylandi: 'Onaylandı, kurulum sırada',
  kuruluyor: 'Kuruluyor',
  kismen_kuruldu: 'Bir kısmı kuruldu',
  kuruldu: 'Kuruldu',
  kapatildi: 'Kapatıldı',
  iptal: 'İptal edildi',
};

export type AdimHali = 'bitti' | 'simdi' | 'bekliyor';
export const ADIMLAR = ['Hazırlandı', 'Ajans incelemesi', 'Müşteri onayı', 'Kendiliğinden kurulum'] as const;

/** Adım şeridi. Kapanan ve iptal edilen planda şerit çizilmez (`null`): ilerleme yok. */
export function adimHalleri(durum: PilotPlanDurumu): AdimHali[] | null {
  const simdi: Partial<Record<PilotPlanDurumu, number>> = { taslak: 1, musteride: 2, onaylandi: 3, kuruluyor: 3, kismen_kuruldu: 3, kuruldu: 4 };
  const i = simdi[durum];
  if (i === undefined) return null;
  return ADIMLAR.map((_, n) => (n < i ? 'bitti' : n === i ? 'simdi' : 'bekliyor'));
}

// ─── Eylemler ve alt çubuk ──────────────────────────────────────────────────

export interface EylemDugmesi {
  eylem: PilotEkranEylemi;
  etiket: string;
}

/*
 * DÜĞMELER SUNUCUNUN `yapilabilir` LİSTESİNDEN. Panel `PILOT_PLAN_GECISLERI`
 * ne bakıp kendi listesini kursaydı yetkiyi bilmezdi: müşteri hesabı
 * "Müşteriye gönder"i görüp 403 alırdı. Buradaki diziler yalnız SIRA ve AD.
 *
 * TEK BİRİNCİL EYLEM. Koyu alt çubukta bir tane kırmızı düğme var; ikinci
 * birincil, "asıl iş hangisi" sorusunu kullanıcıya bırakırdı.
 */
const BIRINCIL_SIRA: readonly PilotEkranEylemi[] = ['musteriye_gonder', 'onayla', 'yeniden_dene'];
const IKINCIL_SIRA: readonly PilotEkranEylemi[] = ['degisiklik_iste', 'geri_cek', 'onayla', 'yeniden_hazirla', 'kapat', 'iptal'];

export function eylemEtiketi(e: PilotEkranEylemi, rol: 'musteri' | 'ajans'): string {
  switch (e) {
    case 'musteriye_gonder':
      return 'Müşteriye gönder';
    case 'onayla':
      return rol === 'musteri' ? 'Onayla' : 'Müşteri adına onayla';
    case 'degisiklik_iste':
      return 'Değişiklik iste';
    case 'geri_cek':
      return 'Geri çek';
    case 'yeniden_dene':
      return 'Şimdi kur';
    case 'yeniden_hazirla':
      return 'Yeniden hazırla';
    case 'kapat':
      return 'Planı kapat';
    case 'iptal':
      return 'İptal et';
    case 'degistir':
      return 'Uygula';
    case 'uyum_isaret':
      return 'Okudum';
  }
}

export interface AltCubuk {
  metin: string;
  birincil: EylemDugmesi | null;
  ikincil: EylemDugmesi[];
}

/**
 * Alt çubuğun cümlesi ve düğmeleri. AJANS "müşteri adına onayla"yı birincil
 * GÖREMEZ: müşteri onayı asıl yol, ajansın onayı panele girmeyen müşterinin
 * planı kalıcı beklemesin diye bir çıkış (S-1). İkisi aynı ağırlıkta
 * çizilseydi kısa yol asıl yol olurdu.
 */
export function altCubuk(d: Pick<PilotPlanDetayi, 'rol' | 'yapilabilir' | 'musteriOzeti' | 'plan' | 'onayKapisi'> & { icerik: Pick<PlanOnerisi, 'satirlar' | 'takvim'> }): AltCubuk {
  const izinli = new Set(d.yapilabilir);
  const birincilEylem = BIRINCIL_SIRA.find((e) => izinli.has(e) && !(e === 'onayla' && d.rol === 'ajans')) ?? null;
  const birincil = birincilEylem ? { eylem: birincilEylem, etiket: eylemEtiketi(birincilEylem, d.rol) } : null;
  const ikincil = IKINCIL_SIRA.filter((e) => izinli.has(e) && e !== birincilEylem).map((e) => ({ eylem: e, etiket: eylemEtiketi(e, d.rol) }));
  return { metin: altCubukMetni(d, birincilEylem), birincil, ikincil };
}

function altCubukMetni(
  d: Pick<PilotPlanDetayi, 'rol' | 'musteriOzeti' | 'plan' | 'onayKapisi'> & { icerik: Pick<PlanOnerisi, 'satirlar' | 'takvim'> },
  birincil: PilotEkranEylemi | null,
): string {
  const acilis = d.icerik.takvim ? gunEtiketi(d.icerik.takvim.baslangic) : null;
  const kurulamayan = d.icerik.satirlar.filter((s) => s.engeller.length > 0).length;
  switch (d.plan.durum) {
    case 'taslak':
      if (birincil === 'musteriye_gonder') {
        return acilis ? `Müşteri onaylayınca kampanyalar kendiliğinden kurulur ve ${acilis} günü açılır.` : 'Müşteri onaylayınca kampanyalar kendiliğinden kurulur.';
      }
      if (kurulamayan > 0) return `${kurulamayan} kampanya kurulamıyor. Eksikleri tamamlayınca gönderebilirsin.`;
      if (d.rol === 'musteri') return 'Ajansın planı hazırlıyor.';
      return 'Plan henüz gönderilemiyor.';
    case 'musteride':
      if (d.rol === 'musteri') {
        if (birincil !== 'onayla') return onayRetMesajlari(d.onayKapisi, 'musteri')[0] ?? 'Plan şu an onaylanamıyor.';
        return d.musteriOzeti ? `Onaylarsan en çok ${para(d.musteriOzeti.enCokMicros, d.musteriOzeti.paraBirimi)} harcanır. Kampanyalar kendiliğinden kurulur.` : 'Onaylarsan kampanyalar kendiliğinden kurulur.';
      }
      return 'Müşterinin onayı bekleniyor.';
    case 'onaylandi':
      return 'Onaylandı. Kurulum sırada.';
    case 'kuruluyor':
      return 'Kampanyalar kuruluyor.';
    case 'kismen_kuruldu':
      return birincil === 'yeniden_dene' ? 'Bazı kampanyalar kurulmadı. Şimdi kurabilirsin.' : 'Bazı kampanyalar kurulmadı.';
    case 'kuruldu':
      return acilis ? `Kampanyalar kuruldu, ${acilis} günü açılır.` : 'Kampanyalar kuruldu.';
    case 'kapatildi':
      return 'Plan kapatıldı.';
    case 'iptal':
      return 'Plan iptal edildi.';
  }
}

/**
 * Onay kapısının retleri. MÜŞTERİ MESAJI ile AJANS MESAJI AYRI (`onay.ts`):
 * müşteriye uyum kuralının adını yazmak onun çözemeyeceği bir sorunu onun
 * ekranına koymak. Boş mesaj (ör. GEREKCE yalnız ajansa) çizilmez.
 */
export function onayRetMesajlari(s: OnayKapisiSonucu | null, rol: 'musteri' | 'ajans'): string[] {
  if (!s || s.tur !== 'ret') return [];
  // GEREKÇE retini ajansa PANEL kendi alanında soruyor ("müşteri adına
  // onayla" kutusu); listede de görünürse ajans gerekçe yazmadan "onaylanamaz"
  // okur ve kutuyu açmaz.
  const m = s.retler.filter((r) => !(rol === 'ajans' && r.kod === 'GEREKCE')).map((r) => (rol === 'musteri' ? r.musteriMesaji : r.ajansMesaji)).filter((x) => x.trim().length > 0);
  return [...new Set(m)];
}

/**
 * Ajansa yazılan yayın kipi notu. Test ve kapalı kip MÜŞTERİYE YAZILMAZ
 * (Ç-4): müşteri "onaylandı" okur, ajans ne olacağını.
 */
export function ajansKipNotu(d: Pick<PilotPlanDetayi, 'rol' | 'onayKapisi' | 'plan'>): string | null {
  if (d.rol !== 'ajans') return null;
  if (d.plan.yayinKipi === 'test') return 'Uyum kontrolü bağlı değil: kampanyalar test kipinde kurulur ve açılmaz.';
  if (d.plan.yayinKipi === 'kapali') return 'Uyum kontrolü bağlı değil: onay kaydedildi, platforma bir şey yazılmadı.';
  if (d.plan.yayinKipi === null && d.onayKapisi?.tur === 'kabul') return d.onayKapisi.ajansNotu;
  return null;
}

// ─── İstek gövdeleri ───────────────────────────────────────────────────────

/**
 * ONAYLANAN ŞEY EKRANDAKİ SÜRÜM. Sürüm ve içerik özeti istek anında ekranda
 * okunan plandan; sunucu ikisini saklananla karşılaştırır (`onayKapisi`
 * SURUM). Taze okumayla kurulsaydı müşteri görmediği bir sürümü onaylardı.
 */
export function onayIstegi(
  plan: Pick<PilotPlanDetayi['plan'], 'surum' | 'icerikOzeti'>,
  musteriAdinaGerekce?: string,
): { surum: number; icerikOzeti: string; musteriAdinaGerekce?: string } {
  const g = musteriAdinaGerekce?.trim();
  return g ? { surum: plan.surum, icerikOzeti: plan.icerikOzeti, musteriAdinaGerekce: g } : { surum: plan.surum, icerikOzeti: plan.icerikOzeti };
}

/** Gerekçe sınırı sözleşmeden; panel ayrı bir sayı yazarsa sunucuyla ayrışır. */
export function gerekceEksigi(gerekce: string): number {
  return Math.max(0, MUSTERI_ADINA_GEREKCE_EN_AZ - gerekce.trim().length);
}

export function eylemIstegi(planId: string, eylem: 'musteriye_gonder' | 'geri_cek' | 'yeniden_dene' | 'kapat' | 'iptal', surum: number) {
  return { yol: pilotUcAdresi('/pilot/planlar/:id/eylem', planId), govde: { eylem, surum } };
}

export const DEGISTIR_CUMLE_EN_COK = 500;

/**
 * "Değiştir" kutusunun gövdesi. Cümle boş ya da uzunsa istek HİÇ gitmez ve
 * neden ekranda yazılır: sunucunun 400'ünü beklemek, kullanıcıya cümleyi
 * yazdıktan sonra "geçersiz" demek olurdu.
 */
export function degistirCumlesi(surum: number, cumle: string): { tur: 'tamam'; govde: { surum: number; cumle: string } } | { tur: 'hata'; mesaj: string } {
  const c = cumle.trim();
  if (c.length === 0) return { tur: 'hata', mesaj: 'Ne değişsin, yaz.' };
  if (c.length > DEGISTIR_CUMLE_EN_COK) return { tur: 'hata', mesaj: `En çok ${DEGISTIR_CUMLE_EN_COK} karakter.` };
  return { tur: 'tamam', govde: { surum, cumle: c } };
}

/** Elle "Çıkar": sözleşmenin şemasından geçen gövde (geçmezse istek gitmez). */
export function satirCikarIstegi(surum: number, anahtar: string) {
  return planDegistirSchema.parse({ surum, degisiklikler: [{ tur: 'satir_cikar', anahtar }] });
}

// ─── Pilot: bugün, öneri, kurulum ──────────────────────────────────────────

export interface BugunKutusu {
  etiket: string;
  deger: string | null;
  bos: BosNedeni | null;
  alt: string | null;
  /** Ay bütçesi kutusunda: harcanan ve geçen gün yüzdesi (hız çubuğu). */
  hiz: { harcananYuzde: number; gecenYuzde: number } | null;
}

export function bugunKutulari(b: PilotBugun): BugunKutusu[] {
  const pb = b.paraBirimi;
  const h = <T>(c: { dolu: true; deger: T } | { dolu: false; emptyReason: BosNedeni }, f: (v: T) => string) =>
    c.dolu ? { deger: f(c.deger), bos: null } : { deger: null, bos: c.emptyReason };
  const gecenYuzde = b.ay.ayGun > 0 ? Math.round((b.ay.gecenGun * 100) / b.ay.ayGun) : 0;
  let ay: Pick<BugunKutusu, 'deger' | 'bos' | 'hiz' | 'alt'>;
  if (b.ay.butceMicros.dolu && b.ay.harcananMicros.dolu && BigInt(b.ay.butceMicros.deger) > 0n) {
    const yuzde = Number((BigInt(b.ay.harcananMicros.deger) * 100n) / BigInt(b.ay.butceMicros.deger));
    ay = { deger: `%${yuzde}`, bos: null, hiz: { harcananYuzde: Math.min(100, yuzde), gecenYuzde }, alt: `ayın %${gecenYuzde} kadarı geçti` };
  } else {
    ay = { deger: null, bos: !b.ay.butceMicros.dolu ? b.ay.butceMicros.emptyReason : !b.ay.harcananMicros.dolu ? b.ay.harcananMicros.emptyReason : 'aylik_butce_yok', hiz: null, alt: null };
  }
  return [
    { etiket: 'Dün harcama', ...h(b.dun.harcamaMicros, (v) => para(v, pb)), alt: null, hiz: null },
    { etiket: 'Dün sonuç', ...h(b.dun.sonuc, (v) => v.toLocaleString('tr-TR')), alt: null, hiz: null },
    { etiket: 'Sonuç başı', ...h(b.dun.sonucBasiMicros, (v) => para(v, pb)), alt: null, hiz: null },
    { etiket: 'Ay bütçesi', ...ay },
  ];
}

export const ONERI_TUR_ETIKETI: Record<OneriTuru, string> = {
  harcayip_donusmeyen: 'harcıyor, sonuç yok',
  yorulan_kreatif: 'yorulan görsel',
  negatif_aday_terim: 'arama terimi',
  butce_hizi_sapmasi: 'bütçe hızı',
};

export function oneriEylemEtiketi(e: OneriEylemi): string {
  switch (e.tur) {
    case 'durdur':
      return 'Durdur';
    case 'butce_degistir':
      return eylemArtirirMi(e) ? 'Bütçeyi artır' : 'Bütçeyi kıs';
    case 'negatif_ekle':
      return 'Negatif yap';
    case 'kreatif_varyasyon_taslagi':
      return 'Taslağı hazırla';
  }
}

/** Kartın başlığı: eylem + hedef adı, soru biçiminde ("durdurayım mı?"). */
export function oneriBasligi(k: Pick<OneriKarti, 'eylem' | 'hedef'>): string {
  switch (k.eylem.tur) {
    case 'durdur':
      return `"${k.hedef.ad}" durdurulsun mu?`;
    case 'butce_degistir':
      return `"${k.hedef.ad}" bütçesi ${eylemArtirirMi(k.eylem) ? 'artırılsın' : 'kısılsın'} mı?`;
    case 'negatif_ekle':
      return `${k.eylem.terimler.length} arama terimi negatif yapılsın mı?`;
    case 'kreatif_varyasyon_taslagi':
      return `"${k.hedef.ad}" için yeni görsel taslağı hazırlansın mı?`;
  }
}

/**
 * KARTLAR "EN ÇOK PARA ETKİLEYEN ÜSTTE". Beklenen etkisi parayla ölçülen
 * kartlar tutara göre azalan; etkisi hesaplanamayanlar onların altında, en
 * yeniden eskiye. Sıra sunucudan gelseydi bile burada sabitlenir: aynı
 * liste iki yenilemede farklı sırayla gelirse kullanıcı az önce baktığı
 * kartı kaybeder.
 */
export function oneriSirala(kartlar: readonly OneriKarti[]): OneriKarti[] {
  const tutar = (k: OneriKarti): bigint | null => (k.beklenenEtki.dolu && k.beklenenEtki.deger.micros !== null ? BigInt(k.beklenenEtki.deger.micros) : null);
  return [...kartlar].sort((a, b) => {
    const ta = tutar(a);
    const tb = tutar(b);
    if (ta !== null && tb !== null && ta !== tb) return ta > tb ? -1 : 1;
    if ((ta === null) !== (tb === null)) return ta === null ? 1 : -1;
    return b.olusturuldu.localeCompare(a.olusturuldu) || a.id.localeCompare(b.id);
  });
}

/**
 * ÖNERİ UYGULAMA KAPALI (Tur 1). Uygula/geri al/geç uçları Tur 2'de
 * yazılıyor; düğmeyi şimdi göstermek, basınca 404 alan ve kullanıcıya
 * "uygulandı mı?" sorusunu bırakan bir seçenek demek (çalışmayan seçenek
 * gösterilmez kuralı). Kartlar yalnız okunur; açılınca TEK satır değişir.
 */
export const ONERI_UYGULAMA_ACIK = false as boolean;

/** Kartın düğmeleri durumdan. Bayat kartta "Uygula" yok: eski ölçüyle platforma yazmak güncel bir kararı ezer. */
export function oneriDugmeleri(
  k: Pick<OneriKarti, 'durum' | 'gecerlilikSonu'>,
  simdi: string,
  acik: boolean = ONERI_UYGULAMA_ACIK,
): Array<'uygula' | 'gec' | 'geri_al'> {
  if (!acik) return [];
  if (k.durum === 'yeni') return simdi >= k.gecerlilikSonu ? ['gec'] : ['uygula', 'gec'];
  if (k.durum === 'uygulandi') return ['geri_al'];
  return [];
}

export const ONERI_DURUM_METNI: Record<OneriDurumu, string | null> = {
  yeni: null,
  uygulaniyor: 'Uygulanıyor.',
  sonuc_belirsiz: 'Platform cevap vermedi; durum okunuyor. Tekrar gönderilmedi.',
  uygulandi: 'Uygulandı.',
  geri_aliniyor: 'Geri alınıyor.',
  gecildi: 'Geçildi.',
  bayat: 'Ölçü eskidi; bir sonraki taramada yenilenir.',
  geri_alindi: 'Geri alındı.',
};

export const ONERI_BOS_METNI: Record<OneriBosNedeni, { baslik: string; aciklama: string }> = {
  tarama_kosmadi: { baslik: 'Hesap henüz taranmadı.', aciklama: 'İlk tarama gece yapılır; sabah kartlar burada.' },
  tarama_dustu: { baslik: 'Son tarama tamamlanamadı.', aciklama: 'Bir sonraki tarama yeniden dener.' },
  oneri_yok: { baslik: 'Bugün karar bekleyen bir şey yok.', aciklama: 'Hesap tarandı, öneri çıkmadı.' },
  suzgecte_yok: { baslik: 'Bu süzgeçte kart yok.', aciklama: 'Süzgeci kaldırınca diğer kartlar görünür.' },
};

export type KurulumTonu = 'tamam' | 'bekliyor' | 'dikkat' | 'hata';

export const KURULUM_DURUM_METNI: Record<KurulumSatirDurumu, { metin: string; ton: KurulumTonu }> = {
  taslak: { metin: 'Sırada', ton: 'bekliyor' },
  prova: { metin: 'Kontrol ediliyor', ton: 'bekliyor' },
  prova_dustu: { metin: 'Kontrolden geçmedi', ton: 'hata' },
  kuruluyor: { metin: 'Kuruluyor', ton: 'bekliyor' },
  kayit_belirsiz: { metin: 'Kayıt belirsiz, tekrar kurulmaz', ton: 'hata' },
  geri_okundu_ayni: { metin: 'Planla aynı', ton: 'bekliyor' },
  fark_var: { metin: 'Planla farklı', ton: 'hata' },
  aciliyor: { metin: 'Açılıyor', ton: 'bekliyor' },
  acildi: { metin: 'Açıldı', ton: 'tamam' },
  duraklatilmis_kuruldu: { metin: 'Duraklatılmış kuruldu', ton: 'dikkat' },
  test_kipinde_kuruldu: { metin: 'Test kipinde kuruldu', ton: 'dikkat' },
  kurulmadi_kapali: { metin: 'Kurulmadı', ton: 'dikkat' },
  dustu: { metin: 'Kurulamadı', ton: 'hata' },
};

/** Pilot açılışında kurulum listesi gösterilecek planlar: kurulumu başlamış ya da bekleyen. */
export const KURULUM_GORUNEN_DURUMLAR: readonly PilotPlanDurumu[] = ['onaylandi', 'kuruluyor', 'kismen_kuruldu', 'kuruldu'];

export function kurulumPlanlari(planlar: readonly PilotPlanSatiriOzeti[]): PilotPlanSatiriOzeti[] {
  return planlar.filter((p) => KURULUM_GORUNEN_DURUMLAR.includes(p.durum));
}

/** Açılış başlığı: "Bugün 3 karar bekliyor" / "Bugün karar bekleyen yok". */
export function acilisBasligi(bekleyen: number): string {
  return bekleyen > 0 ? `Bugün ${bekleyen} karar bekliyor` : 'Bugün karar bekleyen yok';
}

// ─── Uyum (yalnız ajans görünümü) ──────────────────────────────────────────

/**
 * Uyum durumunun ajansa cümlesi. `bagli_degil` "geçti" DEĞİL ve öyle
 * okunmamalı (uyum.ts: boş bulgu listesi denetlenmedi de demek olabilir).
 */
export const UYUM_DURUM_METNI: Record<UyumDurumu, { metin: string; ton: 'bilgi' | 'uyari' | 'tehlike' | 'basari' }> = {
  bagli_degil: { metin: 'Uyum kontrolü bağlı değil. Onaylansa da kampanyalar gerçek yayına çıkmaz.', ton: 'uyari' },
  gecti: { metin: 'Uyum kontrolünden geçti.', ton: 'basari' },
  uyari_isaret_bekliyor: { metin: 'Okunması gereken uyarı var. Okuyup işaretlemeden müşteriye gidemez.', ton: 'uyari' },
  engel: { metin: 'Uyum kontrolünde engel var. Plan bu hâliyle gönderilemez.', ton: 'tehlike' },
  bayat: { metin: 'Plan değişti; uyum kontrolü bu sürüm için yeniden koşacak.', ton: 'bilgi' },
};

/** İşaret MESAJIYLA eşleşir: kural metni değişince eski işaret düşer (uyum.ts, TASARIM §10.2). */
export function isaretliMi(b: Pick<UyumBulgusu, 'kuralKimligi' | 'mesaj'>, isaretler: readonly UyumIsareti[]): boolean {
  return isaretler.some((i) => i.kuralKimligi === b.kuralKimligi && i.mesaj === b.mesaj);
}

/** PDF dosya adı: sürüm adda, iki indirme karışmasın. */
export function pdfDosyaAdi(donem: string, surum: number): string {
  return `plan-${donem}-s${surum}.pdf`;
}

// ─── Gerçek yayın anahtarı (ajans geneli) ──────────────────────────────────

/** Anahtar kapalıyken AJANSA yazılan not; müşteri bu ucu hiç okumuyor. */
export const GERCEK_YAYIN_KAPALI_NOTU =
  'Gerçek yayın kapalı: onaylanan planlar müşteri hesabına yazılmaz, ajansın kendi hesabında test kipinde kurulur.';
/** Açmadan önceki TEK cümle. Açmak para harcatır; uzun bir metin okunmaz. */
export const GERCEK_YAYIN_ACMA_UYARISI = 'Açarsan müşterinin onayladığı planlar müşteri hesabında gerçek bütçeyle yayına çıkar.';

export interface GercekYayinGorunumu {
  acik: boolean;
  ton: 'uyari' | 'tehlike' | 'basari';
  baslik: string;
  /** Son değişikliğin izi: kim, ne zaman, neden. */
  iz: string | null;
  eylem: 'ac' | 'kapat' | null;
}

/**
 * OKUNAMAYAN ANAHTAR KAPALIDIR ve düğmesi yoktur: durumu bilinmeyen bir
 * anahtarı "aç" demek, belki zaten açık olanı ikinci kez açmak ya da açık
 * olanı kapalı sanıp yanlış karar vermek olurdu. Sunucu da o hâlde test
 * kipine düşüyor; ekran aynısını söylüyor.
 */
export function gercekYayinGorunumu(d: PilotGercekYayinDurumu): GercekYayinGorunumu {
  if (d.okunamadi) return { acik: false, ton: 'tehlike', baslik: `Gerçek yayın anahtarı okunamadı, kapalı sayılıyor: ${d.okunamadi}`, iz: null, eylem: null };
  const iz = d.zaman ? [d.degistiren ?? 'Bilinmeyen kişi', zamanMetni(d.zaman), d.sebep ? `“${d.sebep}”` : null].filter(Boolean).join(' · ') : null;
  if (!d.acik) return { acik: false, ton: 'uyari', baslik: GERCEK_YAYIN_KAPALI_NOTU, iz, eylem: d.degistirebilir ? 'ac' : null };
  return { acik: true, ton: 'basari', baslik: 'Gerçek yayın açık: onaylanan planlar müşteri hesabında yayına çıkar.', iz, eylem: d.degistirebilir ? 'kapat' : null };
}

function zamanMetni(iso: string): string {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? iso : t.toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' });
}

/** Gövde sözleşmenin şemasından; sebep iki yönde de zorunlu (10–500). Geçmezse istek gitmez. */
export function gercekYayinIstegi(acik: boolean, sebep: string): { tur: 'tamam'; govde: { acik: boolean; sebep: string } } | { tur: 'hata'; mesaj: string } {
  const r = gercekYayinSchema.safeParse({ acik, sebep });
  return r.success ? { tur: 'tamam', govde: r.data } : { tur: 'hata', mesaj: r.error.issues[0]?.message ?? 'Sebep geçersiz.' };
}

// ─── Workspace beyanı (özel kategori + sektör) ─────────────────────────────

/**
 * Seçim hâli. `null` = henüz HİÇBİR seçenek seçilmedi (soru açık); `'hicbiri'`
 * = "Hayır" beyanı; dizi = seçilen kategoriler. Sunucunun `null`ı (hiç
 * cevaplanmadı) ile `[]`ı (hiçbiri) ekranda da ayrı kalmalı: ikisini aynı
 * boş seçime çevirmek "Hayır" demeyen birini "Hayır" demiş saymaktır.
 */
export type BeyanSecimi = null | 'hicbiri' | OzelKategori[];

export function beyanBaslangici(b: Pick<PilotWorkspaceBeyani, 'ozelKategoriler' | 'taninmayanKategoriler'>): BeyanSecimi {
  // Tanınmayan kategori taşıyan kayıt GÜVENİLMEZ: yeniden beyan edilene kadar soru açık sayılır.
  if (b.taninmayanKategoriler.length > 0) return null;
  if (b.ozelKategoriler === null) return null;
  return b.ozelKategoriler.length === 0 ? 'hicbiri' : [...b.ozelKategoriler];
}

export function beyanIstegi(
  clientId: string,
  secim: BeyanSecimi,
  sektor: string,
): { tur: 'tamam'; govde: { clientId: string; ozelKategoriler: OzelKategori[]; sektor: string } } | { tur: 'hata'; mesaj: string } {
  if (secim === null) return { tur: 'hata', mesaj: 'Özel kategori sorusunu cevapla.' };
  if (Array.isArray(secim) && secim.length === 0) return { tur: 'hata', mesaj: 'En az bir kategori seç ya da "Hayır" de.' };
  const r = workspaceBeyaniSchema.safeParse({ clientId, ozelKategoriler: secim === 'hicbiri' ? [] : secim, sektor });
  return r.success ? { tur: 'tamam', govde: r.data } : { tur: 'hata', mesaj: r.error.issues[0]?.message ?? 'Beyan geçersiz.' };
}

/**
 * Bu beyanla çözülen uyum kuralları. Plan belgesinde bu kurallardan biri
 * duruyorsa ajansa beyan bölümüne giden bağlantı çizilir. Kimlikler
 * katalogda var mı testte sınanıyor: kural kimliği değişirse bağlantı
 * sessizce kaybolmasın.
 */
export const BEYAN_KURALLARI: readonly string[] = ['GNL-13', 'GNL-18', 'GNL-20', 'OZK-SYS'];

export function beyanGerekiyorMu(bulgular: ReadonlyArray<{ kuralKimligi: string }>): boolean {
  return bulgular.some((b) => BEYAN_KURALLARI.includes(b.kuralKimligi));
}

/**
 * Denetçinin sektörü nasıl okuduğu, ekranda. Ajans serbest metin yazıyor;
 * denetçi onu kapalı sözlüğe çeviriyor (`sektorCoz`). Çeviriyi göstermek,
 * "diş kliniği" yazıp sağlık kurallarının hiç koşmadığını fark etmemenin
 * önüne geçiyor. `Record`: sözlüğe yeni sektör eklenip adı yazılmazsa
 * derleme kırılır.
 */
export const SEKTOR_ETIKETI: Record<UyumSektoru, string> = {
  KONUT_GELISTIRICI: 'Konut geliştirici',
  EMLAK_ARACI: 'Emlak aracısı',
  SAGLIK_KURULUSU: 'Sağlık kuruluşu',
  SAGLIK_MESLEK_MENSUBU: 'Sağlık meslek mensubu',
  SAGLIK_TURIZMI: 'Sağlık turizmi',
  OTEL_KONAKLAMA: 'Otel, konaklama',
  KISA_SURELI_KIRALIK: 'Kısa süreli kiralık',
  SEYAHAT_ACENTASI: 'Seyahat acentası',
  ETICARET: 'E-ticaret',
  B2B_URETICI: 'Üretici (B2B)',
  YEREL_HIZMET: 'Yerel hizmet',
  EGITIM_MEB: 'Eğitim (MEB)',
  EGITIM_DIGER: 'Eğitim (diğer)',
  DIGER: 'Diğer',
};
