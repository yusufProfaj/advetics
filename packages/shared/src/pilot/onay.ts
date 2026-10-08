import { tutarGoster } from '../reklam/para';
import { metinliSatirSayisi, planMetinEksikleri } from './metin';
import type { PlanOnerisi } from './plan';
import type { PilotPlanDurumu } from './plan';
import type { UyumDurumu } from './uyum';

/**
 * ═══ PLAN ONAYI = YAYIN KAPISI (Ç-6, 2026-10-07) ═══
 *
 * Müşteri planı onaylayınca kampanyalar KENDİLİĞİNDEN kurulur ve açılır;
 * ajansın ayrı bir "yayına al" düğmesi yok. Yani `client_viewer` rolünün bir
 * tıklaması PARA HARCAYAN bir olay. Bu dosya o tıklamanın kapısı:
 *
 *   1. Onaylanan şey sürümün ÖZETİ (hash). İstek `surum` + `icerikOzeti`
 *      taşır; sunucu saklanan sürümle karşılaştırır. Müşteri ekranda
 *      okuduğu belgeyi onaylar; arada ajans planı değiştirdiyse onay düşer.
 *   2. Müşteri ekranı kendi dilinde üç sayı yazar: toplam, süre, EN ÇOK
 *      harcanabilecek tutar (`musteriOzeti`).
 *   3. Uyum denetçisi geçmeden onay yayını BAŞLATMAZ: kurulum test kipinde
 *      kalır (ajansın kendi şirketinde) ya da hiç kurulmaz. Bunu müşteriye
 *      SÖYLEMEZ (müşteriye "onaylandı" der), ajansa söyler (`ajansNotu`).
 *   4. Plan toplamı o ayın Aylık Bütçe'sini aşamaz; kurulamayan satır
 *      taşıyan plan onaya hiç gelmez.
 *   5. REKLAM METNİ ONAYIN PARÇASI (karar (a), 2026-10-08): metni olmayan,
 *      denetimden geçmeyen ya da TAZE yasal uyarıyı taşımayan Meta satırı
 *      "kurulamayan satır" sayılır. Müşteriye onaylattığımız özet metni de
 *      kapsıyor; metinsiz bir onay, kimsenin okumadığı bir reklamı yayına
 *      sokardı.
 */

/** Google günlük bütçeyi bazı günler 2 katına kadar aşabiliyor; ay sınırı 30,4 × günlük. [Canlıda doğrulanmadı.] */
export const GOOGLE_GUNLUK_ESNEKLIK_KATI = 2n;
export const GOOGLE_AYLIK_CARPAN_ON = 304n;

function gunNo(t: string): number {
  const [y, a, g] = t.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, a - 1, g, 12) / 86_400_000);
}

export interface MusteriOzeti {
  paraBirimi: string;
  toplamMicros: string;
  /** Platformların bütçe biçiminden hesaplanan üst sınır; toplamdan büyük olabilir (Google esnekliği). */
  enCokMicros: string;
  baslangic: string;
  bitis: string;
  gunSayisi: number;
  kampanyaSayisi: number;
  platformlar: Array<{ platform: 'meta' | 'google'; kampanya: number; toplamMicros: string; enCokMicros: string }>;
  /** Ekrandaki cümleler: rakamlar yukarıdaki alanlardan, metin şablonla. */
  cumleler: string[];
}

/**
 * Müşterinin onay ekranındaki özet. Meta satırları dönem toplamı taşıdığı
 * için en çok = toplam; Google günlük taşıdığı için en çok =
 * min(gün × 2 × günlük, 30,4 × günlük). İkisi ayrı yazılır: "en çok" sözü
 * ortalamayı değil üst sınırı anlatmalı (eski `enCokHarcama` dersi).
 */
