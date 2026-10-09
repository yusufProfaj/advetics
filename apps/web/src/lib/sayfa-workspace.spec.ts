import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SessionResponse } from '@advetics/shared';
import { sayfaWorkspaceId, workspaceSecimVerisi } from './sayfa-workspace';

/**
 * ═══ WORKSPACE BAZINDA SAYFALAR SESSİZCE İLK WORKSPACE'E DÜŞMÜYOR ═══
 *
 * On üç sayfa `activeClientId ?? availableClients[0]` ile çözüyordu: üst
 * barda "şirket geneli" seçili kullanıcı Kurallar'a girince listenin ilk
 * workspace'inin kurallarını düzenliyordu ve ekranın hiçbir yerinde bu
 * yazmıyordu. Çözüm tek yerde; buradaki taramalar bir sayfanın o dalı
 * yeniden yazmasını ve eski kutunun kopyalanmasını engelliyor.
 */
const SRC = join(__dirname, '..');
const yorumsuz = (yol: string): string =>
  readFileSync(yol, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\}/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

function sayfalar(dizin: string): string[] {
  return readdirSync(dizin).flatMap((ad) => {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) return sayfalar(yol);
    return ad === 'page.tsx' ? [yol] : [];
  });
}

const PANEL = sayfalar(join(SRC, 'app', '(dashboard)'));
const KULLANAN = PANEL.filter((p) => yorumsuz(p).includes('<WorkspaceGerekli'));
const BILESEN = yorumsuz(join(SRC, 'components', 'workspace-gerekli.tsx'));

describe('çözüm sırası', () => {
  it('URL önce geliyor (Genel Bakış bağlantıları belirli bir workspace hedefliyor)', () => {
    expect(sayfaWorkspaceId({ activeClientId: 'aktif' }, 'url')).toBe('url');
  });

  it('URL yoksa üst bardaki seçim', () => {
    expect(sayfaWorkspaceId({ activeClientId: 'aktif' }, undefined)).toBe('aktif');
  });

  it('KRİTİK: seçim yoksa NULL, listenin ilk satırı değil', () => {
    expect(sayfaWorkspaceId({ activeClientId: null }, undefined)).toBeNull();
    // Tek etkin workspace varsa belirsizlik yok: o seçiliyor.
    const tek = [{ id: 'w1', status: 'active' }, { id: 'w2', status: 'archived' }];
    expect(sayfaWorkspaceId({ activeClientId: null, availableClients: tek }, undefined)).toBe('w1');
    // Birden çok etkin workspace varsa YİNE seçim istenir (ilk satıra düşmek yok).
    const iki = [{ id: 'w1', status: 'active' }, { id: 'w2', status: 'active' }];
    expect(sayfaWorkspaceId({ activeClientId: null, availableClients: iki }, undefined)).toBeNull();
  });
});

describe('seçim verisi', () => {
  const oturum = (p: Partial<SessionResponse>): SessionResponse =>
    ({
      tumSirketler: false,
      managerAccount: null,
      activeOrganizationId: 'o1',
      organization: { id: 'o1', name: 'Ev Şirketi' },
      availableClients: [
        { id: 'a', name: 'Açık', status: 'active' },
        { id: 'b', name: 'Arşiv', status: 'archived' },
      ],
      permissions: [],
      ...p,
    }) as unknown as SessionResponse;

  it('arşivlenmiş workspace seçilebilir bir hedef değil', () => {
    expect(workspaceSecimVerisi(oturum({})).workspaceler).toEqual([{ id: 'a', name: 'Açık' }]);
  });

  it('kurulum bağlantısı yalnızca workspace açabilene', () => {
    expect(workspaceSecimVerisi(oturum({})).kurulumGorunur).toBe(false);
    expect(
      workspaceSecimVerisi(oturum({ permissions: ['client.write'] as SessionResponse['permissions'] }))
        .kurulumGorunur,
    ).toBe(true);
  });

  it('liste Türkçe alfabeyle sıralı (Ç, C\'den sonra)', () => {
    const v = workspaceSecimVerisi(
      oturum({
        availableClients: [
          { id: '1', name: 'Çizgi Medikal', status: 'active' },
          { id: '2', name: 'Coordinat Yapı', status: 'active' },
          { id: '3', name: 'Biltaş', status: 'active' },
        ],
      }),
    );
    expect(v.workspaceler.map((w) => w.name)).toEqual(['Biltaş', 'Coordinat Yapı', 'Çizgi Medikal']);
  });

  it('"tüm şirketler" modunda şirket adı olarak bu yazıyor', () => {
    expect(workspaceSecimVerisi(oturum({ tumSirketler: true })).sirketAdi).toBe('Tüm şirketler');
  });
});

