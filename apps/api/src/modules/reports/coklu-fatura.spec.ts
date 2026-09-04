import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FATURA_MAX_ADET, MAIL_EK_TOPLAM_SINIRI, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AssetStorageService } from '../ad-builder/asset-storage.service';
import { FaturaService } from './fatura.service';

/**
 * ═══ BİR DÖNEME BİRDEN ÇOK FATURA ═══
 *
 * Eskiden `(client, platform, donem)` TEKİLDİ ve ikinci yükleme öncekini
 * EZİYORDU. Şema yorumu bunu savunuyordu: "iki fatura duruyorsa maile
 * hangisinin gireceği belirsiz kalırdı". Kullanıcının cevabı: hepsi gitsin.
 *
 * Tekilliği tamamen atmak YENİ bir sessiz hata açardı — aynı PDF iki kez
 * yüklenince müşteriye AYNI fatura iki ek olarak giderdi. Tekillik bu yüzden
 * kaldırılmadı, dosyanın İÇERİĞİNE taşındı.
 *
 * GERÇEK POSTGRES motoruna karşı koşuyor (PGlite): indeks davranışı ve CHECK
 * kısıtı burada birim testiyle taklit edilemez.
 */

let h: Harness;
let svc: FaturaService;
/** Sahte disk — anahtar → bayt. Gerçek dosya sistemi testi yavaşlatır. */
let disk: Map<string, Buffer>;
let silinen: string[];

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  isOrgAdmin: true,
  permissions: ['report.share'],
} as unknown as TenantContext;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  disk = new Map();
  silinen = [];

  let sayac = 0;
  const storage = {
    save: async (p: { bytes: Buffer }) => {
      // Anahtar İÇERİK ADRESLİ DEĞİL (gerçeğinde `randomUUID`): aynı PDF iki
      // farklı döneme yüklenince iki ayrı dosya oluşuyor ve birini silmek
      // diğerini etkilemiyor.
      const key = `k${++sayac}`;
      disk.set(key, p.bytes);
      return key;
    },
    read: async (key: string) => {
      const b = disk.get(key);
      if (!b) throw new Error('dosya yok');
      return b;
    },
    remove: async (key: string) => {
      silinen.push(key);
      disk.delete(key);
    },
  } as unknown as AssetStorageService;

  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn(h.db),
  } as unknown as PrismaService;

  svc = new FaturaService(prisma, h.db as unknown as PrismaAdminService, storage);
});

/** Geçerli bir PDF — servis sihirli baytları kontrol ediyor. */
function pdf(icerik: string): Buffer {
  return Buffer.from(`%PDF-1.4\n${icerik}`);
}

/** Geçerli bir ZIP başlığı (`PK\x03\x04`) + içerik. */
function zip(icerik: string): Buffer {
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(icerik)]);
}

async function yukle(opts: {
  platform?: 'meta' | 'google';
  donem?: string;
  icerik: string;
  ad?: string;
}) {
  return svc.yukle(
    CTX,
    {
      clientId: IDS.client,
      platform: opts.platform ?? 'meta',
      donem: opts.donem ?? '2026-08',
    } as never,
    { fileName: opts.ad ?? 'fatura.pdf', bytes: pdf(opts.icerik), mimeType: 'application/pdf' },
  );
}