export function musteriOzeti(p: PlanOnerisi): MusteriOzeti | null {
  if (!p.toplam.dolu || !p.takvim || !p.paraBirimi) return null;
  const gun = gunNo(p.takvim.bitis) - gunNo(p.takvim.baslangic) + 1;
  const plat = new Map<'meta' | 'google', { kampanya: number; toplam: bigint; enCok: bigint }>();
  for (const s of p.satirlar) {
    const v = plat.get(s.platform) ?? { kampanya: 0, toplam: 0n, enCok: 0n };
    v.kampanya += 1;
    v.toplam += BigInt(s.tutar.deger);
    const b = BigInt(s.butce.deger.micros);
    if (s.butce.deger.tip === 'toplam') v.enCok += b;
    else {
      const gunluk = BigInt(gun) * GOOGLE_GUNLUK_ESNEKLIK_KATI * b;
      const aylik = (b * GOOGLE_AYLIK_CARPAN_ON) / 10n;
      v.enCok += gunluk < aylik ? gunluk : aylik;
    }
    plat.set(s.platform, v);
  }
  const platformlar = [...plat.entries()].map(([platform, v]) => ({
    platform,
    kampanya: v.kampanya,
    toplamMicros: v.toplam.toString(),
    enCokMicros: v.enCok.toString(),
  }));
  const toplam = BigInt(p.toplam.deger);
  const enCok = platformlar.reduce((a, x) => a + BigInt(x.enCokMicros), 0n);
  const para = p.paraBirimi;
  const cumleler = [
    `${p.satirlar.length} kampanya, ${gun} gün (${p.takvim.baslangic} – ${p.takvim.bitis}).`,
    `Toplam bütçe ${tutarGoster(toplam, para)}.`,
    enCok > toplam
      ? `Google bazı günler günlük bütçesinin iki katına kadar harcayabilir; en çok ${tutarGoster(enCok, para)} harcanabilir.`
      : `En çok ${tutarGoster(enCok, para)} harcanır; bu tutar aşılmaz.`,
    // Müşteri metnin de onaylandığını BİLMELİ: aksi hâlde onayı "bütçeye
    // evet" sanıp metni okumadan geçer ve kararın amacı boşa düşer.
    ...(metinliSatirSayisi(p) > 0 ? ['Planda gördüğün reklam metinleri de onayın parçası; kampanyalar bu metinlerle yayınlanır.'] : []),
    'Onaylarsan kampanyalar kurulur ve başlangıç tarihinde açılır.',
  ];
  return {
    paraBirimi: para,
    toplamMicros: toplam.toString(),
    enCokMicros: enCok.toString(),
    baslangic: p.takvim.baslangic,
    bitis: p.takvim.bitis,
    gunSayisi: gun,
    kampanyaSayisi: p.satirlar.length,
    platformlar,
    cumleler,
  };
}

/**
 * Yayın kipi: onay anında sunucu hesaplar ve `pilot_planlari.yayin_kipi`
 * kolonuna yazar (onaydan sonra yalnız gerçeğe doğru değişir, S-6).
 *   · `gercek` — uyum geçti VE ajansın "Pilot gerçek yayın" anahtarı AÇIK.
 *   · `test`   — kurar, geri okur, AÇMADAN arşivler; YALNIZ AJANSIN KENDİ
 *                şirketinde (anahtar kapalı ya da uyum bağlı değil).
 *   · `kapali` — müşteri şirketinde anahtar kapalıyken ya da uyum geçmemişken:
 *                onay kaydedilir, platforma HİÇ yazılmaz. Kullanıcı kararı
 *                (2026-10-07): müşterinin Meta hesabında test kampanyası
 *                kurup arşivlemek istenmedi — müşteri onu kendi reklam
 *                yöneticisinde görür. "Profaj'ın kendi hesabında bir tur
 *                temiz geçince anahtarı ajans açar"; açılınca bekleyen planlar
 *                ajansın "Şimdi kur"uyla gerçeğe geçer.
 *
 * TEK KAPI: anahtarın değeri sunucuda `gercekYayinAcikMi`dan okunur;
 * okunamazsa KAPALI. Parametre zorunlu, varsayılanı YOK: unutulan bir
 * çağrı derlemede kırılsın, sessizce gerçeğe düşmesin.
 */
export type YayinKipi = 'gercek' | 'test' | 'kapali';

export function yayinKipi(uyum: UyumDurumu, ajansinKendiSirketi: boolean, gercekYayinAcik: boolean): YayinKipi {
  if (uyum === 'gecti' && gercekYayinAcik) return 'gercek';
  return ajansinKendiSirketi ? 'test' : 'kapali';
}

