import { randomUUID } from 'node:crypto';
import { campaignActionInputSchema, formatMoney } from '@advetics/shared';
import { ClientsService } from '../tenancy/clients.service';
import { ConnectionsService } from '../connections/connections.service';
import { DraftTreeService } from '../draft-tree/draft-tree.service';
import { CreativeService } from '../draft-tree/creative.service';
import { CampaignActionsService } from '../campaign-actions/campaign-actions.service';
import { BoostsService } from '../boosts/boosts.service';
import type { ToolDefinition, ToolResult } from './tool-types';

/**
 * AI asistanının tool'ları — HER BİRİ VAR OLAN BİR SERVİSİN İNCE
 * SARMALAYICISI.
 *
 * YENİ İŞ MANTIĞI YOK: `create_draft_campaign` `DraftTreeService.
 * createFromSimple`'ı çağırıyor, `pause_campaign` `CampaignActionsService.
 * applyAction`ı — panelin manuel akışlarıyla AYNI kod yolu. Burada yalnızca
 * (1) Anthropic tool şeması, (2) girdi doğrulama/dönüştürme, (3) hata
 * yakalayıp `ToolResult` sözleşmesine çevirme var.
 *
 * `publish_campaign` BİLEREK YOK — chat en geniş ihtimalle `bulk.write`
 * ister, `bulk.publish` değil (Adım 2/6). Yayın yalnızca panelin kendi
 * butonundan.
 */

interface ToolDeps {
  clients: ClientsService;
  connections: ConnectionsService;
  draftTree: DraftTreeService;
  creatives: CreativeService;
  campaignActions: CampaignActionsService;
  boosts: BoostsService;
}

/** Servis hatalarını `ToolResult` sözleşmesine çevirir — LLM'e HAM istisna sızmaz. */
async function safe(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { status: 'failed', reason };
  }
}

function normalizeTr(s: string): string {
  return s.toLocaleLowerCase('tr-TR').trim();
}

/**
 * `campaignActionInputSchema.safeParse` — İSTİSNAYA KARŞI SARILMIŞ.
 *
 * `safeParse` "hiç fırlatmaz" diye bilinir; BU ŞEMADA FIRLATIYOR. Şemanın
 * `.refine`i `BigInt(v) > 0n` yazıyor ve Zod, `regex` kontrolü DÜŞTÜKTEN
 * SONRA da refine'ı koşturuyor: `"500.5"` girdisinde `BigInt()` ham bir
 * `SyntaxError` fırlatıyor ve `safeParse` hiç sonuç döndürmüyor. Ölçüldü —
 * sarmalayıcı olmadan LLM'e giden mesaj "Cannot convert 500.5 to a BigInt"
 * oluyordu.
 *
 * Şema `packages/shared` içinde ve panelin gövde doğrulaması da AYNI tuzağa
 * basıyor (orada 500 üretiyor); düzeltmesi bu dosyanın dışında. Burada en
 * azından istisna, LLM'in okuyup düzeltebileceği bir RET'e çevriliyor —
 * `safe()`e bırakılsaydı yığın izinden gelen mesaj modele "ne yapmalıyım"
 * sorusuna hiçbir cevap vermiyordu.
 */
function safeParseBudget(
  candidate: unknown,
): ReturnType<typeof campaignActionInputSchema.safeParse> | { success: false } {
  try {
    return campaignActionInputSchema.safeParse(candidate);
  } catch {
    return { success: false };
  }
}

