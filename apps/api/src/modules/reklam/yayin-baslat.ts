import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  DERLEYICI_SURUMU,
  PROVA_TAZELIK_MS,
  OZEL_KATEGORILER,
  beklenenYankilar,
  derleMeta,
  taslakEksikleri,
  taslakKanonikIcerik,
  taslakAlanlariSchema,
  type AtifStandardi,
  type MetaApiSurumu,
  type OzelKategori,
  type TenantContext,
} from '@advetics/shared';
import type { TxRunner } from './yayin-motoru';
import { yayinKaydiOlustur } from './yayin-motoru';
import { metaYazmaAcikMi } from './yazma-kapisi';

/**
 * `yayinBaslat` — Yayınla'nın TEK sunucu yolu (TASARIM.md § 11.1-11.2).
 *
 * Sıra ucuzdan pahalıya ve SIFIR ÇAĞRILIDAN Meta çağrılıya: burada geçmeyen
 * bir istek Meta kotasından tek puan yemez. Bu dosya platform çağrısı
 * YAPMIYOR; Meta'ya giden her şey kuyruktaki motorda.
 *
 * PROVA YOK, O YÜZDEN YALNIZ TEST KİPİ. Tasarım "hazır" için Meta provası
 * istiyor (OK-17) ve prova henüz yazılmadı. Prova olmadan açılan bir reklam
 * gerçek para harcar; test kipi ise kurar, geri okur ve AÇMADAN arşivler —
 * canlı turun kendisi. Test kipi yalnız ajansın KENDİ şirketinde: müşteri
 * hesabında deneme kampanyası kurup arşivlemek müşterinin Ads Manager'ını
 * kirletir.
 */

export interface YayinIstegi {
  taslakId: string;
  /** Kullanıcının baktığı sürüm: aradan değiştiyse yayın başlamaz. */
  surumNo: number;
  icerikOzeti: string;
  testKipi: boolean;
  /**
   * Yayının nereden geldiği: panel düğmesi ya da AdvCampaign onay kartı.
   * "Bu kampanyayı kim nereden kurdu" sorusunun cevabı; verilmezse panel.
   */
  kaynak?: 'panel' | 'ai_kart';
}

export type YayinBaslatSonucu =
  | { tur: 'basladi'; yayinId: string }
  | { tur: 'ret'; retler: Array<{ kod: string; mesaj: string }> };

interface Baglam {
  apiSurumu: MetaApiSurumu;
  /** Saat diliminden ofset; test zamanı sabitlemek için dışarıdan. */
  simdi: Date;
}

