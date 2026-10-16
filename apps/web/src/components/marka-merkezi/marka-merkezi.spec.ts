import { markaMerkeziSozlugu } from '@/dil/sozlukler/marka-merkezi';
import { markaMerkeziKurulumSozlugu } from '@/dil/sozlukler/marka-merkezi-kurulum';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { butceSozlugu } from '@/dil/sozlukler/butce';
import { CHANNEL_KINDS, type ChannelGroup, type ChannelItem } from '@advetics/shared';
import { havuzdaAra } from '../tenancy/bagli-kanallar';
import { visibleSections } from '@/lib/nav-sections';
import { ROLE_PERMISSIONS } from '@advetics/shared';
import { sirketlerSozlugu } from '@/dil/sozlukler/ayarlar-sirketler';

/**
 * ═══ MARKA MERKEZİ — SAYFA, KURULUM, KANALLAR, WORKSPACE BİLGİLERİ ═══
 *
 * 2026-10-13'te üç bölüme indi (docs/panel-sadelestirme/MIMARI.md). Hazırlık
 * şeridi ve Bağlantılar bölümü kalktı; kararların yeni hâli burada. Kaynak taramaları yorumsuz
 * kaynakta yapılıyor: kuralı anlatan yorum aynı dosyada duruyor ve
 * `toContain` ikisini ayırt etmiyor (CLAUDE.md).
 */
