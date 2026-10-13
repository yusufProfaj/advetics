import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BildirimGonderimi, BildirimKanali, HesapSinyalOzeti, Sinyal, SinyalListesi } from '@advetics/shared';
import { ROLE_PERMISSIONS, SAGLIK_DISARIDA } from '@advetics/shared';
import {
  ajansDisiAlicilar,
  adresAlaniHatasi,
  bosMetni,
  denemeSonucuCoz,
  gonderimDurumu,
  gunEtiketi,
  hesapDurumu,
  kanalFormuDenetle,
  kanalSecimi,
  kaydedilecekKanallar,
  kontrolEdilmeyenler,
  kuralBildirimMetni,
  platformCipleri,
  satirEylemi,
  sinyalIncelemeAdresi,
  sinyalKaniti,
  sinyalKutuHali,
  sinyalListeYolu,
  sinyalMiniYolu,
  sinyalOzeti,
  sinyalRozetleri,
  sinyalUygulamaCoz,
  sinyallerAdresi,
} from './sinyal';
import { bekleyenIsAdresi, bekleyenIsCumlesi } from './bekleyen-isler';
import { SEKMELER, sekmeCoz } from './iyilestir';
import { MM_ALT_BASLIKLARI } from '@/components/marka-merkezi/bolumler';
import { MARKA_MERKEZI_CAPALARI, kapiAcikMi, markaMerkeziAdresi } from './panel-adresleri';

/**
 * ═══ SİNYALLER + BİLDİRİMLER EKRANI — ÇALIŞTIRILARAK ═══
 *
 * Kararlar `lib/sinyal.ts`te; bileşenler yalnız çiziyor. Buradaki her
 * KRİTİK iddia bir sessiz hata sınıfını kilitliyor: boş listenin nedeni,
 * yetkisiz düğme, düşen çağrının kuralın kanallarını silmesi, 200'ün
 * "gönderildi" sayılması.
 */

const sinyal = (p: Partial<Sinyal> = {}): Sinyal => ({
  id: 's1',
  anahtar: 'anomali:harcama:artis:campaign:c1',
  tur: 'anomali',
  kod: 'harcama',
  yon: 'artis',
  platform: 'meta',
  clientId: 'ws-1',
  clientAdi: 'Ege Birlik Yapı',
  adAccountId: 'h1',
  adAccountAdi: 'Ege Meta',
  varlik: { seviye: 'campaign', id: 'c1', ad: 'Konut Lansman', ustAd: null },
  baslik: 'Maliyet beklenenin 2,4 katı',
  neden: 'Bütçe ya da teklif değişmiş olabilir.',
  gun: '2026-10-12',
  gozlenen: { sayi: 4820, metin: '4.820 ₺' },
  beklenen: { alt: { sayi: 1650, metin: '1.650 ₺' }, ust: { sayi: 2380, metin: '2.380 ₺' }, nokta: 6 },
  sapmaMetni: '2,4 kat',
  onem: 'yuksek',
  durum: 'acik',
  ilkGorulme: '2026-10-13T04:00:00Z',
  sonGorulme: '2026-10-13T04:00:00Z',
  sonAcilma: '2026-10-13T04:00:00Z',
  acilmaSayisi: 1,
  kapatma: null,
  eylem: { tur: 'durdur', seviye: 'campaign', varlikId: 'c1' },
  kisit: null,
  seri: { gunler: ['a', 'b', 'c'], degerler: [1900, 2100, 4820], bant: { alt: 1650, ust: 2380 } },
  ozet: 'f'.repeat(64),
  ...p,
});

const hesap = (p: Partial<HesapSinyalOzeti> = {}): HesapSinyalOzeti => ({
  adAccountId: 'h1',
  adAccountAdi: 'Ege Meta',
  platform: 'meta',
  durum: 'hesaplandi',
  sonHesaplama: '2026-10-13T04:40:00Z',
  gecmisHafta: 6,
  not: null,
  ...p,
});

