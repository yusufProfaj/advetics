import { describe, expect, it } from 'vitest';
import {
  ORG_ADMIN_ROLES,
  ORG_SCOPED_ROLES,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  ROL_ETIKETI,
  ROL_SUTUNLARI,
  SIRKET_ROLLERI,
  UST_HESAP_ROLLERI,
  WORKSPACE_ROLLERI,
  YETKI_GRUPLARI,
  isOrgAdminRole,
  isOrgScopedRole,
  resolvePermissions,
  yetkiVar,
  type Permission,
  type Role,
} from '@advetics/shared';
import { ROL_SIRASI } from '../auth/tenant-context.service';

/**
 * ═══ ROL × YETKİ MATRİSİ — ÜÇ ROL + SAHİP ═══
 *
 * Matris tek kaynak ama TypeScript onun DOĞRU olduğunu sınamıyor — yalnızca
 * her rol için bir giriş bulunduğunu (`Record<Role, …>`). Yanlış bir yetki
 * eklemek ya da bir tanesini unutmak derlemeden geçiyor ve belirtisi
 * üretimde çıkıyor: ya kullanıcı tıklayabildiği bir düğmede 403 alıyor, ya
 * da hiç görmemesi gereken bir ekranı görüyor. İkisi de sessiz.
 *
 * Bu paket rollerin SINIRLARINI kullanıcının kendi tanımıyla yazıyor:
 * sahip oldukları kadar SAHİP OLMADIKLARI da iddia ediliyor. "Şu yetkiler
 * var" testi, matrise fazladan yetki eklendiğinde hiçbir zaman düşmez.
 */

function yetkileri(role: Role): Set<Permission> {
  return new Set(ROLE_PERMISSIONS[role]);
}

describe('rol listesi', () => {
  it('KRİTİK: tam olarak üç rol — owner/manager/analyst/customer_service YOK', () => {
    // Kullanıcının kararı: "sahip, yönetici, reklam yöneticisi, müşteri".
    // Sahip bir rol değil bayrak; kalan üçü burada.
    expect([...ROLES]).toEqual(['admin', 'ad_manager', 'client_viewer']);
  });

  it('her rolün matriste bir girişi ve ekran adı var', () => {
    for (const r of ROLES) {
      expect(ROLE_PERMISSIONS[r], `${r} için yetki listesi yok`).toBeDefined();
      expect(ROL_ETIKETI[r], `${r} için etiket yok`).toBeTruthy();
    }
  });

  it('matriste tanımsız bir yetki anahtarı yok', () => {
    // Yazım hatası bir yetkiyi sessizce ETKİSİZ yapar: `resolvePermissions`
    // bilinmeyen anahtarı atıyor ve kimse fark etmiyor.
    for (const r of ROLES) {
      for (const p of ROLE_PERMISSIONS[r]) {
        expect(PERMISSIONS, `${r} rolünde tanımsız yetki: ${p}`).toContain(p);
      }
    }
  });

  it('KRİTİK: kimsenin okumadığı yetki anahtarı yok — org.billing ve rule.revert kalktı', () => {
    // İkisini de hiçbir guard ve ekran kontrol etmiyordu; matriste "var"
    // görünüp hiçbir şey yapmayan satırlardı.
    expect(PERMISSIONS as readonly string[]).not.toContain('org.billing');
    expect(PERMISSIONS as readonly string[]).not.toContain('rule.revert');
  });
});

describe('Yönetici (admin)', () => {
  it('bütün yetkileri taşıyor ve org yöneticisi', () => {
    expect(yetkileri('admin').size).toBe(PERMISSIONS.length);
    expect(isOrgAdminRole('admin')).toBe(true);
    expect(isOrgScopedRole('admin')).toBe(true);
  });

  it('KRİTİK: org yöneticiliği YALNIZCA bu rolde', () => {
    // `isOrgAdmin` kullanıcı açar, üyelik verir, workspace siler. Başka bir
    // role sızması hesap ele geçirme kapısı.
    expect([...ORG_ADMIN_ROLES]).toEqual(['admin']);
  });
});

