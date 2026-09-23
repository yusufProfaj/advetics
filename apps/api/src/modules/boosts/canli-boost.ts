import { Prisma } from '@prisma/client';
import { CANLI_BOOST_DURUMLARI } from '@advetics/shared';

/**
 * ═══ "CANLI BOOST VAR MI" SORUSUNUN TEK SQL KARŞILIĞI ═══
 *
 * Bu liste BEŞ ayrı sorguda elle yazılıydı ve `boosts_active_post_uniq` kısmi
 * tekil indeksi altıncı kopyaydı. Listeye `paused` eklenirken altısının da
 * güncellenmesi gerekti; biri unutulsa duraklatılmış bir kampanya varken
 * ikinci bir boost açılabilir ve sürdürme anında aynı gönderiye iki kampanya
 * birden harcardı — hiçbir hata vermeden.
 *
 * ═══ NEDEN `Prisma.raw`, BAĞLI PARAMETRE DEĞİL ═══
 *
 * `IN (${liste})` yazmak diziyi tek bir parametreye çeviriyor ve Postgres onu
 * liste olarak görmüyor. `Prisma.join` doğru çalışırdı ama değerler DERLEME
 * ZAMANI SABİTİ ve paylaşılan listeden türüyor; enjeksiyon yüzeyi yok.
 * Yine de değerler doğrulanıyor: "her zaman sabit" varsayımı bakımdan sağ
 * çıkmıyor.
 */
const GECERLI = /^[a-z_]+$/;

export const CANLI_BOOST_SQL: Prisma.Sql = Prisma.raw(
  CANLI_BOOST_DURUMLARI.map((d) => {
    if (!GECERLI.test(d)) throw new Error(`Beklenmeyen boost durumu: ${d}`);
    return `'${d}'`;
  }).join(', '),
);
