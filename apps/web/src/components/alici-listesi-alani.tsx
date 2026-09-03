'use client';

import { useState } from 'react';
import { ALICI_UST_SINIRI, aliciAyristir, gecerliAdres } from '@advetics/shared';

/**
 * ═══ ALICI LİSTESİ ALANI — ÜÇ EKRANDA TEK BİLEŞEN ═══
 *
 * Rapor gönderme, planlı rapor ve müşteri bilgi formu; üçü de "birden çok
 * e-posta adresi" alıyor. Ayrı ayrı yazılsalardı doğdukları anda ayrışırlardı:
 * biri virgülü ayırıcı sayarken diğeri saymaz, biri tekilleştirirken diğeri
 * aynı adrese iki kez gönderirdi. Ayrıştırma kuralı `@advetics/shared`
 * içindeki `aliciAyristir()` — sunucunun kullandığı fonksiyonun AYNISI.
 *
 * ┌─ DOĞRULAMA GİRİŞ ANINDA ──────────────────────────────────────────────┐
 * │ Adres, kullanıcı "Gönder"e bastığında değil ALANI BIRAKTIĞINDA rozete  │
 * │ dönüşüyor; bozuksa anında kırmızı. Bu projede tekrar eden bir karar:   │
 * │ kullanıcı yüklediği şeyin kullanılamayacağını tıkladığında değil       │
 * │ bıraktığında öğrenmeli.                                                │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * SAYAÇ KOŞULSUZ YAZILIYOR. "Sessiz kesme yok": üst sınıra takılan bir adres
 * sessizce düşerse kullanıcı listenin tamamının gittiğini sanır.
 */
export function AliciListesiAlani({
  degerler,
  onChange,
  etiket,
  yardim,
  /** Liste boşken gösterilecek yedek — "boş bırakılırsa şuraya gider". */
  bosVarsayilan,
}: {
  degerler: string[];
  onChange: (yeni: string[]) => void;
  etiket: string;
  yardim?: string;
  bosVarsayilan?: string[];
}) {
  const [taslak, setTaslak] = useState('');
  const [hata, setHata] = useState<string | null>(null);

  function ekle(ham: string): void {
    const metin = ham.trim();
    if (metin === '') return;

    const { adresler, gecersiz, atilan } = aliciAyristir(metin);

    /*
     * GEÇERSİZ PARÇA TASLAKTA KALIYOR, SİLİNMİYOR. Kullanıcının yazdığını
     * silip "geçersiz" demek, yazdığını düzeltmesini imkânsız kılardı —
     * yeniden yazmak zorunda kalırdı.
     */
    if (gecersiz.length > 0) {
      setHata(`Geçerli bir e-posta değil: ${gecersiz.join(', ')}`);
      setTaslak(gecersiz.join(', '));
      if (adresler.length > 0) birlestir(adresler);
      return;
    }
    if (atilan.length > 0) {
      setHata(`En fazla ${ALICI_UST_SINIRI} alıcı. Eklenmeyen: ${atilan.join(', ')}`);
    } else {
      setHata(null);
    }
    setTaslak('');
    birlestir(adresler);
  }

  function birlestir(yeniler: string[]): void {
    const birlesik = aliciAyristir([...degerler, ...yeniler]);
    if (birlesik.atilan.length > 0) {
      setHata(`En fazla ${ALICI_UST_SINIRI} alıcı. Eklenmeyen: ${birlesik.atilan.join(', ')}`);
    }
    onChange(birlesik.adresler);
  }

  return (
    <div className="min-w-0">
      <span className="text-xs text-ink-muted">{etiket}</span>

      <div className="mt-1 flex min-h-[38px] flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5">
        {degerler.map((adres) => (
          <span
            key={adres}
            className="inline-flex items-center gap-1 rounded-md bg-surface-muted px-2 py-0.5 text-xs text-ink"
          >
            {adres}
            <button
              type="button"
              aria-label={`${adres} adresini çıkar`}
              onClick={() => onChange(degerler.filter((d) => d !== adres))}
              className="text-ink-muted hover:text-danger"
            >
              ×
            </button>
          </span>
        ))}

        <input
          value={taslak}
          onChange={(e) => {
            const v = e.target.value;
            /*
             * VİRGÜL/NOKTALI VİRGÜL YAZILDIĞI ANDA ROZETE DÖNÜŞÜYOR. Adresleri
             * bir yerden kopyalayıp yapıştıran kullanıcı Enter'a basmayı
             * beklemiyor ve yapıştırdığı metin tek parça hâlinde kalırsa
             * "eklendi mi" sorusu ekranda cevapsız kalıyor.
             */
            if (/[,;\n]/.test(v)) ekle(v);
            else setTaslak(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              if (taslak.trim() !== '') {
                e.preventDefault();
                ekle(taslak);
              }
              return;
            }
            // Boş alanda geri silmek son rozeti çıkarıyor — alışılmış davranış.
            if (e.key === 'Backspace' && taslak === '' && degerler.length > 0) {
              onChange(degerler.slice(0, -1));
            }
          }}
          onBlur={() => ekle(taslak)}
          placeholder={degerler.length === 0 ? 'ornek@firma.com' : 'ekle…'}
          className="min-w-[140px] flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      {hata !== null && <p className="mt-1 text-xs text-danger">{hata}</p>}

      {/* SAYAÇ KOŞULSUZ — kaç kişiye gideceği her zaman görünür olmalı. */}
      {degerler.length > 0 && (
        <p className="mt-1 text-[11px] text-ink-muted">
          {degerler.length} alıcı · hepsi birbirinin adresini görecek
        </p>
      )}

      {degerler.length === 0 && bosVarsayilan !== undefined && (
        <p className="mt-1 text-[11px] text-ink-muted">
          {bosVarsayilan.length > 0 ? (
            <>
              Boş bırakılırsa <strong>{bosVarsayilan.join(', ')}</strong> adresine gönderilir.
            </>
          ) : (
            <span className="text-warn">
              Müşterinin kayıtlı rapor alıcısı yok — en az bir adres eklemelisin.
            </span>
          )}
        </p>
      )}

      {yardim !== undefined && <p className="mt-1 text-[11px] text-ink-muted">{yardim}</p>}
    </div>
  );
}

/** Tek adresin geçerliliği — çağıranlar aynı kuralı yeniden yazmasın. */
export { gecerliAdres };
