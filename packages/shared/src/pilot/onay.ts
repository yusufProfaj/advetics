import { tutarGoster } from '../reklam/para';
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
 * kolonuna yazar (onaydan sonra değişmez).
 *   · `gercek` — uyum geçti; kurulum gerçek ve satırlar açılır.
 *   · `test`   — uyum bağlı değil; yalnız AJANSIN KENDİ şirketinde: kurar,
 *                geri okur, AÇMAZ (eski test kipi kuralı, `yayin-baslat.ts`).
 *   · `kapali` — uyum bağlı değil ve müşteri şirketi: platforma HİÇ
 *                yazılmaz. Test kipinde müşteri hesabında duraklatılmış
 *                kampanya bırakmak, müşterinin Ads Manager'ında açıklanamaz
 *                nesneler demek.
 */
export type YayinKipi = 'gercek' | 'test' | 'kapali';

export function yayinKipi(uyum: UyumDurumu, ajansinKendiSirketi: boolean): YayinKipi {
  if (uyum === 'gecti') return 'gercek';
  return ajansinKendiSirketi ? 'test' : 'kapali';
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
  if (g.aylikButceMicros === null) {
    ret('BUTCE_YOK', 'Bu ay için bütçe tanımlı değil; ajansın bilgilendirildi.', 'Dönemin Aylık Bütçe satırı yok ya da silinmiş.');
  } else if (g.plan.toplam.dolu && BigInt(g.plan.toplam.deger) > g.aylikButceMicros) {
    ret('BUTCE_ASIMI', 'Plan bu ayın bütçesini aşıyor; ajansın bilgilendirildi.', 'Plan toplamı Aylık Bütçe\'yi aşıyor (bütçe plan hazırlandıktan sonra düşürülmüş olabilir).');
  }
  const kurulamayan = g.plan.satirlar.filter((s) => s.engeller.length > 0).length;
  if (kurulamayan > 0 || g.plan.satirlar.length === 0) {
    ret('KURULAMAYAN_SATIR', 'Plan henüz hazır değil; ajansın bilgilendirildi.', `${kurulamayan} satır kurulamıyor ya da plan boş.`);
  }
  if (g.uyum === 'engel') ret('UYUM_ENGEL', 'Plan yeniden kontrol ediliyor; ajansın bilgilendirildi.', 'Uyum denetçisinde ENGEL var.');
  if (g.uyum === 'uyari_isaret_bekliyor') ret('UYUM_UYARI', 'Plan yeniden kontrol ediliyor; ajansın bilgilendirildi.', 'İşaretlenmemiş UYARI var; ajans "Okudum" demeli.');
  if (g.uyum === 'bayat') ret('UYUM_BAYAT', 'Plan yeniden kontrol ediliyor; ajansın bilgilendirildi.', 'Uyum denetimi bu sürüm için koşmadı.');

  if (retler.length > 0) return { tur: 'ret', retler };
  const kip = yayinKipi(g.uyum, g.ajansinKendiSirketi);
  const ajansNotu =
    kip === 'gercek'
      ? null
      : kip === 'test'
        ? 'Uyum denetçisi bağlı değil: kampanyalar test kipinde kurulur, geri okunur ve AÇILMAZ.'
        : 'Uyum denetçisi bağlı değil: onay kaydedildi, platforma hiçbir şey yazılmadı.';
  return { tur: 'kabul', kip, ajansNotu };
}
