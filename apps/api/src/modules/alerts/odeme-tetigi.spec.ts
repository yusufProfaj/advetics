import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { OdemeMailiGonderici } from './odeme-maili-gonderici.service';
import { OdemeTetigiService } from './odeme-tetigi.service';

/**
 * ═══ ÖDEME TETİĞİ ═══
 *
 * Sınanan şey KARAR: ne zaman mail gidiyor, ne zaman gitmiyor, aynı sorun
 * için iki kez gidiyor mu, mail gidemezse sorun kayboluyor mu.
 *
 * Veritabanı bellek içi bir sahte ve bilerek küçük: yalnızca servisin
 * kullandığı iki çağrıyı (`findMany`, `updateMany`) ve `updateMany`nin
 * KOŞULLU yazma anlamını taklit ediyor — `WHERE payment_alerted_at IS NULL`
 * eşleşmezse satır değişmiyor ve `count` 0 dönüyor. Kapma mantığının
 * tamamı bu anlama dayanıyor; taklit onu tek deyimde, bölmeden uyguluyor.
 */

interface Satir {
  id: string;
  name: string;
  platform: 'meta' | 'google';
  raw: Record<string, unknown>;
  clientId: string | null;
  clientStatus: 'active' | 'archived';
  paymentAlertedAt: Date | null;
}

let satirlar: Map<string, Satir>;
let mailler: Array<{ konu: string; html: string }>;
let mailPatlar: boolean;
let svc: OdemeTetigiService;

type Kosul = null | { not: null } | Date | undefined;

function kosulTutar(deger: Date | null, k: Kosul): boolean {
  if (k === undefined) return true;
  if (k === null) return deger === null;
  if (k instanceof Date) return deger !== null && deger.getTime() === k.getTime();
  return deger !== null;
}

function sahteAdmin(): PrismaAdminService {
  return {
    adAccount: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .map((id) => satirlar.get(id))
          .filter((s): s is Satir => s !== undefined)
          .map((s) => ({
            id: s.id,
            name: s.name,
            platform: s.platform,
            status: 'paused',
            syncEnabled: true,
            lastInsightsSyncAt: new Date(),
            lastStructureSyncAt: new Date(),
            updatedAt: new Date(),
            raw: s.raw,
            clientId: s.clientId,
            paymentAlertedAt: s.paymentAlertedAt,
            client: s.clientId ? { name: `WS-${s.id}`, status: s.clientStatus } : null,
            connection: { status: 'active', tokenExpiresAt: null },
          })),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string | { in: string[] }; paymentAlertedAt?: Kosul };
        data: { paymentAlertedAt: Date | null };
      }) => {
        const idler = typeof where.id === 'string' ? [where.id] : where.id.in;
        let count = 0;
        for (const id of idler) {
          const s = satirlar.get(id);
          if (!s || !kosulTutar(s.paymentAlertedAt, where.paymentAlertedAt)) continue;
          s.paymentAlertedAt = data.paymentAlertedAt;
          count++;
        }
        return { count };
      },
    },
  } as unknown as PrismaAdminService;
}

function ekle(s: Partial<Satir> & { id: string }): void {
  satirlar.set(s.id, {
    name: `Hesap ${s.id}`,
    platform: 'meta',
    raw: { account_status: 1 },
    clientId: 'ws',
    clientStatus: 'active',
    paymentAlertedAt: null,
    ...s,
  });
}

beforeEach(() => {
  satirlar = new Map();
  mailler = [];
  mailPatlar = false;
  const mail = {
    gonder: async (konu: string, html: string) => {
      if (mailPatlar) throw new Error('535 kimlik doğrulanamadı');
      mailler.push({ konu, html });
      return { alici: 'ajans@ornek.com' };
    },
  } as unknown as OdemeMailiGonderici;
  svc = new OdemeTetigiService(sahteAdmin(), mail);
});

describe('sorun görüldüğü AN mail', () => {
  it('KRİTİK: Meta ödenmemiş bakiye (3) — mail gidiyor, damga basılıyor', async () => {
    ekle({ id: 'a', raw: { account_status: 3 } });
    const r = await svc.degerlendir(['a']);
    expect(r.yeni).toBe(1);
    expect(mailler).toHaveLength(1);
    expect(satirlar.get('a')!.paymentAlertedAt).not.toBeNull();
  });

  it('Meta ödeme bekliyor (8) ve ek süre (9) de ödeme sorunu', async () => {
    ekle({ id: 'a', raw: { account_status: 8 } });
    ekle({ id: 'b', raw: { account_status: 9 } });
    expect((await svc.degerlendir(['a', 'b'])).yeni).toBe(2);
    // İKİ HESAP TEK MAİL: aynı tazelemede görülen sorunlar birlikte gidiyor.
    expect(mailler).toHaveLength(1);
  });

  it('Google askıya alınmış hesap', async () => {
    ekle({ id: 'g', platform: 'google', raw: { status: 'SUSPENDED' } });
    expect((await svc.degerlendir(['g'])).yeni).toBe(1);
  });

  it('KRİTİK: tek hesapta konu hesabın ve workspace’in ADINI taşıyor', async () => {
    ekle({ id: 'a', name: 'Mia Yapı Meta', raw: { account_status: 3 } });
    await svc.degerlendir(['a']);
    expect(mailler[0]!.konu).toContain('Mia Yapı Meta');
    expect(mailler[0]!.konu).toContain('WS-a');
  });
});

