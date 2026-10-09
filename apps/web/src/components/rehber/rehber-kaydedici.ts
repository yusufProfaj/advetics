/**
 * Rehberin KAYDEDİCİSİ — her alan değişikliği `PUT /reklam/rehberler/:id`.
 *
 * React'ten ayrı bir sınıf, çünkü bütün zor kararlar burada ve panelde
 * bileşen render eden test altyapısı yok: debounce, aynı alanın
 * birleştirilmesi, tek uçuşta tek istek, 409 ve hata sonrası kuyruğun
 * korunması. Bileşen yalnız `abone` olup `durum()`u çiziyor
 * (`useSyncExternalStore`).
 *
 * KURALLAR:
 * - Tek seferde TEK istek. İki PUT aynı `surum` ile uçarsa ikincisi kendi
 *   değişikliği yüzünden 409 alır ve kullanıcıya "başka bir sekmede değişti"
 *   denir — yalan bir çatışma.
 * - 409 = başka bir sekme ya da kişi yazdı. Sessizce ezmek yok, kendiliğinden
 *   yeniden denemek yok: kullanıcı yeniler. Bekleyen değişiklikler GÖNDERİLMEZ.
 * - Başka bir hata (ağ, 5xx, doğrulama) kuyruğu SİLMEZ: düşen değişiklikler
 *   sonradan gelenlerin ALTINA geri konur, bir sonraki değişiklik ya da
 *   "Tekrar dene" hepsini birlikte gönderir. Kullanıcının yazdığı kaybolmaz.
 * - "Taslak kaydedildi" yalnız sunucu cevap verdikten sonra yazılır.
 */
import type { RehberGuncelle, RehberKaydi } from '@advetics/shared';
import { ISTEK_BASINA_DEGISIKLIK, degisiklikBirlestir, kayitHatasi, type Degisiklik } from './rehber-mantik';

export type KayitHali =
  | { tur: 'kaydedildi' }
  /** Değişiklik var, debounce süresi dolmadı. */
  | { tur: 'bekliyor' }
  | { tur: 'kaydediliyor' }
  | { tur: 'hata'; mesaj: string }
  | { tur: 'catisma' };

export interface KaydediciDurumu {
  kayit: RehberKaydi;
  /** Henüz sunucuya yazılmamış (uçuştaki dahil) değişiklikler. */
  bekleyen: Degisiklik[];
  hal: KayitHali;
}

export interface Zamanlayici {
  kur(fn: () => void, ms: number): unknown;
  iptal(kimlik: unknown): void;
}

const tarayiciZamanlayicisi: Zamanlayici = {
  kur: (fn, ms) => setTimeout(fn, ms),
  iptal: (k) => clearTimeout(k as ReturnType<typeof setTimeout>),
};

/** Sözleşmedeki debounce (MIMARI-REHBER § 7). */
export const KAYIT_GECIKMESI_MS = 600;

export class RehberKaydedici {
  private kayit: RehberKaydi;
  private kuyruk: Degisiklik[] = [];
  private ucusta: Degisiklik[] = [];
  private hal: KayitHali = { tur: 'kaydedildi' };
  private zaman: unknown = null;
  private acele = false;
  private bekleyenler: Array<(tamam: boolean) => void> = [];
  private dinleyiciler = new Set<() => void>();
  private anlik: KaydediciDurumu;

  constructor(
    ilk: RehberKaydi,
    private readonly gonder: (govde: RehberGuncelle) => Promise<RehberKaydi>,
    private readonly secenek: { gecikme?: number; zamanlayici?: Zamanlayici } = {},
  ) {
    this.kayit = ilk;
    this.anlik = this.olustur();
  }

  /** Kararlı nesne: değişiklik olmadıkça aynı referans (`useSyncExternalStore`). */
  durum = (): KaydediciDurumu => this.anlik;

  abone = (fn: () => void): (() => void) => {
    this.dinleyiciler.add(fn);
    return () => this.dinleyiciler.delete(fn);
  };

  degistir(yeni: readonly Degisiklik[]): void {
    if (yeni.length === 0) return;
    this.kuyruk = degisiklikBirlestir(this.kuyruk, yeni);
    // Çatışmada hiçbir şey gönderilmez; değişiklik ekranda görünür ama
    // kayda girmez ve ekran bunu söyler.
    if (this.hal.tur === 'catisma') return this.yay();
    if (this.ucusta.length === 0) this.hal = { tur: 'bekliyor' };
    this.zamanla();
    this.yay();
  }

