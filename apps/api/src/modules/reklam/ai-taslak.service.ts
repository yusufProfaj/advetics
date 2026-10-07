import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ReklamTaslakKaydi, TaslakAlanlari, TenantContext } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { AI_SISTEM_ISTEMI, aiCiktiSchema, aiCiktisiniDogrula, type AiCikti } from './ai-taslak';
import { ReklamHazirlikService } from './hazirlik.service';
import { ReklamTaslakService, type AlanDegisikligi } from './taslak.service';
import { yerelTarih } from './yayin-baslat';

/**
 * Yapay zekâ ile taslak — model çağrısı ve kayıt. Saf doğrulama
 * `ai-taslak.ts`te.
 *
 * MODEL Opus 5.5 (TASARIM § 12.12: metin ve kavram önerisi), tek atış,
 * yapılandırılmış çıktı, effort medium. Ret (`refusal`) ve kesilme
 * (`max_tokens`) AYRI hâller ve ikisi de kullanıcıya söyleniyor; boş taslak
 * açılmıyor. Ret sınıflandırıcısı bir isteği reddederse sunucu tarafı yedek
 * model zinciri (`fallbacks: 'default'`) aynı çağrıda devreye giriyor.
 *
 * Görseller modele gidiyor (metin görsele uysun diye). Model 5 MB üstü
 * görseli kabul etmiyor; o görsel modele gönderilmiyor ve bu SÖYLENİYOR.
 */
export const REKLAM_AI_MODELI = 'claude-opus-5-5';
const GORSEL_SINIRI = 5 * 1024 * 1024;

export interface AiTaslakSonucu {
  taslak: ReklamTaslakKaydi;
  notlar: string[];
}

/** Test için değiştirilebilen model çağrısı. */
export type ModelCagrisi = (girdi: {
  sistem: string;
  icerik: Anthropic.Beta.BetaContentBlockParam[];
}) => Promise<{ tur: 'tamam'; cikti: AiCikti } | { tur: 'ret' | 'kesildi' | 'bos'; mesaj: string }>;

@Injectable()
export class ReklamAiTaslakService {
  private readonly istemci: Anthropic | null;
  private readonly yuklemeKoku: string;
  /** Testlerde sahte model koyulabilsin diye alan. */
  modelCagir: ModelCagrisi;

  constructor(
    private readonly prisma: PrismaService,
    private readonly hazirlik: ReklamHazirlikService,
    private readonly taslak: ReklamTaslakService,
    @Inject(CONFIG) config: AppConfig,
  ) {
    this.istemci = config.aiAssistant.apiKey ? new Anthropic({ apiKey: config.aiAssistant.apiKey }) : null;
    const dir = config.uploads.dir;
    this.yuklemeKoku = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
    this.modelCagir = (g) => this.claude(g);
  }

