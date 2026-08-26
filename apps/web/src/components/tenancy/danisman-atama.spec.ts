import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { adayEngeli, atamalariYurut } from './danisman-atama';

const CLIENT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const BASKA = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('adayEngeli', () => {
  it('hiç üyeliği olmayan danışman atanabiliyor', () => {
    // Ajans personeli önce açılıp yetkisi sonra veriliyor; üyeliksiz kullanıcı
    // istisna değil normal ve atamanın asıl hedefi tam bu kişi.
    expect(adayEngeli([], CLIENT)).toBeNull();
  });

  it('başka müşterilerde yetkisi olan danışman atanabiliyor', () => {
    expect(adayEngeli([{ clientId: BASKA }], CLIENT)).toBeNull();
  });

  it('bu workspace’te zaten yetkisi olan engelleniyor', () => {
    // Sunucu mükerrer üyeliği 409 ile reddediyor; seçtirmek hata almaya davet.
    expect(adayEngeli([{ clientId: CLIENT }], CLIENT)).toBe('Bu workspace’e zaten erişiyor');
  });

  it('org geneli erişimi olan engelleniyor', () => {
    /*
     * Bu satır SUNUCUDA REDDEDİLMİYOR — `clientId` farklı olduğu için
     * çakışma yok ve ikinci bir üyelik gerçekten yazılıyor. Engel anlamsal:
     * kişi zaten her müşteriyi görüyor. Kontrol kalkarsa hiçbir hata
     * çıkmıyor, yalnızca ekip listesinde kafa karıştıran bir satır oluşuyor.
     */
    expect(adayEngeli([{ clientId: null }], CLIENT)).toBe(
      'Tüm müşterilere erişiyor — ayrıca atanması gerekmiyor',
    );
  });

  it('bu workspace yetkisi org geneli yetkiden ÖNCE bildiriliyor', () => {
    // İkisi de varsa doğru cevap "zaten burada": yönetici asıl bunu soruyor.
    expect(adayEngeli([{ clientId: null }, { clientId: CLIENT }], CLIENT)).toBe(
      'Bu workspace’e zaten erişiyor',
    );
  });
});

describe('atamalariYurut', () => {
  const DORT = [
    { id: '1', ad: 'Ada' },
    { id: '2', ad: 'Bora' },
    { id: '3', ad: 'Ceren' },
    { id: '4', ad: 'Deniz' },
  ];

  it('hepsi başarılıysa hepsi sayılıyor', async () => {
    const sonuc = await atamalariYurut(DORT, () => Promise.resolve());
    expect(sonuc).toEqual({ basarili: 4, hatalar: [] });
  });

  it('ortadaki hata döngüyü KESMİYOR — kalanlar da deneniyor', async () => {
    /*
     * Bu iddia bir kez üretimde ödendi: kısmi başarıda kuyruğun hiç
     * denenmemesi, kullanıcının "atanmadı" görüp tekrar denemesi ve ilk
     * atananlarda 409 yemesi demek.
     */
    const gonder = vi.fn((id: string) =>
      id === '2' ? Promise.reject(new Error('Bu kullanıcının zaten bu kapsamda erişimi var')) : Promise.resolve(),
    );
    const sonuc = await atamalariYurut(DORT, gonder);

    expect(gonder).toHaveBeenCalledTimes(4);
    expect(sonuc.basarili).toBe(3);
    expect(sonuc.hatalar).toEqual([
      'Bora: Bu kullanıcının zaten bu kapsamda erişimi var',
    ]);
  });

  it('hata mesajı KİMİN atanamadığını yazıyor', async () => {
    // "1 kişi atanamadı" demek, hangisinin atanmadığını aramak demek.
    const sonuc = await atamalariYurut(DORT, (id) =>
      id === '4' ? Promise.reject(new Error('yetkiniz yok')) : Promise.resolve(),
    );
    expect(sonuc.hatalar).toHaveLength(1);
    expect(sonuc.hatalar[0]).toContain('Deniz');
    expect(sonuc.hatalar[0]).toContain('yetkiniz yok');
  });

  it('hepsi düşerse başarılı SIFIR — "atandı" denmiyor', async () => {
    const sonuc = await atamalariYurut(DORT, () => Promise.reject(new Error('düştü')));
    expect(sonuc.basarili).toBe(0);
    expect(sonuc.hatalar).toHaveLength(4);
  });

  it('istekler SIRAYLA gidiyor — paralel değil', async () => {
    /*
     * `Promise.all` ilk reddedilende geri kalanların sonucunu belirsiz
     * bırakıyor: bazıları yazılmış oluyor ve hangileri olduğu ekranda
     * gösterilemiyor. Eşzamanlı çağrı sayısını sayarak kilitliyoruz.
     */
    let acik = 0;
    let enYuksek = 0;
    await atamalariYurut(DORT, async () => {
      acik += 1;
      enYuksek = Math.max(enYuksek, acik);
      await Promise.resolve();
      acik -= 1;
    });
    expect(enYuksek).toBe(1);
  });
});

/**
 * ═══ EKRAN, KARARLARI GERÇEKTEN KULLANIYOR MU ═══
 *
 * Bu oturumda üç test mutasyonla boş çıktı ve biri tam olarak buydu: bir
 * fonksiyon test edilmişti ama ÇAĞRILDIĞI test edilmemişti. Yukarıdaki
 * iddiaların hiçbiri, `danisman-ata.tsx` kendi kopyasını kurarsa düşmez.
 */
describe('pencere bu kararları kullanıyor', () => {
  const EKRAN = readFileSync(join(__dirname, 'danisman-ata.tsx'), 'utf8');
  const SAYFA = readFileSync(
    join(__dirname, '..', '..', 'app', '(dashboard)', 'ayarlar', 'musteriler', '[id]', 'ekip', 'page.tsx'),
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

  const EKRAN_KOD = kod(EKRAN);

  it('tarama gerçekten bir şey yakaladı', () => {
    // Dilim boşalırsa aşağıdaki iddialar BOŞ METİNDE hep doğru olurdu.
    expect(EKRAN_KOD.length).toBeGreaterThan(1000);
    expect(EKRAN_KOD).toContain('DanismanAta');
  });

  it('engel kararı ortak fonksiyondan geliyor', () => {
    expect(EKRAN_KOD).toContain('adayEngeli(');
  });

  it('atama döngüsü ortak fonksiyondan geliyor', () => {
    expect(EKRAN_KOD).toContain('atamalariYurut(');
  });

  it('düğme yalnızca org yöneticisine gösteriliyor', () => {
    /*
     * `POST /memberships` `@RequireOrgAdmin()` istiyor. Düğmeyi herkese
     * gösterip 403 aldırmak, yapılamayacak bir işi yapılabilir göstermek.
     */
    const k = kod(SAYFA);
    const i = k.indexOf('<DanismanAta');
    expect(i, 'ekip sayfasında <DanismanAta yok — tarama boşa düştü').toBeGreaterThan(-1);
    // Koşul, ELEMANIN KENDİSİNDEN geriye doğru aranıyor: dosyanın başka bir
    // yerindeki `isOrgAdmin` geçişine takılan bir iddia hiçbir zaman düşmez.
    expect(k.slice(0, i)).toMatch(/session\.isOrgAdmin && \($/m);
  });

  it('kısmi başarı ekranda tek tek yazılıyor', () => {
    // `sonuc.hatalar` çizilmezse "3 kişi atandı" yazıp dördüncüsü yutulur.
    expect(EKRAN_KOD).toContain('sonuc.hatalar.map(');
  });
});
