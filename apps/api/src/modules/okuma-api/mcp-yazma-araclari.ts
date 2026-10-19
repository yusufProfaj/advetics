import { z } from 'zod';
import { REHBER_AMAC_KODLARI, REHBER_AMACLARI } from '@advetics/shared';
import type { McpAraci } from './mcp-protokol';
import { AracArgumanHatasi, nesne, suz } from './okuma-araclari';

/**
 * ═══ YAZMA ARAÇLARI — YALNIZ YAZMA ANAHTARINA ═══
 * (`docs/okuma-api/MCP-YAZMA-MIMARI.md` § 3)
 *
 * Okuma araçları gibi her araç BİR KEZ tanımlanıyor; çalıştırıcı yalnız
 * argümanı süzüp `YazmaOrtami`na devrediyor. İş (kapsam, izin, ön kontrol,
 * onay satırı) ortamın içinde, yani `McpYazmaService`te: orası panelin
 * KULLANDIĞI servisleri çağırıyor (`RehberService`, `CampaignActionsService`,
 * `AssetsService`). Burada yeni bir yazma yolu YOK; olsaydı panelin bir
 * kapısı (şalter, sahiplik, prova) bir gün burada eksik kalırdı.
 *
 * PLATFORMA DOKUNAN DÖRT ARAÇ (`ONAYLI_ARACLAR`) HİÇBİR ŞEYİ HEMEN YAPMAZ:
 * onay satırı açar ve özeti döner. Uygulama yalnız `onayla` ile.
 */

/** Platforma dokunan araçlar. `onayla` olmadan hiçbiri platforma bir şey göndermez. */
export const ONAYLI_ARACLAR = ['rehber_yayinla', 'varlik_durdur', 'varlik_etkinlestir', 'butce_degistir'] as const;

export type VarlikSeviyesi = 'campaign' | 'ad_group' | 'ad';

/** Aracın dış dünyadan aldığı ortam — servis kuruyor, test sahtesini veriyor. */
export interface YazmaOrtami {
  yazmaDurumu(workspaceId: string): Promise<unknown>;
  rehberler(workspaceId: string): Promise<unknown>;
  rehberOku(workspaceId: string, rehberId: string): Promise<unknown>;
  rehberOlustur(workspaceId: string, kaynakRehberId: string | null): Promise<unknown>;
  rehberGuncelle(
    workspaceId: string,
    rehberId: string,
    surum: number,
    degisiklikler: Array<{ alan: string; deger: unknown; sil: boolean }>,
  ): Promise<unknown>;
  konumEsle(workspaceId: string, rehberId: string): Promise<unknown>;
  metinOner(workspaceId: string, rehberId: string, varlikId: string | null, mod: 'yeni' | 'yeniden_yaz'): Promise<unknown>;
  anahtarKelimeOner(workspaceId: string, rehberId: string, tohumlar: string[] | null): Promise<unknown>;
  formSablonlari(workspaceId: string, sayfaId: string): Promise<unknown>;
  pikseller(workspaceId: string, reklamHesabiId: string): Promise<unknown>;
  youtubeVideolari(workspaceId: string, kanalId: string): Promise<unknown>;
  prova(workspaceId: string, rehberId: string): Promise<unknown>;
  provaOku(workspaceId: string, rehberId: string): Promise<unknown>;
  yayinDurumu(workspaceId: string, rehberId: string): Promise<unknown>;
  kampanyalar(workspaceId: string): Promise<unknown>;
  yuklemeAdresi(workspaceId: string): Promise<unknown>;
  /** Onay satırı açar; platforma YAZMAZ. */
  yayinOnayi(workspaceId: string, rehberId: string): Promise<unknown>;
  varlikOnayi(
    workspaceId: string,
    seviye: VarlikSeviyesi,
    varlikId: string,
    islem: { tur: 'durdur' } | { tur: 'etkinlestir' } | { tur: 'butce'; micros: bigint; tip: 'gunluk' | 'toplam' },
  ): Promise<unknown>;
  onayla(onayKodu: string): Promise<unknown>;
  vazgec(onayKodu: string): Promise<unknown>;
  onaylar(): Promise<unknown>;
}

