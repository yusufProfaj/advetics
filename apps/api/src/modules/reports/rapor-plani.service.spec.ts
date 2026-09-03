import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { RaporGonderService } from './rapor-gonder.service';
import { RaporPlaniService } from './rapor-plani.service';

/**
 * ═══ ZAMANLANMIŞ RAPOR ÇALIŞTIRICI — GERÇEK Postgres'e karşı ═══
 *
 * BU DOSYANIN ASIL DERDİ MÜKERRER GÖNDERİM. Müşteriye aynı raporun iki kez
 * gitmesi geri alınamıyor; worker `concurrency: 4` ile koşuyor ve pm2 sık
 * yeniden başlatıyor (üretimde restart sayacı 160'ın üstünde).
 *
 * Koruma iki parçalı ve İKİSİ DE burada sınanıyor:
 *   ① Koşullu UPDATE (karşılaştır-ve-yaz) — iki worker aynı satırı alamıyor
 *   ② Önce ileri at, sonra gönder — çöken worker mükerrer değil ATLAMA üretir
 *
 * Gönderici taklit ediliyor: sınanan şey SMTP değil, TUR YÖNETİMİ.
 */

let h: Harness;
let svc: RaporPlaniService;
/** Taklit göndericinin çağrı kaydı — kaç kez ve hangi pencereyle. */
let gonderimler: Array<{ from: string; to: string; clientId: string }>;
/** Testin gönderici davranışını belirlemesi için. */
let gonderimDavranisi: 'basarili' | 'bos' | 'hata';

const PLAN_ID = 'dddddddd-1111-1111-1111-dddddddddddd';

/**
 * Sahte gönderim sonucu — TİPİ GERÇEK İMZADAN TÜRETİLİYOR.
 *
 * Mock'lar `as unknown as RaporGonderService` ile kuruluyor ve o ÇİFT CAST
 * eksik alan denetimini tamamen kapatıyor: gerçek imza değiştiğinde
 * (`to: string` → `to: string[]`) TypeScript hiçbir şey demiyor, testler
 * çalışma anında `to.join is not a function` ile düşüyor ve sebep testin
 * kendisinde sanılıyor.
 *
 * Dönüş tipini imzadan TÜRETEREK o boşluk kapanıyor: alan eklenir ya da
 * tipi değişirse burası DERLEMEDE kırılıyor.
 */
type GonderimSonucu = Awaited<ReturnType<RaporGonderService['zamanlanmisGonder']>>;

function SahteSonuc(to: string[]): GonderimSonucu {
  return { to, bosDonem: false, faturasizDonemler: [], reddedilen: [] };
}

function svcKur(): RaporPlaniService {
  const gonderici = {
    zamanlanmisGonder: async (
      _ctx: unknown,
      p: { clientId: string; from: string; to: string },
    ) => {
      gonderimler.push({ from: p.from, to: p.to, clientId: p.clientId });
      if (gonderimDavranisi === 'hata') throw new Error('SMTP reddetti');
      // `faturasizDonemler` GERÇEK İMZADA VAR: gönderici o dönemin platform
      // faturası yüklenmemişse burayı doldurur ve çağıran nota yazar.
      return {
        to: ['musteri@ornek.com'],
        bosDonem: gonderimDavranisi === 'bos',
        faturasizDonemler: [],
        reddedilen: [],
      };
    },
  } as unknown as RaporGonderService;

  return new RaporPlaniService(
    {} as unknown as PrismaService,
    h.db as unknown as PrismaAdminService,
    gonderici,
  );
}

/** Zamanı GELMİŞ (geçmişte) bir plan yazar. */
async function planEkle(
  over: {
    id?: string;
    nextRunAt?: string;
    enabled?: boolean;
    rangeKey?: string;
    frequency?: 'weekly' | 'monthly';
  } = {},
): Promise<string> {
  const id = over.id ?? PLAN_ID;
  const frequency = over.frequency ?? 'weekly';
  await h.q(
    `INSERT INTO report_schedules
       (id, org_id, client_id, created_by_user_id, frequency,
        day_of_week, day_of_month, hour, range_key, attach_pdf, enabled,
        next_run_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::"ReportScheduleFrequency",
             $6, $7, 9, $8, true, $9, $10, now())`,
    [
      id,
      IDS.org,
      IDS.client,
      IDS.user,
      frequency,
      frequency === 'weekly' ? 1 : null,
      frequency === 'monthly' ? 5 : null,
      over.rangeKey ?? '7g',
      over.enabled ?? true,
      over.nextRunAt ?? '2020-01-01T00:00:00Z',
    ],
  );
  return id;
}

