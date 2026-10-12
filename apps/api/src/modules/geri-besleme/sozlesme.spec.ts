import { describe, expect, it } from 'vitest';
import {
  asamaOlayZamani,
  asamaPlani,
  DATA_MANAGER,
  GERI_BESLEME_ASAMALARI,
  GERI_BESLEME_EN_FAZLA_DENEME,
  GERI_BESLEME_OLAY_DURUMLARI,
  GERI_BESLEME_OLAY_GECISLERI_OLAYLARI,
  GERI_BESLEME_SON_DURUMLAR,
  GERI_BESLEME_UCLARI,
  GERI_BESLEME_ULASAN_DURUMLAR,
  geriBeslemeAyarDurumu,
  geriBeslemeAyarSchema,
  geriBeslemeGecisi,
  geriBeslemeOlayKimligi,
  googleEpostaNormalize,
  googleUygunluk,
  imaEdilenAsamalar,
  LEAD_DURUMU_ASAMASI,
  LEAD_STATUSES,
  leadRozetTuru,
  META_ASAMA_OLAY_ADI,
  META_CRM,
  metaCrmOlayi,
  metaGovdeMetni,
  metaLeadIdGecerli,
  metaPenceredeMi,
  metaUygunlukEksikleri,
  metaYanitSinifi,
  partiSirala,
  partiyiYarila,
  PERMISSIONS,
  resolvePermissions,
  sonrakiDenemeMs,
  telefonE164,
  type GeriBeslemeOlayDurumu,
  type MevcutAsama,
} from '@advetics/shared';

/**
 * ═══ GERİ BESLEME SÖZLEŞMESİ (Paket E, Ajan 1) ═══
 *
 * Saf fonksiyonlar ÇALIŞTIRILARAK sınanıyor. Ajan 2 (gönderim işi, lead
 * durum güncellemesi) ve Ajan 3 (rozet, ayar ekranı) bu sözleşmeden okuyor.
 * NOT: `packages/shared`te mutasyon yapılacaksa önce shared yeniden
 * derlenmeli (testler `dist`i okuyor, CLAUDE.md).
 */

const LEAD = '00000000-0000-4000-8000-0000000000aa';
const satir = (asama: MevcutAsama['asama'], durum: GeriBeslemeOlayDurumu): MevcutAsama => ({ asama, durum });

describe('lead durumu → aşama', () => {
  it('her lead durumunun bir aşaması var', () => {
    for (const s of LEAD_STATUSES) expect(GERI_BESLEME_ASAMALARI).toContain(LEAD_DURUMU_ASAMASI[s]);
  });

  it('KRİTİK: Meta olay adları sabit (değişirse Conversion Leads modeli sıfırlanır)', () => {
    expect(META_ASAMA_OLAY_ADI).toEqual({
      ham_lead: 'ham_lead',
      ulasildi: 'ulasildi',
      nitelikli: 'nitelikli',
      satisa_dondu: 'satisa_dondu',
      uygun_degil: 'uygun_degil',
    });
  });

  it('olumlu durum hunideki önceki aşamaları ima eder, "uygun değil" yalnız ham lead’i', () => {
    expect(imaEdilenAsamalar('won')).toEqual(['ham_lead', 'ulasildi', 'nitelikli', 'satisa_dondu']);
    expect(imaEdilenAsamalar('contacted')).toEqual(['ham_lead', 'ulasildi']);
    expect(imaEdilenAsamalar('lost')).toEqual(['ham_lead', 'uygun_degil']);
    expect(imaEdilenAsamalar('new')).toEqual(['ham_lead']);
  });
});

