import type { NiyetKodu } from '../reklam/meta/niyetler';
import { bulgulariSirala, type UyumBulgusu, type UyumDenetimi } from '../pilot/uyum';
import type { PlanOnerisi } from '../pilot/plan';
import type { PilotTaslak } from '../pilot/taslak';
import { KATALOG_SURUMU, UYUM_KATALOGU } from './katalog';
import type { UyumGirdisi, UyumKurali, UyumMetni, UyumPaketi, UyumProfili, UyumSatiri } from './tipler';

/**
 * ═══ `uyumDenetle` — TEK DENETÇİ (TASARIM.md §10.1.3) ═══
 *
 * SAF: ağ, saat, veritabanı yok. Panel, API onay kapısı ve kurulum işçisi
 * AYNI fonksiyonu çağırır; ikinci bir denetçi YAZILMAZ — burada ayrışma
 * para değil hukuki sorumluluk demek.
 *
 * PAKETLERİ KENDİSİ TÜRETİR (`etkinPaketler`). Çağıran paket seçmez;
 * seçseydi iki yüzde farklı paket koşabilirdi.
 *
 * SONUÇ BİR DENETİM, BOŞ DİZİ DEĞİL. "Denetlendi, bulgu yok" ile
 * "denetlenmedi" ayrı şeyler (`uyumDurumu(null) = 'bagli_degil'`); bu
 * fonksiyon her zaman bir `UyumDenetimi` döndürür ve içinde hangi katalog
 * sürümüyle, hangi içeriğe bakıldığı yazar.
 */
export function etkinPaketler(g: UyumGirdisi, p: UyumProfili): UyumPaketi[] {
  const s = new Set<UyumPaketi>(['GENEL']);
  const sektor = p.sektorler ?? [];
  const kat = p.ozelKategoriler ?? [];
  if (g.satirlar.some((x) => x.niyet === 'FORM')) s.add('FORM_KVKK');
  if (sektor.some((x) => x === 'KONUT_GELISTIRICI' || x === 'EMLAK_ARACI' || x === 'KISA_SURELI_KIRALIK') || kat.includes('HOUSING')) s.add('KONUT');
  if (kat.includes('FINANCIAL_PRODUCTS_SERVICES')) s.add('FINANS');
  if (sektor.includes('ETICARET')) s.add('ETICARET');
  if (sektor.includes('YEREL_HIZMET')) s.add('YEREL_HIZMET');
  // Sağlık paketi sağlık sektörlerinde VE "diğer"de koşar: medikal sözlük
  // sektör seçimi kaçırıldığında ikinci ağ (C-2).
  if (sektor.some((x) => x === 'SAGLIK_KURULUSU' || x === 'SAGLIK_MESLEK_MENSUBU' || x === 'DIGER')) s.add('SAGLIK');
  return [...s];
}

/**
 * Bir kuralın o günkü seviyesi. Yürürlüğü gelmemiş kural koşar ama BİLGİ
 * olarak görünür ve mesajın başında tarihi yazar; yürürlük günü
 * kendiliğinden sertleşir (deploy unutulsa da kural açılır).
 */
function seviyeVeMesaj(k: UyumKurali, bugun: string, ai: boolean): { seviye: UyumBulgusu['seviye']; mesaj: string } {
  if (k.yururlukTarihi > bugun) return { seviye: 'BILGI', mesaj: `${k.yururlukTarihi} itibarıyla zorunlu: ${k.mesaj}` };
  return { seviye: ai && k.aiUretimindeSeviye ? k.aiUretimindeSeviye : k.seviye, mesaj: k.mesaj };
}

export function uyumDenetle(g: UyumGirdisi, p: UyumProfili, katalogSurumu: string, zaman: string): UyumDenetimi {
  // Kodda tek katalog sürümü var; başka bir sürümle denetim istemek eski
  // raporu yeni kurallarla "yeniden üretmek" olurdu ve rapor değişmez olmalı.
  if (katalogSurumu !== KATALOG_SURUMU) throw new Error(`Bilinmeyen katalog sürümü: ${katalogSurumu} (kodda ${KATALOG_SURUMU})`);
  const paketler = new Set(etkinPaketler(g, p));
  const bulgular: UyumBulgusu[] = [];
  for (const k of UYUM_KATALOGU) {
    if (!paketler.has(k.paket)) continue;
    for (const r of k.denetle(g, p)) {
      const { seviye, mesaj } = seviyeVeMesaj(k, g.bugun, r.ai === true);
      bulgular.push({
        kuralKimligi: k.kimlik,
        seviye,
        durum: r.durum,
        yer: r.yer,
        mesaj: r.ek ? `${mesaj} (${r.ek})` : mesaj,
        neYapmali: k.neYapmali,
        kimCozer: k.kimCozer,
        dayanak: `${k.dayanak.metin}, ${k.dayanak.madde}${k.hukukGorusu === 'gerekli' ? ' · Hukuk görüşü bekleniyor' : ''}`,
      });
    }
  }
  return { katalogSurumu, icerikOzeti: g.icerikOzeti, zaman, bulgular: bulgulariSirala(bulgular) };
}

// ─── Plan ve taslaktan denetim girdisi ─────────────────────────────────────