  /**
   * Bekleyen her şeyi HEMEN yazar (prova, yayın ve kapat öncesi): prova eski
   * içeriğe yapılırsa sonucu yeni içeriğin özetiyle eşleşmez ve Yayınla hiç
   * açılmaz. Her şey yazılınca `true`; hata ya da çatışmada `false`.
   */
  simdi(): Promise<boolean> {
    if (this.hal.tur === 'catisma') return Promise.resolve(false);
    this.zamaniIptal();
    if (this.kuyruk.length === 0 && this.ucusta.length === 0) {
      return Promise.resolve(this.hal.tur === 'kaydedildi');
    }
    this.acele = true;
    const p = new Promise<boolean>((coz) => this.bekleyenler.push(coz));
    void this.gonderSirada();
    return p;
  }

  /** Hata sonrası elle tekrar. Çatışmada işe yaramaz (yenilemek gerekir). */
  tekrarDene(): void {
    if (this.hal.tur !== 'hata') return;
    void this.simdi();
  }

  /**
   * Kayıt döndüren başka bir uç (`konum-esle`) sürümü artırdı: yeni kaydı
   * al ki sıradaki PUT eski sürümle gidip yalan bir 409 almasın. Bekleyen
   * değişiklikler korunur.
   */
  disaridan(kayit: RehberKaydi): void {
    if (kayit.surum < this.kayit.surum) return;
    this.kayit = kayit;
    this.yay();
  }

  private zamanla() {
    this.zamaniIptal();
    this.zaman = (this.secenek.zamanlayici ?? tarayiciZamanlayicisi).kur(() => {
      this.zaman = null;
      void this.gonderSirada();
    }, this.secenek.gecikme ?? KAYIT_GECIKMESI_MS);
  }

  private zamaniIptal() {
    if (this.zaman !== null) (this.secenek.zamanlayici ?? tarayiciZamanlayicisi).iptal(this.zaman);
    this.zaman = null;
  }

  private async gonderSirada(): Promise<void> {
    if (this.ucusta.length > 0 || this.kuyruk.length === 0 || this.hal.tur === 'catisma') return;
    this.ucusta = this.kuyruk.slice(0, ISTEK_BASINA_DEGISIKLIK);
    this.kuyruk = this.kuyruk.slice(ISTEK_BASINA_DEGISIKLIK);
    this.hal = { tur: 'kaydediliyor' };
    this.yay();
    try {
      const yeni = await this.gonder({ surum: this.kayit.surum, degisiklikler: this.ucusta });
      this.kayit = yeni;
      this.ucusta = [];
    } catch (e) {
      const h = kayitHatasi(e);
      // Düşen değişiklikler, sonradan gelenlerin ALTINA: aynı alan için
      // kullanıcının daha yeni yazdığı kazanır.
      this.kuyruk = degisiklikBirlestir(this.ucusta, this.kuyruk);
      this.ucusta = [];
      this.zamaniIptal();
      this.acele = false;
      this.hal = h.tur === 'catisma' ? { tur: 'catisma' } : { tur: 'hata', mesaj: h.mesaj };
      this.bitir(false);
      return;
    }
    if (this.kuyruk.length > 0) {
      // Uçuş sırasında yeni değişiklik geldi. Acele varsa ya da zamanlayıcı
      // zaten dolmuşsa hemen; yoksa kullanıcı hâlâ yazıyor, zamanlayıcıyı bekle.
      if (this.acele || this.zaman === null) {
        this.zamaniIptal();
        return this.gonderSirada();
      }
      this.hal = { tur: 'bekliyor' };
      this.yay();
      return;
    }
    this.acele = false;
    this.hal = { tur: 'kaydedildi' };
    this.bitir(true);
  }

  private bitir(tamam: boolean) {
    const b = this.bekleyenler;
    this.bekleyenler = [];
    this.yay();
    for (const coz of b) coz(tamam);
  }

  private olustur(): KaydediciDurumu {
    return { kayit: this.kayit, bekleyen: degisiklikBirlestir(this.ucusta, this.kuyruk), hal: this.hal };
  }

  private yay() {
    this.anlik = this.olustur();
    for (const fn of this.dinleyiciler) fn();
  }
}
