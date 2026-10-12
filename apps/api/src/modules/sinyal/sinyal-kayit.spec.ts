import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANOMALI_METRIKLERI,
  BILDIRIM_OLAYLARI,
  KANAL_TURLERI,
  SAGLIK_KONTROLLERI,
  SINYAL_DURUMLARI,
  SINYAL_KAPATMA_NEDENLERI,
  SINYAL_TURLERI,
  SINYAL_UCLARI,
  TESLIM_DURUMLARI,
} from '@advetics/shared';

/**
 * ═══ KAYNAK TARAMALARI — derlemenin göremediği bağlar ═══
 *
 * 1. Uçlar ve izinler `SINYAL_UCLARI` ile BİREBİR (izin düz dize: kayarsa
 *    TypeScript susar, müşteri hesabı ekranı açar).
 * 2. Nest modül kaydı AÇILIŞTA patlar, derlemede değil.
 * 3. Şifreli webhook adresini (`hedef_enc`) yalnız yazma yolu ve teslim
 *    servisi görüyor; liste sorgusu seçmiyor.
 * 4. Uygula'da özet kapısı platform çağrısından ÖNCE.
 * 5. CHECK listeleri = shared listeleri (ayrışırsa INSERT üretimde patlar).
 *
 * Taramalar YORUMSUZ kaynakta: kuralı anlatan yorum eşleşip testi yeşil
 * bırakmasın (CLAUDE.md).
 */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');
const oku = (yol: string) => yorumsuz(readFileSync(join(__dirname, yol), 'utf8'));