const liste = (p: Partial<SinyalListesi> = {}): SinyalListesi => ({
  sinyaller: [],
  toplam: 0,
  sayilar: { acik: 0, kapatildi: 0, kendiliginden_kapandi: 0 },
  emptyReason: 'sinyal_yok',
  hesaplar: [hesap()],
  kontrolEdilmeyen: [],
  hatalar: [],
  sessizKosum: false,
  uretildi: '2026-10-13T05:00:00Z',
  ...p,
});

const kanal = (p: Partial<BildirimKanali> = {}): BildirimKanali => ({
  id: 'k1',
  clientId: 'ws-1',
  tur: 'slack',
  ad: '#reklam-uyarilari',
  hedefIpucu: 'hooks.slack.com … X9kQ',
  alicilar: null,
  olaylar: ['sinyal', 'kural'],
  etkin: true,
  dogrulandi: '2026-10-12T09:00:00Z',
  sonTeslim: null,
  durum: 'calisiyor',
  olusturan: null,
  olusturuldu: '2026-10-12T09:00:00Z',
  ...p,
});

describe('liste kutusunun hâli', () => {
  it('KRİTİK: düşen çağrı boş liste DEĞİL, ölçüm dönemi "sinyal yok" DEĞİL', () => {
    expect(sinyalKutuHali(null)).toBe('yukleniyor');
    expect(sinyalKutuHali({ durum: 'hata', mesaj: 'x' })).toBe('hata');
    expect(sinyalKutuHali({ durum: 'tamam', liste: liste({ sessizKosum: true, emptyReason: 'sinyal_yok' }) })).toBe('olcum_donemi');
    expect(sinyalKutuHali({ durum: 'tamam', liste: liste() })).toBe('bos');
    expect(sinyalKutuHali({ durum: 'tamam', liste: liste({ sinyaller: [sinyal()], toplam: 1, sessizKosum: true }) })).toBe('dolu');
  });

  it('KRİTİK: beş boş neden beş AYRI cümle; nedensiz boş liste "sinyal yok" DEMİYOR', () => {
    const basliklar = (['hesap_yok', 'hesaplanmadi', 'gecmis_yetersiz', 'sinyal_yok', 'suzgec_bos'] as const).map(
      (n) => bosMetni(liste({ emptyReason: n }), 'acik').baslik,
    );
    expect(new Set(basliklar).size).toBe(5);
    expect(bosMetni(liste({ emptyReason: 'hesap_yok' }), 'acik').eylem).toBe('hesap_ata');
    expect(bosMetni(liste({ emptyReason: 'suzgec_bos' }), 'acik').eylem).toBe('suzgeci_temizle');
    expect(bosMetni(liste({ emptyReason: null }), 'acik').baslik).not.toMatch(/sinyal yok/i);
  });

  it('geçmiş yetersiz cümlesi gerçek hafta sayısını ve eşiği söylüyor', () => {
    const b = bosMetni(liste({ emptyReason: 'gecmis_yetersiz', hesaplar: [hesap({ gecmisHafta: 2, durum: 'gecmis_yetersiz' })] }), 'acik');
    expect(b.metin).toContain('2 haftalık');
    expect(b.metin).toContain('en az 4 hafta');
  });

  it('kapalı görünümde "sinyal yok" kapalı listeyi anlatıyor; açıkta kapalı varsa oraya yönlendiriyor', () => {
    expect(bosMetni(liste(), 'kapali').baslik).toBe('Kapalı sinyal yok');
    const b = bosMetni(liste({ sayilar: { acik: 0, kapatildi: 2, kendiliginden_kapandi: 1 } }), 'acik');
    expect(b.eylem).toBe('kapaliya_bak');
    expect(b.metin).toContain('3 kapalı sinyal');
  });
});

