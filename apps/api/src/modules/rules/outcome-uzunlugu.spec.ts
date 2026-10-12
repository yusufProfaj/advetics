import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACTION_OUTCOMES } from '@advetics/shared';
import { createHarness, type Harness } from '../../../test/pglite-harness';

/**
 * AJAN4-BULGU B-1 (d3d22979 kapısı): `rule_action_logs.outcome` VARCHAR(24)
 * (20260807140000_module5_rules) ve yeni `skipped_no_conversion_signal` 28
 * karakter. CHECK genişletildi ama kolon değil: ilk arama kampanyasında
 * `writeLog` INSERT'i "value too long" ile düşüyor, transaction iptal oluyor
 * ve TURUN TAMAMI kayboluyor — aynı turda platformda uygulanmış eylemler
 * kayıtsız kalıyor, kural her turda tekrar deniyor. `evaluateRule` testleri
 * log yazmadığı için bunu göremedi. Kural: her sonuç kodu kolona SIĞMALI.
 */
let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

describe('rule_action_logs.outcome genişliği', () => {
  it('KRİTİK: ACTION_OUTCOMES içindeki her kod kolona sığıyor', async () => {
    const [r] = await h.q<{ n: number }>(
      `SELECT character_maximum_length AS n FROM information_schema.columns
        WHERE table_name = 'rule_action_logs' AND column_name = 'outcome'`,
    );
    expect(r?.n).toBeGreaterThan(0);
    const sigmayan = ACTION_OUTCOMES.filter((o) => o.length > Number(r!.n));
    expect(sigmayan).toEqual([]);
  });
});