describe('uçlar ve izinler', () => {
  it('KRİTİK: iki controller SINYAL_UCLARI ile eksiksiz ve fazlasız', () => {
    const bulunan: Record<string, string> = {};
    let rotaSayisi = 0;
    for (const [dosya, kok] of [
      ['sinyal.controller.ts', '/sinyaller'],
      ['bildirim.controller.ts', '/bildirim'],
    ] as const) {
      const src = oku(dosya);
      expect(src).toContain(`@Controller('${kok.slice(1)}')`);
      rotaSayisi += [...src.matchAll(/@(Get|Post|Put|Patch|Delete)\(/g)].length;
      for (const m of src.matchAll(/@(Get|Post|Patch|Delete)\((?:'([^']*)')?\)\s*@RequirePermissions\('([^']+)'\)/g)) {
        bulunan[`${m[1]!.toUpperCase()} ${kok}${m[2] ? `/${m[2]}` : ''}`] = m[3]!;
      }
    }
    const beklenen = Object.fromEntries(SINYAL_UCLARI.map((u) => [`${u.yontem} ${u.yol}`, u.izin]));
    expect(rotaSayisi).toBe(SINYAL_UCLARI.length);
    expect(bulunan).toEqual(beklenen);
  });
});

describe('Nest kaydı', () => {
  it('KRİTİK: SinyalModule AppModule’de; SinyalIsModule QueueModule’de; bağımlılıklar içe alınmış', () => {
    const app = oku('../../app.module.ts');
    expect(app).toMatch(/import \{ SinyalModule \} from '\.\/modules\/sinyal\/sinyal\.module'/);
    expect(app).toMatch(/\bSinyalModule,/);
    const kuyruk = oku('../../queue/queue.module.ts');
    expect(kuyruk).toMatch(/imports:\s*\[[^\]]*\bSinyalIsModule\b/);
    const modul = oku('sinyal.module.ts');
    expect(modul).toMatch(/imports:\s*\[CampaignActionsModule, SinyalIsModule\]/);
    expect(modul).toMatch(/controllers:\s*\[SinyalController, BildirimController\]/);
    expect(modul).toMatch(/providers:\s*\[SinyalService, BildirimService\]/);
    const is = oku('sinyal-is.module.ts');
    expect(is).toMatch(/providers:\s*\[SinyalHesapService, BildirimTeslimService\]/);
    expect(is).toMatch(/exports:\s*\[SinyalHesapService, BildirimTeslimService\]/);
    expect(oku('../campaign-actions/campaign-actions.module.ts')).toMatch(/exports:\s*\[[^\]]*\bCampaignActionsService\b/);
  });
});

describe('şifreli adres', () => {
  it('KRİTİK: hedef_enc YALNIZ yazma (INSERT/UPDATE) ve teslim yolunda geçiyor; liste kolonlarında yok', () => {
    const servis = oku('bildirim.service.ts');
    const bas = servis.indexOf('const KANAL_KOLONLARI');
    if (bas < 0) throw new Error('KANAL_KOLONLARI bulunamadı — tarama boşa düşerdi');
    const kolonlar = servis.slice(bas, servis.indexOf('`;', bas));
    expect(kolonlar).toContain('hedef_ipucu');
    expect(kolonlar).not.toContain('hedef_enc');
    // hedef_enc geçen her satır bir yazma (INSERT kolon listesi ya da SET).
    const satirlar = servis.split('\n').filter((l) => l.includes('hedef_enc'));
    expect(satirlar.length).toBeGreaterThan(0);
    for (const l of satirlar) expect(l, l).toMatch(/INSERT INTO bildirim_kanallari|hedef_enc = coalesce/);
    // Modülde hedef_enc okuyan başka dosya yok.
    for (const f of readdirSync(__dirname).filter((x) => x.endsWith('.ts') && !x.endsWith('.spec.ts'))) {
      if (['bildirim.service.ts', 'bildirim-teslim.service.ts'].includes(f)) continue;
      expect(oku(f), f).not.toContain('hedef_enc');
    }
  });
});

describe('gönderen kimliği (Ajan 4, N-g)', () => {
  it('KRİTİK: kanal listesi gönderenin YALNIZ adresini okuyor; şifreli parola belleğe girmiyor', () => {
    const servis = oku('bildirim.service.ts');
    expect(servis).toContain('epostaGonderenAdresi(');
    expect(servis).not.toMatch(/\bepostaGonderen\(/);
    const kaynak = oku('eposta-gonderen.ts');
    const bas = kaynak.indexOf('export async function epostaGonderenAdresi(');
    if (bas < 0) throw new Error('epostaGonderenAdresi bulunamadı — tarama boşa düşerdi');
    const govde = kaynak.slice(bas, kaynak.indexOf('\n}', bas));
    expect(govde).toContain('SELECT e.from_email');
    expect(govde).not.toMatch(/smtp_pass_enc|smtp_user|smtp_host/);
  });
});

describe('uygula yolunun sırası', () => {
  it('KRİTİK: özet kapısı platform çağrısından ÖNCE', () => {
    const src = oku('sinyal.service.ts');
    const bas = src.indexOf('async uygula(');
    if (bas < 0) throw new Error('uygula gövdesi bulunamadı — tarama boşa düşerdi');
    const govde = src.slice(bas, src.indexOf('private async hesapDurumlari(', bas));
    const kapi = govde.indexOf('s.ozet !== ozet');
    const cagri = govde.indexOf('this.actions.uygula(');
    expect(kapi).toBeGreaterThan(0);
    expect(cagri).toBeGreaterThan(kapi);
  });
});

describe('CHECK listeleri = shared listeleri', () => {
  /*
   * `sinyaller_kod_chk` Paket F1'de (20261014200000_veri_kaynagi) DÜŞÜRÜLÜP
   * genişletilerek yeniden kuruldu. Kısıt EN SON hangi migration'da
   * tanımlandıysa o okunuyor: ilk tanımı okumak, F1 kodlarını içermeyen
   * eski listeyi "doğru" sayardı.
   */
  const kok = join(__dirname, '../../../prisma/migrations');
  const ilk = readFileSync(join(kok, '20261013100000_sinyal/migration.sql'), 'utf8');
  const f1 = readFileSync(join(kok, '20261014200000_veri_kaynagi/migration.sql'), 'utf8');
  /*
   * Bildirim olayı kısıtları Paket B'de (20261014500000_haftalik_ozet)
   * `haftalik_ozet` ile genişletilerek yeniden kuruldu; en son tanım okunuyor.
   */
  const b = readFileSync(join(kok, '20261014500000_haftalik_ozet/migration.sql'), 'utf8');
  const sql = ilk + '\n' + f1.slice(f1.indexOf('"sinyaller_kod_chk" CHECK') - 20) + '\n' + b.slice(b.indexOf('-- ─── bildirim olayı'));
  const liste = (kisit: string): string[] => {
    const i = sql.lastIndexOf(`"${kisit}" CHECK`);
    if (i < 0) throw new Error(`${kisit} bulunamadı`);
    const parca = sql.slice(i, sql.indexOf('\n  CONSTRAINT', i + 1) > 0 ? sql.indexOf('\n  CONSTRAINT', i + 1) : sql.indexOf(');', i));
    return [...parca.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]!);
  };

  it('KRİTİK: her durum/tür kısıtı shared listesiyle iki yönlü aynı', () => {
    expect(liste('sinyaller_tur_chk')).toEqual([...SINYAL_TURLERI]);
    expect(liste('sinyaller_kod_chk')).toEqual([...ANOMALI_METRIKLERI, ...SAGLIK_KONTROLLERI]);
    expect(liste('sinyaller_durum_chk')).toEqual([...SINYAL_DURUMLARI]);
    expect(liste('sinyaller_kapatma_nedeni_chk')).toEqual([...SINYAL_KAPATMA_NEDENLERI]);
    expect(liste('bildirim_kanallari_tur_chk')).toEqual([...KANAL_TURLERI]);
    expect(liste('bildirim_kanallari_olaylar_chk')).toEqual([...BILDIRIM_OLAYLARI]);
    expect(liste('bildirim_gonderimleri_olay_chk')).toEqual([...BILDIRIM_OLAYLARI, 'deneme']);
    expect(liste('bildirim_gonderimleri_durum_chk')).toEqual([...TESLIM_DURUMLARI]);
  });
});