describe('hesap durumu ve kontrol edilmeyenler', () => {
  const z = () => 'bugün';
  it('KRİTİK: yeşil YALNIZ hesaplandı; veri bayat ve düşen hesaplama kırmızı, notuyla', () => {
    expect(hesapDurumu(hesap(), z)).toEqual({ nokta: 'yesil', metin: 'Hesaplandı bugün · 6 haftalık geçmiş' });
    expect(hesapDurumu(hesap({ durum: 'veri_bayat' }), z).nokta).toBe('kirmizi');
    const d = hesapDurumu(hesap({ durum: 'hesaplama_dustu', not: 'zaman aşımı' }), z);
    expect(d.nokta).toBe('kirmizi');
    expect(d.metin).toContain('zaman aşımı');
    expect(hesapDurumu(hesap({ durum: 'hic_hesaplanmadi', sonHesaplama: null }), z).nokta).toBe('gri');
  });

  it('dışarıda kalan her kontrolün kısa cümlesi var; geliştirici notu ekrana çıkmıyor', () => {
    const k = kontrolEdilmeyenler(SAGLIK_DISARIDA.map((d) => d.kod));
    expect(k).toHaveLength(SAGLIK_DISARIDA.length);
    for (const x of k) {
      expect(x.neden).not.toMatch(/\.ts|service|#/);
      expect(x.ad.length).toBeGreaterThan(0);
    }
  });
});

describe('özet şeridi ve süzgeç', () => {
  it('KRİTİK: yüksek önem sayısı liste KESİLMİŞSE uydurulmuyor', () => {
    const tam = liste({ sinyaller: [sinyal(), sinyal({ id: 's2', onem: 'orta' })], toplam: 2, sayilar: { acik: 2, kapatildi: 0, kendiliginden_kapandi: 0 } });
    expect(sinyalOzeti(tam, 'acik').yuksek).toBe(1);
    expect(sinyalOzeti({ ...tam, toplam: 60, sayilar: { ...tam.sayilar, acik: 60 } }, 'acik').yuksek).toBeNull();
    expect(sinyalOzeti(tam, 'kapali').yuksek).toBeNull();
  });

  it('platform çipi yalnız birden çok platform varsa', () => {
    expect(platformCipleri(liste())).toEqual([]);
    expect(platformCipleri(liste({ hesaplar: [hesap(), hesap({ adAccountId: 'h2', platform: 'google' })] }))).toEqual(['meta', 'google']);
  });

  it('liste adresi süzgeçleri taşıyor, boş süzgeci taşımıyor', () => {
    const u = new URL(sinyalListeYolu({ clientId: 'ws-1', gorunum: 'kapali', tur: 'saglik', platform: 'google', sayfa: 2 }), 'https://x');
    expect(Object.fromEntries(u.searchParams)).toEqual({ clientId: 'ws-1', durum: 'kapali', tur: 'saglik', platform: 'google', sayfa: '2' });
    const b = new URL(sinyalListeYolu({ clientId: 'ws-1', gorunum: 'acik', tur: null, platform: null, sayfa: 1 }), 'https://x');
    expect([...b.searchParams.keys()]).toEqual(['clientId', 'durum']);
  });
});

describe('satır', () => {
  it('KRİTİK: Durdur yalnız bütçe yazma yetkisiyle; yetkisize neden ve inceleme bağlantısı', () => {
    const e = satirEylemi(sinyal(), { butce: true, kural: true });
    expect(e.birincil).toEqual({ tur: 'durdur' });
    expect(e.incele).toContain('kampanya=c1');
    const y = satirEylemi(sinyal(), { butce: false, kural: true });
    expect(y.birincil?.tur).toBe('bag');
    expect(y.kisit).toMatch(/yetki/);
  });

  it('KRİTİK: geri aç DURUM MAKİNESİNDEN — kendiliğinden kapanan geri açılamaz', () => {
    expect(satirEylemi(sinyal({ durum: 'kapatildi' }), { butce: true, kural: true }).geriAcilabilir).toBe(true);
    expect(satirEylemi(sinyal({ durum: 'kendiliginden_kapandi' }), { butce: true, kural: true }).geriAcilabilir).toBe(false);
    expect(satirEylemi(sinyal({ durum: 'kapatildi' }), { butce: true, kural: false }).geriAcilabilir).toBe(false);
    expect(satirEylemi(sinyal(), { butce: true, kural: false }).kapatilabilir).toBe(false);
    // Kapalı sinyalde birincil eylem yok: kapanmış bir olayın kampanyası durdurulmaz.
    expect(satirEylemi(sinyal({ durum: 'kapatildi' }), { butce: true, kural: true }).birincil).toBeNull();
  });

  it('ölçüm eylemi Marka Merkezi › Kurulum › Dönüşüm ölçümü’ne, workspace’iyle', () => {
    const e = satirEylemi(sinyal({ eylem: { tur: 'olcum', clientId: 'ws-9' } }), { butce: true, kural: true });
    expect(e.birincil).toMatchObject({ tur: 'bag', href: '/marka-merkezi?musteri=ws-9&bolum=kurulum#olcum' });
  });

  it('inceleme adresi seviyeye göre ve hesabı taşıyor; reklam seviyesi Sorunlu galeriye', () => {
    const k = new URL(sinyalIncelemeAdresi(sinyal()), 'https://x');
    expect(k.pathname).toBe('/ads-explorer');
    expect(k.searchParams.get('hesap')).toBe('h1');
    expect(k.searchParams.get('seviye')).toBe('ad_group');
    const r = new URL(sinyalIncelemeAdresi(sinyal({ varlik: { seviye: 'ad', id: 'a1', ad: 'Kreatif 3', ustAd: null } })), 'https://x');
    expect(r.pathname).toBe('/ads-explorer/galeri');
    expect(r.searchParams.get('sorunlu')).toBe('1');
  });

  it('rozetler: yeniden açıldı vurgulu, dönüşüm metriği geriden, kapatma nedeni', () => {
    expect(sinyalRozetleri(sinyal({ acilmaSayisi: 2 }))).toContainEqual({ metin: 'Yeniden açıldı', vurgu: true });
    expect(sinyalRozetleri(sinyal({ kod: 'donusum_basi_maliyet' })).map((r) => r.metin)).toContain('3 gün önceki veri');
    expect(sinyalRozetleri(sinyal({ kod: 'harcama' })).map((r) => r.metin)).not.toContain('3 gün önceki veri');
    expect(
      sinyalRozetleri(sinyal({ durum: 'kapatildi', kapatma: { neden: 'kullanici', kim: 'Yusuf', zaman: 'x', not: null } })).map((r) => r.metin),
    ).toContain('Kapatıldı · Yusuf');
  });

  it('kanıt: sunucunun biçimlediği metin, gün etiketi; sağlıkta kanıt yok', () => {
    const k = sinyalKaniti(sinyal({ gun: '2026-10-12' }), new Date(2026, 9, 13, 10));
    expect(k).toEqual({ gun: 'Dün (pazartesi)', gozlenen: '4.820 ₺', beklenen: { alt: '1.650 ₺', ust: '2.380 ₺' }, dipnot: 'son 6 pazartesi' });
    expect(sinyalKaniti(sinyal({ tur: 'saglik', gozlenen: null }))).toBeNull();
    expect(gunEtiketi('2026-10-09', new Date(2026, 9, 13, 10))).toBe('9 Ekim (cuma)');
  });

  it('KRİTİK: mini grafikte değeri olmayan gün SIFIR DEĞİL, çizgi kopuyor', () => {
    const m = sinyalMiniYolu({ gunler: [], degerler: [10, null, 12, 30], bant: null });
    expect(m?.cizgi.match(/M/g)).toHaveLength(2);
    expect(sinyalMiniYolu({ gunler: [], degerler: [null, 5], bant: null })).toBeNull();
    expect(sinyalMiniYolu(null)).toBeNull();
  });

  it('KRİTİK: uygula yanıtı sözleşme biçiminde değilse "doğrulandı" sayılmıyor', () => {
    expect(sinyalUygulamaCoz({ dogrulama: 'dogrulandi', platformDegeri: 'PAUSED', sinyal: sinyal() })).not.toBeNull();
    expect(sinyalUygulamaCoz({ ok: true })).toBeNull();
    expect(sinyalUygulamaCoz({ dogrulama: 'dogrulandi', platformDegeri: 'PAUSED' })).toBeNull();
  });
});

describe('bildirim kanalı formu', () => {
  it('KRİTİK: webhook adresi sunucuyla AYNI kuralla; boş alan henüz hata değil', () => {
    expect(adresAlaniHatasi('slack', '')).toBeNull();
    expect(adresAlaniHatasi('slack', 'https://hooks.slack.com/services/T/B/x')).toBeNull();
    expect(adresAlaniHatasi('slack', 'https://hooks.slack.com.evil.com/services/x')).toMatch(/hooks\.slack\.com/);
    expect(adresAlaniHatasi('teams', 'http://x.webhook.office.com/a')).toMatch(/https/);
  });

  it('KRİTİK: geçersiz ve fazla alıcı SESSİZCE atılmıyor, adıyla söyleniyor', () => {
    const f = { tur: 'eposta' as const, clientId: '11111111-1111-4111-8111-111111111111', ad: 'Ekip', adres: '', olaylar: ['sinyal' as const] };
    const r = kanalFormuDenetle({ ...f, alicilarHam: 'a@ajans.com, bozuk' });
    expect(r).toEqual({ gecerli: false, neden: 'Geçersiz adres: bozuk' });
    const cok = Array.from({ length: 21 }, (_, n) => `k${n}@ajans.com`).join(',');
    expect(kanalFormuDenetle({ ...f, alicilarHam: cok }).gecerli).toBe(false);
    const ok = kanalFormuDenetle({ ...f, alicilarHam: 'a@ajans.com; b@ajans.com' });
    expect(ok.gecerli && ok.girdi.tur === 'eposta' && ok.girdi.alicilar).toEqual(['a@ajans.com', 'b@ajans.com']);
  });

  it('olay seçilmeden ya da adsız kanal kaydedilemiyor', () => {
    const f = { tur: 'slack' as const, clientId: '11111111-1111-4111-8111-111111111111', adres: 'https://hooks.slack.com/services/T/B/x', alicilarHam: '' };
    expect(kanalFormuDenetle({ ...f, ad: 'x', olaylar: [] }).gecerli).toBe(false);
    expect(kanalFormuDenetle({ ...f, ad: ' ', olaylar: ['kural'] })).toMatchObject({ gecerli: false });
    expect(kanalFormuDenetle({ ...f, ad: 'x', olaylar: ['kural'] }).gecerli).toBe(true);
  });

  it('ajans dışı alıcı uyarısı; genel sağlayıcıda susuyor', () => {
    expect(ajansDisiAlicilar(['a@profaj.com', 'b@musteri.com'], 'yusuf@profaj.com')).toEqual(['b@musteri.com']);
    expect(ajansDisiAlicilar(['b@musteri.com'], 'ajans@gmail.com')).toEqual([]);
    expect(ajansDisiAlicilar(['b@musteri.com'], null)).toEqual([]);
  });

  it('KRİTİK: deneme yanıtı tanınmazsa "gönderildi" DEĞİL', () => {
    expect(denemeSonucuCoz({ durum: 'gonderildi' })).toEqual({ tur: 'gonderildi' });
    expect(denemeSonucuCoz({ gonderim: { durum: 'vazgecildi', httpDurum: 410, hata: 'Gone' } })).toEqual({ tur: 'dustu', mesaj: '410 · Gone' });
    expect(denemeSonucuCoz({ ok: true })).toEqual({ tur: 'okunamadi' });
    expect(denemeSonucuCoz(null)).toEqual({ tur: 'okunamadi' });
  });

  it('gönderim durumu: dört teslim durumu dört ayrı cümle, hata metni kesilmeden', () => {
    const g = (p: Partial<BildirimGonderimi>): BildirimGonderimi => ({
      id: 'g', kanalId: 'k1', kanalAdi: 'x', olay: 'sinyal', ozet: '4 yeni sinyal', durum: 'gonderildi', deneme: 1, httpDurum: 200, hata: null, olusturuldu: 'x', gonderildi: 'x', ...p,
    });
    const etiketler = (['gonderildi', 'bekliyor', 'basarisiz', 'vazgecildi'] as const).map((d) => gonderimDurumu(g({ durum: d })).etiket);
    expect(new Set(etiketler).size).toBe(4);
    expect(gonderimDurumu(g({ durum: 'vazgecildi', httpDurum: 410, hata: 'Bu bağlayıcı artık desteklenmiyor' })).ayrinti).toBe(
      '410 · 1 deneme · Bu bağlayıcı artık desteklenmiyor',
    );
    expect(gonderimDurumu(g({ durum: 'basarisiz', httpDurum: null, deneme: 2 })).ayrinti).toBe('Bağlantı hatası · 2. deneme');
  });
});

describe('kural: yalnızca bildir', () => {
  it('KRİTİK: kanalsız kural "yalnız kural geçmişine yazılır" diyor', () => {
    expect(kuralBildirimMetni(undefined, [])).toMatch(/yalnız kural geçmişine/);
    expect(kuralBildirimMetni([], null)).toMatch(/yalnız kural geçmişine/);
    expect(kuralBildirimMetni(['k1', 'yok'], [kanal()])).toBe('yalnızca bildir: Slack · #reklam-uyarilari, silinmiş kanal');
    expect(kuralBildirimMetni(['k1'], null)).toMatch(/1 kanala; kanal adları alınamadı/);
  });

  it('KRİTİK: kanal listesi okunamazsa kuralın kanal seçimi EZİLMİYOR', () => {
    expect(kaydedilecekKanallar(['k1', 'k2'], null)).toEqual({ idler: ['k1', 'k2'], kayip: 0 });
    expect(kaydedilecekKanallar(['k1', 'k2'], [kanal()])).toEqual({ idler: ['k1'], kayip: 1 });
  });

  it('bozuk, kapalı ya da kural olayını almayan kanal seçilemez, nedeni yazılı', () => {
    expect(kanalSecimi(kanal()).secilebilir).toBe(true);
    expect(kanalSecimi(kanal({ durum: 'hata', sonTeslim: { zaman: 'x', durum: 'vazgecildi', hata: '410 Gone' } }))).toMatchObject({
      secilebilir: false,
      not: expect.stringContaining('410 Gone'),
    });
    expect(kanalSecimi(kanal({ etkin: false, durum: 'kapali' })).secilebilir).toBe(false);
    expect(kanalSecimi(kanal({ olaylar: ['sinyal'] })).secilebilir).toBe(false);
  });
});

describe('yerleşim: sekme, Marka Merkezi bölümü, bekleyen iş', () => {
  it('KRİTİK: Sinyaller sekmesi Öneriler’den hemen sonra ve adresle açılıyor', () => {
    expect(SEKMELER.indexOf('sinyaller')).toBe(SEKMELER.indexOf('oneriler') + 1);
    expect(sekmeCoz('sinyaller')).toBe('sinyaller');
  });

  it('KRİTİK: Bildirimler ayrı sayfa değil, Workspace bilgileri’nin kartı; müşteri hesabı görmüyor', () => {
    // 2026-10-13: Marka Merkezi'nin üç bölümü; bildirimler Workspace bilgileri › #bildirimler.
    expect(MARKA_MERKEZI_CAPALARI.workspace).toContain('bildirimler');
    expect(MM_ALT_BASLIKLARI.workspace.map((a) => a.capa)).toContain('bildirimler');
    expect(markaMerkeziAdresi('workspace', 'ws-1', 'bildirimler')).toBe('/marka-merkezi?musteri=ws-1&bolum=workspace#bildirimler');
    const oturum = (rol: keyof typeof ROLE_PERMISSIONS) => ({
      permissions: [...ROLE_PERMISSIONS[rol]],
      isOrgAdmin: rol === 'admin',
      platformAdmin: false,
      managerAccount: null,
    });
    expect(kapiAcikMi(oturum('admin'), 'bildirim.gor')).toBe(true);
    expect(kapiAcikMi(oturum('client_viewer'), 'bildirim.gor')).toBe(false);
  });

  it('KRİTİK: "sinyal açık" satırı işin workspace’indeki Sinyaller sekmesine gidiyor', () => {
    const is = { tur: 'sinyal_acik' as const, clientId: 'ws-7', clientAdi: 'A', sayi: 3, enEski: null };
    expect(bekleyenIsCumlesi(is, false)).toBe('3 sinyal açık');
    expect(bekleyenIsAdresi(is)).toBe(sinyallerAdresi('ws-7'));
    expect(sinyallerAdresi('ws-7')).toBe('/iyilestir?musteri=ws-7&sekme=sinyaller');
  });
});

/*
 * KAYNAK TARAMASI — yalnız render edilmeden görülemeyen bağlar. Tarama
 * YORUMSUZ kaynakta ve iddia koda çapalı (kuralı anlatan yorum eşleşmesin).
 */
const yorumsuz = (yol: string) =>
  readFileSync(join(__dirname, '..', yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('kaynak: bağlar', () => {
  const SEKME = yorumsuz('components/iyilestir/sinyaller-sekmesi.tsx');
  const PENCERE = yorumsuz('components/iyilestir/sinyal-pencereleri.tsx');
  const BILDIRIM = yorumsuz('components/marka-merkezi/bildirimler-bolumu.tsx');
  const SAYFA = yorumsuz('app/(dashboard)/iyilestir/page.tsx');
  const MM = yorumsuz('app/(dashboard)/marka-merkezi/page.tsx');

  it('KRİTİK: hiçbir yeni dosya hatayı boş listeye çevirmiyor', () => {
    for (const k of [SEKME, PENCERE, BILDIRIM]) {
      expect(k).not.toMatch(/\.catch\(\s*\(\)\s*=>\s*set\w+\(\s*\[\s*\]\s*\)/);
    }
  });

  it('KRİTİK: Durdur sinyalin uygula ucuna ÖZETLE gidiyor (ikinci bir yazma yolu yok)', () => {
    expect(PENCERE).toContain("sinyalEylemYolu(s.id, 'uygula')");
    expect(PENCERE).toContain('JSON.stringify({ ozet: s.ozet })');
    expect(PENCERE).not.toContain('/campaigns/varliklar/');
  });

  it('KRİTİK: webhook adresi alan BIRAKILINCA doğrulanıyor', () => {
    const i = BILDIRIM.indexOf('onBlur={() => setAdresHatasi(adresAlaniHatasi(tur, adres))}');
    expect(i).toBeGreaterThan(-1);
  });

  it('sayfalar bölümü ve sekmeyi çiziyor', () => {
    expect(SAYFA).toContain("{sekme === 'sinyaller' && (");
    expect(SAYFA).toContain('<SinyallerSekmesi');
    // 2026-10-13: Bildirimler Workspace bilgileri'nin kartı.
    expect(MM).toContain("{bolum === 'workspace' && (");
    expect(MM).toContain('<WorkspaceBilgileri');
    expect(readFileSync(join(__dirname, '../components/marka-merkezi/workspace-bilgileri.tsx'), 'utf8')).toContain('<BildirimlerBolumu');
  });
});
