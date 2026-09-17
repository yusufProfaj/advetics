import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASISTAN_PLATFORMLARI, CAMPAIGN_GOALS, GOAL_PLATFORM_SUPPORT } from '@advetics/shared';
import { buildSystemPrompt } from './system-prompt';

/**
 * ═══ İKİ AYRI ASİSTAN ═══
 *
 * Meta ve Google aynı promptla yönetilemiyor: hedef sözlüğü, bütçe modeli
 * (Google'da bütçe AYRI BİR KAYNAK) ve yazma kısıtları ayrışıyor. Tek
 * promptla "ortalama" bir asistan, ikisinde de zayıf olur.
 *
 * Buradaki iddiaların hepsinin ortak sebebi tek: ASİSTAN YAPAMAYACAĞI BİR
 * ŞEYE SÖZ VERMEMELİ. Google'da yazma kodu hiç yazılmadı
 * (`google.provider.applyAction` açıkça reddediyor) ve bugün Google'da
 * desteklenen tek bir hedef bile yok.
 */
const yorumsuz = (m: string): string =>
  m.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SERVIS = yorumsuz(readFileSync(join(__dirname, 'ai-assistant.service.ts'), 'utf8'));
const ARACLAR = yorumsuz(readFileSync(join(__dirname, 'tools.ts'), 'utf8'));

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(SERVIS).toContain('GOOGLEDA_YOK');
    expect(ARACLAR).toContain("name: 'pause_campaign'");
  });
});

describe('platform sözlüğü', () => {
  it('KRİTİK: Meta promptu YALNIZCA Meta hedeflerini listeliyor', () => {
    const p = buildSystemPrompt('meta', 'bağlam');
    for (const goal of CAMPAIGN_GOALS) {
      const destekli = GOAL_PLATFORM_SUPPORT[goal].meta.support === 'yes';
      expect(p.includes(`"${goal}"`), `${goal} (destek: ${destekli})`).toBe(destekli);
    }
  });

  it('KRİTİK: Google promptunda DESTEKLENMEYEN hedef HİÇ geçmiyor', () => {
    /*
     * Eskiden bütün hedefler "Google (never: …)" notlarıyla birlikte
     * veriliyordu ve model o notu okuyup yine de deneyecek bir konum
     * bulabiliyordu. Desteklenmeyen hedefi promptta hiç göstermemek o yolu
     * tamamen kapatıyor.
     */
    const p = buildSystemPrompt('google', 'bağlam');
    for (const goal of CAMPAIGN_GOALS) {
      if (GOAL_PLATFORM_SUPPORT[goal].google.support !== 'yes') {
        expect(p, `${goal} Google promptunda geçmemeli`).not.toContain(`"${goal}"`);
      }
    }
  });

  it('her platform KENDİ adıyla konuşuyor', () => {
    expect(buildSystemPrompt('meta', 'x')).toContain('Meta AI');
    expect(buildSystemPrompt('google', 'x')).toContain('Google Ads AI');
  });
});

describe('KRİTİK: Google yapamayacağına söz vermiyor', () => {
  it('Google promptu yazma kısıtını TAŞIYOR', () => {
    const p = buildSystemPrompt('google', 'x');
    expect(p).toContain('YAZMA YAPAMIYORSUN');
    expect(p).toContain('Google Ads arayüzünden');
  });

  it('Meta promptu o kısıtı TAŞIMIYOR', () => {
    // Ters yön: kısıtı her iki prompta da koyan bir kısayol yukarıdaki
    // testi geçerdi ve Meta asistanı kendi yapabildiği işi reddederdi.
    expect(buildSystemPrompt('meta', 'x')).not.toContain('YAZMA YAPAMIYORSUN');
  });

  it('KRİTİK: yasak araç listesi tools.ts ile AYNI adları taşıyor', () => {
    /*
     * Süzgeç ada göre çalışıyor. Bir araç yeniden adlandırılırsa liste
     * sessizce boşa düşer ve Google asistanı yine platform hatası verir.
     */
    const liste = /const GOOGLEDA_YOK = new Set\(\[([\s\S]*?)\]\)/.exec(SERVIS)?.[1];
    expect(liste, 'liste bulunamadı — tarama boşa düştü').toBeDefined();
    const adlar = [...liste!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
    expect(adlar.length).toBeGreaterThanOrEqual(6);
    for (const ad of adlar) {
      expect(ARACLAR, `tools.ts içinde yok: ${ad}`).toContain(`name: '${ad}'`);
    }
  });

  it('KRİTİK: süzgeç İKİ yerde — liste ve çalıştırma', () => {
    /*
     * Listeden çıkarmak tek başına garanti değil: geçmişten geri yüklenen
     * bir sohbet, platform değişmeden önce üretilmiş bir `tool_use` bloğu
     * taşıyabiliyor.
     */
    expect(SERVIS).toContain("platform === 'meta' || !GOOGLEDA_YOK.has(t.name)");
    expect(SERVIS).toContain("platform !== 'meta' && GOOGLEDA_YOK.has(name)");
  });
});

describe('platform sohbetin SATIRINDA', () => {
  it('KRİTİK: var olan sohbette istekteki platform YOK SAYILIYOR', () => {
    /*
     * Platformu sohbetin ortasında değiştirmek, o ana kadarki bütün bağlamı
     * (hesaplar, hedef sözlüğü, bütçe modeli) geçersiz kılardı ve model
     * önceki mesajlarına dayanarak yanlış platformun kampanyasını kurmaya
     * devam ederdi.
     */
    expect(SERVIS).toContain('const { id: conversationId, platform } = input.conversationId');
    expect(SERVIS).toContain('platform: true');
  });

  it('yeni sohbette platform SATIRA yazılıyor', () => {
    const i = SERVIS.indexOf('aiConversation.create');
    expect(i, 'oluşturma bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(SERVIS.slice(i, i + 400)).toContain('platform,');
  });

  it('asistan platformları YALNIZCA meta ve google', () => {
    // LinkedIn bilerek yok: o platformda yazma kodu hiç yazılmadı, yani
    // asistanın kurabileceği bir şey de yok.
    expect([...ASISTAN_PLATFORMLARI]).toEqual(['meta', 'google']);
  });
});
