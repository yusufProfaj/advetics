import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  beklenenYankilar,
  derleMeta,
  KATALOG_SURUMU,
  kurulumGecisiIzinliMi,
  kurulumOzeti,
  pilotTaslakEksikleri,
  pilotTaslakKanonikIcerik,
  provaGovdeleri,
  satirdanTaslak,
  taslakUyumGirdisi,
  uyumDenetle,
  dolu,
  type AtifStandardi,
  type KurulumSatirDurumu,
  type MetaApiSurumu,
  type OzelKategori,
  type PilotTaslak,
  type UyumKitleBilgisi,
  type YayinKipi,
} from '@advetics/shared';
import type { CryptoService } from '../../crypto/crypto.service';
import type { MetinUretici } from '../../yapay-zeka/gemini';
// İZİNLİ İÇE AKTARIM (pilot-kayit.spec.ts listesi): Meta erişimi, Graph
// istemcisi, yazma kesici ve iki saf yardımcı. Eski modülün servisleri,
// tabloları ve Nest modülü içe aktarılmıyor; kabul listesi bu dosyaları
// "YENİDEN KULLANILIR (istemci)" diye işaretliyor (F-13…F-17, G-04).
import { gorselOkuyucu, gorselOnbellegi, hesapErisimi, sayfaTokenOkuyucu, videoOkuyucu } from '../reklam/meta-erisim';
import { MetaGrafIstemcisi, metaSurumuDogrula, type GrafAyarlari } from '../reklam/meta-graf';
import { MetaKesinHata, MetaBelirsizHata, YazmaDurduruldu, type MetaYazmaPortu, type TxRunner } from '../reklam/yayin-motoru';
import { metaYazmaAcikMi } from '../reklam/yazma-kapisi';
import { kapsamaUygula } from '../reklam/prova-isleyici';
import { yerelTarih, zamanDamgasi } from '../reklam/yayin-baslat';
import { PilotKurulumMotoru, taslakOzeti } from './kurulum-motoru';
import type { PilotKurulumIsi } from './kurulum-kuyrugu';
import { yerelGun } from './plan-girdisi';
import { surumOku } from './plan.service';
import { reklamMetniYaz, taslakBaglamiOku } from './taslak-baglami';
import { uyumProfiliOku } from './uyum-profili';

const logger = new Logger('PilotKurulum');

/**
 * ═══ PİLOT KURULUM İŞÇİSİ (MIMARI § 6 madde 6) ═══
 *
 * Worker'da koşar (BYPASSRLS). Plan işi satırları açar ve her satır için
 * ayrı iş kuyruğa koyar; satır işi tek bir yol izler:
 *
 *   taslak (plan satırı + bağlam + yapay zekâ metni)
 *   → kip kontrolü (kapalı kipte platforma HİÇ gidilmez)
 *   → eksikler (varsa prova çağrısı YOK: kota boşa gitmez, E-14)
 *   → taslak uyum denetimi (ENGEL gerçek yayını kapatır)
 *   → hesap yazıcı kilidi → prova (hesap başına 5 dk'da 2) → PAUSED kurulum
 *   → geri okuma + tekillik → gerçek kipte AÇMA, test kipinde ARŞİV
 *
 * Her durum yazımı `KURULUM_GECISLERI`nden geçer ve iyimser kilitle
 * (`WHERE durum = eski`); izinsiz geçiş FIRLATIR. Plan durumu satırların
 * SAYIMINDAN türer (`kurulumOzeti`), elle yazılmaz.
 *
 * GOOGLE BU TURDA KURULMAZ (K-02 ve Ç-5 Tur 3): satır `dustu` olur ve
 * mesajı bunu söyler; plan `kismen_kuruldu`da durur. Sessiz "kuruldu" yok.
 */
export interface PilotIsleyiciBagimliliklari {
  tx: TxRunner;
  crypto: Pick<CryptoService, 'decrypt'>;
  apiSurumu: string;
  yuklemeKoku: string;
  kilit: { al(anahtar: string, sahip: string, ms: number): Promise<boolean>; birak(anahtar: string, sahip: string): Promise<void> };
  kilitOneki: string;
  yz: MetinUretici | null;
  kuyruk: { satirEkle(satirId: string, tetik: string, gecikmeMs?: number): Promise<void> };
  /** Testte sahte Meta; üretimde Graph istemcisi. */
  portKur?: (a: GrafAyarlari) => MetaYazmaPortu;
  simdi?: () => Date;
}

export type PilotIsSonucu = { tur: 'bitti'; durum: string } | { tur: 'ertele'; sebep: string; ms: number };

export const PROVA_KOTASI = { adet: 2, pencereMs: 5 * 60_000 } as const;
export const YAZICI_KILIT_MS = 30 * 60_000;
/** "Şimdi kur" ile yeniden denenebilen son durumlar; kayit_belirsiz ASLA (mükerrer kampanya). */
const YENIDEN_DENENEBILIR: readonly KurulumSatirDurumu[] = ['prova_dustu', 'fark_var', 'kurulmadi_kapali', 'dustu'];
const GOOGLE_MESAJI = 'Google kampanyaları bu sürümde kurulmuyor (Tur 3); satır kurulmadı, Google Ads’te elle kurulabilir.';

