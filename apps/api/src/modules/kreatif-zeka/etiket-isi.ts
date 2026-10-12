import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  ETIKET_SINIRI,
  GORU_AYARI,
  GORU_MIME,
  bekciKarari,
  enBoyAnla,
  etiketCoz,
  etiketIsSonucu,
  goruJsonSemasi,
  gorselAdresleri,
  icerikGecisi,
  karsilastirmaKumesi,
  type BekciRetNedeni,
  type EtiketIsSayimi,
  type EtiketIsSonucu,
  type EtiketlenemezNedeni,
  type GeciciNeden,
  type GoruBicimi,
  type GoruEtiketleri,
  type IcerikDurumu,
  type IcerikHali,
  type IcerikOlayi,
  type Platform,
} from '@advetics/shared';
import { YapayZekaHatasi, metinIsteOlcumlu, type MetinUretici } from '../../yapay-zeka/gemini';
import type { Adres } from '../reports/kreatif-adresi.service';
import type { IndirmeHataKodu } from '../reports/kreatif-gorseli';
import { gorselBoyutu } from './gorsel-boyutu';
import { GORU_SISTEM_ISTEMI, goruIstemi } from './istemler';
import { GUNCEL_SEMA, kreatifKaynagi } from './kaynak';
import { pencereKreatifleri } from './pencere';
import { etiketAyir, istanbulGunu, sayacDurumu, sayacSonuc, type TxLike } from './sayac';

/**
 * ═══ KREATİF ETİKETLEME İŞİ — `creative_tags`, HESAP BAŞINA (MIMARI § 4) ═══
 *
 * SIRA MALİYETE GÖRE: önce SIFIR maliyetli adımlar (seçim, kaynak anahtarı
 * eşleşmesi, bekçi), sonra platform (kota → adres), sonra indirme, sonra
 * özet eşleşmesi, en son PARA (ayırma → Gemini). Her adım bir sonrakinin
 * işini azaltıyor; sıra tersine dönerse sınır doluyken para harcanır ya da
 * aynı görsel ikinci kez Gemini'ye gider. İki ters dönüş de mutasyonla
 * sınanıyor (`etiket-isi.spec.ts`).
 *
 * PLATFORM ÇAĞRISI TRANSACTION DIŞINDA: `tx` worker'ın BYPASSRLS istemcisi
 * (transaction değil), her deyim kendi başına; tazeleme ve indirme
 * arasında açık bir transaction yok (CLAUDE.md "platform çağrısı
 * transaction'ın İÇİNDE olamaz").
 *
 * SESSİZ `succeeded + 0` YOK: sonuç `etiketIsSonucu`ndan ve 0 satırda not
 * nedenini söylüyor; hepsi geçici hatayla düştüyse `tekrar_dene`.
 */

export interface HesapKaydi {
  id: string;
  clientId: string;
  orgId: string;
  platform: Platform;
  externalId: string;
  connectionId: string;
  managerExternalId: string | null;
  paraBirimi: string;
}

export type IndirmeSonucu = { ok: true; bytes: Uint8Array; tur: GoruBicimi } | { ok: false; sebep: string; kod: IndirmeHataKodu };

export interface EtiketIsiBagimliliklari {
  tx: TxLike;
  /** `null` = Gemini anahtarı yok: hiçbir şey indirilmiyor, not söylüyor. */
  gemini: MetinUretici | null;
  /** Meta görsel adresi; ORTAK tazeleme çekirdeği (`KreatifAdresiService.hesapAdresleri`). */
  adresTazele(hesap: HesapKaydi, externalIdler: string[]): Promise<{ adresler: Map<string, Adres>; kotaEngeli: string | null } | null>;
  indir(url: string): Promise<IndirmeSonucu>;
  simdi?: () => Date;
}

export type EtiketIsiCiktisi = EtiketIsSonucu & { sayim: EtiketIsSayimi };