export async function yayinBaslat(
  tx: TxRunner,
  ctx: TenantContext,
  istek: YayinIstegi,
  b: Baglam,
): Promise<YayinBaslatSonucu> {
  const retler: Array<{ kod: string; mesaj: string }> = [];
  const ret = (kod: string, mesaj: string) => ({ tur: 'ret' as const, retler: [...retler, { kod, mesaj }] });

  // --- Taslak ve sürüm eşleşmesi --------------------------------------------
  const [t] = await tx((x) =>
    x.$queryRaw<Array<{ id: string; org_id: string; client_id: string; durum: string; aktif_surum_no: number; ad_account_id: string | null }>>(Prisma.sql`
      SELECT id::text, org_id::text, client_id::text, durum, aktif_surum_no, ad_account_id::text
        FROM reklam_taslagi WHERE id = ${istek.taslakId}::uuid`),
  );
  if (!t) return ret('TASLAK', 'Taslak bulunamadı.');
  if (!ctx.clientIds.includes(t.client_id)) return ret('YETKI', 'Bu workspace’e erişimin yok.');
  if (t.durum !== 'taslak' && t.durum !== 'hazir') return ret('DURUM', 'Bu taslağın zaten süren bir yayını var.');
  const [s] = await tx((x) =>
    x.$queryRaw<Array<{ alanlar: unknown; icerik_ozeti: string }>>(Prisma.sql`
      SELECT alanlar, icerik_ozeti FROM taslak_surumu WHERE taslak_id = ${t.id}::uuid AND surum_no = ${t.aktif_surum_no}`),
  );
  if (!s || t.aktif_surum_no !== istek.surumNo || s.icerik_ozeti !== istek.icerikOzeti) {
    return ret('SURUM', 'Sen bakarken plan değişti; sayfayı yenileyip yeniden gözden geçir.');
  }
  const alanlar = taslakAlanlariSchema.parse(s.alanlar);
  // Özet yeniden hesaplanıyor: saklanan özet ile içerik ayrışmışsa yayın yok.
  if (createHash('sha256').update(taslakKanonikIcerik(alanlar)).digest('hex') !== s.icerik_ozeti) {
    return ret('SURUM', 'Taslak sürümü bozuk görünüyor; yeniden kaydet.');
  }

  // --- Eksikler (TAZE: yasal uyarı profilden yeniden okunuyor) -------------
  const [profil] = await tx((x) =>
    x.$queryRaw<Array<{ yasal_uyari: string | null }>>(Prisma.sql`
      SELECT yasal_uyari FROM client_profiles WHERE client_id = ${t.client_id}::uuid`),
  );
  for (const e of taslakEksikleri(alanlar, { yasalUyari: profil?.yasal_uyari ?? null })) retler.push({ kod: e.kod, mesaj: e.metin });

  // --- Gerçek yayın: taze prova + uyum; test kipi: yalnız ajans ------------
  if (!istek.testKipi) {
    const p = await provaDurumu(tx, t.id, t.aktif_surum_no, s.icerik_ozeti, b.apiSurumu, b.simdi);
    if (p.tur !== 'gecti') retler.push({ kod: 'OK-17', mesaj: p.metin });
    // Uyum son kapısı ve değişmez uyum raporu (§ 11.2 adım 5-6) yazılmadan
    // gerçek yayın YOK: raporu olmayan yayın, kanıtsız ama kurulmuş bir
    // reklam bırakır ve bunu sonradan düzeltmenin yolu yok.
    retler.push({ kod: 'UYUM', mesaj: 'Uyum denetçisi henüz bağlı değil; gerçek yayın kapalı, test kipi açık.' });
  } else {
    if (!ctx.isOrgAdmin) retler.push({ kod: 'TEST-KIPI', mesaj: 'Test kipini yalnız ajans yöneticisi kullanabilir.' });
    const [o] = await tx((x) =>
      x.$queryRaw<Array<{ ajans_mi: boolean }>>(Prisma.sql`
        SELECT (ma.ajans_org_id IS NULL OR ma.ajans_org_id = o.id) AS ajans_mi
          FROM organizations o LEFT JOIN manager_accounts ma ON ma.id = o.manager_account_id
         WHERE o.id = ${t.org_id}::uuid`),
    );
    if (!o?.ajans_mi) retler.push({ kod: 'TEST-KIPI', mesaj: 'Test kipi yalnız ajansın kendi şirketindeki hesaplarda açılır.' });
  }

  const d = await taslakDerle(tx, t, alanlar, randomUUID(), b);
  if (d.tur === 'ret') retler.push(...d.retler);
  if (retler.length > 0 || d.tur === 'ret') return { tur: 'ret', retler };
  const yayinId = d.kimlik;
  const { derleme, hesapId, atif, medya, videolar } = d;

  // --- Kayıt: yayın + nesneler, taslak "yayında" ---------------------------
  await yayinKaydiOlustur(tx, {
    id: yayinId,
    orgId: t.org_id,
    clientId: t.client_id,
    taslakId: t.id,
    taslakSurumNo: t.aktif_surum_no,
    icerikOzeti: s.icerik_ozeti,
    adAccountId: hesapId,
    govdeler: derleme.govdeler,
    yankilar: beklenenYankilar(derleme.govdeler),
    apiSurumu: b.apiSurumu,
    derleyiciSurumu: DERLEYICI_SURUMU,
    atifStandardi: atif,
    medyaVarliklari: medya,
    videoVarliklari: videolar,
    kaynak: istek.kaynak ?? 'panel',
    baslatanId: ctx.userId,
    testKipi: istek.testKipi,
  });
  await tx((x) =>
    x.$queryRaw(Prisma.sql`UPDATE reklam_taslagi SET durum = 'yayinda', updated_at = now() WHERE id = ${t.id}::uuid RETURNING id`),
  );
  return { tur: 'basladi', yayinId };
}

export interface TaslakSatiri {
  id: string;
  org_id: string;
  client_id: string;
}

