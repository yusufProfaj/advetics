import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS, ROLES, type AssetListResult } from '@advetics/shared';
import { SECTIONS } from '@/lib/nav-sections';
import { VARLIKLAR_IZNI, VARLIKLAR_SEKMELERI, eskiAdresYonu } from '@/lib/panel-adresleri';
import { GORSEL_TURLERI, gorselTuru } from '@/components/assets/gorsel-turleri';

/**
 * ═══ BASE › VARLIKLAR — AYRI MENÜ SATIRI (Karar B, 2026-10-13) ═══
 *
 * 2026-10-06 ile 2026-10-13 arası varlıklar Marka Merkezi'nin bir
 * bölümüydü. Şimdi menüde kendi satırı, dört sekme (Görseller, Kreatifler,
 * Formlar, Kitleler). Eski `/kutuphane/*` adresleri tek eşlemeyle oraya.
 */
const tumSatirlar = SECTIONS.flatMap((s) => s.items);
const yorumsuz = (yol: string) =>
  readFileSync(resolve(__dirname, yol), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const SAYFA = yorumsuz('../../app/(dashboard)/varliklar/page.tsx');

describe('menü', () => {
  it('KRİTİK: Base iki satır — Marka Merkezi ve Varlıklar; Varlıklar sözleşmenin kapısıyla', () => {
    const base = SECTIONS.find((s) => s.title === 'Base');
    expect(base?.items.map((i) => i.label)).toEqual(['Marka Merkezi', 'Varlıklar']);
    expect(tumSatirlar.find((i) => i.href === '/varliklar')?.perm).toBe(VARLIKLAR_IZNI);
  });

  it('KRİTİK: sekmeyi görebilen her rol menü satırını da görüyor (kitleler hariç: o sekmeyi okuyan hesabın menüsü dört ekran)', () => {
    for (const rol of ROLES) {
      const izinler = ROLE_PERMISSIONS[rol];
      for (const s of VARLIKLAR_SEKMELERI.filter((x) => x.izin === 'bulk.read')) {
        if (izinler.includes(s.izin)) expect(izinler, `${rol} → ${s.ad}`).toContain(VARLIKLAR_IZNI);
      }
    }
  });
});

describe('Varlıklar sayfası', () => {
  it('sayfa var, dört sekmeyi kendisi çiziyor', () => {
    expect(existsSync(resolve(__dirname, '../../app/(dashboard)/varliklar/page.tsx'))).toBe(true);
    expect(SAYFA).toContain("{sekme === 'gorseller' && <GorsellerIcerik clientId={clientId} params={params} />}");
    expect(SAYFA).toContain("{sekme === 'kreatifler' && <KreatiflerIcerik clientId={clientId} params={params} />}");
    expect(SAYFA).toContain("{sekme === 'formlar' && <FormlarIcerik clientId={clientId} params={params} />}");
    expect(SAYFA).toContain("{sekme === 'kitleler' && (");
  });

  it('KRİTİK: tur=logo Görseller’de boş süzgeç açmıyor, Marka › Logo’ya gidiyor', () => {
    expect(SAYFA).toContain("if (first(params.tur) === 'logo') redirect(markaMerkeziAdresi('marka', musteriParam, 'logo'));");
    expect(gorselTuru('logo')).toBeNull();
    expect(GORSEL_TURLERI).not.toContain('logo' as never);
    expect(gorselTuru('video')).toBe('video');
  });

  it('KRİTİK: Kitleler’de varsayılan DEĞİŞMİYOR; rozet salt okunur, Kurulum’a bağlantı', () => {
    const K = yorumsuz('kitleler-bolumu.tsx');
    expect(K).not.toContain('/audience-templates/varsayilan');
    expect(K).not.toContain('Varsayılan yap');
    expect(K).toContain('Kurulum’da değiştir');
    expect(SAYFA).toContain("markaMerkeziAdresi('kurulum', clientId, 'varsayilanlar')");
  });

  it('KRİTİK: elle yazılmış kapı yok', () => {
    for (const k of [SAYFA, yorumsuz('varliklar/gorseller.tsx'), yorumsuz('varliklar/kreatifler.tsx')]) {
      expect(k).not.toContain('hasPermission(');
    }
  });

  it('KRİTİK: okuma hatası boş listeye çevrilmiyor', () => {
    expect(yorumsuz('varliklar/gorseller.tsx')).not.toContain('.catch(');
    const K = yorumsuz('varliklar/kreatifler.tsx');
    expect(K).not.toContain(": []");
    expect(K).toContain('Kreatif listesi alınamadı.');
    const F = yorumsuz('varliklar/formlar.tsx');
    expect(F).not.toContain('.catch(() => [])');
    expect(F).toContain('Sayfalar okunamadı; form oluşturulamıyor.');
  });
});

describe('Görseller: logo sayısı sessiz değil', () => {
  it('KRİTİK: logo kayıtları listelenmiyor ama sayısı bağlantıyla yazıyor', () => {
    const A = yorumsuz('../assets/asset-library.tsx');
    expect(A).toContain("initial.rows.filter((r) => r.kind !== 'logo')");
    expect(A).toContain('{logoSayisi} logo Marka’da');
    expect(A).not.toContain('ASSET_KINDS.map(');
    // Yükleme türlerinde logo YOK.
    const sozluk: AssetListResult['byKind'] = { image: 1, logo: 2, video: 3 };
    expect(GORSEL_TURLERI.reduce((t, k) => t + sozluk[k], 0)).toBe(4);
  });
});

describe('eski adresler', () => {
  it('KRİTİK: eski varlık sayfaları içerik çizmiyor, eşlemeyle yönleniyor ve süzgeci taşıyor', () => {
    for (const ad of ['gorseller', 'kreatifler', 'formlar'] as const) {
      const k = yorumsuz(`../../app/(dashboard)/kutuphane/${ad}/page.tsx`);
      expect(k, ad).toContain(`eskiAdresYonu('kutuphane/${ad}'`);
      expect(k, ad).not.toContain('serverApiFetch');
    }
    expect(eskiAdresYonu('kutuphane/formlar', { musteri: 'ws', sorgu: { form: 'f1' } })).toBe('/varliklar?musteri=ws&sekme=formlar&form=f1');
  });
});