interface Bekleyen {
  creativeId: string;
  externalId: string;
  platform: Platform;
  kaynakAnahtari: string | null;
  deneme: number;
  assetUrls: unknown;
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** Tek yazım yolu: geçiş `icerikGecisi`nden (sayaç ve sınır orada). */
async function durumYaz(
  tx: TxLike,
  b: { creativeId: string; deneme: number },
  olay: IcerikOlayi,
  ek: { icerikOzeti?: string; enBoy?: string | null; sonHata?: string | null } = {},
): Promise<IcerikHali> {
  const yeni = icerikGecisi({ durum: 'bekliyor', deneme: b.deneme, neden: null }, olay);
  await tx.$executeRaw(Prisma.sql`
    UPDATE kreatif_icerikleri
       SET durum = ${yeni.durum}, neden = ${yeni.neden}, deneme = ${yeni.deneme}::int,
           son_hata = ${ek.sonHata ?? null},
           icerik_ozeti = coalesce(${ek.icerikOzeti ?? null}, icerik_ozeti),
           en_boy = coalesce(${ek.enBoy ?? null}, en_boy),
           son_deneme = now(), updated_at = now()
     WHERE creative_id = ${b.creativeId}::uuid`);
  return yeni;
}

export async function kreatifEtiketIsi(d: EtiketIsiBagimliliklari, adAccountId: string): Promise<EtiketIsiCiktisi> {
  const tx = d.tx;
  const simdi = d.simdi?.() ?? new Date();
  const gun = istanbulGunu(simdi);
  const sayim: EtiketIsSayimi = { secilen: 0, etiketlendi: 0, baglandi: 0, kalici: 0, gecici: 0, ertelendi: 0, bekciNedeni: null };
  const bitir = (ek?: string): EtiketIsiCiktisi => {
    const r = etiketIsSonucu(sayim);
    return { ...r, not: ek ? `${r.not}; ${ek}` : r.not, sayim };
  };

  // ── 1. Hesap (sıfır maliyet) ──
  const [h] = await tx.$queryRaw<Array<{ id: string; client_id: string; org_id: string; platform: Platform; external_id: string; connection_id: string; manager_external_id: string | null; para: string }>>(Prisma.sql`
    SELECT a.id::text, a.client_id::text, c.org_id::text, a.platform::text AS platform, a.external_id,
           a.connection_id::text, a.manager_external_id, c.reporting_currency AS para
      FROM ad_accounts a JOIN clients c ON c.id = a.client_id
     WHERE a.id = ${adAccountId}::uuid`);
  if (!h) return { sonuc: 'basarili', satir: 0, not: 'hesap bir workspace’e atanmamış, etiketlenecek kreatif yok', sayim };
  const hesap: HesapKaydi = {
    id: h.id,
    clientId: h.client_id,
    orgId: h.org_id,
    platform: h.platform,
    externalId: h.external_id,
    connectionId: h.connection_id,
    managerExternalId: h.manager_external_id,
    paraBirimi: h.para,
  };

  // ── 2. Seçim (sıfır maliyet): pencerede harcaması olan kreatifler ──
  const pencere = await pencereKreatifleri(tx, { clientId: hesap.clientId, paraBirimi: hesap.paraBirimi, bugun: gun, adAccountId: hesap.id });
  if (pencere.length === 0) return bitir();
  const ids = pencere.map((p) => p.creativeId);
  const mevcut = new Map(
    (
      await tx.$queryRaw<Array<{ creative_id: string; durum: IcerikDurumu; deneme: number; kaynak_anahtari: string | null }>>(Prisma.sql`
        SELECT creative_id::text, durum, deneme::int, kaynak_anahtari FROM kreatif_icerikleri WHERE creative_id = ANY(${ids}::uuid[])`)
    ).map((r) => [r.creative_id, r]),
  );

  const yeniIdler = ids.filter((id) => !mevcut.has(id));
  const kreatifler = new Map(
    (
      await tx.$queryRaw<Array<{ id: string; external_id: string; creative_type: string | null; raw: unknown; asset_urls: unknown; platform: Platform }>>(Prisma.sql`
        SELECT id::text, external_id, creative_type, platform::text AS platform, asset_urls,
               CASE WHEN id = ANY(${yeniIdler}::uuid[]) THEN raw END AS raw
          FROM creatives WHERE id = ANY(${ids}::uuid[])`)
    ).map((r) => [r.id, r]),
  );

  let kumesiz = 0;
  for (const p of pencere) {
    if (mevcut.has(p.creativeId)) continue;
    const k = kreatifler.get(p.creativeId);
    if (!k) continue;
    const kaynak = kreatifKaynagi({
      creativeId: k.id,
      platform: k.platform,
      creativeType: k.creative_type,
      raw: k.raw,
      assetUrls: k.asset_urls,
      kanal: p.objective,
      hesapExternalId: hesap.externalId,
    });
    /*
     * KÜMESİZ KREATİF AÇILMIYOR: tanınmayan amaçtaki bir görseli etiketlemek
     * para harcar ama hiçbir karşılaştırmaya girmez (MIMARI § 4 adım 2).
     * Kalıcı kapsam dışılar (metin, LinkedIn, görselsiz) ise açılıyor ve
     * SAYILIYOR: ekranın "neden incelenemiyor" dökümü onları gösteriyor.
     */
    if (kaynak.tur === 'gorsel' && !karsilastirmaKumesi(p.platform, p.objective)) {
      kumesiz++;
      continue;
    }
    const hal = kaynak.tur === 'kalici' ? icerikGecisi({ durum: 'bekliyor', deneme: 0, neden: null }, { tur: 'kalici', neden: kaynak.neden }) : null;
    const n = await tx.$executeRaw(Prisma.sql`
      INSERT INTO kreatif_icerikleri (creative_id, org_id, client_id, ad_account_id, platform, kaynak_anahtari, kismi, bicim,
                                      durum, neden, deneme, sema_surumu)
      VALUES (${k.id}::uuid, ${hesap.orgId}::uuid, ${hesap.clientId}::uuid, ${hesap.id}::uuid, ${k.platform}::"Platform",
              ${kaynak.tur === 'gorsel' ? kaynak.kaynakAnahtari : null}, ${kaynak.tur === 'gorsel' ? kaynak.kismi : null},
              ${kaynak.bicim}, ${hal?.durum ?? 'bekliyor'}, ${hal?.neden ?? null}, ${hal?.deneme ?? 0}::int, ${GUNCEL_SEMA}::int)
      ON CONFLICT (creative_id) DO NOTHING`);
    if (n > 0 && hal) {
      sayim.secilen++;
      sayim.kalici++;
    }
    if (n > 0 && !hal) mevcut.set(k.id, { creative_id: k.id, durum: 'bekliyor', deneme: 0, kaynak_anahtari: kaynak.tur === 'gorsel' ? kaynak.kaynakAnahtari : null });
  }

  // Bekleyenler HARCAMAYA GÖRE AZALAN (pencere öyle sıralı): sınır dolarsa en önemlileri bitmiş olur.
  const bekleyenler: Bekleyen[] = [];
  for (const p of pencere) {
    const m = mevcut.get(p.creativeId);
    const k = kreatifler.get(p.creativeId);
    if (!m || !k || m.durum !== 'bekliyor') continue;
    bekleyenler.push({ creativeId: p.creativeId, externalId: k.external_id, platform: k.platform, kaynakAnahtari: m.kaynak_anahtari, deneme: m.deneme, assetUrls: k.asset_urls });
  }
  sayim.secilen += bekleyenler.length;
  const kumesizNotu = kumesiz > 0 ? `${kumesiz} kreatif tanınmayan amaçta (karşılaştırma kümesi yok), açılmadı` : undefined;
  if (bekleyenler.length === 0) return bitir(kumesizNotu);

  if (!d.gemini) {
    // Anahtar yok: indirme ve tazeleme de YOK (boşa kota). Satırlar
    // `bekliyor`da kalıyor; anahtar tanımlanınca ilk iş onları alıyor.
    const r = etiketIsSonucu(sayim);
    return { sonuc: 'basarili', satir: sayim.kalici, not: `${r.not}; yapay zekâ anahtarı tanımlı değil, ${bekleyenler.length} kreatif bekliyor`, sayim };
  }

  // ── 3. Kaynak anahtarı eşleşmesi (sıfır maliyet) ──
  const etiketliKaynak = new Map<string, { ozet: string; enBoy: string | null }>();
  const anahtarlar = [...new Set(bekleyenler.map((b) => b.kaynakAnahtari).filter((x): x is string => !!x && !x.startsWith('kreatif:')))];
  if (anahtarlar.length > 0) {
    const r = await tx.$queryRaw<Array<{ kaynak_anahtari: string; icerik_ozeti: string; en_boy: string | null }>>(Prisma.sql`
      SELECT DISTINCT ON (k.kaynak_anahtari) k.kaynak_anahtari, k.icerik_ozeti, k.en_boy
        FROM kreatif_icerikleri k
        JOIN kreatif_etiketleri e ON e.client_id = k.client_id AND e.icerik_ozeti = k.icerik_ozeti AND e.sema_surumu = ${GUNCEL_SEMA}::int
       WHERE k.client_id = ${hesap.clientId}::uuid AND k.durum = 'etiketlendi' AND k.kaynak_anahtari = ANY(${anahtarlar}::text[])
       ORDER BY k.kaynak_anahtari, k.updated_at DESC`);
    for (const x of r) etiketliKaynak.set(x.kaynak_anahtari, { ozet: x.icerik_ozeti, enBoy: x.en_boy });
  }
  const kalan: Bekleyen[] = [];
  for (const b of bekleyenler) {
    const es = b.kaynakAnahtari ? etiketliKaynak.get(b.kaynakAnahtari) : undefined;
    if (!es) {
      kalan.push(b);
      continue;
    }
    await durumYaz(tx, b, { tur: 'etiketlendi' }, { icerikOzeti: es.ozet, enBoy: es.enBoy });
    sayim.baglandi++;
  }
  if (kalan.length === 0) return bitir(kumesizNotu);

  // ── 4. Bekçi (sıfır maliyet): platforma çıkmadan ÖNCE ──
  const durum = await sayacDurumu(tx, hesap.clientId, gun);
  const karar = bekciKarari(durum);
  if (!karar.izin) {
    sayim.ertelendi = kalan.length;
    sayim.bekciNedeni = karar.neden;
    return bitir(kumesizNotu);
  }
  /*
   * BU KOŞUDA EN ÇOK KALAN HAK KADAR KREATİF: hepsinin adresini tazelemek,
   * sınır yüzünden zaten etiketlenmeyecek yüz kreatif için platform kotası
   * harcamak olurdu. Özet eşleşmesiyle bağlanacak olanlar hak yemiyor ama
   * önceden bilinmiyor; kalanlar bir sonraki koşuda.
   */
  const { hak, neden: hakNedeni } = kalanHak(durum);
  const bunKosu = kalan.slice(0, Math.max(0, hak));
  const sonraya = kalan.slice(bunKosu.length);
  if (sonraya.length > 0) {
    sayim.ertelendi += sonraya.length;
    // NEDEN HAKKI GERÇEKTEN KISAN SINIRDAN (Ajan 4, Ö-3): workspace bugün 1
    // kullanmışken "bugünkü sınır doldu (40)" demek kullanıcıyı yanlış
    // sınırı beklemeye gönderirdi.
    sayim.bekciNedeni = hakNedeni;
  }

  // ── 5. Platform kotası + adres tazeleme (Meta). Google adresleri kalıcı. ──
  const adresler = new Map<string, Adres>();
  let kotaEngeli: string | null = null;
  const metaIdler = bunKosu.filter((b) => b.platform === 'meta').map((b) => b.externalId);
  if (metaIdler.length > 0) {
    const r = await d.adresTazele(hesap, metaIdler);
    if (r) {
      kotaEngeli = r.kotaEngeli;
      for (const [id, a] of r.adresler) adresler.set(id, a);
    }
  }

  let girdiToken = 0;
  let ciktiToken = 0;
  let basarili = 0;
  let hata = 0;
  let geminiKotasi: string | null = null;
  let bekciDurdu: BekciRetNedeni | null = null;

  for (let i = 0; i < bunKosu.length; i++) {
    const b = bunKosu[i]!;
    if (geminiKotasi || bekciDurdu) {
      // Gemini kotası doldu ya da bekçi reddetti: kalanlara DOKUNULMUYOR
      // (deneme sayacı artmasın), sayımda ayrı.
      if (bekciDurdu) sayim.ertelendi++;
      else sayim.gecici++;
      continue;
    }
    // AYNI KOŞUDA etiketlenmiş bir kaynak anahtarı: aynı görselin ikinci
    // reklamı ne tazelenir ne indirilir.
    const ayniKosu = b.kaynakAnahtari ? etiketliKaynak.get(b.kaynakAnahtari) : undefined;
    if (ayniKosu) {
      await durumYaz(tx, b, { tur: 'etiketlendi' }, { icerikOzeti: ayniKosu.ozet, enBoy: ayniKosu.enBoy });
      sayim.baglandi++;
      continue;
    }

    // Adres
    let url: string | null = null;
    if (b.platform === 'meta') {
      if (kotaEngeli) {
        await durumYaz(tx, b, { tur: 'gecici', neden: 'platform_kotasi' }, { sonHata: kotaEngeli });
        sayim.gecici++;
        continue;
      }
      const a = adresler.get(b.externalId);
      if (!a || 'hata' in a) {
        await durumYaz(tx, b, { tur: 'gecici', neden: 'adres_alinamadi' }, { sonHata: a && 'hata' in a ? a.hata : 'platform adres döndürmedi' });
        sayim.gecici++;
        continue;
      }
      url = a.url;
    } else {
      url = gorselAdresleri(b.assetUrls)[0] ?? null;
      if (!url) {
        await durumYaz(tx, b, { tur: 'kalici', neden: 'gorsel_yok' });
        sayim.kalici++;
        continue;
      }
    }

    // ── 6. İndirme ──
    const ind = await d.indir(url);
    if (!ind.ok) {
      const kalici: EtiketlenemezNedeni | null = ind.kod === 'boyut' ? 'boyut' : ind.kod === 'bicim' ? 'bicim' : null;
      if (kalici) {
        await durumYaz(tx, b, { tur: 'kalici', neden: kalici }, { sonHata: ind.sebep });
        sayim.kalici++;
      } else {
        await durumYaz(tx, b, { tur: 'gecici', neden: 'indirme_dustu' }, { sonHata: ind.sebep });
        sayim.gecici++;
      }
      continue;
    }
    const ozet = sha256(ind.bytes);
    const boyut = gorselBoyutu(ind.bytes, ind.tur);
    const enBoy = boyut ? enBoyAnla(boyut.genislik, boyut.yukseklik) : null;

    // ── 7. Özet eşleşmesi: aynı görsel İKİNCİ KEZ Gemini'ye gitmez ──
    const [var_] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT 1 AS n FROM kreatif_etiketleri
       WHERE client_id = ${hesap.clientId}::uuid AND icerik_ozeti = ${ozet} AND sema_surumu = ${GUNCEL_SEMA}::int`);
    if (var_) {
      await durumYaz(tx, b, { tur: 'etiketlendi' }, { icerikOzeti: ozet, enBoy });
      if (b.kaynakAnahtari) etiketliKaynak.set(b.kaynakAnahtari, { ozet, enBoy });
      sayim.baglandi++;
      continue;
    }

    // ── 8. Ayırma (atomik), SONRA Gemini ──
    if (!(await etiketAyir(tx, { orgId: hesap.orgId, clientId: hesap.clientId, gun }))) {
      // Ayırma reddetti ama okuma "izin" diyorsa (yarışın arası) en dar sınır söylenir, sabit bir ad değil.
      const d2 = await sayacDurumu(tx, hesap.clientId, gun);
      const k = bekciKarari(d2);
      bekciDurdu = k.izin ? kalanHak(d2).neden : k.neden;
      sayim.bekciNedeni = bekciDurdu;
      sayim.ertelendi++;
      continue;
    }

    const sonuc = await goruCagrisi(d.gemini, ind.bytes, ind.tur);
    girdiToken += sonuc.girdiToken;
    ciktiToken += sonuc.ciktiToken;
    if (sonuc.tur === 'etiket') {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO kreatif_etiketleri (org_id, client_id, icerik_ozeti, sema_surumu, etiketler, model, girdi_token, cikti_token, sure_ms)
        VALUES (${hesap.orgId}::uuid, ${hesap.clientId}::uuid, ${ozet}, ${GUNCEL_SEMA}::int, ${JSON.stringify(sonuc.etiketler)}::jsonb,
                ${d.gemini.model.slice(0, 60)}, ${sonuc.girdiToken}::int, ${sonuc.ciktiToken}::int, ${sonuc.sureMs}::int)
        ON CONFLICT (client_id, icerik_ozeti, sema_surumu) DO NOTHING`);
      await durumYaz(tx, b, { tur: 'etiketlendi' }, { icerikOzeti: ozet, enBoy });
      if (b.kaynakAnahtari) etiketliKaynak.set(b.kaynakAnahtari, { ozet, enBoy });
      sayim.etiketlendi++;
      basarili++;
      continue;
    }
    hata++;
    if (sonuc.tur === 'kalici') {
      await durumYaz(tx, b, { tur: 'kalici', neden: sonuc.neden }, { sonHata: sonuc.mesaj });
      sayim.kalici++;
    } else {
      await durumYaz(tx, b, { tur: 'gecici', neden: sonuc.neden }, { sonHata: sonuc.mesaj });
      sayim.gecici++;
      if (sonuc.neden === 'gemini_kota') geminiKotasi = sonuc.mesaj;
    }
  }

  if (basarili + hata > 0 || girdiToken + ciktiToken > 0) {
    await sayacSonuc(tx, { orgId: hesap.orgId, clientId: hesap.clientId, gun, basarili, hata, girdiToken, ciktiToken });
  }
  const notlar = [kumesizNotu, geminiKotasi ? `Gemini kotası: ${geminiKotasi}` : undefined].filter(Boolean).join('; ');
  return bitir(notlar || undefined);
}