export type TaslakDerlemesi =
  | {
      tur: 'govde';
      kimlik: string;
      derleme: Extract<ReturnType<typeof derleMeta>, { tur: 'govde' }>;
      hesapId: string;
      atif: AtifStandardi;
      medya: string[];
      videolar: string[];
    }
  | { tur: 'ret'; retler: Array<{ kod: string; mesaj: string }> };

/**
 * Taslaktan derleyici girdisini kurar ve derler — YAYIN VE PROVA AYNI
 * YOLDAN. İkinci bir derleme yolu, ekranda geçen prova ile Meta'ya giden
 * gövdenin ayrışması demekti. Platform çağrısı yok.
 *
 * `kimlik` derleyicinin `adv-yayin-<kimlik>` etiketine giriyor: yayında yayın
 * kimliği, provada prova kimliği.
 */
export async function taslakDerle(
  tx: TxRunner,
  t: TaslakSatiri,
  alanlar: ReturnType<typeof taslakAlanlariSchema.parse>,
  kimlik: string,
  b: Baglam,
): Promise<TaslakDerlemesi> {
  const retler: Array<{ kod: string; mesaj: string }> = [];
  // --- OK-15 kesici ve OK-16 atıf ------------------------------------------
  const kapi = await metaYazmaAcikMi(tx, t.client_id);
  if (!kapi.acik) retler.push({ kod: 'OK-15', mesaj: kapi.sebep });
  const [a] = await tx((x) =>
    x.$queryRaw<Array<{ atif: AtifStandardi | null }>>(Prisma.sql`
      SELECT a.atif_standardi AS atif FROM ajans_ayari a
        JOIN clients c ON c.id = ${t.client_id}::uuid
        JOIN organizations o ON o.id = c.org_id
        LEFT JOIN manager_accounts ma ON ma.id = o.manager_account_id
       WHERE a.atif_standardi IS NOT NULL AND (a.org_id = c.org_id OR a.org_id = ma.ajans_org_id)
       ORDER BY (a.org_id = c.org_id) DESC LIMIT 1`),
  );
  if (!a?.atif) retler.push({ kod: 'OK-16', mesaj: 'Atıf standardı henüz seçilmedi. Ajans yöneticisi seçene kadar yeni reklam yayınlanamaz.' });

  // --- Hesap, sayfa, IG, kategori: derleyicinin girdileri -------------------
  const hesapId = alanlar.reklamHesabiId?.deger;
  const [h] = hesapId
    ? await tx((x) =>
        x.$queryRaw<Array<{ external_id: string; currency: string; timezone: string }>>(Prisma.sql`
          SELECT external_id, currency, timezone FROM ad_accounts
           WHERE id = ${hesapId}::uuid AND client_id = ${t.client_id}::uuid AND platform = 'meta'`),
      )
    : [];
  if (hesapId && !h) retler.push({ kod: 'OK-01', mesaj: 'Bu reklam hesabı artık bu workspace’e atanmış değil.' });
  const sayfaId = alanlar.sayfaId?.deger;
  const [sayfa] = sayfaId
    ? await tx((x) =>
        x.$queryRaw<Array<{ external_id: string }>>(Prisma.sql`
          SELECT external_id FROM social_profiles WHERE id = ${sayfaId}::uuid AND client_id = ${t.client_id}::uuid AND profile_type = 'facebook_page'`),
      )
    : [];
  const igId = alanlar.instagramId?.deger ?? null;
  const [ig] = igId
    ? await tx((x) =>
        x.$queryRaw<Array<{ external_id: string }>>(Prisma.sql`
          SELECT external_id FROM social_profiles WHERE id = ${igId}::uuid AND client_id = ${t.client_id}::uuid AND profile_type = 'instagram_business'`),
      )
    : [];
  const [musteri] = await tx((x) =>
    x.$queryRaw<Array<{ ad: string; kategoriler: string[] }>>(Prisma.sql`
      SELECT name AS ad, special_ad_categories AS kategoriler FROM clients WHERE id = ${t.client_id}::uuid`),
  );
  const taban: OzelKategori[] = [];
  for (const k of musteri?.kategoriler ?? []) {
    const c = k === 'CREDIT' ? 'FINANCIAL_PRODUCTS_SERVICES' : k;
    if ((OZEL_KATEGORILER as readonly string[]).includes(c)) taban.push(c as OzelKategori);
    // Tanınmayan taban DÜŞÜRÜLMEZ: neyin kısıtlanacağını bilmeden yayın yok.
    else retler.push({ kod: 'OZK-TABAN', mesaj: `Workspace kaydında tanınmayan reklam kategorisi: ${k}` });
  }

  if (retler.length > 0 || !h || !sayfa) {
    return { tur: 'ret', retler: retler.length ? retler : [{ kod: 'SAYFA', mesaj: 'Sayfa bu workspace’te değil.' }] };
  }

  // --- Derleme ---------------------------------------------------------------
  const yayinId = kimlik;
  const kavramlar = alanlar.kavramlar!.deger;
  // VARLIK TÜRLERİ veritabanından: görsel yerine video ya da kapak yerine
  // video gelirse Meta ya reddeder ya da kapaksız reklam kurar.
  const kimlikler = [...new Set(kavramlar.flatMap((k) => (k.kapakVarlikId ? [k.varlikId, k.kapakVarlikId] : [k.varlikId])))];
  const turler = new Map(
    (
      await tx((x) =>
        x.$queryRaw<Array<{ id: string; kind: string }>>(Prisma.sql`
          SELECT id::text, kind FROM assets WHERE client_id = ${t.client_id}::uuid AND id = ANY(${kimlikler}::uuid[])`),
      )
    ).map((r) => [r.id, r.kind]),
  );
  for (const [i, k] of kavramlar.entries()) {
    const tur = turler.get(k.varlikId);
    if (!tur) retler.push({ kod: 'KRT-GORSEL', mesaj: `Fikir ${i + 1}: medya bu workspace’in arşivinde değil.` });
    else if (k.kapakVarlikId && tur !== 'video') retler.push({ kod: 'KRT-VIDEO', mesaj: `Fikir ${i + 1}: kapak verilmiş ama medya video değil.` });
    else if (!k.kapakVarlikId && tur === 'video') retler.push({ kod: 'KRT-VIDEO', mesaj: `Fikir ${i + 1}: video için kapak görseli gerekli.` });
    if (k.kapakVarlikId && turler.get(k.kapakVarlikId) !== 'image') retler.push({ kod: 'KRT-VIDEO', mesaj: `Fikir ${i + 1}: kapak bir görsel olmalı.` });
  }
  if (retler.length > 0) return { tur: 'ret', retler };
  const takvim = alanlar.takvim!.deger;
  const derleme = derleMeta({
    apiSurumu: b.apiSurumu,
    yayinKimligi: yayinId,
    tarih: yerelTarih(b.simdi, h.timezone),
    workspaceKisaAdi: (musteri?.ad ?? 'Workspace').slice(0, 40),
    niyet: alanlar.niyet!.deger,
    hesap: { platformId: h.external_id.startsWith('act_') ? h.external_id : `act_${h.external_id}`, paraBirimi: h.currency },
    sayfaPlatformId: sayfa.external_id,
    instagramPlatformId: ig?.external_id ?? null,
    hedefleme: {
      konumlar: alanlar.konumlar!.deger,
      enDusukYas: alanlar.enDusukYas?.deger ?? 18,
      ipucuYas: alanlar.ipucuYas?.deger ?? null,
      ipucuCinsiyet: alanlar.ipucuCinsiyet?.deger ?? null,
    },
    kategoriler: { taban, ek: alanlar.ekKategoriler?.deger ?? [] },
    butce: { tip: alanlar.butce!.deger.tip, micros: BigInt(alanlar.butce!.deger.micros), seviye: 'kampanya' },
    takvim: {
      baslangic: zamanDamgasi(takvim.baslangic, '00:00:00', h.timezone),
      bitis: takvim.bitis ? zamanDamgasi(takvim.bitis, '23:59:00', h.timezone) : null,
    },
    atif: a!.atif,
    // Görsel hash'i yayın sırasında yüklenip yerine konur.
    kavramlar: kavramlar.map((k) =>
      k.kapakVarlikId
        ? { gorselHash: `{medya:${k.kapakVarlikId}}`, videoId: `{video:${k.varlikId}}`, baslik: k.baslik, metin: k.metin, aciklama: k.aciklama }
        : { gorselHash: `{medya:${k.varlikId}}`, baslik: k.baslik, metin: k.metin, aciklama: k.aciklama },
    ),
    hedefAdres: alanlar.hedefAdres?.deger ?? null,
    formId: null,
    urlEtiketleri: null,
  });
  if (derleme.tur === 'ret') return { tur: 'ret', retler: derleme.retler };

  return {
    tur: 'govde',
    kimlik,
    derleme,
    hesapId: hesapId!,
    atif: a!.atif as AtifStandardi,
    medya: [...new Set(kavramlar.map((k) => k.kapakVarlikId ?? k.varlikId))],
    videolar: [...new Set(kavramlar.filter((k) => k.kapakVarlikId).map((k) => k.varlikId))],
  };
}