describe('Reklam Yöneticisi (ad_manager)', () => {
  const y = yetkileri('ad_manager');

  it('workspace yönetir, yayınlar, hesap atar, veriyi günceller', () => {
    // Kullanıcının tanımı: "yetkilendirilen şirketlerin workspace'lerini
    // yönetebilir, reklam hesaplarında yayınlama yapabilir, verileri
    // güncelleyebilir".
    for (const p of [
      'client.write',
      'connection.manage',
      'bulk.publish',
      'boost.approve',
      'rule.activate',
      'budget.write',
      'sync.trigger',
      'report.share',
    ] as const) {
      expect(y.has(p), `eksik: ${p}`).toBe(true);
    }
  });

  it('KRİTİK: kişi ekleyemez, şirket açamaz/silemez, workspace silemez, marka değiştiremez', () => {
    for (const p of ['user.write', 'org.write', 'client.delete', 'branding.write'] as const) {
      expect(y.has(p), `olmaması gereken yetki var: ${p}`).toBe(false);
    }
  });

  it('org geneli VERİ erişimi var ama org YÖNETİCİSİ değil', () => {
    expect(isOrgScopedRole('ad_manager')).toBe(true);
    expect(isOrgAdminRole('ad_manager')).toBe(false);
    expect(ORG_SCOPED_ROLES).toContain('ad_manager');
    expect(ORG_ADMIN_ROLES).not.toContain('ad_manager');
  });
});

describe('Müşteri hesabı (client_viewer)', () => {
  const y = yetkileri('client_viewer');

  it('KRİTİK: yetki kümesi TAM OLARAK bu — görür, günceller, bütçe tüketimini okur', () => {
    /*
     * Kullanıcının tanımı: "sadece genel bakış, reklam keşfi ve raporlar;
     * tarihleri değiştirip verilerini görebilir, güncelleyebilir; reklam
     * yayınlayamaz, reklam kısmını göremez". Liste `toEqual` ile kilitli:
     * fazladan bir okuma yetkisi bile "reklam kısmı"nı menüde açabilir.
     */
    expect([...y].sort()).toEqual(
      ['budget.read', 'client.read', 'insights.read', 'report.read', 'sync.trigger'].sort(),
    );
  });

  it('KRİTİK: hiçbir yazma yetkisi yok — sync.trigger dışında', () => {
    // `sync.trigger` "verilerini güncelleyebilir" cümlesinin ta kendisi ve
    // veri YAZMIYOR, platformdan çekiyor; kota bekçisi zaten sınırlıyor.
    const yazma = [...y].filter((p) => !p.endsWith('.read') && p !== 'sync.trigger');
    expect(yazma).toEqual([]);
  });

  it('KRİTİK: reklam kısmını GÖRMÜYOR — kural ve boost okuma yetkisi bile yok', () => {
    expect(y.has('rule.read')).toBe(false);
    expect(y.has('boost.read')).toBe(false);
    expect(y.has('bulk.read')).toBe(false);
  });

  it('şirket seviyesinde OLAMAZ — sınırı tek workspace', () => {
    expect(isOrgScopedRole('client_viewer')).toBe(false);
    expect(ORG_SCOPED_ROLES).not.toContain('client_viewer');
  });
});

describe('kapsam × rol listeleri', () => {
  it('üst hesap ve şirket: Yönetici ya da Reklam Yöneticisi', () => {
    expect([...UST_HESAP_ROLLERI]).toEqual(['admin', 'ad_manager']);
    expect([...SIRKET_ROLLERI]).toEqual(['admin', 'ad_manager']);
  });

  it('KRİTİK: workspace: Yönetici YOK, Müşteri hesabı VAR', () => {
    // Tek workspace'e bağlı bir "yönetici" hiçbir yönetim kapısını açamaz
    // (`isOrgAdmin` `clientId: null` ister) ve ekranda yalan söylerdi.
    expect([...WORKSPACE_ROLLERI]).toEqual(['ad_manager', 'client_viewer']);
  });

  it('listeler ORG_SCOPED_ROLES ile tutarlı', () => {
    // Şirket/üst hesap seviyesindeki her rol org geneli olabilmeli; aksi
    // hâlde veritabanı CHECK'i uygulamanın gösterdiği seçeneği reddeder.
    for (const r of [...UST_HESAP_ROLLERI, ...SIRKET_ROLLERI]) {
      expect(isOrgScopedRole(r), `${r} org geneli değil ama şirket listesinde`).toBe(true);
    }
  });
});

