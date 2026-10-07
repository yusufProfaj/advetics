import {
  AKTARIM_ATLAMA_NEDENLERI,
  NIYET_KATALOGU,
  aktarimEngeli,
  HUNI_KATMANLARI,
  STRATEJI_PLATFORMLARI,
  STRATEJI_UCLARI,
  dagilimToplamDenetimi,
  duzenlenebilirMi,
  kelimeAraSchema,
  matrisButceDenetimi,
  matrisSatiriGirdiSchema,
  paraOndaligi,
  tutarAyristir,
  type AktarimAtlamaNedeni,
  type AktarimSonucu,
  type DagilimBosNedeni,
  type DagilimKaynagi,
  type DagilimSatiri,
  type HuniKatmani,
  type KelimeSatiri,
  type MatrisSatiri,
  type PlanDetayi,
  type NiyetKodu,
  type PlanDurumu,
  type PlanEylemi,
  type PlanOzeti,
  type StratejiPlatformu,
} from '@advetics/shared';
import { API_URL, ApiRequestError } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';

/**
 * ═══ ADVSTRATEGY EKRANININ SAF KARARLARI ═══
 *
 * Panelde bileşen render eden test altyapısı yok (`vitest.config.ts` bunu
 * bilinçli reddediyor). Effect ya da JSX içinde duran bir karar yalnızca
 * kaynak taramasıyla sınanabiliyor ve o tarama yanlış şeyi kilitleyebiliyor
 * (CLAUDE.md, `domaYazilmali` dersi). Bu yüzden "hangi bölüm açık", "kalan mı
 * aşım mı", "hangi düğme çizilecek", "409 mu" gibi her karar burada ve
 * `hesap.spec.ts` onları ÇALIŞTIRARAK sınıyor.
 */

// ─── Bölüm ve adres ─────────────────────────────────────────────────────────

/*
 * DÖRT BÖLÜM. `takvim` (sezon) üçüncü tura kaldı (MIMARI §6: `ozel_gunler`
 * boş); menüde görünüp tıklanınca boş açılan bir sekme, "menüde ekranı
 * olmayan satır" hatasının sayfa içi kopyası olurdu. Çalışmayan seçenek
 * gösterilmez; gelince bu listeye girer.
 *
 * SUNUM SONDA: planın iş sırası bütçe → kelime → matris → müşteriye sunum.
 */
export const STRATEJI_BOLUMLERI = [
  { kod: 'butce', ad: 'Bütçe dağılımı' },
  { kod: 'arama', ad: 'Google arama' },
  { kod: 'matris', ad: 'Kitle ve kreatif' },
  { kod: 'sunum', ad: 'Sunum' },
] as const;
export type StratejiBolumu = (typeof STRATEJI_BOLUMLERI)[number]['kod'];

/**
 * Adresteki bölüm. Tanınmayan değer (ör. henüz olmayan `?bolum=takvim`)
 * ilk bölüme düşer: paylaşılmış bir bağlantı boş sayfa açmamalı.
 */
export function bolumCoz(raw: string | undefined): StratejiBolumu {
  return STRATEJI_BOLUMLERI.find((b) => b.kod === raw)?.kod ?? 'butce';
}

/**
 * `/strateji` içindeki bir yerin adresi. `musteri` TAŞINIYOR: sayfa aktif
 * workspace'i `params.musteri ?? session.activeClientId` sırasıyla çözüyor ve
 * parametresiz bir bağlantı, başka sekmede başka workspace seçmiş kullanıcıyı
 * sessizce başka bir workspace'in planına götürürdü (Marka Merkezi'nin
 * `mmAdresi` gerekçesiyle aynı). Elle birleştirme yok: `baglanti`.
 */
export function stratejiAdresi(
  clientId: string,
  hedef: { plan?: string | undefined; bolum?: StratejiBolumu | undefined },
): string {
  return baglanti('/strateji', { musteri: clientId, plan: hedef.plan, bolum: hedef.bolum });
}

/*
 * API YOLLARI SÖZLEŞMEDEN. Tip `STRATEJI_UCLARI`daki yolların birleşimi;
 * listede olmayan bir yol (ör. "/strateji/plan/:id") DERLENMİYOR. Elle yazılan
 * yol ile controller'ın yolu ayrışırsa istek 404 alır ve ekran bunu
 * "plan yok" diye okuyabilirdi.
 */
export type StratejiYolu = (typeof STRATEJI_UCLARI)[number]['yol'];

export function ucAdresi(yol: StratejiYolu, id?: string): string {
  if (yol.includes(':id')) {
    if (!id) throw new Error(`${yol} bir plan kimliği istiyor`);
    return yol.replace(':id', encodeURIComponent(id));
  }
  return yol;
}

