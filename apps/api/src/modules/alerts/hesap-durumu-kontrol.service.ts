import { Injectable, Logger } from '@nestjs/common';
import type { Uyari } from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { ConnectionsService } from '../connections/connections.service';
import { anahtar, odemeMailiOlustur } from './odeme-maili';
import { OdemeMailiGonderici } from './odeme-maili-gonderici.service';
import { ODEME_HESAP_SECIMI, odemeUyarisi } from './odeme-sorunlari';

/**
 * ═══ GÜNDE İKİ KEZ HESAP DURUMU KONTROLÜ ═══
 *
 * Sabah 08:00 ve öğlen 13:00'te (Europe/Istanbul) bütün platform
 * bağlantılarının hesap listesi tazeleniyor ve ödeme sorunu bulunan hesaplar
 * ajansa mail olarak gidiyor.
 *
 * NEDEN AYRI BİR İŞ: `structure` taraması bir hesabın İÇİNİ okuyor (kampanya,
 * grup, reklam); hesabın KENDİ durumu (`account_status`, `customer.status`)
 * hiçbir zamanlanmış işte tazelenmiyordu — yalnızca kullanıcı elle "Hesapları
 * yenile" dediğinde. Uyarı bandı bu yüzden doğru ama haftalarca bayat bir
 * bilgi gösterebiliyordu.
 *
 * SORUN YOKSA MAİL YOK. Günde iki kez "her şey yolunda" maili, üçüncü
 * günden sonra okunmadan siliniyor ve gerçek uyarı da onunla birlikte
 * siliniyor. Ama "mail gelmedi" ile "iş hiç koşmadı" ayırt edilebilmek
 * zorunda: her kontrol sonucu `sync_jobs`a yazılıyor ve teşhis ekranından
 * okunabiliyor.
 */
@Injectable()
export class HesapDurumuKontrolService {
  private readonly logger = new Logger(HesapDurumuKontrolService.name);

  constructor(
    private readonly admin: PrismaAdminService,
    private readonly connections: ConnectionsService,
    private readonly mail: OdemeMailiGonderici,
  ) {}

  /**
   * ÖDEME NABZI — 15 dakikada bir, yalnızca atanmış hesapların durumu.
   *
   * Mail BURADA atılmıyor: nabız hesap durumunu yazıyor ve yazan yol
   * (`odemeDurumlariniTazele`) tetiği kendisi çekiyor. Nabzın işi tetiğin
   * ne sıklıkla bir şey GÖREBİLECEĞİNİ belirlemek.
   */
  async nabiz(): Promise<{ rows: number; note: string }> {
    const r = await this.connections.odemeDurumlariniTazele();
    return { rows: r.hesap, note: r.not };
  }

  async kontrolEt(): Promise<{
    rows: number;
    note: string;
  }> {
    const tazeleme = await this.connections.tumBaglantilariTazele();

    const sorunlar = await this.odemeSorunlari();

    /*
     * MAİL GÖNDERİLDİĞİ AN KAYDEDİLİYOR — hangi hesaplar için olduğu dahil.
     * "Yeni mi" işareti bunu okuyor; kayıt tutulmasaydı her mail her satırı
     * "YENİ" gösterirdi ve işaret hiçbir şey anlatmazdı.
     */
    const oncekiAnahtarlar = await this.sonGonderilenAnahtarlar();
    const yeniler = new Set(
      sorunlar.map(anahtar).filter((a) => !oncekiAnahtarlar.has(a)),
    );

    let mailNotu = 'ödeme sorunu yok — mail gönderilmedi';
    if (sorunlar.length > 0) {
      mailNotu = await this.mailAt(sorunlar, yeniler);
    }

    const hataNotu =
      tazeleme.hatalar.length > 0
        ? ` · ${tazeleme.hatalar.length} bağlantı tazelenemedi (${tazeleme.hatalar
            .map((h) => `${h.platform}: ${h.mesaj}`)
            .join('; ')
            .slice(0, 200)})`
        : '';

    /*
     * ANAHTARLAR NOTUN İÇİNDE TAŞINIYOR ve bir sonraki tur onları geri
     * okuyor ("YENİ" işaretinin tek dayanağı bu). Ayrı bir tablo açmak
     * yalnızca bu bilgi için bir migration, bir RLS politikası ve bir
     * TRUNCATE satırı demekti; `sync_jobs` zaten her turda yazılıyor.
     *
     * NOT 500 KARAKTERLE SINIRLI (`sync_jobs.note` VarChar(500)). Sınırı
     * aşan bir yazma Postgres'te HATA veriyor, sessizce kısaltmıyor — yani
     * çok sayıda sorunlu hesapta işin tamamı düşerdi. Anahtarlar bu yüzden
     * bütçeye göre kırpılıyor ve kaç tanesinin sığmadığı YAZILIYOR: kırpılan
     * anahtarlar bir sonraki turda "yeni" görünecek ve bu, sessizce
     * kaybolmalarından iyi.
     */
    const govde =
      `${tazeleme.basarili}/${tazeleme.baglanti} bağlantı tazelendi · ` +
      `${sorunlar.length} ödeme sorunu (${yeniler.size} yeni) · ${mailNotu}${hataNotu}`;

    return {
      rows: sorunlar.length,
      note: notOlustur(govde, sorunlar.map(anahtar)),
    };
  }