describe('aşama planı', () => {
  it('KRİTİK: atlanan aşamalar doldurulur (Yeni → Kazanıldı)', () => {
    const p = asamaPlani('won', [satir('ham_lead', 'iletildi')]);
    expect(p.olustur).toEqual(['ulasildi', 'nitelikli', 'satisa_dondu']);
    expect(p.iptal).toEqual([]);
  });

  it('KRİTİK: pencere içinde geri alınan aşama iptal edilir, platforma gitmiş olan edilmez', () => {
    const mevcut = [
      satir('ham_lead', 'iletildi'),
      satir('ulasildi', 'iletildi'),
      satir('nitelikli', 'bekliyor'),
      satir('satisa_dondu', 'basarisiz'),
    ];
    const p = asamaPlani('contacted', mevcut);
    expect(p.iptal.sort()).toEqual(['nitelikli', 'satisa_dondu']);
    // Gitmiş olan geri alınamaz: CAPI'de silme yok.
    expect(asamaPlani('new', [satir('ham_lead', 'iletildi'), satir('ulasildi', 'iletildi')]).iptal).toEqual([]);
  });

  it('iptal edilen aşama yeniden ima edilince satır yeniden açılır, ikinci satır açılmaz', () => {
    const p = asamaPlani('qualified', [satir('ham_lead', 'iletildi'), satir('ulasildi', 'iletildi'), satir('nitelikli', 'iptal')]);
    expect(p.yenidenAc).toEqual(['nitelikli']);
    expect(p.olustur).toEqual([]);
  });

  it('plan idempotent: uygulanmış planı yeniden hesaplamak iş üretmez', () => {
    const p = asamaPlani('won', [satir('ham_lead', 'iletildi')]);
    const sonra = [satir('ham_lead', 'iletildi'), ...p.olustur.map((a) => satir(a, 'bekliyor'))];
    expect(asamaPlani('won', sonra)).toEqual({ olustur: [], iptal: [], yenidenAc: [] });
  });

  it('uygun değil ↔ kazanıldı: bekleyen dal iptal, huni doldurulur', () => {
    const p = asamaPlani('won', [satir('ham_lead', 'iletildi'), satir('uygun_degil', 'bekliyor')]);
    expect(p.iptal).toEqual(['uygun_degil']);
    expect(p.olustur).toEqual(['ulasildi', 'nitelikli', 'satisa_dondu']);
  });

  it('aşama zamanı lead zamanından SONRA (Meta öncekini atabilir)', () => {
    const lead = Date.UTC(2026, 9, 12, 10, 0, 0);
    expect(asamaOlayZamani('ham_lead', { leadZamaniMs: lead, degisimZamaniMs: lead + 5000 })).toBe(lead / 1000);
    expect(asamaOlayZamani('ulasildi', { leadZamaniMs: lead, degisimZamaniMs: lead - 60_000 })).toBe(lead / 1000 + 1);
    expect(asamaOlayZamani('ulasildi', { leadZamaniMs: lead, degisimZamaniMs: lead })).toBe(lead / 1000 + 1);
    expect(asamaOlayZamani('ulasildi', { leadZamaniMs: lead, degisimZamaniMs: lead + 90_000 })).toBe(lead / 1000 + 90);
  });
});

describe('olay durum makinesi', () => {
  it('KRİTİK: platforma ulaşan olaydan çıkış yok (aynı aşama iki kez sayılmaz)', () => {
    for (const d of GERI_BESLEME_ULASAN_DURUMLAR) {
      for (const o of GERI_BESLEME_OLAY_GECISLERI_OLAYLARI) expect(geriBeslemeGecisi(d, o, 1), `${d}+${o}`).toBeNull();
    }
  });

  it('gönderilebilir her durumdan bir son duruma yol var (kalıcı bekleme yok)', () => {
    for (const d of GERI_BESLEME_OLAY_DURUMLARI.filter((x) => !GERI_BESLEME_SON_DURUMLAR.includes(x))) {
      const sonlar = GERI_BESLEME_OLAY_GECISLERI_OLAYLARI.map((o) => geriBeslemeGecisi(d, o, GERI_BESLEME_EN_FAZLA_DENEME)).filter(
        (h): h is GeriBeslemeOlayDurumu => h !== null && GERI_BESLEME_SON_DURUMLAR.includes(h),
      );
      expect(sonlar.length, d).toBeGreaterThan(0);
    }
  });

  it('geçici hata deneme sınırında vazgeçer, öncesinde tekrar dener', () => {
    expect(geriBeslemeGecisi('bekliyor', 'gecici_hata', 1)).toBe('basarisiz');
    expect(geriBeslemeGecisi('basarisiz', 'gecici_hata', GERI_BESLEME_EN_FAZLA_DENEME - 1)).toBe('basarisiz');
    expect(geriBeslemeGecisi('basarisiz', 'gecici_hata', GERI_BESLEME_EN_FAZLA_DENEME)).toBe('vazgecildi');
  });

  it('eşleşmedi ile gönderilemedi AYRI durumlar', () => {
    expect(geriBeslemeGecisi('bekliyor', 'eslesmedi')).toBe('eslesmedi');
    expect(geriBeslemeGecisi('bekliyor', 'olay_hatasi')).toBe('reddedildi');
    expect(GERI_BESLEME_ULASAN_DURUMLAR).toContain('eslesmedi');
    expect(GERI_BESLEME_ULASAN_DURUMLAR).not.toContain('reddedildi');
  });

  it('yeniden deneme yalnız platforma ulaşmamış son durumlardan', () => {
    expect(geriBeslemeGecisi('vazgecildi', 'yeniden_istendi')).toBe('bekliyor');
    expect(geriBeslemeGecisi('reddedildi', 'yeniden_istendi')).toBe('bekliyor');
    expect(geriBeslemeGecisi('iptal', 'yeniden_istendi')).toBe('bekliyor');
    expect(geriBeslemeGecisi('iletildi', 'yeniden_istendi')).toBeNull();
  });

  it('bekleme aralıkları artıyor ve sınırda null', () => {
    const t0 = 0;
    expect(sonrakiDenemeMs(t0, 1)).toBe(5 * 60_000);
    expect(sonrakiDenemeMs(t0, 2)).toBe(30 * 60_000);
    expect(sonrakiDenemeMs(t0, GERI_BESLEME_EN_FAZLA_DENEME)).toBeNull();
  });

  it('olay kimliği deterministik ve platformların kabul ettiği karakterlerle', () => {
    const k = geriBeslemeOlayKimligi(LEAD, 'satisa_dondu');
    expect(k).toBe(geriBeslemeOlayKimligi(LEAD, 'satisa_dondu'));
    expect(k).not.toBe(geriBeslemeOlayKimligi(LEAD, 'nitelikli'));
    expect(k).toMatch(/^[a-z0-9-_]{1,64}$/);
  });
});

