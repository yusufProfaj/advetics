import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { actPath } from './meta.provider';

/**
 * Reklam hesabı yolu — ÇİFT ÖNEK TUZAĞI.
 *
 * `ad_accounts.external_id` Meta'dan `act_` ÖNEKİYLE geliyor. Önek
 * körlemesine eklendiğinde `act_act_1602474151544739` çıkıyor ve Meta bunu
 * şöyle reddediyor:
 *
 *   "Object with ID 'act_act_...' does not exist, cannot be loaded due to
 *    missing permissions, or does not support this operation."
 *
 * MESAJ YETKİ SORUNU GİBİ OKUNUYOR. Bu projede `ads_management` onayı zaten
 * beklendiği için hata "demek ki izin gelmemiş" diye yorumlanmaya son derece
 * müsait — sebebi bulmak saatler alabilir.
 *
 * Tuzağa BİR KEZ düşülmüş ve koruma yalnızca okuma yoluna konmuştu; dört
 * yazma yolu korumasız kaldı ve `ads_management` olmadan hiç çalıştırılamadığı
 * için yıllarca görünmeyebilirdi.
 *
 * Bu dosya iki şeyi kilitliyor: yardımcının davranışı ve KAYNAK TARAMASI —
 * biri yeni bir yazma yolu ekleyip yine körlemesine önek koyarsa test düşer.
 */

const SOURCE = readFileSync(join(__dirname, 'meta.provider.ts'), 'utf8');

describe('actPath', () => {
  it('öneksiz kimliğe önek ekliyor', () => {
    expect(actPath('1602474151544739')).toBe('act_1602474151544739');
  });

  it('ÖNEKLİ kimliğe İKİNCİ KEZ eklemiyor', () => {
    expect(actPath('act_1602474151544739')).toBe('act_1602474151544739');
  });

  it('idempotent — iki kez uygulamak sonucu değiştirmiyor', () => {
    expect(actPath(actPath('1602474151544739'))).toBe('act_1602474151544739');
  });
});

describe('kaynak taraması', () => {
  it('KÖRLEMESİNE önek ekleyen başka yer YOK', () => {
    /**
     * `act_${...}` kalıbı yalnızca yardımcının kendi gövdesinde geçebilir.
     * Başka bir yerde geçmesi, korumanın atlandığı yeni bir yol demek.
     */
    const occurrences = SOURCE.split('\n')
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter((l) => /act_\$\{/.test(l.line));

    // Tek meşru geçiş: `actPath` içindeki dönüş satırı.
    expect(occurrences.map((o) => o.line)).toEqual([
      "return externalId.startsWith('act_') ? externalId : `act_${externalId}`;",
    ]);
  });

  it('hesap yolu kuran her yer actPath kullanıyor', () => {
    // Kampanya, ad set, reklam, kreatif ve görsel yükleme uçlarının hepsi
    // hesap kimliğiyle kuruluyor; hiçbiri elle önek koymamalı.
    const uses = SOURCE.match(/actPath\(/g) ?? [];
    // Tanım + okuma (2) + yazma yolları (4).
    expect(uses.length).toBeGreaterThanOrEqual(6);
  });
});