  /**
   * Tazelenmiş veriden ödeme sorunu olan hesapları çıkarır.
   *
   * KARAR `odemeUyarisi`nde — anlık tetiğin kullandığı fonksiyonun
   * AYNISI. Özetin "3 hesap", anlık mailin "2 hesap" demesi ancak ikisi ayrı
   * karar verirse olur.
   */
  private async odemeSorunlari(): Promise<Uyari[]> {
    const simdi = new Date();
    const hesaplar = await this.admin.adAccount.findMany({
      // ATANMAMIŞ HESAP DIŞARIDA. Ajansın havuzunda 481 hesap var ve
      // çoğuyla çalışılmıyor; onların ödeme durumu ajansın işi değil.
      where: { clientId: { not: null } },
      select: ODEME_HESAP_SECIMI,
    });
    return hesaplar.flatMap((h) => {
      const u = odemeUyarisi(h, simdi);
      return u ? [u] : [];
    });
  }

  /**
   * Maili gönderir ve sonucu METİN olarak döndürür — `sync_jobs` notuna yazılıyor.
   *
   * HATA FIRLATMIYOR. Mail gönderilemezse tazeleme yine de yapıldı ve o
   * değerli; işi tamamen düşürmek, bir sonraki turda her şeyin baştan
   * denenmesi ve SMTP arızası boyunca hesap durumunun hiç tazelenmemesi
   * demekti. Hata nota yazılıyor ve teşhis ekranında görünüyor.
   */
  private async mailAt(sorunlar: Uyari[], yeniler: Set<string>): Promise<string> {
    const { konu, html } = odemeMailiOlustur(
      sorunlar,
      yeniler,
      process.env.APP_URL ?? 'https://advetics.com',
    );
    try {
      const { alici } = await this.mail.gonder(konu, html);
      return `mail gönderildi: ${alici}`;
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : 'bilinmeyen hata';
      this.logger.error(`Ödeme uyarısı maili gönderilemedi: ${mesaj}`);
      return `MAİL GÖNDERİLEMEDİ: ${mesaj}`;
    }
  }

  /** Son gönderimde hangi hesaplar için uyarıldığı — "YENİ" işaretinin dayanağı. */
  private async sonGonderilenAnahtarlar(): Promise<Set<string>> {
    const son = await this.admin.syncJob.findFirst({
      where: { jobType: 'account_status', status: 'succeeded' },
      orderBy: { createdAt: 'desc' },
      select: { note: true },
    });
    const eslesme = son?.note?.match(/\[anahtarlar:([^\]]*)\]/);
    if (!eslesme?.[1]) return new Set();
    return new Set(eslesme[1].split(',').filter((a) => a !== ''));
  }

}

/** `sync_jobs.note` üst sınırı. Aşan yazma Postgres'te HATA — sessiz kırpma yok. */
export const NOT_SINIRI = 500;

/**
 * Gövde ile anahtar listesini tek nota sığdırır.
 *
 * ÖNCELİK GÖVDEDE: "kaç bağlantı tazelendi, mail gitti mi" bilgisi teşhis
 * için asıl olan; anahtarlar yalnızca bir sonraki turun "yeni mi"
 * karşılaştırması. Gövde tek başına sınırı aşıyorsa anahtar hiç yazılmıyor.
 */
export function notOlustur(govde: string, anahtarlar: string[]): string {
  const kalan = NOT_SINIRI - govde.length - ' [anahtarlar:]'.length;
  if (kalan <= 0) return govde.slice(0, NOT_SINIRI);

  const sigan: string[] = [];
  let uzunluk = 0;
  for (const a of anahtarlar) {
    const ek = uzunluk === 0 ? a.length : a.length + 1;
    if (uzunluk + ek > kalan) break;
    sigan.push(a);
    uzunluk += ek;
  }

  const not = `${govde} [anahtarlar:${sigan.join(',')}]`;
  if (sigan.length === anahtarlar.length) return not;

  /*
   * SIĞMAYAN VARSA SÖYLENİYOR: sessiz kesme yok. Sığmayanlar bir sonraki
   * turda "yeni" görünecek ve o, kaybolmalarından iyi.
   *
   * EK ÖNCE ÜRETİLİP UZUNLUĞU ÖLÇÜLÜYOR. İlk hâli kırpma payını 12 karakter
   * SABİT yazıyordu; "+153 sığmadı" o payı aşıyor ve not 501 karakter
   * çıkıyordu — yani tam da engellemek için yazılan sınır aşımı. Testi
   * yazmasaydım bu, çok sayıda sorunlu hesabın olduğu ilk turda işin
   * tamamını düşürürdü.
   */
  const ek = ` +${anahtarlar.length - sigan.length} sığmadı`;
  return `${not.slice(0, NOT_SINIRI - ek.length)}${ek}`;
}