/**
 * Bu koşunun hakkı ve onu KISAN sınır. Üç sınırın en darı kazanır; eşitlikte
 * sıra `bekciKarari` ile aynı (ürün geneli, aylık, günlük): küresel sınır
 * doluyken workspace'e "senin payın doldu" demek yanlış cümle olurdu.
 */
export function kalanHak(d: { workspaceBugun: number; workspaceBuAy: number; kureselBugun: number }): { hak: number; neden: BekciRetNedeni } {
  const adaylar: Array<{ hak: number; neden: BekciRetNedeni }> = [
    { hak: ETIKET_SINIRI.kureselGunluk - d.kureselBugun, neden: 'kuresel_gunluk' },
    { hak: ETIKET_SINIRI.workspaceAylik - d.workspaceBuAy, neden: 'workspace_aylik' },
    { hak: ETIKET_SINIRI.workspaceGunluk - d.workspaceBugun, neden: 'workspace_gunluk' },
  ];
  return adaylar.reduce((en, x) => (x.hak < en.hak ? x : en));
}

type GoruSonucu = { girdiToken: number; ciktiToken: number; sureMs: number } & (
  | { tur: 'etiket'; etiketler: GoruEtiketleri }
  | { tur: 'kalici'; neden: EtiketlenemezNedeni; mesaj: string }
  | { tur: 'gecici'; neden: GeciciNeden; mesaj: string }
);