describe('çoklu fatura — yükleme', () => {
  it('KRİTİK: aynı dönem+platforma İKİ FARKLI fatura yüklenebiliyor', async () => {
    /*
     * İSTEĞİN TA KENDİSİ. Eskiden ikincisi birincinin ÜZERİNE yazıyordu ve
     * müşteriye tek belge gidiyordu — ajans ikisini de yükledim sanıyordu.
     */
    await yukle({ icerik: 'birinci' });
    await yukle({ icerik: 'ikinci' });

    const liste = await svc.listele(CTX, IDS.client);
    expect(liste.length).toBe(2);
  });

  it('KRİTİK: AYNI dosya iki kez yüklenemiyor — sebebiyle reddediliyor', async () => {
    /*
     * Tekillik kaldırılmadı, dosyanın İÇERİĞİNE taşındı. Kaza eseri iki kez
     * yüklenen bir PDF, müşteriye aynı faturanın iki kopyası olarak giderdi.
     */
    await yukle({ icerik: 'ayni' });
    await expect(yukle({ icerik: 'ayni' })).rejects.toThrow('zaten yüklü');

    expect((await svc.listele(CTX, IDS.client)).length).toBe(1);
  });

  it('KRİTİK: mükerrer reddedilince DİSKE yazılan dosya siliniyor', async () => {
    /*
     * Kayıt yazılamayan her yükleme diskte yetim bir dosya bırakırdı ve
     * paylaşımlı VPS'te sessiz disk dolması diğer siteleri de etkiliyor.
     */
    await yukle({ icerik: 'ayni' });
    const oncekiDosyaSayisi = disk.size;
    await expect(yukle({ icerik: 'ayni' })).rejects.toThrow();

    expect(silinen.length).toBe(1);
    expect(disk.size).toBe(oncekiDosyaSayisi);
  });

  it('aynı içerik FARKLI dönemde serbest', async () => {
    // Tekillik dönem+platform kapsamında; iki ayın faturası aynı olamaz ama
    // kısıt onları birbirine karıştırmamalı.
    await yukle({ icerik: 'x', donem: '2026-07' });
    await yukle({ icerik: 'x', donem: '2026-08' });
    expect((await svc.listele(CTX, IDS.client)).length).toBe(2);
  });

  it('aynı içerik FARKLI platformda serbest', async () => {
    await yukle({ icerik: 'x', platform: 'meta' });
    await yukle({ icerik: 'x', platform: 'google' });
    expect((await svc.listele(CTX, IDS.client)).length).toBe(2);
  });

  it('KRİTİK: adet sınırı DİSKE YAZMADAN ÖNCE uygulanıyor', async () => {
    /*
     * Doğrulama giriş anında (CLAUDE.md). Sıra da önemli: önce kaydedip sonra
     * reddetmek her reddedilen yüklemede yetim dosya bırakırdı.
     */
    for (let i = 0; i < FATURA_MAX_ADET; i++) {
      await yukle({ icerik: `f${i}` });
    }
    const dosyaSayisi = disk.size;

    await expect(yukle({ icerik: 'fazladan' })).rejects.toThrow(String(FATURA_MAX_ADET));
    // Reddedilen yükleme diske HİÇ dokunmadı — silinecek bir şey de yok.
    expect(disk.size).toBe(dosyaSayisi);
    expect(silinen).toEqual([]);
  });
});

describe('çoklu fatura — veritabanı kısıtı', () => {
  it('KRİTİK: hash NULL olan İKİ satır çakışmıyor', async () => {
    /*
     * BU TESTİN TAŞIDIĞI VARSAYIM: tekil indekste Postgres NULL'ları
     * birbirinden FARKLI sayıyor. Kısmi yüklemi (`WHERE dosya_hash IS NOT
     * NULL`) o yüzden kaldırdım; varsayım yanlışsa migration eski satırları
     * çakıştırır ve bunu ancak üretimde, `db:deploy` sırasında görürüz.
     *
     * Eski satırların hash'i YOK: bu kolon eklenmeden önce yüklenmişlerdi ve
     * baytları diskte, SQL içinde hesaplanamıyor.
     */
    for (const id of ['aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002']) {
      await h.q(
        `INSERT INTO fatura_belgeleri
           (id, org_id, client_id, platform, donem, file_name, storage_key,
            byte_size, dosya_hash, uploaded_by_user_id)
         VALUES ($1,$2,$3,'meta','2026-08','eski.pdf',$4,10,NULL,$5)`,
        [id, IDS.org, IDS.client, `key-${id}`, IDS.user],
      );
    }
    const rows = await h.q<{ n: string }>(
      `SELECT count(*)::text AS n FROM fatura_belgeleri WHERE dosya_hash IS NULL`,
    );
    expect(rows[0]!.n).toBe('2');
  });

  it('KRİTİK: aynı hash veritabanı seviyesinde de reddediliyor', async () => {
    // Servis zaten engelliyor; bu kısıt SON savunma hattı — başka bir kod
    // yolu (script, elle SQL) devreye girerse de mükerrer oluşmamalı.
    const hash = createHash('sha256').update('x').digest('hex');
    const ekle = (id: string) =>
      h.q(
        `INSERT INTO fatura_belgeleri
           (id, org_id, client_id, platform, donem, file_name, storage_key,
            byte_size, dosya_hash, uploaded_by_user_id)
         VALUES ($1,$2,$3,'meta','2026-08','a.pdf',$4,10,$5,$6)`,
        [id, IDS.org, IDS.client, `k-${id}`, hash, IDS.user],
      );

    await ekle('bbbbbbbb-0000-0000-0000-000000000001');
    await expect(ekle('bbbbbbbb-0000-0000-0000-000000000002')).rejects.toThrow();
  });
});

