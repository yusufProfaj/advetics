import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BEKLEYEN_IS_SINIRI,
  BEKLEYEN_IS_TURLERI,
  BEKLEYEN_IS_YETKISI,
  bekleyenIsSirasi,
  type BekleyenIs,
  type BekleyenIsKaynakHatasi,
  type BekleyenIslerSorgusu,
  type BekleyenIslerYaniti,
  type BekleyenIsTuru,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { seviyeLiterali } from '../metrics/seviye-literali';
import { monthStart, resolveThroughDate } from '../budgets/budget-pacing';

/**
 * ═══ AKILLI BOOST'TA "ONAY BEKLİYOR" = `pending` ═══
 *
 * Ekranın başlık rozeti ve bildirim zili yalnızca `pending` sayıyor; kutu
 * cümlesi de "N kart onay bekliyor" ve onay düğmesi yalnızca `pending`
 * kartta açık. `kontrol` (kampanyanın platformda açılıp açılmadığı
 * bilinmiyor) ekranın durum SEKMESİNDE aynı başlık altında duruyor ama
 * yapılacak iş onay değil, hesaba bakmak — ona "onay bekliyor" demek,
 * kullanıcıyı açılmış olabilecek bir kampanyayı İKİNCİ KEZ onaylamaya
 * gönderirdi.
 *
 * FACEBOOK SAYFASI SÜZGECİ BURADA YOK ve bilerek: `AKILLI_BOOST_META_PROFILLERI`
 * kuralı kartı KUYRUĞA GİRİŞTE kesiyor (`autoboost-queue.service.ts`) ve eski
 * Facebook kartları `20260930180000_akilli_boost_facebook_kartlari_kapat`
 * ile kapatıldı. Ekranın okuma yolu (`autoboost-read.service.ts#listQueue`)
 * de profil türüne bakmıyor; burada ikinci bir süzgeç yazmak, iki sayının
 * ayrışabileceği bir yer açmak olurdu.
 */
const BOOST_ONAY_DURUMU = 'pending';

/**
 * Harcama KAMPANYA seviyesinden — bütçe ekranının `SPEND_LEVEL`i ile aynı.
 * `insights_daily` aynı harcamayı dört seviyede tutuyor; seviyesiz bir
 * toplam dört kat sayardı (burada yalnızca `> 0` soruluyor ama süzgeç yine
 * de aynı: kısmi indeks bu seviyeye kurulu ve literal ister).
 */
const HARCAMA_SEVIYESI = seviyeLiterali('campaign');

/** Kaynak okunamadığında ekrana giden cümle. Ayrıntı log'da. */
const KAYNAK_HATASI: Record<BekleyenIsTuru, string> = {
  boost_onay: 'Akıllı Boost kuyruğu okunamadı',
  strateji_onay: 'Onay bekleyen medya planları okunamadı',
  strateji_aktar: 'Aktarılmayı bekleyen medya planları okunamadı',
  butce_yok: 'Bütçe durumu okunamadı',
};

/**
 * `clients` satırı görünmüyorsa (LEFT JOIN boş döndüyse) yine de bir ad
 * gerekiyor: satırı düşürmek, sayısı doğru olan bir işi sessizce gizlerdi.
 */
const ADSIZ_WORKSPACE = 'Adı görünmeyen workspace';

interface IsSatiri {
  client_id: string;
  client_adi: string | null;
  sayi: number;
  en_eski: Date | string | null;
}

/**
 * GENEL BAKIŞ — BEKLEYEN İŞLER (`docs/genel-bakis/MIMARI.md` § 1).
 *
 * Dört kaynak dört ayrı soru: her biri KENDİ transaction'ında koşuyor.
 * Tek transaction'da biri düşerse Postgres transaction'ı iptal ediyor ve
 * diğer üçü de "current transaction is aborted" ile düşerdi — kutu, tek bir
 * kaynağın arızası yüzünden bütün işleri kaybederdi.
 */
@Injectable()
export class GenelBakisService {
  private readonly logger = new Logger(GenelBakisService.name);

  constructor(private readonly prisma: PrismaService) {}

