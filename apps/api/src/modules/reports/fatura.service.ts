import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FATURA_MAX_BAYT,
  FATURA_TURLERI,
  faturaRetSebebi,
  faturaTuruAnla,
  FATURA_MAX_ADET,
  MAIL_EK_TOPLAM_SINIRI,
  kapsananDonemler,
  type FaturaOzeti,
  type FaturaPlatformu,
  type FaturaYuklemeInput,
  type TenantContext,
} from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetStorageService } from '../ad-builder/asset-storage.service';

/**
 * ═══ PLATFORM FATURALARI ═══
 *
 * Rapor mailine eklenen resmi belgeler. Neden elle yüklendiği
 * `packages/shared/src/schemas/fatura.schema.ts` başında yazılı: iki
 * platformda da API'den PDF almak mümkün değil.
 */
@Injectable()
export class FaturaService {
  private readonly logger = new Logger(FaturaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: PrismaAdminService,
    private readonly storage: AssetStorageService,
  ) {}

  async listele(ctx: TenantContext, clientId: string): Promise<FaturaOzeti[]> {
    const scoped = { ...ctx, activeClientId: clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT f.id::text, f.client_id::text AS client_id, c.name AS client_name,
               f.platform::text AS platform, f.donem, f.file_name, f.byte_size, f.mime_type,
               f.aciklama, u.full_name AS uploaded_by_name, f.uploaded_at
          FROM fatura_belgeleri f
          JOIN clients c ON c.id = f.client_id
          JOIN users u ON u.id = f.uploaded_by_user_id
         WHERE f.client_id = ${clientId}::uuid
         ORDER BY f.donem DESC, f.platform
      `),
    );
    return rows.map(satirdanOzet);
  }

  /**
   * Yükler — AYNI DÖNEM+PLATFORM VARSA DEĞİŞTİRİR.
   *
   * Yanına eklemiyor: iki fatura dursaydı maile hangisinin gireceği belirsiz
   * kalırdı ve müşteriye yanlış belge gitmesi sessiz bir hata olurdu.
   */
  async yukle(
    ctx: TenantContext,
    input: FaturaYuklemeInput,
    dosya: { fileName: string; mimeType: string; bytes: Buffer },
  ): Promise<{ id: string }> {
    /*
     * ═══ DOĞRULAMA GİRİŞ ANINDA ═══
     *
     * CLAUDE.md: "Doğrulama kullanım anında değil, giriş anında." Bozuk bir
     * dosyanın kullanıldığı an, müşteriye giden mailin oluşturulduğu an
     * olurdu — yani fark edilmesi en pahalı yer.
     */
    /*
     * TARAYICININ BİLDİRDİĞİ TÜRE HİÇ BAKILMIYOR.
     *
     * Eskiden burada `dosya.mimeType !== FATURA_MIME` kontrolü vardı ve iki
     * kez yanlıştı: tarayıcı `content-type`ı UZANTIDAN tahmin ediyor (yani
     * `.pdf` uzantılı bir JPEG "application/pdf" olarak geliyor) ve bazı
     * istemciler ZIP için `application/x-zip-compressed`, `multipart/x-zip`
     * gibi farklı değerler gönderiyor — kabul listesini o değerlere göre
     * yazmak, doğru bir dosyayı yanlış bir başlık yüzünden reddetmek olurdu.
     *
     * Tek doğru kaynak GÖVDE; kontrol aşağıda, sihirli baytlarla.
     */
    void dosya.mimeType;
    if (dosya.bytes.byteLength === 0) {
      throw new BadRequestException('Dosya boş.');
    }
    if (dosya.bytes.byteLength > FATURA_MAX_BAYT) {
      throw new BadRequestException(
        `Dosya çok büyük (${Math.round(dosya.bytes.byteLength / 1024 / 1024)} MB). ` +
          `Üst sınır ${FATURA_MAX_BAYT / 1024 / 1024} MB.`,
      );
    }
    /*
     * İÇERİK GERÇEKTEN PDF Mİ — `content-type`a GÜVENİLMİYOR.
     *
     * Tarayıcı gönderdiği MIME'ı uzantıdan tahmin ediyor; `.pdf` uzantılı
     * bir JPEG "application/pdf" olarak gelebilir. Aynı ders raporun kreatif
     * görsellerinde de yaşandı: biçim GÖVDEDEN (sihirli baytlardan)
     * anlaşılıyor, uzantıdan değil.
     */
    const tur = faturaTuruAnla(dosya.bytes);
    if (tur === null) {
      // SEBEP AYRIŞTIRILIYOR: boş arşiv, çok parçalı arşiv ve ekran görüntüsü
      // üç ayrı hata ve üçünün yapılacak işi farklı.
      throw new BadRequestException(faturaRetSebebi(dosya.bytes));
    }

    /*
     * ═══ İÇERİK HASH'İ — MÜKERRER YÜKLEMENİN TEK GÜVENİLİR ÖLÇÜTÜ ═══
     *
     * Aynı döneme artık birden çok fatura girebiliyor ve bu yeni bir sessiz
     * hata açıyor: kullanıcı aynı PDF'i iki kez yüklerse müşteriye AYNI
     * fatura iki ek olarak gider ve bunu ilk gören müşteri olur.
     *
     * DOSYA ADINA BAKMAK YETMEZ — aynı fatura iki kez indirilince
     * "fatura (1).pdf" oluyor ve ada bakan bir kontrol onu farklı sanardı.
     * Boyut da yetmez: iki farklı ayın faturası aynı bayt sayısında olabilir.
     */
    const hash = createHash('sha256').update(dosya.bytes).digest('hex');

    const scoped = { ...ctx, activeClientId: input.clientId };

    /*
     * ADET SINIRI DİSKE YAZMADAN ÖNCE. Sıra önemli: önce kaydedip sonra
     * reddetmek, her reddedilen yüklemede diskte yetim bir dosya bırakırdı ve
     * paylaşımlı sunucuda sessiz disk dolması diğer siteleri de etkileyen bir
     * arıza. Maliyeti sıfır olan bir ret, pahalı adımdan önce gelmeli.
     */
    const [sayim] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ adet: bigint }>>(Prisma.sql`
        SELECT count(*) AS adet FROM fatura_belgeleri
         WHERE client_id = ${input.clientId}::uuid
           AND platform = ${input.platform}::"Platform"
           AND donem = ${input.donem}
      `),
    );
    if (Number(sayim?.adet ?? 0) >= FATURA_MAX_ADET) {
      throw new BadRequestException(
        `Bu dönem ve platform için en fazla ${FATURA_MAX_ADET} fatura yüklenebilir. ` +
          'Gereksiz olanları silip tekrar dene.',
      );
    }

    const storageKey = await this.storage.save({
      orgId: ctx.orgId,
      scope: `faturalar/${input.clientId}`,
      bytes: dosya.bytes,
      // Uzantı BULUNAN türden; yanlış uzantı, panelden açarken dosyayı
      // bozuk gösterirdi.
      mimeType: tur.mime,
    });

    let id: string;
    try {
      const rows = await this.prisma.withTenant(scoped, (tx) =>
        tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO fatura_belgeleri (
            id, org_id, client_id, platform, donem, file_name, storage_key,
            byte_size, mime_type, dosya_hash, aciklama, uploaded_by_user_id, uploaded_at
          ) VALUES (
            gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
            ${input.platform}::"Platform", ${input.donem},
            ${dosya.fileName.slice(0, 255)}, ${storageKey},
            ${dosya.bytes.byteLength}, ${tur.mime}, ${hash}, ${input.aciklama ?? null},
            ${ctx.userId}::uuid, now()
          )
          -- AYNI DÖNEME BİRDEN ÇOK FATURA GİREBİLİR, AYNI DOSYA İKİ KEZ
          -- GİREMEZ. Çakışma ÜZERİNE YAZMIYOR: mükerrer bir yükleme
          -- kullanıcının hatası ve ona söylenmeli, sessizce yutulmamalı.
          ON CONFLICT (client_id, platform, donem, dosya_hash) DO NOTHING
          RETURNING id::text
        `),
      );
      const row = rows[0];
      /*
       * BOŞ DÖNÜŞ "HATA" DEĞİL, "MÜKERRER" DEMEK — ve ikisi ayrı cümleyle
       * söylenmek zorunda. `DO NOTHING` çakışmada sıfır satır döndürüyor;
       * bunu genel bir "kaydedilemedi" hatasına çevirmek, kullanıcıyı
       * olmayan bir arızayı aramaya gönderirdi.
       */
      if (!row) {
        /*
         * DOSYA BURADA SİLİNMİYOR — aşağıdaki `catch` zaten siliyor.
         * İkisini birden yapmak dosyayı iki kez silmeye çalışmak demek ve
         * temizliğin nerede yapıldığı sorusunu iki cevaplı bırakırdı.
         */
        throw new BadRequestException(
          'Bu dosya bu dönem ve platform için zaten yüklü. ' +
            'Farklı bir fatura yüklemek istiyorsan dosyayı kontrol et.',
        );
      }
      id = row.id;
    } catch (err) {
      /*
       * KAYIT YAZILAMAZSA YENİ DOSYA SİLİNİYOR. Aksi hâlde her başarısız
       * yükleme diskte yetim bir dosya bırakırdı — varlık arşivinde aynı
       * karar verilmişti.
       */
      await this.storage.remove(storageKey).catch(() => undefined);
      throw err;
    }

    /*
     * ESKİ DOSYAYI SİLEN BLOK KALDIRILDI. Yükleme artık ÜZERİNE YAZMIYOR,
     * YANINA EKLİYOR — silinecek bir öncesi yok. Blok bırakılsaydı yeni
     * yüklenen bir faturanın yanındaki eskisini silerdi.
     */
    return { id };
  }

  async sil(ctx: TenantContext, id: string, clientId: string): Promise<{ silindi: true }> {
    const scoped = { ...ctx, activeClientId: clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ storage_key: string }>>(Prisma.sql`
        DELETE FROM fatura_belgeleri WHERE id = ${id}::uuid RETURNING storage_key
      `),
    );
    // SIFIR SATIR = RLS reddetti ya da satır yok. Sessizce "silindi" demek,
    // kullanıcının sildiğini sanması demek olurdu.
    if (rows.length === 0) throw new NotFoundException('Fatura bulunamadı.');
    await this.storage.remove(rows[0]!.storage_key).catch(() => undefined);
    return { silindi: true };
  }

  /** İndirme — panelde önizleme ve doğrulama için. */
  async bytes(
    ctx: TenantContext,
    id: string,
    clientId: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const scoped = { ...ctx, activeClientId: clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ storage_key: string; file_name: string; mime_type: string }>>(Prisma.sql`
        SELECT storage_key, file_name, mime_type FROM fatura_belgeleri WHERE id = ${id}::uuid
      `),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Fatura bulunamadı.');
    /*
     * TÜR DE DÖNÜYOR. Uç eskiden `Content-Type: application/pdf` SABİT
     * yazıyordu; bir ZIP'i PDF diye bildirmek tarayıcıda bozuk bir görüntüleyici
     * açardı ve kullanıcı dosyanın bozuk olduğunu sanardı.
     */
    return {
      buffer: await this.storage.read(row.storage_key),
      fileName: row.file_name,
      mimeType: row.mime_type,
    };
  }

  /**
   * ═══ RAPOR ARALIĞINA DÜŞEN FATURALAR — MAİL EKİ ═══
   *
   * WORKER'DAN DA ÇAĞRILIYOR (zamanlanmış rapor), bu yüzden `admin`
   * kullanılıyor: oturum yok ve RLS eşleşemezdi.
   *
   * EKSİK DÖNEM AYRICA DÖNÜYOR. CLAUDE.md: "Sessiz kesme yok." Faturasız
   * giden bir rapor, ajansın o ay yüklemeyi unuttuğunu kimseye söylemezdi;
   * çağıran bu listeyi nota ve panele yazıyor.
   */
  async raporEkleri(
    clientId: string,
    from: string,
    to: string,
    /**
     * MAİLDE ZATEN KULLANILMIŞ BAYT — pratikte rapor PDF'i.
     *
     * Bütçe eskiden yalnızca faturaları sayıyordu ve PDF'in payı hesaba hiç
     * girmiyordu: 22 MB fatura + 3 MB PDF, sağlayıcının 25 MB sınırını tam
     * üstünden aşıyordu ve mail SUNUCUDA reddediliyordu. Bütçeyi çağıran
     * biliyor, çünkü PDF'i o üretiyor.
     */
    kullanilanBayt = 0,
  ): Promise<{
    ekler: Array<{ filename: string; content: Buffer; contentType: string }>;
    eksikDonemler: string[];
    bulunan: number;
    /**
     * EKLENEMEYEN faturalar ve SEBEBİ.
     *
     * Boş liste "sorun yok" demek. Dolu bir liste kullanıcıya GÖSTERİLMEK
     * zorunda: bir faturanın maile girmemesi, ajansın müşteriye eksik belge
     * göndermesi demek ve sessiz kalırsa bunu ilk fark eden müşteri olur.
     */
    atlanan: Array<{ donem: string; platform: string; sebep: string }>;
  }> {
    const donemler = kapsananDonemler(from, to);
    if (donemler.length === 0) {
      return { ekler: [], eksikDonemler: [], bulunan: 0, atlanan: [] };
    }

    const rows = await this.admin.$queryRaw<
      Array<{
        donem: string;
        platform: string;
        file_name: string;
        storage_key: string;
        byte_size: number;
        mime_type: string;
      }>
    >(Prisma.sql`
      SELECT donem, platform::text AS platform, file_name, storage_key, byte_size, mime_type
        FROM fatura_belgeleri
       WHERE client_id = ${clientId}::uuid
         AND donem IN (${Prisma.join(donemler)})
       -- SIRA TAM BELİRLİ OLMAK ZORUNDA, kimlik sütunu dahil. Aynı döneme
       -- artık birden çok fatura girebiliyor ve donem+platform ikilisi artık
       -- TEKİL DEĞİL. Belirsiz bir sıralamada Postgres iki çalıştırmada
       -- farklı sıra döndürebiliyor; aynı raporun iki gönderimi ekleri farklı
       -- sırayla taşır ve karşılaştıran kişi bunu veri farkı sanar. Yüklenme
       -- damgası tek başına yetmiyor: toplu yüklemede iki satırınki aynı olur.
       ORDER BY donem, platform, uploaded_at, id
    `);

    const ekler: Array<{ filename: string; content: Buffer; contentType: string }> = [];
    const atlanan: Array<{ donem: string; platform: string; sebep: string }> = [];
    const kullanilanAd = new Map<string, number>();
    let toplamBayt = kullanilanBayt;

    for (const r of rows) {
      /*
       * BÜTÇE OKUMADAN ÖNCE KONTROL EDİLİYOR. Dosyayı diskten okuyup sonra
       * atmak, sınıra takılan her fatura için boşa bellek ve boşa G/Ç demek —
       * ve 10 MB'lık dosyalarda bu ölçülebilir bir maliyet.
       */
      if (toplamBayt + r.byte_size > MAIL_EK_TOPLAM_SINIRI) {
        atlanan.push({
          donem: r.donem,
          platform: r.platform,
            sebep:
            `maildeki toplam ek boyutu sınırı aşıldı ` +
            `(${Math.round(MAIL_EK_TOPLAM_SINIRI / 1024 / 1024)} MB)`,
        });
        continue;
      }

      try {
        const content = await this.storage.read(r.storage_key);
        ekler.push({
          filename: benzersizAd(
            dosyaAdi(r.donem, r.platform as FaturaPlatformu, r.mime_type),
            kullanilanAd,
          ),
          content,
          // TÜR SATIRDAN. Sabit `application/pdf` yazmak, ZIP ekini PDF diye
          // bildirmek ve mail istemcisinde açılamayan bir ek üretmek olurdu.
          contentType: r.mime_type,
        });
        toplamBayt += r.byte_size;
      } catch (err) {
        /*
         * DOSYA OKUNAMAZSA RAPOR YİNE GİDİYOR. Kayıt var ama disk okunamıyor
         * (taşınmış, silinmiş) — bu bir arıza ama raporu tamamen durdurmak,
         * çalışan bir gönderimi ikincil bir sorun yüzünden iptal etmek olurdu.
         * Sebep hem log'a hem `atlanan` listesine giriyor.
         */
        const sebep = err instanceof Error ? err.message : String(err);
        this.logger.error(`Fatura dosyası okunamadı (${r.donem}/${r.platform}): ${sebep}`);
        atlanan.push({ donem: r.donem, platform: r.platform, sebep: 'dosya okunamadı' });
      }
    }

    /*
     * EKSİK = o dönemde HİÇ fatura yok. Platform başına eksik aramıyoruz:
     * müşterinin yalnızca Meta'da reklamı olabilir ve "Google faturası
     * eksik" demek her ay yanlış bir uyarı üretirdi — okunmaz hâle gelen
     * uyarı, hiç olmayan uyarıdan kötü.
     *
     * KAYIT VARLIĞINA BAKIYOR, EKLENEBİLDİĞİNE DEĞİL: dosyası okunamayan bir
     * dönem "yüklenmemiş" değil, bu ikisi ayrı arızalar ve ayrı listelerde.
     */
    const dolu = new Set(rows.map((r) => r.donem));
    const eksikDonemler = donemler.filter((d) => !dolu.has(d));

    return { ekler, eksikDonemler, bulunan: ekler.length, atlanan };
  }
}