/** Kitle şablonu bilgisi (çağıran `audience_templates`ten okur). */
export interface UyumKitleBilgisi {
  yasMin: number;
  yasMax: number;
  cinsiyet: string;
  ozelKitleVar: boolean;
}

const SISTEM: UyumMetni['uretici'] = 'sistem';

/**
 * Plan → denetim girdisi. Planda reklam metni YOK; denetlenen metinler
 * satır adı, kitle adı, Google kelimeleri ve yapay zekânın gerekçe
 * paragrafı. Kitle bilgisi okunamayan Meta satırı `kitle: null` taşır ve
 * yaş/kısıt kuralları o satırda sessiz kalır — bu yüzden çağıran kitlesi
 * silinmiş satırı ZATEN kurulamaz sayıyor (plan engeli), uyum ikinci kapı.
 */
export function planUyumGirdisi(
  plan: PlanOnerisi,
  icerikOzeti: string,
  bugun: string,
  kitleler: ReadonlyMap<string, UyumKitleBilgisi>,
): UyumGirdisi {
  const satirlar: UyumSatiri[] = plan.satirlar.map((s) => {
    const kitleId = s.kitle?.dolu ? s.kitle.deger.id : null;
    const metinler: UyumMetni[] = [{ alan: 'ad', metin: s.ad, uretici: SISTEM }];
    if (s.kitle?.dolu) metinler.push({ alan: 'kitle', metin: s.kitle.deger.ad, uretici: SISTEM });
    if (s.kelimeGrubu) for (const k of s.kelimeGrubu.kelimeler.deger) metinler.push({ alan: 'kelime', metin: k, uretici: SISTEM });
    // REKLAM METNİ PLANDA (karar (a), 2026-10-08): metin artık onaydan önce
    // var, yani metne bakan kurallar PLAN anında da koşar ve ENGEL/UYARI
    // müşteriye gitmeden ajansın önüne düşer. Önceden bu kurallar ilk kez
    // onaydan SONRA, işçide koşuyordu: onaylı plan uyumdan düşüyor ve
    // müşteri "onayladım, kurulmadı" görüyordu.
    if (s.metinler?.dolu) {
      const uretici: UyumMetni['uretici'] = s.metinler.kaynak.tur === 'yz_metin' ? 'ai' : 'kullanici';
      for (const m of s.metinler.deger) metinler.push({ alan: 'baslik', metin: m.baslik, uretici }, { alan: 'metin', metin: m.metin, uretici });
    }
    return {
      yer: s.anahtar,
      platform: s.platform,
      niyet: s.niyet.dolu ? s.niyet.deger : null,
      kitle: kitleId ? (kitleler.get(kitleId) ?? null) : null,
      metinler,
    };
  });
  const planMetinleri: UyumMetni[] = plan.ozetMetni.dolu ? [{ alan: 'ozet', metin: plan.ozetMetni.deger, uretici: 'ai' }] : [];
  return { an: 'plan', bugun, icerikOzeti, satirlar, planMetinleri };
}

/**
 * Taslak → denetim girdisi (kurulum işçisinin prova öncesi kapısı). Reklam
 * metni burada var ve kaynağı `yz_metin` ise `ai` sayılır: kişisel nitelik
 * kalıbı modelden geldiyse ENGEL (R6-O-52).
 */
export function taslakUyumGirdisi(
  t: PilotTaslak,
  icerikOzeti: string,
  bugun: string,
  kitle: UyumKitleBilgisi | null,
): UyumGirdisi {
  const uretici: UyumMetni['uretici'] = t.metinler.dolu && t.metinler.kaynak.tur === 'yz_metin' ? 'ai' : 'kullanici';
  const metinler: UyumMetni[] = [{ alan: 'ad', metin: t.ad, uretici: SISTEM }];
  if (t.metinler.dolu) {
    for (const m of t.metinler.deger) {
      metinler.push({ alan: 'baslik', metin: m.baslik, uretici }, { alan: 'metin', metin: m.metin, uretici });
    }
  }
  if (t.kelimeler) for (const k of t.kelimeler.deger) metinler.push({ alan: 'kelime', metin: k, uretici: SISTEM });
  if (t.hedefAdres.dolu) metinler.push({ alan: 'adres', metin: adresYolu(t.hedefAdres.deger), uretici: SISTEM });
  return {
    an: 'taslak',
    bugun,
    icerikOzeti,
    satirlar: [{ yer: t.satirAnahtari, platform: t.platform, niyet: t.niyet.dolu ? (t.niyet.deger as NiyetKodu) : null, kitle, metinler }],
    planMetinleri: [],
  };
}

/** Site adresinin YOLU sinyal kaynağı ("/kiralik-daire"); alan adı değil. */
function adresYolu(adres: string): string {
  // `URL` shared'ın derleme hedefinde yok (tarayıcı ve Node ortak alt küme);
  // yol düz desenle alınıyor. Çözülemeyen yüzde kodlaması metni olduğu gibi bırakır.
  const yol = /^https?:\/\/[^/?#]+([^?#]*)/i.exec(adres)?.[1] ?? '';
  let cozulmus = yol;
  try {
    cozulmus = decodeURIComponent(yol);
  } catch {
    // bozuk kodlama: ham yol sinyal için yeterli
  }
  return cozulmus.replace(/[-_/]+/g, ' ').trim();
}
