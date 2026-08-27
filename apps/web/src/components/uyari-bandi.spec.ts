import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ UYARI BANDI — PANEL KARARLARI ═══
 *
 * Bileşen burada render edilmiyor; iddialar kaynağa çapalı ama her biri tek
 * bir karara. Bir uyarı sisteminde en pahalı hata SESSİZ olanı: gösterilmeyen
 * uyarı, hiç yazılmamış uyarıyla aynı.
 */
const BANT = readFileSync(join(__dirname, 'uyari-bandi.tsx'), 'utf8');
const LAYOUT = readFileSync(
  join(__dirname, '..', 'app', '(dashboard)', 'layout.tsx'),
  'utf8',
);

/** Yorum satırlarını atar — iki dosya da bu kuralları ANLATAN yorumlar taşıyor. */
function kod(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const BANT_KOD = kod(BANT);
const LAYOUT_KOD = kod(LAYOUT);

describe('tarama gerçekten bir şey yakaladı', () => {
  it('dilimler boş değil', () => {
    expect(BANT_KOD.length).toBeGreaterThan(2000);
    expect(LAYOUT_KOD).toContain('UyariBandi');
  });
});

describe('bandın yeri', () => {
  it('KRİTİK: LAYOUT’ta — sayfa gövdesinde değil', () => {
    /*
     * "Hesap platformda kapalı" hangi ekranda olunursa olunsun görünmeli.
     * Sayfa sayfa eklemek, bir gün eklenmeyen sayfada uyarının sessizce
     * kaybolması demekti.
     */
    const i = LAYOUT_KOD.indexOf('<UyariBandi');
    expect(i).toBeGreaterThan(-1);
    // Bant <main>'DEN ÖNCE: uyarı içeriğin altına düşerse görülmez.
    expect(i).toBeLessThan(LAYOUT_KOD.indexOf('<main'));
  });

  it('MCC bayrağı aktif müşteri seçimine bağlı', () => {
    expect(LAYOUT_KOD).toContain(
      'mcc={session.activeClientId === null && session.availableClients.length > 1}',
    );
  });
});

describe('iki görünüm', () => {
  it('KRİTİK: MCC’de uyarılar KODA GÖRE toplanıyor', () => {
    // On iki müşterinin uyarısını tek tek basmak bandı okunmaz yapardı.
    expect(BANT_KOD).toContain('function ToplananBant');
    expect(BANT_KOD).toContain('m.get(u.kod)');
  });

  it('KRİTİK: tek müşteride sayfalı — 1/3 göstergesi', () => {
    expect(BANT_KOD).toContain('function TekTekBant');
    expect(BANT_KOD).toContain('{sayfa + 1}/{uyarilar.length}');
  });

  it('toplanmış bantta ETKİLENEN SAYI yazılı', () => {
    // "ödeme sorunu var" kaç hesabı etkilediğini söylemiyor ve ajans hangi
    // ölçekte bir sorunla karşı karşıya olduğunu bilemiyordu.
    expect(BANT_KOD).toContain('<strong>{grup.length}</strong> hesapta');
  });
});

describe('sessizliğe karşı', () => {
  it('KRİTİK: uç düşerse SÖYLENİYOR — boş bant değil', () => {
    /*
     * Sessizce boş bırakmak "hiç uyarı yok" ile "uyarılar gelmedi"yi aynı
     * gösterirdi; ikincisi bir arıza.
     */
    const i = BANT_KOD.indexOf('if (hata !== null)');
    expect(i).toBeGreaterThan(-1);
    expect(BANT_KOD.slice(i, i + 400)).toContain('Uyarılar alınamadı');
  });

  it('KRİTİK: kesilen liste TOPLAMI yazıyor', () => {
    // "3 uyarı" ile "gösterilen 3, toplam 27" farklı şeyler.
    expect(BANT_KOD).toContain('toplam > uyarilar.length');
  });

  it('hata bandı kullanıcının asıl işini engellemiyor', () => {
    // Uyarı ucu düşerse panel çalışmaya devam etmeli.
    expect(BANT_KOD).toContain('Panelin geri kalanı çalışmaya devam ediyor');
  });
});

describe('gizleme', () => {
  it('KRİTİK: gizleme OTURUM boyunca — kalıcı değil', () => {
    /*
     * Kalıcı saklamak, düzelmiş sanılan bir sorunu kalıcı olarak görünmez
     * yapardı. Sekme kapanınca uyarı geri geliyor.
     */
    expect(BANT_KOD).toContain('sessionStorage.setItem');
    expect(BANT_KOD).not.toContain('localStorage.setItem');
  });

  it('gizleme anahtarı HESAP bazlı — bütün kodu birden susturmuyor', () => {
    // `kod` tek başına anahtar olsaydı bir hesabın ödeme sorununu gizlemek,
    // diğer hesabınkini de gizlerdi.
    expect(BANT_KOD).toContain('`${u.kod}:${u.adAccountId ?? u.clientId ?? \'-\'}`');
  });
});

describe('eylem ve bayatlık', () => {
  it('KRİTİK: "çöz" düğmesi yalnızca panelden çözülebilenlerde', () => {
    /*
     * Ödeme sorununda bir çöz düğmesi göstermek, tıklayınca hiçbir şey
     * yapmayan bir düğme demekti — arayüzün en hızlı güven kaybetme yolu.
     */
    expect(BANT_KOD).toContain('{uyari.eylem && (');
  });

  it('KRİTİK: verinin OKUNMA ANI ekranda', () => {
    /*
     * Hesabın platformdaki durumu yalnızca hesap listesi tazelenirken
     * yazılıyor ve haftalarca eski kalabiliyor. Tarihi göstermeyen bir uyarı,
     * düzeltilmiş bir sorunu haftalarca ekranda tutar.
     */
    expect(BANT_KOD).toContain('{uyari.veriZamani && (');
    expect(BANT_KOD).toContain('formatRelative(uyari.veriZamani)');
  });

  it('ortak istemciden geçiyor — ham fetch yok', () => {
    // Taban adres, httpOnly cookie ve hata biçimi `apiFetch`te tek yerde.
    expect(BANT_KOD).toContain("apiFetch<UyariYaniti>('/alerts')");
    expect(BANT_KOD).not.toContain('credentials:');
  });
});