const SRC = join(__dirname, '..', '..');
const yorumsuz = (yol: string): string =>
  readFileSync(join(SRC, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\s*\}/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

const SAYFA = yorumsuz('app/(dashboard)/marka-merkezi/page.tsx');
const KANAL = yorumsuz('components/tenancy/bagli-kanallar.tsx');
const LISTE = yorumsuz('components/marka-merkezi/kurulum-listesi.tsx');
/* Adımın içeriği liste ve sihirbazda ORTAK (kurulum sihirbazı, MIMARI § 4). */
const ICERIK = yorumsuz('components/marka-merkezi/adim-icerigi.tsx');
const BILGI = yorumsuz('components/marka-merkezi/workspace-bilgileri.tsx');

describe('KRİTİK: tek sayaç — hazırlık şeridi ve ikinci sayaç yok', () => {
  it('şerit ve eski kart sayfada çizilmiyor', () => {
    expect(SAYFA).not.toContain('HazirlikListesi');
    expect(SAYFA).not.toContain('HazirlamaKarti');
    expect(SAYFA).not.toContain('KurulumBolumu');
  });

  it('iç menü rozeti ve liste AYNI sayaçtan (kurulumSayaci)', () => {
    expect(SAYFA).toContain('const sayac = kurulumSayaci(');
    expect(SAYFA).toContain('kurulum: rozetMetni(sayac)');
    expect(LISTE).toContain('const sayac = kurulumSayaci(adimlar);');
    // Kurulum ucunun kendi özeti (`ozet.tamam/toplam`) ekranda sayaç olarak KULLANILMIYOR.
    expect(LISTE).not.toContain('ozet.tamam');
    expect(SAYFA).not.toContain('ozet.tamam');
  });

  it('"Eksikleri tamamla" kapsamı sözleşmeden; hesap açan istek bu düğmede yok', () => {
    expect(LISTE).toContain('const kapsam = eksikleriTamamlaKapsami(girdi);');
    const i = LISTE.indexOf('async function eksikleriTamamla()');
    const govde = LISTE.slice(i, LISTE.indexOf('async function beyan(', i));
    if (i < 0 || govde.length < 50) throw new Error('eksikleriTamamla gövdesi bulunamadı');
    expect(govde).toContain('if (kapsam.kurulumAdimlari.length > 0)');
    expect(govde).toContain('if (kapsam.hazirlamaYeniden)');
    expect(govde).not.toContain('/kurulum/adim');
    expect(govde).not.toContain('meta_hesap');
    expect(govde).not.toContain('google_hesap');
  });

  it('düşen kaynak sessiz kalmıyor: her kaynak kendi hatasıyla, düğme nedeniyle pasif', () => {
    expect(LISTE).toContain('{d.okunamayanBaslik}');
    expect(markaMerkeziKurulumSozlugu.tr.okunamayanBaslik).toContain('Bazı bilgiler okunamadı');
    expect(LISTE).toContain('{kapaliNeden && <p');
    expect(LISTE).not.toMatch(/\.catch\(\(\) => set/);
  });

  it('açılan adım DOM’dan çıkmıyor; hareket prefers-reduced-motion altında kapalı', () => {
    expect(LISTE).toContain('inert={!acik}');
    expect(LISTE).toContain("acik ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'");
    expect(LISTE).toContain('motion-reduce:transition-none');
  });
});

describe('sayfa', () => {
  it('KRİTİK: çağrılar ayrı hata taşıyor, biri düşünce öteki çizilmeye devam ediyor', () => {
    expect(SAYFA).toContain('Promise.all([');
    expect(SAYFA).toContain('{d.kanallarAlinamadi}');
    expect(markaMerkeziSozlugu.tr.sayfa.kanallarAlinamadi).toBe('Hesaplar ve kanallar alınamadı.');
    expect(SAYFA).not.toContain('.catch(() => null)');
  });

  it('atama yetkisi olmayana düğmeler değil salt okunur liste; kapı PANEL_KAPILARI’ndan', () => {
    expect(SAYFA).toContain("kapi(session, 'hesap.ata') ? (");
    expect(SAYFA).toContain('<SaltOkunurKanallar');
  });

  it('KRİTİK: elle yazılmış kapı yok (hasPermission / isOrgAdmin)', () => {
    for (const k of [SAYFA, LISTE, BILGI]) {
      expect(k).not.toContain('hasPermission(');
      expect(k).not.toContain('session.isOrgAdmin');
    }
  });

  it('başlık menü adı ("Marka Merkezi"), workspace açıklamanın başında; bölüm yan menüde', () => {
    // 2026-10-14 (BILESENLER § 9): başlık menü adının AYNISI; hangi
    // workspace'in kurulumu olduğu açıklamanın İLK sözcükleri.
    // Sayfa adı menünün kendi çevirisinden (iki dilde menüyle aynı); elle Türkçe dize yok.
    expect(SAYFA).toContain('baslik={sayfaAdi}');
    expect(SAYFA).toContain('menuSatiriEtiketi(PANEL_YOLLARI.markaMerkezi, dil)');
    expect(SAYFA).toContain('{sirket ? `${sirket} › ${workspaceAdi}` : workspaceAdi}');
    expect(SAYFA).toContain('<SayfaIcDuzen menu={<IcMenu clientId={clientId} aktif={bolum} rozetler={rozetler} dil={dil} />}>');
    const MENU = readFileSync(join(SRC, 'components/marka-merkezi/ic-menu.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(MENU).toContain('<SayfaIcMenu');
    expect(MENU).toContain("uyari: rozet?.ton === 'eksik'");
    expect(MENU).toContain('href: markaMerkeziAdresi(b.kod, clientId)');
  });

  it('Marka bölümünde eski adlar yok; iki metin AYRI kartta', () => {
    // Kart kalıbı bileşenin içinde (`MetinSekmesi`); sayfada çapa kabı.
    expect(SAYFA).toContain('<Capa id="markayi-anlat">');
    expect(SAYFA).toContain('<Capa id="kime-satiyoruz">');
    expect(SAYFA).not.toContain('Bilgi bankası');
    expect(SAYFA).not.toContain('Hedef kitle');
  });

  it('GA4 veri kaynakları listesinde bağlanmıyor (tek kayıt Kurulum’da)', () => {
    expect(SAYFA).toContain("haric={['ga4']}");
    expect(ICERIK).toContain('<Ga4KaynakDurumu clientId={clientId} />');
    expect(LISTE).toContain('<AdimIcerigi {...icerik} />');
  });
});

describe('menü', () => {
  it('KRİTİK: müşteri hesabı Marka Merkezi satırını görmüyor', () => {
    // Kullanıcının kararı: müşterinin menüsü üç ekran.
    const musteri = visibleSections(ROLE_PERMISSIONS.client_viewer, { ustHesapGorunur: false, platformSahibi: false })
      .flatMap((b) => b.items.map((i) => i.label));
    expect(musteri).not.toContain('Marka Merkezi');
    const yonetici = visibleSections(ROLE_PERMISSIONS.admin, { ustHesapGorunur: false, platformSahibi: false })
      .flatMap((b) => b.items.map((i) => i.label));
    expect(yonetici).toContain('Marka Merkezi');
  });
});

describe('bağlantılar', () => {
  const HESAPLAR = [
    { id: '1', name: 'Öztürk Kuyumcu', externalId: 'act_111', syncEnabled: true, isManager: false },
    { id: '2', name: 'Biltaş', externalId: 'act_222', syncEnabled: true, isManager: false },
  ];

  it('havuzda ad ve hesap numarasıyla aranıyor, Türkçe harfler doğru', () => {
    expect(havuzdaAra(HESAPLAR, 'ÖZTÜRK').map((h) => h.id)).toEqual(['1']);
    expect(havuzdaAra(HESAPLAR, '222').map((h) => h.id)).toEqual(['2']);
    expect(havuzdaAra(HESAPLAR, '  ')).toHaveLength(2);
  });

  it('KRİTİK: kaldırma iki adımlı, tek tıkla çalışmıyor', () => {
    const i = KANAL.indexOf('function BagliKart(');
    expect(i).toBeGreaterThan(-1);
    const govde = KANAL.slice(i, KANAL.indexOf('function SecilebilirSatir(', i));
    const onayBlogu = govde.indexOf('{onay && (');
    const kaldir = govde.indexOf('void ata(null)');
    expect(onayBlogu).toBeGreaterThan(-1);
    // Kaldırma çağrısı onay bloğunun İÇİNDE ve ondan sonra geliyor.
    expect(kaldir).toBeGreaterThan(onayBlogu);
    expect(govde.match(/void ata\(null\)/g)).toHaveLength(1);
  });

  it('bekleyen düğmenin adı kaybolmuyor', () => {
    expect(KANAL).not.toContain("busy ? '…'");
    expect(KANAL).toContain('bekliyor={busy}');
  });
});

describe('ajansın atadığı kalemi kaldırma', () => {
  it('KRİTİK: ajans dışından kaldıran kişiye e-posta gideceği ÖNCEDEN söyleniyor', async () => {
    const { kaldirmaOnayMetni } = await import('../tenancy/bagli-kanallar');
    expect(kaldirmaOnayMetni(true, false)).toContain('ajansına e-posta gider');
    // Ajans üyesi kendi atamasını kaldırıyorsa bu cümle yanlış olurdu.
    expect(kaldirmaOnayMetni(true, true)).not.toContain('e-posta');
    expect(kaldirmaOnayMetni(false, false)).not.toContain('e-posta');
  });

  it('onay kutusu bu metni kullanıyor ve iki sayfa da üyeliği geçiriyor', () => {
    const govde = KANAL.slice(KANAL.indexOf('function BagliKart('), KANAL.indexOf('function SecilebilirSatir('));
    // Dil de geçiriliyor (D2): geçmezse varsayılan 'tr' ve İngilizce panelde Türkçe onay çıkar.
    expect(govde).toContain('kaldirmaOnayMetni(item.ajansAtadi === true, ajansUyesi, dil)');
    expect(SAYFA).toContain('ajansUyesi={session.managerAccount !== null}');
    // Eski "Bağlı kanallar" sayfası 2026-10-13'ten beri Kurulum'a YÖNLENİYOR
    // (Ajan 2); bileşeni çizen tek sayfa Marka Merkezi.
    const ESKI = yorumsuz('app/(dashboard)/ayarlar/musteriler/[id]/kanallar/page.tsx');
    expect(ESKI).toContain("redirect(eskiAdresYonu('ayarlar/musteriler/[id]/kanallar', { id }));");
  });
});

describe('Aylık Bütçe mecraya göre gruplu (2026-10-06)', () => {
  /*
   * Kullanıcı: "hangi mecraya bütçe sınırı koyduğumu göremiyorum". Hesap
   * adları çoğu zaman workspace adıyla aynı ve mecrayı söylemiyor.
   */
  // 2026-10-09'dan beri Planla › Aylık Bütçe sayfasının bileşeni.
  const BUTCE = yorumsuz('components/butce/butce-icerik.tsx');
  const i = BUTCE.indexOf('function AccountRows(');
  if (i < 0) throw new Error('AccountRows bulunamadı — tarama boşa düştü.');
  const govde = BUTCE.slice(i);

  it('KRİTİK: her mecra kendi gövdesinde ve başlığında kaç hesapta sınır olduğu yazıyor', () => {
    expect(govde).toContain('PLATFORMS.filter((p) => rows.some((a) => a.platform === p))');
    expect(govde).toContain('<section key={platform}');
    expect(govde).toContain('PLATFORM_KISA_ADLARI[platform]');
    expect(govde).toContain('d.sinirYokGrup');
    expect(butceSozlugu.tr.hesaplar.sinirYokGrup).toBe('hiçbirinde bütçe sınırı yok');
  });

  it('KRİTİK: satır kolona sığıyor — "Bütçe tanımla" düğmesi yatay kaydırmanın dışında kalmıyor', () => {
    // 860 piksellik tablo iç menünün yanındaki kolona sığmıyordu ve düğme
    // ekranın dışındaydı (canlı tur, 2026-10-06).
    expect(govde).not.toMatch(/min-w-\[\d{3,}px\]/);
    expect(govde).not.toContain('overflow-x-auto');
    const satir = govde.slice(govde.indexOf('function HesapSatiri('));
    expect(satir).toContain('<BudgetForm');
  });

  it('sınırı olmayan hesap boş tire değil, "Sınır yok" diyor', () => {
    expect(govde).toContain('{d.sinirYok}');
    expect(butceSozlugu.tr.hesaplar.sinirYok).toBe('Sınır yok');
  });
});

describe('Bağlantılar düzeni (2026-10-06)', () => {
  it('reklam hesapları ve sosyal kanallar AYRI kartta, sınıflandırma ortak fonksiyondan', () => {
    expect(KANAL).toContain('data.groups.filter((g) => kanalReklamHesabiMi(g.kind))');
    expect(KANAL).toContain('data.groups.filter((g) => !kanalReklamHesabiMi(g.kind))');
  });

  it('KRİTİK: izleme kapalı hesap özet satırında da sayılıyor', () => {
    expect(KANAL).toContain('tum.filter((i) => !i.syncEnabled).length');
    // Cümle sözlükte (D2); özet satırı sayıyla o anahtarı basıyor.
    expect(KANAL).toContain('{d.izlemeKapali(izlemeKapali)}');
    expect(sirketlerSozlugu.tr.kanallar.izlemeKapali(3)).toContain('3 hesapta izleme kapalı');
    expect(sirketlerSozlugu.en.kanallar.izlemeKapali(3)).toContain('3');
    expect(sirketlerSozlugu.en.kanallar.izlemeKapali(3)).not.toBe(sirketlerSozlugu.tr.kanallar.izlemeKapali(3));
  });
});

describe('Workspace bilgileri (eski Workspace ayarları + Bildirimler + Senkronizasyon)', () => {
  /*
   * Kullanıcı (2026-10-06): "workspace'e geçiş yaptığımda doldurulması
   * gereken her yeri Marka Merkezi kısmından halletmek istiyorum". 2026-10-13:
   * tek bölüm, dört kart; ekip salt okunur, kategori Kurulum'da.
   */
  it('KRİTİK: sayfa bölümü çiziyor', () => {
    expect(SAYFA).toContain('<WorkspaceBilgileri clientId={clientId} session={session} detay={detay} />');
  });

  it('KRİTİK: ekip burada YÖNETİLMİYOR — salt okunur liste ve Ayarlar › Ekip bağlantısı', () => {
    expect(BILGI).not.toContain('<TeamManager');
    expect(BILGI).not.toContain('<DanismanAta');
    expect(BILGI).toContain("ayarlarAdresi('ekip', { workspace: clientId, capa: 'workspace-erisimi' })");
  });

  it('KRİTİK: özel kategori burada değil (evi Kurulum › Reklam varsayılanları)', () => {
    expect(BILGI).not.toContain('<SpecialCategoryPicker');
    expect(ICERIK).toContain('<SpecialCategoryPicker');
  });

  it('KRİTİK: veri durumu ADRESTEKİ workspace’i okuyor', () => {
    expect(BILGI).toContain('`/sync/status?clientId=${encodeURIComponent(clientId)}`');
    expect(BILGI).not.toContain("serverApiFetch<SyncStatusResponse>('/sync/status')");
  });

  it('kapalı kart boş değil, nedenini yazıyor', () => {
    for (const k of ['erisim.gor', 'bildirim.gor', 'veriDurumu.gor']) {
      expect(BILGI).toContain(`kapiNedeni('${k}', dil)`);
    }
  });
});

describe('sosyal profilin boost hesabı Bağlantılar’da', () => {
  const hesap = (id: string): ChannelItem => ({ id, name: id, externalId: id, syncEnabled: true, isManager: false });
  const gruplar = (): ChannelGroup[] =>
    CHANNEL_KINDS.map((kind) => ({
      kind,
      connected: kind === 'meta_ads' ? [hesap('m1')] : kind === 'google_ads' ? [hesap('g1')] : [],
      available: [],
    }));

  it('KRİTİK: Instagram/Facebook Meta hesabıyla, YouTube Google hesabıyla, reklam hesabı hiç', async () => {
    const { boostSecenekleri } = await import('../tenancy/bagli-kanallar');
    const b = boostSecenekleri(gruplar());
    expect(b.instagram?.map((a) => a.id)).toEqual(['m1']);
    expect(b.facebook?.map((a) => a.id)).toEqual(['m1']);
    expect(b.youtube?.map((a) => a.id)).toEqual(['g1']);
    expect(b.meta_ads).toBeNull();
    expect(b.google_ads).toBeNull();
    expect(b.linkedin_ads).toBeNull();
  });

  it('ayarlar satırı bağlı sosyal profilde çiziliyor', () => {
    const i = KANAL.indexOf('function BagliKart(');
    const govde = KANAL.slice(i, KANAL.indexOf('function SecilebilirSatir(', i));
    expect(govde).toContain('<ProfilAyarlari item={item} kind={kind} secenekler={boostSecenekleri} />');
  });
});
