import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  baglantiKorunsunMu,
  cakismaKarari,
  sahiplikKarari,
  type SahiplikGirdisi,
} from './hesap-sahipligi';

/**
 * ═══ SAHİPLİK BAĞLANTIDAN GELİR — KARARLAR ÇALIŞTIRILARAK ═══
 *
 * Senaryo gerçek kurulumun kendisi: Profaj ajans, 3A Makina ve Biltaş iki
 * müşteri. 3A kendi Meta'sını bağlamış; Profaj'ın bağlantısı hepsine
 * hizmet ediyor.
 */
const PROFAJ = 'org-profaj';
const UC_A = 'org-3a';
const BILTAS = 'org-biltas';

/** Profaj'ın bağlantısından gelen, 3A'ya atanmış hesap — Profaj 3A'nın içinde. */
function taban(over: Partial<SahiplikGirdisi> = {}): SahiplikGirdisi {
  return {
    tur: 'reklam hesabı',
    ad: 'act_123',
    satirOrgId: UC_A,
    baglantiOrgId: PROFAJ,
    hedefOrgId: UC_A,
    aktifOrgId: UC_A,
    ustHesapVar: true,
    ajansOrgId: PROFAJ,
    ...over,
  };
}

describe('K4 — ajansın atamasını ajans değiştirir', () => {
  it('KRİTİK: şirket admini ajans hesabının atamasını KALDIRAMIYOR', () => {
    const k = sahiplikKarari(taban({ hedefOrgId: null, ustHesapVar: false }));
    expect(k).toMatchObject({ ok: false });
    expect(k.ok === false && k.mesaj).toMatch(/yalnızca ajans/);
  });

  it('KRİTİK: şirket admini ajans hesabını kendi başka workspace’ine de TAŞIYAMIYOR', () => {
    // Aynı şirket içinde bile: atama ajansın kararı ve izlemeyi o açtı.
    //
    // MESAJA ÇAPALI, SONUCA DEĞİL. İlk yazımda yalnızca `ok: false`
    // bekleniyordu ve K4 kapısı silinince de geçti: K1 aynı satırı başka bir
    // sebeple reddediyordu. Sebep yanlışsa kullanıcıya söylenen de yanlış.
    const k = sahiplikKarari(taban({ ustHesapVar: false }));
    expect(k.ok === false && k.mesaj).toMatch(/yalnızca ajans/);
  });

  it('şirket admini KENDİ bağladığı hesabı atayıp kaldırabiliyor', () => {
    const kendi = taban({ baglantiOrgId: UC_A, ustHesapVar: false, ajansOrgId: null });
    expect(sahiplikKarari(kendi)).toEqual({ ok: true, yeniOrgId: UC_A });
    expect(sahiplikKarari({ ...kendi, hedefOrgId: null })).toEqual({ ok: true, yeniOrgId: UC_A });
  });

  it('ajans üyesi ajans hesabının atamasını kaldırabiliyor', () => {
    expect(sahiplikKarari(taban({ hedefOrgId: null }))).toEqual({ ok: true, yeniOrgId: PROFAJ });
  });
});

describe('K1 — şirketin kendi hesabı yalnızca kendi workspace’lerine', () => {
  it('KRİTİK: 3A’nın kendi hesabı Biltaş’a ATANAMIYOR — ajans bile atayamıyor', () => {
    /*
     * "Tüm şirketler" modunda RLS'in atanmış dalı bunu durdurmuyor
     * (`org_kapsaminda` bütün şirketler); bu kapı tek kapı.
     */
    const k = sahiplikKarari(
      taban({ baglantiOrgId: UC_A, satirOrgId: UC_A, hedefOrgId: BILTAS, aktifOrgId: PROFAJ }),
    );
    expect(k).toMatchObject({ ok: false });
    expect(k.ok === false && k.mesaj).toMatch(/başka bir şirketin kendi bağlantısından/);
  });

  it('ajansın hesabı HER şirkete atanabiliyor', () => {
    expect(sahiplikKarari(taban({ satirOrgId: PROFAJ, hedefOrgId: BILTAS, aktifOrgId: BILTAS }))).toEqual({
      ok: true,
      yeniOrgId: BILTAS,
    });
  });

  it('KRİTİK: ajans bilinmiyorsa ajans hesabı bile başka şirkete ATANAMIYOR — kapalı düşüyor', () => {
    // Açık düşmek, eksik bir veriyi bir müşterinin hesabını başkasına
    // taşımaya çevirirdi. Politika da aynı yönde kapalı.
    const k = sahiplikKarari(taban({ satirOrgId: PROFAJ, hedefOrgId: BILTAS, ajansOrgId: null }));
    expect(k).toMatchObject({ ok: false });
  });

  it('KRİTİK: üst hesap üyeliği yoksa ajans şirketi BİLİNEN sayılmıyor', () => {
    /*
     * Politika üyelik yokken `app.ajans_org_id()`yi NULL görüyor. Burada
     * bilinen saymak, veritabanının reddedeceği bir yazmayı onaylayıp ham
     * bir politika hatası göstermek olurdu.
     */
    const k = sahiplikKarari(
      taban({ baglantiOrgId: PROFAJ, aktifOrgId: PROFAJ, satirOrgId: PROFAJ, hedefOrgId: BILTAS, ustHesapVar: false }),
    );
    expect(k).toMatchObject({ ok: false });
  });
});