/** Hesabın saat diliminde `YYYY-MM-DD` (adlardaki tarih). */
export function yerelTarih(an: Date, saatDilimi: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: saatDilimi, year: 'numeric', month: '2-digit', day: '2-digit' }).format(an);
}

/**
 * `2026-10-08` + `00:00:00` + `Europe/Istanbul` → `2026-10-08T00:00:00+0300`.
 * Ofset O GÜNÜN ofseti (yaz saati): sabit +03:00 yazmak Avrupa saatli bir
 * hesapta başlangıcı bir saat kaydırırdı. Meta saat dilimsiz zamanı hesabın
 * değil sunucunun dilimiyle yorumlayabilir; ofset her zaman açık.
 */
export function zamanDamgasi(tarih: string, saat: string, saatDilimi: string): string {
  const [y, a, g] = tarih.split('-').map(Number) as [number, number, number];
  const parcalar = new Intl.DateTimeFormat('en-US', { timeZone: saatDilimi, timeZoneName: 'longOffset' }).formatToParts(
    new Date(Date.UTC(y, a - 1, g, 12)),
  );
  const ad = parcalar.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(ad);
  const ofset = m ? `${m[1]}${m[2]}${m[3] ?? '00'}` : '+0000';
  return `${tarih}T${saat}${ofset}`;
}