describe('mail GİTMEYEN hâller', () => {
  it('sağlıklı hesap', async () => {
    ekle({ id: 'a' });
    expect((await svc.degerlendir(['a'])).yeni).toBe(0);
    expect(mailler).toHaveLength(0);
  });

  it('risk incelemesi (7) ödeme sorunu DEĞİL — kullanıcıyı olmayan borcu aramaya göndermez', async () => {
    ekle({ id: 'a', raw: { account_status: 7 } });
    await svc.degerlendir(['a']);
    expect(mailler).toHaveLength(0);
  });

  it('havuzdaki (atanmamış) ve arşivli workspace’in hesabı', async () => {
    ekle({ id: 'a', raw: { account_status: 3 }, clientId: null });
    ekle({ id: 'b', raw: { account_status: 3 }, clientStatus: 'archived' });
    await svc.degerlendir(['a', 'b']);
    expect(mailler).toHaveLength(0);
  });

  it('boş liste veritabanına bile gitmiyor', async () => {
    expect((await svc.degerlendir([])).yeni).toBe(0);
  });
});

describe('AYNI SORUN İÇİN İKİ MAİL YOK', () => {
  it('KRİTİK: sorun sürerken ikinci kontrol mail atmıyor', async () => {
    ekle({ id: 'a', raw: { account_status: 3 } });
    await svc.degerlendir(['a']);
    const ikinci = await svc.degerlendir(['a']);
    expect(ikinci.yeni).toBe(0);
    expect(mailler).toHaveLength(1);
  });

  it('KRİTİK: aynı anda koşan iki yol (bağlantı dönüşü + nabız) TEK mail atıyor', async () => {
    ekle({ id: 'a', raw: { account_status: 3 } });
    const [x, y] = await Promise.all([svc.degerlendir(['a']), svc.degerlendir(['a'])]);
    expect(x.yeni + y.yeni).toBe(1);
    expect(mailler).toHaveLength(1);
  });

  it('KRİTİK: sorun çözülünce damga kalkıyor, TEKRARLARSA yeniden uyarılıyor', async () => {
    ekle({ id: 'a', raw: { account_status: 3 } });
    await svc.degerlendir(['a']);

    satirlar.get('a')!.raw = { account_status: 1 };
    const cozum = await svc.degerlendir(['a']);
    expect(cozum.cozulen).toBe(1);
    expect(satirlar.get('a')!.paymentAlertedAt).toBeNull();

    satirlar.get('a')!.raw = { account_status: 3 };
    expect((await svc.degerlendir(['a'])).yeni).toBe(1);
    expect(mailler).toHaveLength(2);
  });
});