describe('K2 — kaldırmada sahibine dön', () => {
  it('KRİTİK: ajans hesabı 3A’dan çözülünce AJANSA dönüyor, 3A’da kalmıyor', () => {
    // Kalsaydı 3A'nın havuzuna düşer ve hiçbir kardeş şirketten görünmezdi.
    expect(sahiplikKarari(taban({ hedefOrgId: null }))).toEqual({ ok: true, yeniOrgId: PROFAJ });
  });

  it('3A’nın kendi hesabı çözülünce 3A’da kalıyor', () => {
    expect(
      sahiplikKarari(taban({ baglantiOrgId: UC_A, hedefOrgId: null, aktifOrgId: UC_A })),
    ).toEqual({ ok: true, yeniOrgId: UC_A });
  });

  it('KRİTİK: başka şirketin hesabı TÜM ŞİRKETLER modundan çözülemiyor — sebep önceden söyleniyor', () => {
    /*
     * Dönülecek havuz satırı politikadan geçemezdi ("new row violates
     * row-level security policy"). Kullanıcıya ham hata yerine ne yapacağı
     * söyleniyor.
     */
    const k = sahiplikKarari(
      taban({ baglantiOrgId: UC_A, hedefOrgId: null, aktifOrgId: PROFAJ }),
    );
    expect(k).toMatchObject({ ok: false });
    expect(k.ok === false && k.mesaj).toMatch(/o şirkete geç/);
  });
});

describe('çakışma — hedef şirkette aynı hesabın ikizi', () => {
  it('KRİTİK: ATAMADA reddediliyor ve hangi kaydın atanacağı söyleniyor', () => {
    const k = cakismaKarari({ atama: true, ad: 'act_123', satirOrgId: PROFAJ, yeniOrgId: UC_A, cakisanVar: true });
    expect(k).toMatchObject({ ok: false });
    expect(k.ok === false && k.mesaj).toMatch(/o kaydı ata/);
  });

  it('KRİTİK: KALDIRMADA satır olduğu yerde kalıyor ve bu SÖYLENİYOR', () => {
    const k = cakismaKarari({ atama: false, ad: 'act_123', satirOrgId: UC_A, yeniOrgId: PROFAJ, cakisanVar: true });
    expect(k).toMatchObject({ ok: true, orgId: UC_A });
    expect(k.ok && k.not).toMatch(/şirketin havuzunda kaldı/);
  });

  it('çakışma yoksa hedefe gidiyor, not yok', () => {
    expect(
      cakismaKarari({ atama: false, ad: 'x', satirOrgId: UC_A, yeniOrgId: PROFAJ, cakisanVar: false }),
    ).toEqual({ ok: true, orgId: PROFAJ, not: null });
  });
});

describe('K3 — atanmış satırın bağlantısı keşifle değişmez', () => {
  const ATANMIS = {
    mevcutClientId: 'ws-3a',
    mevcutConnectionId: 'conn-profaj',
    mevcutBaglantiDurumu: 'active' as const,
    yeniConnectionId: 'conn-3a',
  };

  it('KRİTİK: canlı bağlantıya atanmış hesap şirketin bağlantısına GEÇMİYOR', () => {
    expect(baglantiKorunsunMu(ATANMIS)).toBe(true);
  });

  it('mevcut bağlantı ÖLÜYSE devralınıyor — çalışan bir yedeği olan hesap susmasın', () => {
    expect(baglantiKorunsunMu({ ...ATANMIS, mevcutBaglantiDurumu: 'revoked' })).toBe(false);
    expect(baglantiKorunsunMu({ ...ATANMIS, mevcutBaglantiDurumu: 'needs_reauth' })).toBe(false);
  });

  it('`error` ölü SAYILMIYOR — geçici hata sahipliği el değiştirmesin', () => {
    expect(baglantiKorunsunMu({ ...ATANMIS, mevcutBaglantiDurumu: 'error' })).toBe(true);
  });

  it('havuz satırında koruma yok — sahiplenme buna dayanıyor', () => {
    expect(baglantiKorunsunMu({ ...ATANMIS, mevcutClientId: null })).toBe(false);
  });
});

