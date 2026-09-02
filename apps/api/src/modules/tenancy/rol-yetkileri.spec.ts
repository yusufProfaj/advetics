import { describe, expect, it } from 'vitest';
import {
  ORG_ADMIN_ROLES,
  ORG_SCOPED_ROLES,
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  isOrgAdminRole,
  isOrgScopedRole,
  resolvePermissions,
  type Permission,
  type Role,
} from '@advetics/shared';
import { ROL_SIRASI } from '../auth/tenant-context.service';

/**
 * ═══ ROL × YETKİ MATRİSİ ═══
 *
 * Matris tek kaynak ama TypeScript onun DOĞRU olduğunu sınamıyor — yalnızca
 * her rol için bir giriş bulunduğunu (`Record<Role, …>`). Yanlış bir yetki
 * eklemek ya da bir tanesini unutmak derlemeden geçiyor ve belirtisi
 * üretimde çıkıyor: ya kullanıcı tıklayabildiği bir düğmede 403 alıyor, ya
 * da hiç görmemesi gereken bir ekranı görüyor. İkisi de sessiz.
 *
 * Bu paket YENİ ROLLERİN SINIRLARINI yazıyor: sahip oldukları kadar SAHİP
 * OLMADIKLARI da iddia ediliyor. "Şu yetkiler var" testi, matrise fazladan
 * yetki eklendiğinde hiçbir zaman düşmez.
 */

function yetkileri(role: Role): Set<Permission> {
  return new Set(ROLE_PERMISSIONS[role]);
}

