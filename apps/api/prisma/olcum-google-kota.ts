/**
 * ═══ GOOGLE KOTASINI ÜRETİMDE ÖLÇ ═══
 *
 * Kotayı tekrar denemeler mi, gerçekten fazla istek mi yiyor? Sorgular ve
 * gerekçeleri `olcum-google-kota-sorgular.ts` içinde.
 *
 * GÜVENCELER:
 *   · HİÇBİR ŞEY YAZMIYOR: `READ ONLY` transaction, sonunda ROLLBACK.
 *   · Sorgu başına 30 sn sınırı (`olcum-senkron.ts`te öğrenildi: sınırsız
 *     bir sorgu aracı hiçbir şey basmadan asılı bırakıyordu).
 *   · Yönetici istemcisi (BYPASSRLS) kullanılıyor: soru bütün Google
 *     hesaplarının TOPLAMI, tek bir kullanıcının gördüğü dilim değil. Kota
 *     geliştirici token'ı başına olabilir ve o zaman her hesap aynı kovadan
 *     içiyor demektir.
 *
 * Kullanım (advetics kullanıcısı, depo kökünde):
 *   pnpm --filter @advetics/api olcum-google-kota
 *   pnpm --filter @advetics/api olcum-google-kota -- --gun=3
 */
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { SORGULAR, turTahminleri, type IsTuruSatiri, type Sorgu } from './olcum-google-kota-sorgular';

loadEnv({ path: resolve(__dirname, '../../../.env') });

// pnpm 9 `--`'yı gerçek argüman olarak geçiriyor (bkz. sync-cli.ts).
const ARGV = process.argv.slice(2).filter((a) => a !== '--');
const arg = (ad: string) => ARGV.find((a) => a.startsWith(`--${ad}=`))?.slice(ad.length + 3);

const GUN = Number(arg('gun') ?? 7);
const SORGU_SINIRI_MS = 30_000;

const admin = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });

/** Transaction'ı geri almak için kullanılan iç sinyal; hata değil. */
class GeriAl extends Error {}

interface Tx {
  $queryRawUnsafe<T>(sql: string, ...params: unknown[]): Promise<T>;
}

async function main() {
  if (!Number.isInteger(GUN) || GUN < 1 || GUN > 90) {
    throw new Error(`--gun 1 ile 90 arasında bir tam sayı olmalı (verilen: ${arg('gun')}).`);
  }

  await admin
    .$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe('SET TRANSACTION READ ONLY');
        await tx.$queryRawUnsafe(`SET LOCAL statement_timeout = '${SORGU_SINIRI_MS}ms'`);

        console.log(`═══ GOOGLE KOTASI — son ${GUN} gün ═══`);

        const [tel] = await oku<{ satir: number }>(tx, SORGULAR.telemetri);
        const [env] = await oku<{ toplam: number; atanmis: number; izlenen: number }>(
          tx,
          SORGULAR.envanter,
        );
        console.log(`  api_usage_log Google satırı : ${tel?.satir ?? 0}`);
        console.log(
          `  Google hesabı               : ${env?.toplam ?? 0} toplam · ${env?.atanmis ?? 0} atanmış · ${env?.izlenen ?? 0} izlenen`,
        );

        const turler = await oku<IsTuruSatiri>(tx, SORGULAR.isTuru);
        tablo(turler);

        console.log('\n═══ ÇAĞRI: ölçülen / kayıtsız denemelerin TAHMİNİ (üst sınır) ═══');
        let olculen = 0;
        let kayitsiz = 0;
        let bilinmeyen = 0;
        for (const t of turTahminleri(turler)) {
          olculen += t.olculen;
          if (t.kayitsiz === null) bilinmeyen += t.kayitsizDeneme;
          else kayitsiz += t.kayitsiz;
          console.log(
            `  ${t.tur.padEnd(20)} ölçülen ${String(t.olculen).padStart(7)} · ` +
              `iş başı ${t.ortalama === null ? '   -' : t.ortalama.toFixed(1).padStart(5)} · ` +
              `kayıtsız deneme ${String(t.kayitsizDeneme).padStart(5)} → ` +
              (t.kayitsiz === null ? 'TAHMİN EDİLEMİYOR (başarılı iş yok)' : `~${t.kayitsiz}`),
          );
        }
        const toplam = olculen + kayitsiz;
        console.log(`  TOPLAM: ölçülen ${olculen} + tahmini ${kayitsiz} = ~${toplam}`);
        if (toplam > 0) {
          console.log(`  Kayıtsız denemelerin payı: EN FAZLA %${((kayitsiz / toplam) * 100).toFixed(0)}`);
        }
        if (bilinmeyen > 0) {
          console.log(`  ! ${bilinmeyen} deneme hiç başarılı işi olmayan türlerde; paya KATILMADI.`);
        }
        console.log(`  Günlük ortalama: ~${Math.round(toplam / GUN)} çağrı`);

        console.log(`\n═══ ${SORGULAR.hataKodu.ad} ═══`);
        tablo(await oku(tx, SORGULAR.hataKodu));

        console.log(`\n═══ ${SORGULAR.mesajlar.ad} ═══`);
        for (const m of await oku<{ mesaj: string; adet: number }>(tx, SORGULAR.mesajlar)) {
          console.log(`  [${m.adet}] ${m.mesaj}`);
        }

        console.log(`\n═══ ${SORGULAR.saat.ad} ═══`);
        console.log('  Google günlük kotası Pasifik gece yarısı sıfırlanıyor = İstanbul 10:00 (yaz saati).');
        console.log('  Hatalar o saatten sonra başlayıp gün boyu sürüyorsa günlük TAVAN; dağınıksa HIZ sınırı.');
        const saatler = await oku<{ gun: string; saat: number; adet: number }>(tx, SORGULAR.saat);
        for (const gun of [...new Set(saatler.map((s) => s.gun))]) {
          const dizi = Array.from({ length: 24 }, (_, h) => saatler.find((s) => s.gun === gun && s.saat === h)?.adet ?? 0);
          console.log(`  ${gun}  ${dizi.map((n) => (n === 0 ? '  .' : String(n).padStart(3))).join('')}`);
        }
        if (saatler.length > 0) {
          console.log(`              ${Array.from({ length: 24 }, (_, h) => String(h).padStart(3)).join('')}`);
        } else {
          console.log('  (bu dönemde kota hatası yok)');
        }

        console.log(`\n═══ ${SORGULAR.hesap.ad} ═══`);
        tablo(await oku(tx, SORGULAR.hesap));

        throw new GeriAl();
      },
      { timeout: 600_000, maxWait: 60_000 },
    )
    .catch((e: unknown) => {
      if (!(e instanceof GeriAl)) throw e;
    });

  console.log('\nBitti — hiçbir satır yazılmadı (salt okunur transaction, geri alındı).');
}

/** Başlık ÖNCE basılıyor: yavaş bir sorguda hangi parçada olunduğu görünsün. */
async function oku<T>(tx: Tx, s: Sorgu): Promise<T[]> {
  process.stdout.write(`  … ${s.ad}\r`);
  // Parametresiz sorguya parametre vermek Postgres'te hata ("bind message
  // supplies 1 parameters"); yalnızca `$1` taşıyan sorguya geçiliyor.
  return s.sql.includes('$1') ? tx.$queryRawUnsafe<T[]>(s.sql, GUN) : tx.$queryRawUnsafe<T[]>(s.sql);
}

function tablo(satirlar: object[]): void {
  if (satirlar.length === 0) {
    console.log('  (satır yok)');
    return;
  }
  console.table(satirlar);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.$disconnect();
  });
