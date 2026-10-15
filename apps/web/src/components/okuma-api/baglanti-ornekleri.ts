/**
 * Bağlantı örnekleri — panelde ve testte aynı üretici.
 *
 * SAF ve ayrı dosyada: komut metni bir sözleşme (kullanıcı onu terminale
 * yapıştırıyor) ve bileşen render edilmeden sınanabilmeli. Belgedeki
 * (`docs/okuma-api/MCP-BAGLANTI.md`) örneklerle aynı biçimi taşıyor.
 */
import { sec, type Dil } from '@advetics/shared';
import { hesabimSozlugu } from '@/dil/sozlukler/ayarlar-hesabim';

/** API kök adresinden mutlak MCP adresi. Göreli kök ("/api") tarayıcının alan adına bağlanıyor. */
export function mcpAdresi(apiUrl: string, origin: string | null): string {
  const kok = apiUrl.replace(/\/+$/, '');
  if (/^https?:\/\//.test(kok) || origin === null) return `${kok}/mcp`;
  return `${origin.replace(/\/+$/, '')}${kok.startsWith('/') ? '' : '/'}${kok}/mcp`;
}

export const ANAHTAR_YER_TUTUCU = 'adv_ro_ANAHTARINIZ';

export function baglantiOrnekleri(
  mcpUrl: string,
  anahtar: string | null,
  dil: Dil = 'tr',
): Array<{ baslik: string; aciklama: string; metin: string }> {
  const k = anahtar ?? ANAHTAR_YER_TUTUCU;
  // Ürün adları ("Claude Code", "Claude Desktop") iki dilde aynı; açıklamalar sözlükten.
  const d = sec(hesabimSozlugu, dil).ornek;
  return [
    {
      baslik: 'Claude Code',
      aciklama: d.claudeCode,
      metin: `claude mcp add --transport http --scope user advetics ${mcpUrl} --header "Authorization: Bearer ${k}"`,
    },
    {
      baslik: 'Claude Desktop',
      aciklama: d.claudeDesktop,
      metin: JSON.stringify(
        {
          mcpServers: {
            advetics: {
              command: 'npx',
              args: ['-y', 'mcp-remote', mcpUrl, '--header', 'Authorization:${ADVETICS_YETKI}'],
              env: { ADVETICS_YETKI: `Bearer ${k}` },
            },
          },
        },
        null,
        2,
      ),
    },
    {
      baslik: d.digerBaslik,
      aciklama: d.diger,
      metin: JSON.stringify(
        { mcpServers: { advetics: { url: mcpUrl, headers: { Authorization: `Bearer ${k}` } } } },
        null,
        2,
      ),
    },
    {
      baslik: d.testBaslik,
      aciklama: d.test,
      metin: `curl -s ${mcpUrl} -H "Authorization: Bearer ${k}" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    },
  ];
}
