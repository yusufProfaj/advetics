import { BadRequestException } from '@nestjs/common';
import { autoBoostPlatformSchema } from '@advetics/shared';
import type {
  AutoBoostPlatform,
  AutoBoostPresetSettings,
  AutoBoostQueueOverride,
} from '@advetics/shared';

/**
 * ═══ KART BAZINDA ÖZELLEŞTİRME — ÖN AYARIN ÜSTÜNE ═══
 *
 * Ön ayar workspace geneli; bu katman TEK BİR KART için gelen değişikliği
 * onun üstüne bindiriyor. Ön ayara DOKUNMUYOR: kaydedilen bir şey yok,
 * sonuç doğrudan `boosts` satırına yazılıyor.
 *
 * ═══ NEDEN SAF VE AYRI ═══
 *
 * Burada verilen üç karar da sessizce yanlış olabilecek türden:
 * verilmeyen alanın ön ayardan gelmesi, Google'da toplam bütçenin
 * reddedilmesi ve kayıtlı kitle seçiliyken şehir/yaşın YOK SAYILMASI.
 * Yayın yolunun içine gömülü kalsalardı çalıştırılarak sınanamazlardı —
 * ve bu kod para harcıyor.
 */

/** Ana para biriminden micros'a. "300,50" ve "300.50" ikisi de kabul. */
export function toMicros(amount: string): bigint {
  const n = Number(amount.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) throw new BadRequestException('Geçersiz tutar');
  // YUVARLAMA ÖNCE, BigInt SONRA: `BigInt(300.5 * 1e6)` kesirli sayıda hata
  // fırlatıyor ve mesaj sebebi söylemiyor.
  return BigInt(Math.round(n * 1_000_000));
}

/**
 * Ham SQL'den gelen platform değerini DARALTIR.
 *
 * ═══ `=== 'google' ? 'google' : 'meta'` YAZILMADI ═══
 *
 * O desen bu depoda adı konmuş bir hata ve `linkedin-kayit.spec.ts` onu
 * tarıyor: üçüncü platform geldiğinde satır SESSİZCE Meta sayılırdı ve
 * bütçe kuralı (Google'da toplam bütçe yok) yanlış tarafa uygulanırdı.
 *
 * Şemadan geçiriyoruz ve tanınmayan değerde PATLIYORUZ — bu kod para
 * harcıyor; yanlış platform, yanlış kural demek.
 */
export function kartPlatformu(raw: string): AutoBoostPlatform {
  const r = autoBoostPlatformSchema.safeParse(raw);
  if (!r.success) throw new BadRequestException(`Tanınmayan platform: ${raw}`);
  return r.data;
}

/**
 * Ham SQL'den gelen bütçe kipini DARALTIR.
 *
 * `$queryRaw` denetimsiz bir dönüşüm: kolon veritabanında iki değerli bir
 * enum ama tipe `string` olarak geliyor. `as` ile susturmak, bir gün
 * eklenen üçüncü bir değerin sessizce buraya sızması demekti — burada
 * PATLAMAK doğru: bütçe kipi yanlışsa harcanan para da yanlış.
 */
export function butceKipi(raw: string | null): 'daily' | 'lifetime' | null {
  if (raw === null) return null;
  if (raw === 'daily' || raw === 'lifetime') return raw;
  throw new BadRequestException(`Tanınmayan bütçe kipi: ${raw}`);
}

export interface OnAyarButcesi {
  budgetMode: 'daily' | 'lifetime' | null;
  dailyBudgetMicros: bigint | null;
  totalBudgetMicros: bigint | null;
  durationDays: number | null;
}

/**
 * Karta uygulanacak BÜTÇE — özelleştirme varsa o, yoksa ön ayar.
 *
 * KİP DEĞİŞİNCE DİĞER KOLON NULL'LANIYOR. Ön ayar günlük bütçeliyken
 * kullanıcı toplam bütçeye geçerse, `daily_budget_micros` eski değeriyle
 * kalırsa `boosts_budget_chk` kısıtı ham bir hata veriyor — kullanıcıya
 * hiçbir şey anlatmayan cinsten. İki kolonun aynı anda dolu olması bu
 * şemada geçersiz.
 */
export function butceyiCoz(
  onAyar: OnAyarButcesi,
  platform: 'meta' | 'google',
  override: AutoBoostQueueOverride | undefined,
): OnAyarButcesi {
  if (!override?.budget) return onAyar;

  /*
   * GOOGLE'DA TOPLAM BÜTÇE YOK — şemadaki ön ayar kuralının aynısı.
   * Bütçe orada ayrı bir kaynak (`CampaignBudget`) ve günlük; toplam
   * bütçeyi kabul edip günlüğe bölmek, ekranda yazan tutar ile gerçek
   * harcamanın ayrışması demekti.
   */
  if (platform === 'google' && override.budget.mode === 'lifetime') {
    throw new BadRequestException(
      'Google tarafında toplam bütçe yok; bütçe kampanya seviyesinde ve günlük.',
    );
  }

  const micros = toMicros(override.budget.amount);
  return {
    budgetMode: override.budget.mode,
    dailyBudgetMicros: override.budget.mode === 'daily' ? micros : null,
    totalBudgetMicros: override.budget.mode === 'lifetime' ? micros : null,
    durationDays: override.budget.durationDays,
  };
}

/**
 * Karta uygulanacak HEDEFLEME — yalnızca Meta.
 *
 * KAYITLI KİTLE SEÇİLİYSE ŞEHİR/YAŞ/CİNSİYET SIFIRLANIYOR, taşınmıyor.
 * Meta kitleyi kendi tanımıyla uyguluyor ve yanına lokasyon göndermek
 * "kesişim mi birleşim mi" sorusunu bizim cevaplamamız demek — yanlış
 * cevap sessizce yanlış kitleye harcıyor. Ön ayar formunda ekranda da
 * böyle yazıyor ("kullanılmıyor"); ikisinin ayrışması, ekranın yalan
 * söylemesi olurdu.
 */
export function hedeflemeyiCoz(
  onAyar: AutoBoostPresetSettings,
  override: AutoBoostQueueOverride | undefined,
): AutoBoostPresetSettings {
  if (!override?.targeting) return onAyar;

  if (onAyar.platform !== 'meta') {
    throw new BadRequestException(
      'Hedefleme özelleştirmesi yalnızca Instagram kartlarında geçerli.',
    );
  }

  const t = override.targeting;
  if (t.savedAudienceId) {
    return {
      ...onAyar,
      savedAudienceId: t.savedAudienceId,
      locations: [],
      ageMin: onAyar.ageMin,
      ageMax: onAyar.ageMax,
      genders: onAyar.genders,
    };
  }

  return {
    ...onAyar,
    savedAudienceId: null,
    locations: t.locations,
    ageMin: t.ageMin,
    ageMax: t.ageMax,
    genders: t.genders,
  };
}
