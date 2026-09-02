import { AYIN_GUNU_MAX, type PlanSikligi } from './schemas/rapor-plani.schema';

/**
 * ═══ SIRADAKİ ÇALIŞMA ZAMANI ═══
 *
 * Planlama "her Pazartesi 09:00" gibi bir İNSAN cümlesi; veritabanında ise
 * `next_run_at` olarak mutlak bir an duruyor. Bu dosya ikisi arasındaki
 * çeviriyi yapıyor.
 *
 * SAAT DİLİMİ AÇIKÇA `Europe/Istanbul` — ve gerekçesi `sync-queue.service.ts`
 * içindeki `sweep:account-status` ile aynı: bu iş İNSANIN OKUDUĞU bir mail
 * üretiyor. "Sabah 9'da gönder" cümlesindeki 9, ajansın saati; UTC saymak
 * maili öğlene kaydırırdı.
 *
 * OFSET ÖLÇÜLÜYOR, SABİT YAZILMIYOR. Türkiye 2016'dan beri kalıcı UTC+3 ve
 * `+3` yazmak bugün çalışırdı. Ama bu, bir gün değişirse HİÇBİR HATA
 * VERMEDEN bütün planlamaları bir saat kaydıracak bir varsayım olurdu;
 * belirtisi de "raporlar bir saat geç gidiyor" gibi kimsenin bildirmeyeceği
 * bir şey. Ofset `Intl` ile o ANDA ölçülüyor.
 */

const TZ = 'Europe/Istanbul';

const BICIM = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface Parcalar {
  yil: number;
  ay: number;
  gun: number;
  saat: number;
  dakika: number;
  saniye: number;
}

/** Bir anın İstanbul duvar saatindeki parçaları. */
export function istanbulParcalari(an: Date): Parcalar {
  const p: Record<string, number> = {};
  for (const parca of BICIM.formatToParts(an)) {
    if (parca.type !== 'literal') p[parca.type] = Number(parca.value);
  }
  return {
    yil: p.year!,
    ay: p.month!,
    gun: p.day!,
    // `hour12: false` bazı motorlarda gece yarısını 24 olarak veriyor.
    saat: p.hour! === 24 ? 0 : p.hour!,
    dakika: p.minute!,
    saniye: p.second!,
  };
}

/** Verilen andaki UTC ofseti, dakika cinsinden (UTC+3 → 180). */
function ofsetDakika(an: Date): number {
  const p = istanbulParcalari(an);
  const duvarUtcGibi = Date.UTC(p.yil, p.ay - 1, p.gun, p.saat, p.dakika, p.saniye);
  return Math.round((duvarUtcGibi - an.getTime()) / 60_000);
}

/**
 * İstanbul duvar saatini mutlak ana çevirir.
 *
 * İKİ ADIMLI: önce ofseti tahmin etmek için bir aday an kuruluyor, sonra o
 * anın GERÇEK ofsetiyle düzeltiliyor. Tek adımda yapmak, ofsetin değiştiği
 * bir günde (yaz saati uygulaması geri gelirse) bir saatlik kayma üretirdi.
 */
export function istanbulAni(
  yil: number,
  ay: number,
  gun: number,
  saat: number,
): Date {
  const tahmin = Date.UTC(yil, ay - 1, gun, saat, 0, 0);
  const ofset = ofsetDakika(new Date(tahmin));
  const duzeltilmis = tahmin - ofset * 60_000;
  // İkinci tur: düzeltilmiş anın ofseti farklıysa (geçiş günü) onu kullan.
  const ofset2 = ofsetDakika(new Date(duzeltilmis));
  return ofset2 === ofset ? new Date(duzeltilmis) : new Date(tahmin - ofset2 * 60_000);
}

/** ISO hafta günü: 1 = Pazartesi … 7 = Pazar. */
function isoHaftaGunu(yil: number, ay: number, gun: number): number {
  const d = new Date(Date.UTC(yil, ay - 1, gun));
  const n = d.getUTCDay();
  return n === 0 ? 7 : n;
}

export interface PlanZamani {
  frequency: PlanSikligi;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hour: number;
}

/**
 * Plandan SONRAKİ çalışma anını üretir — `simdi`den KESİNLİKLE sonra.
 *
 * "Kesinlikle sonra" olması mükerrer gönderimin ilk savunması: eşitliğe izin
 * verseydik, işi tam zamanında koşan bir süpürme `next_run_at`i aynı ana
 * yazar ve bir sonraki turda aynı raporu tekrar gönderirdi.
 *
 * SAF FONKSİYON ve `simdi` DIŞARIDAN GELİYOR: zamanla ilgili mantığın
 * `Date.now()`a bağlı olması, onu sınanamaz yapardı — oysa burada yanlış bir
 * hesap müşteriye yanlış zamanda (ya da hiç) rapor gitmesi demek.
 */
export function siradakiCalisma(plan: PlanZamani, simdi: Date): Date {
  const p = istanbulParcalari(simdi);

  if (plan.frequency === 'weekly') {
    const hedefGun = plan.dayOfWeek ?? 1;
    // Bugünden başlayarak en fazla 8 gün ileriye bak: 7 gün tam bir tur,
    // 8. gün "bugün saat geçmiş" durumunda haftaya sarmayı garantiliyor.
    for (let i = 0; i <= 8; i++) {
      const aday = new Date(Date.UTC(p.yil, p.ay - 1, p.gun + i));
      const ay = aday.getUTCMonth() + 1;
      const gun = aday.getUTCDate();
      const yil = aday.getUTCFullYear();
      if (isoHaftaGunu(yil, ay, gun) !== hedefGun) continue;
      const an = istanbulAni(yil, ay, gun, plan.hour);
      if (an.getTime() > simdi.getTime()) return an;
    }
    // Buraya düşmek imkânsız (8 gün içinde her hafta günü geçiyor) ama
    // sessizce yanlış bir tarih döndürmektense patlamak doğru.
    throw new Error('Haftalık planın sıradaki zamanı hesaplanamadı.');
  }

  const hedefGun = Math.min(plan.dayOfMonth ?? 1, AYIN_GUNU_MAX);
  // 0'dan başlayarak ileri aylara bak: bu ay geçmişse gelecek ay.
  for (let i = 0; i <= 2; i++) {
    const yil = p.yil + Math.floor((p.ay - 1 + i) / 12);
    const ay = ((p.ay - 1 + i) % 12) + 1;
    const an = istanbulAni(yil, ay, hedefGun, plan.hour);
    if (an.getTime() > simdi.getTime()) return an;
  }
  throw new Error('Aylık planın sıradaki zamanı hesaplanamadı.');
}

/** Panelde "Bir sonraki: 7 Eylül Pazartesi 09:00" için okunur metin. */
export function planZamaniMetni(plan: PlanZamani): string {
  const saat = `${String(plan.hour).padStart(2, '0')}:00`;
  if (plan.frequency === 'weekly') {
    const ad =
      ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][
        (plan.dayOfWeek ?? 1) - 1
      ] ?? 'Pazartesi';
    return `Her ${ad} ${saat}`;
  }
  return `Her ayın ${plan.dayOfMonth ?? 1}. günü ${saat}`;
}