const planOku = async (id = PLAN_ID) =>
  (
    await h.q<{
      next_run_at: string;
      last_run_at: string | null;
      last_status: string | null;
      last_error: string | null;
      last_sent_to: string | null;
    }>(
      `SELECT next_run_at, last_run_at, last_status, last_error, last_sent_to
         FROM report_schedules WHERE id = $1`,
      [id],
    )
  )[0]!;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  gonderimler = [];
  gonderimDavranisi = 'basarili';
  svc = svcKur();
});

describe('mükerrer gönderim koruması', () => {
  it('KRİTİK: aynı plan İKİ TUR üst üste koşarsa YALNIZCA BİR KEZ gönderiliyor', async () => {
    /*
     * Süpürme saatte bir koşuyor. `next_run_at` ileri atılmasaydı, plan her
     * turda "zamanı gelmiş" görünür ve müşteriye her saat başı bir rapor
     * giderdi.
     */
    await planEkle();

    const tur1 = await svc.calistir();
    const tur2 = await svc.calistir();

    expect(tur1.rows).toBe(1);
    expect(tur2.rows).toBe(0);
    expect(gonderimler).toHaveLength(1);
  });

  it('KRİTİK: İKİ WORKER AYNI ANDA koşarsa rapor YİNE BİR KEZ gidiyor', async () => {
    /*
     * ═══ ASIL YARIŞ BU ═══
     *
     * Yukarıdaki "iki tur üst üste" testi tek başına YETMİYOR ve bunu
     * mutasyon gösterdi: `calistir()` ardışık çağrıldığında ikinci turu
     * zaten SELECT süzgeci (`next_run_at <= now()`) eliyor, koşullu UPDATE
     * hiç sınanmıyordu. Claim'deki koşulu silmek o testi DÜŞÜRMÜYORDU.
     *
     * Gerçek senaryo: iki worker da satırı GÖRÜYOR (ikisi de SELECT'i
     * bitirdi), sonra ikisi de claim etmeye çalışıyor. `Promise.all` ile
     * her `await` olay döngüsüne yer verdiği için bu interleaving gerçekten
     * oluşuyor: iki SELECT, sonra iki UPDATE.
     *
     * Koşullu UPDATE olmasaydı İKİSİ DE gönderir ve müşteri aynı raporu iki
     * kez alırdı — geri alınamayan hata.
     */
    await planEkle();

    const [t1, t2] = await Promise.all([svc.calistir(), svc.calistir()]);

    expect(gonderimler).toHaveLength(1);
    expect(t1.rows + t2.rows).toBe(1);
  });

  it('KRİTİK: next_run_at GÖNDERİMDEN ÖNCE ileri atılıyor — çöken worker mükerrer üretmesin', async () => {
    /*
     * Sıra tersine olsaydı (önce gönder, sonra güncelle), gönderimle
     * güncelleme arasında ölen bir worker'dan sonraki tur AYNI raporu tekrar
     * gönderirdi. Bu sırayla en kötü ihtimal bir dönemin ATLANMASI — ve
     * atlanan rapor kurtarılabilir, mükerrer olan kurtarılamaz.
     *
     * MUTASYONA DAYANIKLI OLMASI İÇİN: gönderici çağrıldığı ANDA satırı
     * okuyoruz. Sıra yanlış olsaydı burada `next_run_at` hâlâ geçmişte olurdu.
     */
    await planEkle();
    let gonderimSirasindakiNext: string | null = null;
    const gonderici = {
      zamanlanmisGonder: async () => {
        gonderimSirasindakiNext = (await planOku()).next_run_at;
        return SahteSonuc(['musteri@ornek.com']);
      },
    } as unknown as RaporGonderService;
    svc = new RaporPlaniService(
      {} as unknown as PrismaService,
      h.db as unknown as PrismaAdminService,
      gonderici,
    );

    await svc.calistir();

    expect(gonderimSirasindakiNext).not.toBeNull();
    expect(new Date(gonderimSirasindakiNext!).getTime()).toBeGreaterThan(Date.now());
  });

  it('KRİTİK: gönderim DÜŞSE BİLE next_run_at ileride kalıyor — otomatik tekrar deneme YOK', async () => {
    /*
     * Başarısız bir gönderimi tekrar denemek, SMTP yanıtı geciken bir turda
     * müşteriye beş mail gitmesi riski demek. Rapor kaçarsa kullanıcı elle
     * gönderir; `last_status` ekranda duruyor.
     */
    await planEkle();
    gonderimDavranisi = 'hata';

    await svc.calistir();
    const satir = await planOku();

    expect(satir.last_status).toBe('failed');
    expect(satir.last_error).toContain('SMTP reddetti');
    expect(new Date(satir.next_run_at).getTime()).toBeGreaterThan(Date.now());

    // İkinci tur AYNI planı tekrar denemiyor.
    gonderimler = [];
    await svc.calistir();
    expect(gonderimler).toHaveLength(0);
  });
});

