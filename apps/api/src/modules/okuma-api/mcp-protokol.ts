/**
 * Protokolün bir araçtan bildiği kadarı. Okuma araçları (`okuma-araclari.ts`)
 * ve yazma araçları (`mcp-yazma-araclari.ts`) bu biçimi taşıyor; çalıştırma
 * ortamın işi (`McpOrtami.calistir`).
 */
export interface McpAraci {
  ad: string;
  baslik: string;
  aciklama: string;
  girdi: Record<string, unknown>;
  /**
   * İstemciye giden işaretler. Verilmezse SALT OKUMA. `yikici: true`
   * Claude Code'a "bu araç bir şey değiştirir" der ve istemci her çağrıda
   * izin sorar: onay sisteminin insan kapısı bu soru (MCP-YAZMA-MIMARI § 2).
   */
  isaret?: { saltOkuma: boolean; yikici: boolean; tekrarlanabilir: boolean };
}

/**
 * ═══ MCP — STREAMABLE HTTP, DURUMSUZ, YALNIZCA ARAÇLAR ═══
 *
 * Model Context Protocol'ün en dar uygulaması: tek `POST` ucu, JSON-RPC
 * 2.0, yanıt düz `application/json`. SDK KULLANILMIYOR: protokolün bize
 * gereken kısmı dört yöntem (`initialize`, `ping`, `tools/list`,
 * `tools/call`) ve paylaşımlı VPS'e yeni bir bağımlılık (ve onun taşıdığı
 * SSE/oturum makinesi) eklemenin karşılığı yok.
 *
 * DURUMSUZ: `Mcp-Session-Id` üretilmiyor; her istek kendi anahtarıyla
 * doğrulanıyor. Bu yüzden pm2 yeniden başlatması bağlı istemciyi
 * koparmıyor — oturum taşıyan bir sunucu deploy'da bütün istemcilere
 * "oturum bulunamadı" derdi.
 *
 * SAF: HTTP'ye bağlı değil, gövdeyi alıp yanıt gövdesini (ya da yalnızca
 * bildirim geldiyse `null` = 202) döndürüyor.
 */

/** Desteklenen sürümler, YENİDEN ESKİYE. İstemci bunlardan birini isterse aynısı dönüyor. */
export const MCP_SURUMLERI = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

/** OKUMA anahtarının talimatı. Yazma anahtarı `MCP_YAZMA_TALIMATLARI`nı alır. */
export const MCP_TALIMATLARI = [
  'Advetics salt okunur reklam verisi (Meta, Google, LinkedIn). Hiçbir araç yazmaz; kampanya açamaz, durduramaz, bütçe değiştiremez.',
  'Hiyerarşi: üst hesap (ajans) → şirket → workspace (proje) → reklam hesabı → kampanya → reklam grubu → reklam.',
  'Önce `kapsam` aracını çağırıp kimlikleri öğren; kimlik uydurma. Kimlikler Advetics UUID\'leridir, platformun kendi numaraları değil.',
  'Para alanları micros (1.000.000 = 1 birim) ve string; para birimi `currency` alanında. Farklı para birimlerini toplama.',
  'Tarihler YYYY-MM-DD; verilmezse son 30 gün (dün dahil). Boş sonuçta önce `veri_kapsami` ile verinin hangi aralıkta olduğuna bak.',
  'Bir araç hata dönerse mesajı oku: çoğu zaman hangi alanın yanlış olduğunu ve neyi çağırman gerektiğini söyler.',
].join('\n');

/**
 * YAZMA anahtarının talimatı. Onay kuralı BURADA da yazıyor, ama asıl kapı
 * sunucuda (onaysız işlem platforma gitmez) ve istemcinin izin sorusunda.
 */
