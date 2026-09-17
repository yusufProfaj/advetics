import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ SOHBET EKRANININ GÖRÜNÜMÜ ═══
 *
 * Kullanıcının tarifi: *"bu çok kötü bir görüntü … metinlerde '*' '**'
 * işaretleri çıkıyor … sohbet balonu olsun, kimin yazdığı belli olsun"*.
 *
 * Buradaki iddialar üç kararı kilitliyor: modelin markdown'ı EKRANDA
 * GÖRÜNMÜYOR, her balonun bir SAHİBİ var, ve kullanıcının kendi yazdığı
 * metin ayrıştırılmıyor.
 */
const yorumsuz = (m: string): string =>
  m
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const BALON = yorumsuz(readFileSync(join(__dirname, 'sohbet-balonu.tsx'), 'utf8'));
const SOHBET = yorumsuz(readFileSync(join(__dirname, 'ai-asistan-sohbeti.tsx'), 'utf8'));

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(BALON).toContain('export function SohbetBalonu');
    expect(SOHBET).toContain('<SohbetBalonu');
  });
});

describe('kim yazdı', () => {
  it('KRİTİK: kullanıcının ADI, asistanın "Advetics" adı', () => {
    /*
     * Eski hâlde yalnızca hizalama ve renk fark ediyordu; uzun bir planın
     * ortasında kimin konuştuğu kayboluyordu. Beyaz etiketli üründe
     * asistanın adı ürünün adı — model adı değil.
     */
    expect(SOHBET).toContain("m.role === 'user' ? kullaniciAdi : 'Advetics'");
    expect(BALON).toContain('{yazan}');
  });

  it('balonda SAAT de var', () => {
    expect(BALON).toContain('<time');
  });
});

describe('markdown ekranda değil', () => {
  it('KRİTİK: asistanın metni AYRIŞTIRILIYOR', () => {
    expect(BALON).toContain('bloklaraAyir(metin)');
  });

  it('KRİTİK: kullanıcının metni ayrıştırılMIYOR', () => {
    /*
     * Kullanıcı markdown yazmıyor; yazdığı yıldızı kalına çevirmek,
     * yazdığından farklı bir şey göstermek olurdu.
     */
    const i = BALON.indexOf('kullanici ? (');
    expect(i, 'kullanıcı dalı yok — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = BALON.slice(i, BALON.indexOf(') : (', i));
    expect(dilim).toContain('whitespace-pre-wrap');
    expect(dilim).not.toContain('bloklaraAyir');
  });

  it('KRİTİK: HTML üretilmiyor', () => {
    // Markdown'ı HTML'e çevirip basmak, modelin yazdığı dizeyi HTML olarak
    // çalıştırmak olurdu.
    expect(BALON).not.toContain('dangerouslySetInnerHTML');
  });
});

describe('video sorusu', () => {
  it('KRİTİK: video AYRI bir cümleyle reddediliyor', () => {
    /*
     * "Görsel değil" demek, video ekleyen kullanıcıya dosyasının bozuk
     * olduğunu düşündürüyor. Sorun dosyada değil, bizde: video yükleme
     * Meta'nın ayrı bir ucunu ve işlenme beklemeyi gerektiriyor.
     */
    expect(SOHBET).toContain("file.type.startsWith('video/')");
    expect(SOHBET).toContain('video reklamları henüz desteklenmiyor');
  });
});

describe('boş ekran', () => {
  it('KRİTİK: örnek istemler TIKLANINCA KUTUYA yazılıyor, gönderilmiyor', () => {
    // Kullanıcı kendi cümlesine çevirebilmeli; doğrudan göndermek, onun
    // yazmadığı bir isteği yollamak olurdu.
    expect(SOHBET).toContain('onClick={() => setGirdi(o)}');
    expect(SOHBET).toContain('ORNEK_ISTEMLER');
  });

  it('sürükleme sırasında NE OLACAĞI yazılı', () => {
    expect(SOHBET).toContain('Görseli buraya bırak');
  });
});

describe('sohbet listesi', () => {
  const LISTE = yorumsuz(readFileSync(join(__dirname, 'sohbet-listesi.tsx'), 'utf8'));
  const SAYFA = yorumsuz(
    readFileSync(
      join(__dirname, '..', '..', 'app', '(dashboard)', 'reklam-olustur', 'ai-asistan', 'page.tsx'),
      'utf8',
    ),
  );

  it('tarama boşa düşmüyor', () => {
    expect(LISTE).toContain('export function SohbetListesi');
    expect(SAYFA).toContain('<SohbetListesi');
  });

  it('KRİTİK: sınır SABİTTEN okunuyor, ekranda ELLE yazılmıyor', () => {
    /*
     * Sınır sunucuda `SOHBET_SINIRI` ile dayatılıyor. Ekranda "3" yazmak,
     * sınır değiştiğinde kullanıcıya yanlış sayıyı söylemek olurdu — bu
     * depoda fatura boyutu sınırında bir kez yaşandı.
     */
    expect(LISTE).toContain('SOHBET_SINIRI');
    expect(LISTE).toContain('sohbetler.length >= SOHBET_SINIRI');
  });

  it('KRİTİK: sınıra ulaşınca SEBEP yazıyor', () => {
    // Sessizce kaybolan ya da sebepsiz kapanan bir düğme, kullanıcıya
    // özelliğin bozulduğunu düşündürürdü.
    expect(LISTE).toContain('birini sil');
  });

  it('KRİTİK: silme İKİ ADIMDA', () => {
    // Sohbet geçmişi geri alınamıyor; yanlışlıkla tıklanan bir düğme
    // kullanıcının yazdığı planı kaybettirirdi.
    expect(LISTE).toContain('Evet, sil');
    expect(LISTE).toContain('Vazgeç');
  });

  it('KRİTİK: açık sohbet silinince LİSTEYE dönülüyor', () => {
    /*
     * Aynı adreste kalmak, artık var olmayan bir sohbeti yüklemeye çalışmak
     * ve kullanıcıya "önceki sohbet yüklenemedi" hatası göstermek demekti.
     */
    const i = LISTE.indexOf('async function sil');
    expect(i, 'silme yok — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = LISTE.slice(i, LISTE.indexOf('\n  }', i));
    expect(dilim).toContain('if (aktif)');
    expect(dilim).toContain('router.replace');
  });

  it('KRİTİK: liste okunamazsa sohbet ENGELLENMİYOR', () => {
    // Liste bir kolaylık; okunamadığında kullanıcı yine de yazabilmeli.
    // Ama sessiz de kalmamalı.
    expect(SAYFA).toContain('listeSonuc.hata');
    expect(SAYFA).toContain('Sohbet listesi okunamadı');
  });

  it('bağlantılar workspace ve platform parametresini TAŞIYOR', () => {
    // Elle birleştirilen bir bağlantı süzgeci düşürüyor (CLAUDE.md).
    expect(LISTE).toContain('baglanti(');
    expect(LISTE).toContain('musteri: clientId, platform');
  });
});