/** Ajans görünümündeki kip cümlesi (müşteriye yazılmaz). */
export function kipNotu(kip: YayinKipi, uyum: UyumDurumu): string | null {
  if (kip === 'gercek') return null;
  const neden = uyum === 'gecti' ? 'Pilot gerçek yayın anahtarı kapalı' : 'Uyum denetimi geçmedi';
  return kip === 'test'
    ? `${neden}: kampanyalar test kipinde kurulur, geri okunur ve açılmadan arşivlenir.`
    : `${neden}: onay kaydedildi, platforma hiçbir şey yazılmadı. Anahtar açılınca "Şimdi kur".`;
}

export interface OnayKapisiGirdisi {
  durum: PilotPlanDurumu;
  /** Saklanan güncel sürüm ve özeti. */
  surum: number;
  icerikOzeti: string;
  /** İstekteki sürüm ve özet: müşterinin ekranda okuduğu. */
  istek: { surum: number; icerikOzeti: string; musteriAdinaGerekce?: string | null };
  rol: 'musteri' | 'ajans';
  plan: PlanOnerisi;
  /** O ayın Aylık Bütçe'si (onay anında TAZE okunur); yoksa `null`. */
  aylikButceMicros: bigint | null;
  uyum: UyumDurumu;
  ajansinKendiSirketi: boolean;
  /** Ajansın "Pilot gerçek yayın" anahtarı (TAZE okunur; okunamazsa false). */
  gercekYayinAcik: boolean;
  /**
   * Marka Merkezi'nin zorunlu yasal uyarısı (TAZE okunur; yoksa `null`).
   * Varsayılanı YOK: unutulan bir çağrı derlemede kırılsın. Plan
   * hazırlandıktan sonra uyarı eklenmiş/değişmişse eski metin onu taşımaz
   * ve satır kurulamaz sayılır.
   */
  yasalUyari: string | null;
}

export type OnayRetKodu =
  | 'DURUM'
  | 'SURUM'
  | 'GEREKCE'
  | 'BUTCE_YOK'
  | 'BUTCE_ASIMI'
  | 'KURULAMAYAN_SATIR'
  | 'UYUM_ENGEL'
  | 'UYUM_UYARI'
  | 'UYUM_BAYAT';

export type OnayKapisiSonucu =
  | { tur: 'kabul'; kip: YayinKipi; ajansNotu: string | null }
  | { tur: 'ret'; retler: Array<{ kod: OnayRetKodu; musteriMesaji: string; ajansMesaji: string }> };

/** Ajansın müşteri adına onayında gerekçe en az bu kadar karakter (tek kelimelik "ok" gerekçe değil). */
export const MUSTERI_ADINA_GEREKCE_EN_AZ = 20;

/**
 * SAF KAPI. Sunucu onay ucunda, plan satırını `FOR UPDATE` ile kilitledikten
 * sonra bunu koşar; panel düğmenin görünürlüğü için aynısını koşar. İki
 * ayrı kural yazılırsa ekran "onayla" der, sunucu reddeder.
 *
 * MÜŞTERİ MESAJI ile AJANS MESAJI AYRI: müşteri "plan sen bakarken
 * değişti" okur; ajans uyum kuralının adını okur. Müşteriye uyum
 * ayrıntısını yazmak, onun çözemeyeceği bir sorunu onun ekranına koymak.
 */
