import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GERI_BESLEME_OLAY_DURUMLARI, LEAD_STATUSES, type GeriBeslemeAyari, type GeriBeslemeOlayDurumu, type GeriBeslemeOlayi } from '@advetics/shared';
import {
  DURUM_KISA_ADI,
  KALITE_SECENEKLERI,
  degisimMetni,
  durumTonu,
  geriAlinamayanlar,
  geriAlmaBitisMs,
  geriAlmaKalanDk,
  gonderimlerAdresi,
  olayNotu,
  rozetGorunumu,
  seritGorunumu,
} from './geri-besleme';

/**
 * ═══ POTANSİYEL MÜŞTERİLER › META'YA GERİ BESLEME (Paket E, Ajan 3) ═══
 *
 * Saf kararlar ÇALIŞTIRILARAK; ekran bağları kaynak taramasıyla (bileşen
 * render eden test altyapısı yok, bilinçli). Taramalar yorumsuz kaynakta.
 */
const sayilar = (ek: Partial<Record<GeriBeslemeOlayDurumu, number>> = {}) =>
  ({ ...Object.fromEntries(GERI_BESLEME_OLAY_DURUMLARI.map((d) => [d, 0])), ...ek }) as Record<GeriBeslemeOlayDurumu, number>;

const AYAR: GeriBeslemeAyari = {
  clientId: 'c',
  platform: 'meta',
  etkin: true,
  datasetId: '1234567890',
  datasetAdi: 'Ege Birlik Yapı pikseli',
  durum: 'calisiyor',
  neden: 'Son başarılı gönderim: 12 Ekim 10:42',
  etkinlestiren: null,
  etkinlestirmeZamani: null,
  uygunlukEksikleri: [],
  sayilar: sayilar(),
  secenekler: [],
  secenekNotu: null,
};

describe('soru seçenekleri', () => {
  it('KRİTİK: her seçenek VAR OLAN bir lead durumu (yeni alan yok, Ç-1) ve "Yeni" seçenek değil', () => {
    for (const s of KALITE_SECENEKLERI) expect(LEAD_STATUSES).toContain(s.durum);
    expect(KALITE_SECENEKLERI.map((s) => s.durum)).toEqual(['lost', 'contacted', 'qualified', 'won']);
    expect(Object.keys(DURUM_KISA_ADI).sort()).toEqual([...LEAD_STATUSES].sort());
  });

  it('metinlerde uzun tire yok (panel metin dili)', () => {
    const tum = [...KALITE_SECENEKLERI.flatMap((s) => [s.etiket, s.ipucu]), ...Object.values(DURUM_KISA_ADI)].join(' ');
    expect(tum).not.toMatch(/—/);
  });
});

describe('geri alma penceresi', () => {
  it('KRİTİK: 15 dakika içinde kalan dakika, sonra YOK (gitmiş olayı geri alınmış sandırmasın)', () => {
    const t = Date.parse('2026-10-12T10:00:00Z');
    expect(geriAlmaKalanDk(t, t + 60_000)).toBe(14);
    expect(geriAlmaKalanDk(t, t + 14.5 * 60_000)).toBe(1);
    expect(geriAlmaKalanDk(t, t + 15 * 60_000)).toBeNull();
  });
});

describe('geri alma geç kaldıysa söyleniyor (Ajan 4 N-1)', () => {
  it('KRİTİK: yeni durumun ima ETMEDİĞİ ama gitmiş ya da yolda olan aşamalar listeleniyor', () => {
    const r = {
      tur: 'iletildi' as const,
      metin: '',
      asamalar: [
        { asama: 'ham_lead' as const, durum: 'iletildi' as const, hata: null, zaman: '' },
        { asama: 'ulasildi' as const, durum: 'iletildi' as const, hata: null, zaman: '' },
        { asama: 'nitelikli' as const, durum: 'gonderiliyor' as const, hata: null, zaman: '' },
        { asama: 'satisa_dondu' as const, durum: 'iptal' as const, hata: null, zaman: '' },
      ],
    };
    // Müşteri oldu → Görüştük geri alındı: ilgili aşama yolda, geri alınamadı.
    expect(geriAlinamayanlar(r, 'contacted')).toEqual(['İlgili']);
    expect(geriAlinamayanlar(r, 'qualified')).toEqual([]);
    expect(geriAlinamayanlar(undefined, 'new')).toEqual([]);
  });

  it('pencere bitişi 15 dakika sonra (zamanlayıcı bunu kullanıyor)', () => {
    expect(geriAlmaBitisMs(1000)).toBe(1000 + 15 * 60_000);
  });
});