describe('MAİL GİDEMEZSE SORUN KAYBOLMUYOR', () => {
  it('KRİTİK: SMTP reddederse damga GERİ alınıyor ve not bunu söylüyor', async () => {
    ekle({ id: 'a', raw: { account_status: 3 } });
    mailPatlar = true;
    const r = await svc.degerlendir(['a']);
    expect(r.yeni).toBe(0);
    expect(r.not).toContain('ANLIK MAİL GÖNDERİLEMEDİ');
    expect(r.not).toContain('535');
    expect(satirlar.get('a')!.paymentAlertedAt).toBeNull();
  });

  it('KRİTİK: bir sonraki kontrol aynı hesabı yeniden deniyor', async () => {
    ekle({ id: 'a', raw: { account_status: 3 } });
    mailPatlar = true;
    await svc.degerlendir(['a']);
    mailPatlar = false;
    expect((await svc.degerlendir(['a'])).yeni).toBe(1);
    expect(mailler).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Bağlantılar — kaynak taraması
// ---------------------------------------------------------------------------

const yorumsuz = (yol: string): string =>
  readFileSync(resolve(__dirname, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const BAGLANTI = yorumsuz('../connections/connections.service.ts');
const OZET = yorumsuz('hesap-durumu-kontrol.service.ts');
const ZAMANLAYICI = yorumsuz('../../queue/sync-queue.service.ts');
const ISLEYICI = yorumsuz('../../queue/sync-processor.service.ts');

/**
 * Bir sınıf metodunun gövdesi — imzadan metodun KENDİ kapanışına kadar.
 *
 * Süslü parantez saymak burada yanlış yerde başlıyordu: dönüş tipi
 * (`Promise<{ hesap: number }>`) da süslü parantez taşıyor. Metot kapanışı
 * iki boşluk girintili `}` ve sınıf gövdesinde başka hiçbir şey o girintiyle
 * kapanmıyor.
 */
function govde(kaynak: string, bas: string): string {
  const i = kaynak.indexOf(bas);
  if (i < 0) throw new Error(`"${bas}" bulunamadı — tarama boşa düşerdi`);
  const son = kaynak.indexOf('\n  }\n', i);
  if (son < 0) throw new Error(`"${bas}" gövdesi kapanmadı`);
  return kaynak.slice(i, son + 4);
}

describe('tetik hesap durumunun YAZILDIĞI her yolda', () => {
  it('keşif: upsert döngüsünden SONRA, yazılan kimliklerle', () => {
    const g = govde(BAGLANTI, 'private async discoverAndStore(');
    const dongu = g.indexOf('yazilanHesaplar.push(yazilan.id)');
    const tetik = g.indexOf('await this.odemeTetiginiCek(yazilanHesaplar)');
    expect(dongu).toBeGreaterThan(-1);
    expect(tetik).toBeGreaterThan(dongu);
  });

  it('nabız: durumları yazdıktan SONRA, okunan her hesap için', () => {
    const g = govde(BAGLANTI, 'async odemeDurumlariniTazele(');
    const yaz = g.indexOf('data: { status: d.status, raw: yeniRaw as Prisma.InputJsonValue }');
    const tetik = g.indexOf('this.odemeTetiginiCek(hesaplar.map((h) => h.id))');
    expect(yaz).toBeGreaterThan(-1);
    expect(tetik).toBeGreaterThan(yaz);
  });

  it('KRİTİK: nabız ham alanı BİRLEŞTİRİYOR — keşfin yazdığını silmiyor', () => {
    const g = govde(BAGLANTI, 'async odemeDurumlariniTazele(');
    expect(g).toContain('const yeniRaw = { ...eskiRaw, ...d.rawYama };');
  });

  it('nabız yalnızca ATANMIŞ, aktif workspace’li ve canlı bağlantılı hesapları soruyor', () => {
    const g = govde(BAGLANTI, 'async odemeDurumlariniTazele(');
    expect(g).toContain('clientId: { not: null }');
    expect(g).toContain("client: { status: 'active' }");
    expect(g).toContain("connection: { status: 'active', revokedAt: null }");
  });

  it('desteklemeyen sağlayıcı SESSİZ atlanmıyor — notta yazıyor', () => {
    const g = govde(BAGLANTI, 'async odemeDurumlariniTazele(');
    expect(g).toContain('nabız desteklenmiyor:');
  });

  it('not 500 karakteri AŞMIYOR — aşan yazma Postgres’te işi düşürür', () => {
    const g = govde(BAGLANTI, 'async odemeDurumlariniTazele(');
    expect(g).toContain('not.slice(0, 500)');
  });
});

describe('özet ve anlık mail AYNI kararı ve AYNI göndericiyi kullanıyor', () => {
  it('özet `odemeUyarisi` ile karar veriyor — kendi kuralını yazmıyor', () => {
    expect(OZET).toContain('odemeUyarisi(h, simdi)');
    expect(OZET).not.toContain("u.kod === 'hesap_odeme_sorunu'");
  });

  it('özet de `OdemeMailiGonderici` üzerinden gönderiyor', () => {
    expect(OZET).toContain('this.mail.gonder(konu, html)');
    expect(OZET).not.toContain('mailGonder(');
  });
});

describe('ÖDEME NABZI zamanlanmış ve yönlendirilmiş', () => {
  it('15 dakikada bir kuruluyor', () => {
    expect(ZAMANLAYICI).toContain(
      "{ name: 'sweep:payment-check', pattern: '11,26,41,56 * * * *', jobType: 'payment_check' }",
    );
  });

  it('işleyici nabza gidiyor — hesap döngüsüne düşmüyor', () => {
    const g = govde(ISLEYICI, 'private async fanOut(');
    const nabiz = g.indexOf("if (payload.jobType === 'payment_check') return this.hesapDurumu.nabiz();");
    expect(nabiz).toBeGreaterThan(-1);
    expect(nabiz).toBeLessThan(g.indexOf('const accounts = await this.db.adAccount.findMany('));
  });

  it('enum değeri AYRI migration’da — aynı transaction’da kullanılamaz', () => {
    const sql = readFileSync(
      resolve(__dirname, '../../../prisma/migrations/20260925090000_payment_check_job_type/migration.sql'),
      'utf8',
    );
    const deyimler = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--') && l.trim() !== '');
    expect(deyimler).toEqual([`ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'payment_check';`]);
  });
});
