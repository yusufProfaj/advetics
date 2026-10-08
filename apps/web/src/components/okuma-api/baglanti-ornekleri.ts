/**
 * Bağlantı örnekleri — panelde ve testte aynı üretici.
 *
 * SAF ve ayrı dosyada: komut metni bir sözleşme (kullanıcı onu terminale
 * yapıştırıyor) ve bileşen render edilmeden sınanabilmeli. Belgedeki
 * (`docs/okuma-api/MCP-BAGLANTI.md`) örneklerle aynı biçimi taşıyor.
 */

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
): Array<{ baslik: string; aciklama: string; metin: string }> {
  const k = anahtar ?? ANAHTAR_YER_TUTUCU;
  return [
    {
      baslik: 'Claude Code',
      aciklama: 'Terminalde bir kez çalıştır. Sonra Claude Code içinde /mcp ile bağlantıyı görebilirsin.',
      metin: `claude mcp add --transport http --scope user advetics ${mcpUrl} --header "Authorization: Bearer ${k}"`,
    },
    {
      baslik: 'Claude Desktop',
      aciklama:
        'Ayarlar > Geliştirici > Yapılandırmayı düzenle ile açılan claude_desktop_config.json dosyasına ekle, sonra Claude Desktop\'ı yeniden başlat. Bilgisayarda Node.js kurulu olmalı.',
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
      baslik: 'Cursor ve diğer MCP istemcileri',
      aciklama: 'Uzak (HTTP) MCP sunucusunu başlıkla destekleyen istemciler için. Cursor: ~/.cursor/mcp.json',
      metin: JSON.stringify(
        { mcpServers: { advetics: { url: mcpUrl, headers: { Authorization: `Bearer ${k}` } } } },
        null,
        2,
      ),
    },
    {
      baslik: 'Bağlantı testi (curl)',
      aciklama: 'Araç listesi dönüyorsa anahtar ve adres doğru.',
      metin: `curl -s ${mcpUrl} -H "Authorization: Bearer ${k}" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
    },
  ];
}