/**
 * Adresteki plan. Bulunamazsa (silinmiş, iptal edilip listeden düşmüş ya da
 * başka workspace'in kimliği) en yeni plan açılıyor AMA bu SÖYLENİYOR:
 * sessizce başka bir plan göstermek, kullanıcıya paylaşılan planı
 * okuduğunu sandırırdı.
 */
export function planSec(
  planlar: readonly PlanOzeti[],
  raw: string | undefined,
): { plan: PlanOzeti | null; adrestekiYok: boolean } {
  const bulunan = raw ? planlar.find((p) => p.id === raw) : undefined;
  if (bulunan) return { plan: bulunan, adrestekiYok: false };
  return { plan: planlar[0] ?? null, adrestekiYok: Boolean(raw) };
}

// ─── Durum, eylem, onay ─────────────────────────────────────────────────────

export const DURUM_ETIKETI: Record<PlanDurumu, { metin: string; ton: 'notr' | 'uyari' | 'tamam' | 'bilgi' | 'kapali' }> = {
  taslak: { metin: 'Taslak', ton: 'notr' },
  onayda: { metin: 'Onay bekliyor', ton: 'uyari' },
  onaylandi: { metin: 'Onaylandı', ton: 'tamam' },
  aktarildi: { metin: 'AdvCampaign’e aktarıldı', ton: 'bilgi' },
  iptal: { metin: 'İptal edildi', ton: 'kapali' },
};

/*
 * SIRA SABİT, LİSTE SUNUCUDAN. Düğmeler YALNIZCA `PlanDetayi.yapilabilir`
 * içindeki eylemlerden çiziliyor: durum × yetki kararı sunucuda veriliyor ve
 * panel onu ikinci kez hesaplamıyor. Panel `PLAN_GECISLERI`ne bakıp kendi
 * listesini kursaydı yetkiyi bilmezdi; müşteri hesabı "Aktar"ı görüp 403
 * alırdı. Buradaki dizi yalnızca GÖRÜNÜŞ sırası.
 */
const EYLEM_SIRASI: readonly PlanEylemi[] = ['onaya_gonder', 'onayla', 'aktar', 'geri_cek', 'iptal'];

const EYLEM_GORUNUSU: Record<PlanEylemi, { etiket: string; ton: 'birincil' | 'ikincil' | 'tehlike' }> = {
  onaya_gonder: { etiket: 'Onaya gönder', ton: 'birincil' },
  onayla: { etiket: 'Planı onayla', ton: 'birincil' },
  aktar: { etiket: 'AdvCampaign’e aktar', ton: 'birincil' },
  geri_cek: { etiket: 'Onaydan geri çek', ton: 'ikincil' },
  iptal: { etiket: 'Planı iptal et', ton: 'tehlike' },
};

export function eylemDugmeleri(
  yapilabilir: readonly PlanEylemi[],
): Array<{ eylem: PlanEylemi; etiket: string; ton: 'birincil' | 'ikincil' | 'tehlike' }> {
  const izinli = new Set(yapilabilir);
  return EYLEM_SIRASI.filter((e) => izinli.has(e)).map((e) => ({ eylem: e, ...EYLEM_GORUNUSU[e] }));
}

/**
 * Eylemin gideceği uç. `onayla` KENDİ UCUNDA (`strategy.approve`); `/eylem`
 * ucunun şeması onu reddediyor. İkisini aynı uca göndermek onayı her zaman
 * 400'e düşürürdü.
 */
export function eylemIstegi(
  planId: string,
  eylem: PlanEylemi,
  surum: number,
): { yol: string; govde: { surum: number; eylem?: PlanEylemi } } {
  if (eylem === 'onayla') return { yol: ucAdresi('/strateji/planlar/:id/onayla', planId), govde: { surum } };
  return { yol: ucAdresi('/strateji/planlar/:id/eylem', planId), govde: { eylem, surum } };
}

/**
 * Düzenleme kilidinin NEDENİ. `null` = düzenlenebilir. Alanlar salt okunur
 * olduğunda kullanıcı nedenini görmeli; gri ve tıklanmayan bir kutu "bozuk"
 * diye okunuyor.
 */
export function duzenlemeKilidi(durum: PlanDurumu, yazabilir: boolean): string | null {
  if (!yazabilir) return 'Bu planı görebilirsin ama değiştirme yetkin yok.';
  if (duzenlenebilirMi(durum)) return null;
  switch (durum) {
    case 'onayda':
      return 'Plan onay bekliyor. Değiştirmek için önce onaydan geri çekilmeli.';
    case 'onaylandi':
      return 'Plan onaylandı. Onaylanan plan değiştirilemez.';
    case 'aktarildi':
      return 'Plan AdvCampaign’e aktarıldı. Değiştirilemez.';
    case 'iptal':
      return 'Plan iptal edildi. Değiştirilemez.';
    default:
      return 'Plan bu durumda değiştirilemez.';
  }
}