/**
 * Tek görü çağrısı; şema dışı cevapta BİR KEZ tekrar (aynı ayırma içinde:
 * sınır "etiketlenen kreatif" sayıyor, çağrı değil). Token iki denemede
 * toplanıyor, yani maliyet ölçümü tekrarı da görüyor.
 *
 * Hata sınıfları MIMARI § 4 adım 8: ret kalıcı; kesilme/boş geçici; 429
 * `gemini_kota` (kalan kreatiflere bu koşuda dokunulmuyor); diğer HTTP ve
 * ağ `gemini_ulasilamadi`. Gemini'nin cümlesi `son_hata`ya aynen.
 */
export async function goruCagrisi(gemini: MetinUretici, bytes: Uint8Array, tur: GoruBicimi): Promise<GoruSonucu> {
  let girdiToken = 0;
  let ciktiToken = 0;
  let sureMs = 0;
  let sonSebep = '';
  for (let deneme = 0; deneme < 2; deneme++) {
    let r;
    try {
      r = await metinIsteOlcumlu(gemini, {
        sistem: GORU_SISTEM_ISTEMI,
        metin: goruIstemi(),
        enCokCikti: GORU_AYARI.enCokCikti,
        jsonSemasi: goruJsonSemasi(),
        dusunme: GORU_AYARI.dusunme,
        gorseller: [{ mimeType: GORU_MIME[tur], data: Buffer.from(bytes).toString('base64') }],
        mediaResolution: GORU_AYARI.mediaResolution,
      });
    } catch (e) {
      const mesaj = e instanceof Error ? e.message : String(e);
      const neden: GeciciNeden = e instanceof YapayZekaHatasi && e.durum === 429 ? 'gemini_kota' : 'gemini_ulasilamadi';
      return { tur: 'gecici', neden, mesaj, girdiToken, ciktiToken, sureMs };
    }
    girdiToken += r.girdiToken;
    ciktiToken += r.ciktiToken;
    sureMs += r.sureMs;
    if (r.sonuc.tur === 'ret') return { tur: 'kalici', neden: 'gemini_ret', mesaj: r.sonuc.mesaj, girdiToken, ciktiToken, sureMs };
    if (r.sonuc.tur !== 'tamam') return { tur: 'gecici', neden: 'gemini_ulasilamadi', mesaj: r.sonuc.mesaj, girdiToken, ciktiToken, sureMs };
    const c = etiketCoz(r.sonuc.metin);
    if (c.ok) return { tur: 'etiket', etiketler: c.etiketler, girdiToken, ciktiToken, sureMs };
    sonSebep = c.sebep;
  }
  return { tur: 'kalici', neden: 'sema_disi', mesaj: sonSebep, girdiToken, ciktiToken, sureMs };
}
