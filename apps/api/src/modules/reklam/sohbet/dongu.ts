import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  ADV_SOHBET_SINIRLARI,
  durumKelimesiVar,
  kotaDurumu,
  siradakiSoru,
  istanbulYarin,
  kanonikJson,
  type AracAdi,
  type HedefKonum,
  type MesajDurumu,
  type SohbetOlayi,
  type SorulabilirAlan,
  type TenantContext,
} from '@advetics/shared';
import type { TxRunner } from '../yayin-motoru';
import type { AracCalistirici, OturumDurumu } from './araclar';
import { aracTanimlari } from './araclar';
import { SOHBET_SISTEM_ISTEMI } from './istem';

/**
 * ADVCAMPAIGN SOHBET DÖNGÜSÜ (TASARIM-PLAN § 4.3, İP-13).
 *
 * Bir kullanıcı mesajı = bir TUR. Tur sunucuda bir araç döngüsü: model
 * araç ister, sunucu çalıştırır, sonucu geri verir; model bitirene ya da
 * sınır dolana kadar. Kullanıcı yalnız olayları görür (araç izi, metin,
 * soru, kart).
 *
 * Sınırlar SIFIR MALİYETLE önce kontrol ediliyor: kota dolmuşsa model hiç
 * çağrılmıyor. Tur başına en çok sekiz araç adımı; aynı araç aynı girdiyle
 * ikinci kez çağrılırsa ÇALIŞTIRILMAZ (döngüye giren model kotayı ve
 * Meta'nın prova hakkını yiyordu).
 *
 * KAYIT: kullanıcı mesajı bir satır; asistanın bütün turu (asistan + araç
 * sonucu mesajları) TEK satırda, tur sürerken "akista", bitince kapanıyor.
 * İstemci koparsa tur yine BİTİRİLİYOR ve satır kapanıyor: "akista" kalan
 * bir satır, ekranda sonsuza kadar "yazıyor" demekti.
 */

export type AnthropicMesaji = { role: 'user' | 'assistant'; content: Array<Record<string, unknown>> };

export interface ModelAdimSonucu {
  content: Array<Record<string, unknown>>;
  stop_reason: string | null;
  girdiToken: number;
  ciktiToken: number;
  onbellekToken: number;
}

export type ModelAdimi = (g: {
  sistem: string;
  araclar: ReturnType<typeof aracTanimlari>;
  mesajlar: AnthropicMesaji[];
  enCokCikti: number;
  metinParcasi: (p: string) => void;
}) => Promise<ModelAdimSonucu>;

export type MedyaGorseli = (clientId: string, varlikId: string) => Promise<{ mime: 'image/jpeg' | 'image/png'; base64: string } | null>;

export interface DonguBagimliliklari {
  tx: TxRunner;
  calistirici: AracCalistirici;
  model: ModelAdimi;
  medyaGorseli: MedyaGorseli;
  /** Hesabın saat dilimi; taslak tarihleri onun "bugün"ü. */
  saatDilimi: (ctx: TenantContext, clientId: string) => Promise<string>;
  /** Durum düzeltmesi için taslağın gerçek durumu. */
  gercekDurum: (ctx: TenantContext, taslakId: string | null) => Promise<string>;
  simdi?: () => Date;
}

export interface TurGirdisi {
  metin: string;
  medyalar: Array<{ varlikId: string; kapakVarlikId?: string }>;
}

interface OturumSatiri {
  id: string;
  client_id: string;
  org_id: string;
  user_id: string;
  taslak_id: string | null;
  durum: string;
  sorulanlar: SorulabilirAlan[];
}

interface MesajSatiri {
  id: string;
  sira: number;
  rol: 'kullanici' | 'asistan' | 'arac_sonucu';
  icerik: unknown;
  olaylar: SohbetOlayi[];
  durum: MesajDurumu;
}

export class SohbetHatasi extends Error {
  constructor(
    readonly kod: 'YOK' | 'SAHIP_DEGIL' | 'KAPALI' | 'MEDYA',
    mesaj: string,
  ) {
    super(mesaj);
  }
}

export class SohbetDongusu {
  constructor(private readonly d: DonguBagimliliklari) {}

  private simdi(): Date {
    return this.d.simdi ? this.d.simdi() : new Date();
  }

