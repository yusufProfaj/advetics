import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { Prisma } from '@prisma/client';
import type { TxRunner } from './yayin-motoru';

/**
 * Reklam modülünün görsel yüklemesi (sürükle-bırak). Doğrulama GİRİŞ
 * ANINDA: kullanıcı kullanılamayacak görseli bıraktığında öğrenmeli,
 * yayınladığında değil (CLAUDE.md).
 *
 * Biçim BAYTLARDAN okunuyor (uzantı ve content-type yalan söyleyebilir);
 * Meta yalnız JPEG ve PNG kabul ediyor. Boyutlar dosyanın kendi başlığından.
 * Aynı dosya aynı workspace'e ikinci kez yüklenirse yeni satır açılmıyor,
 * var olan dönüyor ve bu SÖYLENİYOR.
 */
export const GORSEL_EN_COK_BAYT = 30 * 1024 * 1024;
/** Meta'nın akış görselleri için alt sınır; daha küçüğü bulanık görünür. */
export const GORSEL_EN_AZ_KENAR = 600;

export type GorselBilgisi =
  | { tur: 'tamam'; mime: 'image/jpeg' | 'image/png'; en: number; boy: number }
  | { tur: 'hata'; mesaj: string };

export function gorselBilgisi(b: Buffer): GorselBilgisi {
  if (b.length > GORSEL_EN_COK_BAYT) return { tur: 'hata', mesaj: 'Görsel 30 MB’tan büyük.' };
  // PNG: 89 50 4E 47 0D 0A 1A 0A, IHDR genişlik 16, yükseklik 20 (big-endian).
  if (b.length >= 24 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a) {
    return kenarDenetle('image/png', b.readUInt32BE(16), b.readUInt32BE(20));
  }
  // JPEG: FF D8; SOF0..SOF15 (C4, C8, CC hariç) içinde yükseklik ve genişlik.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return { tur: 'hata', mesaj: 'JPEG dosyası bozuk görünüyor.' };
      const isaret = b[i + 1]!;
      if (isaret === 0xd8 || (isaret >= 0xd0 && isaret <= 0xd7) || isaret === 0x01) {
        i += 2;
        continue;
      }
      const uzunluk = b.readUInt16BE(i + 2);
      if (isaret >= 0xc0 && isaret <= 0xcf && isaret !== 0xc4 && isaret !== 0xc8 && isaret !== 0xcc) {
        return kenarDenetle('image/jpeg', b.readUInt16BE(i + 7), b.readUInt16BE(i + 5));
      }
      i += 2 + uzunluk;
    }
    return { tur: 'hata', mesaj: 'JPEG boyutları okunamadı.' };
  }
  return { tur: 'hata', mesaj: 'Yalnız JPEG ve PNG görseller kullanılabilir (Meta’nın kabul ettiği biçimler).' };
}

function kenarDenetle(mime: 'image/jpeg' | 'image/png', en: number, boy: number): GorselBilgisi {
  if (!en || !boy) return { tur: 'hata', mesaj: 'Görselin boyutları okunamadı.' };
  if (Math.min(en, boy) < GORSEL_EN_AZ_KENAR) {
    return { tur: 'hata', mesaj: `Görsel çok küçük (${en}×${boy}); kısa kenar en az ${GORSEL_EN_AZ_KENAR} piksel olmalı.` };
  }
  return { tur: 'tamam', mime, en, boy };
}

export interface YuklenenGorsel {
  id: string;
  ad: string;
  onizlemeAdresi: string;
  genislik: number;
  yukseklik: number;
  zatenVardi: boolean;
}

export async function gorselKaydet(
  tx: TxRunner,
  g: { orgId: string; clientId: string; kullaniciId: string; ad: string; bayt: Buffer; yuklemeKoku: string },
): Promise<YuklenenGorsel> {
  const bilgi = gorselBilgisi(g.bayt);
  if (bilgi.tur === 'hata') throw new Error(bilgi.mesaj);
  const ozet = createHash('sha256').update(g.bayt).digest('hex');
  const ad = g.ad.normalize('NFC').trim().slice(0, 200) || 'görsel';
  const [var_] = await tx((t) =>
    t.$queryRaw<Array<{ id: string; name: string; width: number; height: number }>>(Prisma.sql`
      SELECT id::text, name, width, height FROM assets WHERE client_id = ${g.clientId}::uuid AND content_hash = ${ozet}`),
  );
  if (var_) {
    return { id: var_.id, ad: var_.name, onizlemeAdresi: `/assets/${var_.id}/preview`, genislik: var_.width, yukseklik: var_.height, zatenVardi: true };
  }
  const kok = isAbsolute(g.yuklemeKoku) ? g.yuklemeKoku : resolve(process.cwd(), g.yuklemeKoku);
  const anahtar = `${g.orgId}/reklam/${randomUUID()}.${bilgi.mime === 'image/png' ? 'png' : 'jpg'}`;
  const yol = resolve(kok, anahtar);
  if (!yol.startsWith(kok.endsWith(sep) ? kok : kok + sep)) throw new Error('Geçersiz depolama yolu');
  await mkdir(dirname(yol), { recursive: true });
  await writeFile(yol, g.bayt);
  const [r] = await tx((t) =>
    t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height,
                          storage_key, content_hash, created_by, updated_at)
      VALUES (gen_random_uuid(), ${g.orgId}::uuid, ${g.clientId}::uuid, 'image', ${ad}, ${ad}, ${bilgi.mime},
              ${g.bayt.length}, ${bilgi.en}, ${bilgi.boy}, ${anahtar}, ${ozet}, ${g.kullaniciId}::uuid, now())
      RETURNING id::text`),
  );
  return { id: r!.id, ad, onizlemeAdresi: `/assets/${r!.id}/preview`, genislik: bilgi.en, yukseklik: bilgi.boy, zatenVardi: false };
}
