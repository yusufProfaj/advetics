import type { Permission } from '../auth/roles';
import { STRATEJI_SAYFA_IZNI } from '../strateji/uclar';

/**
 * ═══ PİLOT UÇ LİSTESİ — TEK KAYNAK ═══
 *
 * Ajan 2 controller'ı (`/pilot/...`) bu listeye göre yazar; Ajan 4 kaynak
 * taramasıyla `@RequirePermissions`/rota çiftlerinin BURAYLA aynı olduğunu
 * kilitler (strateji-kayit.spec deseni).
 *
 * İZİN KARARLARI (MIMARI.md §4):
 *   · Plan ekranı AdvStrategy sayfasında: `strategy.read` / `strategy.write`
 *     (sayfa izni değişmedi, menü satırı aynı).
 *   · ONAY = YAYIN: yeni `strategy.publish`. Eski `strategy.approve` "planı
 *     kabul ediyorum" demekti ve PARA HARCAMIYORDU; yeni onay harcamayı
 *     başlatıyor. Aynı anahtarı yeniden anlamlandırmak, o anahtarı
 *     `permission_overrides` ile almış birine sessizce para harcatma yetkisi
 *     vermek olurdu. Yeni anahtar: override'sız başlar.
 *   · Pilot (öneri kartları) AdvCampaign sayfasında: okumak `bulk.write`
 *     (sayfanın kapısı), uygulamak/geri almak `bulk.publish` (platformda
 *     reklam durdurmak/bütçe yazmak = yayın işi). Yeni izin AÇILMADI: işi
 *     zaten taşıyan iki anahtar var ve kimsenin okumadığı izin matriste
 *     yalan bir satır olur (`roles.ts` notu).
 */
export const PLAN_SAYFA_IZNI: Permission = STRATEJI_SAYFA_IZNI;
export const PILOT_SAYFA_IZNI: Permission = 'bulk.write';
export const PLAN_YAYIN_IZNI: Permission = 'strategy.publish';

export const PILOT_UCLARI = [
  // ─── Plan (AdvStrategy ekranı) ───
  { yontem: 'GET', yol: '/pilot/planlar', izin: 'strategy.read', ne: 'Workspace planları (dönem azalan, toplam ayrıca)' },
  { yontem: 'POST', yol: '/pilot/planlar/hazirla', izin: 'strategy.write', ne: '"Planı hazırla": planUret + yapay zekâ gerekçesi → taslak sürüm 1' },
  { yontem: 'GET', yol: '/pilot/planlar/:id', izin: 'strategy.read', ne: 'Plan sürümü + kaynaklar + uyum durumu + müşteri özeti' },
  { yontem: 'POST', yol: '/pilot/planlar/:id/yeniden-hazirla', izin: 'strategy.write', ne: 'Taze veriyle yeniden üret (yeni sürüm; elle değişiklikler korunmaz, uyarılır)' },
  { yontem: 'POST', yol: '/pilot/planlar/:id/degistir', izin: 'strategy.write', ne: '"Değiştir" kutusu ve elle düzenleme: PlanDegisikligi[] → yeni sürüm' },
  { yontem: 'POST', yol: '/pilot/planlar/:id/uyum-isaret', izin: 'strategy.write', ne: 'UYARI işareti ("Okudum, sorumluluk bende"); yalnız ajans rolü' },
  { yontem: 'POST', yol: '/pilot/planlar/:id/eylem', izin: 'strategy.write', ne: 'musteriye_gonder | geri_cek | yeniden_dene | kapat | iptal' },
  { yontem: 'POST', yol: '/pilot/planlar/:id/degisiklik-iste', izin: 'strategy.read', ne: 'Müşteri itirazı (not ile) → taslak; yalnız müşteri rolü' },
  { yontem: 'POST', yol: '/pilot/planlar/:id/onayla', izin: 'strategy.publish', ne: 'ONAY = YAYIN: sürüm + içerik özeti; ajans rolünde gerekçe zorunlu' },
  { yontem: 'GET', yol: '/pilot/planlar/:id/kurulum', izin: 'strategy.read', ne: 'Kurulum satırları ve özeti' },
  { yontem: 'GET', yol: '/pilot/planlar/:id/pdf', izin: 'strategy.read', ne: 'Plan PDF (rapor altyapısı, Advetics logosu)' },
  // ─── Pilot (AdvCampaign ekranı) ───
  { yontem: 'GET', yol: '/pilot/bugun', izin: 'bulk.write', ne: 'Açılış: dünkü harcama/sonuç, ay bütçesi, son tarama özeti' },
  { yontem: 'GET', yol: '/pilot/oneriler', izin: 'bulk.write', ne: 'Öneri kartları (durum süzgeci, gösterilen/toplam)' },
  { yontem: 'POST', yol: '/pilot/oneriler/:id/uygula', izin: 'bulk.publish', ne: 'Tek dokunuş: taze kontrol (oneriBayatMi) → platform → geri okuma' },
  { yontem: 'POST', yol: '/pilot/oneriler/:id/gec', izin: 'bulk.write', ne: 'Şimdilik geç' },
  { yontem: 'POST', yol: '/pilot/oneriler/:id/geri-al', izin: 'bulk.publish', ne: 'Geri alma adımını uygula' },
] as const satisfies ReadonlyArray<{ yontem: string; yol: string; izin: Permission; ne: string }>;