const TR_ZAMAN = new Intl.DateTimeFormat('tr-TR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  // SAAT DİLİMİ AÇIK: istemci bileşeni önce sunucuda çiziliyor. Dilim
  // verilmezse sunucunun dilimiyle çizilen saat tarayıcıda başka çıkar.
  timeZone: 'Europe/Istanbul',
});

export function zamanMetni(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'zaman bilinmiyor' : TR_ZAMAN.format(d);
}

/**
 * "Müşteri hesabı onayladı" ile "Ajans onayladı" AYRI cümle: ikisi aynı
 * belge değil (sözleşmedeki `onaylayan.rol` gerekçesi). "Müşteri hesabı"
 * terimi `client_viewer` rolüyle açılmış giriş hesabı (`terminoloji.spec.ts`).
 */
export function onayMetni(onaylayan: PlanOzeti['onaylayan']): string | null {
  if (!onaylayan) return null;
  const kim = onaylayan.rol === 'musteri' ? 'Müşteri hesabı onayladı' : 'Ajans onayladı';
  const ad = onaylayan.ad ? ` (${onaylayan.ad})` : '';
  return `${kim}${ad} · ${zamanMetni(onaylayan.zaman)}`;
}

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "2026-11" → "Kasım 2026". Date'e çevrilmiyor: saat dilimi ayı kaydırabilir. */
export function donemEtiketi(donem: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(donem);
  const ay = m ? AY_ADLARI[Number(m[2]) - 1] : undefined;
  return m && ay ? `${ay} ${m[1]}` : donem;
}

/**
 * Yeni plan formunun varsayılan ayı: "gelecek ay", İSTANBUL saatiyle. Sayfa
 * bunu SUNUCUDA hesaplayıp veriyor; istemcide hesaplamak ay dönümünde
 * sunucunun çizdiğinden farklı bir değer üretip hidrasyonu bozardı.
 */
