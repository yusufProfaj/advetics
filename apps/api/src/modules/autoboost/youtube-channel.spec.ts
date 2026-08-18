import { describe, expect, it } from 'vitest';
import { parseChannelInput } from './youtube-channel';

/**
 * KULLANICI NE YAPIŞTIRACAĞINI BİLMİYOR ve bilmesi de gerekmiyor.
 *
 * Bu ürünün hedef kullanıcısı reklamcılık bilmiyor; "kanal kimliği" diye bir
 * kavramı da yok. Sahadan gelen her biçim burada karşılanıyor, karşılanamayan
 * biçimlerde ise NE YAPACAĞI söyleniyor — "geçersiz" demek, kullanıcıyı hatayı
 * kendi yazımında aramaya iter.
 */

const ID = 'UCBR8-60-B28hp2BmDPdntcQ';

describe('doğrudan kimlik', () => {
  it('ham kanal kimliği', () => {
    expect(parseChannelInput(ID)).toEqual({ kind: 'id', channelId: ID });
  });

  it('baştaki/sondaki boşluk kırpılıyor', () => {
    // Kopyala-yapıştırda boşluk çok sık geliyor.
    expect(parseChannelInput(`  ${ID}  `)).toEqual({ kind: 'id', channelId: ID });
  });

  it('KRİTİK: kimliğe BENZEYEN ama geçersiz dizge kabul edilmiyor', () => {
    // Kanal kimlikleri UC ile başlıyor ve tam 24 karakter; gevşek eşleme
    // uydurulmuş bir kimliği API'ye gönderip "bulunamadı" hatası üretirdi ve
    // kullanıcı sorunu yanlış yerde arardı.
    expect(parseChannelInput('UC123').kind).toBe('unsupported');
    expect(parseChannelInput('AB' + 'x'.repeat(22)).kind).toBe('unsupported');
  });
});

describe('tanıtıcı (handle)', () => {
  it('ham tanıtıcı', () => {
    expect(parseChannelInput('@kanaladi')).toEqual({ kind: 'handle', handle: 'kanaladi' });
  });

  it('tanıtıcı adresi', () => {
    expect(parseChannelInput('https://www.youtube.com/@kanaladi')).toEqual({
      kind: 'handle',
      handle: 'kanaladi',
    });
  });

  it('KRİTİK: panelden kopyalanan hâli — alt yol ve sorgu ile', () => {
    // Kullanıcı kanal sayfasındayken adres çubuğunda genelde bu var.
    expect(
      parseChannelInput('https://www.youtube.com/@kanaladi/videos?view=0&sort=dd'),
    ).toEqual({ kind: 'handle', handle: 'kanaladi' });
  });

  it('ŞEMASIZ adres de çözülüyor', () => {
    // `new URL` şemasız girdiyi reddediyor; reddetseydik kullanıcı hatayı
    // kendi yazımında arardı.
    expect(parseChannelInput('youtube.com/@kanaladi')).toEqual({
      kind: 'handle',
      handle: 'kanaladi',
    });
  });
});

describe('kanal adresi', () => {
  it('/channel/UC… çözülüyor', () => {
    expect(parseChannelInput(`https://www.youtube.com/channel/${ID}`)).toEqual({
      kind: 'id',
      channelId: ID,
    });
  });

  it('sondaki eğik çizgi kırmıyor', () => {
    expect(parseChannelInput(`https://youtube.com/channel/${ID}/`)).toEqual({
      kind: 'id',
      channelId: ID,
    });
  });

  it('adresteki BOZUK kimlik reddediliyor', () => {
    expect(parseChannelInput('https://youtube.com/channel/bozuk').kind).toBe('unsupported');
  });
});

describe('çözülemeyen biçimler — NE YAPACAĞI söyleniyor', () => {
  it('KRİTİK: /c/ ve /user/ TAHMİN EDİLMİYOR', () => {
    /*
     * `forUsername` yalnızca çok eski hesaplarda çalışıyor; çoğunda boş
     * dönüyor ve "kanal bulunamadı" gibi görünüyor — oysa sorun yapıştırılan
     * biçimde. Tahmin etmek yerine ne yapacağını söylüyoruz.
     */
    for (const u of ['https://youtube.com/c/OzelAd', 'https://youtube.com/user/Eski']) {
      const r = parseChannelInput(u);
      expect(r.kind).toBe('unsupported');
      expect(r.kind === 'unsupported' && r.reason).toMatch(/@tanıtıcıyı yapıştır/);
    }
  });

  it('KRİTİK: VİDEO adresi ayrı bir mesaj alıyor', () => {
    // En sık yapılan karışıklık. Genel "anlaşılamadı" mesajı kullanıcıya
    // hiçbir şey söylemezdi.
    for (const u of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
    ]) {
      const r = parseChannelInput(u);
      expect(r.kind).toBe('unsupported');
      expect(r.kind === 'unsupported' && r.reason).toMatch(/VİDEO adresi/);
    }
  });

  it('YouTube olmayan adres reddediliyor', () => {
    const r = parseChannelInput('https://vimeo.com/kanal');
    expect(r.kind).toBe('unsupported');
    expect(r.kind === 'unsupported' && r.reason).toMatch(/YouTube adresi değil/);
  });

  it('boş girdi', () => {
    expect(parseChannelInput('').kind).toBe('unsupported');
    expect(parseChannelInput('   ').kind).toBe('unsupported');
  });

  it('KRİTİK: her reddetme mesajı ÖRNEK içeriyor', () => {
    /*
     * "Geçersiz" demek kullanıcıyı hatayı kendi yazımında aramaya iter. Bu
     * ürünün hedef kullanıcısı reklamcılık bilmiyor; ona ne yapacağını
     * göstermek zorundayız.
     */
    for (const u of ['abc', 'https://vimeo.com/x', 'https://youtube.com/c/X']) {
      const r = parseChannelInput(u);
      expect(r.kind).toBe('unsupported');
      expect((r as { reason: string }).reason.length).toBeGreaterThan(20);
    }
  });
});
