import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ `/organization` UCU HANGİ ŞİRKETİ ANLATIYOR ═══
 *
 * Bu uç uzun süre yüklemsiz `findFirst()` kullanıyordu ve yanındaki yorum
 * "RLS zaten tek satır bırakır" diyordu. O cümle ÜST HESAP (MCC) katmanı
 * geldiğinde ÇÜRÜDÜ: `adv_organizations_select` politikası aynı ajansın
 * BÜTÜN şirketlerini görünür kılıyor — şirket seçicinin listesi oradan
 * geliyor.
 *
 * Sonucu iki ayrı arıza:
 *   · OKUMADA sessiz — panel rastgele bir kardeş şirketin adını basar.
 *   · YAZMADA anlaşılmaz — UPDATE politikası (`id = current_org_id()`) o
 *     satırı reddettiği için "kayıt bulunamadı" diyen bir kaydet düğmesi.
 *
 * Bu ekran şimdi PANELDEN kullanılıyor (`SirketDuzenle`), yani kural artık
 * kullanıcının gördüğü bir şeyi belirliyor.
 *
 * TARAMA YORUMSUZ KAYNAKTA (CLAUDE.md): kuralı ANLATAN yorum aynı dosyada
 * duruyor ve `toContain` ikisini ayırt etmiyor.
 */
const KAYNAK = readFileSync(resolve(__dirname, 'organizations.controller.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/**
 * Metot gövdesini SÜSLÜ PARANTEZ SAYARAK çıkarır.
 *
 * Sabit uzunluklu bir dilim komşu metodu yakalıyor: bu dosyada iki metot
 * arka arkaya ve ikisi de `organization.` ile başlayan çağrılar taşıyor —
 * `get`in yüklemini silmek, `update`inkine takılıp testi geçirirdi.
 */
function govde(ad: string): string {
  const bas = KAYNAK.indexOf(ad);
  if (bas === -1) throw new Error(`Metot bulunamadı: ${ad} — tarama boşa düştü`);
  const acilis = KAYNAK.indexOf('{', KAYNAK.indexOf(')', bas));
  let derinlik = 0;
  for (let i = acilis; i < KAYNAK.length; i += 1) {
    if (KAYNAK[i] === '{') derinlik += 1;
    else if (KAYNAK[i] === '}') {
      derinlik -= 1;
      if (derinlik === 0) return KAYNAK.slice(acilis, i + 1);
    }
  }
  throw new Error(`Gövde kapanmadı: ${ad}`);
}

describe('tarama gerçekten bir şey yakaladı', () => {
  it('iki metot gövdesi de dolu ve BİRBİRİNDEN AYRI', () => {
    const okuma = govde('async get(');
    const yazma = govde('async update(');
    expect(okuma.length).toBeGreaterThan(100);
    expect(yazma.length).toBeGreaterThan(100);
    // Dilimler örtüşseydi aşağıdaki iddialar birbirinin kanıtına takılırdı.
    expect(okuma).not.toContain('organization.update');
    expect(yazma).not.toContain('_count');
  });
});

describe('KRİTİK: uç AKTİF ŞİRKETE çivili', () => {
  it('okuma `ctx.orgId` ile süzüyor — yüklemsiz findFirst YOK', () => {
    const okuma = govde('async get(');
    expect(okuma).toContain('where: { id: ctx.orgId }');
    // Yüklemsiz çağrının kendisi de yasak: kardeş şirket dönerdi.
    expect(okuma).not.toContain('findFirst({\n        select');
  });

  it('yazma `ctx.orgId` ile süzüyor — yüklemsiz findFirstOrThrow YOK', () => {
    const yazma = govde('async update(');
    expect(yazma).toContain('findFirstOrThrow({ where: { id: ctx.orgId } })');
    expect(yazma).not.toContain('findFirstOrThrow()');
  });

  it('UPDATE hedefini okunan satırdan alıyor — ikinci bir sorgu YOK', () => {
    /*
     * `where: { id: before.id }` ile `before` aynı yüklemden geliyor.
     * Güncellemeyi ayrı bir arama üzerinden yapmak, denetim kaydındaki
     * "önce" değerinin başka bir satıra ait olma ihtimalini açardı.
     */
    expect(govde('async update(')).toContain('where: { id: before.id }');
  });
});

describe('yetki kapısı yerinde', () => {
  it('yazma org yöneticisi ve `org.write` istiyor', () => {
    // Şirket adı seçicide, raporlarda ve müşteriye giden maillerde
    // görünüyor; onu değiştirmek ajans işi.
    const bas = KAYNAK.indexOf('@Patch()');
    const son = KAYNAK.indexOf('async update(');
    expect(bas).toBeGreaterThan(-1);
    expect(son).toBeGreaterThan(bas);
    const dilim = KAYNAK.slice(bas, son);
    expect(dilim).toContain('@RequireOrgAdmin()');
    expect(dilim).toContain("@RequirePermissions('org.write')");
  });
});
