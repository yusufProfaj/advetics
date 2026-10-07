import { MetaBelirsizHata, MetaKesinHata, type MetaYazmaPortu } from '../src/modules/reklam/yayin-motoru';

/**
 * Reklam modülü testleri için SAHTE META: gönderileni saklar ve geri
 * okumada aynen döndürür ("kusursuz Meta"); testler sapma enjekte eder.
 */
export type Kayit = { uc: string; alanlar: Record<string, unknown>; status: string };
export class SahteMeta implements MetaYazmaPortu {
  kayitlar = new Map<string, Kayit>();
  private sayac = 1000;
  olusturHatasi: ((uc: string) => { hata: Error; yineDeOlustur?: number } | null) | null = null;
  okumaBozucu: ((id: string, o: Record<string, unknown>) => Record<string, unknown>) | null = null;
  durumHatasi: ((id: string) => boolean) | null = null;
  postSayisi = 0;
  acmaSirasi: string[] = [];

  async gorselYukle(_h: string, varlik: string) {
    return `hash-${varlik.slice(0, 8)}`;
  }
  async olustur(_h: string, uc: string, alanlar: Record<string, unknown>) {
    this.postSayisi++;
    const h = this.olusturHatasi?.(uc);
    if (h) {
      for (let i = 0; i < (h.yineDeOlustur ?? 0); i++) this.yaz(uc, alanlar);
      throw h.hata;
    }
    return { id: this.yaz(uc, alanlar) };
  }
  private yaz(uc: string, alanlar: Record<string, unknown>) {
    const id = String(++this.sayac);
    this.kayitlar.set(id, { uc, alanlar: structuredClone(alanlar), status: String(alanlar.status ?? 'PAUSED') });
    return id;
  }
  async oku(id: string, alanlar: string[]) {
    const k = this.kayitlar.get(id);
    if (!k) throw new MetaKesinHata('Nesne yok');
    const o: Record<string, unknown> = { configured_status: k.status };
    for (const a of alanlar) if (a in k.alanlar) o[a] = structuredClone(k.alanlar[a]);
    if ('status' in o) o.status = k.status;
    return this.okumaBozucu ? this.okumaBozucu(id, o) : o;
  }
  async etiketleAra(_h: string, tur: string, etiket: string) {
    return [...this.kayitlar.entries()]
      .filter(([, k]) => k.uc === tur && (k.alanlar.adlabels as Array<{ name: string }>).some((l) => l.name === etiket))
      .filter(([, k]) => k.status !== 'ARCHIVED')
      .map(([id, k]) => ({ id, name: String(k.alanlar.name) }));
  }
  async durumYaz(id: string, a: { status: 'ACTIVE' | 'ARCHIVED'; name?: string }) {
    if (this.durumHatasi?.(id)) throw new MetaBelirsizHata('zaman aşımı');
    const k = this.kayitlar.get(id)!;
    if (a.status === 'ACTIVE') this.acmaSirasi.push(k.uc);
    k.status = a.status;
    if (a.name) k.alanlar.name = a.name;
  }
  sayi(uc: string) {
    return [...this.kayitlar.values()].filter((k) => k.uc === uc).length;
  }
}

