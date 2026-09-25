import { Injectable, Logger } from '@nestjs/common';
import type { Uyari } from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { anlikOdemeMailiOlustur } from './odeme-maili';
import { OdemeMailiGonderici } from './odeme-maili-gonderici.service';
import { ODEME_HESAP_SECIMI, odemeUyarisi } from './odeme-sorunlari';

export interface TetikSonucu {
  /** Bu çağrıda ANLIK mail atılan hesap sayısı. */
  yeni: number;
  /** Sorunu çözüldüğü için damgası kaldırılan hesap sayısı. */
  cozulen: number;
  /** `sync_jobs` notuna ve log'a giden tek satır. */
  not: string;
}

/**
 * ═══ ÖDEME TETİĞİ — sorun görüldüğü AN mail ═══
 *
 * Önceki kurguda ödeme sorunu yalnızca günde iki kez (08:05 ve 13:05)
 * toplu mailde bildiriliyordu. Sabah 08:10'da ödemesi düşen bir hesap
 * öğlene kadar, akşam düşen bir hesap ertesi sabaha kadar yayında
 * değildi ve kimse bilmiyordu.
 *
 * TETİK, HESAP DURUMUNUN YAZILDIĞI YERDE. Hesabın platformdaki durumu
 * yalnızca iki yoldan yazılıyor: hesap keşfi (bağlantı dönüşü, "Hesapları
 * yenile", günde iki kez tam tazeleme) ve 15 dakikalık ödeme nabzı. İkisi
 * de yazdığı hesapların kimliğini buraya veriyor; yani sorun HANGİ yoldan
 * görülürse görülsün mail o an gidiyor, bir sonraki özeti beklemiyor.
 *
 * ═══ PLATFORM BİZE HABER VERMİYOR ═══
 *
 * Meta'nın reklam hesabı webhook'larında ödeme ya da hesap durumu alanı
 * YOK (yalnızca reklam nesnesi, kreatif yorgunluğu, öneri ve ürün seti
 * olayları); Google Ads'in hiç webhook'u yok. Yani "anında" şu demek:
 * sistemin durumu GÖRDÜĞÜ an. Görme sıklığını 15 dakikalık nabız
 * belirliyor; mail o görüşü beklemeden, kuyruğa bile girmeden çıkıyor.
 *
 * ═══ AYNI SORUN İÇİN İKİ MAİL YOK ═══
 *
 * Hesap `payment_alerted_at IS NULL` koşuluyla KAPILIYOR ve yalnızca
 * kapan taraf maili gönderiyor: bağlantı dönüşü ile nabız aynı saniyede
 * koşsa bile. Sorun çözülünce damga kalkıyor; aynı hesap bir ay sonra
 * yine ödeme sorunu yaşarsa yeniden uyarılıyor.
 *
 * ═══ MAİL GİDEMEZSE KAYBOLMUYOR ═══
 *
 * SMTP reddederse damga GERİ ALINIYOR: bir sonraki kontrol (en geç 15
 * dakika) aynı hesabı yeniden "yeni" görüp tekrar deniyor. Damga yerinde
 * bıraksaydık tetik bir daha hiç çekilmezdi — sorun sürerken "zaten
 * bildirildi" sanılırdı.
 */
@Injectable()
export class OdemeTetigiService {
  private readonly logger = new Logger(OdemeTetigiService.name);

  constructor(
    private readonly admin: PrismaAdminService,
    private readonly mail: OdemeMailiGonderici,
  ) {}

  async degerlendir(adAccountIds: readonly string[]): Promise<TetikSonucu> {
    if (adAccountIds.length === 0) return { yeni: 0, cozulen: 0, not: 'hesap yok' };

    const simdi = new Date();
    const hesaplar = await this.admin.adAccount.findMany({
      where: { id: { in: [...adAccountIds] } },
      select: ODEME_HESAP_SECIMI,
    });

    const adaylar: Uyari[] = [];
    const cozulenIdler: string[] = [];
    for (const h of hesaplar) {
      const uyari = odemeUyarisi(h, simdi);
      if (uyari && h.paymentAlertedAt === null) adaylar.push(uyari);
      if (!uyari && h.paymentAlertedAt !== null) cozulenIdler.push(h.id);
    }

    /*
     * ÇÖZÜLEN DAMGA KOŞULLU KALDIRILIYOR — `NOT NULL` iken. Koşulsuz
     * yazmak, arada başka bir yolun az önce kapıp mail attığı bir damgayı
     * silebilirdi (o yol sorunu yeni verilerle görmüş, bu yol eskiyle).
     */
    let cozulen = 0;
    if (cozulenIdler.length > 0) {
      const r = await this.admin.adAccount.updateMany({
        where: { id: { in: cozulenIdler }, paymentAlertedAt: { not: null } },
        data: { paymentAlertedAt: null },
      });
      cozulen = r.count;
    }

    /*
     * KAPMA HESAP BAŞINA ve KOŞULLU. Toplu tek bir `updateMany` kaç
     * satırın kapıldığını söylüyor ama HANGİLERİNİN söylemiyor; aynı anda
     * koşan diğer yolun kaptığı hesabı da maile koyardık.
     */
    const kapilan: Uyari[] = [];
    for (const u of adaylar) {
      const r = await this.admin.adAccount.updateMany({
        where: { id: u.adAccountId!, paymentAlertedAt: null },
        data: { paymentAlertedAt: simdi },
      });
      if (r.count === 1) kapilan.push(u);
    }

    if (kapilan.length === 0) {
      return { yeni: 0, cozulen, not: `yeni ödeme sorunu yok · ${cozulen} çözüldü` };
    }

    const { konu, html } = anlikOdemeMailiOlustur(
      kapilan,
      process.env.APP_URL ?? 'https://advetics.com',
    );
    try {
      const { alici } = await this.mail.gonder(konu, html);
      this.logger.log(`Ödeme sorunu anlık maili: ${kapilan.length} hesap → ${alici}`);
      return {
        yeni: kapilan.length,
        cozulen,
        not: `${kapilan.length} yeni ödeme sorunu, anlık mail gönderildi: ${alici} · ${cozulen} çözüldü`,
      };
    } catch (err) {
      const mesaj = err instanceof Error ? err.message : 'bilinmeyen hata';
      await this.admin.adAccount.updateMany({
        where: { id: { in: kapilan.map((u) => u.adAccountId!) }, paymentAlertedAt: simdi },
        data: { paymentAlertedAt: null },
      });
      this.logger.error(`Ödeme sorunu anlık maili GÖNDERİLEMEDİ (${kapilan.length} hesap): ${mesaj}`);
      return {
        yeni: 0,
        cozulen,
        not: `ANLIK MAİL GÖNDERİLEMEDİ (${kapilan.length} hesap, sonraki kontrolde yeniden denenecek): ${mesaj}`,
      };
    }
  }
}
