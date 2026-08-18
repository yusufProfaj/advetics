/**
 * YOUTUBE DATA API ANAHTARI TANISI.
 *
 * NEDEN AYRI BİR ARAÇ: ".env'e yazdım" ile "uygulama okuyor ve çalışıyor"
 * arasında dört ayrı arıza yolu var ve dördü de sessiz:
 *
 *   1. Anahtar dosyada ama uygulamanın okuduğu dosya BAŞKA
 *   2. Anahtar okunuyor ama API etkinleştirilmemiş  -> 403
 *   3. Anahtar okunuyor ama IP kısıtı sunucuyu dışarıda bırakıyor -> 403
 *   4. Anahtar okunuyor ama API kısıtı YouTube'u kapsamıyor -> 403
 *
 * Üçü de aynı HTTP koduyla dönüyor ve "çalışmıyor" diye görünüyor. Bu araç
 * Google'ın kendi hata mesajını olduğu gibi gösteriyor — bu projede en çok
 * işe yarayan şey platformun kendi cümlesi oldu.
 *
 * ANAHTARIN KENDİSİ HİÇ YAZDIRILMIYOR. Uzunluğu ve ilk dört karakteri
 * gösteriliyor; o kadarı "doğru anahtarı mı koydum" sorusuna cevap veriyor,
 * sızıntı üretmeden. Çıktı bir sohbete ya da issue'ya yapıştırılabilir.
 *
 * `prisma/` ALTINDA çünkü diğer tsx ops araçları (sync-cli, seed, apply-sql)
 * orada. Nest açmıyor, veritabanına dokunmuyor — dolayısıyla derleme
 * beklemeden çalışıyor ve anahtarı ekler eklemez sınanabiliyor.
 *
 * Kullanım:
 *   pnpm --filter @advetics/api youtube-check
 *   pnpm --filter @advetics/api youtube-check -- <video-id>
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// TEK .env VE DEPO KÖKÜNDE. Yolu değiştirmek, çalışan bütün ops araçlarını
// bozar — `seed-env-path.spec.ts` bu yolu kilitliyor.
loadEnv({ path: resolve(__dirname, '../../../.env') });

/**
 * Varsayılan sınama videosu — YouTube'un kendi kanalından, herkese açık ve
 * yıllardır ayakta. Müşterinin videosunu kullanmak, anahtar sorunuyla
 * "video silinmiş" durumunu birbirine karıştırırdı.
 */
const VARSAYILAN_VIDEO = 'dQw4w9WgXcQ';

const YESIL = '\x1b[32m';
const KIRMIZI = '\x1b[31m';
const SARI = '\x1b[33m';
const SIFIRLA = '\x1b[0m';

function ok(m: string): void {
  console.log(`${YESIL}✓${SIFIRLA} ${m}`);
}
function hata(m: string): void {
  console.log(`${KIRMIZI}✗${SIFIRLA} ${m}`);
}
function uyari(m: string): void {
  console.log(`${SARI}!${SIFIRLA} ${m}`);
}

async function main(): Promise<void> {
  console.log('\nYouTube Data API anahtarı tanısı\n');

  // --- 1. Anahtar okunuyor mu
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    hata('YOUTUBE_API_KEY okunamadı.');
    console.log(
      `\n  Aranan dosya: ${resolve(__dirname, '../../../.env')}\n` +
        '  Bu dosyada YOUTUBE_API_KEY satırı var mı ve boş mu?\n' +
        '  Adımlar: docs/DEPLOYMENT.md §5c\n',
    );
    process.exit(1);
  }
  // Anahtarın KENDİSİ yazdırılmıyor — çıktı paylaşılabilir kalsın.
  ok(`Anahtar okundu — ${key.length} karakter, "${key.slice(0, 4)}…" ile başlıyor`);

  if (!key.startsWith('AIza')) {
    uyari(
      'Google API anahtarları genelde "AIza" ile başlıyor. OAuth istemci ' +
        'gizli anahtarını (client secret) yapıştırmış olabilir misin? Onlar ' +
        'farklı şeyler ve bu uç OAuth İSTEMİYOR.',
    );
  }
  if (key.startsWith('"') || key.endsWith('"')) {
    uyari(
      'Anahtar tırnak içeriyor. dotenv çevreleyen tırnakları soyuyor ama ' +
        'içeride kalan bir tırnak anahtarı bozar.',
    );
  }

  // --- 2. Gerçek çağrı
  const videoId = process.argv[2] ?? VARSAYILAN_VIDEO;
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', key);

  console.log(`\n  Sınanan video: ${videoId}`);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    hata(`Ağ hatası: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  const govde = (await res.json().catch(() => null)) as {
    items?: Array<{ id?: string; snippet?: { title?: string; channelId?: string; channelTitle?: string } }>;
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  } | null;

  if (!res.ok) {
    hata(`HTTP ${res.status}`);
    /*
     * GOOGLE'IN KENDİ MESAJI OLDUĞU GİBİ GÖSTERİLİYOR. Kendi cümlemizle
     * özetlemek, bu projede defalarca teşhisi yanlış yere götürdü — 403'ün
     * üç ayrı sebebi var ve hangisi olduğunu yalnızca Google'ın metni
     * söylüyor.
     */
    if (govde?.error?.message) console.log(`\n  Google: ${govde.error.message}`);
    const reason = govde?.error?.errors?.[0]?.reason;
    if (reason) console.log(`  Sebep kodu: ${reason}`);

    console.log('\n  403 için üç olasılık ve üçü de aynı kodu döndürüyor:');
    console.log('    · YouTube Data API v3 ETKİNLEŞTİRİLMEMİŞ');
    console.log('    · IP kısıtı bu makineyi dışarıda bırakıyor');
    console.log('    · API kısıtı YouTube Data API v3\'ü kapsamıyor');
    console.log('\n  Adımlar: docs/DEPLOYMENT.md §5c\n');
    process.exit(1);
  }

  const video = govde?.items?.[0];
  if (!video) {
    /*
     * ANAHTAR ÇALIŞIYOR AMA VİDEO YOK. Bu ikisi ayrı sonuç: 200 dönmesi
     * anahtarın geçerli olduğunu kanıtlıyor.
     */
    uyari(`Anahtar ÇALIŞIYOR ama "${videoId}" bulunamadı (silinmiş ya da özel olabilir).`);
    console.log('\n  Anahtar açısından sorun yok.\n');
    return;
  }

  ok('API çağrısı başarılı');
  console.log(`\n  Başlık : ${video.snippet?.title ?? '—'}`);
  console.log(`  Kanal  : ${video.snippet?.channelTitle ?? '—'} (${video.snippet?.channelId ?? '—'})`);
  console.log(
    `\n${YESIL}Anahtar çalışıyor.${SIFIRLA} YouTube otomatik boost bildirimleri ` +
      'artık doğrulanabilir.\n',
  );
}

main().catch((err) => {
  hata(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
