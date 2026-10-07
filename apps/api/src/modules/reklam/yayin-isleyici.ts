import { Prisma } from '@prisma/client';
import type { YayinDurumu } from '@advetics/shared';
import type { CryptoService } from '../../crypto/crypto.service';
import { gorselOkuyucu, gorselOnbellegi, hesapErisimi, sayfaTokenOkuyucu } from './meta-erisim';
import { MetaGrafIstemcisi, type GrafAyarlari } from './meta-graf';
import type { ReklamIsi, YayinIsi } from './reklam-kuyrugu';
import { provaKos } from './prova-isleyici';
import { metaSurumuDogrula } from './meta-graf';
import { MetaKesinHata, YayinMotoru, yayiniSonlandir, type MetaYazmaPortu, type TxRunner } from './yayin-motoru';
import { metaYazmaAcikMi } from './yazma-kapisi';

/**
 * Worker'da bir yayın işini koşturur (TASARIM.md § 11.5 d, § 11.12).
 *
 * HESAP BAŞINA TEK YAZICI: Redis kilidi `<önek>:yazici:<hesap>`, sahip
 * kimliğiyle ve süreli. Meta'nın QPS ve bütçe değişikliği hakları hesap
 * başına işliyor; iki yayın aynı hesaba aynı anda yazarsa biri diğerinin
 * kotasını yer ve sıralama tahmin edilemez. Kilit doluysa iş ERTELENİR
 * (`ertele`), deneme sayılmaz.
 *
 * Süreli kilit bilinçli: sahibi ölen bir kilit sonsuza kadar kalsaydı o
 * hesaba bir daha yayın gitmezdi ve belirtisi "kuyrukta bekliyor" olurdu.
 */
export interface IsleyiciBagimliliklari {
  tx: TxRunner;
  crypto: Pick<CryptoService, 'decrypt'>;
  apiSurumu: string;
  yuklemeKoku: string;
  kilit: {
    al(anahtar: string, sahip: string, ms: number): Promise<boolean>;
    birak(anahtar: string, sahip: string): Promise<void>;
  };
  kilitOneki: string;
  /** Testte sahte Meta; üretimde Graph istemcisi kurulur. */
  portKur?: (a: GrafAyarlari) => MetaYazmaPortu;
}

export type IsSonucu = { tur: 'bitti'; durum: YayinDurumu | 'gecti' | 'reddedildi' | 'dogrulanamadi' } | { tur: 'ertele'; sebep: string };

export const YAZICI_KILIT_MS = 30 * 60_000;

export async function reklamIsiniIsle(d: IsleyiciBagimliliklari, is: ReklamIsi, sahip: string): Promise<IsSonucu> {
  return is.adim === 'prova' ? provaIsiniIsle(d, is.provaId, sahip) : yayinIsiniIsle(d, is, sahip);
}

/** Prova: hesap kilidi ve erişim yayınla aynı; erişim yoksa prova sebebiyle düşer. */
async function provaIsiniIsle(d: IsleyiciBagimliliklari, provaId: string, sahip: string): Promise<IsSonucu> {
  const [p] = await d.tx((t) =>
    t.$queryRaw<Array<{ client_id: string; org_id: string; ad_account_id: string }>>(Prisma.sql`
      SELECT client_id::text, org_id::text, ad_account_id::text FROM prova WHERE id = ${provaId}::uuid AND durum = 'bekliyor'`),
  );
  if (!p) return { tur: 'bitti', durum: 'dogrulanamadi' };
  const anahtar = `${d.kilitOneki}:yazici:${p.ad_account_id}`;
  if (!(await d.kilit.al(anahtar, sahip, YAZICI_KILIT_MS))) return { tur: 'ertele', sebep: 'Bu hesapta başka bir işlem sürüyor.' };
  try {
    let erisim;
    try {
      erisim = await hesapErisimi(d.tx, d.crypto, p.ad_account_id, p.client_id);
    } catch (e) {
      if (!(e instanceof MetaKesinHata)) throw e;
      await d.tx((t) =>
        t.$queryRaw(Prisma.sql`UPDATE prova SET durum = 'dogrulanamadi', sebep = ${e.message}, bitti_at = now() WHERE id = ${provaId}::uuid AND durum = 'bekliyor' RETURNING id`),
      );
      return { tur: 'bitti', durum: 'dogrulanamadi' };
    }
    const ayar: GrafAyarlari = {
      apiSurumu: d.apiSurumu,
      hesap: erisim.hesap,
      kullaniciToken: erisim.kullaniciToken,
      sayfaTokeni: sayfaTokenOkuyucu(d.tx, d.crypto, p.client_id),
      gorselOnbellek: gorselOnbellegi(d.tx, p.org_id, p.ad_account_id),
      gorselBaytlari: gorselOkuyucu(d.tx, d.yuklemeKoku, p.client_id),
    };
    const port = d.portKur ? d.portKur(ayar) : new MetaGrafIstemcisi(ayar);
    return provaKos(d.tx, provaId, port, erisim.hesap, () => metaYazmaAcikMi(d.tx, p.client_id), {
      apiSurumu: metaSurumuDogrula(d.apiSurumu),
      simdi: new Date(),
    });
  } finally {
    await d.kilit.birak(anahtar, sahip);
  }
}