export const MCP_YAZMA_TALIMATLARI = [
  'Advetics reklam paneli (Meta, Google, LinkedIn verisi; Meta ve Google için reklam kurma ve yönetme). Bu anahtar YAZABİLİR.',
  'Hiyerarşi: üst hesap (ajans) → şirket → workspace (proje) → reklam hesabı → kampanya → reklam grubu → reklam. Kimlikler Advetics UUID\'leridir; önce `kapsam` ile öğren, uydurma.',
  'Reklam kurmadan önce `yazma_durumu` ile workspace\'in hesaplarını, sayfalarını ve görsellerini oku. Reklam bir REHBER üzerinden kurulur: `rehber_olustur` → `rehber_guncelle` (alanlar) → `rehber_prova` → `rehber_yayinla`.',
  'Bütçe, takvim, hesap, konum, yaş ve özel kategori KULLANICININ söylediği değerlerdir: tahmin etme, eksikse sor. Para micros DİZGE (1.000.000 = 1 birim).',
  'Form amacı için rehberin formSablonuId alanı Meta\'daki yayında bir form ister: `form_sablonlari` ile var olanları listele; yeni form gerekiyorsa `form_olustur` (taslak, soruları ve gizlilik adresini kullanıcıya sor) → `form_yayinla` (onaylı) ve dönen Meta form kimliğini formSablonuId\'ye yaz.',
  'Görsel/video: `yukleme_adresi` ile adres al ve dosyayı kendi kabuğunda verilen curl komutuyla yükle; dönen varlik_id\'yi rehberin medya alanına yaz. Dosyayı argüman olarak (base64) gönderme.',
  'ONAY KURALI: rehber_yayinla, varlik_durdur, varlik_etkinlestir, butce_degistir ve form_yayinla hiçbir şeyi hemen yapmaz; bir onay_kodu ve özet döner. Özeti kullanıcıya AYNEN göster, "Onaylıyor musunuz?" diye sor ve YALNIZ kullanıcı açıkça evet derse `onayla(onay_kodu)` çağır. Hayır derse `vazgec`. Kullanıcıya sormadan onayla çağırmak yasak.',
  'Yayın her zaman DURAKLATILMIŞ kurulur; harcama başlatmak ayrı bir `varlik_etkinlestir` onayı ister. Kurulan kampanyanın kimliği `rehber_yayin_durumu`nda (yapı taraması görmediyse henüz yok: birkaç dakika sonra tekrar bak).',
  'Bir araç hata dönerse mesajı oku: çoğu zaman hangi alanın yanlış olduğunu ve neyi çağırman gerektiğini söyler.',
].join('\n');

export interface McpOrtami<A extends McpAraci = McpAraci> {
  araclar: readonly A[];
  /** Aracı çalıştır. Hata fırlatırsa mesajı `isError` sonucu olarak modele gider. */
  calistir(arac: A, args: unknown): Promise<unknown>;
  /** Fırlatılan hatayı modele gösterilecek cümleye çevir. */
  hataMetni(err: unknown): string;
  sunucu: { name: string; version: string };
  /** `initialize` cevabındaki talimat; anahtarın yetkisine göre seçiliyor. */
  talimat: string;
}

type Kimlik = string | number | null;
interface JsonRpcIstek {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

const hata = (id: Kimlik, code: number, message: string) => ({ jsonrpc: '2.0' as const, id, error: { code, message } });
const sonuc = (id: Kimlik, result: unknown) => ({ jsonrpc: '2.0' as const, id, result });

/** BigInt'i string'e çeviren JSON — servisler micros'u BigInt döndürebiliyor ve düz `JSON.stringify` patlar. */
export function jsonMetni(deger: unknown): string {
  return JSON.stringify(deger, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v), 2);
}

