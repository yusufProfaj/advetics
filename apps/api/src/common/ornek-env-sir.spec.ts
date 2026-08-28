import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ `.env.example` GERÇEK SIR TAŞIMAZ ═══
 *
 * DEPO HERKESE AÇIK (CLAUDE.md §2) ve örnek dosya git'te izleniyor.
 * `SEED_ADMIN_PASSWORD` bir süre somut bir varsayılan taşıdı: depoyu okuyan
 * herkesin bildiği bir parola, ve `SEED_ADMIN_EMAIL` hesabı o değeri hâlâ
 * kullanıyorsa giriş herkese açık demekti.
 *
 * Diğer bütün sır alanları (`JWT_*`, `META_APP_SECRET`, `GOOGLE_CLIENT_SECRET`,
 * `YOUTUBE_API_KEY`) yer tutucu ya da boştu — yalnızca bir satır kaçmıştı ve
 * kimse fark etmedi. Gözle gözden geçirmek bunu yakalamıyor; tarama yakalıyor.
 */
const ORNEK = readFileSync(join(__dirname, '..', '..', '..', '..', '.env.example'), 'utf8');

/** Sır taşıyan ortam değişkeni adları. */
const SIR_ADI = /(PASSWORD|SECRET|KEY|TOKEN)\s*=/;

/**
 * Yer tutucu sayılan kalıplar.
 *
 * Liste GENİŞ tutuluyor: yanlış alarm, sırrı kaçırmaktan iyi. Ama
 * `REDIS_KEY_PREFIX` gibi sır OLMAYAN alanlar da adında `KEY` taşıyor ve
 * aşağıda ayrıca elenmesi gerekiyor — ad eşleşmesi tek başına yeterli değil.
 */
const YER_TUTUCU = /(buraya|degistir|değiştir|xxx|placeholder|your|change|<|\.\.\.|örnek|ornek|TODO)/i;

/** Adında sır kelimesi geçen ama sır OLMAYAN alanlar. */
const SIR_DEGIL = new Set([
  'REDIS_KEY_PREFIX',
  'ENCRYPTION_ACTIVE_KEY_VERSION',
]);

interface Satir {
  no: number;
  ad: string;
  deger: string;
}

function sirSatirlari(): Satir[] {
  const sonuc: Satir[] = [];
  ORNEK.split('\n').forEach((l, i) => {
    const t = l.trim();
    if (t === '' || t.startsWith('#')) return;
    if (!SIR_ADI.test(l)) return;
    const [ad, ...kalan] = l.split('=');
    const adTemiz = (ad ?? '').trim();
    if (SIR_DEGIL.has(adTemiz)) return;
    sonuc.push({
      no: i + 1,
      ad: adTemiz,
      deger: kalan.join('=').trim().replace(/^["']|["']$/g, ''),
    });
  });
  return sonuc;
}

describe('.env.example', () => {
  it('tarama gerçekten bir şey yakaladı', () => {
    /*
     * Dosya taşınır ya da alan adları değişirse dilim boşalır ve aşağıdaki
     * "sır yok" iddiası BOŞ KÜMEDE her zaman doğru olur — sessiz bir bekçi,
     * olmayan bir bekçidir.
     */
    const satirlar = sirSatirlari();
    expect(satirlar.length).toBeGreaterThanOrEqual(4);
    expect(satirlar.map((s) => s.ad)).toContain('SEED_ADMIN_PASSWORD');
  });

  it('KRİTİK: hiçbir sır alanı GERÇEK değer taşımıyor', () => {
    /*
     * Boş ya da yer tutucu olmak zorunda. Depo herkese açık ve buraya
     * yazılan bir değer, onu okuyan herkesin bildiği bir sır demek.
     */
    const kacanlar = sirSatirlari().filter(
      (s) => s.deger !== '' && !YER_TUTUCU.test(s.deger) && !/^\d+$/.test(s.deger),
    );
    expect(
      kacanlar.map((s) => `satır ${s.no}: ${s.ad}`),
      'örnek dosyada gerçek görünümlü sır var — boşalt ya da yer tutucu yaz',
    ).toEqual([]);
  });
});
