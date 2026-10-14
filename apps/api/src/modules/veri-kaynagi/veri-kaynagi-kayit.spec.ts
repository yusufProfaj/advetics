import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KAYNAK_DURUMLARI, KAYNAK_SUPURMELERI, KAYNAK_TABLOLARI, KAYNAK_TURLERI, KAYNAK_UCLARI } from '@advetics/shared';
import { CASCADE_ILE_TASINANLAR, WORKSPACE_TABLOLARI } from '../manager-account/workspace-tasima';
import { HESABIN_KENDI_VERISI } from '../connections/hesap-verisi-tasima';

/**
 * ═══ VERİ KAYNAKLARI — KAYIT, LİSTE VE KAYNAK TARAMALARI ═══
 *
 * Derleme ve birim testi bunların hiçbirini görmüyor: CHECK listesi ile
 * shared listesi ayrışırsa INSERT üretimde patlar; Nest kaydı eksikse
 * açılışta patlar; rota izni kayarsa TypeScript susar ve müşteri hesabı
 * bağlantı ekranını açar. Taramalar YORUMSUZ kaynakta yapılıyor (CLAUDE.md
 * "TARAMAYI YORUMSUZ KAYNAKTA YAP") ve dilim bulunamazsa HATA FIRLATIYOR.
 */
const oku = (yol: string) => readFileSync(join(__dirname, yol), 'utf8');
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const MIG = oku('../../../prisma/migrations/20261014200000_veri_kaynagi/migration.sql');
const ENUM_MIG = oku('../../../prisma/migrations/20261014200100_veri_kaynagi_is_turleri/migration.sql');
const F1_TABLOLARI = KAYNAK_TABLOLARI.filter((t) => t.paket === 'F1').map((t) => t.tablo);

function checkListesi(kisit: string): string[] {
  const i = MIG.indexOf(`"${kisit}" CHECK`);
  if (i < 0) throw new Error(`${kisit} bulunamadı, tarama boşa düşerdi`);
  const son = MIG.indexOf('))', i);
  return [...MIG.slice(i, son).matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]!);
}

describe('CHECK listeleri = shared listeleri (iki yönlü)', () => {
  it('KRİTİK: tur ve durum kısıtları', () => {
    expect(checkListesi('veri_kaynaklari_tur_chk')).toEqual([...KAYNAK_TURLERI]);
    expect(checkListesi('veri_kaynaklari_durum_chk')).toEqual([...KAYNAK_DURUMLARI]);
  });

  it('enum değerleri AYRI migration\'da ve orada başka hiçbir şey yok', () => {
    const deyimler = yorumsuz(ENUM_MIG.replace(/^--.*$/gm, '')).split(';').map((s) => s.trim()).filter(Boolean);
    expect(deyimler.every((d) => /^ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS '[a-z_]+'$/.test(d))).toBe(true);
    expect(MIG).not.toMatch(/ALTER TYPE/);
  });
});

describe('üç durak (CLAUDE.md) + taşıma kararı = KAYNAK_TABLOLARI', () => {
  const harness = oku('../../../test/pglite-harness.ts');
  const rls = oku('../../../prisma/sql/02_rls.sql');
  for (const t of F1_TABLOLARI) {
    it(`KRİTİK: ${t} TRUNCATE listesinde, RLS dizisinde ve politikalı, kompozit anahtarla workspace'le taşınıyor`, () => {
      const trunc = harness.slice(harness.indexOf('TRUNCATE TABLE'), harness.indexOf('CASCADE;', harness.indexOf('TRUNCATE TABLE')));
      if (!trunc) throw new Error('TRUNCATE listesi bulunamadı');
      expect(trunc).toMatch(new RegExp(`\\b${t}\\b`));
      expect(rls).toMatch(new RegExp(`^\\s*'${t}',$`, 'm'));
      expect(rls).toMatch(new RegExp(`CREATE POLICY adv_${t}_select ON ${t}\\b`));
      expect(rls).toMatch(new RegExp(`CREATE POLICY adv_${t}_update ON ${t}\\b`));
      expect(rls).not.toMatch(new RegExp(`CREATE POLICY \\w+ ON ${t}\\s+FOR DELETE`));
      expect(CASCADE_ILE_TASINANLAR as readonly string[]).toContain(t);
      expect(WORKSPACE_TABLOLARI.map((w) => w.tablo)).not.toContain(t);
      expect(MIG).toMatch(new RegExp(`ALTER TABLE "${t}" ADD CONSTRAINT "\\w+"\\s+FOREIGN KEY \\("client_id", "org_id"\\) REFERENCES "clients"\\("id", "org_id"\\) ON DELETE CASCADE ON UPDATE CASCADE`));
    });
  }

  it('hesap taşımasına GİRMEZ (kaynak workspace\'in, hesabın değil)', () => {
    for (const t of F1_TABLOLARI) expect(JSON.stringify(HESABIN_KENDI_VERISI)).not.toContain(t);
    for (const t of KAYNAK_TABLOLARI.filter((x) => x.paket === 'F1')) expect(t.hesapTasima).toBe('dokunulmaz');
  });
});