export function buildTools(deps: ToolDeps): ToolDefinition[] {
  return [
    {
      name: 'resolve_client',
      description:
        'Müşteri adını arar. Tek eşleşme dönerse kullan; birden fazla ya da hiç eşleşme yoksa TAHMİN ETME, adayları kullanıcıya listele.',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', description: "Kullanıcının yazdığı müşteri adı, ör. 'Sabancı İnşaat'" } },
        required: ['query'],
      },
      permissions: ['client.read'],
      execute: (ctx, input) =>
        safe(async () => {
          const clients = await deps.clients.list(ctx);
          const q = normalizeTr(String(input.query));
          const matches = clients.filter((c) => normalizeTr(c.name).includes(q));
          if (matches.length === 0) {
            return { status: 'failed', reason: `"${input.query}" ile eşleşen müşteri bulunamadı.` } as const;
          }
          return { status: 'success', data: matches.map((c) => ({ id: c.id, name: c.name })) } as const;
        }),
    },

    {
      name: 'list_ad_accounts',
      description: 'Müşteriye atanmış reklam hesaplarını platform ve para birimiyle listeler.',
      inputSchema: {
        type: 'object',
        properties: { clientId: { type: 'string', description: 'resolve_client sonucundaki müşteri kimliği (UUID)' } },
        required: ['clientId'],
      },
      permissions: ['connection.read'],
      execute: (ctx, input) =>
        safe(async () => {
          const conns = await deps.connections.list(ctx, String(input.clientId));
          const accounts = conns.flatMap((c) => c.adAccounts);
          if (accounts.length === 0) {
            return { status: 'failed', reason: 'Bu müşteriye atanmış reklam hesabı yok.' } as const;
          }
          return {
            status: 'success',
            data: accounts.map((a) => ({
              id: a.id,
              platform: a.platform,
              name: a.name,
              currency: a.currency,
              status: a.status,
            })),
          } as const;
        }),
    },

    {
      name: 'list_draft_campaigns',
      description: 'Müşterinin taslak (henüz yayınlanmamış) kampanyalarını listeler.',
      inputSchema: {
        type: 'object',
        properties: { clientId: { type: 'string' } },
        required: ['clientId'],
      },
      permissions: ['bulk.read'],
      execute: (ctx, input, platform) =>
        safe(async () => {
          const groups = await deps.draftTree.list(ctx, String(input.clientId));
          /*
           * GRUBUN İÇİ SÜZÜLÜYOR, GRUP DEĞİL. Bir taslak grubu iki platformun
           * kampanyasını birden taşıyabiliyor; grubu tamamen atmak, Meta
           * kampanyası da olan bir niyeti asistandan gizlerdi.
           */
          const suzulmus = groups
            .map((g) => ({ ...g, campaigns: g.campaigns.filter((c) => c.platform === platform) }))
            .filter((g) => g.campaigns.length > 0);
          return { status: 'success', data: suzulmus } as const;
        }),
    },

    {
      name: 'list_live_campaigns',
      description:
        'Müşterinin YAYINDAKİ kampanyalarını listeler — bütçe/pause/resume aksiyonlarından önce hangi kampanyanın kastedildiğini netleştirmek için kullan.',
      inputSchema: {
        type: 'object',
        properties: { clientId: { type: 'string' } },
        required: ['clientId'],
      },
      permissions: ['bulk.read'],
      execute: (ctx, input, platform) =>
        safe(async () => {
          /*
           * PLATFORMA GÖRE SÜZÜLÜYOR. Süzülmeden önce Meta asistanı Google
           * kampanyalarını da listeliyor ve her cevabında "onlar için diğer
           * asistana geç" cümlesi taşımak zorunda kalıyordu.
           */
          const hepsi = await deps.campaignActions.list(ctx, String(input.clientId));
          const rows = hepsi.filter((r) => r.platform === platform);
          if (rows.length === 0) {
            return {
              status: 'failed',
              reason:
                hepsi.length > 0
                  ? `Bu müşterinin ${platform} tarafında yayında kampanyası yok (diğer platformlarda ${hepsi.length} kampanya var).`
                  : 'Bu müşterinin yayında kampanyası yok.',
            } as const;
          }
          return {
            status: 'success',
            // PARA BİRİMİ LİSTEDE DE VAR. Aynı müşterinin hesapları farklı
            // para birimlerinde olabiliyor; birimsiz bir bütçe listesi
            // LLM'e iki hesabın rakamlarını karşılaştırılabilir gösterir ve
            // "en yüksek bütçeli kampanya" cevabı sessizce yanlış çıkar.
            data: rows.map((r) => ({
              id: r.id,
              name: r.name,
              platform: r.platform,
              status: r.status,
              budgetMode: r.budgetMode,
              budgetAmountMicros: r.budgetAmountMicros?.toString() ?? null,
              currency: r.currency,
            })),
          } as const;
        }),
    },

    {
      /**
       * ═══ GEÇMİŞTE İŞE YARAYAN METİN VE GÖRSELLER ═══
       *
       * Kullanıcının en sık takıldığı soru "ne yazayım". Cevabı elimizde
       * duruyordu ve asistan ona hiç bakmıyordu: aynı müşterinin YAYINA
       * GİRMİŞ reklamları ve gerçek performansları.
       *
       * OKUMA — onay istemiyor, platforma dokunmuyor.
       */
      /**
       * ═══ "HANGİ KAMPANYAM KÖTÜ GİDİYOR" ═══
       *
       * Asistanın elinde performans verisi YOKTU ve kullanıcıya birebir
       * şunu söylüyordu: *"kampanya performansını gösteren bir analiz aracım
       * yok, 'kötü gidiyor' diyebilecek bir metrik verim yok"*. Oysa veri
       * `insights_daily`de duruyor ve panelin kampanya listesi onu zaten
       * okuyor — eksik olan araçtı.
       *
       * OKUMA: platforma dokunmuyor, kota harcamıyor, onay istemiyor.
       */
      name: 'campaign_performance',
      description:
        'Yayındaki kampanyaların performansını verir: harcama, gösterim, tıklama, CTR, dönüşüm ve edinme maliyeti. "Hangisi kötü gidiyor", "nerede para yanıyor" gibi sorularda ÖNCE bunu çağır.',
      inputSchema: {
        type: 'object',
        properties: {
          clientId: { type: 'string' },
          gun: { type: 'number', description: 'Kaç günlük pencere (varsayılan 30)' },
        },
        required: ['clientId'],
      },
      permissions: ['insights.read'],
      execute: (ctx, input, platform) =>
        safe(async () => {
          const liste = await deps.campaignActions.canliListe(ctx, String(input.clientId), {
            gun: typeof input.gun === 'number' ? input.gun : 30,
            platform,
          });
          if (liste.rows.length === 0) {
            return {
              status: 'failed',
              reason: `Bu müşterinin ${platform} tarafında yayında kampanyası yok.`,
            } as const;
          }
          return {
            status: 'success',
            data: {
              /*
               * VERİSİ OLMAYAN KAMPANYA `null` METRİKLE DÖNÜYOR, sıfırla
               * değil. "Harcamadı" ile "veri gelmedi" aynı şey değil ve
               * modelin bunu ayırt etmesi gerekiyor: ilkinde kampanyaya,
               * ikincisinde senkronizasyona bakılır.
               */
              kampanyalar: liste.rows.map((r) => {
                const m = r.son7Gun;
                const harcama = m === null ? null : Number(BigInt(m.spendMicros) / 10_000n) / 100;
                return {
                  id: r.id,
                  ad: r.name,
                  durum: r.status,
                  platformDurumu: r.effectiveStatus,
                  paraBirimi: r.currency,
                  gunlukButce:
                    r.budgetAmountMicros === null
                      ? null
                      : Number(BigInt(r.budgetAmountMicros) / 10_000n) / 100,
                  veri:
                    m === null
                      ? null
                      : {
                          harcama,
                          gosterim: m.impressions,
                          tiklama: m.clicks,
                          ctr:
                            m.impressions === 0
                              ? 0
                              : Number(((m.clicks / m.impressions) * 100).toFixed(2)),
                          donusum: m.conversions,
                          // EDİNME MALİYETİ YALNIZCA DÖNÜŞÜM VARKEN. Sıfıra
                          // bölmek yerine `null`: "dönüşüm yok" zaten ayrı
                          // ve daha önemli bir bilgi.
                          edinmeMaliyeti:
                            m.conversions > 0 && harcama !== null
                              ? Number((harcama / m.conversions).toFixed(2))
                              : null,
                        },
                };
              }),
            },
          } as const;
        }),
    },
    {
      name: 'list_top_creatives',
      description:
        'Bu müşterinin geçmişte EN İYİ performans gösteren reklam kreatiflerini (metin + görsel + CTR) listeler. Yeni bir reklam metni yazmadan ÖNCE çağır: neyin işe yaradığını görüp ona yakın bir metin üret.',
      inputSchema: {
        type: 'object',
        properties: {
          clientId: { type: 'string' },
          gun: { type: 'number', description: 'Kaç günlük geçmişe bakılacak (varsayılan 90)' },
        },
        required: ['clientId'],
      },
      permissions: ['bulk.read'],
      execute: (ctx, input) =>
        safe(async () => {
          const liste = await deps.creatives.performans(
            ctx,
            String(input.clientId),
            typeof input.gun === 'number' ? input.gun : 90,
          );
          if (liste.rows.length === 0) {
            /*
             * BOŞ LİSTE SEBEBİNİ SÖYLÜYOR. "Kreatif yok" ile "yeterli
             * gösterim almamış" aynı şey değil: ikincisinde geçmiş var ama
             * güvenilir değil ve model bunu bilmeden "geçmişin yok" diye
             * cevap verirdi.
             */
            return {
              status: 'failed',
              reason:
                liste.yetersiz > 0
                  ? `Son ${liste.gun} günde ${liste.yetersiz} kreatif var ama hiçbiri güvenilir bir karşılaştırma için yeterli gösterim almamış.`
                  : `Son ${liste.gun} günde yayınlanmış kreatif bulunamadı.`,
            } as const;
          }
          return {
            status: 'success',
            data: {
              gun: liste.gun,
              yetersiz: liste.yetersiz,
              kreatifler: liste.rows.map((r) => ({
                platform: r.platform,
                headline: r.headline,
                primaryText: r.primaryText,
                description: r.description,
                // CTR YÜZDE VE YUVARLANMIŞ: modele ondalık gürültü
                // vermenin faydası yok, karşılaştırma için iki hane yeter.
                ctr: Number(r.ctr.toFixed(2)),
                impressions: r.impressions,
                adCount: r.adCount,
                sonGun: r.sonGun,
              })),
            },
          } as const;
        }),
    },
    {
      /**
       * ═══ GÖNDERİ REKLAMI = BOOST ═══
       *
       * Kullanıcının istediği "gönderi etkileşimi kampanyası" bu üründe
       * boost olarak yazılmış ve CANLIDA doğrulanmış bir yol: ad set'te
       * `destination_type: ON_POST`, Instagram medyasının üç kimlik uzayı,
       * `object_story_id` yerine ayrı bir `adcreatives` çağrısı… Hepsi
       * `boosts` modülünde duruyor. Asistana yeni bir yayın yolu yazmak,
       * canlıda öğrenilmiş bu bilgiyi ikinci kez ve eksik yazmak olurdu.
       *
       * KREATİF GÖRSELİ İSTENMİYOR: gönderi zaten kreatifin kendisi.
       * Asistan bu yolu bilmediği için kullanıcıdan görsel istiyordu.
       */
      name: 'list_boostable_posts',
      description:
        'Müşterinin bağlı Instagram/Facebook hesaplarındaki SON GÖNDERİLERİ listeler — gönderi reklamı (etkileşim kampanyası) için. Her satırda gönderi kimliği, tarihi, metni ve yayınlanabilir olup olmadığı var.',
      inputSchema: {
        type: 'object',
        properties: {
          clientId: { type: 'string' },
          limit: { type: 'number', description: 'Kaç gönderi (varsayılan 10)' },
        },
        required: ['clientId'],
      },
      permissions: ['boost.read'],
      execute: (ctx, input) =>
        safe(async () => {
          const liste = await deps.boosts.listBoostablePosts(ctx, {
            clientId: String(input.clientId),
            limit: typeof input.limit === 'number' ? Math.min(30, input.limit) : 10,
          });
          if (liste.items.length === 0) {
            // BOŞ LİSTE SEBEBİNİ SÖYLÜYOR: servis `emptyReason` üretiyor ve
            // onu atmak, "gönderin yok" ile "sayfa atanmamış"ı aynı boşluğa
            // çevirirdi.
            return {
              status: 'failed',
              reason: liste.emptyReason ?? 'Boostlanabilir gönderi bulunamadı.',
            } as const;
          }
          return {
            status: 'success',
            data: {
              toplam: liste.total,
              gonderiler: liste.items.map((p) => ({
                id: p.id,
                yayinTarihi: p.publishedAt,
                metin: p.message?.slice(0, 280) ?? null,
                tur: p.mediaType,
                hesap: p.socialProfileName,
                erisim: p.reach,
                etkilesim: p.engagements,
                bagli: p.permalink,
                /*
                 * ENGEL VARSA MODELE SÖYLENİYOR. Boostlanamayan bir gönderiyi
                 * önerip kullanıcıyı onay kartına kadar getirmek, en son anda
                 * reddedilen bir işlem demek.
                 */
                engel: p.blockedReason,
                uyari: p.warning,
              })),
            },
          } as const;
        }),
    },

    {
      /**
       * ═══ GÖNDERİYİ REKLAMA ÇEVİR — PARA HARCAR ═══
       *
       * `pending_confirmation` DÖNÜYOR, doğrudan yayınlamıyor. Bu araç
       * çağrıldığında platformda hiçbir şey olmuyor; kullanıcı sohbetteki
       * onay kartını tıklayana kadar tek kuruş harcanmıyor. Canlı para
       * mutasyonlarının bu üründeki sözleşmesi bu.
       */
      name: 'boost_post',
      description:
        'Bir gönderiyi reklama çevirir (etkileşim kampanyası). PARA HARCAR: bu araç yalnızca ONAY KARTI üretir, kullanıcı kartı tıklamadan hiçbir şey yayınlanmaz. Önce list_boostable_posts ile gönderiyi bul.',
      inputSchema: {
        type: 'object',
        properties: {
          clientId: { type: 'string' },
          organicPostId: { type: 'string', description: 'list_boostable_posts sonucundaki id' },
          totalBudget: { type: 'string', description: 'TOPLAM bütçe, ana birimde ("300"). En az 20.' },
          durationDays: { type: 'number', description: 'Kaç gün yayında kalacak (1-30)' },
          sehirler: {
            type: 'array',
            items: { type: 'string' },
            description: 'Hedeflenecek şehir adları. Boşsa Türkiye geneli.',
          },
          yasMin: { type: 'number' },
          yasMax: { type: 'number' },
        },
        required: ['clientId', 'organicPostId', 'totalBudget', 'durationDays'],
      },
      permissions: ['boost.approve'],
      execute: (ctx, input) =>
        safe(async () => {
          const gonderiId = String(input.organicPostId);
          const liste = await deps.boosts.listBoostablePosts(ctx, {
            clientId: String(input.clientId),
            limit: 100,
          });
          const gonderi = liste.items.find((p) => p.id === gonderiId);
          if (!gonderi) {
            return {
              status: 'failed',
              reason: 'Gönderi bulunamadı — önce list_boostable_posts çağır ve oradaki id’yi kullan.',
            } as const;
          }
          /*
           * ENGEL ÖNCE KONTROL EDİLİYOR. Onay kartını basıp kullanıcıyı
           * tıklattıktan sonra reddetmek, harcama kararını verdirip sonra
           * "olmuyor" demek olurdu.
           */
          if (gonderi.blockedReason) {
            return { status: 'failed', reason: gonderi.blockedReason } as const;
          }

          const gun = Number(input.durationDays);
          const butce = String(input.totalBudget).replace(',', '.');
          const sehirAdlari = Array.isArray(input.sehirler)
            ? (input.sehirler as unknown[]).map(String).filter(Boolean)
            : [];

          /*
           * ═══ ŞEHİR ADI META ANAHTARINA ÇEVRİLİYOR ═══
           *
           * Meta hedeflemede şehir ADI kabul etmiyor, kendi anahtarını
           * istiyor. Çeviremediğimiz bir adı SESSİZCE DÜŞÜRMEK, kullanıcının
           * "İzmir'e ver" dediği reklamı Türkiye geneline açmak olurdu —
           * bütçenin nereye gittiği tamamen değişir ve hiçbir hata da
           * görünmez. Çözülemeyen ad varsa kart HİÇ üretilmiyor.
           */
          const lokasyonlar: Array<{ key: string; type: 'country' | 'region' | 'city' }> = [];
          const cozulemeyen: string[] = [];
          if (sehirAdlari.length > 0) {
            if (!gonderi.adAccountId) {
              return {
                status: 'failed',
                reason: 'Gönderinin bağlı olduğu reklam hesabı okunamadı, şehir hedeflemesi yapılamıyor.',
              } as const;
            }
            for (const ad of sehirAdlari) {
              const sonuclar = await deps.connections.searchGeoLocations(
                ctx,
                gonderi.adAccountId,
                ad,
              );
              const ilk = sonuclar[0];
              /*
               * TÜRÜ DARALTIYORUZ. `GeoLocationOption.type` düz `string`;
               * boost şeması yalnızca üç değeri kabul ediyor ve bilinmeyen
               * bir tür (Meta bölge/posta kodu da döndürebiliyor) şemadan
               * geçmeyip isteği en son anda düşürürdü. Tanımadığımız türü
               * ÇÖZÜLEMEDİ sayıyoruz: kullanıcı adı netleştirsin.
               */
              const tur =
                ilk && (ilk.type === 'city' || ilk.type === 'region' || ilk.type === 'country')
                  ? ilk.type
                  : null;
              if (ilk && tur) lokasyonlar.push({ key: ilk.key, type: tur });
              else cozulemeyen.push(ad);
            }
          }
          if (cozulemeyen.length > 0) {
            return {
              status: 'failed',
              reason:
                `Şu yerleri Meta'da bulamadım: ${cozulemeyen.join(', ')}. ` +
                'Adı farklı yazmayı dene ya da şehir vermeden (Türkiye geneli) devam edelim.',
            } as const;
          }

          const nereye =
            lokasyonlar.length > 0 ? sehirAdlari.join(', ') : 'Türkiye geneli';

          return {
            status: 'pending_confirmation',
            confirmationId: randomUUID(),
            summary:
              `${gonderi.socialProfileName} gönderisi ${gun} gün boyunca ` +
              `TOPLAM ${butce} ₺ bütçeyle reklama çevrilecek · ${nereye}`,
            detail: {
              kind: 'boost',
              boost: {
                clientId: String(input.clientId),
                organicPostId: gonderiId,
                totalBudget: butce,
                durationDays: gun,
                // ÇÖZÜLMÜŞ ANAHTARLAR SAKLANIYOR, ADLAR DEĞİL: onay saniyeler
                // sonra geliyor ve aramayı ikinci kez yapmak, arada değişen
                // bir sonuçla farklı bir yere harcamak demek olurdu.
                lokasyonlar,
                yasMin: typeof input.yasMin === 'number' ? input.yasMin : 18,
                yasMax: typeof input.yasMax === 'number' ? input.yasMax : 65,
              },
            },
          } as const;
        }),
    },

    {
      name: 'create_creative',
      description:
        'Sohbete eklenen görsellerden (assetIds) ve üretilen reklam metninden bir kreatif kaydı oluşturur. Bu kreatif daha sonra create_draft_campaign/duplicate_draft tarafından referans alınır.',
      inputSchema: {
        type: 'object',
        properties: {
          clientId: { type: 'string' },
          name: { type: 'string', description: 'Kreatif için kısa bir ad (kütüphanede görünecek)' },
          primaryText: { type: 'string', description: 'Reklamın ana metni' },
          headline: { type: 'string' },
          description: { type: 'string' },
          assetIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Sohbete eklenen, zaten yüklenmiş görsellerin kimlikleri',
          },
        },
        required: ['clientId', 'name', 'primaryText', 'assetIds'],
      },
      permissions: ['bulk.write'],
      execute: (ctx, input) =>
        safe(async () => {
          const assetIds = Array.isArray(input.assetIds) ? (input.assetIds as string[]) : [];
          if (assetIds.length === 0) {
            return {
              status: 'failed',
              reason: 'En az bir görsel gerekiyor — sohbete görsel eklenmemiş.',
            } as const;
          }
          const record = await deps.creatives.create(ctx, {
            clientId: String(input.clientId),
            name: String(input.name),
            texts: {
              primaryText: String(input.primaryText),
              headlines: input.headline ? [String(input.headline)] : [],
              longHeadlines: [],
              descriptions: input.description ? [String(input.description)] : [],
            },
            assetIds,
          });
          return { status: 'success', targetId: record.id, data: { id: record.id, name: record.name } } as const;
        }),
    },

    {
      name: 'create_draft_campaign',
      description:
        "Hedef, hesap ve bütçeden bir kampanya TASLAĞI oluşturur — PLATFORMA YAYINLAMAZ. Kullanıcı panelde inceleyip kendisi yayınlamalı. Hedefleme/optimizasyon SORULMAZ, goal'a göre otomatik ayarlanır.",
      inputSchema: {
        type: 'object',
        properties: {
          clientId: { type: 'string' },
          name: { type: 'string' },
          goal: { type: 'string', enum: ['form', 'whatsapp', 'website'] },
          targets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                platform: { type: 'string', enum: ['meta', 'google'] },
                adAccountId: { type: 'string' },
                dailyBudget: { type: 'string', description: "Günlük bütçe, ör. '500' ya da '500.50'" },
              },
              required: ['platform', 'adAccountId', 'dailyBudget'],
            },
            minItems: 1,
          },
          socialProfileId: { type: 'string', description: 'Meta reklamı için Facebook sayfası (Meta hedeflerinde zorunlu)' },
          creativeIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          durationDays: { type: 'number', description: '0 = süresiz. Belirtilmezse 7.' },
          linkUrl: { type: 'string', description: "goal='website' iken zorunlu" },
        },
        required: ['clientId', 'name', 'goal', 'targets', 'creativeIds'],
      },
      permissions: ['bulk.write'],
      execute: (ctx, input) =>
        safe(async () => {
          const targets = input.targets as Array<{ platform: string }>;
          const group = await deps.draftTree.createFromSimple(ctx, {
            clientId: String(input.clientId),
            name: String(input.name),
            goal: input.goal as 'form' | 'whatsapp' | 'website',
            targets: input.targets as never,
            socialProfileId: input.socialProfileId ? String(input.socialProfileId) : undefined,
            creativeIds: input.creativeIds as string[],
            durationDays: typeof input.durationDays === 'number' ? input.durationDays : 7,
            linkUrl: input.linkUrl ? String(input.linkUrl) : undefined,
          });
          if (group.campaigns.length === 0) {
            return {
              status: 'failed',
              reason: 'Hiçbir platformda taslak kurulamadı — seçilen hedef bu platformlarda çalışmıyor.',
            } as const;
          }
          const data = {
            groupId: group.groupId,
            campaigns: group.campaigns.map((c) => ({ id: c.id, platform: c.platform, status: c.status })),
          };
          // İSTENEN PLATFORM SAYISI < KURULAN — bazı platformlar hedefi
          // desteklemediği için sessizce atlandı (`DraftTreePlan.skipped`).
          // "Hepsine çıktım" sanmasın diye kısmi başarı ayrı bildiriliyor.
          if (group.campaigns.length < targets.length) {
            return {
              status: 'partial',
              reason: `${group.campaigns.length}/${targets.length} platformda taslak kuruldu — kalanı seçilen hedefi desteklemiyor.`,
              data,
            } as const;
          }
          return { status: 'success', targetId: group.campaigns[0]!.id, data } as const;
        }),
    },

    {
      name: 'duplicate_draft',
      description:
        'Var olan bir taslaktan varyasyon(lar) üretir — kullanıcı "bütçeyi/kreatifi değiştir" dediğinde YENİ bir taslak oluşturmanın yolu budur.',
      inputSchema: {
        type: 'object',
        properties: {
          sourceCampaignId: { type: 'string' },
          variants: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                budget: { type: 'string', description: 'Boşsa kaynağın bütçesi kullanılır' },
                creativeIds: { type: 'array', items: { type: 'string' } },
              },
              required: ['name'],
            },
            minItems: 1,
          },
        },
        required: ['sourceCampaignId', 'variants'],
      },
      permissions: ['bulk.write'],
      execute: (ctx, input) =>
        safe(async () => {
          const result = await deps.draftTree.duplicate(ctx, {
            sourceCampaignId: String(input.sourceCampaignId),
            variants: input.variants as never,
          });
          if (result.created.length === 0) {
            return {
              status: 'failed',
              reason: result.failed.map((f) => `${f.name}: ${f.reason}`).join(' '),
            } as const;
          }
          if (result.failed.length > 0) {
            return {
              status: 'partial',
              reason: `${result.created.length} varyasyon kuruldu, ${result.failed.length} kurulamadı: ${result.failed
                .map((f) => `${f.name} (${f.reason})`)
                .join(', ')}`,
              data: { created: result.created.map((c) => ({ id: c.id, name: c.name })) },
            } as const;
          }
          return {
            status: 'success',
            targetId: result.created[0]!.id,
            data: { created: result.created.map((c) => ({ id: c.id, name: c.name })) },
          } as const;
        }),
    },

    pendingConfirmationTool({
      name: 'pause_campaign',
      description: 'Yayındaki bir kampanyayı DURDURUR — platforma dokunmadan önce chat içi onay kartı gösterir.',
      campaignActions: deps.campaignActions,
      buildDetail: (summary) => ({ campaignId: summary.id, action: { type: 'pause' } }),
      summarize: (summary) => `"${summary.name}" kampanyasını durdur (${summary.platform}, şu an: ${summary.status}).`,
    }),

    pendingConfirmationTool({
      name: 'resume_campaign',
      description: 'Durdurulmuş bir kampanyayı YENİDEN BAŞLATIR — platforma dokunmadan önce chat içi onay kartı gösterir.',
      campaignActions: deps.campaignActions,
      buildDetail: (summary) => ({ campaignId: summary.id, action: { type: 'resume' } }),
      summarize: (summary) => `"${summary.name}" kampanyasını yeniden başlat (${summary.platform}, şu an: ${summary.status}).`,
    }),

    {
      name: 'update_budget',
      description:
        'Yayındaki bir kampanyanın bütçesini değiştirir — platforma dokunmadan önce eski/yeni değeri gösteren chat içi onay kartı döner.',
      inputSchema: {
        type: 'object',
        properties: {
          campaignId: { type: 'string' },
          amountMicros: { type: 'string', description: 'Yeni bütçe, micros cinsinden string (1 TL = 1000000)' },
          budgetMode: { type: 'string', enum: ['daily', 'lifetime'] },
        },
        required: ['campaignId', 'amountMicros', 'budgetMode'],
      },
      permissions: ['budget.write'],
      execute: (ctx, input) =>
        safe(async () => {
          // PANELLE AYNI SÜZGEÇ, İKİNCİ BİR KOPYA DEĞİL.
          //
          // Panel yolu gövdeyi `campaignActionInputSchema` ile süzüyordu, AI
          // yolu HİÇ süzmüyordu: LLM'in ürettiği "-100" geçerli bir BigInt
          // olduğu için NEGATİF BÜTÇE onay kartına ve oradan platforma
          // gidiyordu, "500.5" ise `BigInt()` içinde ham `SyntaxError`
          // fırlatıyordu. Burada ikinci bir doğrulama yazmak, iki yolun bir
          // gün ayrışması demekti (CLAUDE.md: "AYNI SÜZGECİ İKİ YERDE
          // YAZMA") — şemanın kendisi çağrılıyor, alt sınır değişirse iki
          // yol birden değişiyor.
          const parsed = safeParseBudget({
            type: 'set_budget',
            // YALNIZCA TÜR DÖNÜŞÜMÜ, DOĞRULAMA DEĞİL. Tool şeması string
            // istiyor ama LLM sık sık sayı üretiyor; sayıyı stringe çevirmek
            // geçerlilik kararı vermiyor — "-100" ve "500.5" hâlâ şemadan
            // dönüyor, "1e+21" de öyle.
            amountMicros:
              typeof input.amountMicros === 'number' ? String(input.amountMicros) : input.amountMicros,
            budgetMode: input.budgetMode,
          });
          if (!parsed.success) {
            // LLM'E HAM ZOD HATASI GİTMİYOR. Model okuduğu şeyi DÜZELTEBİLMELİ;
            // "invalid_string / regex" cümlesi ona ne yapacağını söylemiyor ve
            // aynı hatalı çağrıyı tekrar üretiyor.
            return {
              status: 'failed',
              reason:
                'Bütçe geçersiz. amountMicros yalnızca rakamlardan oluşan, sıfırdan BÜYÜK bir micros değeri olmalı (1 TL = 1000000, ör. "500000000"): eksi, ondalıklı ya da sıfır kabul edilmiyor. budgetMode "daily" ya da "lifetime" olmalı.',
            } as const;
          }
          const action = parsed.data;
          if (action.type !== 'set_budget') {
            // Ayrık birleşimde daralt: `type` sabit yazıldığı için bu dal
            // erişilemez, ama `as` ile zorlamak şema bir gün değiştiğinde
            // TypeScript'in uyarısını susturur.
            return { status: 'failed', reason: 'Bütçe aksiyonu çözümlenemedi.' } as const;
          }

          const summary = await deps.campaignActions.getSummary(ctx, String(input.campaignId));
          // PARA BİRİMİ HESAPTAN GELİYOR, SABİT DEĞİL. Sabit 'TRY' yazmak USD
          // bir hesapta kullanıcıya "2.000,00 ₺" gösterip platformda 2000 USD
          // uygulatıyordu; bu kart canlı para mutasyonundan önceki TEK insan
          // kontrolü ve yanlış birim gösteren bir kontrol, kontrol değil.
          const currency = summary.currency;
          const before = formatMoney(summary.budgetAmountMicros?.toString() ?? null, currency);
          const after = formatMoney(action.amountMicros, currency);
          const confirmationId = randomUUID();
          return {
            status: 'pending_confirmation',
            confirmationId,
            summary: `"${summary.name}" kampanyasının ${action.budgetMode === 'daily' ? 'günlük' : 'toplam'} bütçesini ${before} → ${after} yap.`,
            detail: {
              campaignId: summary.id,
              action: {
                type: 'set_budget',
                amountMicros: action.amountMicros,
                budgetMode: action.budgetMode,
              },
              before: {
                budgetMode: summary.budgetMode,
                budgetAmountMicros: summary.budgetAmountMicros?.toString() ?? null,
                currency,
              },
            },
          } as const;
        }),
    },
  ];
}

/**
 * `pause_campaign`/`resume_campaign` AYNI ŞEKİLDE kurulan iki tool — tek
 * yerden üretiliyor ki bir gün ikisinden biri güncellenip diğeri unutulmasın.
 */
function pendingConfirmationTool(opts: {
  name: string;
  description: string;
  campaignActions: CampaignActionsService;
  buildDetail: (summary: { id: string; name: string; platform: string; status: string }) => Record<string, unknown>;
  summarize: (summary: { id: string; name: string; platform: string; status: string }) => string;
}): ToolDefinition {
  return {
    name: opts.name,
    description: opts.description,
    inputSchema: {
      type: 'object',
      properties: { campaignId: { type: 'string', description: 'list_live_campaigns sonucundaki kampanya kimliği' } },
      required: ['campaignId'],
    },
    permissions: ['budget.write'],
    execute: (ctx, input) =>
      safe(async () => {
        const summary = await opts.campaignActions.getSummary(ctx, String(input.campaignId));
        return {
          status: 'pending_confirmation',
          confirmationId: randomUUID(),
          summary: opts.summarize(summary),
          detail: opts.buildDetail(summary),
        } as const;
      }),
  };
}
