import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gosterilenKimlik, secenekEslesirMi, secenekSuz, vurguParcalari } from './secenek-arama';

/**
 * Kurulum'daki aramalı seçicinin eşleşme kuralı (kullanıcı, 2026-10-14:
 * *"ege yazdığımda asdfasdf ege.com da gözüksün"*). Panelde bileşen çizen
 * test altyapısı yok; karar saf fonksiyonda, kullanımı kaynak taramasıyla.
 */
const MULKLER = [
  { deger: '412345678', etiket: 'asdfasdf ege.com', not: 'Profaj Analytics' },
  { deger: '498765432', etiket: 'Polimek - GA4', not: 'Polimek' },
  { deger: '455555555', etiket: 'İzmir Sahil Konutları', not: 'Profaj' },
  { deger: '466666666', etiket: 'Kampanya sitesi', not: 'Begebe Ajans' },
];

describe('secenekSuz: metnin İÇİNDE geçen eşleşme', () => {
  it('KRİTİK: "ege" yazınca "asdfasdf ege.com" listede (baştan değil içinden)', () => {
    // Bu satırda "ege" YALNIZ etiketin ortasında geçiyor (not ve numara
    // taşımıyor): baştan eşleşmeye dönen bir kural burada düşer.
    expect(secenekSuz(MULKLER, 'ege').map((m) => m.etiket)).toContain('asdfasdf ege.com');
  });

  it('nottaki (Analytics hesabı) ada da bakar', () => {
    // "Begebe" nottan eşleşiyor; etiket "Kampanya sitesi" "ege" taşımıyor.
    expect(secenekSuz(MULKLER, 'ege').map((m) => m.etiket)).toEqual(['asdfasdf ege.com', 'Kampanya sitesi']);
  });

  it('büyük/küçük harf ve Türkçe İ: "izmir" → "İzmir Sahil Konutları"', () => {
    expect(secenekSuz(MULKLER, 'izmir').map((m) => m.etiket)).toEqual(['İzmir Sahil Konutları']);
    expect(secenekSuz(MULKLER, 'EGE.COM').map((m) => m.etiket)).toEqual(['asdfasdf ege.com']);
  });

  it('boş arama her şeyi gösterir; eşleşmeyen arama hiçbir şey', () => {
    expect(secenekSuz(MULKLER, '   ')).toHaveLength(MULKLER.length);
    expect(secenekSuz(MULKLER, 'zzzz')).toEqual([]);
  });

  it('mülk numarasıyla da bulunur', () => {
    expect(secenekSuz(MULKLER, '498765').map((m) => m.etiket)).toEqual(['Polimek - GA4']);
  });

  it('KRİTİK: Google Ads numarası tiresiz yazılınca tireli kimliği bulur', () => {
    const s = { deger: '7c9e6679-7425-40de-944b-e07fc1f90ae7', etiket: 'EgeBirlikYapı(Yeni) · 516-174-6317' };
    expect(secenekEslesirMi(s, '5161746317')).toBe(true);
    expect(secenekEslesirMi(s, '516 174 6317')).toBe(true);
  });

  it('KRİTİK: UUID aranmaz — ekranda görünmeyen harfler satır getirmez', () => {
    const s = { deger: '7c9e6679-7425-40de-944b-e07fc1f90ae7', etiket: 'Ege Birlik Yapı · act_1602474151544739' };
    expect(secenekEslesirMi(s, '40de')).toBe(false);
    expect(secenekEslesirMi(s, '7425')).toBe(false);
  });
});

describe('gosterilenKimlik', () => {
  it('UUID gizlenir, platform kimliği gösterilir', () => {
    expect(gosterilenKimlik('7c9e6679-7425-40de-944b-e07fc1f90ae7')).toBeNull();
    expect(gosterilenKimlik('412345678')).toBe('412345678');
    expect(gosterilenKimlik('accounts/1/containers/2')).toBe('accounts/1/containers/2');
  });
});

describe('vurguParcalari', () => {
  it('eşleşen parçayı ayırır, özgün büyük harfi korur', () => {
    expect(vurguParcalari('asdfasdf Ege.com', 'ege')).toEqual({ once: 'asdfasdf ', eslesen: 'Ege', sonra: '.com' });
  });
  it('etikette eşleşme yoksa (not/kimlikten eşleşti) null', () => {
    expect(vurguParcalari('Kampanya sitesi', 'ege')).toBeNull();
    expect(vurguParcalari('Kampanya sitesi', '')).toBeNull();
  });
});

describe('Kurulum seçimi aramalı seçiciyi kullanıyor (kaynak taraması)', () => {
  const KAYNAK = readFileSync(join(__dirname, '../components/marka-merkezi/kurulum-bolumu.tsx'), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const i = KAYNAK.indexOf('function SecimPaneli(');
  const j = KAYNAK.indexOf('function TetikFormu(');
  if (i < 0 || j < 0) throw new Error('SecimPaneli gövdesi bulunamadı — tarama boşa düştü');
  const GOVDE = KAYNAK.slice(i, j);

  it('KRİTİK: "Mevcut olanı kullan" listesi AramaliSecim, düz açılır liste değil', () => {
    expect(GOVDE).toContain('<AramaliSecim secenekler={v.mevcut} deger={mevcut} onDegis={setMevcut}');
    expect(GOVDE).not.toContain('v.mevcut.map(');
  });
});
