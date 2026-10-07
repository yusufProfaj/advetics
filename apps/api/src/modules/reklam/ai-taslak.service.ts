import { ConflictException, Injectable } from '@nestjs/common';
import type { ReklamTaslakKaydi, TaslakAlanlari, TenantContext } from '@advetics/shared';
import { ReklamTaslakService, type AlanDegisikligi } from './taslak.service';

/**
 * ASİSTAN ÖNERİSİNİ ONAYLA — `ai_onerisi` kaynaklı alanlar kullanıcının
 * kararı olur (kim = onaylayan).
 *
 * Bu dosyada bir süre tek atışlık "cümle + görsel → taslak" çağrısı da
 * duruyordu; AdvCampaign sohbeti onun yerini aldı ve yapay zekâ Gemini'ye
 * taşındı (2026-10-08). Taslak üretimi artık yalnız sohbetin araçlarında
 * (`sohbet/araclar.ts`); iki ayrı üretim yolu doğduğu anda ayrışırdı.
 */
@Injectable()
export class ReklamAiTaslakService {
  constructor(private readonly taslak: ReklamTaslakService) {}

  /**
   * Kullanıcının GÖRDÜĞÜ sürümün özetiyle. Özet eşleşmezse onay yok:
   * kullanıcı başka bir hâli onaylamış olurdu.
   */
  async onayla(ctx: TenantContext, taslakId: string, icerikOzeti: string): Promise<ReklamTaslakKaydi> {
    const t = await this.taslak.oku(ctx, taslakId);
    if (t.icerikOzeti !== icerikOzeti) throw new ConflictException('Sen bakarken taslak değişti; önizlemeyi yenile.');
    const d: AlanDegisikligi = {};
    for (const [ad, v] of Object.entries(t.alanlar) as Array<[keyof TaslakAlanlari, { deger: unknown; kaynak: string }]>) {
      if (v?.kaynak === 'ai_onerisi') d[ad] = { deger: v.deger, kaynak: 'kullanici' };
    }
    if (Object.keys(d).length === 0) return t;
    return this.taslak.surumYaz(ctx, taslakId, d);
  }
}