  /**
   * Turu çalıştırır, olayları sırayla verir. Çağıran (SSE ucu) istemci
   * koptuğunda okumayı BIRAKMAMALI: jeneratör sonuna kadar tüketilmezse tur
   * yarıda kalır ve satır "akista" kalır.
   */
  async *tur(ctx: TenantContext, oturumId: string, g: TurGirdisi): AsyncGenerator<SohbetOlayi> {
    const o = await this.oturum(oturumId);
    if (!ctx.clientIds.includes(o.client_id)) throw new SohbetHatasi('YOK', 'Oturum bulunamadı');
    // Başkasının sohbetine onun adına yazılmaz (RLS de aynı şeyi söylüyor).
    if (o.user_id !== ctx.userId) throw new SohbetHatasi('SAHIP_DEGIL', 'Bu oturum başka bir kullanıcının; kendi oturumunu aç.');
    if (o.durum !== 'acik') throw new SohbetHatasi('KAPALI', 'Bu oturum kapalı; yeni oturum aç.');
    await this.medyaDogrula(o, g.medyalar);

    const gecmis = await this.mesajlar(oturumId);
    // --- Kota: model çağrılmadan ÖNCE ---------------------------------------
    const kota = kotaDurumu(await this.kullanim(o, gecmis.length), this.simdi());
    if (kota.tur === 'doldu') {
      yield { tur: 'hata', hata: 'kota', mesaj: kotaMesaji(kota.sebep, kota.yenilenme) };
      return;
    }

    const metin = g.metin.normalize('NFC').trim();
    const sira = (gecmis.at(-1)?.sira ?? 0) + 1;
    const medyaSatiri = g.medyalar.length
      ? `\n\n[Bırakılan medya: ${g.medyalar.map((m, i) => `${i + 1}. ${m.kapakVarlikId ? 'video' : 'görsel'}`).join(', ')}]`
      : '';
    await this.yaz(o, sira, 'kullanici', [{ type: 'text', text: (metin || '(yalnız medya bıraktı)') + medyaSatiri }], [
      { tur: 'medya', medyalar: g.medyalar } as unknown as SohbetOlayi,
    ], 'tamam');
    const asistanId = await this.yaz(o, sira + 1, 'asistan', [], [], 'akista');
    yield { tur: 'mesaj_basladi', mesajId: asistanId, sira: sira + 1 };

    // --- Oturum durumu (araçların gördüğü) ----------------------------------
    const kullaniciMetinleri = [...gecmis.filter((m) => m.rol === 'kullanici').map(metniAl), metin].join('\n');
    const medyalar = [...gecmis.flatMap(medyalariAl), ...g.medyalar];
    const durum: OturumDurumu = {
      id: o.id,
      clientId: o.client_id,
      taslakId: o.taslak_id,
      kullaniciMetni: kullaniciMetinleri,
      medyalar,
      konumAdaylari: konumAdaylariAl(gecmis),
      sorulanlar: [...o.sorulanlar],
      bugun: yerel(this.simdi(), await this.d.saatDilimi(ctx, o.client_id)),
    };

    // --- Model mesajları ----------------------------------------------------
    const mesajlar = anthropicGecmisi(gecmis);
    const yeniIcerik: Array<Record<string, unknown>> = [{ type: 'text', text: (metin || '(yalnız medya bıraktı)') + medyaSatiri }];
    // Görsel YALNIZ ilk göründüğü turda modele gider (uzun oturum görselleri
    // yeniden faturalamasın); sonraki turlarda yerinde kısa metin var.
    for (const [i, m] of g.medyalar.entries()) {
      const gorsel = await this.d.medyaGorseli(o.client_id, m.kapakVarlikId ?? m.varlikId);
      if (!gorsel) {
        yeniIcerik.push({ type: 'text', text: `Medya ${medyalar.length - g.medyalar.length + i + 1}: asistana gösterilemedi (5 MB üstü ya da biçim).` });
        continue;
      }
      yeniIcerik.push({ type: 'text', text: `Medya ${medyalar.length - g.medyalar.length + i + 1}${m.kapakVarlikId ? ' (videonun kapak karesi)' : ''}:` });
      yeniIcerik.push({ type: 'image', source: { type: 'base64', media_type: gorsel.mime, data: gorsel.base64 } });
    }
    mesajlar.push({ role: 'user', content: yeniIcerik });
    const turMesajlari: AnthropicMesaji[] = [];

    const olaylar: SohbetOlayi[] = [];
    const ver = (e: SohbetOlayi) => {
      olaylar.push(e);
      return e;
    };
    let girdiToken = 0;
    let ciktiToken = 0;
    let onbellekToken = 0;
    let sonDurum: MesajDurumu = 'tamam';
    let hataMetni: string | null = null;
    let sonMetin = '';
    const gorulenCagrilar = new Set<string>();
    let adim = 0;

    try {
      for (;;) {
        const parcalar: string[] = [];
        let r: ModelAdimSonucu;
        try {
          r = await this.d.model({
            sistem: SOHBET_SISTEM_ISTEMI,
            araclar: aracTanimlari(),
            mesajlar: [...mesajlar, ...turMesajlari],
            enCokCikti: Math.max(1024, ADV_SOHBET_SINIRLARI.ciktiToken - ciktiToken),
            metinParcasi: (p) => parcalar.push(p),
          });
        } catch (e) {
          sonDurum = 'hata';
          hataMetni = e instanceof Error ? e.message : String(e);
          yield ver({ tur: 'hata', hata: 'ulasilamadi', mesaj: `Asistana ulaşılamadı: ${hataMetni}` });
          break;
        }
        for (const p of parcalar) yield ver({ tur: 'metin', parca: p });
        girdiToken += r.girdiToken;
        ciktiToken += r.ciktiToken;
        onbellekToken += r.onbellekToken;
        turMesajlari.push({ role: 'assistant', content: r.content });
        const metinBloklari = r.content.filter((b) => b.type === 'text').map((b) => String(b.text ?? ''));
        if (metinBloklari.length) sonMetin = metinBloklari.join('\n');

        if (r.stop_reason === 'refusal') {
          sonDurum = 'ret';
          yield ver({ tur: 'hata', hata: 'ret', mesaj: 'Asistan bu isteği yapamadı. Taslağı panelden kurabilirsin.' });
          break;
        }
        if (r.stop_reason === 'max_tokens' || ciktiToken >= ADV_SOHBET_SINIRLARI.ciktiToken) {
          sonDurum = 'kesildi';
          yield ver({ tur: 'hata', hata: 'kesildi', mesaj: 'Cevap yarıda kesildi.' });
          break;
        }
        if (r.stop_reason !== 'tool_use') break;

        const sonuclar: Array<Record<string, unknown>> = [];
        for (const b of r.content.filter((x) => x.type === 'tool_use')) {
          adim++;
          const ad = String(b.name) as AracAdi;
          if (adim > ADV_SOHBET_SINIRLARI.aracAdimi) {
            sonuclar.push(aracSonucuBlogu(b, { hal: 'reddedildi', neden: 'Bu turda adım sınırı doldu.' }));
            continue;
          }
          const anahtar = `${ad}:${kanonik(b.input)}`;
          if (gorulenCagrilar.has(anahtar)) {
            // TEKRAR: model aynı çağrıyı yeniden istedi; çalıştırılmıyor.
            sonuclar.push(aracSonucuBlogu(b, { hal: 'reddedildi', neden: 'TEKRAR: bu çağrı bu turda zaten yapıldı; sonucunu kullan.' }));
            continue;
          }
          gorulenCagrilar.add(anahtar);
          yield ver({ tur: 'arac_basladi', arac: ad, adim });
          const bas = Date.now();
          const c = await this.d.calistirici.calistir(ctx, durum, ad, b.input);
          if (c.taslakId && c.taslakId !== durum.taslakId) {
            durum.taslakId = c.taslakId;
            await this.taslakBagla(o, c.taslakId);
          }
          if (c.konumAdaylari) durum.konumAdaylari = [...durum.konumAdaylari, ...c.konumAdaylari];
          yield ver({ tur: 'arac_bitti', arac: ad, adim, hal: c.sonuc.hal, sureMs: Date.now() - bas });
          if (c.taslakId && c.taslakSurumu !== undefined) yield ver({ tur: 'taslak_degisti', taslakId: c.taslakId, surum: c.taslakSurumu });
          if (ad === 'onay_karti_goster' && c.sonuc.hal === 'tamam') yield ver({ tur: 'kart', kart: c.sonuc.veri });
          sonuclar.push(aracSonucuBlogu(b, c.sonuc));
        }
        turMesajlari.push({ role: 'user', content: sonuclar });
        if (adim > ADV_SOHBET_SINIRLARI.aracAdimi) {
          sonDurum = 'kesildi';
          yield ver({ tur: 'hata', hata: 'kesildi', mesaj: 'Asistan bu turda çok adım attı; durdurdum. "Devam et" diyebilirsin.' });
          break;
        }
      }

      if (sonDurum === 'tamam') {
        // SIRADAKİ SORU sunucudan: model ne sorduysa sorsun, çipler bu.
        const soru = durum.taslakId ? await this.siradakiSoru(ctx, durum) : null;
        if (soru) {
          yield ver({ tur: 'soru', soru });
          await this.soruYaz(o, [...durum.sorulanlar, soru.alan]);
        }
        // DURUM KELİMESİ SÜZGECİ: model "yayında" dediyse altına gerçek durum.
        if (sonMetin && durumKelimesiVar(sonMetin)) {
          yield ver({ tur: 'durum_duzeltmesi', metin: `Gerçek durum: ${await this.d.gercekDurum(ctx, durum.taslakId)}` });
        }
      }
    } finally {
      // Ne olursa olsun satır kapanır ("akista" kalmaz).
      await this.kapat(asistanId, turMesajlari, olaylar, sonDurum, hataMetni, { girdiToken, ciktiToken, onbellekToken });
    }
    yield { tur: 'bitti', durum: sonDurum, girdiToken, ciktiToken };
  }