interface SatirKaydi {
  id: string;
  plan_id: string;
  org_id: string;
  client_id: string;
  satir_anahtari: string;
  platform: 'meta' | 'google';
  durum: KurulumSatirDurumu;
  kurulum_kimligi: string;
  ad_account_id: string | null;
}
interface PlanKaydi {
  id: string;
  org_id: string;
  client_id: string;
  durum: string;
  onaylanan_surum: number | null;
  onaylanan_ozet: string | null;
  icerik_ozeti: string;
  onay_zamani: Date | null;
  yayin_kipi: YayinKipi | null;
}

export async function pilotIsiniIsle(d: PilotIsleyiciBagimliliklari, is: PilotKurulumIsi, sahip: string): Promise<PilotIsSonucu> {
  return is.tur === 'plan' ? planIsle(d, is.planId, is.yeniden, sahip) : satirIsle(d, is.satirId, sahip);
}

async function planOku(d: PilotIsleyiciBagimliliklari, planId: string): Promise<PlanKaydi | null> {
  const [p] = await d.tx((t) =>
    t.$queryRaw<PlanKaydi[]>(Prisma.sql`
      SELECT id::text, org_id::text, client_id::text, durum, onaylanan_surum, onaylanan_ozet, icerik_ozeti, onay_zamani, yayin_kipi
        FROM pilot_planlari WHERE id = ${planId}::uuid`),
  );
  return p ?? null;
}

/** Plan işi: `onaylandi → kuruluyor` (worker yazar, Ç-6), satırları aç, satır işlerini kuyruğa koy. */
async function planIsle(d: PilotIsleyiciBagimliliklari, planId: string, yeniden: boolean, sahip: string): Promise<PilotIsSonucu> {
  let p = await planOku(d, planId);
  if (!p) throw new Error(`Pilot planı bulunamadı: ${planId}`);
  if (p.durum === 'onaylandi') {
    await d.tx((t) => t.$queryRaw(Prisma.sql`UPDATE pilot_planlari SET durum = 'kuruluyor', updated_at = now() WHERE id = ${planId}::uuid AND durum = 'onaylandi' RETURNING id`));
    p = (await planOku(d, planId))!;
  }
  if (p.durum !== 'kuruluyor' || p.onaylanan_surum === null) return { tur: 'bitti', durum: p.durum };

  const plan = await d.tx((t) => surumOku(t, planId, p!.onaylanan_surum!));
  for (const s of plan.satirlar) {
    await d.tx((t) =>
      t.$queryRaw(Prisma.sql`
        INSERT INTO pilot_kurulum_satirlari (plan_id, org_id, client_id, onaylanan_surum, satir_anahtari, platform, ad)
        VALUES (${planId}::uuid, ${p!.org_id}::uuid, ${p!.client_id}::uuid, ${p!.onaylanan_surum}, ${s.anahtar}, ${s.platform}, ${s.ad.slice(0, 200)})
        ON CONFLICT (plan_id, onaylanan_surum, satir_anahtari) DO NOTHING
        RETURNING id`),
    );
  }
  const satirlar = await d.tx((t) =>
    t.$queryRaw<Array<{ id: string; durum: KurulumSatirDurumu }>>(Prisma.sql`
      SELECT id::text, durum FROM pilot_kurulum_satirlari WHERE plan_id = ${planId}::uuid AND onaylanan_surum = ${p!.onaylanan_surum}`),
  );
  const tetik = sahip.replace(/[^0-9a-zA-Z_-]/g, '');
  let eklenen = 0;
  for (const s of satirlar) {
    if (s.durum === 'taslak' || (yeniden && YENIDEN_DENENEBILIR.includes(s.durum))) {
      await d.kuyruk.satirEkle(s.id, tetik);
      eklenen++;
    }
  }
  if (eklenen === 0) await planDurumuGuncelle(d, planId);
  return { tur: 'bitti', durum: `${eklenen} satır kuyrukta` };
}

/** Bütün satırlar son durumdaysa plan `kuruldu` ya da `kismen_kuruldu` (sayımdan). */
export async function planDurumuGuncelle(d: Pick<PilotIsleyiciBagimliliklari, 'tx'>, planId: string): Promise<void> {
  const [p] = await d.tx((t) => t.$queryRaw<Array<{ onaylanan_surum: number | null }>>(Prisma.sql`SELECT onaylanan_surum FROM pilot_planlari WHERE id = ${planId}::uuid`));
  if (!p || p.onaylanan_surum === null) return;
  const satirlar = await d.tx((t) =>
    t.$queryRaw<Array<{ durum: KurulumSatirDurumu }>>(Prisma.sql`
      SELECT durum FROM pilot_kurulum_satirlari WHERE plan_id = ${planId}::uuid AND onaylanan_surum = ${p.onaylanan_surum}`),
  );
  const o = kurulumOzeti(satirlar);
  if (!o.planHedefi) return;
  await d.tx((t) => t.$queryRaw(Prisma.sql`UPDATE pilot_planlari SET durum = ${o.planHedefi}, updated_at = now() WHERE id = ${planId}::uuid AND durum = 'kuruluyor' RETURNING id`));
}