describe('rozet', () => {
  it('KRİTİK: kapalı ve yok rozetsiz; sorun kırmızı; iletildi sessiz', () => {
    expect(rozetGorunumu(undefined)).toBeNull();
    expect(rozetGorunumu({ tur: 'kapali', metin: 'x', asamalar: [] })).toBeNull();
    expect(rozetGorunumu({ tur: 'yok', metin: 'x', asamalar: [] })).toBeNull();
    expect(rozetGorunumu({ tur: 'sorun', metin: 'Müşteri oldu bilgisi gönderilemedi', asamalar: [] })).toEqual({
      metin: 'Müşteri oldu bilgisi gönderilemedi',
      ton: 'sorun',
    });
    expect(rozetGorunumu({ tur: 'iletildi', metin: 'Meta’ya iletildi', asamalar: [] })?.ton).toBe('sessiz');
    expect(rozetGorunumu({ tur: 'bekliyor', metin: 'Meta’ya iletilecek', asamalar: [] })?.ton).toBe('notr');
  });
});

describe('şerit', () => {
  it('KRİTİK: ayar okunamadıysa "kapalı" DEMİYOR, sunucunun cümlesini taşıyor ve eylem yok', () => {
    const g = seritGorunumu({ durum: 'hata', mesaj: 'Sunucuya ulaşılamadı' });
    expect(g).toEqual({ baslik: 'Meta’ya bildirim durumu okunamadı', alt: 'Sunucuya ulaşılamadı', ton: 'sorun', eylem: null });
  });

  it('kapalı: "Aç"; çalışıyor: veri kümesi + son gönderim; hata: bekleyen sayısı + platformun cümlesi', () => {
    expect(seritGorunumu({ durum: 'tamam', ayar: { ...AYAR, etkin: false, durum: 'kapali' } }).eylem).toBe('ac');
    expect(seritGorunumu({ durum: 'tamam', ayar: AYAR }).alt).toBe('Ege Birlik Yapı pikseli · Son başarılı gönderim: 12 Ekim 10:42');
    const h = seritGorunumu({
      durum: 'tamam',
      ayar: { ...AYAR, durum: 'hata', neden: '(#200) Requires ads_management permission', sayilar: sayilar({ bekliyor: 10, basarisiz: 2 }) },
    });
    expect(h).toMatchObject({ ton: 'sorun', baslik: 'Sonuçlar Meta’ya gitmiyor' });
    expect(h.alt).toBe('12 sonuç bekliyor. (#200) Requires ads_management permission');
  });
});

describe('gönderimler', () => {
  const o = (ek: Partial<GeriBeslemeOlayi>): GeriBeslemeOlayi => ({
    id: '1',
    leadId: 'l',
    leadAdi: 'Ayşe',
    platform: 'meta',
    asama: 'satisa_dondu',
    durum: 'bekliyor',
    deneme: 0,
    olayZamani: '2026-10-12T10:00:00Z',
    sonrakiDeneme: null,
    gonderildi: null,
    hata: null,
    hataKodu: null,
    ...ek,
  });

  it('KRİTİK: "eşleşmedi" ile "gönderilemedi" AYRI ton ve ayrı cümle', () => {
    expect(durumTonu('eslesmedi')).toBe('sessiz');
    expect(durumTonu('vazgecildi')).toBe('sorun');
    expect(olayNotu(o({ durum: 'eslesmedi' }), 0)).toContain('yapılacak bir şey yok');
    expect(olayNotu(o({ durum: 'vazgecildi', deneme: 5, hata: 'Service temporarily unavailable' }), 0)).toBe(
      '5 deneme · Meta: “Service temporarily unavailable”',
    );
    expect(olayNotu(o({ durum: 'suresi_doldu' }), 0)).toBe('Meta 7 günden eski sonucu kabul etmiyor');
  });

  it('bekleyen işaret: vadesi gelmediyse "geri alınabilir"', () => {
    const not = olayNotu(o({ sonrakiDeneme: '2026-10-12T11:17:00Z' }), Date.parse('2026-10-12T11:05:00Z'));
    expect(not).toContain('geri alınabilir');
  });

  it('KRİTİK: açılış cevabındaki ESKİ sayısı ekrana yazılıyor (Ç-13)', () => {
    expect(degisimMetni({ kuyruga: 31, eskiOlduguIcinAtlanan: 17, iptalEdilen: 0 })).toBe(
      'Son 7 günün 31 bildirimi sıraya alındı. 17 kayıt 7 günden eski olduğu için gönderilemez (Meta kuralı).',
    );
    expect(degisimMetni({ kuyruga: 0, eskiOlduguIcinAtlanan: 0, iptalEdilen: 4 })).toContain('4 sonuç iptal');
    expect(degisimMetni(null)).toBeNull();
  });

  it('uyarı ve bekleyen işin adresi API’nin uyarısıyla AYNI', () => {
    expect(gonderimlerAdresi('abc')).toBe('/potansiyel-musteriler?musteri=abc&sekme=gonderimler');
  });
});