export interface YazmaAraci extends McpAraci {
  calistir(args: unknown, ortam: YazmaOrtami): Promise<unknown>;
}

const uuid = z.string().uuid('UUID biçiminde olmalı');
const SEVIYELER = ['campaign', 'ad_group', 'ad'] as const;

const JS_WS = { workspace_id: { type: 'string', description: 'Workspace kimliği (UUID). Liste: `kapsam` aracı.' } } as const;
const JS_REHBER = { ...JS_WS, rehber_id: { type: 'string', description: 'Rehber kimliği (UUID). Liste: `rehberler`.' } } as const;
const JS_VARLIK = {
  ...JS_WS,
  seviye: { type: 'string', enum: [...SEVIYELER], description: 'campaign (kampanya), ad_group (reklam seti / grup), ad (reklam).' },
  varlik_id: { type: 'string', description: 'Advetics kimliği (UUID; platformun numarası DEĞİL). Kampanyalar: `kampanyalar` ya da `varlik_kirilimi`.' },
} as const;

const OKUMA = { saltOkuma: true, yikici: false, tekrarlanabilir: true } as const;
/** Platforma yazmıyor ama Advetics'te iz bırakıyor (rehber sürümü, varlık, onay satırı). */
const TASLAK = { saltOkuma: false, yikici: false, tekrarlanabilir: false } as const;
const YIKICI = { saltOkuma: false, yikici: true, tekrarlanabilir: false } as const;

const AMAC_LISTESI = REHBER_AMAC_KODLARI.map((k) => `${k} (${REHBER_AMACLARI[k].ekranAdi})`).join(', ');

/**
 * Rehber alanlarının modele anlatımı. Biçimi şema DOĞRULUYOR
 * (`degisiklikleriUygula`); burası yalnız modelin ilk denemede doğru
 * yazabilmesi için. Hatalı değer düz Türkçe hatayla geri döner.
 */
const ALAN_REHBERI = [
  `amac: ${AMAC_LISTESI}`,
  'platformlar: {"meta": true, "google": false}',
  'metaHesabiId / googleHesabiId / sayfaId / instagramId / youtubeKanaliId: `yazma_durumu` listelerindeki Advetics kimlikleri',
  'butce: {"tip": "gunluk" | "toplam", "micros": "500000000"} (micros DİZGE, 500.000.000 = 500 birim; hesabın para birimiyle)',
  'metaPayiYuzde: 10–90 (iki platform açıkken Meta\'nın payı)',
  'takvim: {"baslangic": "YYYY-MM-DD", "bitis": "YYYY-MM-DD" | null}',
  'konumlar: [{"tur": "country"|"region"|"city"|"custom", "key": "...", "etiket": "İzmir", "ulkeKodu": "TR"}] (Meta konum anahtarı; Google karşılığı için sonra `konum_esle`)',
  'enDusukYas: 18–65 · yasAraligi: {"min": 25, "max": 45} | null',
  'ekKategoriler: [] ya da HOUSING, EMPLOYMENT, FINANCIAL_PRODUCTS_SERVICES, ISSUES_ELECTIONS_POLITICS (sorulmadan doldurma)',
  'hedefAdres: "https://..." · telefon / whatsappNumarasi: "+905321234567"',
  'formSablonuId: Meta form kimliği (`form_sablonlari`) · pikselId: Meta piksel kimliği (`pikseller`)',
  'medya: [{"varlikId": "<uuid>"}] (yüklenen görsel/video; videoda isteğe bağlı "kapakVarlikId")',
  'youtubeVideo: {"videoId": "...", "baslik": "..."} (Google video reklamı; `youtube_videolari`)',
  'metin: {"anaMetin": "...", "basliklar": ["..."], "aciklamalar": ["..."]}',
  'anahtarKelimeler: [{"metin": "...", "aylikArama": null}] (Google Arama)',
].join('\n');

