import { createHmac, timingSafeEqual } from 'node:crypto';
import { MCP_YUKLEME_SURESI_DK, type AssetKind } from '@advetics/shared';

/**
 * ═══ MCP YÜKLEME JETONU — SAF ═══
 *
 * Claude Code bir görseli MCP argümanında base64 olarak gönderemez (yüz
 * binlerce karakteri modelin üretmesi gerekir). Bunun yerine `yukleme_adresi`
 * aracı bu jetonu verir, dosya kabuktan `curl` ile yüklenir
 * (`docs/okuma-api/MCP-YAZMA-MIMARI.md` § 4).
 *
 * TABLO YOK, İMZA VAR: jeton HMAC-SHA256 ile imzalı ve süreli. 15 dakika
 * içinde aynı workspace'e birden çok dosya yüklenebilir ("bu beş görseli
 * yükle"). Jeton TEK BAŞINA YETMEZ: uç her yüklemede anahtarı yeniden
 * doğruluyor, yani iptal edilen anahtarın jetonu da o an ölüyor.
 *
 * ALAN AYRIMI: imza anahtarı JWT gizlisinden `mcp-yukleme:` önekiyle
 * türetiliyor. Aynı gizliyle düz HMAC, bir erişim jetonunun imzasıyla aynı
 * alanda olurdu; önek iki imzanın birbirinin yerine geçmesini imkânsız kılar.
 */

export interface YuklemeJetonu {
  /** Kullanıcı */
  u: string;
  /** Anahtar */
  k: string;
  /** Workspace */
  w: string;
  /** Bitiş, epoch ms */
  e: number;
}

export class YuklemeJetonuHatasi extends Error {}

function imzaAnahtari(gizli: string): Buffer {
  return createHmac('sha256', gizli).update('mcp-yukleme:v1').digest();
}

function imzala(govde: string, gizli: string): string {
  return createHmac('sha256', imzaAnahtari(gizli)).update(govde).digest('base64url');
}

export function jetonUret(
  g: { userId: string; anahtarId: string; workspaceId: string },
  gizli: string,
  simdi: number = Date.now(),
): { jeton: string; bitis: Date } {
  const bitis = simdi + MCP_YUKLEME_SURESI_DK * 60_000;
  const yuk: YuklemeJetonu = { u: g.userId, k: g.anahtarId, w: g.workspaceId, e: bitis };
  const govde = Buffer.from(JSON.stringify(yuk), 'utf8').toString('base64url');
  return { jeton: `${govde}.${imzala(govde, gizli)}`, bitis: new Date(bitis) };
}

/**
 * Jetonu çöz. AYRI CÜMLELER: "süresi dolmuş" ile "bozuk" farklı iş (yeni
 * adres iste / komutu yeniden kopyala). İmza SÜREDEN ÖNCE: imzası tutmayan
 * bir jetonun içindeki tarihe bakmak, saldırganın yazdığı veriye güvenmek.
 */
export function jetonCoz(jeton: string, gizli: string, simdi: number = Date.now()): YuklemeJetonu {
  const parca = jeton.trim().split('.');
  if (parca.length !== 2 || !parca[0] || !parca[1]) throw new YuklemeJetonuHatasi('Yükleme jetonu bozuk (eksik kopyalanmış olabilir).');
  const [govde, imza] = parca as [string, string];
  const beklenen = Buffer.from(imzala(govde, gizli));
  const gelen = Buffer.from(imza);
  if (beklenen.length !== gelen.length || !timingSafeEqual(beklenen, gelen)) {
    throw new YuklemeJetonuHatasi('Yükleme jetonu doğrulanamadı (bozuk ya da başka bir sunucunun).');
  }
  let yuk: unknown;
  try {
    yuk = JSON.parse(Buffer.from(govde, 'base64url').toString('utf8'));
  } catch {
    throw new YuklemeJetonuHatasi('Yükleme jetonu okunamadı.');
  }
  const y = yuk as Partial<YuklemeJetonu>;
  if (typeof y.u !== 'string' || typeof y.k !== 'string' || typeof y.w !== 'string' || typeof y.e !== 'number') {
    throw new YuklemeJetonuHatasi('Yükleme jetonu okunamadı.');
  }
  if (y.e <= simdi) throw new YuklemeJetonuHatasi('Yükleme jetonunun süresi dolmuş; yukleme_adresi ile yenisini al.');
  return y as YuklemeJetonu;
}

/**
 * Dosyanın türü BAYTLARDAN. `curl -F` içerik türünü uzantıdan tahmin ediyor
 * ya da hiç göndermiyor (`application/octet-stream`); ona güvenmek, JPEG'i
 * "desteklenmeyen biçim" diye reddetmek ya da adı `.jpg` olan bir PDF'i
 * görsel diye kabul etmek olurdu. Boyut ve süre denetimi Varlıklar'ın
 * kendi yolunda (`AssetsService.upload`), burada YALNIZ tür.
 */
export function dosyaTuru(b: Buffer): { kind: AssetKind; mime: string } | { hata: string } {
  if (b.length >= 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) {
    return { kind: 'image', mime: 'image/png' };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: 'image', mime: 'image/jpeg' };
  if (b.length >= 12 && b.toString('latin1', 4, 8) === 'ftyp') {
    return { kind: 'video', mime: b.toString('latin1', 8, 12) === 'qt  ' ? 'video/quicktime' : 'video/mp4' };
  }
  return { hata: 'Yalnız JPEG, PNG (görsel) ve MP4, MOV (video) yüklenebilir.' };
}