describe('raporEkleri — mail ekleri', () => {
  it('KRİTİK: aynı dönemdeki İKİ fatura da ek olarak geliyor', async () => {
    await yukle({ icerik: 'bir' });
    await yukle({ icerik: 'iki' });

    const { ekler, bulunan } = await svc.raporEkleri(IDS.client, '2026-08-01', '2026-08-31');
    expect(ekler.length).toBe(2);
    expect(bulunan).toBe(2);
  });

  it('KRİTİK: ek ADLARI çakışmıyor', async () => {
    /*
     * `dosyaAdi()` "MetaAds-Fatura-2026-08.pdf" üretiyor ve iki fatura aynı
     * adı taşırsa kullanıcı hangisinin hangisi olduğunu ayırt edemiyor;
     * bazı istemciler indirirken birini diğerinin üstüne yazıyor.
     */
    await yukle({ icerik: 'bir' });
    await yukle({ icerik: 'iki' });
    await yukle({ icerik: 'uc' });

    const { ekler } = await svc.raporEkleri(IDS.client, '2026-08-01', '2026-08-31');
    expect(new Set(ekler.map((e) => e.filename)).size).toBe(3);
    // İLK dosyanın adı DEĞİŞMİYOR: tek faturalı raporlar — bugünkü hâlin
    // ezici çoğunluğu — bu değişiklikten hiç etkilenmemeli.
    expect(ekler[0]!.filename).toBe('MetaAds-Fatura-2026-08.pdf');
    expect(ekler[1]!.filename).toBe('MetaAds-Fatura-2026-08-2.pdf');
  });

  it('KRİTİK: toplam boyut sınırını aşan fatura ATLANIYOR ve SEBEBİ dönüyor', async () => {
    /*
     * Üç adet 10 MB'lık PDF, maili SMTP sunucusunda reddettirir ve reddedilen
     * bir mail "gönderildi" yazan bir akışın en pahalı hâlidir. Ama sessizce
     * düşürmek de olmaz: hangi faturanın neden eklenmediği yazılmak zorunda.
     */
    const buyuk = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.alloc(Math.ceil(MAIL_EK_TOPLAM_SINIRI * 0.6), 0x41),
    ]);
    for (const ad of ['a', 'b']) {
      await svc.yukle(
        CTX,
        { clientId: IDS.client, platform: 'meta', donem: '2026-08' } as never,
        {
          fileName: `${ad}.pdf`,
          bytes: Buffer.concat([buyuk, Buffer.from(ad)]),
          mimeType: 'application/pdf',
        },
      );
    }

    const { ekler, atlanan } = await svc.raporEkleri(IDS.client, '2026-08-01', '2026-08-31');
    expect(ekler.length).toBe(1);
    expect(atlanan.length).toBe(1);
    expect(atlanan[0]!.sebep).toContain('boyut');
  });

  it('KRİTİK: sıra BELİRLİ — iki çağrı aynı sırayı veriyor', async () => {
    /*
     * `donem, platform` ikilisi artık TEKİL DEĞİL. Belirsiz sıralamada aynı
     * raporun iki gönderimi ekleri farklı sırayla taşır ve karşılaştıran kişi
     * bunu veri farkı sanar.
     */
    for (const i of ['1', '2', '3', '4']) await yukle({ icerik: i });

    const bir = await svc.raporEkleri(IDS.client, '2026-08-01', '2026-08-31');
    const iki = await svc.raporEkleri(IDS.client, '2026-08-01', '2026-08-31');
    expect(iki.ekler.map((e) => e.filename)).toEqual(bir.ekler.map((e) => e.filename));
    // Ve sıra YÜKLEME sırası — kullanıcı panelde gördüğü sırayı bekliyor.
    expect(bir.ekler.map((e) => e.content.toString('latin1').slice(-1))).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
  });

  it('okunamayan dosya raporu DURDURMUYOR ama sebebi dönüyor', async () => {
    await yukle({ icerik: 'bir' });
    await yukle({ icerik: 'iki' });
    // Diskteki ilk dosya kayboldu (taşınmış/silinmiş) — kayıt duruyor.
    disk.delete([...disk.keys()][0]!);

    const { ekler, atlanan } = await svc.raporEkleri(IDS.client, '2026-08-01', '2026-08-31');
    expect(ekler.length).toBe(1);
    expect(atlanan.map((a) => a.sebep)).toContain('dosya okunamadı');
  });

  it('faturasız dönem AYRI bildiriliyor — okunamayanla karışmıyor', async () => {
    /*
     * İkisi ayrı arıza: "yüklenmemiş" ajansın unutması, "okunamadı" disk
     * sorunu. Aynı listeye koymak, yapılacak işi belirsiz bırakırdı.
     */
    await yukle({ icerik: 'bir', donem: '2026-08' });
    const { eksikDonemler, atlanan } = await svc.raporEkleri(
      IDS.client,
      '2026-07-01',
      '2026-08-31',
    );
    expect(eksikDonemler).toEqual(['2026-07']);
    expect(atlanan).toEqual([]);
  });
});