describe('sayfalar', () => {
  it('tarama boşa düşmüyor', () => {
    // On üç sayfa bu kutuya geçmişti; Görseller, Kreatifler ve Formlar
    // 2026-10-06'da Marka Merkezi'nin içine taşındı (kutuyu artık o veriyor),
    // yani on. 2026-10-07'de Reklam Oluştur (üç sayfa) ve Toplu Oluştur
    // kaldırıldı, AdvCampaign'in üç sayfası listeye girdi. Sayı daha da
    // düşerse tarama bir yolu kaçırıyor.
    expect(PANEL.length).toBeGreaterThan(20);
    expect(KULLANAN.length).toBeGreaterThanOrEqual(8);
  });

  it('KRİTİK: hiçbir panel sayfası listenin ilk workspace\'ine düşmüyor', () => {
    for (const p of PANEL) {
      expect(yorumsuz(p), p).not.toContain('availableClients[0]');
    }
  });

  it('KRİTİK: kutuyu kullanan her sayfa workspace\'i ORTAK çözümle buluyor', () => {
    for (const p of KULLANAN) {
      expect(yorumsuz(p), p).toContain('sayfaWorkspaceId(session, first(params.musteri))');
    }
  });

  it('eski kopyalanmış kutu hiçbir yerde kalmadı', () => {
    for (const p of PANEL) {
      expect(yorumsuz(p), p).not.toContain('Önce bir workspace seç');
    }
  });

  it('her sayfa NEDEN workspace istediğini söylüyor', () => {
    // Eski kutuların sekizinde tek bir gerekçe cümlesi yoktu.
    for (const p of KULLANAN) {
      const kod = yorumsuz(p);
      const i = kod.indexOf('<WorkspaceGerekli');
      const eleman = kod.slice(i, kod.indexOf('/>', i));
      expect(eleman, p).toMatch(/neden="[^"]{10,}"/);
    }
  });
});

describe('bileşen', () => {
  it('KRİTİK: seçim ÜST BARLA AYNI yoldan yapılıyor, URL parametresiyle değil', () => {
    /*
     * `?musteri=` ile seçmek yalnızca o sayfada geçerli olurdu: üst bar eski
     * kapsamı gösterir ve bir sonraki ekranda seçim kaybolurdu.
     */
    expect(BILESEN).toContain("apiFetch('/auth/switch-client'");
    expect(BILESEN).not.toContain("set('musteri'");
    expect(BILESEN).toContain('delete kalan.musteri;');
  });

  it('KRİTİK: tek workspace olsa da otomatik seçilmiyor', () => {
    expect(BILESEN).not.toContain('workspaceler.length === 1');
    expect(BILESEN).not.toMatch(/useEffect\([^)]*sec\(/);
  });

  it('KRİTİK: hiç workspace yoksa seçim değil kurulum gösteriliyor, yetkiye göre', () => {
    const i = BILESEN.indexOf('workspaceler.length === 0 ?');
    expect(i).toBeGreaterThan(-1);
    // Dal, seçim dalının ilk cümlesinde bitiyor; iç ternary'nin `) : (`
    // dizesi dalın ORTASINDA ve oraya çapalamak dalı yarıda kesiyordu.
    const son = BILESEN.indexOf('Hangi workspace ile', i);
    expect(son).toBeGreaterThan(i);
    const dal = BILESEN.slice(i, son);
    expect(dal).toContain('kurulumGorunur ?');
    // Doğrudan workspace formu: türsüz /kurulum artık yönlendiriyor.
    expect(dal).toContain('href="/kurulum?tur=workspace"');
    expect(dal).toContain('Yöneticinden');
  });

  it('seçim hatası yutulmuyor', () => {
    expect(BILESEN).toContain('setHata(');
    expect(BILESEN).toContain('<Uyari ton="tehlike">{hata}</Uyari>');
  });
});