  // ---------------------------------------------------------------------------

  private async oturum(id: string): Promise<OturumSatiri> {
    const [o] = await this.d.tx((t) =>
      t.$queryRaw<OturumSatiri[]>(Prisma.sql`
        SELECT id::text, client_id::text, org_id::text, user_id::text, taslak_id::text, durum, sorulanlar
          FROM adv_oturum WHERE id = ${id}::uuid`),
    );
    if (!o) throw new SohbetHatasi('YOK', 'Oturum bulunamadı');
    return o;
  }

  private async mesajlar(oturumId: string): Promise<MesajSatiri[]> {
    return this.d.tx((t) =>
      t.$queryRaw<MesajSatiri[]>(Prisma.sql`
        SELECT id::text, sira, rol, icerik, olaylar, durum FROM adv_mesaj
         WHERE oturum_id = ${oturumId}::uuid ORDER BY sira`),
    );
  }

  private async medyaDogrula(o: OturumSatiri, medyalar: TurGirdisi['medyalar']): Promise<void> {
    if (medyalar.length > ADV_SOHBET_SINIRLARI.oturumGorsel) throw new SohbetHatasi('MEDYA', `Tek mesajda en çok ${ADV_SOHBET_SINIRLARI.oturumGorsel} medya.`);
    const kimlikler = [...new Set(medyalar.flatMap((m) => (m.kapakVarlikId ? [m.varlikId, m.kapakVarlikId] : [m.varlikId])))];
    if (kimlikler.length === 0) return;
    const satirlar = await this.d.tx((t) =>
      t.$queryRaw<Array<{ id: string; kind: string }>>(Prisma.sql`
        SELECT id::text, kind FROM assets WHERE client_id = ${o.client_id}::uuid AND id = ANY(${kimlikler}::uuid[])`),
    );
    // Başka workspace'in varlığı sessizce atlanmaz.
    if (satirlar.length !== kimlikler.length) throw new SohbetHatasi('MEDYA', 'Seçilen medyanın bir kısmı bu workspace’in arşivinde değil.');
    for (const m of medyalar) {
      const tur = satirlar.find((x) => x.id === m.varlikId)!.kind;
      const kapak = m.kapakVarlikId ? satirlar.find((x) => x.id === m.kapakVarlikId)!.kind : null;
      if (m.kapakVarlikId ? tur !== 'video' || kapak !== 'image' : tur !== 'image') {
        throw new SohbetHatasi('MEDYA', 'Video bir kapak karesiyle, görsel tek başına gelmeli.');
      }
    }
  }