describe('karşılaştırma tablosu (rol-matrisi)', () => {
  it('sütunlar: Sahip önce, sonra roller', () => {
    expect([...ROL_SUTUNLARI]).toEqual(['sahip', ...ROLES]);
  });

  it('her satır ya gerçek bir yetki anahtarına ya da "sahip"e bağlı', () => {
    // Elle yazılmış bir tablo matris değiştiğinde ekranda yalan söyler;
    // satırların anahtarı tanımsızsa hücre hep boş çıkar ve kimse fark etmez.
    for (const g of YETKI_GRUPLARI) {
      for (const s of g.satirlar) {
        if (s.izin === 'sahip') continue;
        expect(PERMISSIONS, `${s.baslik}: tanımsız yetki ${s.izin}`).toContain(s.izin);
      }
    }
  });

  it('KRİTİK: hücreler matristen türüyor — Sahip her satırda ✓, Müşteri hesabı yayınlayamıyor', () => {
    expect(yetkiVar('sahip', 'bulk.publish')).toBe(true);
    expect(yetkiVar('sahip', 'sahip')).toBe(true);
    expect(yetkiVar('admin', 'sahip')).toBe(false);
    expect(yetkiVar('client_viewer', 'bulk.publish')).toBe(false);
    expect(yetkiVar('client_viewer', 'insights.read')).toBe(true);
    expect(yetkiVar('ad_manager', 'user.write')).toBe(false);
  });

  it('kullanıcının istediği üç ekran müşteri hesabında ✓, reklam işleri —', () => {
    const satir = (baslik: string) =>
      YETKI_GRUPLARI.flatMap((g) => g.satirlar).find((s) => s.baslik.includes(baslik));
    expect(yetkiVar('client_viewer', satir('Genel Bakış')!.izin)).toBe(true);
    expect(yetkiVar('client_viewer', satir('Raporları görüntüleme')!.izin)).toBe(true);
    expect(yetkiVar('client_viewer', satir('Şimdi güncelle')!.izin)).toBe(true);
    expect(yetkiVar('client_viewer', satir('Reklam oluşturma')!.izin)).toBe(false);
    expect(yetkiVar('client_viewer', satir('Akıllı Boost')!.izin)).toBe(false);
  });
});

describe('rol sıralaması yetki kümeleriyle tutarlı', () => {
  /*
   * `ROLE_RANK` birden çok üyeliği olan kullanıcının "en geniş rolünü"
   * seçiyor ve o rol oturumun yetkilerini belirliyor. Sıra sezgiyle
   * verilirse dar bir rol geniş sanılır ve kullanıcı görmesi gereken
   * ekranları göremez — hata mesajı yok, yalnızca eksik panel.
   */
  it('bir rolün yetkileri diğerini KAPSIYORSA sırası da yüksek olmalı', () => {
    for (const a of ROLES) {
      for (const b of ROLES) {
        if (a === b) continue;
        const ya = yetkileri(a);
        const yb = yetkileri(b);
        const aKapsiyor = [...yb].every((p) => ya.has(p)) && ya.size > yb.size;
        if (aKapsiyor) {
          expect(
            ROL_SIRASI[a],
            `${a} yetkileri ${b}'yi kapsıyor ama sırası daha düşük`,
          ).toBeGreaterThan(ROL_SIRASI[b]);
        }
      }
    }
  });

  it('sıralama her rolü biliyor — eski rol adı kalmadı', () => {
    expect(Object.keys(ROL_SIRASI).sort()).toEqual([...ROLES].sort());
  });
});

describe('override rolü eziyor', () => {
  it('kısıtlama ve genişletme çalışıyor', () => {
    const kisitli = resolvePermissions('ad_manager', { 'client.write': false });
    expect(kisitli.has('client.write')).toBe(false);

    const genis = resolvePermissions('client_viewer', { 'boost.read': true });
    expect(genis.has('boost.read')).toBe(true);
  });
});