export function onayKapisi(g: OnayKapisiGirdisi): OnayKapisiSonucu {
  const retler: Array<{ kod: OnayRetKodu; musteriMesaji: string; ajansMesaji: string }> = [];
  const ret = (kod: OnayRetKodu, musteriMesaji: string, ajansMesaji: string) => retler.push({ kod, musteriMesaji, ajansMesaji });

  if (g.durum !== 'musteride') ret('DURUM', 'Bu plan şu an onay beklemiyor.', `Plan durumu ${g.durum}; onay yalnız "müşteride" iken.`);
  if (g.istek.surum !== g.surum || g.istek.icerikOzeti !== g.icerikOzeti) {
    ret('SURUM', 'Plan sen bakarken değişti; sayfayı yenileyip yeniden oku.', 'Onaylanan sürüm/özet güncel sürüm değil.');
  }
  if (g.rol === 'ajans') {
    const gerekce = g.istek.musteriAdinaGerekce?.trim() ?? '';
    if (gerekce.length < MUSTERI_ADINA_GEREKCE_EN_AZ) {
      ret('GEREKCE', '', `Müşteri adına onayda gerekçe zorunlu (en az ${MUSTERI_ADINA_GEREKCE_EN_AZ} karakter).`);
    }
  }
  // HARCANACAK OLAN SATIRLARIN TOPLAMI (Ajan 4 B-3). Beyan edilen
  // `plan.toplam` platforma gitmiyor; giden satır tutarları. Bugün yalnız
  // `degisiklikUygula` "satırlar ≤ toplam"ı tutuyor; toplamı tutarlı ama
  // satırları şişmiş bir sürüm (elle yazım, ileride ikinci bir yazıcı)
  // beyana bakan bir kapıdan geçerdi. Satır toplamı beyanı AŞIYORSA da ret:
  // müşteri ekranında okunan toplam harcanacak olandan küçük olurdu.
  const satirToplami = g.plan.satirlar.reduce((a, s) => a + BigInt(s.tutar.deger), 0n);
  if (g.aylikButceMicros === null) {
    ret('BUTCE_YOK', 'Bu ay için bütçe tanımlı değil; ajansın bilgilendirildi.', 'Dönemin Aylık Bütçe satırı yok ya da silinmiş.');
  } else if (satirToplami > g.aylikButceMicros) {
    ret('BUTCE_ASIMI', 'Plan bu ayın bütçesini aşıyor; ajansın bilgilendirildi.', 'Kampanyaların toplamı Aylık Bütçe\'yi aşıyor (bütçe plan hazırlandıktan sonra düşürülmüş olabilir).');
  } else if (g.plan.toplam.dolu && satirToplami > BigInt(g.plan.toplam.deger)) {
    ret('BUTCE_ASIMI', 'Plan henüz hazır değil; ajansın bilgilendirildi.', 'Kampanyaların toplamı planın toplamından büyük; planı yeniden hazırla.');
  }
  // Metin eksikleri TEK DENETLEYİCİDEN (`metin.ts`), TAZE yasal uyarıyla.
  // Satır engeli (`engeller`) ile metin eksiği aynı satırda olabilir; satır
  // BİR KEZ sayılır.
  const metinEksik = planMetinEksikleri(g.plan, { yasalUyari: g.yasalUyari });
  const kurulamayanlar = new Set([...g.plan.satirlar.filter((s) => s.engeller.length > 0).map((s) => s.anahtar), ...metinEksik.map((x) => x.anahtar)]);
  if (kurulamayanlar.size > 0 || g.plan.satirlar.length === 0) {
    const metinNotu = metinEksik.length > 0 ? ` Reklam metni: ${[...new Set(metinEksik.map((x) => x.metin))].slice(0, 3).join(' · ')}.` : '';
    ret('KURULAMAYAN_SATIR', 'Plan henüz hazır değil; ajansın bilgilendirildi.', `${kurulamayanlar.size} satır kurulamıyor ya da plan boş.${metinNotu}`);
  }
  if (g.uyum === 'engel') ret('UYUM_ENGEL', 'Plan yeniden kontrol ediliyor; ajansın bilgilendirildi.', 'Uyum denetçisinde ENGEL var.');
  if (g.uyum === 'uyari_isaret_bekliyor') ret('UYUM_UYARI', 'Plan yeniden kontrol ediliyor; ajansın bilgilendirildi.', 'İşaretlenmemiş UYARI var; ajans "Okudum" demeli.');
  if (g.uyum === 'bayat') ret('UYUM_BAYAT', 'Plan yeniden kontrol ediliyor; ajansın bilgilendirildi.', 'Uyum denetimi bu sürüm için koşmadı.');

  if (retler.length > 0) return { tur: 'ret', retler };
  const kip = yayinKipi(g.uyum, g.ajansinKendiSirketi, g.gercekYayinAcik);
  const ajansNotu = kipNotu(kip, g.uyum);
  return { tur: 'kabul', kip, ajansNotu };
}
