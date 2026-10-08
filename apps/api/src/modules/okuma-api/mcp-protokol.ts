import type { OkumaAraci } from './okuma-araclari';

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

export const MCP_TALIMATLARI = [
  'Advetics salt okunur reklam verisi (Meta, Google, LinkedIn). Hiçbir araç yazmaz; kampanya açamaz, durduramaz, bütçe değiştiremez.',
  'Hiyerarşi: üst hesap (ajans) → şirket → workspace (proje) → reklam hesabı → kampanya → reklam grubu → reklam.',
  'Önce `kapsam` aracını çağırıp kimlikleri öğren; kimlik uydurma. Kimlikler Advetics UUID\'leridir, platformun kendi numaraları değil.',
  'Para alanları micros (1.000.000 = 1 birim) ve string; para birimi `currency` alanında. Farklı para birimlerini toplama.',
  'Tarihler YYYY-MM-DD; verilmezse son 30 gün (dün dahil). Boş sonuçta önce `veri_kapsami` ile verinin hangi aralıkta olduğuna bak.',
  'Bir araç hata dönerse mesajı oku: çoğu zaman hangi alanın yanlış olduğunu ve neyi çağırman gerektiğini söyler.',
].join('\n');

export interface McpOrtami {
  araclar: readonly OkumaAraci[];
  /** Aracı çalıştır. Hata fırlatırsa mesajı `isError` sonucu olarak modele gider. */
  calistir(arac: OkumaAraci, args: unknown): Promise<unknown>;
  /** Fırlatılan hatayı modele gösterilecek cümleye çevir. */
  hataMetni(err: unknown): string;
  sunucu: { name: string; version: string };
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

async function tekMesaj(m: unknown, ortam: McpOrtami): Promise<object | null> {
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
        instructions: MCP_TALIMATLARI,
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
          // İstemciye "bu araç bir şey değiştirmez" — onay sorusunu atlatabiliyor.
          annotations: { title: a.baslik, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
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
export async function mcpIsle(govde: unknown, ortam: McpOrtami): Promise<unknown> {
  if (Array.isArray(govde)) {
    if (govde.length === 0) return hata(null, -32600, 'Boş toplu istek');
    const yanitlar = (await Promise.all(govde.map((m) => tekMesaj(m, ortam)))).filter((y) => y !== null);
    return yanitlar.length ? yanitlar : null;
  }
  return tekMesaj(govde, ortam);
}