  private async kullanim(o: OturumSatiri, oturumMesaj: number) {
    const simdi = this.simdi();
    const saatOnce = new Date(simdi.getTime() - 60 * 60_000);
    const gunBasi = new Date(istanbulYarin(simdi).getTime() - 24 * 60 * 60_000);
    const [s] = await this.d.tx((t) =>
      t.$queryRaw<Array<{ saatlik: number; en_eski: Date | null; token: number }>>(Prisma.sql`
        SELECT
          (SELECT count(*)::int FROM adv_mesaj WHERE user_id = ${o.user_id}::uuid AND rol = 'kullanici' AND created_at > ${saatOnce}) AS saatlik,
          (SELECT min(created_at) FROM adv_mesaj WHERE user_id = ${o.user_id}::uuid AND rol = 'kullanici' AND created_at > ${saatOnce}) AS en_eski,
          (SELECT coalesce(sum(girdi_token), 0)::int FROM adv_mesaj WHERE client_id = ${o.client_id}::uuid AND created_at >= ${gunBasi}) AS token`),
    );
    return {
      saatlikMesaj: s?.saatlik ?? 0,
      saatlikEnEski: s?.en_eski ? new Date(s.en_eski) : null,
      gunlukGirdiToken: s?.token ?? 0,
      // Oturum sınırı KULLANICI mesajı sayıyor (bir tur iki satır).
      oturumMesaj: Math.ceil(oturumMesaj / 2),
    };
  }

