import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { BilgiBankasiTaslak, TenantContext } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { ANTHROPIC_CLIENT } from '../ai-assistant/anthropic-client.provider';
import type { AnthropicLike } from '../ai-assistant/ai-assistant.service';
import { ClientsService } from './clients.service';
import { ClientProfileService } from './client-profile.service';
import { siteOku } from './site-oku';

/**
 * ═══ BİLGİ BANKASINI TEK TUŞLA DOLDURMA ═══
 *
 * Kullanıcının isteği: *"bilgi bankası benim verdiğim workspace bilgilerine
 * göre AI asistan ile reklam stratejisine uygun bir şekilde bilgileri
 * dolduracak tek tuş ile araştırma yapıp"*.
 *
 * ═══ "ARAŞTIRMA" NE DEMEK — VE NE DEĞİL ═══
 *
 * Modelden bir markayı "hatırlamasını" istemek, makul görünen ama YANLIŞ
 * cümleler üretiyor: olmayan hizmetler, yanlış şehir, uydurma slogan. O
 * cümleler buradan reklam metnine geçiyor ve müşterinin parasıyla yayına
 * çıkıyor. Bu yüzden kaynak modelin belleği değil, İŞLETMENİN KENDİ SİTESİ:
 * sunucu siteyi okuyor (`site-oku.ts`, SSRF'e karşı kapalı) ve metni modele
 * veriyor.
 *
 * SİTE YOKSA İŞ YAPILMIYOR. "Elimizde yalnızca ad var, gerisini uydur"
 * demek, bu ekranın taşıdığı tek değeri (doğru bilgi) götürürdü. Sebep
 * kullanıcıya yazılıyor ve yapılacak iş söyleniyor: workspace kartına site
 * adresini ekle.
 *
 * ═══ TASLAK KAYDEDİLMİYOR ═══
 *
 * Uç doldurulmuş ALANLARI döndürüyor, veritabanına YAZMIYOR. Yapay zekânın
 * ürettiği metin, gerçek bir işletmeyi anlatan ve reklam metnini besleyen bir
 * kayda insan görmeden girmemeli — "200 döndü" doğrulama değil. Kullanıcı
 * ekranda görüyor, düzeltiyor ve kendi kaydediyor.
 */
@Injectable()
export class BilgiBankasiAiService {
  private readonly logger = new Logger(BilgiBankasiAiService.name);
  private readonly model: string;

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: AnthropicLike | null,
    @Inject(CONFIG) config: AppConfig,
    private readonly clients: ClientsService,
    private readonly profile: ClientProfileService,
  ) {
    this.model = config.aiAssistant.model;
  }

  async taslak(ctx: TenantContext, clientId: string): Promise<BilgiBankasiTaslak> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException(
        'AI asistanı yapılandırılmamış — ANTHROPIC_API_KEY eksik.',
      );
    }

    const hepsi = await this.clients.list(ctx);
    const client = hepsi.find((c) => c.id === clientId);
    if (!client) throw new BadRequestException('Workspace bulunamadı.');

    if (!client.website) {
      throw new BadRequestException(
        `${client.name} kartında site adresi yok. Araştırma işletmenin kendi ` +
          'sitesinden yapılıyor; Workspace’ler ekranından site adresini ekle.',
      );
    }

    const site = await siteOku(client.website);
    if (!site.ok) {
      throw new BadRequestException(site.sebep);
    }

    /*
     * MEVCUT METİN MODELE VERİLİYOR — ÜZERİNE YAZMAK İÇİN DEĞİL, BİLMEK
     * İÇİN. Kullanıcının elle yazdığı bir cümleyi görmezden gelen bir taslak,
     * onun işini geri alıyor.
     */
    const mevcut = await this.profile.get(ctx, clientId).catch(() => null);

    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 2000,
      system: SISTEM,
      messages: [
        {
          role: 'user',
          content: [
            `Workspace adı: ${client.name}`,
            `Site: ${site.adres}`,
            client.contactPhone ? `Kayıtlı telefon: ${client.contactPhone}` : null,
            mevcut?.bilgiBankasi ? `Mevcut "Bilgi Bankası" metni:\n${mevcut.bilgiBankasi}` : null,
            mevcut?.hedefKitle ? `Mevcut "Hedef Kitle" metni:\n${mevcut.hedefKitle}` : null,
            mevcut?.markaBilgileri
              ? `Mevcut "Marka Bilgileri" metni:\n${mevcut.markaBilgileri}`
              : null,
            '',
            'Sitenin metni:',
            // METİN KIRPILIYOR: bir kurumsal sitenin ilk 20 bin karakteri "ne
            // yapıyorlar, kime satıyorlar" sorusunu fazlasıyla cevaplıyor ve
            // sınırsız göndermek her çağrıyı pahalılaştırırdı.
            site.metin.slice(0, 20_000),
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    });

    const metin = response.content
      .filter((b): b is { type: 'text'; text: string; citations: never } => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const taslak = bolumleriAyir(metin);

    if (!taslak.bilgiBankasi && !taslak.hedefKitle && !taslak.markaBilgileri) {
      /*
       * BOŞ TASLAK BAŞARI SAYILMIYOR. Etiketleri bulamadıysak modelin cevabı
       * beklediğimiz biçimde değil demektir; boş alanları "doldurdum" diye
       * göstermek, kullanıcıya çalıştığını sandıran bir düğme olurdu.
       */
      this.logger.warn(`Bilgi bankası taslağı çözümlenemedi (${clientId}): ${metin.slice(0, 200)}`);
      throw new BadRequestException(
        'Taslak üretildi ama beklenen biçimde gelmedi. Tekrar dene; sürerse bilgileri elle yaz.',
      );
    }

    return { ...taslak, kaynak: site.adres };
  }
}

