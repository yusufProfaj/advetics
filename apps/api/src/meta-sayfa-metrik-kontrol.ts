/**
 * ═══ ORGANİK GÖNDERİ İSTATİSTİK METRİKLERİNİ CANLIDA SINA ═══
 *
 * Canlıda (2026-09-30) Facebook sayfası gönderi çekimi
 * `(#100) The value must be a valid insights metric` ile düştü. Kod
 * `post_impressions,post_impressions_unique,post_video_views` istiyor ve
 * hangisinin reddedildiğini mesaj söylemiyor. Sağlayıcı artık reddi görünce
 * gönderileri istatistiksiz çekiyor (`icgoruReddiMi`); DOĞRU metrik adı ise
 * tahminle yazılmıyor, bu betikle ölçülüyor.
 *
 * Her sayfanın en yeni gönderisinde aday metrikleri TEK TEK ister ve
 * hangisinin kabul edildiğini, dönen değeri ve reddin cümlesini basar.
 * HİÇBİR ŞEY YAZMIYOR: yalnızca GET.
 *
 * NEST BAĞLAMIYLA ÇALIŞIYOR, bu yüzden `dist`ten koşuyor (`meta-ilgi-kontrol`
 * ile aynı gerekçe: tsx dekoratör metadatası üretmiyor).
 *
 * Kullanım (advetics kullanıcısı, depo kökünde, deploy'dan SONRA):
 *   pnpm --filter @advetics/api meta-sayfa-metrik-kontrol
 *   pnpm --filter @advetics/api meta-sayfa-metrik-kontrol -- --adet 5
 *   pnpm --filter @advetics/api meta-sayfa-metrik-kontrol -- --profil <social_profile uuid>
 */
import 'reflect-metadata';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';

// TEK .env DEPO KÖKÜNDE (CLAUDE.md §2). `dist/` → `apps/api` → `apps` → kök.
loadEnv({ path: resolve(__dirname, '../../../.env') });

import { AppModule } from './app.module';
import { PrismaAdminService } from './prisma/prisma-admin.service';
import { CryptoService } from './crypto/crypto.service';
import { CONFIG, type AppConfig } from './config/configuration';

const ARGV = process.argv.slice(2).filter((a) => a !== '--');
function arg(name: string): string | undefined {
  const i = ARGV.indexOf(`--${name}`);
  return i !== -1 ? ARGV[i + 1] : undefined;
}

/**
 * ADAYLAR. İlk üçü kodun bugün istedikleri; kalanı Meta'nın "görüntülenme"
 * adı altında birleştirdiği yeni metrikler ve sık kullanılan komşular.
 * Liste bir tahmin değil bir SORU: hangisinin kabul edildiğini betik söylüyor.
 */
const FB_ADAYLAR = [
  'post_impressions',
  'post_impressions_unique',
  'post_video_views',
  'post_media_view',
  'post_total_media_view_unique',
  'post_impressions_organic',
  'post_impressions_organic_unique',
  'post_clicks',
  'post_reactions_by_type_total',
];
const IG_ADAYLAR = ['impressions', 'reach', 'saved', 'views', 'total_interactions'];

async function getJson(url: string, token: string): Promise<{ ok: boolean; govde: Record<string, unknown> }> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const govde = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: r.ok, govde };
}

function hataCumlesi(govde: Record<string, unknown>): string {
  const e = govde.error as { message?: string; code?: number } | undefined;
  return e ? `(${e.code ?? '?'}) ${e.message ?? 'bilinmeyen hata'}` : 'bilinmeyen hata';
}

function degerOku(govde: Record<string, unknown>): string {
  const data = govde.data as Array<{ values?: Array<{ value?: unknown }> }> | undefined;
  const v = data?.[0]?.values?.[0]?.value;
  return v === undefined ? '(değer yok)' : JSON.stringify(v);
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const db = app.get(PrismaAdminService);
    const crypto = app.get(CryptoService);
    const surum = app.get<AppConfig>(CONFIG).platforms.meta.apiVersion;
    const graph = `https://graph.facebook.com/${surum}`;

    const profilId = arg('profil');
    const adet = Number(arg('adet') ?? '3');
    const profiller = await db.socialProfile.findMany({
      where: profilId
        ? { id: profilId }
        : {
            profileType: { in: ['facebook_page', 'instagram_business'] },
            clientId: { not: null },
            pageAccessTokenEnc: { not: null },
            connection: { status: 'active' },
          },
      select: { id: true, name: true, externalId: true, profileType: true, pageAccessTokenEnc: true },
      orderBy: { name: 'asc' },
      take: profilId ? 1 : adet * 2,
    });
    if (profiller.length === 0) {
      console.log('\n  ✗ Sayfa token\'ı olan, atanmış bir sayfa bulunamadı.\n');
      process.exitCode = 1;
      return;
    }

    console.log(`\n  Graph sürümü: ${surum}`);
    // Her türden en fazla `adet` profil: yalnızca Facebook'u ölçmek, Instagram
    // tarafının da bir gün aynı reddi verdiğini gizlerdi.
    const secilen = [
      ...profiller.filter((p) => p.profileType === 'facebook_page').slice(0, adet),
      ...profiller.filter((p) => p.profileType === 'instagram_business').slice(0, adet),
    ];

    for (const p of secilen) {
      const ig = p.profileType === 'instagram_business';
      console.log(`\n═══ ${ig ? 'Instagram' : 'Facebook'} · ${p.name} (${p.externalId}) ═══`);
      const token = crypto.decrypt(Buffer.from(p.pageAccessTokenEnc!));

      const liste = await getJson(`${graph}/${p.externalId}/${ig ? 'media' : 'posts'}?fields=id&limit=1`, token);
      if (!liste.ok) {
        console.log(`  ✗ gönderi listesi alınamadı: ${hataCumlesi(liste.govde)}`);
        continue;
      }
      const postId = (liste.govde.data as Array<{ id: string }> | undefined)?.[0]?.id;
      if (!postId) {
        console.log('  – sayfada gönderi yok, atlandı');
        continue;
      }
      console.log(`  gönderi: ${postId}`);

      for (const m of ig ? IG_ADAYLAR : FB_ADAYLAR) {
        const r = await getJson(`${graph}/${postId}/insights?metric=${m}`, token);
        console.log(
          r.ok ? `  ✓ ${m.padEnd(34)} ${degerOku(r.govde)}` : `  ✗ ${m.padEnd(34)} ${hataCumlesi(r.govde)}`,
        );
      }
    }
    console.log(
      '\n  Kabul edilen (✓) metriklerle `fetchOrganicPosts` alan listesi güncellenmeli;' +
        '\n  reddedilen (✗) her ad, isteğin TAMAMINI düşürüyor.\n',
    );
  } finally {
    await app.close();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