describe('Meta CRM olayı', () => {
  const g = { leadId: '123456789012345', asama: 'nitelikli' as const, olayZamaniSn: 1_760_000_000, olayKimligi: 'adv-x-nitelikli' };

  it('KRİTİK: belgenin zorunlu alanları, event_source crm (eksikse Conversion Leads saymaz)', () => {
    const o = metaCrmOlayi(g);
    expect(o).toEqual({
      event_name: 'nitelikli',
      event_time: 1_760_000_000,
      action_source: 'system_generated',
      event_id: 'adv-x-nitelikli',
      user_data: { lead_id: '123456789012345' },
      custom_data: { lead_event_source: 'Advetics', event_source: 'crm' },
    });
  });

  it('KRİTİK: kişisel veri gitmez, user_data yalnız lead_id', () => {
    expect(Object.keys(metaCrmOlayi(g).user_data)).toEqual(['lead_id']);
  });

  it('KRİTİK: 17 haneli lead kimliği hassasiyet kaybetmeden sayı literaline çevrilir', () => {
    const id = '12345678901234567'; // Number() 12345678901234568 yapar.
    const metin = metaGovdeMetni([metaCrmOlayi({ ...g, leadId: id })]);
    expect(metin).toContain(`"lead_id":${id}`);
    expect(metin).not.toContain('12345678901234568');
    expect(metaGovdeMetni([metaCrmOlayi({ ...g, leadId: id })], { sayiOlarak: false })).toContain(`"lead_id":"${id}"`);
  });

  it('geçersiz lead kimliği gövdeye girmeden reddedilir (tek kötü olay partiyi düşürür)', () => {
    expect(metaLeadIdGecerli('12345678901234')).toBe(false); // 14 hane
    expect(metaLeadIdGecerli('123456789012345678')).toBe(false); // 18 hane
    expect(metaLeadIdGecerli('012345678901234')).toBe(false);
    expect(() => metaGovdeMetni([metaCrmOlayi({ ...g, leadId: '1234' })])).toThrow();
  });

  it('üretim gövdesinde test_event_code yok', () => {
    expect(metaGovdeMetni([metaCrmOlayi(g)])).not.toContain('test_event_code');
  });

  it('7 gün kuralı çağrıdan önce, bir saat payla', () => {
    const simdi = 1_760_000_000_000;
    const sn = simdi / 1000;
    expect(metaPenceredeMi(sn - (7 * 24 * 3600 - 3601), simdi)).toBe(true);
    expect(metaPenceredeMi(sn - (7 * 24 * 3600 - 3599), simdi)).toBe(false);
    expect(META_CRM.surum).toBe('v25.0');
  });
});