describe('rol listesi', () => {
  it('yeni iki rol tanımlı', () => {
    expect(ROLES).toContain('ad_manager');
    expect(ROLES).toContain('customer_service');
  });

  it('her rolün matriste bir girişi var', () => {
    for (const r of ROLES) {
      expect(ROLE_PERMISSIONS[r], `${r} için yetki listesi yok`).toBeDefined();
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
});

describe('Reklam Yöneticisi', () => {
  const y = yetkileri('ad_manager');

  it('Kampanya Yöneticisinin HER yetkisini taşıyor', () => {
    // "Daha geniş" olması gereken rolün dar kalması, iki liste elle
    // eşlendiğinde hiçbir aracın söylemeyeceği bir hata.
    for (const p of ROLE_PERMISSIONS.manager) {
      expect(y.has(p), `manager'da var, ad_manager'da yok: ${p}`).toBe(true);
    }
  });

  it('fazladan YALNIZCA müşteri açma ve bağlantı kurulumu var', () => {
    const fark = [...y].filter((p) => !ROLE_PERMISSIONS.manager.includes(p)).sort();
    expect(fark).toEqual(['client.write', 'connection.manage']);
  });

  it('kullanıcı yönetimi, faturalama ve müşteri silme YOK', () => {
    // Kullanıcının seçtiği sınır buydu: "HÂLÂ YOK: user.write, org.billing,
    // client.delete".
    expect(y.has('user.write')).toBe(false);
    expect(y.has('org.billing')).toBe(false);
    expect(y.has('client.delete')).toBe(false);
  });

  it('org geneli VERİ erişimi var ama org YÖNETİCİSİ değil', () => {
    /*
     * Bu ayrım bu rolün tamamı. `ORG_ADMIN_ROLES`e eklemek `isOrgAdmin`i
     * açardı ve o bayrak `@RequireOrgAdmin()` kapılarının HEPSİNİ birden
     * açıyor — personel hesabı açma dahil.
     */
    expect(isOrgScopedRole('ad_manager')).toBe(true);
    expect(isOrgAdminRole('ad_manager')).toBe(false);
    expect(ORG_SCOPED_ROLES).toContain('ad_manager');
    expect(ORG_ADMIN_ROLES).not.toContain('ad_manager');
  });
});

describe('Müşteri Hizmetleri', () => {
  const y = yetkileri('customer_service');

  it('okur, rapor üretip paylaşır, potansiyel müşteri listesini işler', () => {
    for (const p of [
      'client.read',
      'connection.read',
      'insights.read',
      'budget.read',
      'rule.read',
      'boost.read',
      'report.read',
      'report.write',
      'report.share',
      'lead.read',
      'lead.write',
    ] as const) {
      expect(y.has(p), `eksik: ${p}`).toBe(true);
    }
  });

  it('kampanyaya, bütçeye ve kurala DOKUNAMIYOR', () => {
    for (const p of [
      'budget.write',
      'rule.write',
      'rule.activate',
      'boost.write',
      'boost.approve',
      'bulk.write',
      'bulk.publish',
      'connection.write',
      'connection.manage',
      'client.write',
      'user.write',
      'sync.trigger',
    ] as const) {
      expect(y.has(p), `olmaması gereken yetki var: ${p}`).toBe(false);
    }
  });

  it('potansiyel müşteri listesini DIŞA AKTARAMIYOR', () => {
    /*
     * Okumak kişisel veriyi ekranda göstermek; dışa aktarmak onu sistemden
     * ÇIKARMAK. İndirilen dosya izlenemiyor ve silinemiyor.
     */
    expect(y.has('lead.read')).toBe(true);
    expect(y.has('lead.export')).toBe(false);
  });

  it('org geneli erişim rolü DEĞİL', () => {
    // Müşteri hizmetleri müşteri müşteri atanıyor; `clientId: null` bir
    // üyelik ona bütün ajansın verisini açardı.
    expect(isOrgScopedRole('customer_service')).toBe(false);
    expect(isOrgAdminRole('customer_service')).toBe(false);
  });
});

describe('mevcut roller değişmedi', () => {
  it('Kampanya Yöneticisi müşteri açamıyor ve bağlantı kuramıyor', () => {
    // Yeni yetkilerin ESKİ role sızmadığını kilitliyor: `connection.manage`i
    // MANAGER_PERMS'e eklemek bütün ad_manager testlerini geçirirdi.
    const y = yetkileri('manager');
    expect(y.has('client.write')).toBe(false);
    expect(y.has('connection.manage')).toBe(false);
    expect(y.has('connection.write')).toBe(true);
  });

  it('Sahip her şeyi, Yönetici faturalama hariç her şeyi taşıyor', () => {
    expect(yetkileri('owner').size).toBe(PERMISSIONS.length);
    expect(yetkileri('admin').has('org.billing')).toBe(false);
    expect(yetkileri('admin').has('connection.manage')).toBe(true);
  });

  it('Görüntüleyici hiçbir yazma yetkisi taşımıyor', () => {
    const yazma = [...yetkileri('client_viewer')].filter((p) => !p.endsWith('.read'));
    expect(yazma).toEqual([]);
  });
});

describe('rol sıralaması yetki kümeleriyle tutarlı', () => {
  /*
   * `ROLE_RANK` birden çok üyeliği olan kullanıcının "en geniş rolünü"
   * seçiyor ve o rol oturumun yetkilerini belirliyor. Sıra sezgiyle
   * verilirse dar bir rol geniş sanılır ve kullanıcı görmesi gereken
   * ekranları göremez — hata mesajı yok, yalnızca eksik panel.
   *
   * İLK YAZDIĞIMDA TAM BU OLDU: müşteri hizmetlerini analistin üstüne
   * koydum, oysa analistin yetki kümesi onun ÜST KÜMESİ.
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
});

describe('override rolü eziyor', () => {
  it('yeni rolde de kısıtlama ve genişletme çalışıyor', () => {
    const kisitli = resolvePermissions('ad_manager', { 'client.write': false });
    expect(kisitli.has('client.write')).toBe(false);

    const genis = resolvePermissions('customer_service', { 'lead.export': true });
    expect(genis.has('lead.export')).toBe(true);
  });
});