/**
 * ═══ ÇIKTI ETİKETLİ, JSON DEĞİL ═══
 *
 * Model JSON üretirken uzun serbest metinlerde kaçış karakterlerinde
 * yanılıyor ve tek bir tırnak bütün cevabı çözümlenemez yapıyor. Etiketli
 * bloklar kısmi cevapta bile işe yarıyor: iki bölüm gelmişse ikisi
 * dolduruluyor, üçüncüsü boş kalıyor ve kullanıcı farkı görüyor.
 */
const SISTEM = `Sen bir performans pazarlama stratejistisin. Bir işletmenin
kendi web sitesinden okunan metni alıp, o işletmenin reklam hesabı için
"bilgi bankası" kaydını dolduruyorsun. Bu kayıt sonradan reklam metni ve
hedefleme üretmek için kullanılıyor.

KURALLAR:
- YALNIZCA sitedeki metne dayan. Sitede yazmayan hizmet, rakam, ödül, şehir
  ya da slogan UYDURMA. Bir bilgi sitede yoksa o cümleyi hiç kurma.
- Reklamcılık diliyle değil, işletmeyi TANITAN sade Türkçeyle yaz.
- Mevcut metin verildiyse onu koru ve üstüne ekle; çelişiyorsa sitedeki
  bilgiyi esas al.
- Uzun tire kullanma.

Cevabını TAM OLARAK şu üç etiketle ver, başka hiçbir şey yazma:

BILGI BANKASI:
<işletme ne yapıyor, hangi hizmet/ürünler, nerede, ayırt edici yanı ne —
6-10 cümle>

HEDEF KITLE:
<kime satıyor: demografi, konum, ihtiyaç anı, satın alma tetikleyicisi —
4-8 cümle>

MARKA BILGILERI:
<ton, vaat, öne çıkan mesajlar, reklamda kullanılabilecek kanıtlar —
4-8 cümle>`;

/**
 * Etiketli cevabı üç alana ayırır.
 *
 * ETİKETLER TÜRKÇE KARAKTERSİZ ARANIYOR: model "BİLGİ BANKASI" ya da "BILGI
 * BANKASI" yazabiliyor ve tek biçim aramak, doğru gelmiş bir cevabı
 * çözümlenemez saymak olurdu.
 */
export function bolumleriAyir(metin: string): {
  bilgiBankasi: string;
  hedefKitle: string;
  markaBilgileri: string;
} {
  const normal = metin.replace(/İ/g, 'I').replace(/ı/g, 'i');

  return {
    bilgiBankasi: bolum(metin, normal, /BILGI BANKASI\s*:/i),
    hedefKitle: bolum(metin, normal, /HEDEF KITLE\s*:/i),
    markaBilgileri: bolum(metin, normal, /MARKA BILGILERI\s*:/i),
  };
}

const ETIKETLER = [/BILGI BANKASI\s*:/i, /HEDEF KITLE\s*:/i, /MARKA BILGILERI\s*:/i];

function bolum(ham: string, normal: string, desen: RegExp): string {
  const bas = desen.exec(normal);
  if (!bas || bas.index === undefined) return '';
  const govdeBas = bas.index + bas[0].length;

  /*
   * BİTİŞ, SONRAKİ ETİKETİN BAŞI — sabit uzunluklu dilim komşu bölümü
   * içine alıyor ve iki bölüm tek alana yazılıyordu.
   */
  let son = normal.length;
  for (const d of ETIKETLER) {
    const m = new RegExp(d.source, 'ig');
    m.lastIndex = govdeBas;
    const bulunan = m.exec(normal);
    if (bulunan && bulunan.index < son) son = bulunan.index;
  }

  // HAM METİNDEN KESİLİYOR: normalize edilmiş kopya yalnızca etiketi bulmak
  // için; kullanıcıya giden metin Türkçe karakterlerini korumak zorunda.
  return ham.slice(govdeBas, son).trim();
}