describe('Meta cevabı ve parti', () => {
  it('ayar hatası olayı değil kurulumu suçlar (satırlar beklemede kalır)', () => {
    expect(metaYanitSinifi({ http: 400, hataKodu: 190 }, 3)).toBe('ayar_hatasi');
    expect(metaYanitSinifi({ http: 403, hataKodu: 200 }, 3)).toBe('ayar_hatasi');
    expect(metaYanitSinifi({ http: 400, hataKodu: 100, hataAltKodu: 33 }, 3)).toBe('ayar_hatasi');
  });

  it('içerik hatası, geçici hata, kabul', () => {
    expect(metaYanitSinifi({ http: 400, hataKodu: 100 }, 3)).toBe('olay_hatasi');
    expect(metaYanitSinifi({ http: 400, hataKodu: 613 }, 3)).toBe('gecici');
    expect(metaYanitSinifi({ http: 503 }, 3)).toBe('gecici');
    expect(metaYanitSinifi({ http: null }, 3)).toBe('gecici');
    expect(metaYanitSinifi({ http: 200, eventsReceived: 3 }, 3)).toBe('kabul');
  });

  it('KRİTİK: 200 döndü ama sayı tutmuyor = kabul DEĞİL', () => {
    expect(metaYanitSinifi({ http: 200, eventsReceived: 2 }, 3)).toBe('uyusmazlik');
    expect(metaYanitSinifi({ http: 200 }, 3)).toBe('uyusmazlik');
  });

  it('KRİTİK: yarılama tek kötü olayı sınırlı adımda bulur ve durur', () => {
    const parti = Array.from({ length: META_CRM.partiBoyutu }, (_, i) => i);
    const kotu = 37;
    let cagri = 0;
    const reddedilen: number[] = [];
    const gonder = (p: number[]): void => {
      cagri++;
      if (cagri > 200) throw new Error('yarılama durmadı');
      if (!p.includes(kotu)) return;
      const y = partiyiYarila(p);
      if (y === null) {
        reddedilen.push(...p);
        return;
      }
      gonder(y[0]);
      gonder(y[1]);
    };
    gonder(parti);
    expect(reddedilen).toEqual([kotu]);
    expect(cagri).toBeLessThan(20);
    expect(partiyiYarila([1])).toBeNull();
  });

  it('aynı lead’in aşamaları hunideki sırayla gider', () => {
    const s = partiSirala([
      { leadId: 'b', asama: 'ham_lead' as const },
      { leadId: 'a', asama: 'satisa_dondu' as const },
      { leadId: 'a', asama: 'ham_lead' as const },
      { leadId: 'a', asama: 'nitelikli' as const },
    ]);
    expect(s.filter((x) => x.leadId === 'a').map((x) => x.asama)).toEqual(['ham_lead', 'nitelikli', 'satisa_dondu']);
  });
});

describe('Google tarafı (v1 kapalı)', () => {
  it('KRİTİK: Meta lead’i Google’a hiçbir koşulda gitmez (çift sayım)', () => {
    expect(googleUygunluk({ kaynakPlatform: 'meta', tiklama: { gclid: 'abc' } })).toBe('meta_lead');
  });

  it('v1 kapalı; Data Manager kısmi başarı tanımıyor', () => {
    expect(googleUygunluk({ kaynakPlatform: 'site', tiklama: { gclid: 'abc' } })).toBe('kapali');
    expect(DATA_MANAGER.kismiBasari).toBe(false);
    expect(DATA_MANAGER.uc).toBe('https://datamanager.googleapis.com/v1/events:ingest');
  });

  it('e-posta normalleştirme: gmail’de nokta ve + eki atılır, diğerlerinde atılmaz', () => {
    expect(googleEpostaNormalize('  Ali.Veli+reklam@Gmail.com ')).toBe('aliveli@gmail.com');
    expect(googleEpostaNormalize('ali.veli+x@profaj.com')).toBe('ali.veli+x@profaj.com');
    expect(googleEpostaNormalize('gecersiz')).toBeNull();
  });

  it('telefon E.164, ülke kodu şart, tanınmayan biçim tahmin edilmez', () => {
    expect(telefonE164('0532 123 45 67')).toBe('+905321234567');
    expect(telefonE164('532-123-4567')).toBe('+905321234567');
    expect(telefonE164('+90 532 123 45 67')).toBe('+905321234567');
    expect(telefonE164('905321234567')).toBe('+905321234567');
    expect(telefonE164('1234')).toBeNull();
  });
});