export const YAZMA_ARACLARI: readonly YazmaAraci[] = [
  {
    ad: 'yazma_durumu',
    baslik: 'Reklam kurmaya hazırlık',
    aciklama:
      'Workspace\'in reklam kurmak için elindekiler: Meta ve Google hesapları (para birimiyle), Facebook sayfaları, Instagram ve YouTube hesapları, görsel arşivi, ön koşullar, Marka Merkezi iletişim bilgisi, asgari günlük bütçe, yazma şalterleri. Reklam kurmadan ÖNCE çağır.',
    girdi: nesne({ ...JS_WS }, ['workspace_id']),
    isaret: OKUMA,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid }, args);
      return o.yazmaDurumu(a.workspace_id);
    },
  },
  {
    ad: 'rehberler',
    baslik: 'Reklam rehberleri',
    aciklama: 'Workspace\'in reklam rehberleri (taslak, yayında, arşiv); her satırda amaç, platformlar, eksik sayısı, yayın durumu. Toplam ayrıca yazılı.',
    girdi: nesne({ ...JS_WS }, ['workspace_id']),
    isaret: OKUMA,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid }, args);
      return o.rehberler(a.workspace_id);
    },
  },
  {
    ad: 'rehber_oku',
    baslik: 'Rehberi oku',
    aciklama: 'Tek rehberin alanları, eksikleri (seviye "engel" olanlar yayını durdurur), sürümü (`rehber_guncelle` için) ve içerik özeti.',
    girdi: nesne({ ...JS_REHBER }, ['workspace_id', 'rehber_id']),
    isaret: OKUMA,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, rehber_id: uuid }, args);
      return o.rehberOku(a.workspace_id, a.rehber_id);
    },
  },
  {
    ad: 'rehber_olustur',
    baslik: 'Yeni reklam rehberi',
    aciklama: 'Boş bir reklam rehberi açar (platforma bir şey göndermez). `kaynak_rehber_id` verilirse o rehberin içeriği kopyalanır (takvim hariç).',
    girdi: nesne(
      { ...JS_WS, kaynak_rehber_id: { type: 'string', description: 'İsteğe bağlı: içeriği kopyalanacak rehber.' } },
      ['workspace_id'],
    ),
    isaret: TASLAK,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, kaynak_rehber_id: uuid.optional() }, args);
      return o.rehberOlustur(a.workspace_id, a.kaynak_rehber_id ?? null);
    },
  },
  {
    ad: 'rehber_guncelle',
    baslik: 'Rehber alanlarını yaz',
    aciklama: `Rehberin alanlarını yazar ya da siler (platforma bir şey göndermez). "surum" rehber_oku'daki sürüm; rehber başka yerde değiştiyse hata döner, yeniden oku. Değerleri KULLANICININ söylediğinden yaz, tahmin etme. Alanlar:\n${ALAN_REHBERI}`,
    girdi: nesne(
      {
        ...JS_REHBER,
        surum: { type: 'integer', description: 'rehber_oku / önceki rehber_guncelle cevabındaki sürüm.' },
        alanlar: { type: 'object', description: 'Yazılacak alanlar: {"alan_adi": değer}. En çok 30.', additionalProperties: true },
        sil: { type: 'array', items: { type: 'string' }, description: 'Silinecek alan adları.' },
      },
      ['workspace_id', 'rehber_id', 'surum'],
    ),
    isaret: TASLAK,
    calistir: (args, o) => {
      const a = suz(
        {
          workspace_id: uuid,
          rehber_id: uuid,
          surum: z.number().int().nonnegative(),
          alanlar: z.record(z.string().max(40), z.unknown()).optional(),
          sil: z.array(z.string().max(40)).max(30).optional(),
        },
        args,
      );
      const degisiklikler = [
        ...Object.entries(a.alanlar ?? {}).map(([alan, deger]) => ({ alan, deger, sil: false })),
        ...(a.sil ?? []).map((alan) => ({ alan, deger: null, sil: true })),
      ];
      if (degisiklikler.length === 0) throw new AracArgumanHatasi('Yazılacak ya da silinecek alan yok: "alanlar" ya da "sil" ver.');
      return o.rehberGuncelle(a.workspace_id, a.rehber_id, a.surum, degisiklikler);
    },
  },
  {
    ad: 'konum_esle',
    baslik: 'Konumların Google karşılığı',
    aciklama: 'Rehberdeki konumları Google Ads konum hedeflerine eşler (Google açıksa yayından önce gerekli). Rehbere yazar, platforma göndermez.',
    girdi: nesne({ ...JS_REHBER }, ['workspace_id', 'rehber_id']),
    isaret: TASLAK,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, rehber_id: uuid }, args);
      return o.konumEsle(a.workspace_id, a.rehber_id);
    },
  },
  {
    ad: 'metin_oner',
    baslik: 'Reklam metni öner',
    aciklama: 'Rehberin görselleri ve amacından ana metin, başlık ve açıklama ÖNERİR; rehbere YAZMAZ. Kullanıcı beğenirse `rehber_guncelle` ile "metin" alanına yaz.',
    girdi: nesne(
      {
        ...JS_REHBER,
        varlik_id: { type: 'string', description: 'İsteğe bağlı: yalnız bu görsel için öneri.' },
        mod: { type: 'string', enum: ['yeni', 'yeniden_yaz'], description: 'yeniden_yaz: öncekinden farklı bir varyant.' },
      },
      ['workspace_id', 'rehber_id'],
    ),
    isaret: OKUMA,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, rehber_id: uuid, varlik_id: uuid.optional(), mod: z.enum(['yeni', 'yeniden_yaz']).optional() }, args);
      return o.metinOner(a.workspace_id, a.rehber_id, a.varlik_id ?? null, a.mod ?? 'yeni');
    },
  },
  {
    ad: 'anahtar_kelime_oner',
    baslik: 'Anahtar kelime öner',
    aciklama: 'Google Keyword Planner\'dan aylık aramasıyla anahtar kelime fikri (Google Arama için). Rehbere YAZMAZ.',
    girdi: nesne(
      { ...JS_REHBER, tohumlar: { type: 'array', items: { type: 'string' }, description: 'En çok 10 tohum kelime; boşsa site adresinden.' } },
      ['workspace_id', 'rehber_id'],
    ),
    isaret: OKUMA,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, rehber_id: uuid, tohumlar: z.array(z.string().trim().min(1).max(80)).max(10).optional() }, args);
      return o.anahtarKelimeOner(a.workspace_id, a.rehber_id, a.tohumlar ?? null);
    },
  },
  {
    ad: 'form_sablonlari',
    baslik: 'Meta formları',
    aciklama: 'Seçili Facebook sayfasının Meta\'daki yayında formları ("Form doldursunlar" amacı için formSablonuId).',
    girdi: nesne({ ...JS_WS, sayfa_id: { type: 'string', description: 'Advetics sayfa kimliği (`yazma_durumu`).' } }, ['workspace_id', 'sayfa_id']),
    isaret: OKUMA,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, sayfa_id: uuid }, args);
      return o.formSablonlari(a.workspace_id, a.sayfa_id);
    },
  },
  {
    ad: 'pikseller',
    baslik: 'Meta pikselleri',
    aciklama: 'Seçili Meta reklam hesabının pikselleri ve son 7 günlük satın alma durumu ("Satış" amacı için pikselId).',
    girdi: nesne({ ...JS_WS, reklam_hesabi_id: { type: 'string', description: 'Advetics Meta hesap kimliği.' } }, ['workspace_id', 'reklam_hesabi_id']),
    isaret: OKUMA,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, reklam_hesabi_id: uuid }, args);
      return o.pikseller(a.workspace_id, a.reklam_hesabi_id);
    },
  },
  {
    ad: 'youtube_videolari',
    baslik: 'YouTube videoları',
    aciklama: 'Bağlı YouTube kanalının videoları (Google video reklamı için youtubeVideo alanı).',
    girdi: nesne({ ...JS_WS, kanal_id: { type: 'string', description: 'Advetics YouTube kanal kimliği (`yazma_durumu`).' } }, ['workspace_id', 'kanal_id']),
    isaret: OKUMA,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, kanal_id: uuid }, args);
      return o.youtubeVideolari(a.workspace_id, a.kanal_id);
    },
  },
  {
    ad: 'rehber_prova',
    baslik: 'Platform provası',
    aciklama: 'Rehberi Meta ve Google\'a NESNE AÇMADAN doğrulatır. Yayından önce zorunlu; rehber değişirse prova bayatlar. Meta provası kuyrukta koşar: sonuç "bekliyor" ise birkaç saniye sonra `rehber_prova_oku`.',
    girdi: nesne({ ...JS_REHBER }, ['workspace_id', 'rehber_id']),
    isaret: TASLAK,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, rehber_id: uuid }, args);
      return o.prova(a.workspace_id, a.rehber_id);
    },
  },
  {
    ad: 'rehber_prova_oku',
    baslik: 'Son prova',
    aciklama: 'Rehberin son provasının sonucu (hiç yapılmadıysa null).',
    girdi: nesne({ ...JS_REHBER }, ['workspace_id', 'rehber_id']),
    isaret: OKUMA,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, rehber_id: uuid }, args);
      return o.provaOku(a.workspace_id, a.rehber_id);
    },
  },
  {
    ad: 'yukleme_adresi',
    baslik: 'Görsel/video yükleme adresi',
    aciklama: 'Bu workspace\'in Varlıklar arşivine dosya yüklemek için 15 dakika geçerli adres ve hazır curl komutu. Dosyayı KENDİ KABUĞUNDA komutla yükle (birden çok dosya için komutu tekrarla); cevaptaki varlik_id\'yi rehberin "medya" alanına yaz. JPEG/PNG (kısa kenar ≥ 600 px, ≤ 30 MB) ve MP4/MOV (≤ 200 MB).',
    girdi: nesne({ ...JS_WS }, ['workspace_id']),
    isaret: TASLAK,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid }, args);
      return o.yuklemeAdresi(a.workspace_id);
    },
  },
  {
    ad: 'rehber_yayin_durumu',
    baslik: 'Yayın durumu',
    aciklama: 'Rehberin her platformdaki kurulum durumu ve sebebi; kurulan kampanyanın platform kimliği ve (yapı taraması gördüyse) Advetics kampanya kimliği (`varlik_etkinlestir` için).',
    girdi: nesne({ ...JS_REHBER }, ['workspace_id', 'rehber_id']),
    isaret: OKUMA,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, rehber_id: uuid }, args);
      return o.yayinDurumu(a.workspace_id, a.rehber_id);
    },
  },
  {
    ad: 'kampanyalar',
    baslik: 'Kampanyalar ve durumları',
    aciklama: 'Workspace\'in kampanyaları (harcaması olmayanlar dahil): durum, platformun uyguladığı durum, bütçe. Durdur/başlat/bütçe için kimlik buradan.',
    girdi: nesne({ ...JS_WS }, ['workspace_id']),
    isaret: OKUMA,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid }, args);
      return o.kampanyalar(a.workspace_id);
    },
  },
  {
    ad: 'rehber_yayinla',
    baslik: 'Rehberi yayınla (onaylı)',
    aciklama: 'ONAY İSTER, HEMEN YAPMAZ. Ön kontrolü (eksikler, prova, şalter) yapıp bir onay_kodu ve özet döner. Özeti kullanıcıya göster, "Onaylıyor musunuz?" diye sor; evet derse `onayla`. Yayın DURAKLATILMIŞ kurulur.',
    girdi: nesne({ ...JS_REHBER }, ['workspace_id', 'rehber_id']),
    isaret: TASLAK,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, rehber_id: uuid }, args);
      return o.yayinOnayi(a.workspace_id, a.rehber_id);
    },
  },
  {
    ad: 'varlik_durdur',
    baslik: 'Durdur (onaylı)',
    aciklama: 'ONAY İSTER, HEMEN YAPMAZ. Kampanya, reklam seti ya da reklamı duraklatmak için onay_kodu ve özet döner; kullanıcı evet derse `onayla`.',
    girdi: nesne({ ...JS_VARLIK }, ['workspace_id', 'seviye', 'varlik_id']),
    isaret: TASLAK,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, seviye: z.enum(SEVIYELER), varlik_id: uuid }, args);
      return o.varlikOnayi(a.workspace_id, a.seviye, a.varlik_id, { tur: 'durdur' });
    },
  },
  {
    ad: 'varlik_etkinlestir',
    baslik: 'Başlat (onaylı)',
    aciklama: 'ONAY İSTER, HEMEN YAPMAZ. Duraklatılmış kampanya, reklam seti ya da reklamı yayına almak (HARCAMA BAŞLAR) için onay_kodu ve özet döner; kullanıcı evet derse `onayla`.',
    girdi: nesne({ ...JS_VARLIK }, ['workspace_id', 'seviye', 'varlik_id']),
    isaret: TASLAK,
    calistir: (args, o) => {
      const a = suz({ workspace_id: uuid, seviye: z.enum(SEVIYELER), varlik_id: uuid }, args);
      return o.varlikOnayi(a.workspace_id, a.seviye, a.varlik_id, { tur: 'etkinlestir' });
    },
  },
  {
    ad: 'butce_degistir',
    baslik: 'Bütçe değiştir (onaylı)',
    aciklama: 'ONAY İSTER, HEMEN YAPMAZ. Kampanya ya da reklam seti bütçesini değiştirmek için eski → yeni değer ve değişim yüzdesiyle onay_kodu döner; kullanıcı evet derse `onayla`. Tutar hesabın para biriminde, micros dizge.',
    girdi: nesne(
      {
        ...JS_VARLIK,
        seviye: { type: 'string', enum: ['campaign', 'ad_group'], description: 'Bütçe kampanyada ya da reklam setinde (reklamın bütçesi yok).' },
        tutar_micros: { type: 'string', description: 'Yeni tutar, micros dizge (750.000.000 = 750 birim).' },
        butce_tipi: { type: 'string', enum: ['gunluk', 'toplam'] },
      },
      ['workspace_id', 'seviye', 'varlik_id', 'tutar_micros', 'butce_tipi'],
    ),
    isaret: TASLAK,
    calistir: (args, o) => {
      const a = suz(
        {
          workspace_id: uuid,
          seviye: z.enum(['campaign', 'ad_group']),
          varlik_id: uuid,
          tutar_micros: z.string().regex(/^\d{1,18}$/, 'micros dizge, yalnız rakam'),
          butce_tipi: z.enum(['gunluk', 'toplam']),
        },
        args,
      );
      const micros = BigInt(a.tutar_micros);
      if (micros <= 0n) throw new AracArgumanHatasi('Bütçe sıfırdan büyük olmalı. Durdurmak için `varlik_durdur`.');
      return o.varlikOnayi(a.workspace_id, a.seviye, a.varlik_id, { tur: 'butce', micros, tip: a.butce_tipi });
    },
  },
  {
    ad: 'onayla',
    baslik: 'Onayla ve uygula',
    aciklama: 'Kullanıcının AÇIKÇA onayladığı işlemi uygular (yayınla, durdur, başlat, bütçe). YALNIZ kullanıcı özeti gördükten sonra "evet" dediyse çağır. Argümanlar sunucuda saklı; kod tek kullanımlık, 15 dakika geçerli.',
    girdi: nesne({ onay_kodu: { type: 'string', description: 'Onaylı aracın döndürdüğü onay_kodu.' } }, ['onay_kodu']),
    isaret: YIKICI,
    calistir: (args, o) => {
      const a = suz({ onay_kodu: z.string().trim().min(1).max(64) }, args);
      return o.onayla(a.onay_kodu);
    },
  },
  {
    ad: 'vazgec',
    baslik: 'Onaydan vazgeç',
    aciklama: 'Kullanıcı onaylamadıysa bekleyen işlemi kapatır; hiçbir şey uygulanmaz.',
    girdi: nesne({ onay_kodu: { type: 'string' } }, ['onay_kodu']),
    isaret: TASLAK,
    calistir: (args, o) => {
      const a = suz({ onay_kodu: z.string().trim().min(1).max(64) }, args);
      return o.vazgec(a.onay_kodu);
    },
  },
  {
    ad: 'onaylar',
    baslik: 'Onay geçmişi',
    aciklama: 'Bu bağlantının son onay satırları: ne önerildi, durumu (bekliyor, uygulandı, başarısız, vazgeçildi, süresi doldu), hata.',
    girdi: nesne({}),
    isaret: OKUMA,
    calistir: (args, o) => {
      suz({}, args);
      return o.onaylar();
    },
  },
];

export function yazmaAraciBul(ad: string): YazmaAraci | undefined {
  return YAZMA_ARACLARI.find((a) => a.ad === ad);
}