/** İzinli geçiş + iyimser kilit. Mesaj ve ek alanlar aynı UPDATE'te. */
async function gecis(
  d: PilotIsleyiciBagimliliklari,
  s: SatirKaydi,
  yeni: KurulumSatirDurumu,
  ek: { mesaj?: string | null; farklar?: unknown; prova?: unknown; hesap?: string | null } = {},
): Promise<SatirKaydi> {
  if (!kurulumGecisiIzinliMi(s.durum, yeni)) throw new Error(`İzinsiz kurulum geçişi: ${s.durum} → ${yeni}`);
  const r = await d.tx((t) =>
    t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE pilot_kurulum_satirlari
         SET durum = ${yeni}, updated_at = now(),
             platform_mesaji = ${ek.mesaj === undefined ? null : ek.mesaj?.slice(0, 2000) ?? null},
             farklar = COALESCE(${ek.farklar === undefined ? null : JSON.stringify(ek.farklar)}::jsonb, farklar),
             prova = COALESCE(${ek.prova === undefined ? null : JSON.stringify(ek.prova)}::jsonb, prova),
             prova_zamani = CASE WHEN ${ek.prova !== undefined} THEN now() ELSE prova_zamani END,
             ad_account_id = COALESCE(${ek.hesap ?? null}::uuid, ad_account_id)
       WHERE id = ${s.id}::uuid AND durum = ${s.durum}
      RETURNING id::text`),
  );
  if (r.length !== 1) throw new Error(`Kurulum satırı ${s.id} başka bir süreçte ilerlemiş (${s.durum})`);
  return { ...s, durum: yeni, ad_account_id: ek.hesap ?? s.ad_account_id };
}

/** Son durum sonrası plan sayımı; hata planı düşürmesin diye ayrı. */
async function bitir(d: PilotIsleyiciBagimliliklari, s: SatirKaydi, sonuc: string): Promise<PilotIsSonucu> {
  await planDurumuGuncelle(d, s.plan_id);
  return { tur: 'bitti', durum: sonuc };
}

/**
 * Satırın bu işte hangi yoldan gideceği:
 *   · `yeni`  — ilk kurulum ya da platforma HİÇ gidilmemiş bir düşüşün
 *               yeniden denenmesi: taslak baştan kurulur (metin yeniden yazılır).
 *   · `devam` — yazma kesicisiyle yarıda durmuş kurulum: kurulmuş nesneler
 *               kuruldu, kalanlar bekliyor; SAKLI taslak ve SAKLI gövdelerle
 *               kaldığı yerden (taslak yeniden yazılsaydı kurulan nesneler ile
 *               kayıt ayrışırdı).
 *   · `ara`   — işçi bir ara durumda ölmüş: saklı taslakla aynı adımdan.
 *   · `kilit` — Meta'da sonucu belirsiz, reddedilmiş ya da farklı okunmuş
 *               nesne var: yeniden POST mükerrer kampanya açabilir; satır
 *               yerinde kalır ve sebebi yazılır.
 */
type Yol = 'yeni' | 'devam' | 'ara' | 'kilit' | 'yok';

async function yolSec(d: PilotIsleyiciBagimliliklari, s: SatirKaydi): Promise<Yol> {
  const ara: readonly KurulumSatirDurumu[] = ['prova', 'kuruluyor', 'geri_okundu_ayni', 'aciliyor'];
  if (s.durum === 'taslak') return 'yeni';
  if (ara.includes(s.durum)) return 'ara';
  if (!YENIDEN_DENENEBILIR.includes(s.durum)) return 'yok';
  const n = await d.tx((t) =>
    t.$queryRaw<Array<{ durum: string; kimlik: string | null }>>(Prisma.sql`
      SELECT durum, platform_kimligi AS kimlik FROM pilot_nesneleri WHERE kurulum_satir_id = ${s.id}::uuid`),
  );
  if (s.durum === 'fark_var' || n.some((x) => x.durum === 'gonderiliyor' || x.durum === 'belirsiz' || x.durum === 'reddedildi')) {
    return n.length > 0 ? 'kilit' : 'yeni';
  }
  if (n.some((x) => x.kimlik)) return 'devam';
  return 'yeni';
}

async function satirIsle(d: PilotIsleyiciBagimliliklari, satirId: string, sahip: string): Promise<PilotIsSonucu> {
  const simdi = d.simdi?.() ?? new Date();
  const [s0] = await d.tx((t) =>
    t.$queryRaw<SatirKaydi[]>(Prisma.sql`
      SELECT id::text, plan_id::text, org_id::text, client_id::text, satir_anahtari, platform, durum, kurulum_kimligi::text, ad_account_id::text
        FROM pilot_kurulum_satirlari WHERE id = ${satirId}::uuid`),
  );
  if (!s0) throw new Error(`Kurulum satırı bulunamadı: ${satirId}`);
  let s = s0;
  const p = await planOku(d, s.plan_id);
  if (!p || p.durum !== 'kuruluyor' || p.onaylanan_surum === null || !p.yayin_kipi) return { tur: 'bitti', durum: `plan ${p?.durum ?? 'yok'}` };

  /** Düşüş: o anki durumdan izinli olan son duruma (taslak → dustu, prova → prova_dustu). */
  const dus = async (mesaj: string): Promise<PilotIsSonucu> => {
    if (s.durum === 'prova') s = await gecis(d, s, 'prova_dustu', { mesaj });
    else if (kurulumGecisiIzinliMi(s.durum, 'dustu')) s = await gecis(d, s, 'dustu', { mesaj });
    else if (kurulumGecisiIzinliMi(s.durum, 'prova')) s = await gecis(d, await gecis(d, s, 'prova'), 'prova_dustu', { mesaj });
    return bitir(d, s, s.durum);
  };

  // Onaylanan içerik ile güncel içerik ayrışmışsa kurulum YOK: müşterinin
  // onayladığı belge ile kurulan belge aynı olmalı.
  if (p.onaylanan_ozet !== p.icerik_ozeti) {
    if (s.durum === 'taslak') return dus('Onaylanan plan ile güncel plan ayrışmış; yeniden onay gerekir.');
    return bitir(d, s, s.durum);
  }
  // Kapalı kip: platforma hiç gidilmez.
  if (p.yayin_kipi === 'kapali') {
    if (s.durum === 'taslak') s = await gecis(d, s, 'kurulmadi_kapali', { mesaj: 'Uyum denetimi onay anında geçmediği için kampanya kurulmadı; uyum geçince "Şimdi kur".' });
    return bitir(d, s, s.durum);
  }
  if (s.platform === 'google') {
    if (s.durum === 'taslak') return dus(GOOGLE_MESAJI);
    return bitir(d, s, s.durum);
  }

  const yol = await yolSec(d, s);
  if (yol === 'yok') return bitir(d, s, s.durum);
  if (yol === 'kilit') {
    await d.tx((t) =>
      t.$queryRaw(Prisma.sql`
        UPDATE pilot_kurulum_satirlari SET platform_mesaji = ${'Bu satırda Meta’ya gönderilmiş, reddedilmiş ya da farklı okunmuş nesneler var; yeniden denemek mükerrer kampanya açabilir. Meta Reklam Yöneticisi’nde kontrol edip planı kapat.'}, updated_at = now()
         WHERE id = ${s.id}::uuid RETURNING id`),
    );
    return bitir(d, s, s.durum);
  }

  let taslak: PilotTaslak;
  let yasalUyari: string | null;
  const notlar: string[] = [];
  if (yol === 'yeni') {
    // Platforma hiç gitmemiş nesne satırları eski gövdeyi taşıyor; yeni taslakla açılacaklar.
    await d.tx((t) => t.$queryRaw(Prisma.sql`DELETE FROM pilot_nesneleri WHERE kurulum_satir_id = ${s.id}::uuid AND platform_kimligi IS NULL AND durum = 'bekliyor' RETURNING id`));
    const y = await taslakKur(d, s, p, simdi, notlar);
    if (y.tur === 'ret') return dus(y.mesaj);
    taslak = y.taslak;
    yasalUyari = y.yasalUyari;
  } else {
    const [k] = await d.tx((t) => t.$queryRaw<Array<{ taslak: PilotTaslak | null }>>(Prisma.sql`SELECT taslak FROM pilot_kurulum_satirlari WHERE id = ${s.id}::uuid`));
    if (!k?.taslak) return dus('Saklı taslak bulunamadı; satır yeniden kurulamaz.');
    taslak = k.taslak;
    const [y] = await d.tx((t) => t.$queryRaw<Array<{ y: string | null }>>(Prisma.sql`SELECT yasal_uyari AS y FROM client_profiles WHERE client_id = ${s.client_id}::uuid`));
    yasalUyari = y?.y?.trim() || null;
  }

  // ── Hesap kilidi ve erişim ──
  const hesapId = taslak.reklamHesabiId.dolu ? taslak.reklamHesabiId.deger : null;
  if (!hesapId) return dus('Reklam hesabı seçilemedi.');
  const anahtar = `${d.kilitOneki}:yazici:${hesapId}`;
  if (!(await d.kilit.al(anahtar, sahip, YAZICI_KILIT_MS))) return { tur: 'ertele', sebep: 'Bu hesapta başka bir işlem sürüyor.', ms: 30_000 };
  try {
    let erisim;
    try {
      erisim = await hesapErisimi(d.tx, d.crypto, hesapId, s.client_id, simdi);
    } catch (e) {
      if (e instanceof MetaKesinHata) return dus(e.message);
      throw e;
    }
    const ayar: GrafAyarlari = {
      apiSurumu: d.apiSurumu,
      hesap: erisim.hesap,
      kullaniciToken: erisim.kullaniciToken,
      sayfaTokeni: sayfaTokenOkuyucu(d.tx, d.crypto, s.client_id),
      gorselOnbellek: gorselOnbellegi(d.tx, s.org_id, hesapId),
      gorselBaytlari: gorselOkuyucu(d.tx, d.yuklemeKoku, s.client_id),
      videoBaytlari: videoOkuyucu(d.tx, d.yuklemeKoku, s.client_id),
    };
    const port = d.portKur ? d.portKur(ayar) : new MetaGrafIstemcisi(ayar);
    const motor = new PilotKurulumMotoru(d.tx, port, erisim.hesap, () => metaYazmaAcikMi(d.tx, s.client_id));

    // Ara durumda yarım kalmış POST: yeniden gönderilmez.
    if (yol === 'ara' && (await motor.belirsizVarMi(s.id))) {
      s = kurulumGecisiIzinliMi(s.durum, 'kayit_belirsiz') ? await gecis(d, s, 'kayit_belirsiz', { mesaj: 'Meta’ya gönderilmiş ama sonucu yazılmamış bir nesne var; yeniden gönderilmez.' }) : s;
      return bitir(d, s, s.durum);
    }

    // ── Prova (yeni yol ya da provada ölmüş iş) ──
    if (yol === 'yeni' || s.durum === 'prova') {
      const derleme = await derle(d, s, taslak, erisim, simdi);
      if (derleme.tur === 'ret') return dus(derleme.mesaj);
      if (s.durum !== 'prova') {
        const [say] = await d.tx((t) =>
          t.$queryRaw<Array<{ n: number }>>(Prisma.sql`
            SELECT count(*)::int AS n FROM pilot_kurulum_satirlari
             WHERE ad_account_id = ${hesapId}::uuid AND prova_zamani > ${new Date(simdi.getTime() - PROVA_KOTASI.pencereMs)}`),
        );
        if ((say?.n ?? 0) >= PROVA_KOTASI.adet) return { tur: 'ertele', sebep: 'Meta kontrolü kotası: birkaç dakika sonra.', ms: 90_000 };
        s = await gecis(d, s, 'prova', { hesap: hesapId });
      }
      const prova = await provaKos(motor, derleme.govdeler, derleme.medya);
      if (prova.tur !== 'gecti') {
        s = await gecis(d, s, 'prova_dustu', { mesaj: prova.mesaj, prova: prova.sonuclar });
        return bitir(d, s, s.durum);
      }
      await motor.nesneleriAc(s, derleme.medya, derleme.govdeler, beklenenYankilar(derleme.govdeler));
      s = await gecis(d, s, 'kuruluyor', { prova: prova.sonuclar, mesaj: notlar.length ? notlar.join(' ') : null });
    } else if (yol === 'devam') {
      // Kesiciyle durmuş kurulum: prova zaten geçmişti, saklı gövdelerle sür.
      s = await gecis(d, await gecis(d, s, 'prova'), 'kuruluyor', { mesaj: 'Kaldığı yerden sürdürülüyor.' });
    }

    // ── PAUSED kurulum → geri okuma ──
    if (s.durum === 'kuruluyor') {
      const k = await motor.kur(s.id);
      if (k.tur === 'kesin' || k.tur === 'durduruldu') {
        s = await gecis(d, s, 'dustu', { mesaj: k.tur === 'durduruldu' ? `${k.mesaj} (kaldığı yerden "Şimdi kur" ile)` : k.mesaj });
        return bitir(d, s, s.durum);
      }
      if (k.tur === 'belirsiz') {
        s = await gecis(d, s, 'kayit_belirsiz', { mesaj: k.mesaj });
        return bitir(d, s, s.durum);
      }
      const g = await motor.geriOku(s.id, `adv-yayin-${s.kurulum_kimligi}`, !!yasalUyari);
      if (g.tur === 'fark') {
        s = await gecis(d, s, 'fark_var', { mesaj: g.mesaj, farklar: g.farklar });
        return bitir(d, s, s.durum);
      }
      s = await gecis(d, s, 'geri_okundu_ayni');
    }

    // ── Kipe göre son adım: gerçekte AÇ, testte ARŞİVLE ──
    if (s.durum === 'geri_okundu_ayni') {
      if (p.yayin_kipi === 'test') {
        const not = await motor.arsivle(s.id);
        s = await gecis(d, s, 'test_kipinde_kuruldu', { mesaj: not ?? 'Test kipinde kuruldu, geri okundu ve açılmadan arşivlendi.' });
        return bitir(d, s, s.durum);
      }
      s = await gecis(d, s, 'aciliyor');
    }
    if (s.durum === 'aciliyor') {
      const a = await motor.ac(s.id);
      s = a.tur === 'kuruldu' ? await gecis(d, s, 'acildi', { mesaj: null }) : await gecis(d, s, 'dustu', { mesaj: `Açma tamamlanamadı: ${'mesaj' in a ? a.mesaj : ''}` });
    }
    return bitir(d, s, s.durum);
  } finally {
    await d.kilit.birak(anahtar, sahip);
  }
}

/**
 * Taslak: plan satırı + bağlam + yapay zekâ metni; eksikler ve taslak
 * anında uyum. Platform çağrısı YOK: eksik ya da uyum engeli varsa prova
 * kotası harcanmaz (E-14).
 */
async function taslakKur(
  d: PilotIsleyiciBagimliliklari,
  s: SatirKaydi,
  p: PlanKaydi,
  simdi: Date,
  notlar: string[],
): Promise<{ tur: 'tamam'; taslak: PilotTaslak; yasalUyari: string | null } | { tur: 'ret'; mesaj: string }> {
  const plan = await d.tx((t) => surumOku(t, p.id, p.onaylanan_surum!));
  const satir = plan.satirlar.find((x) => x.anahtar === s.satir_anahtari);
  if (!satir || !plan.takvim) return { tur: 'ret', mesaj: 'Plan satırı onaylanan sürümde bulunamadı.' };
  const okuma = await d.tx((t) =>
    taslakBaglamiOku(t, {
      planId: p.id,
      planSurum: p.onaylanan_surum!,
      onayZamani: new Date(p.onay_zamani ?? simdi).toISOString(),
      clientId: s.client_id,
      platform: 'meta',
      takvim: plan.takvim!,
      simdi,
    }),
  );
  let taslak = satirdanTaslak(satir, okuma.baglam);
  const idler = taslak.varliklar?.dolu ? taslak.varliklar.deger : [];
  const varliklar = await d.tx((t) =>
    t.$queryRaw<Array<{ id: string; ad: string; tur: string }>>(Prisma.sql`
      SELECT id::text, name AS ad, kind AS tur FROM assets WHERE client_id = ${s.client_id}::uuid AND id = ANY(${idler}::uuid[])`),
  );
  // Tur 1 YALNIZ GÖRSEL kuruyor: video fikri kapak görseli istiyor ve planda kapak yok (C-14).
  const gorseller = idler.map((id) => varliklar.find((v) => v.id === id)).filter((v): v is { id: string; ad: string; tur: string } => !!v && v.tur === 'image');
  if (idler.length > gorseller.length) notlar.push(`${idler.length - gorseller.length} video ya da silinmiş varlık bu sürümde kullanılmadı.`);
  const m = await reklamMetniYaz(d.yz, taslak, okuma, gorseller);
  if (m.tur === 'tamam') {
    taslak = { ...taslak, metinler: dolu(m.metinler, { tur: 'yz_metin', kimlik: d.yz?.model ?? 'yok', zaman: simdi.toISOString() }) };
    notlar.push(...m.notlar);
  } else notlar.push(m.mesaj);
  const eksikler = pilotTaslakEksikleri(taslak, { yasalUyari: okuma.yasalUyari });
  const icerik = pilotTaslakKanonikIcerik(taslak);
  await d.tx((t) =>
    t.$queryRaw(Prisma.sql`
      UPDATE pilot_kurulum_satirlari
         SET taslak = ${JSON.stringify(taslak)}::jsonb, taslak_ozeti = ${taslakOzeti(icerik)}, eksikler = ${JSON.stringify(eksikler)}::jsonb, updated_at = now()
       WHERE id = ${s.id}::uuid RETURNING id`),
  );
  if (eksikler.length > 0) return { tur: 'ret', mesaj: `Kurulum için eksik: ${eksikler.map((e) => e.metin).join(' · ')}${notlar.length ? ` (${notlar.join(' ')})` : ''}` };

  // Taslak anında uyum: gerçek kipte ENGEL ve UYARI kapatır (taslak
  // bulgusunu işaretleyecek bir ekran yok; "Şimdi kur" metni yeniden yazar).
  const profil = await d.tx((t) => uyumProfiliOku(t, s.client_id));
  const kitle = await kitleBilgisi(d, s.client_id, taslak);
  const [tz] = await d.tx((t) => t.$queryRaw<Array<{ tz: string }>>(Prisma.sql`SELECT timezone AS tz FROM clients WHERE id = ${s.client_id}::uuid`));
  const denetim = uyumDenetle(taslakUyumGirdisi(taslak, taslakOzeti(icerik), yerelGun(simdi, tz?.tz || 'Europe/Istanbul'), kitle), profil, KATALOG_SURUMU, simdi.toISOString());
  await d.tx((t) =>
    t.$queryRaw(Prisma.sql`
      INSERT INTO pilot_uyum_denetimleri (plan_id, org_id, client_id, surum, icerik_ozeti, katalog_surumu, an, satir_anahtari, bulgular, profil)
      VALUES (${p.id}::uuid, ${s.org_id}::uuid, ${s.client_id}::uuid, ${p.onaylanan_surum}, ${denetim.icerikOzeti}, ${denetim.katalogSurumu}, 'taslak',
              ${s.satir_anahtari}, ${JSON.stringify(denetim.bulgular)}::jsonb, ${JSON.stringify(profil)}::jsonb)
      RETURNING id`),
  );
  const engel = denetim.bulgular.filter((b) => b.seviye === 'ENGEL' || b.seviye === 'UYARI');
  if (p.yayin_kipi === 'gercek' && engel.length > 0) {
    return { tur: 'ret', mesaj: `Reklam metni uyum denetiminden geçmedi: ${engel.map((b) => `${b.kuralKimligi} ${b.mesaj}`).join(' · ')}. "Şimdi kur" metni yeniden yazar.` };
  }
  return { tur: 'tamam', taslak, yasalUyari: okuma.yasalUyari };
}

async function kitleBilgisi(d: PilotIsleyiciBagimliliklari, clientId: string, t: PilotTaslak): Promise<UyumKitleBilgisi | null> {
  const id = t.kitleSablonuId?.dolu ? t.kitleSablonuId.deger : null;
  if (!id) return null;
  const [k] = await d.tx((x) =>
    x.$queryRaw<Array<{ yas_min: number; yas_max: number; cinsiyet: string; ozel: unknown }>>(Prisma.sql`
      SELECT age_min AS yas_min, age_max AS yas_max, genders AS cinsiyet, ozel_kitleler AS ozel
        FROM audience_templates WHERE id = ${id}::uuid AND client_id = ${clientId}::uuid`),
  );
  if (!k) return null;
  return { yasMin: k.yas_min, yasMax: k.yas_max, cinsiyet: k.cinsiyet, ozelKitleVar: (Array.isArray(k.ozel) ? k.ozel : []).some((o) => (o as { mod?: string })?.mod === 'dahil') };
}

type Derleme = { tur: 'govde'; govdeler: ReturnType<typeof govdelerAl>; medya: string[] } | { tur: 'ret'; mesaj: string };
function govdelerAl(x: Extract<ReturnType<typeof derleMeta>, { tur: 'govde' }>) {
  return x.govdeler;
}

/**
 * Taslaktan derleyici girdisi — kesici (OK-15) ve atıf standardı (OK-16)
 * burada, platform çağrısından ÖNCE: ret sıfır çağrıya mal olur.
 */
async function derle(
  d: PilotIsleyiciBagimliliklari,
  s: SatirKaydi,
  t: PilotTaslak,
  erisim: { hesap: string; paraBirimi: string; saatDilimi: string },
  simdi: Date,
): Promise<Derleme> {
  const kapi = await metaYazmaAcikMi(d.tx, s.client_id);
  if (!kapi.acik) return { tur: 'ret', mesaj: kapi.sebep };
  const [a] = await d.tx((x) =>
    x.$queryRaw<Array<{ atif: AtifStandardi | null }>>(Prisma.sql`
      SELECT a.atif_standardi AS atif FROM ajans_ayari a
        JOIN clients c ON c.id = ${s.client_id}::uuid
        JOIN organizations o ON o.id = c.org_id
        LEFT JOIN manager_accounts ma ON ma.id = o.manager_account_id
       WHERE a.atif_standardi IS NOT NULL AND (a.org_id = c.org_id OR a.org_id = ma.ajans_org_id)
       ORDER BY (a.org_id = c.org_id) DESC LIMIT 1`),
  );
  if (!a?.atif) return { tur: 'ret', mesaj: 'Atıf standardı henüz seçilmedi. Ajans yöneticisi seçene kadar kampanya kurulamaz.' };
  const sayfaId = t.sayfaId?.dolu ? t.sayfaId.deger : null;
  const igId = t.instagramId?.dolu ? t.instagramId.deger : null;
  const [sayfa] = await d.tx((x) =>
    x.$queryRaw<Array<{ dis: string }>>(Prisma.sql`SELECT external_id AS dis FROM social_profiles WHERE id = ${sayfaId}::uuid AND client_id = ${s.client_id}::uuid AND profile_type = 'facebook_page'`),
  );
  if (!sayfa) return { tur: 'ret', mesaj: 'Sayfa bu workspace’te değil.' };
  const [ig] = igId
    ? await d.tx((x) => x.$queryRaw<Array<{ dis: string }>>(Prisma.sql`SELECT external_id AS dis FROM social_profiles WHERE id = ${igId}::uuid AND client_id = ${s.client_id}::uuid AND profile_type = 'instagram_business'`))
    : [];
  const kitleId = t.kitleSablonuId?.dolu ? t.kitleSablonuId.deger : null;
  const [k] = kitleId
    ? await d.tx((x) => x.$queryRaw<Array<{ yas_min: number; yas_max: number; cinsiyet: string }>>(Prisma.sql`SELECT age_min AS yas_min, age_max AS yas_max, genders AS cinsiyet FROM audience_templates WHERE id = ${kitleId}::uuid`))
    : [];
  const [c] = await d.tx((x) => x.$queryRaw<Array<{ ad: string }>>(Prisma.sql`SELECT name AS ad FROM clients WHERE id = ${s.client_id}::uuid`));
  const metinler = t.metinler.dolu ? t.metinler.deger.filter((m) => m.varlikId) : [];
  if (metinler.length === 0) return { tur: 'ret', mesaj: 'Görselli reklam metni yok.' };
  let apiSurumu: MetaApiSurumu;
  try {
    apiSurumu = metaSurumuDogrula(d.apiSurumu);
  } catch (e) {
    return { tur: 'ret', mesaj: (e as Error).message };
  }
  const yasMin = k?.yas_min ?? 18;
  const r = derleMeta({
    apiSurumu,
    // Derleyicinin `adv-yayin-<kimlik>` etiketi: tekillik kapısı bununla arıyor.
    yayinKimligi: s.kurulum_kimligi,
    tarih: yerelTarih(simdi, erisim.saatDilimi),
    workspaceKisaAdi: (c?.ad ?? 'Workspace').slice(0, 40),
    niyet: t.niyet.dolu ? t.niyet.deger : 'SITE',
    hesap: { platformId: erisim.hesap, paraBirimi: erisim.paraBirimi },
    sayfaPlatformId: sayfa.dis,
    instagramPlatformId: ig?.dis ?? null,
    hedefleme: {
      konumlar: t.konumlar?.dolu ? t.konumlar.deger : [],
      enDusukYas: yasMin,
      ipucuYas: k && (k.yas_min > 18 || k.yas_max < 65) ? { min: k.yas_min, max: k.yas_max } : null,
      ipucuCinsiyet: k?.cinsiyet === 'male' ? 'erkek' : k?.cinsiyet === 'female' ? 'kadin' : null,
    },
    kategoriler: { taban: (t.ozelKategoriler?.dolu ? t.ozelKategoriler.deger : []) as OzelKategori[], ek: [] },
    butce: { tip: t.butce.deger.tip, micros: BigInt(t.butce.deger.micros), seviye: 'kampanya' },
    takvim: {
      baslangic: zamanDamgasi(t.takvim.deger.baslangic, '00:00:00', erisim.saatDilimi),
      bitis: zamanDamgasi(t.takvim.deger.bitis, '23:59:00', erisim.saatDilimi),
    },
    atif: a.atif,
    kavramlar: metinler.map((m) => ({ gorselHash: `{medya:${m.varlikId}}`, baslik: m.baslik, metin: m.metin })),
    hedefAdres: t.hedefAdres.dolu ? t.hedefAdres.deger : null,
    formId: null,
    urlEtiketleri: null,
  });
  if (r.tur === 'ret') return { tur: 'ret', mesaj: r.retler.map((x) => x.mesaj).join(' · ') };
  return { tur: 'govde', govdeler: r.govdeler, medya: [...new Set(metinler.map((m) => m.varlikId!))] };
}

interface ProvaParcasi {
  ad: string;
  sonuc: 'gecti' | 'reddedildi' | 'dogrulanamadi';
  mesaj?: string;
  kod?: number;
  altKod?: number;
  not?: string;
}

/**
 * PROVA: nesne açmaz; her gövde `validate_only`. Her gövde denenir, ilk
 * retle durulmaz (kullanıcı bütün retleri bir kerede görmeli). Kesin ret
 * belirsizden güçlü. Kapsama kuralı eski yoldan İÇE AKTARILIYOR (E-08).
 */
async function provaKos(
  motor: PilotKurulumMotoru,
  govdeler: Extract<Derleme, { tur: 'govde' }>['govdeler'],
  medya: string[],
): Promise<{ tur: 'gecti' | 'reddedildi' | 'dogrulanamadi' | 'durduruldu'; mesaj: string; sonuclar: ProvaParcasi[] }> {
  const hashler = new Map<string, string>();
  for (const v of medya) {
    try {
      hashler.set(v, await motor.gorselHash(v));
    } catch (e) {
      if (e instanceof YazmaDurduruldu) return { tur: 'durduruldu', mesaj: e.message, sonuclar: [] };
      const mesaj = `Görsel yüklenemedi: ${(e as Error).message}`;
      return { tur: e instanceof MetaKesinHata ? 'reddedildi' : 'dogrulanamadi', mesaj, sonuclar: [{ ad: `medya:${v}`, sonuc: 'reddedildi', mesaj }] };
    }
  }
  let sonuclar: ProvaParcasi[] = [];
  for (const g of provaGovdeleri(govdeler, hashler)) {
    try {
      await motor.dogrula(g.uc, g.alanlar);
      sonuclar.push({ ad: g.ad, sonuc: 'gecti' });
    } catch (e) {
      if (e instanceof YazmaDurduruldu) return { tur: 'durduruldu', mesaj: e.message, sonuclar };
      if (e instanceof MetaKesinHata) sonuclar.push({ ad: g.ad, sonuc: 'reddedildi', mesaj: e.message, kod: e.kod, altKod: e.altKod });
      else sonuclar.push({ ad: g.ad, sonuc: 'dogrulanamadi', mesaj: e instanceof MetaBelirsizHata ? e.message : String(e) });
    }
  }
  sonuclar = kapsamaUygula(sonuclar);
  const red = sonuclar.filter((x) => x.sonuc === 'reddedildi');
  if (red.length > 0) return { tur: 'reddedildi', mesaj: `Meta ${red.length} parçayı kabul etmedi: ${[...new Set(red.map((r) => r.mesaj))].join(' · ')}`, sonuclar };
  if (sonuclar.some((x) => x.sonuc === 'dogrulanamadi')) return { tur: 'dogrulanamadi', mesaj: 'Meta’nın kontrolü bir parçada tamamlanamadı.', sonuclar };
  return { tur: 'gecti', mesaj: 'Meta’nın ön kontrolü geçti.', sonuclar };
}