function dosyaAdi(donem: string, platform: FaturaPlatformu, mime: string): string {
  /*
   * DOSYA ADI YENİDEN KURULUYOR. Platformun indirdiği ad genelde
   * "invoice_1234567890.pdf" gibi anlamsız; müşteri mail ekinde hangi ayın
   * hangi platformu olduğunu görmeli. Orijinal ad kayıtta duruyor.
   *
   * UZANTI SAKLANAN TÜRDEN, sabit `.pdf` değil: bir ZIP eki `.pdf` adıyla
   * gitseydi müşterinin istemcisi onu açamaz ve dosya bozuk sanılırdı.
   */
  const etiket = platform === 'google' ? 'GoogleAds' : 'MetaAds';
  const uzanti = FATURA_TURLERI.find((t) => t.mime === mime)?.uzanti ?? 'pdf';
  return `${etiket}-Fatura-${donem}.${uzanti}`;
}

/**
 * ═══ EK ADLARI ÇAKIŞAMAZ ═══
 *
 * `dosyaAdi()` "MetaAds-Fatura-2026-08.pdf" üretiyor ve aynı döneme artık
 * BİRDEN ÇOK fatura girebiliyor: iki ek aynı adı taşırsa mail istemcileri
 * ikisini de gösteriyor ama kullanıcı hangisinin hangisi olduğunu ayırt
 * edemiyor, bazıları da indirirken birini diğerinin üstüne yazıyor.
 *
 * İKİNCİDEN İTİBAREN NUMARALANIYOR (`-2`, `-3`): ilk dosyanın adı değişmiyor,
 * çünkü tek faturalı raporlar — bugünkü hâlin ezici çoğunluğu — bu
 * değişiklikten hiç etkilenmemeli.
 */
function benzersizAd(ad: string, kullanilan: Map<string, number>): string {
  const sayi = (kullanilan.get(ad) ?? 0) + 1;
  kullanilan.set(ad, sayi);
  if (sayi === 1) return ad;

  const nokta = ad.lastIndexOf('.');
  // Uzantısız bir ad gelirse `slice` ile bölmek adı bozardı.
  if (nokta <= 0) return `${ad}-${sayi}`;
  return `${ad.slice(0, nokta)}-${sayi}${ad.slice(nokta)}`;
}

function satirdanOzet(r: Record<string, unknown>): FaturaOzeti {
  return {
    id: r.id as string,
    clientId: r.client_id as string,
    clientName: (r.client_name as string) ?? null,
    platform: r.platform as FaturaPlatformu,
    donem: r.donem as string,
    fileName: r.file_name as string,
    mimeType: r.mime_type as string,
    byteSize: Number(r.byte_size),
    aciklama: (r.aciklama as string) ?? null,
    uploadedByName: (r.uploaded_by_name as string) ?? null,
    uploadedAt: (r.uploaded_at as Date).toISOString(),
  };
}