async function tekMesaj<A extends McpAraci>(m: unknown, ortam: McpOrtami<A>): Promise<object | null> {
  if (typeof m !== 'object' || m === null || Array.isArray(m)) {
    return hata(null, -32600, 'Geçersiz istek: JSON-RPC nesnesi bekleniyor');
  }
  const istek = m as JsonRpcIstek;
  const bildirim = !('id' in istek);
  const id: Kimlik = typeof istek.id === 'string' || typeof istek.id === 'number' ? istek.id : null;

  /*
   * BİLDİRİMLER CEVAPSIZ (`notifications/initialized`, `notifications/cancelled`).
   * Yanıt gönderen bir sunucu, bazı istemcilerde "beklenmeyen yanıt" ile
   * bağlantıyı kapatıyor.
   */
  if (bildirim) return null;
  if (istek.jsonrpc !== '2.0' || typeof istek.method !== 'string') {
    return hata(id, -32600, 'Geçersiz istek: jsonrpc "2.0" ve method zorunlu');
  }

  const params = (typeof istek.params === 'object' && istek.params !== null ? istek.params : {}) as Record<string, unknown>;

  switch (istek.method) {
    case 'initialize': {
      const istenen = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
      const surum = (MCP_SURUMLERI as readonly string[]).includes(istenen) ? istenen : MCP_SURUMLERI[0];
      return sonuc(id, {
        protocolVersion: surum,
        capabilities: { tools: { listChanged: false } },
        serverInfo: ortam.sunucu,
        instructions: ortam.talimat,
      });
    }
    case 'ping':
      return sonuc(id, {});
    case 'tools/list':
      return sonuc(id, {
        tools: ortam.araclar.map((a) => ({
          name: a.ad,
          title: a.baslik,
          description: a.aciklama,
          inputSchema: a.girdi,
          // `readOnlyHint: true` istemcinin onay sorusunu atlatabiliyor; yazma
          // araçlarında YANLIŞ olmalı, yoksa insan kapısı sessizce kalkar.
          annotations: {
            title: a.baslik,
            readOnlyHint: a.isaret?.saltOkuma ?? true,
            destructiveHint: a.isaret?.yikici ?? false,
            idempotentHint: a.isaret?.tekrarlanabilir ?? true,
            openWorldHint: false,
          },
        })),
      });
    /*
     * KAYNAK VE İSTEM LİSTESİ BOŞ DÖNÜYOR, "yöntem yok" DEĞİL. Yetenek
     * olarak bildirmiyoruz ama bazı masaüstü istemcileri yine de soruyor ve
     * hata alınca günlüğü kırmızıya boyuyor — kullanıcı çalışan bağlantıyı
     * bozuk sanıyor.
     */
    case 'resources/list':
      return sonuc(id, { resources: [] });
    case 'resources/templates/list':
      return sonuc(id, { resourceTemplates: [] });
    case 'prompts/list':
      return sonuc(id, { prompts: [] });
    case 'tools/call': {
      const ad = typeof params.name === 'string' ? params.name : '';
      const arac = ortam.araclar.find((a) => a.ad === ad);
      if (!arac) {
        return hata(id, -32602, `Bilinmeyen araç: "${ad}". Geçerli araçlar: ${ortam.araclar.map((a) => a.ad).join(', ')}`);
      }
      try {
        const veri = await ortam.calistir(arac, params.arguments ?? {});
        return sonuc(id, { content: [{ type: 'text', text: jsonMetni(veri) }], isError: false });
      } catch (err) {
        /*
         * ARAÇ HATASI PROTOKOL HATASI DEĞİL. JSON-RPC hatası modele
         * ulaşmıyor (istemci onu kendisi yutuyor); `isError` sonucu ise
         * modelin okuyup argümanını düzeltebileceği bir metin.
         */
        return sonuc(id, { content: [{ type: 'text', text: ortam.hataMetni(err) }], isError: true });
      }
    }
    default:
      return hata(id, -32601, `Desteklenmeyen yöntem: ${istek.method}`);
  }
}

/**
 * Gövdeyi işle. Dizi (toplu istek, 2025-03-26) destekleniyor. `null` =
 * yalnızca bildirim vardı, HTTP 202 ve boş gövde.
 */
export async function mcpIsle<A extends McpAraci>(govde: unknown, ortam: McpOrtami<A>): Promise<unknown> {
  if (Array.isArray(govde)) {
    if (govde.length === 0) return hata(null, -32600, 'Boş toplu istek');
    const yanitlar = (await Promise.all(govde.map((m) => tekMesaj(m, ortam)))).filter((y) => y !== null);
    return yanitlar.length ? yanitlar : null;
  }
  return tekMesaj(govde, ortam);
}
