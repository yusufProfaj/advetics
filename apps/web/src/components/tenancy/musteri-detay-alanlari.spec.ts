import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ WORKSPACE SATIRI — ALAN ZİNCİRİ ═══
 *
 * Satırın gösterdiği her alan İKİ yerde birden yazılı olmak zorunda:
 *
 *   1. `clients.service.ts` → `list()` seçimi   (uç gerçekten döndürüyor mu)
 *   2. `workspace-satirlari.tsx` → `WorkspaceSatiri` tipi ve çizim
 *
 * İkisi ayrıştığında HİÇBİR ARAÇ SES ÇIKARMIYOR. `serverApiFetch<T>`
 * denetimsiz bir dönüşüm: tipe alan eklenip uçtaki `select`e eklenmezse alan
 * `undefined` geliyor ve satır sessizce "Hesap atanmamış" ya da "0 kişi"
 * diyor — oysa hesaplar veritabanında duruyor.
 *
 * 2026-10-13'E KADAR bu zincir workspace PENCERESİNİN (`musteri-karti.tsx`)
 * firma alanlarını kilitliyordu. Pencere kalktı (MIMARI Ç-23); firma
 * alanlarının evi Marka Merkezi › Workspace bilgileri ve o ekranın zinciri
 * kendi testinde. `list()` firma alanlarını döndürmeye devam ediyor (Marka
 * Merkezi ve başka tüketiciler okuyor) — burada kilitlenen yalnız SATIRIN
 * okuduğu alanlar.
 */
const SATIRLAR = readFileSync(join(__dirname, 'workspace-satirlari.tsx'), 'utf8');
const SERVIS = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'api', 'src', 'modules', 'tenancy', 'clients.service.ts'),
  'utf8',
);

/** Yorumsuz kaynak — zinciri ANLATAN yorumlar alan adlarını taşıyor. */
function kod(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

const SATIR_KOD = kod(SATIRLAR);
const SERVIS_KOD = kod(SERVIS);

/** `list()` gövdesi — başka metotların `select`leri iddiayı boşa düşürmesin. */
function listGovdesi(): string {
  const bas = SERVIS_KOD.indexOf('async list(');
  expect(bas, 'clients.service.ts içinde list() bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
  const son = SERVIS_KOD.indexOf('\n  async ', bas + 10);
  return SERVIS_KOD.slice(bas, son === -1 ? undefined : son);
}

/** Satırda çizilen üst düzey alanlar — `s.<alan>` kullanımından. */
const CIZILEN = [...new Set([...SATIR_KOD.matchAll(/\bs\.([a-zA-Z_]+)\b/g)].map((m) => m[1]!))];

describe('workspace satırının alan zinciri', () => {
  it('tarama gerçekten bir şey yakaladı', () => {
    // Dilim boşalırsa aşağıdaki "hepsi var" iddiaları BOŞ KÜMEDE doğru olur.
    expect(CIZILEN).toEqual(expect.arrayContaining(['name', 'slug', 'status', '_count', 'adAccounts', 'socialProfiles']));
    expect(listGovdesi().length).toBeGreaterThan(200);
  });

  it.each(['name', 'slug', 'status', 'adAccounts', 'socialProfiles'])(
    'KRİTİK: satırın okuduğu %s list() seçiminde',
    (alan) => {
      expect(listGovdesi(), `${alan} list() seçiminde yok — uçtan undefined gelir`).toMatch(
        new RegExp(`\\b${alan}: (true|\\{)`),
      );
    },
  );

  it('KRİTİK: sayılar (_count) iki alanı da seçiyor — "0 kişi" yalanı olmasın', () => {
    expect(SATIR_KOD).toContain('s._count.adAccounts');
    expect(SATIR_KOD).toContain('s._count.memberships');
    expect(listGovdesi()).toContain('_count: { select: { adAccounts: true, memberships: true } }');
  });

  it('KRİTİK: izleme durumu (syncEnabled) hesap seçiminde — "veri çekilmiyor" uyarısı ona bağlı', () => {
    expect(SATIR_KOD).toContain('a.syncEnabled');
    const hesaplar = listGovdesi().slice(listGovdesi().indexOf('adAccounts: {'));
    expect(hesaplar).toContain('syncEnabled: true');
    expect(hesaplar).toContain('platform: true');
  });

  it('profil türü seçimde — kanal logosu ona bağlı', () => {
    expect(SATIR_KOD).toContain('profilKanali(p.profileType)');
    expect(listGovdesi().slice(listGovdesi().indexOf('socialProfiles: {'))).toContain('profileType: true');
  });
});

/**
 * ═══ PENCERELER PORTAL KULLANMAK ZORUNDA ═══
 *
 * `fixed inset-0` "ekranın tamamı" DEMEK DEĞİL: `transform`, `filter` ya da
 * `backdrop-filter` taşıyan bir ata, sabit konumlu alt öğeler için KAPSAYICI
 * BLOK oluşturuyor. Yönetim paneli üst bardaki `backdrop-blur`lu `<header>`ın
 * içindeydi ve pencere 64 puntoluk başlık kutusuna sıkışıyordu.
 *
 * `musteri-detay.tsx` (pencere kabuğu) DURUYOR: `DanismanAta` onu panel
 * olarak kullanıyor (MIMARI § Korunacak). Kural onun için geçerli.
 */
describe('tam ekran pencereler', () => {
  const DETAY = readFileSync(join(__dirname, 'musteri-detay.tsx'), 'utf8');

  it('musteri-detay.tsx pencereyi document.body altına taşıyor', () => {
    const k = kod(DETAY);
    /*
     * İDDİA ÇAĞRIYA ÇAPALI, ADA DEĞİL: `import { createPortal }` satırına
     * takılan bir iddia çağrı silindiğinde düşmüyordu.
     */
    expect(k).toContain('return createPortal(');
    expect(k).toContain('document.body');
    expect(k).toContain('fixed inset-0');
  });
});
