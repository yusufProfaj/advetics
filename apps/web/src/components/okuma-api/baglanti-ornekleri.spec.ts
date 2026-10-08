import { describe, expect, it } from 'vitest';
import { ANAHTAR_YER_TUTUCU, baglantiOrnekleri, mcpAdresi } from './baglanti-ornekleri';

describe('MCP adresi', () => {
  it('mutlak API kökünden', () => {
    expect(mcpAdresi('https://advetics.com/api', null)).toBe('https://advetics.com/api/mcp');
    expect(mcpAdresi('https://advetics.com/api/', 'https://x.com')).toBe('https://advetics.com/api/mcp');
  });

  it('göreli kök tarayıcının alan adına bağlanıyor', () => {
    expect(mcpAdresi('/api', 'https://advetics.com')).toBe('https://advetics.com/api/mcp');
  });
});

describe('bağlantı örnekleri', () => {
  it('anahtar varsa HER örnekte, yer tutucu hiçbirinde yok', () => {
    const o = baglantiOrnekleri('https://advetics.com/api/mcp', 'adv_ro_abc');
    expect(o.length).toBeGreaterThanOrEqual(3);
    for (const x of o) {
      expect(x.metin, x.baslik).toContain('adv_ro_abc');
      expect(x.metin, x.baslik).toContain('https://advetics.com/api/mcp');
      expect(x.metin, x.baslik).not.toContain(ANAHTAR_YER_TUTUCU);
    }
  });

  it('Claude Code komutu HTTP taşımasını ve Bearer başlığını taşıyor', () => {
    const cc = baglantiOrnekleri('https://a/api/mcp', 'adv_ro_k').find((x) => x.baslik === 'Claude Code')!;
    expect(cc.metin).toContain('--transport http');
    expect(cc.metin).toContain('"Authorization: Bearer adv_ro_k"');
  });

  it('Claude Desktop JSON geçerli ve başlık boşluksuz (mcp-remote argüman bölme sorunu)', () => {
    const cd = baglantiOrnekleri('https://a/api/mcp', 'adv_ro_k').find((x) => x.baslik === 'Claude Desktop')!;
    const json = JSON.parse(cd.metin) as {
      mcpServers: { advetics: { args: string[]; env: Record<string, string> } };
    };
    expect(json.mcpServers.advetics.args).toContain('Authorization:${ADVETICS_YETKI}');
    expect(json.mcpServers.advetics.env.ADVETICS_YETKI).toBe('Bearer adv_ro_k');
  });
});