  private async yaz(o: OturumSatiri, sira: number, rol: MesajSatiri['rol'], icerik: unknown, olaylar: SohbetOlayi[], durum: MesajDurumu): Promise<string> {
    const [m] = await this.d.tx((t) =>
      t.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO adv_mesaj (oturum_id, org_id, client_id, user_id, sira, rol, icerik, olaylar, durum)
        VALUES (${o.id}::uuid, ${o.org_id}::uuid, ${o.client_id}::uuid, ${o.user_id}::uuid, ${sira}, ${rol},
                ${JSON.stringify(icerik)}::jsonb, ${JSON.stringify(olaylar)}::jsonb, ${durum})
        RETURNING id::text`),
    );
    return m!.id;
  }

  private async kapat(
    id: string,
    turMesajlari: AnthropicMesaji[],
    olaylar: SohbetOlayi[],
    durum: MesajDurumu,
    hata: string | null,
    t: { girdiToken: number; ciktiToken: number; onbellekToken: number },
  ): Promise<void> {
    const r = await this.d.tx((x) =>
      x.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE adv_mesaj SET icerik = ${JSON.stringify(turMesajlari)}::jsonb, olaylar = ${JSON.stringify(olaylar)}::jsonb,
               durum = ${durum}, hata_metni = ${hata?.slice(0, 2000) ?? null},
               girdi_token = ${t.girdiToken}, cikti_token = ${t.ciktiToken}, onbellek_token = ${t.onbellekToken}
         WHERE id = ${id}::uuid AND durum = 'akista' RETURNING id`),
    );
    // Sıfır satır = kayıt kapanmadı (RLS ya da biri önce kapattı); sessiz geçmez.
    if (r.length === 0) throw new Error(`Asistan mesajı kapatılamadı: ${id}`);
    await this.d.tx((x) => x.$queryRaw(Prisma.sql`UPDATE adv_oturum SET updated_at = now() WHERE id = (SELECT oturum_id FROM adv_mesaj WHERE id = ${id}::uuid) RETURNING id`));
  }

  private async taslakBagla(o: OturumSatiri, taslakId: string): Promise<void> {
    await this.d.tx((x) =>
      x.$queryRaw(Prisma.sql`UPDATE adv_oturum SET taslak_id = ${taslakId}::uuid, updated_at = now() WHERE id = ${o.id}::uuid RETURNING id`),
    );
  }

  private async soruYaz(o: OturumSatiri, sorulanlar: SorulabilirAlan[]): Promise<void> {
    await this.d.tx((x) =>
      x.$queryRaw(Prisma.sql`UPDATE adv_oturum SET sorulanlar = ${JSON.stringify(sorulanlar)}::jsonb WHERE id = ${o.id}::uuid RETURNING id`),
    );
  }

  private async siradakiSoru(ctx: TenantContext, durum: OturumDurumu) {
    const [s] = await this.d.tx((x) =>
      x.$queryRaw<Array<{ eksikler: Array<{ adim: number; alan: string; kod: string; metin: string }> }>>(Prisma.sql`
        SELECT s.eksikler FROM reklam_taslagi t JOIN taslak_surumu s ON s.taslak_id = t.id AND s.surum_no = t.aktif_surum_no
         WHERE t.id = ${durum.taslakId}::uuid`),
    );
    void ctx;
    if (!s) return null;
    return siradakiSoru(s.eksikler as never, durum.sorulanlar);
  }
}

// ---------------------------------------------------------------------------
// Saf yardımcılar (dışa açık: testleri var)
// ---------------------------------------------------------------------------

/**
 * Kayıtlı satırlardan Anthropic mesaj listesi. Yarıda kalmış bir turun son
 * asistan mesajı cevapsız bir araç çağrısıyla bitiyorsa ATILIR: API cevapsız
 * `tool_use` taşıyan geçmişi reddediyor ve oturum bir daha konuşamazdı.
 * Aynı rolden ardışık mesajlar birleştirilir (kesilmiş tur araç sonucuyla
 * bitebilir, ardından kullanıcı mesajı gelir).
 */
