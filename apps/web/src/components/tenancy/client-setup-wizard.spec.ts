import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * KURULUM SİHİRBAZININ KARARLARI.
 *
 * Bileşen tarayıcı olayları etrafında kurulu ve bu depoda DOM test altyapısı
 * yok. Sınanabilecek şey, formun bir daha eski hâline dönmemesini sağlayan
 * kararlar — her biri sessiz bir hataya karşılık geliyor.
 */
const DIR = __dirname;
const FORM = readFileSync(join(DIR, 'client-setup-wizard.tsx'), 'utf8');
const SAYFA = readFileSync(
  join(DIR, '..', '..', 'app', '(dashboard)', 'ayarlar', 'musteriler', 'page.tsx'),
  'utf8',
);

const yorumsuz = (m: string): string =>
  m
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('tarama boşa düşmüyor', () => {
  it('dosyalar okunuyor ve beklenen gövdeyi taşıyor', () => {
    expect(FORM.length).toBeGreaterThan(3000);
    expect(yorumsuz(FORM)).toContain('ClientSetupWizard');
    expect(yorumsuz(SAYFA)).toContain('ClientSetupWizard');
  });
});

describe('tek çağrı', () => {
  it('KRİTİK: kurulum ucu /clients/setup — parça parça değil', () => {
    /*
     * Sihirbazın bütün amacı beş adımı tek çağrıya indirmek. Ayrı ayrı
     * `/clients` + atama çağrıları yapmak, adımlardan birinin sessizce
     * atlanabildiği eski akışı geri getirirdi.
     */
    const kod = yorumsuz(FORM);
    expect(kod).toContain("'/clients/setup'");
    expect(kod).not.toContain("apiFetch('/clients',");
    expect(kod).not.toContain('/connections/ad-accounts/');
  });

  it('KRİTİK: seçilenler reklam hesabı ve profil diye AYRILIYOR', () => {
    // Sunucu ikisini ayrı alanlarda bekliyor; tek listede göndermek hangi
    // tabloya bakılacağının bilinememesi demek.
    const kod = yorumsuz(FORM);
    expect(kod).toContain('adAccountIds');
    expect(kod).toContain('socialProfileIds');
    expect(kod).toContain('o.reklamHesabi');
  });
});

describe('eski akış geri gelmesin', () => {
  it('KRİTİK: tek satırlık eski form artık YOK', () => {
    // Dosya silindi; sayfanın onu import etmesi, silinmiş bir bileşene
    // referans demek olurdu.
    expect(yorumsuz(SAYFA)).not.toContain('ClientCreateForm');
  });

  it('havuz ORTAK yardımcıdan türetiliyor — ikinci eşleme yok', () => {
    const kod = yorumsuz(FORM);
    expect(kod).toContain('havuzlariCikar');
    // Kendi profil-tipi eşlemesini kurmamalı.
    expect(kod).not.toContain("'instagram_business'");
  });
});

describe('sessiz kalmayan yerler', () => {
  it('KRİTİK: kısmi başarı ekranda kalıyor', () => {
    /*
     * Sunucu atanamayan kaydı sebebiyle dönüyor. Modalı hemen kapatmak o
     * bilgiyi çöpe atardı ve kullanıcı eksiği ancak veri gelmediğinde fark
     * ederdi.
     */
    const kod = yorumsuz(FORM);
    expect(kod).toContain('sonuc.failures');
    expect(kod).toContain('f.reason');
  });

  it('yönetici (MCC) hesabı listede ama seçilemiyor', () => {
    const kod = yorumsuz(FORM);
    expect(kod).toContain('o.isManager');
    expect(kod).toContain('disabled={o.isManager}');
  });

  it('parolanın elden iletileceği yazılı — davet e-postası yok', () => {
    expect(yorumsuz(FORM)).toContain('Davet e-postası gönderilmiyor');
  });

  it('kaç sonuç gösterildiği yazılı — sessiz kesme yok', () => {
    expect(yorumsuz(FORM)).toContain('{liste.length} / {ogeler.length}');
  });
});

describe('pop-up sözleşmesi', () => {
  it('erişilebilir ve ESC ile kapanıyor', () => {
    const kod = yorumsuz(FORM);
    expect(kod).toContain('role="dialog"');
    expect(kod).toContain('aria-modal');
    expect(kod).toContain("'Escape'");
  });
});
