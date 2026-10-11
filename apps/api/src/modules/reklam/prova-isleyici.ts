import { Prisma } from '@prisma/client';
import { provaGovdeleri, taslakAlanlariSchema, type MetaApiSurumu } from '@advetics/shared';
import { MetaBelirsizHata, MetaKesinHata, YazmaDurduruldu, type MetaYazmaPortu, type TxRunner } from './yayin-motoru';
import { taslakDerle } from './yayin-baslat';

/**
 * Meta PROVASINI koşturur (TASARIM.md § 11.10). Nesne AÇILMAZ; yalnız
 * görsel yüklenir (para harcamaz, hesap başına önbellekte kalır) — gerçek
 * hash olmadan kreatif doğrulanamaz.
 *
 * HER GÖVDE DENENİR, ilk retle durulmaz: kullanıcı "Meta 3 alanı kabul
 * etmedi"yi tek seferde görmeli, düzeltip üç kez sormak zorunda kalmamalı.
 * Kesin ret belirsizden güçlü: bir gövde reddedildiyse sonuç reddedildi.
 *
 * HESAP BAŞINA KOTA: 5 dakikada en çok 2 prova; aşınca ertelenir, sessiz
 * değil (panel "bekletildi" der). Kota bekçisinin yapı taraması katmanını
 * provanın tüketmemesi için (CLAUDE.md "BAĞIMLI İŞ, BAĞLI OLDUĞU İŞİN
 * KOTASINI YİYEBİLİR").
 */
export const PROVA_KOTASI = { adet: 2, pencereMs: 5 * 60_000 } as const;
/** Provada video işlenmesi için en çok 18 × 10 sn = 3 dk; prova bir kuyruk işi ve uzun beklememeli. */
const PROVA_VIDEO_DENEME = 18;

export type ProvaSonucu = { tur: 'bitti'; durum: 'gecti' | 'reddedildi' | 'dogrulanamadi' } | { tur: 'ertele'; sebep: string };

interface GovdeSonucu {
  ad: string;
  sonuc: 'gecti' | 'reddedildi' | 'dogrulanamadi';
  mesaj?: string;
  kod?: number;
  altKod?: number;
  /** Geçti ama nasıl geçtiği kullanıcıya söylenmeli (kapsama kuralı). */
  not?: string;
}

/**
 * KAPSAMA KURALI — canlıda görüldü (2026-10-07, v25.0): reklam seti
 * provası satır içi `campaign_spec` ile `/adsets`e sorulunca Meta her
 * seferinde 5xx ("An unexpected error has occurred") döndürüyor; AYNI
 * reklam seti gövdesi reklam provasının `adset_spec`i içinde sorulunca
 * geçiyor. Yani kitle ve bütçe Meta'da zaten doğrulanmış, düşen yalnız o
 * ucun satır içi kampanyayı işleyişi. Kural DAR: yalnız BELİRSİZ sonuç
 * (kesin ret asla çevrilmez) ve yalnız bütün reklam provaları geçtiyse;
 * çevrilen sonuç `not` ile ekranda söylenir, sessizce yeşile dönmez.
 */
export function kapsamaUygula(sonuclar: GovdeSonucu[]): GovdeSonucu[] {
  const set = sonuclar.find((x) => x.ad === 'reklam_seti');
  const reklamlar = sonuclar.filter((x) => x.ad.startsWith('reklam:'));
  if (!set || set.sonuc !== 'dogrulanamadi' || reklamlar.length === 0 || !reklamlar.every((r) => r.sonuc === 'gecti')) return sonuclar;
  return sonuclar.map((x) =>
    x === set
      ? {
          ad: x.ad,
          sonuc: 'gecti' as const,
          // Var olan not KORUNUR: geçici prova kampanyası silinemediyse bunu
          // söyleyen not burada atılırsa Meta'da boş bir kampanya kalır ve
          // ekranda tek kelime görünmez (Ajan 4, Dalga 3 F2).
          not: [`Meta bu parçayı tek başına kontrol edemedi (${x.mesaj ?? 'sebep yok'}); aynı kitle ve bütçe her reklamın içinde kontrol edildi ve geçti.`, x.not]
            .filter(Boolean)
            .join(' '),
        }
      : x,
  );
}