  async bekleyenler(
    ctx: TenantContext,
    sorgu: BekleyenIslerSorgusu,
    now: Date = new Date(),
  ): Promise<BekleyenIslerYaniti> {
    /*
     * BAŞKA BİR WORKSPACE 403, BOŞ LİSTE DEĞİL. RLS zaten sıfır satır
     * döndürürdü ama "bekleyen iş yok" cevabı, o kimliğin VAR olduğu ya da
     * olmadığı hakkında hiçbir şey söylemese bile, çağıranın kapsamı aştığını
     * gizler. Kapı RLS'ten ÖNCE ve sayı üretmeden kapanıyor.
     */
    if (sorgu.clientId && !ctx.clientIds.includes(sorgu.clientId)) {
      throw new ForbiddenException('Bu workspace’e erişimin yok');
    }
    const kapsam = sorgu.clientId ? [sorgu.clientId] : [...ctx.clientIds];

    /*
     * `activeClientId` İSTEĞİN KAPSAMINA EŞİTLENİYOR. RLS'te seçili müşteri
     * görüş alanını DARALTIYOR (`app.current_active_client_id`): panelde bir
     * workspace seçiliyken "Tüm workspace'ler" istenirse, bağlamdaki eski
     * seçim yanıtı sessizce tek workspace'e indirirdi.
     */
    const scoped: TenantContext = { ...ctx, activeClientId: sorgu.clientId ?? null };

    const sorulan = BEKLEYEN_IS_TURLERI.filter((t) => ctx.permissions.includes(BEKLEYEN_IS_YETKISI[t]));
    const sorulmayan = BEKLEYEN_IS_TURLERI.filter((t) => !sorulan.includes(t));

    const isler: BekleyenIs[] = [];
    const hatalar: BekleyenIsKaynakHatasi[] = [];

    if (kapsam.length > 0) {
      const sonuclar = await Promise.all(
        sorulan.map(async (tur) => {
          try {
            return { tur, satirlar: await this.kaynak(tur, scoped, kapsam, now) };
          } catch (e) {
            this.logger.error(
              `bekleyenler: ${tur} kaynağı düştü — ${e instanceof Error ? e.message : String(e)}`,
            );
            return { tur, hata: KAYNAK_HATASI[tur] };
          }
        }),
      );
      // Hatalar TÜR SIRASIYLA: Promise.all sırayı koruyor ama burada açıkça
      // `sorulan` sırasına bağlı olduğunu söylemek, panelde hata satırlarının
      // istekten isteğe yer değiştirmediğini garanti ediyor.
      for (const s of sonuclar) {
        if ('hata' in s && s.hata) hatalar.push({ tur: s.tur, mesaj: s.hata });
        else if ('satirlar' in s && s.satirlar) isler.push(...s.satirlar);
      }
    }

    isler.sort(bekleyenIsSirasi);
    return {
      isler: isler.slice(0, BEKLEYEN_IS_SINIRI),
      toplam: isler.length,
      sorulmayan,
      hatalar,
      uretildi: now.toISOString(),
    };
  }

  /**
   * Tür → sorgu. `Record` ile değil `switch` ile ama `never` kontrolü var:
   * sözleşmeye beşinci bir tür eklendiğinde derleme burada kırılıyor, yoksa
   * yeni tür sessizce boş dönerdi.
   */
  private async kaynak(
    tur: BekleyenIsTuru,
    ctx: TenantContext,
    kapsam: string[],
    now: Date,
  ): Promise<BekleyenIs[]> {
    switch (tur) {
      case 'boost_onay':
        return this.oku(tur, ctx, this.boostSorgusu(kapsam));
      case 'strateji_onay':
        return this.oku(tur, ctx, this.planSorgusu(kapsam, 'onayda'));
      case 'strateji_aktar':
        return this.oku(tur, ctx, this.planSorgusu(kapsam, 'onaylandi'));
      case 'butce_yok': {
        const sorgu = this.butceSorgusu(kapsam, now);
        return sorgu ? this.oku(tur, ctx, sorgu) : [];
      }
      default: {
        const yok: never = tur;
        throw new Error(`Bilinmeyen bekleyen iş türü: ${String(yok)}`);
      }
    }
  }

  private async oku(tur: BekleyenIsTuru, ctx: TenantContext, sql: Prisma.Sql): Promise<BekleyenIs[]> {
    const satirlar = await this.prisma.withTenant(ctx, (tx) => tx.$queryRaw<IsSatiri[]>(sql));
    return satirlar.map((r) => ({
      tur,
      clientId: r.client_id,
      clientAdi: r.client_adi ?? ADSIZ_WORKSPACE,
      sayi: Number(r.sayi),
      enEski: tarih(r.en_eski),
    }));
  }