  private async claude({ sistem, icerik }: Parameters<ModelCagrisi>[0]): ReturnType<ModelCagrisi> {
    if (!this.istemci) throw new ServiceUnavailableException('Reklam asistanı bağlı değil (ANTHROPIC_API_KEY tanımlı değil).');
    const r = await this.istemci.beta.messages.parse({
      model: REKLAM_AI_MODELI,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(aiCiktiSchema) },
      system: [{ type: 'text', text: sistem, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: icerik }],
    });
    if (r.stop_reason === 'refusal') return { tur: 'ret', mesaj: 'Asistan bu isteği yapamadı; taslağı panelden kurabilirsin.' };
    if (r.stop_reason === 'max_tokens') return { tur: 'kesildi', mesaj: 'Asistanın cevabı yarıda kesildi; daha az görselle yeniden dene.' };
    if (!r.parsed_output) return { tur: 'bos', mesaj: 'Asistanın cevabı okunamadı; yeniden dene.' };
    return { tur: 'tamam', cikti: r.parsed_output };
  }

  async olustur(ctx: TenantContext, clientId: string, cumle: string, varliklar: string[]): Promise<AiTaslakSonucu> {
    if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
    const temiz = cumle.normalize('NFC').trim();
    if (!temiz) throw new BadRequestException('Ne istediğini bir cümleyle yaz.');
    if (varliklar.length < 1 || varliklar.length > 10) throw new BadRequestException('1 ile 10 arasında görsel seç.');

    const h = await this.hazirlik.oku(ctx, clientId);
    const [profil, gorseller] = await this.prisma.withTenant(ctx, async (tx) => {
      const [p] = await tx.$queryRaw<Array<{ marka_adi: string | null; sektor: string | null; uslup: string | null; vaatler: string[]; sik_sayfalar: unknown; ana_amac: string | null }>>(Prisma.sql`
        SELECT marka_adi, sektor, uslup, vaatler, sik_sayfalar, ana_amac FROM client_profiles WHERE client_id = ${clientId}::uuid`);
      const g = await tx.$queryRaw<Array<{ id: string; storage_key: string; mime_type: string; byte_size: number }>>(Prisma.sql`
        SELECT id::text, storage_key, mime_type, byte_size FROM assets
         WHERE client_id = ${clientId}::uuid AND kind = 'image' AND id = ANY(${varliklar}::uuid[])`);
      return [p ?? null, g] as const;
    });
    // Başka workspace'in ya da olmayan görsel sessizce atlanmaz.
    if (gorseller.length !== new Set(varliklar).size) throw new BadRequestException('Seçilen görsellerin bir kısmı bu workspace’in arşivinde değil.');

    const notlar: string[] = [];
    const icerik: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const [i, id] of varliklar.entries()) {
      const g = gorseller.find((x) => x.id === id)!;
      if (g.byte_size > GORSEL_SINIRI || (g.mime_type !== 'image/jpeg' && g.mime_type !== 'image/png')) {
        icerik.push({ type: 'text', text: `Görsel ${i + 1}: asistana gösterilemedi; genel bir metin yaz.` });
        notlar.push(`Görsel ${i + 1} asistana gösterilemedi (5 MB üstü ya da desteklenmeyen biçim); metnini kontrol et.`);
        continue;
      }
      const yol = resolve(this.yuklemeKoku, g.storage_key);
      if (!yol.startsWith(this.yuklemeKoku.endsWith(sep) ? this.yuklemeKoku : this.yuklemeKoku + sep)) {
        throw new Error(`Geçersiz depolama anahtarı: ${g.storage_key}`);
      }
      icerik.push({ type: 'text', text: `Görsel ${i + 1}:` });
      icerik.push({
        type: 'image',
        source: { type: 'base64', media_type: g.mime_type as 'image/jpeg' | 'image/png', data: (await readFile(yol)).toString('base64') },
      });
    }
    const sikSayfalar = (Array.isArray(profil?.sik_sayfalar) ? profil!.sik_sayfalar : [])
      .filter((s): s is { ad: string; url: string } => !!s && typeof (s as { url?: unknown }).url === 'string')
      .map((s) => ({ ad: s.ad, adres: s.url }));
    icerik.push({
      type: 'text',
      text: [
        `İstek: ${temiz}`,
        profil?.marka_adi ? `Marka: ${profil.marka_adi}` : null,
        profil?.sektor ? `Sektör: ${profil.sektor}` : null,
        profil?.uslup ? `Üslup: ${profil.uslup}` : null,
        profil?.vaatler?.length ? `Vaatler: ${profil.vaatler.join('; ')}` : null,
        profil?.ana_amac ? `Marka Merkezi'ndeki ana amaç: ${profil.ana_amac}` : null,
        sikSayfalar.length ? `Sık sayfalar: ${sikSayfalar.map((s) => `${s.ad} (${s.adres})`).join(', ')}` : 'Sık sayfa tanımlı değil.',
        h.varsayilanKitle ? `Marka kitlesi: ${h.varsayilanKitle.ozet}` : 'Marka kitlesi tanımlı değil.',
        h.marka.yasalUyari ? `Zorunlu yasal uyarı: ${h.marka.yasalUyari}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    const sonuc = await this.modelCagir({ sistem: AI_SISTEM_ISTEMI, icerik });
    if (sonuc.tur !== 'tamam') throw new BadRequestException(sonuc.mesaj);

    const hesap = h.hesaplar.length === 1 ? h.hesaplar[0]! : null;
    const dogru = aiCiktisiniDogrula(sonuc.cikti, {
      cumle: temiz,
      varliklar,
      sikSayfalar,
      markaKitlesi: h.varsayilanKitle?.konumlar ?? null,
      yasalUyari: h.marka.yasalUyari,
      tekHesap: hesap?.id ?? null,
      tekSayfa: h.sayfalar.length === 1 ? h.sayfalar[0]!.id : null,
      bugun: yerelTarih(new Date(), hesap?.saatDilimi ?? 'Europe/Istanbul'),
    });
    if (!hesap) dogru.notlar.push('Reklam hesabını seç.');
    if (h.sayfalar.length !== 1) dogru.notlar.push('Facebook sayfasını seç.');
    dogru.notlar.push('Bu reklam konut, iş ilanı, kredi ya da finans ya da siyasi bir konu içeriyor mu? Önizlemede cevapla.');

    const t = await this.taslak.olustur(ctx, clientId, 'ai', temiz);
    const yazilan = await this.taslak.surumYaz(ctx, t.id, dogru.degisiklikler as AlanDegisikligi);
    return { taslak: yazilan, notlar: [...notlar, ...dogru.notlar] };
  }

  /**
   * ÖNERİYİ ONAYLA: kullanıcının GÖRDÜĞÜ sürümdeki `ai_onerisi` alanları
   * `kullanici` olur (kim = onaylayan). Özet eşleşmezse onay yok: kullanıcı
   * başka bir hâli onaylamış olurdu.
   */
  async onayla(ctx: TenantContext, taslakId: string, icerikOzeti: string): Promise<ReklamTaslakKaydi> {
    const t = await this.taslak.oku(ctx, taslakId);
    if (t.icerikOzeti !== icerikOzeti) throw new ConflictException('Sen bakarken taslak değişti; önizlemeyi yenile.');
    const d: AlanDegisikligi = {};
    for (const [ad, v] of Object.entries(t.alanlar) as Array<[keyof TaslakAlanlari, { deger: unknown; kaynak: string }]>) {
      if (v?.kaynak === 'ai_onerisi') d[ad] = { deger: v.deger, kaynak: 'kullanici' };
    }
    if (Object.keys(d).length === 0) return t;
    return this.taslak.surumYaz(ctx, taslakId, d);
  }
}