/**
 * ═══ ZIP FATURA — UÇTAN UCA ═══
 *
 * Tür ÜÇ yerde kullanılıyor (diskteki uzantı, mail ekinin contentType'ı,
 * panelden açarken Content-Type başlığı) ve üçü de eskiden "PDF" olduğunu
 * VARSAYIYORDU. Bu blok üçünü de gerçek veritabanıyla sınıyor.
 */
describe('ZIP fatura', () => {
  it('KRİTİK: ZIP yüklenebiliyor', async () => {
    await svc.yukle(
      CTX,
      { clientId: IDS.client, platform: 'meta', donem: '2026-08' } as never,
      { fileName: 'faturalar.zip', bytes: zip('arsiv'), mimeType: 'application/zip' },
    );
    const liste = await svc.listele(CTX, IDS.client);
    expect(liste.length).toBe(1);
    expect(liste[0]!.mimeType).toBe('application/zip');
  });

  it('KRİTİK: mail eki `.zip` adıyla ve DOĞRU içerik tipiyle gidiyor', async () => {
    /*
     * Bir ZIP eki `.pdf` adıyla ve `application/pdf` tipiyle gitseydi
     * müşterinin istemcisi onu açamaz ve dosya bozuk sanılırdı.
     */
    await svc.yukle(
      CTX,
      { clientId: IDS.client, platform: 'google', donem: '2026-08' } as never,
      { fileName: 'google.zip', bytes: zip('a'), mimeType: 'application/zip' },
    );

    const { ekler } = await svc.raporEkleri(IDS.client, '2026-08-01', '2026-08-31');
    expect(ekler.length).toBe(1);
    expect(ekler[0]!.filename).toBe('GoogleAds-Fatura-2026-08.zip');
    expect(ekler[0]!.contentType).toBe('application/zip');
  });

  it('KRİTİK: aynı dönemde PDF ve ZIP BİRLİKTE gidiyor', async () => {
    // Ajans hem tekil faturayı hem arşivi yüklemiş olabilir; ikisi de eklenmeli
    // ve adları çakışmamalı (biri .pdf, biri .zip).
    await svc.yukle(
      CTX,
      { clientId: IDS.client, platform: 'meta', donem: '2026-08' } as never,
      { fileName: 'a.pdf', bytes: pdf('x'), mimeType: 'application/pdf' },
    );
    await svc.yukle(
      CTX,
      { clientId: IDS.client, platform: 'meta', donem: '2026-08' } as never,
      { fileName: 'b.zip', bytes: zip('y'), mimeType: 'application/zip' },
    );

    const { ekler } = await svc.raporEkleri(IDS.client, '2026-08-01', '2026-08-31');
    expect(ekler.map((e) => e.filename).sort()).toEqual([
      'MetaAds-Fatura-2026-08.pdf',
      'MetaAds-Fatura-2026-08.zip',
    ]);
  });

  it('KRİTİK: `bytes()` türü de döndürüyor — indirme ucu ona bakıyor', async () => {
    /*
     * `$queryRaw<T>` denetimsiz: alanı SELECT'e eklemeyi unutmak TypeScript'e
     * hiçbir şey söyletmiyor, alan `undefined` geliyor ve
     * `setHeader('Content-Type', undefined)` çalışma anında patlıyor.
     */
    const { id } = await svc.yukle(
      CTX,
      { clientId: IDS.client, platform: 'meta', donem: '2026-08' } as never,
      { fileName: 'x.zip', bytes: zip('z'), mimeType: 'application/zip' },
    );
    const out = await svc.bytes(CTX, id, IDS.client);
    expect(out.mimeType).toBe('application/zip');
  });

  it('KRİTİK: TARAYICININ BİLDİRDİĞİ TÜRE bakılmıyor — gövde kazanıyor', async () => {
    /*
     * Tarayıcı `content-type`ı UZANTIDAN tahmin ediyor. `.pdf` adıyla
     * yüklenen bir ZIP, gövdesi ZIP olduğu için ZIP olarak saklanmalı;
     * bildirilen türe güvenmek yanlış uzantıyla diske yazmak demekti.
     */
    await svc.yukle(
      CTX,
      { clientId: IDS.client, platform: 'meta', donem: '2026-08' } as never,
      { fileName: 'yanlis-ad.pdf', bytes: zip('gercekte-zip'), mimeType: 'application/pdf' },
    );
    expect((await svc.listele(CTX, IDS.client))[0]!.mimeType).toBe('application/zip');
  });

  it('EKRAN GÖRÜNTÜSÜ reddediliyor ve sebebi ADIYLA söyleniyor', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(
      svc.yukle(
        CTX,
        { clientId: IDS.client, platform: 'meta', donem: '2026-08' } as never,
        { fileName: 'ekran.png', bytes: png, mimeType: 'image/png' },
      ),
    ).rejects.toThrow('görsel');
  });

  it('KRİTİK: veritabanı kısıtı da bilinmeyen türü reddediyor', async () => {
    /*
     * Son savunma hattı: başka bir kod yolu (script, elle SQL) buraya
     * "image/png" yazarsa müşteriye ek olarak ekran görüntüsü giderdi.
     *
     * İDDİA SEBEBE ÇAPALI. Mesajsız bir `rejects.toThrow()` şemaya bir NOT
     * NULL kolon eklendiğinde de geçerdi — yanlış sebeple yeşil bir test,
     * hiç olmayandan kötü.
     */
    await expect(
      h.q(
        `INSERT INTO fatura_belgeleri
           (id, org_id, client_id, platform, donem, file_name, storage_key,
            byte_size, mime_type, uploaded_by_user_id)
         VALUES (gen_random_uuid(),$1,$2,'meta','2026-08','a.png','k',10,'image/png',$3)`,
        [IDS.org, IDS.client, IDS.user],
      ),
    ).rejects.toThrow('fatura_belgeleri_mime_chk');
  });

  it('KRİTİK: mime_type VERİLMEZSE varsayılan PDF', async () => {
    /*
     * Migration `NOT NULL DEFAULT 'application/pdf'` diyor ve geri doldurma
     * script'i yazılmadı — çünkü bu migration'dan önceki her satır PDF'ti
     * (yükleme yolu `%PDF-` dışında her şeyi reddediyordu). Varsayılan
     * kayarsa eski faturaların hepsi yanlış türle okunur ve mail ekleri
     * açılamaz hâle gelir.
     */
    await h.q(
      `INSERT INTO fatura_belgeleri
         (id, org_id, client_id, platform, donem, file_name, storage_key,
          byte_size, uploaded_by_user_id)
       VALUES (gen_random_uuid(),$1,$2,'meta','2026-08','eski.pdf','k',10,$3)`,
      [IDS.org, IDS.client, IDS.user],
    );
    const [satir] = await h.q<{ mime_type: string }>(
      `SELECT mime_type FROM fatura_belgeleri LIMIT 1`,
    );
    expect(satir!.mime_type).toBe('application/pdf');
  });
});