export function anthropicGecmisi(satirlar: ReadonlyArray<Pick<MesajSatiri, 'rol' | 'icerik'>>): AnthropicMesaji[] {
  const ham: AnthropicMesaji[] = [];
  for (const s of satirlar) {
    if (s.rol === 'kullanici') ham.push({ role: 'user', content: s.icerik as AnthropicMesaji['content'] });
    else if (s.rol === 'asistan') {
      const tur = [...(s.icerik as AnthropicMesaji[])];
      const son = tur.at(-1);
      if (son?.role === 'assistant' && son.content.some((b) => b.type === 'tool_use')) tur.pop();
      ham.push(...tur);
    }
  }
  const sonuc: AnthropicMesaji[] = [];
  for (const m of ham) {
    if (m.content.length === 0) continue;
    const onceki = sonuc.at(-1);
    if (onceki && onceki.role === m.role) onceki.content = [...onceki.content, ...m.content];
    else sonuc.push({ role: m.role, content: [...m.content] });
  }
  return sonuc;
}

function metniAl(m: Pick<MesajSatiri, 'icerik'>): string {
  return (m.icerik as Array<{ type: string; text?: string }>)
    .filter((b) => b.type === 'text')
    .map((b) => (b.text ?? '').replace(/\n\n\[Bırakılan medya:[^\]]*\]$/, ''))
    .join('\n');
}

function medyalariAl(m: MesajSatiri): TurGirdisi['medyalar'] {
  if (m.rol !== 'kullanici') return [];
  const e = (m.olaylar as unknown as Array<{ tur: string; medyalar?: TurGirdisi['medyalar'] }>).find((x) => x.tur === 'medya');
  return e?.medyalar ?? [];
}

/** Geçmişteki konum_ara sonuçları: model anahtarı yalnız bunlardan seçebilir. */
export function konumAdaylariAl(satirlar: ReadonlyArray<Pick<MesajSatiri, 'rol' | 'icerik'>>): HedefKonum[] {
  const sonuc: HedefKonum[] = [];
  for (const s of satirlar) {
    if (s.rol !== 'asistan') continue;
    const tur = s.icerik as AnthropicMesaji[];
    const konumCagrilari = new Set(
      tur.flatMap((m) => m.content).filter((b) => b.type === 'tool_use' && b.name === 'konum_ara').map((b) => String(b.id)),
    );
    for (const b of tur.flatMap((m) => m.content)) {
      if (b.type !== 'tool_result' || !konumCagrilari.has(String(b.tool_use_id))) continue;
      try {
        const r = JSON.parse(String((b.content as Array<{ text: string }>)[0]?.text ?? '{}')) as { hal: string; veri?: HedefKonum[] };
        if (r.hal === 'tamam' && Array.isArray(r.veri)) sonuc.push(...r.veri);
      } catch {
        // Bozuk sonuç aday üretmez; model yeniden arar.
      }
    }
  }
  return sonuc;
}

function aracSonucuBlogu(b: Record<string, unknown>, sonuc: unknown): Record<string, unknown> {
  const hata = typeof sonuc === 'object' && sonuc !== null && ['dustu', 'reddedildi'].includes(String((sonuc as { hal: string }).hal));
  return { type: 'tool_result', tool_use_id: b.id, content: [{ type: 'text', text: JSON.stringify(sonuc) }], ...(hata && { is_error: true }) };
}

function kanonik(v: unknown): string {
  return createHash('sha256').update(kanonikJson(v)).digest('hex');
}

function yerel(an: Date, saatDilimi: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: saatDilimi, year: 'numeric', month: '2-digit', day: '2-digit' }).format(an);
}

export function kotaMesaji(sebep: 'saatlik_mesaj' | 'gunluk_token' | 'oturum_mesaj', yenilenme: string | null): string {
  const saat = yenilenme
    ? new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(new Date(yenilenme))
    : null;
  if (sebep === 'oturum_mesaj') return `Bu oturum ${ADV_SOHBET_SINIRLARI.oturumMesaj} mesaja ulaştı; yeni oturum aç. Bu oturum okunur kalır.`;
  if (sebep === 'saatlik_mesaj') return `Saatlik ${ADV_SOHBET_SINIRLARI.saatlikMesaj} mesaj sınırı doldu; ${saat} itibarıyla açılır. Panel çalışıyor.`;
  return `Bu workspace’in bugünkü asistan sınırı doldu; gece yarısı (${saat}) yenilenir. Panel çalışıyor.`;
}
