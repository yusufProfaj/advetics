import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type { CampaignGoal, TenantContext } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { ANTHROPIC_CLIENT } from '../ai-assistant/anthropic-client.provider';
import {
  baglamiMetne,
  musteriBaglamiKur,
  type BaglamDeps,
} from '../ai-assistant/musteri-baglami';
import { ClientsService } from '../tenancy/clients.service';
import { ClientProfileService } from '../tenancy/client-profile.service';
import { ConnectionsService } from '../connections/connections.service';

export interface AnthropicLike {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

export interface ReklamMetni {
  primaryText: string;
  headline: string;
  description: string;
}

/**
 * ═══ REKLAM METNİNİ YAPAY ZEKÂ YAZIYOR ═══
 *
 * Kullanıcının isteği birebir: "ben sadece reklam metinlerini yapıştırayım ve
 * görseli ekleyim o kursun, metinleri oluşturmak istersem de yapay zeka ile
 * doldur diyeyim doldursun bütün metinleri".
 *
 * ═══ ASİSTAN SOHBETİ DEĞİL, TEK ATIŞ ═══
 *
 * AI Asistan ekranı var ve oradan da metin istenebilir; ama kampanya kurarken
 * sohbete gidip metni kopyalayıp geri dönmek tam da kullanıcının "çok
 * komplike" dediği şey. Bu uç tek çağrıda ÜÇ ALANI birden döndürüyor ve
 * arayüz doğrudan kutulara yazıyor.
 *
 * ÜÇ ALAN BİRLİKTE ÜRETİLİYOR. Ayrı ayrı istemek üç farklı reklam gibi
 * konuşan bir metin çıkarırdı: ana metin bir vaat verirken başlık başka bir
 * şey söyler.
 *
 * ═══ BİLGİ BANKASI PROMPTA GİRİYOR ═══
 *
 * Asistanla AYNI bağlam kurucusu kullanılıyor (`musteriBaglamiKur`): marka
 * bilgileri, hedef kitle ve bilgi bankası. İkinci bir bağlam üreticisi
 * yazmak, bir gün asistanın bildiğini bu ucun bilmemesi demekti.
 *
 * ═══ MODEL KAPALIYSA AÇIKÇA SÖYLENİYOR ═══
 *
 * Anahtar tanımlı değilse düğme sessizce hiçbir şey yapmamalı; kullanıcı
 * "bozuk" der ve sebebi hiçbir yerde yazmaz.
 */
@Injectable()
export class ReklamMetniService {
  private readonly logger = new Logger(ReklamMetniService.name);

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(ANTHROPIC_CLIENT) private readonly anthropic: AnthropicLike | null,
    private readonly clients: ClientsService,
    private readonly clientProfile: ClientProfileService,
    private readonly connections: ConnectionsService,
  ) {}

  async yaz(
    ctx: TenantContext,
    input: { clientId: string; goal: CampaignGoal; campaignName?: string; linkUrl?: string },
  ): Promise<ReklamMetni> {
    if (!this.anthropic) {
      throw new BadRequestException(
        'Yapay zekâ metin yazımı kapalı: sunucuda AI anahtarı tanımlı değil.',
      );
    }

    const deps: BaglamDeps = {
      clients: this.clients,
      clientProfile: this.clientProfile,
      connections: this.connections,
    };
    const baglam = await musteriBaglamiKur(deps, ctx, input.clientId);

    const response = await this.anthropic.messages.create({
      model: this.config.aiAssistant.model,
      max_tokens: 1024,
      system: SISTEM,
      messages: [
        {
          role: 'user',
          content:
            `${baglamiMetne(baglam)}\n\n` +
            `Kampanya tipi: ${HEDEF_ACIKLAMASI[input.goal]}\n` +
            (input.campaignName ? `Kampanya adı: ${input.campaignName}\n` : '') +
            (input.linkUrl ? `Yönlendirilecek adres: ${input.linkUrl}\n` : '') +
            'Bu kampanya için reklam metinlerini yaz.',
        },
      ],
    });

    return this.coz(response);
  }

