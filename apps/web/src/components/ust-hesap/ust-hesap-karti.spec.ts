import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dolulukMetni } from './ust-hesap-karti';

/**
 * ═══ ÜST HESAP KARTI — PANEL KARARLARI ═══
 *
 * Platform sahibi onlarca üst hesap arasında geziyor; bu kart "hangi
 * hesaptayım, paketim ne, ne kadarını doldurdum, yeni hesabı nasıl açarım"
 * sorularının cevabı. Bir yetki yüzeyi de: paket seçimi ve yeni hesap
 * yalnızca platform sahibinde görünmeli.
 */
function kod(yol: string): string {
  return readFileSync(join(__dirname, yol), 'utf8')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}
const KART = kod('ust-hesap-karti.tsx');
const EKRAN = kod('ust-hesap-ekrani.tsx');
const SAYFA = readFileSync(
  join(__dirname, '..', '..', 'app', '(dashboard)', 'ayarlar', 'ust-hesap', 'page.tsx'),
  'utf8',
);

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(KART).toContain('export function UstHesapKarti');
    expect(KART.length).toBeGreaterThan(3000);
  });
});

describe('dolulukMetni', () => {
  it('sınırlı pakette "mevcut / sınır"', () => {
    expect(dolulukMetni(3, 5, 'şirket')).toBe('3 / 5 şirket');
  });
  it('KRİTİK: `null` sınır SINIRSIZ — "/ 0" ya da "/ ∞" değil, sayı yalnız', () => {
    // Sınırsızı sıfır sanan bir metin "49 / 0 şirket" yazardı; `null`
    // sözleşmesi burada da korunuyor.
    expect(dolulukMetni(49, null, 'şirket')).toBe('49 şirket');
  });
});

describe('KRİTİK: yetki yüzeyi', () => {
  it('yeni üst hesap YALNIZCA platform sahibinde', () => {
    // Sunucu da reddediyor; düğmeyi göstermek tıklayınca reddedilen bir
    // düğme olurdu.
    expect(KART).toContain('{platformAdmin && (');
    expect(KART).toContain("{panel === 'yeni' && platformAdmin && (");
  });

  it('paket seçici düzenlemede YALNIZCA platform sahibinde; diğerleri sebebi okuyor', () => {
    expect(KART).toContain('{platformAdmin ? (');
    expect(KART).toContain('Paketi yalnızca Advetics');
  });

  it('KRİTİK: paket yalnızca DEĞİŞTİYSE gönderiliyor', () => {
    /*
     * Platform sahibi olmayan biri için paketi göndermek — değişmemiş olsa
     * bile — sunucuda reddediliyor; ad değişikliği o yüzden düşerdi.
     */
    expect(KART).toContain('...(paket !== agac.paket ? { paket } : {}),');
  });
});

describe('KRİTİK: yeni hesap KURULUNCA ona geçiliyor', () => {
  it('önce kur, sonra switch-manager, sonra tam sayfa', () => {
    /*
     * Kurup eski hesapta kalmak, "kurdum ama nerede" diye seçiciyi
     * aramaktı — ve kurduğu hesabı hemen ayarlaması gerekiyor.
     */
    const bas = KART.indexOf('async function kur(');
    expect(bas, 'kur bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = KART.slice(bas, KART.indexOf('\n  }', bas));
    const kur = dilim.indexOf("apiFetch<ManagerAccountTree>('/manager-account'");
    const gec = dilim.indexOf("apiFetch('/auth/switch-manager'");
    const sayfa = dilim.indexOf("window.location.assign('/ayarlar/ust-hesap')");
    expect(kur).toBeGreaterThan(-1);
    expect(gec).toBeGreaterThan(kur);
    expect(sayfa).toBeGreaterThan(gec);
    // Geçiş YENİ hesabın kimliğiyle — eski aktif hesapla değil.
    expect(dilim).toContain('managerAccountId: yeni.id');
  });

  it('paket seçilerek gönderiliyor', () => {
    expect(KART).toContain('createManagerAccountSchema.safeParse({ name: ad, paket })');
  });
});

describe('KRİTİK: doluluk ekranda', () => {
  it('kart "mevcut / sınır şirket" yazıyor ve dolunca vurguluyor', () => {
    // Kısıta takılan kullanıcı sebebi hata mesajından değil buradan öğrenmeli.
    expect(KART).toContain('<DolulukMetni mevcut={sirketSayisi} sinir={sinir.maxSirket}');
    expect(KART).toContain('const dolu = sinir !== null && mevcut >= sinir;');
  });
});

describe('KRİTİK: kart ekranda ve sayfa besliyor', () => {
  it('ekran kartı şirket listesinin ÜSTÜNE koyuyor', () => {
    const kart = EKRAN.indexOf('<UstHesapKarti');
    const ray = EKRAN.indexOf('<SirketRayi');
    expect(kart).toBeGreaterThan(-1);
    expect(kart).toBeLessThan(ray);
    // Ad/paket değişince ağaç tazeleniyor — yoksa kart eski adı gösterir.
    expect(EKRAN).toContain('onGuncellendi={setAgac}');
  });

  it('sayfa `platformAdmin`ı OTURUMDAN geçiriyor', () => {
    // Sabit `true` yazmak, her org yöneticisine yeni hesap düğmesi göstermekti.
    expect(SAYFA).toContain('platformAdmin={session.platformAdmin}');
  });
});
