import { describe, expect, it } from 'vitest';
import { apiFetch, ApiRequestError } from './api';

/**
 * API İSTEMCİSİ — BOŞ GÖVDE JSON DEĞİL.
 *
 * Canlıda görülen hata: "E-posta ayarları alınamadı — Unexpected end of JSON
 * input". Yanıt BAŞARILIYDI ve anlamı "henüz ayar yok" idi; NestJS bir uç
 * `null` döndürdüğünde gövdeyi boş bırakıyor ve durum kodu 200 kalıyor.
 * `res.json()` o gövdede patlıyor ve hata, uç noktanın düştüğü sanılacak
 * biçimde ekrana çıkıyor.
 *
 * `null` dönebilen HER uç bu tuzağa açıktı.
 */
function sahteFetch(yanit: { status: number; body: string; ok?: boolean }) {
  globalThis.fetch = (async () =>
    ({
      ok: yanit.ok ?? (yanit.status >= 200 && yanit.status < 300),
      status: yanit.status,
      statusText: 'x',
      text: async () => yanit.body,
      json: async () => JSON.parse(yanit.body),
    }) as unknown as Response) as typeof fetch;
}

describe('apiFetch', () => {
  it('KRİTİK: 200 + BOŞ gövde undefined dönüyor — patlamıyor', async () => {
    sahteFetch({ status: 200, body: '' });
    await expect(apiFetch('/x')).resolves.toBeUndefined();
  });

  it('204 undefined dönüyor', async () => {
    sahteFetch({ status: 204, body: '' });
    await expect(apiFetch('/x')).resolves.toBeUndefined();
  });

  it('dolu gövde ayrıştırılıyor', async () => {
    sahteFetch({ status: 200, body: '{"a":1}' });
    await expect(apiFetch('/x')).resolves.toEqual({ a: 1 });
  });

  it('JSON literal `null` da çalışıyor — gövde boş değil ama değer null', async () => {
    sahteFetch({ status: 200, body: 'null' });
    await expect(apiFetch('/x')).resolves.toBeNull();
  });

  it('hata yanıtında sunucunun KENDİ mesajı taşınıyor', async () => {
    // "Bir hata oluştu" demek, düzeltilebilir bir sebebi gizlerdi.
    sahteFetch({
      status: 400,
      body: '{"statusCode":400,"code":"VALIDATION","message":"Parola zorunlu"}',
    });
    await expect(apiFetch('/x')).rejects.toThrow('Parola zorunlu');
  });

  it('gövdesi JSON olmayan hata da anlamlı mesaj veriyor', async () => {
    sahteFetch({ status: 502, body: '<html>bad gateway</html>' });
    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe('mesajaKodEkle — sunucu hatası logda bulunabilsin', () => {
  it('5xx mesajına kısa hata kodu ekleniyor', async () => {
    const { mesajaKodEkle } = await import('./api');
    expect(mesajaKodEkle('Beklenmeyen bir hata oluştu', 500, 'f6b9f355-d989-4c79')).toBe(
      'Beklenmeyen bir hata oluştu (hata kodu: f6b9f355)',
    );
  });
  it('4xx ve kimliksiz yanıt olduğu gibi kalıyor', async () => {
    const { mesajaKodEkle } = await import('./api');
    expect(mesajaKodEkle('Bu alan zorunlu', 400, 'abc12345-x')).toBe('Bu alan zorunlu');
    expect(mesajaKodEkle('x', 500, undefined)).toBe('x');
    expect(mesajaKodEkle('x', 500, '-')).toBe('x');
  });
  it('KRİTİK: hata yolu yardımcıyı GERÇEKTEN çağırıyor', async () => {
    const asil = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Beklenmeyen bir hata oluştu', requestId: 'f6b9f355-aaaa' }), {
        status: 500,
      })) as typeof fetch;
    try {
      await expect(apiFetch('/x')).rejects.toThrow('(hata kodu: f6b9f355)');
    } finally {
      globalThis.fetch = asil;
    }
  });
});

describe('alanHatalariniEkle — doğrulama hatası alanı söylüyor', () => {
  it('KRİTİK: alan ve sebep mesaja ekleniyor, dizi elemanı birden sayılıyor', async () => {
    const { alanHatalariniEkle } = await import('./api');
    expect(
      alanHatalariniEkle('Doğrulama hatası', [
        { field: 'to_emails.1', message: 'Geçerli bir e-posta adresi değil' },
        { field: 'subject', message: 'Boş bırakılamaz' },
      ]),
    ).toBe('Doğrulama hatası: Alıcı 2: Geçerli bir e-posta adresi değil · Konu: Boş bırakılamaz');
  });

  it('tanınmayan alan ham adıyla, üçten fazlası sayıyla yazılıyor', async () => {
    const { alanHatalariniEkle } = await import('./api');
    const m = alanHatalariniEkle(
      'Doğrulama hatası',
      ['a', 'b', 'c', 'd', 'e'].map((f) => ({ field: f, message: 'x' })),
    );
    expect(m).toBe('Doğrulama hatası: a: x · b: x · c: x · +2 alan daha');
    expect(alanHatalariniEkle('Hata', undefined)).toBe('Hata');
  });

  it('KRİTİK: hata yolu alanları GERÇEKTEN ekliyor', async () => {
    const asil = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Doğrulama hatası',
          errors: [{ field: 'subject', message: 'Boş bırakılamaz' }],
        }),
        { status: 400 },
      )) as typeof fetch;
    try {
      await expect(apiFetch('/x')).rejects.toThrow('Doğrulama hatası: Konu: Boş bırakılamaz');
    } finally {
      globalThis.fetch = asil;
    }
  });
});

describe('varlık önizleme adresi', () => {
  it('göreli adresin önüne API_URL ekliyor, mutlak adrese dokunmuyor', async () => {
    const { onizlemeAdresi, API_URL } = await import('./api');
    expect(onizlemeAdresi('/assets/x/preview')).toBe(`${API_URL}/assets/x/preview`);
    expect(onizlemeAdresi('https://cdn.example/x.png')).toBe('https://cdn.example/x.png');
  });

  it('KRİTİK: hiçbir bileşen göreli previewUrl’i doğrudan src’ye koymuyor', async () => {
    // Logo sekmesi ve AI asistan bunu yapıyordu: istek panelin kendi
    // adresine gidip 404 dönüyor, kutuda "Görsel yok" yazıyordu.
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const kok = join(__dirname, '..');
    const dosyalar: string[] = [];
    const gez = (d: string): void => {
      for (const ad of readdirSync(d)) {
        const y = join(d, ad);
        if (statSync(y).isDirectory()) gez(y);
        else if (y.endsWith('.tsx')) dosyalar.push(y);
      }
    };
    gez(kok);
    expect(dosyalar.length).toBeGreaterThan(50);
    const ihlal = dosyalar.filter((f) => /src=\{\s*[\w.[\]]+\.previewUrl\s*\}/.test(readFileSync(f, 'utf8')));
    expect(ihlal).toEqual([]);
  });
});
