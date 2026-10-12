import { Inject, Injectable } from '@nestjs/common';
import { GORU_AYARI, goruBicimi } from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { YAPAY_ZEKA } from '../../yapay-zeka/yapay-zeka.module';
import type { GeminiIstemcisi } from '../../yapay-zeka/gemini';
import { KreatifAdresiService } from '../reports/kreatif-adresi.service';
import { goruIcinIndir } from '../reports/kreatif-gorseli';
import { kreatifEtiketIsi, type EtiketIsiCiktisi } from './etiket-isi';
import type { TxLike } from './sayac';

/**
 * İş süresi bütçesi: kimse ekranda beklemiyor ama worker slotu sonsuza
 * kadar tutulmamalı. Yarılama en kötü hâlde 2N-1 istek ve N en çok 40.
 */
const TAZELEME_BUTCESI_MS = 90_000;

/**
 * WORKER TARAFI (Paket D): `creative_tags` işinin Nest sarmalayıcısı.
 * Mantık `etiket-isi.ts`te ve gerçek veritabanıyla sınanıyor; burada yalnız
 * bağımlılıklar bağlanıyor:
 *
 * - BYPASSRLS istemcisi (iş bir kullanıcı adına değil).
 * - Gemini istemcisi (anahtar yoksa `null`; iş bunu SÖYLÜYOR).
 * - ORTAK tazeleme çekirdeği, `creative_tag` kota katmanıyla.
 * - Rapordaki korumalarla indirme, görü biçim listesiyle (WebP dahil).
 */
@Injectable()
export class KreatifEtiketService {
  constructor(
    private readonly db: PrismaAdminService,
    private readonly adres: KreatifAdresiService,
    @Inject(YAPAY_ZEKA) private readonly gemini: GeminiIstemcisi | null,
  ) {}

  calistir(adAccountId: string): Promise<EtiketIsiCiktisi> {
    return kreatifEtiketIsi(
      {
        tx: this.db as unknown as TxLike,
        gemini: this.gemini,
        adresTazele: (hesap, idler) =>
          this.adres.hesapAdresleri(hesap, idler, { katman: 'creative_tag', bitis: Date.now() + TAZELEME_BUTCESI_MS, etiket: 'kreatif_etiket' }),
        indir: (url) =>
          goruIcinIndir(url, {
            maxBayt: GORU_AYARI.maxBayt,
            zamanAsimiMs: GORU_AYARI.indirmeZamanAsimiMs,
            bicimAnla: goruBicimi,
            bicimHatasi: 'desteklenmeyen biçim (yalnızca JPEG/PNG/WebP)',
          }),
      },
      adAccountId,
    );
  }
}
