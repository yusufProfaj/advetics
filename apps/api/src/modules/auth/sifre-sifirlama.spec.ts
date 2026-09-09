import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../config/configuration';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { TenantContextService } from './tenant-context.service';
import type { TokenService } from './token.service';
import { sifirlamaBaglantisi, sifirlamaMailiOlustur } from './sifre-sifirlama-maili';
/*
 * DÜZ IMPORT — `await import(...)` DEĞİL. `vi.mock` çağrısı vitest tarafından
 * import'ların ÜSTÜNE taşınıyor, yani statik import da taklit edilmiş modülü
 * alıyor. Üst seviye `await` ise `tsconfig.spec.json`un modül hedefiyle
 * uyuşmuyor ve `pnpm typecheck` kırmızı veriyordu — vitest yeşil koştuğu için
 * fark yalnızca typecheck'te görünen türden.
 */
import { AuthService } from './auth.service';

/*
 * SMTP GÖNDERİMİ TAKLİT EDİLİYOR — gerçek bir mail sunucusuna bağlanmak
 * testleri ağa bağımlı yapardı ve paylaşımlı sunucuda koşan bir test
 * paketinin dışarıya mail atması kabul edilemez.
 */
const { gonderilenler, gonderimHatasi } = vi.hoisted(() => ({
  gonderilenler: [] as Array<{ kimlik: unknown; mail: { to: readonly string[]; html: string } }>,
  gonderimHatasi: { deger: null as Error | null },
}));

vi.mock('../email/mail-gonderici', () => ({
  mailGonder: async (kimlik: unknown, mail: { to: readonly string[]; html: string }) => {
    if (gonderimHatasi.deger) throw gonderimHatasi.deger;
    gonderilenler.push({ kimlik, mail });
    return { kabul: [...mail.to], ret: [] };
  },
}));

// ---------------------------------------------------------------------------

describe('sifirlamaBaglantisi', () => {
  it('KRİTİK: token bağlantıda ve sayfa /sifre-sifirla', () => {
    // Adres `middleware.ts` içindeki PUBLIC_PATHS ile AYNI olmak zorunda;
    // ayrışırsa link kullanıcıyı /login'e atar ve sıfırlama hiç açılmaz.
    const b = sifirlamaBaglantisi('https://advetics.com', 'AbC-123_xyz');
    expect(b).toBe('https://advetics.com/sifre-sifirla?token=AbC-123_xyz');
  });

  it('sondaki eğik çizgi ÇİFTLENMİYOR', () => {
    // `APP_URL="https://advetics.com/"` yazan biri çift eğik çizgili bir
    // adres üretirdi; Next.js onu yönlendirir ama bazı mail istemcileri
    // bağlantıyı bozuk gösterir.
    expect(sifirlamaBaglantisi('https://advetics.com/', 't')).toBe(
      'https://advetics.com/sifre-sifirla?token=t',
    );
  });

  it('URL güvenli olmayan karakterler kodlanıyor', () => {
    expect(sifirlamaBaglantisi('https://a.com', 'a+b/c=')).toBe(
      'https://a.com/sifre-sifirla?token=a%2Bb%2Fc%3D',
    );
  });
});

describe('sifirlamaMailiOlustur', () => {
  it('KRİTİK: bağlantı hem düğmede hem DÜZ METİN olarak gövdede', () => {
    /*
     * Kurumsal mail istemcilerinin bir kısmı düğmeleri/`<a>`yı bozuyor.
     * Adresin okunabilir hâli gövdede yoksa kullanıcının yapabileceği
     * hiçbir şey kalmıyor.
     */
    const { html, baglanti } = sifirlamaMailiOlustur('https://advetics.com', 'TOKEN123');
    expect(html).toContain(`href="${baglanti}"`);
    expect(html.split(baglanti).length - 1).toBeGreaterThanOrEqual(2);
  });

  it('geçerlilik süresi gövdede yazıyor', () => {
    const { html } = sifirlamaMailiOlustur('https://a.com', 't');
    expect(html).toContain('60 dakika');
  });

  it('token KONUDA geçmiyor — konu satırı loglara ve önizlemelere düşüyor', () => {
    const { konu } = sifirlamaMailiOlustur('https://a.com', 'GIZLI-TOKEN');
    expect(konu).not.toContain('GIZLI-TOKEN');
  });
});

// ---------------------------------------------------------------------------

const SMTP = {
  host: 'smtp.example.com',
  port: 465,
  secure: true,
  user: 'u',
  pass: 'p',
  fromEmail: 'noreply@advetics.com',
  fromName: 'Advetics',
};