/**
 * ═══ BÜTÇE TOPLAM MESAJ BÜTÇESİ ═══
 *
 * Bütçe eskiden yalnızca faturaları sayıyordu ve rapor PDF'inin payı hesaba
 * HİÇ girmiyordu: 22 MB fatura + 3 MB PDF, sağlayıcının 25 MB sınırını tam
 * üstünden aşıyor ve mail SUNUCUDA reddediliyordu — kullanıcı sebebini bir
 * SMTP hatasından okumak zorunda kalırdı.
 */
describe('ek bütçesi — rapor PDF\'i de sayılıyor', () => {
  /** Bütçenin yarısından biraz fazlasını kaplayan bir fatura. */
  async function buyukFaturaYukle(ad: string) {
    const bytes = Buffer.concat([
      Buffer.from('%PDF-1.4\n'),
      Buffer.alloc(Math.ceil(MAIL_EK_TOPLAM_SINIRI * 0.55), 0x41),
      Buffer.from(ad),
    ]);
    await svc.yukle(
      CTX,
      { clientId: IDS.client, platform: 'meta', donem: '2026-08' } as never,
      { fileName: `${ad}.pdf`, bytes, mimeType: 'application/pdf' },
    );
  }

  it('KRİTİK: PDF payı verilmezse fatura sığıyor, VERİLİRSE sığmıyor', async () => {
    /*
     * TEK FATURA bütçenin %55'i. Kullanılan bayt sıfırken sığıyor; rapor
     * PDF'i bütçenin yarısını yediğinde artık sığmıyor. Parametre yok
     * sayılsaydı iki çağrı da AYNI sonucu verirdi — mutasyonun yakalayacağı
     * nokta bu.
     */
    await buyukFaturaYukle('a');

    const bos = await svc.raporEkleri(IDS.client, '2026-08-01', '2026-08-31', 0);
    expect(bos.ekler.length, 'PDF payı yokken fatura sığmalı').toBe(1);
    expect(bos.atlanan).toEqual([]);

    const doluyken = await svc.raporEkleri(
      IDS.client,
      '2026-08-01',
      '2026-08-31',
      Math.ceil(MAIL_EK_TOPLAM_SINIRI * 0.5),
    );
    expect(doluyken.ekler.length, 'PDF payı hesaba girmemiş').toBe(0);
    expect(doluyken.atlanan[0]!.sebep).toContain('boyut');
  });

  it('parametre VERİLMEZSE varsayılan 0 — eski çağrılar bozulmuyor', async () => {
    await buyukFaturaYukle('b');
    const out = await svc.raporEkleri(IDS.client, '2026-08-01', '2026-08-31');
    expect(out.ekler.length).toBe(1);
  });
});