/*
 * ═══ KARAR TEST EDİLDİ — ÇAĞRILDIĞI DA TEST EDİLMELİ ═══
 *
 * Bu depoda bir fonksiyon test edilip çağrıldığı test edilmediği için
 * mutasyonla BOŞ çıkan bir test oldu (CLAUDE.md). Aşağıdaki tarama yorumsuz
 * kaynakta, gövdeleri süslü parantez sayarak çıkarıyor; gövde bulunamazsa
 * HATA FIRLATIYOR.
 */
const KAYNAK = readFileSync(join(__dirname, 'connections.service.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

function govde(imza: string): string {
  const bas = KAYNAK.indexOf(imza);
  if (bas === -1) throw new Error(`${imza} bulunamadı — tarama boşa düştü`);
  /*
   * PARAMETRE LİSTESİ DENGELENİYOR, SONRA SATIR SONUYLA BİTEN İLK `{`.
   *
   * İlk yazımda "imzadan sonraki ilk `)`, ondan sonraki ilk `{`" deniyordu ve
   * boşa düştü: parametre tiplerinde `{ ... }` nesneleri, dönüş tipinde
   * `Promise<{ orgId: string }>` var. Dilim dönüş tipinin kendisi oldu ve
   * bütün iddialar 46 karakterlik bir dizgede koştu.
   */
  const parAcilis = KAYNAK.indexOf('(', bas);
  let pd = 0;
  let parKapanis = -1;
  for (let i = parAcilis; i < KAYNAK.length; i += 1) {
    if (KAYNAK[i] === '(') pd += 1;
    if (KAYNAK[i] === ')') {
      pd -= 1;
      if (pd === 0) {
        parKapanis = i;
        break;
      }
    }
  }
  const eslesme = /\{[ \t]*\n/.exec(KAYNAK.slice(parKapanis));
  if (parKapanis === -1 || !eslesme) throw new Error(`${imza} gövde açılışı bulunamadı`);
  const acilis = parKapanis + eslesme.index;
  let d = 0;
  for (let i = acilis; i < KAYNAK.length; i += 1) {
    if (KAYNAK[i] === '{') d += 1;
    if (KAYNAK[i] === '}') {
      d -= 1;
      if (d === 0) return KAYNAK.slice(acilis, i + 1);
    }
  }
  throw new Error(`${imza} gövdesi kapanmadı`);
}

describe('servis kararları GERÇEKTEN kullanıyor', () => {
  it('gövdeler yakalandı', () => {
    expect(govde('async assignAdAccount(').length).toBeGreaterThan(2000);
    expect(govde('async assignSocialProfile(').length).toBeGreaterThan(1000);
    expect(govde('private async discoverAndStore(').length).toBeGreaterThan(2000);
  });

  it('KRİTİK: iki atama yolu da sahiplik kapısından geçiyor ve orgId’yi ONDAN yazıyor', () => {
    for (const imza of ['async assignAdAccount(', 'async assignSocialProfile(']) {
      const g = govde(imza);
      expect(g).toContain('await this.sahiplikUygula(tx, ctx,');
      expect(g).toContain('orgId: sahiplik.orgId');
      // Eski dal: kaldırmada orgId'yi hiç yazmıyor, atamada hedeften
      // okuyordu. Geri gelirse K2 sessizce kaybolur.
      expect(g).not.toContain('...(clientId !== null ? { orgId: await this.musteriOrgId(tx, clientId) } : {})');
    }
  });

  it('KRİTİK: sahiplik kapısı KARARI hem uyguluyor hem reddediyor', () => {
    const g = govde('private async sahiplikUygula(');
    expect(g).toContain('sahiplikKarari({');
    expect(g).toContain('if (!karar.ok) throw new BadRequestException(karar.mesaj);');
    expect(g).toContain('cakismaKarari({');
    expect(g).toContain('if (!cakisma.ok) throw new BadRequestException(cakisma.mesaj);');
  });

  it('KRİTİK: keşif atanmış satırın bağlantısını hem hesapta hem sayfada KORUYOR', () => {
    const g = govde('private async discoverAndStore(');
    expect(g.match(/baglantiKorunsunMu\(\{/g)?.length).toBe(2);
    expect(g.match(/\.\.\.\(koru \? \{\} : \{ connectionId \}\)/g)?.length).toBe(2);
    // Sayfa token'ı bağlantıyla birlikte korunuyor.
    expect(g).toContain('...(pageToken && !koru');
  });
});