function servis(opts: {
  smtpVar: boolean;
  uretim: boolean;
  kullaniciVar: boolean;
}) {
  const aranmisEmailler: string[] = [];
  const denetimKayitlari: string[] = [];

  const config = {
    isProduction: opts.uretim,
    mail: {
      appUrl: 'https://advetics.com',
      smtp: opts.smtpVar ? SMTP : null,
      eksikSmtpDegiskenleri: opts.smtpVar ? [] : ['SMTP_HOST', 'SMTP_PASS'],
    },
  } as unknown as AppConfig;

  const admin = {
    user: {
      findFirst: async (args: { where: { email: string } }) => {
        aranmisEmailler.push(args.where.email);
        return opts.kullaniciVar ? { id: 'u1', orgId: 'o1' } : null;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<void>) =>
      fn({
        passwordResetToken: {
          updateMany: async () => ({ count: 0 }),
          create: async () => ({ id: 'prt' }),
        },
      }),
  } as unknown as PrismaAdminService;

  const audit = {
    recordUnauthenticated: async (_orgId: string, entry: { action: string }) => {
      denetimKayitlari.push(entry.action);
    },
  } as unknown as AuditService;

  const auth = new AuthService(
    admin,
    {} as unknown as PrismaService,
    {} as unknown as TokenService,
    {} as unknown as TenantContextService,
    audit,
    config,
  );

  return { auth, aranmisEmailler, denetimKayitlari };
}

describe('requestPasswordReset', () => {
  beforeEach(() => {
    gonderilenler.length = 0;
    gonderimHatasi.deger = null;
  });

  it('KRİTİK: kayıtlı adrese mail GERÇEKTEN gönderiliyor', () => {
    /*
     * Bu akış bir kez ölü doğdu: token üretiliyor, hash'leniyor ve düz metni
     * ATILIYORDU. Ekran "gönderildi" diyor, kullanıcıya hiçbir şey gitmiyordu.
     */
    const { auth } = servis({ smtpVar: true, uretim: true, kullaniciVar: true });
    return auth.requestPasswordReset('kisi@ornek.com', {}).then(() => {
      expect(gonderilenler).toHaveLength(1);
      expect(gonderilenler[0]?.mail.to).toEqual(['kisi@ornek.com']);
      expect(gonderilenler[0]?.mail.html).toContain('https://advetics.com/sifre-sifirla?token=');
    });
  });

  it('kayıtsız adreste mail gitmiyor ama HATA DA VERİLMİYOR', async () => {
    // Aksi hâlde uç nokta bir e-posta numaralandırma aracına dönüşür.
    const { auth } = servis({ smtpVar: true, uretim: true, kullaniciVar: false });
    await expect(auth.requestPasswordReset('yok@ornek.com', {})).resolves.toEqual({});
    expect(gonderilenler).toHaveLength(0);
  });

  it('KRİTİK: SMTP eksikse üretimde AÇIKÇA hata veriyor', async () => {
    /*
     * Sessizce "gönderildi" demek, kullanıcının olmayan bir maili
     * beklemesi demek. Mesaj EKSİK DEĞİŞKEN ADINI taşıyor: arıza sunucuya
     * girmeden teşhis edilebilsin.
     */
    const { auth } = servis({ smtpVar: false, uretim: true, kullaniciVar: true });
    await expect(auth.requestPasswordReset('kisi@ornek.com', {})).rejects.toThrow(/SMTP_HOST/);
  });

  it('KRİTİK: SMTP kontrolü KULLANICI ARAMASINDAN ÖNCE — numaralandırma yok', async () => {
    /*
     * Kontrol aramadan sonra olsaydı hata mesajı kusursuz bir oracle olurdu:
     * kayıtlı adres hata alır, kayıtsız adres "gönderildi" alırdı.
     */
    const { auth, aranmisEmailler } = servis({
      smtpVar: false,
      uretim: true,
      kullaniciVar: true,
    });
    await expect(auth.requestPasswordReset('kisi@ornek.com', {})).rejects.toThrow();
    expect(aranmisEmailler).toEqual([]);
  });

  it('gönderim düşerse kullanıcıya yansımıyor ama DENETİME yazılıyor', async () => {
    /*
     * Yansıtmak yine numaralandırma açardı (hata yalnızca KAYITLI adreste
     * çıkabiliyor). Sessiz de kalmıyor: log + `password.reset_mail_failed`.
     */
    gonderimHatasi.deger = new Error('535 auth failed');
    const { auth, denetimKayitlari } = servis({
      smtpVar: true,
      uretim: true,
      kullaniciVar: true,
    });

    await expect(auth.requestPasswordReset('kisi@ornek.com', {})).resolves.toEqual({});
    expect(denetimKayitlari).toContain('password.reset_mail_failed');
  });

  it('geliştirmede SMTP yoksa akış ÇALIŞIYOR ve token dönüyor', async () => {
    // Yerelde kimse SMTP kurmuyor; akışın hiç denenememesi, sıfırlama
    // sayfasının canlıda ilk kez sınanması demek olurdu.
    const { auth } = servis({ smtpVar: false, uretim: false, kullaniciVar: true });
    const r = await auth.requestPasswordReset('kisi@ornek.com', {});
    expect(typeof r.devToken).toBe('string');
    expect(gonderilenler).toHaveLength(0);
  });
});