describe('ayar, uygunluk, rozet', () => {
  const C = '00000000-0000-4000-8000-000000000001';

  it('KRİTİK: açmak dataset ve aydınlatma onayı ister; kapatmak istemez', () => {
    expect(geriBeslemeAyarSchema.safeParse({ clientId: C, platform: 'meta', etkin: true, datasetId: null, aydinlatmaOnayi: true }).success).toBe(false);
    expect(geriBeslemeAyarSchema.safeParse({ clientId: C, platform: 'meta', etkin: true, datasetId: '1234567890', aydinlatmaOnayi: false }).success).toBe(false);
    expect(geriBeslemeAyarSchema.safeParse({ clientId: C, platform: 'meta', etkin: true, datasetId: '1234567890', aydinlatmaOnayi: true }).success).toBe(true);
    expect(geriBeslemeAyarSchema.safeParse({ clientId: C, platform: 'meta', etkin: false, datasetId: null, aydinlatmaOnayi: false }).success).toBe(true);
    expect(geriBeslemeAyarSchema.safeParse({ clientId: C, platform: 'google', etkin: false, datasetId: null, aydinlatmaOnayi: false }).success).toBe(false);
  });

  it('ayar durumu türetilir', () => {
    const t = { etkin: true, datasetId: '1', baglantiGecerli: true, sonAyarHatasi: null, sonBasariliGonderim: null };
    expect(geriBeslemeAyarDurumu({ ...t, etkin: false })).toBe('kapali');
    expect(geriBeslemeAyarDurumu({ ...t, datasetId: null })).toBe('kurulum_eksik');
    expect(geriBeslemeAyarDurumu({ ...t, baglantiGecerli: false })).toBe('kurulum_eksik');
    expect(geriBeslemeAyarDurumu({ ...t, sonAyarHatasi: 'izin yok' })).toBe('hata');
    expect(geriBeslemeAyarDurumu(t)).toBe('bekliyor');
    expect(geriBeslemeAyarDurumu({ ...t, sonBasariliGonderim: '2026-10-12T10:00:00Z' })).toBe('calisiyor');
  });

  it('uygunluk eksikleri belgedeki eşiklerden', () => {
    expect(metaUygunlukEksikleri({ son30GunLead: 250, kapsama: 0.7, acikGun: 10, ileriAsamaSayisi: 3 })).toEqual([]);
    expect(metaUygunlukEksikleri({ son30GunLead: 199, kapsama: 0.59, acikGun: 6, ileriAsamaSayisi: 0 })).toEqual([
      'az_lead',
      'dusuk_kapsama',
      'kisa_veri',
      'tek_asama',
    ]);
  });

  it('KRİTİK: rozet en kötü hâli gösterir (satış düştüyse "iletildi" diyemez)', () => {
    expect(leadRozetTuru(true, ['iletildi', 'vazgecildi'])).toBe('sorun');
    expect(leadRozetTuru(true, ['iletildi', 'bekliyor'])).toBe('bekliyor');
    expect(leadRozetTuru(true, ['iletildi', 'eslesmedi'])).toBe('eslesmedi');
    expect(leadRozetTuru(true, ['iletildi', 'iletildi'])).toBe('iletildi');
    expect(leadRozetTuru(true, ['iletildi', 'iptal'])).toBe('iletildi');
    expect(leadRozetTuru(true, ['iletildi', 'suresi_doldu'])).toBe('sorun');
    expect(leadRozetTuru(true, [])).toBe('yok');
    expect(leadRozetTuru(false, [])).toBe('kapali');
  });
});

describe('uçlar ve izinler', () => {
  it('her izin tanımlı; müşteri hesabı hiçbirine erişemez', () => {
    for (const u of GERI_BESLEME_UCLARI) expect(PERMISSIONS).toContain(u.izin);
    const musteri = resolvePermissions('client_viewer');
    for (const u of GERI_BESLEME_UCLARI) expect(musteri.has(u.izin), `${u.yontem} ${u.yol}`).toBe(false);
  });

  it('ayar yazma veri aktarımı izni ister, lead işaretleme izni yetmez', () => {
    const yaz = GERI_BESLEME_UCLARI.filter((u) => u.yol.startsWith('/geri-besleme/ayar') && u.yontem !== 'GET');
    expect(yaz.length).toBeGreaterThan(0);
    for (const u of yaz) expect(u.izin).toBe('connection.manage');
  });
});