export function gelecekAy(simdi: Date): string {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit' })
    .format(simdi)
    .split('-')
    .map(Number);
  if (!y || !m) throw new Error('Ay hesaplanamadı');
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export const AKTARIM_NEDEN_METNI: Record<AktarimAtlamaNedeni, string> = {
  niyet_desteklenmiyor: 'AdvCampaign bu reklam amacını henüz kuramıyor',
  platform_kapali: 'AdvCampaign Google’da henüz açık değil',
  kaynak_silinmis: 'kitle ya da görsel plan onaylandıktan sonra silinmiş',
  butce_sifir: 'bütçesi sıfır',
};

/** Atlanan satır SAYILIR ve nedeni yazılır: "12 satırdan 9'u" sessiz kesme değil. */
export function aktarimOzeti(a: AktarimSonucu): { baslik: string; nedenler: string[] } {
  const toplam = a.aktarilan.length + a.atlanan.length;
  const baslik =
    a.atlanan.length === 0
      ? `${toplam} satırın hepsi AdvCampaign’e aktarıldı.`
      : `${toplam} satırdan ${a.aktarilan.length} tanesi aktarıldı, ${a.atlanan.length} tanesi atlandı.`;
  // Önizleme ile AYNI özet: önce gösterilen neden ile sonra yazılan ayrışmasın.
  return { baslik, nedenler: nedenOzeti(a.atlanan.map((x) => x.neden)) };
}

// ─── Yazma hatası ve sürüm çakışması ─────────────────────────────────────────

export const CAKISMA_METNI = 'Plan başka biri tarafından değiştirildi, yenileyin.';

/**
 * SÜRÜM ÇAKIŞMASI AYRI BİR HÂL — AMA 409 TEK BAŞINA ONU SÖYLEMİYOR.
 *
 * Her yazma gövdesi `surum` taşıyor ve sunucu uyuşmazlıkta 409 dönüyor. Ama
 * API 409'u beş ayrı durumda kullanıyor (sürüm uyuşmazlığı, o ay için açık
 * plan var, plan düzenlenemez, arama zaten sürüyor, geçersiz geçiş) ve hata
 * kodu hepsinde aynı. Her 409'a "başkası değiştirdi" demek, "arama zaten
 * sürüyor" diyen sunucuyu susturup kullanıcıyı olmayan bir çakışmayı
 * aramaya gönderirdi.
 *
 * AYIRAN ŞEY VERİ: 409'dan sonra plan yeniden okunuyor ve sürüm,
 * gönderdiğimizden FARKLIYSA gerçekten başkası yazmış demektir. Mesaj
 * metnine bakmıyoruz: sunucunun cümlesi değişince ayrım sessizce bozulurdu.
 * Çakışmada ekran kullanıcının yazdığına DOKUNMUYOR; hangisinin kalacağına
 * kullanıcı karar veriyor.
 */
export function yazmaHatasiSinifla(
  err: unknown,
  gonderilenSurum: number | null,
  tazeSurum: number | null,
): { cakisma: boolean; mesaj: string } {
  if (!(err instanceof ApiRequestError)) return { cakisma: false, mesaj: 'Sunucuya ulaşılamadı.' };
  if (err.status === 409 && gonderilenSurum !== null && tazeSurum !== null && tazeSurum !== gonderilenSurum) {
    return { cakisma: true, mesaj: CAKISMA_METNI };
  }
  return { cakisma: false, mesaj: err.message };
}

/** 409'dan sonra planı yeniden okumak gerekiyor mu (ayrım için ve ekranı tazelemek için). */
export function yenidenOkunmali(err: unknown): boolean {
  return err instanceof ApiRequestError && err.status === 409;
}

export function okumaHatasi(err: unknown): string {
  return err instanceof ApiRequestError ? err.message : 'Sunucuya ulaşılamadı.';
}

// ─── Para ───────────────────────────────────────────────────────────────────

export type TutarDurumu = { tur: 'bos' } | { tur: 'tamam'; micros: bigint } | { tur: 'hata'; mesaj: string };

/**
 * Kullanıcının yazdığı tutar. Boş alan "bu hücreye bütçe yok" demek ve hata
 * DEĞİL; tutarın kendisi `tutarAyristir` ile çözülüyor (sunucunun kullandığı
 * aynı ayrıştırıcı). İkinci bir ayrıştırıcı yazmak, ekranın kabul ettiği
 * "1.5"i sunucunun reddetmesi demekti.
 */
export function tutarCoz(metin: string, paraBirimi: string): TutarDurumu {
  if (metin.trim() === '') return { tur: 'bos' };
  const r = tutarAyristir(metin, paraBirimi);
  return r.tur === 'tamam' ? { tur: 'tamam', micros: r.micros } : { tur: 'hata', mesaj: r.mesaj };
}

/**
 * Micros → giriş kutusunun metni ("1.500" / "1.500,50"). `tutarAyristir`in
 * GERİ okuyabildiği biçim: kayıtlı tutarı kutuya koyup hiç dokunmadan
 * kaydetmek aynı micros'u üretmeli. Para birimi işareti yok, çünkü kutu
 * yalnız sayı kabul ediyor.
 *
 * Birimin ondalığından fazla kesir varsa (ör. 1,234567 ₺) KIRPILMIYOR:
 * kırpmak tutarı sessizce değiştirirdi. Metin ayrıştırıcıya hata olarak
 * döner ve kullanıcı görür.
 */
export function microsGirdiMetni(micros: string | bigint, paraBirimi: string): string {
  const m = typeof micros === 'bigint' ? micros : BigInt(micros);
  const tam = (m / 1_000_000n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const kesir6 = (m % 1_000_000n).toString().padStart(6, '0');
  const ondalik = paraOndaligi(paraBirimi);
  const fazlasi = kesir6.slice(ondalik).replace(/0+$/, '');
  const kesir = fazlasi ? kesir6.slice(0, ondalik) + fazlasi : kesir6.slice(0, ondalik);
  return /^0*$/.test(kesir) ? tam : `${tam},${kesir}`;
}

/**
 * Toplam / dağıtılan / kalan ya da aşım. Kararı sözleşmenin
 * `dagilimToplamDenetimi` veriyor; burada yalnızca ekrana hazırlanıyor.
 */
export function butceOzeti(
  toplamMicros: string,
  satirlarMicros: readonly bigint[],
): { dagitilanMicros: bigint; durum: 'tam' | 'kalan' | 'asim'; farkMicros: bigint } {
  const toplam = BigInt(toplamMicros);
  const d = dagilimToplamDenetimi(satirlarMicros, toplam);
  const dagitilan = satirlarMicros.reduce((a, b) => a + b, 0n);
  if (!d.tamam) return { dagitilanMicros: dagitilan, durum: 'asim', farkMicros: d.asimMicros };
  return { dagitilanMicros: dagitilan, durum: d.kalanMicros === 0n ? 'tam' : 'kalan', farkMicros: d.kalanMicros };
}

// ─── Bütçe dağılımı ─────────────────────────────────────────────────────────

export type Hucre = `${StratejiPlatformu}:${HuniKatmani}`;
export const HUCRELER: ReadonlyArray<{ anahtar: Hucre; platform: StratejiPlatformu; katman: HuniKatmani }> =
  STRATEJI_PLATFORMLARI.flatMap((platform) =>
    HUNI_KATMANLARI.map((katman) => ({ anahtar: `${platform}:${katman}` as Hucre, platform, katman })),
  );

/**
 * Hücrenin taslak hâli. `kaynak` ekranda etiket: "Geçmiş veri" ya da "Elle".
 * Kullanıcı bir hücreye dokunduğu anda `elle` olur; öneri sonra yeniden
 * uygulanırsa o hücreyi EZMEZ.
 */
export interface DagilimHucresi {
  metin: string;
  kaynak: DagilimKaynagi | null;
  gerekce: string | null;
}

export function dagilimTaslagi(
  satirlar: readonly DagilimSatiri[],
  paraBirimi: string,
): Record<Hucre, DagilimHucresi> {
  const taslak = Object.fromEntries(
    HUCRELER.map((h) => [h.anahtar, { metin: '', kaynak: null, gerekce: null }]),
  ) as Record<Hucre, DagilimHucresi>;
  for (const s of satirlar) {
    taslak[`${s.platform}:${s.katman}`] = {
      metin: microsGirdiMetni(s.tutarMicros, paraBirimi),
      kaynak: s.kaynak,
      gerekce: s.gerekce,
    };
  }
  return taslak;
}

/**
 * Öneriyi taslağa uygular — `elle` hücreler HARİÇ. Sözleşmenin kuralı:
 * "öneri elle satırların üstüne yazılmaz; kullanıcının kararı sessizce
 * silinmesin". Atlanan hücre SAYILIR ve ekranda söylenir.
 */
export function oneriyiUygula(
  taslak: Record<Hucre, DagilimHucresi>,
  oneri: readonly DagilimSatiri[],
  paraBirimi: string,
): { taslak: Record<Hucre, DagilimHucresi>; korunanElle: number } {
  const yeni = { ...taslak };
  let korunanElle = 0;
  for (const s of oneri) {
    const k: Hucre = `${s.platform}:${s.katman}`;
    if (yeni[k].kaynak === 'elle') {
      korunanElle++;
      continue;
    }
    yeni[k] = { metin: microsGirdiMetni(s.tutarMicros, paraBirimi), kaynak: 'gecmis_veri', gerekce: s.gerekce };
  }
  return { taslak: yeni, korunanElle };
}

export const DAGILIM_BOS_METNI: Record<DagilimBosNedeni, string> = {
  hesap_yok: 'Bu workspace’e atanmış Meta ya da Google reklam hesabı yok. Öneri geçmiş veriden üretiliyor; dağılımı elle yaz.',
  veri_yok: 'Hesaplarda son 90 günde harcama yok, öneri üretilemedi. Dağılımı elle yaz.',
  donusum_yok: 'Son 90 günde harcama var ama sonuç yok. Hangi platformun daha çok getirdiği söylenemiyor.',
  karisik_birim: 'Hesaplar farklı para birimi kullanıyor. Kur çevrimi yapılmadığı için öneri üretilmedi.',
};

// ─── Google arama ───────────────────────────────────────────────────────────

export const REKABET_ETIKETI: Record<NonNullable<KelimeSatiri['rekabet']>, string> = {
  LOW: 'düşük',
  MEDIUM: 'orta',
  HIGH: 'yüksek',
};

/**
 * `null` = Google değer vermedi; "veri yok" yazılır, SIFIR DEĞİL. Sıfır
 * kelimeyi haksız yere elerdi. Hacimler yuvarlanmış kova değerleri
 * (ölçüldü 2026-10-08), o yüzden "yaklaşık".
 */
export function aylikAramaMetni(n: number | null): string {
  if (n === null) return 'veri yok';
  return `yaklaşık ${n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}`;
}

/**
 * Tohum metni → liste. Satır ya da virgülle ayrılıyor; aynı kelime iki kez
 * yazıldıysa bir kez sayılıyor. Sınırlar sözleşmenin şemasından (1-20, en az
 * iki harf): ekran farklı sınır koyarsa sunucu ekranın kabul ettiğini
 * reddeder.
 */
export function tohumlariAyir(metin: string): { tur: 'tamam'; tohumlar: string[] } | { tur: 'hata'; mesaj: string } {
  const gorulen = new Set<string>();
  const tohumlar: string[] = [];
  for (const parca of metin.split(/[\n,]/)) {
    const t = parca.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    const k = t.toLocaleLowerCase('tr');
    if (gorulen.has(k)) continue;
    gorulen.add(k);
    tohumlar.push(t);
  }
  const r = kelimeAraSchema.safeParse({ tohumlar });
  if (!r.success) {
    const ilk = r.error.issues[0];
    // Tek kelimenin kısalığı/uzunluğu: hangisi olduğunu söyle.
    if (ilk && ilk.path.length > 1 && typeof ilk.path[1] === 'number') {
      return { tur: 'hata', mesaj: `"${tohumlar[ilk.path[1]]}": kelime 2 ile 80 harf arasında olmalı.` };
    }
    return { tur: 'hata', mesaj: ilk?.message ?? 'Kelimeler okunamadı.' };
  }
  return { tur: 'tamam', tohumlar: r.data.tohumlar };
}

/** Arama sürerken yoklama aralığı. Google 1 QPS; daha sık sormak işi hızlandırmaz. */
export const YOKLAMA_MS = 4_000;

/** Kelime tablosunda yalnızca DEĞİŞEN satırlar gönderilir (`PATCH`, en çok 500). */
export function kelimeDegisiklikleri(
  satirlar: readonly KelimeSatiri[],
  taslak: Readonly<Record<string, { secili: boolean; grup: string }>>,
): Array<{ id: string; secili?: boolean; grup?: string | null }> {
  const sonuc: Array<{ id: string; secili?: boolean; grup?: string | null }> = [];
  for (const s of satirlar) {
    const t = taslak[s.id];
    if (!t) continue;
    const degisim: { id: string; secili?: boolean; grup?: string | null } = { id: s.id };
    if (t.secili !== s.secili) degisim.secili = t.secili;
    const grup = t.grup.trim() === '' ? null : t.grup.trim();
    if (grup !== s.grup) degisim.grup = grup;
    if (Object.keys(degisim).length > 1) sonuc.push(degisim);
  }
  return sonuc;
}

// ─── Matris ─────────────────────────────────────────────────────────────────

export interface MatrisTaslakSatiri {
  /** Ekrandaki satır kimliği (React anahtarı); sunucuya gitmez. */
  anahtar: string;
  platform: StratejiPlatformu;
  katman: HuniKatmani;
  niyet: NiyetKodu;
  kitleSablonuId: string | null;
  kelimeGrubu: string;
  varlikIdleri: string[];
  tutar: string;
  not: string;
}

export function matrisTaslagi(satirlar: readonly MatrisSatiri[], paraBirimi: string): MatrisTaslakSatiri[] {
  return satirlar.map((s) => ({
    anahtar: s.id,
    platform: s.platform,
    katman: s.katman,
    niyet: s.niyet,
    kitleSablonuId: s.kitle?.id ?? null,
    kelimeGrubu: s.kelimeGrubu ?? '',
    varlikIdleri: s.varliklar.map((v) => v.id),
    tutar: microsGirdiMetni(s.tutarMicros, paraBirimi),
    not: s.not ?? '',
  }));
}

/**
 * Hücre aşımı — CANLI. Kararı sözleşmenin `matrisButceDenetimi` fonksiyonu
 * veriyor; servis kayıtta AYNI fonksiyonu koşuyor. İkinci bir kopya yazmak,
 * ekranın "tamam" deyip sunucunun reddetmesi demekti.
 *
 * Dağılım KAYITLI hâlinden okunuyor (sunucunun karşılaştırdığı o). Tutarı
 * okunamayan satır hesaba katılamıyor; sayısı ayrıca dönüyor ki uyarı
 * "aşım yok" diye yanlış güven vermesin.
 */
export function matrisAsimlari(
  dagilim: readonly DagilimSatiri[],
  taslak: readonly MatrisTaslakSatiri[],
  paraBirimi: string,
): { asimlar: ReturnType<typeof matrisButceDenetimi>; okunamayan: number } {
  let okunamayan = 0;
  const matris: Array<{ platform: StratejiPlatformu; katman: HuniKatmani; tutarMicros: bigint }> = [];
  for (const s of taslak) {
    const t = tutarCoz(s.tutar, paraBirimi);
    if (t.tur === 'tamam') matris.push({ platform: s.platform, katman: s.katman, tutarMicros: t.micros });
    else okunamayan++;
  }
  const asimlar = matrisButceDenetimi(
    dagilim.map((d) => ({ platform: d.platform, katman: d.katman, tutarMicros: BigInt(d.tutarMicros) })),
    matris,
  );
  return { asimlar, okunamayan };
}

/**
 * Satırın gönderilecek gövdesi ve hatası — sözleşmenin şemasıyla. "Meta
 * satırında kitle seçilmeli" kuralı ekranda AYRICA yazılmıyor; şema
 * söylüyor, ekran şemanın cümlesini gösteriyor.
 */
export function matrisSatiriDogrula(
  s: MatrisTaslakSatiri,
): { tur: 'tamam'; govde: ReturnType<typeof matrisSatiriGirdiSchema.parse> } | { tur: 'hata'; mesaj: string } {
  const r = matrisSatiriGirdiSchema.safeParse({
    platform: s.platform,
    katman: s.katman,
    niyet: s.niyet,
    kitleSablonuId: s.kitleSablonuId,
    kelimeGrubu: s.kelimeGrubu.trim() === '' ? null : s.kelimeGrubu.trim(),
    varlikIdleri: s.varlikIdleri,
    tutar: s.tutar,
    ...(s.not.trim() ? { not: s.not.trim() } : {}),
  });
  if (r.success) return { tur: 'tamam', govde: r.data };
  const ilk = r.error.issues[0];
  if (ilk?.path[0] === 'tutar') return { tur: 'hata', mesaj: 'Tutar yazılmalı.' };
  return { tur: 'hata', mesaj: ilk?.message ?? 'Satır geçersiz.' };
}

/**
 * "KİTLE YOK" İLE "SİLİNMİŞ KİTLE" AYRI — ve ayrım PLATFORMDAN yapılıyor.
 *
 * Kitle şablonu silinince veritabanı (`ON DELETE SET NULL`) kimliği de
 * siliyor, yani sunucu silinmiş kitleyi `kitle: null` olarak döndürüyor; ad
 * olmadan `{ id, ad: null }` kurulamıyor. Meta satırında kitle ZORUNLU
 * olduğu için orada `null` yalnızca "silinmiş" demek olabilir; Google
 * satırında ise kelimeyle hedefleme. Tek tip "Kitle yok" yazmak, şablonu
 * silinmiş bir Meta satırını sağlam gösterir ve aktarımda neden atlandığı
 * anlaşılmazdı.
 */
const BOS_KITLE_ANLAMI: Record<StratejiPlatformu, string> = {
  meta: 'Silinmiş kitle',
  google: 'Kitle yok',
};

export function kitleMetni(
  platform: StratejiPlatformu,
  kitle: { id: string; ad: string | null } | null,
): string {
  // Platform başına tablo, ikili dallanma değil: üçüncü platform derlemede yakalanır.
  if (kitle === null) return BOS_KITLE_ANLAMI[platform];
  return kitle.ad ?? 'Silinmiş kitle';
}

// ─── Aktarım önizlemesi ─────────────────────────────────────────────────────

export interface AktarimOnizlemesi {
  gidecek: Array<{ id: string; baslik: string; tutarMicros: string }>;
  atlanacak: Array<{ id: string; baslik: string; neden: AktarimAtlamaNedeni }>;
  /** "2 satır: neden" — aktarım sonucundaki özetle AYNI metin tablosu. */
  nedenler: string[];
}

/**
 * Düğmeye basmadan ÖNCE "N satır gidecek, M atlanacak". Karar sözleşmenin
 * `aktarimEngeli` fonksiyonundan, servisin aktarımda koştuğu fonksiyonun
 * AYNISI: ekran ikinci bir kural yazsaydı önizleme "9 gidecek" deyip
 * aktarım 7 açabilirdi ve fark yalnız AdvCampaign'de fark edilirdi.
 *
 * Silinmiş görsel ADI `null` gelen görsel (sözleşme: "silinmişse null").
 * Var olanlar ile plandaki sayı ayrı veriliyor ki eksik kreatif seti
 * `kaynak_silinmis` sayılsın.
 */
export function aktarimOnizlemesi(detay: PlanDetayi): AktarimOnizlemesi {
  const gidecek: AktarimOnizlemesi['gidecek'] = [];
  const atlanacak: AktarimOnizlemesi['atlanacak'] = [];
  for (const s of detay.matris) {
    const kitleAdi = s.kitle?.ad ?? null;
    const baslik = `${NIYET_KATALOGU[s.niyet].ekranAdi} · ${kitleMetni(s.platform, s.kitle)}`;
    const neden = aktarimEngeli({
      platform: s.platform,
      katman: s.katman,
      niyet: s.niyet,
      kitleAdi,
      varlikIdleri: s.varliklar.filter((v) => v.ad !== null).map((v) => v.id),
      planlananVarlikSayisi: s.varliklar.length,
      tutarMicros: BigInt(s.tutarMicros),
      paraBirimi: detay.plan.paraBirimi,
      donem: detay.plan.donem,
      not: s.not,
    });
    if (neden === null) gidecek.push({ id: s.id, baslik, tutarMicros: s.tutarMicros });
    else atlanacak.push({ id: s.id, baslik, neden });
  }
  return { gidecek, atlanacak, nedenler: nedenOzeti(atlanacak.map((a) => a.neden)) };
}

function nedenOzeti(nedenler: readonly AktarimAtlamaNedeni[]): string[] {
  const say = new Map<AktarimAtlamaNedeni, number>();
  for (const n of nedenler) say.set(n, (say.get(n) ?? 0) + 1);
  return AKTARIM_ATLAMA_NEDENLERI.filter((n) => say.has(n)).map((n) => `${say.get(n)} satır: ${AKTARIM_NEDEN_METNI[n]}`);
}

// ─── Sunum (PDF) ────────────────────────────────────────────────────────────

/**
 * PDF ADRESİ TEK ÜRETİCİDEN. Rapor ekranında üç tüketici sorguyu ayrı ayrı
 * kuruyordu ve biri şablonu düşürüyordu (CLAUDE.md "AYNI BELGEYİ İSTEYEN HER
 * YOL AYNI SORGUYU KURMALI"). Bugün tek tüketici var; ikincisi (mail eki,
 * önizleme) geldiğinde de buradan almalı. `strateji-sayfasi.spec.ts`
 * `/pdf` dizgesinin başka dosyada geçmediğini kilitliyor.
 */
export function pdfAdresi(planId: string): string {
  return `${API_URL}${ucAdresi('/strateji/planlar/:id/pdf', planId)}`;
}

/** İndirilen dosyanın adı: "medya-plani-2026-11-s3.pdf". Sürüm adda: iki indirme karışmasın. */
export function pdfDosyaAdi(donem: string, surum: number): string {
  return `medya-plani-${donem}-s${surum}.pdf`;
}

/**
 * Belgenin taşıyacağı hâl. Taslak da iniyor (sözleşme) ama kapakta "TASLAK"
 * yazıyor; kullanıcı müşteriye göndermeden önce bunu bilmeli.
 */
export function sunumNotu(durum: PlanDurumu): { ton: 'uyari' | 'bilgi'; metin: string } {
  switch (durum) {
    case 'taslak':
      return { ton: 'uyari', metin: 'Plan taslak. PDF taslak olarak inecek ve kapağında TASLAK yazacak.' };
    case 'onayda':
      return { ton: 'bilgi', metin: 'Plan onay bekliyor. PDF onaya gönderilen sürümü taşır.' };
    case 'onaylandi':
      return { ton: 'bilgi', metin: 'PDF onaylanan sürümü ve onay bilgisini taşır.' };
    case 'aktarildi':
      return { ton: 'bilgi', metin: 'PDF onaylanıp AdvCampaign’e aktarılan sürümü taşır.' };
    case 'iptal':
      return { ton: 'uyari', metin: 'Plan iptal edildi. PDF yalnızca kayıt için.' };
  }
}

// ─── Kelime grupları ────────────────────────────────────────────────────────

export interface KelimeGrubu {
  /** Gruplama anahtarı: KAYITLI grup adı (`''` = grupsuz). Yazarken satırlar zıplamasın. */
  anahtar: string;
  satirlar: KelimeSatiri[];
  /** Hacmi bilinen satırların toplamı. Varyantlar zaten satırın içinde: toplama ikinci kez GİRMEZ. */
  toplamArama: number;
  seciliArama: number;
  /** Hacmi `null` olan satır sayısı: toplamın eksik olduğunu söylemek için. */
  veriYok: number;
  secili: number;
}

/** Grubu olmayan ya da kural gruplamasının "Diğer"i en sonda. */
export const DIGER_GRUBU = 'Diğer';

/**
 * Tablo grup grup. Grup SUNUCUDAN geliyor (deterministik kural, MIMARI
 * §6.2); ekran yeniden gruplamaz, yalnız gösterir ve toplar. Sıra toplam
 * hacme göre azalan: reklam bütçesi en çok aranana önce gider.
 *
 * VARYANTLAR TOPLANMAZ: "türk kahve makinesi" / "turk kahve makinesi"
 * Google'da AYNI metrik (ölçüldü 2026-10-08) ve tek satırda tutuluyor;
 * ikisini ayrı saymak grubun hacmini ikiye katlardı.
 */
export function kelimeGruplari(
  satirlar: readonly KelimeSatiri[],
  secim: Readonly<Record<string, { secili: boolean }>>,
): KelimeGrubu[] {
  const harita = new Map<string, KelimeGrubu>();
  for (const s of satirlar) {
    const anahtar = s.grup?.trim() ?? '';
    const g = harita.get(anahtar) ?? { anahtar, satirlar: [], toplamArama: 0, seciliArama: 0, veriYok: 0, secili: 0 };
    const secili = secim[s.id]?.secili ?? s.secili;
    g.satirlar.push(s);
    if (s.aylikArama === null) g.veriYok++;
    else {
      g.toplamArama += s.aylikArama;
      if (secili) g.seciliArama += s.aylikArama;
    }
    if (secili) g.secili++;
    harita.set(anahtar, g);
  }
  const sonda = (a: string) => (a === '' ? 2 : a === DIGER_GRUBU ? 1 : 0);
  return [...harita.values()].sort(
    (a, b) => sonda(a.anahtar) - sonda(b.anahtar) || b.toplamArama - a.toplamArama || a.anahtar.localeCompare(b.anahtar, 'tr'),
  );
}

/** Grup başlığındaki toplu seçim kutusunun hâli. */
export function grupSecimHali(g: Pick<KelimeGrubu, 'secili' | 'satirlar'>): 'hepsi' | 'hicbiri' | 'bazisi' {
  if (g.secili === 0) return 'hicbiri';
  return g.secili === g.satirlar.length ? 'hepsi' : 'bazisi';
}