describe('ekran bağları (kaynak)', () => {
  const WEB = join(__dirname, '..');
  const kod = (yol: string) =>
    readFileSync(join(WEB, yol), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/^\s*\/\/.*$/gm, '');
  const LISTE = kod('components/leads/lead-table.tsx');
  const SERIT = kod('components/leads/geri-besleme-seridi.tsx');
  const SEKME = kod('components/leads/gonderimler-sekmesi.tsx');
  const SAYFA = kod('app/(dashboard)/potansiyel-musteriler/page.tsx');

  it('BOŞA DÜŞME BEKÇİSİ', () => {
    expect(LISTE).toContain('export function LeadTable');
    expect(SERIT).toContain('export function GeriBeslemeSeridi');
    expect(SEKME).toContain('export function GonderimlerSekmesi');
  });

  it('KRİTİK: soru durum seçicisinin YERİNE geçti (aynı PUT /leads/:id, ikinci alan yok)', () => {
    expect(LISTE).toContain('Bu kişi müşteri oldu mu?');
    expect(LISTE).toContain('KALITE_SECENEKLERI.map');
    expect(LISTE).not.toMatch(/<select[\s\S]{0,200}onDurum/);
    expect(LISTE).toContain('`/leads/${lead.id}`');
  });

  it('KRİTİK: "Geri al" yalnız pencere açıkken (kalanDk), sunucu cevabındaki rozet satıra yazılıyor', () => {
    expect(LISTE).toContain('geriAl && kalanDk !== null');
    expect(LISTE).toContain('setRows((cur) => cur.map((r) => (r.id === lead.id ? { ...r, ...guncel } : r)))');
  });

  it('KRİTİK: hata yutulmuyor (dört hâl ayrı)', () => {
    for (const k of [SERIT, SEKME]) {
      expect(k).toContain('ApiRequestError');
      expect(k).not.toMatch(/\.catch\(\(\) =>/);
      expect(k).not.toContain('} catch {');
    }
    expect(SEKME).toContain("tur: 'yukleniyor'");
    expect(SEKME).toContain("tur: 'hata'");
    expect(SEKME).toContain('emptyReason');
    expect(SEKME).toContain('gönderim gösteriliyor');
  });

  it('KRİTİK: ayarı yalnız connection.manage değiştiriyor; aydınlatma onayı olmadan "Aç" kapalı', () => {
    expect(SAYFA).toContain("hasPermission(session, 'connection.manage')");
    expect(SERIT).toContain('g.eylem && canManage');
    expect(SERIT).toContain("(!ayar.etkin && !onay)");
  });

  it('KRİTİK: "Geri al" pencere bitince zamanlayıcıyla siliniyor ve geç kalan geri alma ekrana yazılıyor (Ajan 4 N-1)', () => {
    expect(LISTE).toContain('setTimeout(() => setSonIsaret(null), Math.max(0, bitis - Date.now()))');
    expect(LISTE).toContain('geriAlinamayanlar(guncel.geriBesleme, status)');
  });

  it('pencere DOM’dan çıkmıyor ve hareket azaltmada geçiş kapalı', () => {
    expect(SERIT).toContain("acik ? 'visible opacity-100' : 'invisible opacity-0'");
    expect(SERIT).toContain('motion-reduce:transition-none');
  });

  it('ayar okunamazsa şerit hata hâline düşüyor, kapalıya değil', () => {
    expect(SAYFA).toMatch(/\(e: unknown\): AyarSonucu => \(\{ durum: 'hata'/);
  });
});
