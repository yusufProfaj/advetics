import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CryptoService } from '../../crypto/crypto.service';
import { EmailAccountService } from './email-account.service';

/**
 * DANIŞMANIN E-POSTA KİMLİĞİ — GERÇEK Postgres'e karşı.
 *
 * Buradaki riskler ağır: satır bir kullanıcının uygulama parolasını taşıyor
 * ve onu okuyabilmek, o hesabın adına mail gönderebilmek demek. Testler üç
 * şeyi ayrı ayrı tutuyor: parola OKUMA YOLUNDAN DÖNMÜYOR, parola şifreli
 * yazılıyor, ve ayar değişince doğrulama düşüyor.
 */
let h: Harness;
let svc: EmailAccountService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

const GIRDI = {
  fromName: 'Yusuf Algan',
  fromEmail: 'yusuf@profaj.com',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: 'yusuf@profaj.com',
  smtpPass: 'uygulama-parolasi',
};

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);

  // Sahte şifreleme: gerçek anahtar ortam değişkeni istiyor. Sınanan şey
  // ŞİFRELEMENİN KENDİSİ değil, parolanın düz metin YAZILMAMASI ve okuma
  // yolundan DÖNMEMESİ.
  const crypto = {
    encrypt: (d: string) => Buffer.concat([Buffer.from([1]), Buffer.from(`ENC:${d}`)]),
    decrypt: (b: Buffer) => b.subarray(1).toString().replace(/^ENC:/, ''),
    keyVersionOf: (b: Buffer) => b[0] as number,
  } as unknown as CryptoService;

  svc = new EmailAccountService(
    { withTenant: async <T>(_c: TenantContext, fn: (t: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService,
    crypto,
  );
});

describe('kaydetme', () => {
  it('ayar kaydediliyor ve geri okunuyor', async () => {
    await svc.upsert(CTX, GIRDI);
    const a = await svc.get(CTX);
    expect(a?.fromEmail).toBe('yusuf@profaj.com');
    expect(a?.smtpHost).toBe('smtp.gmail.com');
    expect(a?.smtpPort).toBe(465);
  });

  it('KRİTİK: PAROLA okuma yolundan DÖNMÜYOR', async () => {
    await svc.upsert(CTX, GIRDI);
    const a = await svc.get(CTX);
    expect(JSON.stringify(a)).not.toContain('uygulama-parolasi');
    expect(a?.hasPassword).toBe(true);
  });

  it('KRİTİK: parola veritabanına DÜZ METİN yazılmıyor', async () => {
    await svc.upsert(CTX, GIRDI);
    const [row] = await h.q<{ p: string }>(
      "SELECT encode(smtp_pass_enc, 'escape') AS p FROM user_email_accounts WHERE user_id = $1",
      [IDS.user],
    );
    expect(row!.p).not.toBe('uygulama-parolasi');
    expect(row!.p).toContain('ENC:');
  });

  it('PAROLA BOŞSA mevcut korunuyor — imza güncellemek parola istememeli', async () => {
    await svc.upsert(CTX, GIRDI);
    await svc.upsert(CTX, { ...GIRDI, smtpPass: undefined, fromName: 'Yusuf A.' });
    const [row] = await h.q<{ p: string }>(
      "SELECT encode(smtp_pass_enc, 'escape') AS p FROM user_email_accounts WHERE user_id = $1",
      [IDS.user],
    );
    expect(row!.p).toContain('uygulama-parolasi');
    expect((await svc.get(CTX))?.fromName).toBe('Yusuf A.');
  });

  it('İLK kayıtta parola ZORUNLU — parolasız mail gönderilemez', async () => {
    await expect(svc.upsert(CTX, { ...GIRDI, smtpPass: undefined })).rejects.toThrow(
      /parola/i,
    );
  });

  it('kayıt yoksa null dönüyor — uydurma varsayılan YOK', async () => {
    expect(await svc.get(CTX)).toBeNull();
  });
});

describe('imza', () => {
  it('KRİTİK: imza TEMİZLENMİŞ hâliyle saklanıyor', async () => {
    // Temizlik girişte: saklanan şey gönderilecek şey olmalı, yoksa
    // önizleme yalan söyler.
    await svc.upsert(CTX, {
      ...GIRDI,
      signatureHtml: '<p>Yusuf</p><script>alert(1)</script>',
    });
    const a = await svc.get(CTX);
    expect(a?.signatureHtml).toBe('<p>Yusuf</p>');
  });

  it('temizlikte NE ATILDIĞI dönüyor', async () => {
    const r = await svc.upsert(CTX, {
      ...GIRDI,
      signatureHtml: '<p onclick="x">a</p><script>y</script>',
    });
    expect(r.signature.removedTags).toContain('script');
    expect(r.signature.removedAttributes).toContain('onclick');
  });

  it('Gmail proxy görselleri çevriliyor ve SAYISI dönüyor', async () => {
    const r = await svc.upsert(CTX, {
      ...GIRDI,
      signatureHtml:
        '<img src="https://ci3.googleusercontent.com/meips/A=s0-d-e1-ft#https://profaj.com/sign/logo.jpg" />',
    });
    expect(r.signature.rewrittenImages).toBe(1);
    expect((await svc.get(CTX))?.signatureHtml).toContain('https://profaj.com/sign/logo.jpg');
  });
});

describe('doğrulama', () => {
  it('KRİTİK: AYAR DEĞİŞİNCE doğrulama DÜŞÜYOR', async () => {
    /*
     * Sunucu adresi ya da parola değiştiğinde eski "doğrulandı" damgası
     * artık hiçbir şey söylemiyor. Damgayı bırakmak, yanlış bir SMTP
     * kimliğiyle "doğrulanmış" görünen bir hesaptan müşteriye rapor
     * göndermeye çalışmak demek olurdu.
     */
    await svc.upsert(CTX, GIRDI);
    await h.q('UPDATE user_email_accounts SET verified_at = now() WHERE user_id = $1', [IDS.user]);
    expect((await svc.get(CTX))?.verifiedAt).not.toBeNull();

    await svc.upsert(CTX, { ...GIRDI, smtpHost: 'baska.sunucu' });
    expect((await svc.get(CTX))?.verifiedAt).toBeNull();
  });

  it('ayar yokken doğrulama isteği açık bir hata veriyor', async () => {
    await expect(svc.verify(CTX)).rejects.toThrow(/önce/i);
  });

  it('SMTP düşerse hata SAKLANIYOR ve doğrulama açılmıyor', async () => {
    // Hata mesajı olduğu gibi saklanıyor: "kimlik doğrulanamadı" ile
    // "bağlantı reddedildi" farklı işler.
    await svc.upsert(CTX, { ...GIRDI, smtpHost: 'olmayan.sunucu.gecersiz', smtpPort: 1 });
    const r = await svc.verify(CTX);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
    const a = await svc.get(CTX);
    expect(a?.verifiedAt).toBeNull();
    expect(a?.lastError).toBeTruthy();
  }, 30_000);
});