/**
 * REKLAM SETİ GEÇİCİ BİR KAMPANYAYA KARŞI DOĞRULANIR — ölçüldü (2026-10-11,
 * v25.0, `meta-set-prova-kesif`, Ege Birlik Yapı, konutlu anlık form):
 * satır içi `campaign_spec`li `/adsets` provası hangi alan çıkarılırsa
 * çıkarılsın 5xx döndü (bütün alanlar tek tek denendi). Kapsama kuralı onu
 * "reklamın içinde geçti" diye kapatıyordu ama reklamın satır içi
 * `adset_spec`i set alanlarının hepsini DENETLEMİYOR: aynı gün atıf (1, 0)
 * ve konutlu şehir yarıçapı (#2909052) provada "geçti", kurulumda RET aldı.
 * Ölçülen yol: duraklatılmış, SETSİZ, `adv-prova` etiketli bir kampanya
 * aç, seti ona karşı `validate_only` ile sor, kampanyayı SİL. Bu yol aynı
 * iki reddi yakaladı ve gerçek gövdeyi geçirdi. Setsiz kampanya teslimat
 * yapamaz, para harcamaz. Silme düşerse sonuç değişmez ama ekranda söylenir:
 * Reklam Yöneticisi'nde "silinecek" adlı boş bir kampanya kalmış olur.
 */
const GECICI_KAMPANYA_ADI = '[Advetics prova] silinecek';

export async function setiGeciciKampanyaylaDogrula(
  port: Pick<MetaYazmaPortu, 'olustur' | 'dogrula' | 'durumYaz' | 'etiketleAra'>,
  hesap: string,
  govdeler: ReadonlyArray<{ ad: string; alanlar: Record<string, unknown> }>,
): Promise<GovdeSonucu> {
  const kampanya = govdeler.find((g) => g.ad === 'kampanya')?.alanlar;
  const set = govdeler.find((g) => g.ad === 'reklam_seti')?.alanlar;
  if (!kampanya || !set) return { ad: 'reklam_seti', sonuc: 'dogrulanamadi', mesaj: 'Kampanya ya da reklam seti gövdesi yok' };
  let geciciId: string;
  try {
    geciciId = (await port.olustur(hesap, 'campaigns', { ...kampanya, name: GECICI_KAMPANYA_ADI, status: 'PAUSED', adlabels: [{ name: 'adv-prova' }] })).id;
  } catch (e) {
    if (e instanceof MetaKesinHata) return { ad: 'reklam_seti', sonuc: 'dogrulanamadi', mesaj: `Prova kampanyası açılamadı: ${e.message}` };
    /*
     * BELİRSİZ AÇILIŞ (zaman aşımı, 5xx): Meta kampanyayı açmış olabilir
     * (Ajan 4, Dalga 3 F3a). "Açılamadı" demek yalan olurdu ve boş kampanya
     * sessizce kalırdı. Etiketle aranır, bulunan prova kampanyaları silinir;
     * silinemeyen ya da aranamayan durum ekranda söylenir.
     */
    const mesaj = `Prova kampanyası açılıp açılmadığı bilinmiyor (${(e as Error).message})`;
    try {
      const bulunan = (await port.etiketleAra(hesap, 'campaigns', 'adv-prova')).filter((k) => k.name === GECICI_KAMPANYA_ADI);
      const kalan: string[] = [];
      for (const k of bulunan) await port.durumYaz(k.id, { status: 'DELETED' }).catch(() => kalan.push(k.id));
      return {
        ad: 'reklam_seti',
        sonuc: 'dogrulanamadi',
        mesaj,
        ...(kalan.length ? { not: `Prova için açılan boş kampanya (${kalan.join(', ')}) silinemedi; Reklam Yöneticisi'nden silinebilir.` } : {}),
      };
    } catch {
      return { ad: 'reklam_seti', sonuc: 'dogrulanamadi', mesaj, not: `Meta'da "${GECICI_KAMPANYA_ADI}" adlı boş bir kampanya kalmış olabilir; Reklam Yöneticisi'nden silinebilir.` };
    }
  }
  let sonuc: GovdeSonucu;
  try {
    const { adlabels: _a, ...alanlar } = set;
    await port.dogrula(hesap, 'adsets', { ...alanlar, campaign_id: geciciId, execution_options: ['validate_only'] });
    sonuc = { ad: 'reklam_seti', sonuc: 'gecti' };
  } catch (e) {
    if (e instanceof MetaKesinHata) sonuc = { ad: 'reklam_seti', sonuc: 'reddedildi', mesaj: e.message, kod: e.kod, altKod: e.altKod };
    else sonuc = { ad: 'reklam_seti', sonuc: 'dogrulanamadi', mesaj: e instanceof Error ? e.message : String(e) };
  }
  try {
    await port.durumYaz(geciciId, { status: 'DELETED' });
  } catch (e) {
    sonuc = { ...sonuc, not: `Prova için açılan boş kampanya (${geciciId}) silinemedi; Reklam Yöneticisi'nden silinebilir. ${(e as Error).message}` };
  }
  return sonuc;
}