export type ProvaDurumu =
  | { tur: 'yok' | 'bekliyor' | 'reddedildi' | 'dogrulanamadi' | 'bayat'; metin: string }
  | { tur: 'gecti'; metin: string };

/**
 * Bu sürümün prova durumu. Dört bağdan biri (sürüm, içerik özeti, API
 * sürümü, derleyici sürümü) değişince eski prova SAYILMAZ; 30 dakikadan eski
 * "geçti" bayat. Panelin çipi ve yayın kapısı aynı fonksiyonu okuyor.
 */
export async function provaDurumu(
  tx: TxRunner,
  taslakId: string,
  surumNo: number,
  ozet: string,
  apiSurumu: string,
  simdi: Date,
): Promise<ProvaDurumu> {
  const [p] = await tx((x) =>
    x.$queryRaw<Array<{ durum: string; bitti_at: Date | null; sebep: string | null }>>(Prisma.sql`
      SELECT durum, bitti_at, sebep FROM prova
       WHERE taslak_id = ${taslakId}::uuid AND taslak_surum_no = ${surumNo} AND icerik_ozeti = ${ozet}
         AND api_surumu = ${apiSurumu} AND derleyici_surumu = ${DERLEYICI_SURUMU}
       ORDER BY created_at DESC LIMIT 1`),
  );
  if (!p) return { tur: 'yok', metin: 'Meta’nın ön kontrolü bu hâl için yapılmadı.' };
  if (p.durum === 'bekliyor') return { tur: 'bekliyor', metin: 'Meta’ya soruluyor…' };
  if (p.durum === 'reddedildi') return { tur: 'reddedildi', metin: p.sebep ?? 'Meta bir alanı kabul etmedi.' };
  if (p.durum === 'dogrulanamadi') return { tur: 'dogrulanamadi', metin: `Meta’nın kontrolü tamamlanamadı: ${p.sebep ?? ''}`.trim() };
  if (!p.bitti_at || simdi.getTime() - new Date(p.bitti_at).getTime() > PROVA_TAZELIK_MS) {
    return { tur: 'bayat', metin: 'Meta’nın ön kontrolü 30 dakikadan eski; yeniden yapılacak.' };
  }
  return { tur: 'gecti', metin: 'Meta’nın ön kontrolü geçti, asıl inceleme yayından sonra.' };
}
