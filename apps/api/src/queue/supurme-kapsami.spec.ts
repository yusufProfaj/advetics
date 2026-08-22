import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPURME_HESAP_KOSULU, supurmeDisiSebep } from './supurme-kapsami';

/**
 * SÜPÜRME SÜZGECİNİN TEK TANIMLI KALMASI.
 *
 * Bu dosyanın koruduğu hata canlıda şöyle görünüyordu: kullanıcı "Şimdi
 * güncelle"ye basınca veri geliyor, ertesi gün kendiliğinden gelmiyordu.
 * Sebep tek satırdı — zamanlanmış süpürme hesabın PLATFORM DURUMUNA da
 * bakıyor, elle tetikleyen uç bakmıyor. İki süzgeç iki ayrı dosyada
 * yazılmıştı ve biri güncellenince diğeri sessizce geride kalıyordu.
 */
describe('süpürme kapsamı', () => {
  const KAYNAK = join(__dirname, 'sync-processor.service.ts');

  it('fanOut hesapları SABİTLE süzüyor — süzgecin ikinci bir kopyası yok', () => {
    const src = readFileSync(KAYNAK, 'utf8');

    // ANTİ-BOŞLUK: dilim bulunamazsa iddia her zaman doğru olurdu.
    const i = src.indexOf('const accounts = await this.db.adAccount.findMany(');
    if (i === -1) {
      throw new Error(
        'fanOut içindeki adAccount.findMany bulunamadı — tarama boşa düştü, testi güncelle.',
      );
    }
    const dilim = src.slice(i, i + 400);

    expect(dilim).toContain('where: SUPURME_HESAP_KOSULU');
    // Süzgecin elle tekrar yazılmış hâli GERİ GELMEMELİ.
    expect(dilim).not.toContain("status: { in: ['active', 'paused'] }");
  });

  it('sabit dört koşulun dördünü de taşıyor', () => {
    // Biri düşerse süpürme sessizce GENİŞLER: kapatılmış hesaplar,
    // duraklatılmış müşteriler ya da ölü bağlantılar kotayı harcamaya başlar.
    expect(SUPURME_HESAP_KOSULU.syncEnabled).toBe(true);
    expect(SUPURME_HESAP_KOSULU.status.in).toEqual(['active', 'paused']);
    expect(SUPURME_HESAP_KOSULU.connection.status).toBe('active');
    expect(SUPURME_HESAP_KOSULU.client.status).toBe('active');
  });
});

describe('supurmeDisiSebep', () => {
  const SAGLAM = {
    syncEnabled: true,
    status: 'active',
    connection: { status: 'active' },
    client: { status: 'active' as string | null } as { status: string } | null,
  };

  it('her şey yolundaysa sebep YOK', () => {
    expect(supurmeDisiSebep({ ...SAGLAM })).toBeNull();
  });

  it('duraklatılmış hesap süpürmeye GİRİYOR — paused geçerli bir durum', () => {
    expect(supurmeDisiSebep({ ...SAGLAM, status: 'paused' })).toBeNull();
  });

  it("hesabın platform durumu 'unknown' ise sebep bunu ve elle/otomatik FARKINI söylüyor", () => {
    const sebep = supurmeDisiSebep({ ...SAGLAM, status: 'unknown' });
    expect(sebep).toContain('unknown');
    // Kullanıcının gördüğü belirti "elle basınca geliyor" — cümle bunu
    // karşılamazsa teşhis yine kullanıcıya kalır.
    expect(sebep).toContain('Şimdi güncelle');
  });

  it('kapatılmış hesap eleniyor', () => {
    expect(supurmeDisiSebep({ ...SAGLAM, status: 'disabled' })).toContain('disabled');
  });

  it('SIRA: izleme kapalıysa diğer engeller yazılmıyor — önce düzeltilebilir olan', () => {
    // Üç engel birden var. Kullanıcının tek tıkla çözebileceği olan yazılmalı;
    // "hesap platformda kapatılmış" demek onu Ads Manager'a gönderirdi ve
    // asıl sebep izlemenin kapalı olması olurdu.
    const sebep = supurmeDisiSebep({
      syncEnabled: false,
      status: 'disabled',
      connection: { status: 'needs_reauth' },
      client: { status: 'archived' },
    });
    expect(sebep).toContain('İzleme kapalı');
  });

  it('atanmamış hesap ayrı bir cümle alıyor — bağlantı hatasıyla karışmamalı', () => {
    expect(supurmeDisiSebep({ ...SAGLAM, client: null })).toContain('atanmamış');
  });

  it('bağlantı yeniden yetki istiyorsa durum cümlede GEÇİYOR', () => {
    const sebep = supurmeDisiSebep({ ...SAGLAM, connection: { status: 'needs_reauth' } });
    expect(sebep).toContain('needs_reauth');
  });
});