export async function yayinIsiniIsle(d: IsleyiciBagimliliklari, is: YayinIsi, sahip: string): Promise<IsSonucu> {
  const [y] = await d.tx((t) =>
    t.$queryRaw<Array<{ client_id: string; org_id: string; ad_account_id: string | null; durum: YayinDurumu }>>(Prisma.sql`
      SELECT client_id::text, org_id::text, ad_account_id::text, durum FROM yayin WHERE id = ${is.yayinId}::uuid`),
  );
  if (!y) throw new Error(`Yayın bulunamadı: ${is.yayinId}`);
  if (!y.ad_account_id) {
    return { tur: 'bitti', durum: await yayiniSonlandir(d.tx, is.yayinId, 'on_kontrol_reddi', 'Reklam hesabı artık yok') };
  }

  const anahtar = `${d.kilitOneki}:yazici:${y.ad_account_id}`;
  if (!(await d.kilit.al(anahtar, sahip, YAZICI_KILIT_MS))) {
    return { tur: 'ertele', sebep: 'Bu hesapta başka bir işlem sürüyor; sıradasın.' };
  }
  try {
    let erisim;
    try {
      erisim = await hesapErisimi(d.tx, d.crypto, y.ad_account_id, y.client_id);
    } catch (e) {
      // Erişim yoksa Meta'ya hiçbir şey gitmedi: ön kontrolde kalan yayın
      // sebebiyle kapanır; ileri bir durumdaysa olduğu yerde kalır ve
      // sebep kaydedilir.
      if (e instanceof MetaKesinHata && y.durum === 'on_kontrol') {
        return { tur: 'bitti', durum: await yayiniSonlandir(d.tx, is.yayinId, 'on_kontrol_reddi', e.message) };
      }
      if (e instanceof MetaKesinHata) {
        await d.tx((t) => t.$queryRaw(Prisma.sql`UPDATE yayin SET sebep = ${e.message} WHERE id = ${is.yayinId}::uuid RETURNING id`));
        return { tur: 'bitti', durum: y.durum };
      }
      throw e;
    }
    const ayar: GrafAyarlari = {
      apiSurumu: d.apiSurumu,
      hesap: erisim.hesap,
      kullaniciToken: erisim.kullaniciToken,
      sayfaTokeni: sayfaTokenOkuyucu(d.tx, d.crypto, y.client_id),
      gorselOnbellek: gorselOnbellegi(d.tx, y.org_id, y.ad_account_id),
      gorselBaytlari: gorselOkuyucu(d.tx, d.yuklemeKoku, y.client_id),
    };
    const port = d.portKur ? d.portKur(ayar) : new MetaGrafIstemcisi(ayar);
    const motor = new YayinMotoru(d.tx, port, erisim.hesap, () => metaYazmaAcikMi(d.tx, y.client_id));
    const durum =
      is.adim === 'kur'
        ? await motor.kur(is.yayinId)
        : is.adim === 'devam'
          ? await motor.devam(is.yayinId)
          : is.adim === 'geri_al'
            ? await motor.geriAl(is.yayinId)
            : await motor.geriOku(is.yayinId);
    return { tur: 'bitti', durum };
  } finally {
    await d.kilit.birak(anahtar, sahip);
  }
}

/**
 * Redis kilidi: SET NX PX ile al, yalnız SAHİBİ bırakır (Lua ile karşılaştır
 * ve sil). Başkasının kilidini silmek, iki yazıcının aynı hesaba yazmasına
 * yol açardı.
 */
export function redisKilidi(redis: {
  set(k: string, v: string, px: 'PX', ms: number, nx: 'NX'): Promise<string | null>;
  eval(script: string, n: number, ...args: string[]): Promise<unknown>;
}): IsleyiciBagimliliklari['kilit'] {
  return {
    async al(anahtar, sahip, ms) {
      return (await redis.set(anahtar, sahip, 'PX', ms, 'NX')) === 'OK';
    },
    async birak(anahtar, sahip) {
      await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, anahtar, sahip);
    },
  };
}