  private boostSorgusu(kapsam: string[]): Prisma.Sql {
    return Prisma.sql`
      SELECT q.client_id::text AS client_id, c.name AS client_adi,
             COUNT(*)::int AS sayi, MIN(q.created_at) AS en_eski
      FROM auto_boost_queue_items q
      -- DIS BIRLESIM: clients RLS'li ve ad yalnizca sus. Ic birlesim,
      -- adi gorunmeyen workspace'in kartlarini sayimdan sessizce dusururdu.
      LEFT JOIN clients c ON c.id = q.client_id
      WHERE q.client_id = ANY(${kapsam}::uuid[])
        AND q.status = ${BOOST_ONAY_DURUMU}
      GROUP BY q.client_id, c.name
    `;
  }

  /**
   * `enEski`: onaydaki plan için ONAYA GÖNDERİLME anı ayrı bir kolonda
   * TUTULMUYOR; `onaya_gonder` geçişi yalnızca `updated_at`i yazıyor ve
   * `onayda` durumundaki plan düzenlenemediği için o damga geçiş anıdır.
   * Onaylanmış planda `onay_zamani` var ve `onaylandi` durumu CHECK ile onu
   * zorunlu kılıyor; COALESCE yalnızca savunma.
   */
  private planSorgusu(kapsam: string[], durum: 'onayda' | 'onaylandi'): Prisma.Sql {
    const zaman =
      durum === 'onaylandi' ? Prisma.raw('COALESCE(p.onay_zamani, p.updated_at)') : Prisma.raw('p.updated_at');
    return Prisma.sql`
      SELECT p.client_id::text AS client_id, c.name AS client_adi,
             COUNT(*)::int AS sayi, MIN(${zaman}) AS en_eski
      FROM strateji_planlari p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.client_id = ANY(${kapsam}::uuid[])
        AND p.durum = ${durum}
      GROUP BY p.client_id, c.name
    `;
  }

  /**
   * ═══ "BU AY" BÜTÇE EKRANININ TANIMI ═══
   *
   * `budgets.service.ts#pacing` ile AYNI: ay UTC tarihinden, harcama
   * DÜNE kadar (`resolveThroughDate` — bugünün verisi eksik). Ayın ilk günü
   * kapsam boş, yani "bütçe yok" uyarısı 1'inde çıkmıyor; bütçe ekranı da o
   * gün harcama göstermiyor. Farklı bir ay tanımı, ay sınırında kutuyu ve
   * bütçe ekranını farklı aylardan konuşturur.
   *
   * HAVUZ SAYILMIYOR: `insights_daily.client_id` NOT NULL (atanmamış hesabın
   * metriği çekilmiyor) ve süzgeç `ad_accounts`a değil metrik satırının
   * kendi `client_id`sine bakıyor; havuz hesabı bu sorguya giremiyor.
   *
   * BÜTÇE SATIRI HERHANGİ BİRİ: müşteri geneli YA DA hesap bütçesi. Hesap
   * bazında bütçe tanımlamış workspace'e "bütçe tanımlı değil" demek yanlış
   * olurdu; `hazirlik.service.ts` aynı soruyu aynı biçimde soruyor.
   *
   * `monthly_budgets` RLS'li ve NOT EXISTS görünmeyen satırı "yok" sayar.
   * Tür `budget.write` istiyor ve bütçe politikası `can_access_client` ile
   * harcama politikasıyla aynı kapsamda; harcamayı görebilen bütçeyi de
   * görüyor.
   */
  private butceSorgusu(kapsam: string[], now: Date): Prisma.Sql | null {
    const bugun = now.toISOString().slice(0, 10);
    const ay = bugun.slice(0, 7);
    const bitis = resolveThroughDate(ay, bugun);
    if (bitis === null) return null;
    const baslangic = monthStart(ay);
    return Prisma.sql`
      SELECT i.client_id::text AS client_id, c.name AS client_adi,
             1 AS sayi, NULL::timestamptz AS en_eski
      FROM insights_daily i
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.client_id = ANY(${kapsam}::uuid[])
        AND i.entity_level = ${HARCAMA_SEVIYESI}
        AND i.date BETWEEN ${baslangic}::date AND ${bitis}::date
        AND NOT EXISTS (
          SELECT 1 FROM monthly_budgets b
          WHERE b.client_id = i.client_id AND b.month = ${baslangic}::date
        )
      GROUP BY i.client_id, c.name
      HAVING SUM(i.spend_micros) > 0
    `;
  }
}

function tarih(v: Date | string | null): string | null {
  if (v === null || v === undefined) return null;
  return (v instanceof Date ? v : new Date(v)).toISOString();
}