describe('uçlar = KAYNAK_UCLARI (F1)', () => {
  const src = yorumsuz(oku('veri-kaynagi.controller.ts'));
  const rotalar = [...src.matchAll(/@(Get|Post|Delete)\((?:'([^']*)')?\)\s*@RequirePermissions\('([^']+)'\)/g)].map((m) => ({
    yontem: m[1]!.toUpperCase(),
    yol: `/veri-kaynaklari${m[2] ? `/${m[2]}` : ''}`,
    izin: m[3]!,
  }));

  it('KRİTİK: her F1 ucu yöntem, yol ve izinle BİREBİR (fazla ya da eksik yok)', () => {
    if (rotalar.length === 0) throw new Error('rota çıkarılamadı, tarama boşa düşerdi');
    const beklenen: Array<{ yontem: string; yol: string; izin: string }> = KAYNAK_UCLARI.filter((u) => u.paket === 'F1').map((u) => ({ yontem: u.yontem, yol: u.yol, izin: u.izin }));
    const sirala = (x: typeof beklenen) => [...x].sort((a, b) => `${a.yontem}${a.yol}`.localeCompare(`${b.yontem}${b.yol}`));
    expect(sirala(rotalar)).toEqual(sirala(beklenen));
    expect([...src.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)]).toHaveLength(beklenen.length);
  });
});

describe('Nest kaydı (derlemede değil açılışta patlar)', () => {
  it('KRİTİK: API modülü uygulamada, worker servisi kuyruk modülünde ve işleyiciye bağlı', () => {
    expect(yorumsuz(oku('../../app.module.ts'))).toMatch(/^\s*VeriKaynagiModule,/m);
    const mod = yorumsuz(oku('veri-kaynagi.module.ts'));
    expect(mod).toMatch(/imports:\s*\[\s*ConnectionsModule\s*\]/);
    expect(mod).toMatch(/providers:\s*\[\s*VeriKaynagiService\s*\]/);
    expect(mod).toMatch(/exports:\s*\[\s*VeriKaynagiService\s*\]/);
    const kuyruk = yorumsuz(oku('../../queue/queue.module.ts'));
    const prov = kuyruk.slice(kuyruk.indexOf('providers:'), kuyruk.indexOf('exports:'));
    if (!prov) throw new Error('providers dilimi bulunamadı');
    expect(prov).toMatch(/\bVeriKaynagiIsService\b/);
    expect(kuyruk).toMatch(/imports:\s*\[[^\]]*ConnectionsModule/);
    const islemci = yorumsuz(oku('../../queue/sync-processor.service.ts'));
    expect(islemci).toMatch(/private readonly kaynakIs: VeriKaynagiIsService/);
    expect(yorumsuz(oku('../kurulum/kurulum.module.ts'))).toMatch(/\bVeriKaynagiModule\b/);
  });

  it('KRİTİK: kaynak işi hesap yolundan ve recordFailure\'dan ÖNCE ayrılıyor (Ads kesicisine gitmesin)', () => {
    const islemci = yorumsuz(oku('../../queue/sync-processor.service.ts'));
    const bas = islemci.indexOf('async process(payload');
    if (bas < 0) throw new Error('process gövdesi bulunamadı');
    const govde = islemci.slice(bas, islemci.indexOf('\n  }', bas));
    const kaynak = govde.indexOf('this.kaynakIs.isle(payload)');
    const hesap = govde.indexOf('this.processAccountJob(payload)');
    expect(kaynak).toBeGreaterThan(0);
    expect(hesap).toBeGreaterThan(kaynak);
    expect(govde).toMatch(/err instanceof KaynakKotaReddi\) throw new QuotaThrottleError/);
  });
});