  /**
   * Modelin cevabından üç alanı çıkarır.
   *
   * ═══ SERBEST METİN DEĞİL, ETİKETLİ SATIRLAR ═══
   *
   * JSON istemek daha temiz görünüyordu ama model bazen kod bloğu, bazen
   * açıklama cümlesi ekliyor ve `JSON.parse` düşüyor; düştüğünde kullanıcıya
   * gösterilecek hiçbir şey kalmıyor. Etiketli satırlar kısmen bozuk bir
   * cevapta bile işe yarıyor: ana metin gelmişse kutuya yazılıyor.
   *
   * ANA METİN BOŞSA HATA. Diğer ikisi olmadan reklam yayınlanabiliyor, ana
   * metin olmadan yayınlanamıyor; sessizce boş üç kutu bırakmak, düğmenin
   * çalışmadığı izlenimi verirdi.
   */
  private coz(response: Anthropic.Message): ReklamMetni {
    const metin = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    const al = (etiket: string): string => {
      const m = new RegExp(`^${etiket}:\\s*(.+)$`, 'im').exec(metin);
      return (m?.[1] ?? '').trim();
    };

    const primaryText = al('ANA METIN') || al('ANA METİN');
    if (!primaryText) {
      this.logger.warn(`Reklam metni çözülemedi: ${metin.slice(0, 200)}`);
      throw new BadRequestException(
        'Yapay zekâ beklenen biçimde cevap vermedi. Tekrar dene.',
      );
    }

    return {
      primaryText,
      headline: al('BASLIK') || al('BAŞLIK'),
      description: al('ACIKLAMA') || al('AÇIKLAMA'),
    };
  }
}

/**
 * KAMPANYA TİPİ MODELE DÜZ TÜRKÇEYLE ANLATILIYOR.
 *
 * `OUTCOME_LEADS` gibi bir kod göndermek, modelin Meta terminolojisinden
 * doğru çağrıyı çıkarmasına bel bağlamak olurdu; metnin ne yapması gerektiği
 * teknik bir ayar değil, bir iletişim kararı.
 */
const HEDEF_ACIKLAMASI: Record<CampaignGoal, string> = {
  form: 'Anlık form — kişi reklamın içinde açılan formu dolduracak, web sitesine gitmeyecek.',
  whatsapp: 'WhatsApp — kişi reklama tıklayınca WhatsApp’ta mesaj yazacak.',
  website: 'Web sitesi — kişi reklama tıklayınca siteye gidecek.',
};

/**
 * ═══ SİSTEM TALİMATI ═══
 *
 * Sınırlar Meta'nın kendi sınırları değil, OKUNABİLİRLİK sınırları: Meta ana
 * metni 125 karakterden sonra "devamını gör" ile kırpıyor ve başlığı mobilde
 * ~40 karakterde kesiyor. Sınırları yazmamak, teknik olarak geçerli ama
 * ekranda yarısı görünmeyen bir reklam üretirdi.
 */
const SISTEM = `Sen Türkiye'de çalışan bir performans pazarlama metin yazarısın.
Meta (Facebook/Instagram) reklamları için metin yazıyorsun.

Cevabını TAM OLARAK şu üç satır biçiminde ver, başka hiçbir şey yazma:

ANA METIN: <metin>
BASLIK: <metin>
ACIKLAMA: <metin>

Kurallar:
- Türkçe yaz. Doğal konuş, reklam jargonu kullanma.
- ANA METIN en fazla 125 karakter: Meta bu noktadan sonra "devamını gör" ile
  kırpıyor ve kırpılan kısmı kimse okumuyor.
- BASLIK en fazla 40 karakter: mobilde daha uzunu kesiliyor.
- ACIKLAMA en fazla 60 karakter.
- Emoji kullanma.
- BÜYÜK HARFLE bağırma.
- Fiyat, indirim oranı, "garanti", "en iyi" gibi kanıtlanamayan iddialar
  yazma; bilgi bankasında açıkça verilmemişse UYDURMA.
- Bir tane net eylem çağrısı olsun ve kampanya tipiyle uyumlu olsun.`;