describe('kimler alınıyor', () => {
  it('zamanı GELMEMİŞ plan alınmıyor', async () => {
    await planEkle({ nextRunAt: '2099-01-01T00:00:00Z' });
    const r = await svc.calistir();
    expect(r.rows).toBe(0);
    expect(r.note).toContain('zamanı gelen planlama yok');
  });

  it('KAPALI plan alınmıyor', async () => {
    await planEkle({ enabled: false });
    expect((await svc.calistir()).rows).toBe(0);
  });

  it('KRİTİK: ARŞİVLENMİŞ müşterinin planı alınmıyor', async () => {
    // Çalışılmayan bir müşteriye otomatik rapor gitmesi, ajansın kontrolü
    // dışında bir iletişim demek.
    await planEkle();
    await h.q(`UPDATE clients SET status = 'archived' WHERE id = $1`, [IDS.client]);
    expect((await svc.calistir()).rows).toBe(0);
    expect(gonderimler).toHaveLength(0);
  });
});

describe('sonuç kaydı — "neden gitmedi" sorusunun cevabı', () => {
  it('başarılı turda last_status=sent ve alıcı yazılıyor', async () => {
    await planEkle();
    await svc.calistir();
    const satir = await planOku();
    expect(satir.last_status).toBe('sent');
    expect(satir.last_sent_to).toBe('musteri@ornek.com');
    expect(satir.last_error).toBeNull();
    expect(satir.last_run_at).not.toBeNull();
  });

  it('KRİTİK: dönemde VERİ YOKSA gönderilmiyor ama SEBEBİ yazılıyor', async () => {
    /*
     * Sıfırlarla dolu otomatik bir mail müşteriye "sistem bozulmuş" diye
     * okunuyor. Ama atlamak sessiz kalmamalı — CLAUDE.md: "Boş liste
     * NEDENİNİ söylesin."
     */
    await planEkle();
    gonderimDavranisi = 'bos';
    const r = await svc.calistir();

    const satir = await planOku();
    expect(satir.last_status).toBe('skipped');
    expect(satir.last_error).toContain('harcama kaydı yok');
    expect(satir.last_sent_to).toBeNull();
    // `rows` GÖNDERİLEN sayısı: atlanan bir tur "gönderildi" sayılmamalı.
    expect(r.rows).toBe(0);
    expect(r.note).toContain('atlandı');
  });

  it('KRİTİK: pencere BOŞSA (ayın 1’inde "bu ay") gönderilmiyor, sebebi yazılıyor', async () => {
    /*
     * `raporPenceresi` null dönüyor. Sunucuya göndermek doğrulama hatası,
     * sessizce düzeltmek kullanıcının seçmediği bir dönemi göndermek olurdu.
     */
    await planEkle({ rangeKey: 'gecersiz_anahtar' });
    await svc.calistir();
    const satir = await planOku();
    expect(satir.last_status).toBe('skipped');
    expect(satir.last_error).toContain('Dönem henüz başlamadı');
    expect(gonderimler).toHaveLength(0);
  });
});

describe('pencere gönderim ANINDA hesaplanıyor', () => {
  it('KRİTİK: plandaki anahtar pencereye çevriliyor — tarihler saklanmıyor', async () => {
    /*
     * Tarihleri saklamak "her hafta son 7 gün" isteğini ilk haftanın
     * tarihlerine dondururdu: müşteri her hafta AYNI dönemin raporunu alırdı.
     */
    await planEkle({ rangeKey: '7g' });
    await svc.calistir();

    expect(gonderimler).toHaveLength(1);
    const g = gonderimler[0]!;
    const bugun = new Date().toISOString().slice(0, 10);
    const dun = new Date(Date.parse(`${bugun}T00:00:00Z`) - 86_400_000)
      .toISOString()
      .slice(0, 10);
    // Son 7 gün DÜNDE bitiyor — bugün rapora girmiyor.
    expect(g.to).toBe(dun);
    const gunFarki =
      (Date.parse(`${g.to}T00:00:00Z`) - Date.parse(`${g.from}T00:00:00Z`)) / 86_400_000;
    expect(gunFarki).toBe(6); // 7 gün (dahil)
  });
});