export async function provaKos(
  tx: TxRunner,
  provaId: string,
  port: MetaYazmaPortu,
  hesap: string,
  yazmaKapisi: () => Promise<{ acik: true } | { acik: false; sebep: string }>,
  b: { apiSurumu: MetaApiSurumu; simdi: Date },
  bekle: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<ProvaSonucu> {
  const [p] = await tx((x) =>
    x.$queryRaw<Array<{ id: string; org_id: string; client_id: string; taslak_id: string; taslak_surum_no: number; ad_account_id: string; durum: string }>>(Prisma.sql`
      SELECT id::text, org_id::text, client_id::text, taslak_id::text, taslak_surum_no, ad_account_id::text, durum
        FROM prova WHERE id = ${provaId}::uuid`),
  );
  if (!p) throw new Error(`Prova bulunamadı: ${provaId}`);
  if (p.durum !== 'bekliyor') return { tur: 'bitti', durum: p.durum as 'gecti' };

  const [say] = await tx((x) =>
    x.$queryRaw<Array<{ n: number }>>(Prisma.sql`
      SELECT count(*)::int AS n FROM prova
       WHERE ad_account_id = ${p.ad_account_id}::uuid AND durum <> 'bekliyor'
         AND bitti_at > ${new Date(b.simdi.getTime() - PROVA_KOTASI.pencereMs)}`),
  );
  if ((say?.n ?? 0) >= PROVA_KOTASI.adet) return { tur: 'ertele', sebep: 'Meta kontrolü bekletildi; birkaç dakika sonra.' };

  const bitir = async (durum: GovdeSonucu['sonuc'], sonuclar: GovdeSonucu[], sebep: string | null) => {
    await tx((x) =>
      x.$queryRaw(Prisma.sql`
        UPDATE prova SET durum = ${durum}, sonuclar = ${JSON.stringify(sonuclar)}::jsonb, sebep = ${sebep}, bitti_at = now()
         WHERE id = ${provaId}::uuid AND durum = 'bekliyor' RETURNING id`),
    );
    if (durum === 'gecti') {
      // Taslak "hazır" ancak prova AYNI sürüme aitse ve başka eksik yoksa.
      await tx((x) =>
        x.$queryRaw(Prisma.sql`
          UPDATE reklam_taslagi t SET durum = 'hazir', updated_at = now()
            FROM taslak_surumu s
           WHERE t.id = ${p.taslak_id}::uuid AND t.durum = 'taslak' AND t.aktif_surum_no = ${p.taslak_surum_no}
             AND s.taslak_id = t.id AND s.surum_no = t.aktif_surum_no
             AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.eksikler) e WHERE e->>'kod' <> 'OK-17')
          RETURNING t.id`),
      );
    }
    return { tur: 'bitti' as const, durum };
  };

  const [s] = await tx((x) =>
    x.$queryRaw<Array<{ alanlar: unknown }>>(Prisma.sql`
      SELECT alanlar FROM taslak_surumu WHERE taslak_id = ${p.taslak_id}::uuid AND surum_no = ${p.taslak_surum_no}`),
  );
  if (!s) return bitir('dogrulanamadi', [], 'Taslak sürümü bulunamadı');
  const d = await taslakDerle(tx, { id: p.taslak_id, org_id: p.org_id, client_id: p.client_id }, taslakAlanlariSchema.parse(s.alanlar), provaId, b);
  // Yerelde reddedildi: Meta'ya hiç gidilmedi.
  if (d.tur === 'ret') return bitir('reddedildi', [], d.retler.map((r) => r.mesaj).join(' '));

  const kapi = await yazmaKapisi();
  if (!kapi.acik) return bitir('dogrulanamadi', [], kapi.sebep);

  const hashler = new Map<string, string>();
  for (const v of d.medya) {
    try {
      hashler.set(v, await port.gorselYukle(hesap, v));
    } catch (e) {
      if (e instanceof MetaKesinHata) return bitir('reddedildi', [{ ad: `medya:${v}`, sonuc: 'reddedildi', mesaj: e.message, kod: e.kod }], `Görsel kabul edilmedi: ${e.message}`);
      return bitir('dogrulanamadi', [], `Görsel yüklenemedi: ${(e as Error).message}`);
    }
  }

  // Video: yükle ve Meta işlesin; işlenmemiş videoyla prova anlamsız.
  for (const v of d.videolar) {
    try {
      const id = await port.videoYukle(hesap, v);
      for (let i = 0; ; i++) {
        const durum = await port.videoDurumu(id);
        if (durum === 'hazir') break;
        if (durum === 'suresi_doldu') return bitir('dogrulanamadi', [], 'Videonun Meta’daki kopyasının süresi doldu; yeniden kontrol et (video yeniden yüklenir).');
        if (durum === 'hata') return bitir('reddedildi', [{ ad: `video:${v}`, sonuc: 'reddedildi', mesaj: 'Meta videoyu işleyemedi' }], 'Meta videoyu işleyemedi; başka bir video dene.');
        if (i >= PROVA_VIDEO_DENEME) return bitir('dogrulanamadi', [], 'Meta videoyu henüz işlemedi; birkaç dakika sonra yeniden kontrol et.');
        await bekle(10_000);
      }
      hashler.set(`video:${v}`, id);
    } catch (e) {
      if (e instanceof MetaKesinHata) return bitir('reddedildi', [{ ad: `video:${v}`, sonuc: 'reddedildi', mesaj: e.message, kod: e.kod }], `Video kabul edilmedi: ${e.message}`);
      return bitir('dogrulanamadi', [], `Video yüklenemedi: ${(e as Error).message}`);
    }
  }

  let sonuclar: GovdeSonucu[] = [];
  for (const g of provaGovdeleri(d.derleme.govdeler, hashler)) {
    try {
      await port.dogrula(hesap, g.uc, g.alanlar);
      // Gövdenin kapsama notu (özel kategori) geçen parçaya iliştirilir:
      // "geçti" Meta'nın neyi sınayamadığını söylemeden gösterilmemeli.
      sonuclar.push({ ad: g.ad, sonuc: 'gecti', ...(g.not ? { not: g.not } : {}) });
    } catch (e) {
      if (e instanceof YazmaDurduruldu) return bitir('dogrulanamadi', sonuclar, e.message);
      if (e instanceof MetaKesinHata) sonuclar.push({ ad: g.ad, sonuc: 'reddedildi', mesaj: e.message, kod: e.kod, altKod: e.altKod });
      else sonuclar.push({ ad: g.ad, sonuc: 'dogrulanamadi', mesaj: e instanceof MetaBelirsizHata ? e.message : String(e) });
    }
  }
  // Satır içi set provası belirsizse (bilinen 5xx) set GERÇEK bir geçici
  // kampanyaya karşı yeniden sorulur; kapsama kuralı yalnız bu da belirsiz
  // kalırsa devreye girer.
  const i = sonuclar.findIndex((x) => x.ad === 'reklam_seti' && x.sonuc === 'dogrulanamadi');
  if (i !== -1) {
    // Yazma şalteri YENİDEN: ilk kontrolden bu yana görsel yüklemesi ve en
    // çok 3 dakikalık video beklemesi geçmiş olabilir; geçici kampanya bir
    // yazma ve kapalı şalteri delmemeli (Ajan 4, Dalga 3 F3b).
    const kapi2 = await yazmaKapisi();
    sonuclar[i] = kapi2.acik ? await setiGeciciKampanyaylaDogrula(port, hesap, d.derleme.govdeler) : { ...sonuclar[i]!, mesaj: kapi2.sebep };
  }
  sonuclar = kapsamaUygula(sonuclar);
  // Sızıntı notu sonuçtan BAĞIMSIZ söylenir: ekran notları yalnız "geçti"de
  // gösteriyor, reddedilen provada boş kampanya sessizce kalırdı (F2).
  const sizinti = sonuclar.map((x) => x.not).find((n) => n?.includes('silinemedi') || n?.includes('kalmış olabilir'));
  const ek = (s: string) => (sizinti ? `${s} · ${sizinti}` : s);
  const red = sonuclar.filter((x) => x.sonuc === 'reddedildi');
  // Aynı mesaj her kavramda tekrar ediyor (bir kreatif hatası bütün
  // fikirlerde aynı): özet satırında bir kez yazılır, parça listesi ayrıntıyı taşır.
  const mesajlar = [...new Set(red.map((r) => r.mesaj))];
  if (red.length > 0) return bitir('reddedildi', sonuclar, ek(`Meta ${red.length} parçayı kabul etmedi: ${mesajlar.join(' · ')}`));
  if (sonuclar.some((x) => x.sonuc === 'dogrulanamadi')) return bitir('dogrulanamadi', sonuclar, ek('Meta’nın kontrolü bir parçada tamamlanamadı'));
  return bitir('gecti', sonuclar, null);
}