describe('zamanlayıcı = KAYNAK_SUPURMELERI', () => {
  it('KRİTİK: yapı ve günlük süpürmesi shared desenleriyle aynı; ürün süpürmesi F3\'te (işleyicisi yok)', () => {
    const src = oku('../../queue/sync-queue.service.ts');
    const bas = src.indexOf('const schedules: Array<');
    if (bas < 0) throw new Error('zamanlayıcı listesi bulunamadı');
    const dilim = yorumsuz(src.slice(bas, src.indexOf('];', bas)));
    for (const s of KAYNAK_SUPURMELERI) {
      const satir = `{ name: '${s.ad}', pattern: '${s.desen}', jobType: '${s.is}' }`;
      if (s.is === 'urun_performansi') expect(dilim).not.toContain(s.ad);
      else expect(dilim).toContain(satir);
    }
  });
});

describe('gizli kimlik ve kurulum bağı', () => {
  it('KRİTİK: servis kaynağında kimlik_enc HİÇ SEÇİLMİYOR (liste seçimi sabit)', () => {
    const src = yorumsuz(oku('veri-kaynagi.service.ts'));
    const bas = src.indexOf('const KAYNAK_LISTE_SECIMI');
    if (bas < 0) throw new Error('liste seçimi bulunamadı');
    expect(src.slice(bas, src.indexOf('`;', bas))).toMatch(/v\.dis_kimlik/);
    expect(src).not.toMatch(/kimlik_enc/);
    expect(src).not.toMatch(/SELECT \*/);
  });

  it('kurulum rehberi mülkü YAZDIKTAN SONRA okumayı bağlıyor (Ç-5)', () => {
    const src = yorumsuz(oku('../kurulum/kurulum.service.ts'));
    const bas = src.indexOf('private async mulk(');
    if (bas < 0) throw new Error('mulk gövdesi bulunamadı');
    const govde = src.slice(bas, src.indexOf('\n  }\n', bas));
    const yaz = govde.lastIndexOf('ga4_olcum_kimligi: akis.olcumKimligi');
    const bagla = govde.indexOf('this.veriKaynagi.kurulumdanBagla(');
    expect(yaz).toBeGreaterThan(0);
    expect(bagla).toBeGreaterThan(yaz);
  });

  it('KRİTİK: mülk değişince ESKİ kurulum mülkü okumaya geçiriliyor (Değiştir, 2026-10-14)', () => {
    // Parametre varsayılanı null: unutulursa derleme de servis testi de susar,
    // okuma eski mülkte kalır ve raporlar değiştirilmemiş veriyi gösterir.
    const src = yorumsuz(oku('../kurulum/kurulum.service.ts'));
    expect(src).toContain('this.veriKaynagi.kurulumdanBagla(ctx, clientId, mulkId, b.satir?.ga4MulkId ?? null)');
  });

  it('baglantiSec TEK yerde: kurulum ve veri kaynağı aynı fonksiyonu çağırıyor', () => {
    const kurulum = yorumsuz(oku('../kurulum/kurulum.service.ts'));
    expect(kurulum).toMatch(/from '\.\.\/connections\/baglanti-sec'/);
    expect(kurulum).not.toMatch(/ajansHavuzu/);
    expect(yorumsuz(oku('veri-kaynagi.service.ts'))).toMatch(/baglantiSec\(/);
  });

  it('ikinci GA4 istemcisi yok: kurulum/ga4.ts kaldırıldı, ikisi aynı sınıfı kullanıyor', () => {
    expect(() => oku('../kurulum/ga4.ts')).toThrow();
    expect(yorumsuz(oku('../kurulum/kurulum.service.ts'))).toMatch(/from '\.\.\/connections\/providers\/ga4'/);
    expect(yorumsuz(oku('veri-kaynagi-is.service.ts'))).toMatch(/from '\.\.\/connections\/providers\/ga4'/);
  });
});
