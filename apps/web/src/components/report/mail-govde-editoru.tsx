'use client';

import { useEffect, useRef, useState } from 'react';
import { imzaTemizle } from '@advetics/shared';

/**
 * ═══ MAİL GÖVDESİ — KOD DEĞİL, GÖRÜNÜŞ ═══
 *
 * Burası bir `<textarea>` idi ve ham HTML gösteriyordu (`font-mono`):
 *
 *     <p>Merhaba,</p>
 *     <h3>Genel Performans Özeti</h3>
 *     <li>Toplam Harcama: <strong>133.953,93 ₺</strong></li>
 *
 * Kullanıcının işi "değerlendirme" paragrafını yazmak; bunu etiketlerin
 * arasından yapmak hem yavaş hem hataya açık — kapanmayan bir etiket
 * müşteriye bozuk bir mail göndermek demek. Kullanıcının cümlesi:
 * *"html kodunu önizlemeli göstermen lazım kodu değil"*.
 *
 * ┌─ ÖNİZLEME YALAN SÖYLEYEMEZ ───────────────────────────────────────────┐
 * │ Gönderim yolunda `imzaTemizle` koşuyor ve beyaz listede olmayan her    │
 * │ şeyi atıyor. Ekranda görünen ile gidenin farklı olması, bu depoda adı  │
 * │ konmuş bir hata türü. Bu yüzden AYNI fonksiyon panelde de koşuyor —    │
 * │ ikinci bir temizleyici yazmak yerine fonksiyon `packages/shared`a      │
 * │ taşındı.                                                               │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ NEDEN KÜTÜPHANE YOK ─────────────────────────────────────────────────┐
 * │ Zengin metin editörü paketleri (TipTap, Quill, Slate) yüzlerce KB ve   │
 * │ kendi HTML modelleri var; ürettikleri işaretlemeyi mail istemcilerine  │
 * │ uygun hâle getirmek ayrı bir iş. İhtiyaç duyulan şey `contentEditable` │
 * │ ve bir temizleyici — ikisi de zaten elimizde.                          │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export function MailGovdeEditoru({
  deger,
  onChange,
  /**
   * Taslak DEĞİŞTİĞİNDE editörü yeniden dolduran anahtar.
   *
   * `deger` doğrudan izlenemiyor: her tuş vuruşunda DOM'a geri yazmak imleci
   * metnin başına atıyor — `contentEditable` ile React'in klasik çatışması.
   * Editör KONTROLSÜZ, yalnızca bu anahtar değişince yeniden dolduruluyor.
   */
  taslakAnahtari,
}: {
  deger: string;
  onChange: (html: string) => void;
  taslakAnahtari: string;
}) {
  const alanRef = useRef<HTMLDivElement>(null);
  const [kodModu, setKodModu] = useState(false);
  const [uyari, setUyari] = useState<string | null>(null);

  /**
   * ═══ DOM'U STATE'TEN DOLDURMA — ve NE ZAMAN DOLDURMAMA ═══
   *
   * İLK YAZIŞIMDA BURASI ÜRETİMİ KIRDI: bağımlılık listesi
   * `[taslakAnahtari, kodModu]` idi ve `deger` YOKTU. Editör, taslak SUNUCUDAN
   * GELMEDEN monte oluyor (`govde` o an boş dizge), effect bir kez koşup alanı
   * BOŞ dolduruyor ve taslak geldiğinde bir daha koşmuyordu — kutu boş kalıyordu.
   *
   * Daha kötüsü ikinci adımdı: kullanıcı boş alana tıklayıp çıkınca `onBlur`
   * boş `innerHTML`i state'e GERİ YAZIYOR ve sunucudan gelen taslağı da
   * siliyordu. Bu yüzden "HTML" sekmesi de boş görünüyordu — iki belirti, tek
   * sebep.
   *
   * `deger` artık bağımlılıkta. İmleç sıçraması şununla önleniyor: alan
   * ODAKTAYSA ve İÇİ DOLUYSA yazmıyoruz — yani kullanıcı yazarken DOM'a
   * dokunulmuyor. Odakta ama BOŞSA yazıyoruz; o hâl "kullanıcı taslak gelmeden
   * alana tıkladı" demek ve orada dokunmamak kutuyu kalıcı olarak boş bırakırdı.
   */
  useEffect(() => {
    const el = alanRef.current;
    if (!el || kodModu) return;
    const odakta = typeof document !== 'undefined' && document.activeElement === el;
    if (domaYazilmali({ mevcutHtml: el.innerHTML, hedefHtml: deger, odakta })) {
      el.innerHTML = deger;
    }
  }, [deger, kodModu, taslakAnahtari]);

  /*
   * TEMİZLİK RAPORU — ekranda duran içerik gönderimde kırpılacak mı.
   *
   * İçeriği YERİNDE DEĞİŞTİRMİYORUZ (imleç kaçar); yalnızca farkı söylüyoruz.
   * Sessiz kalmak, kullanıcının ekranda gördüğü bir şeyin maile girmediğini
   * ancak alıcıdan öğrenmesi demekti.
   */
  const { rapor } = imzaTemizle(deger);
  const kirpilan = [...rapor.removedTags, ...rapor.removedAttributes];

  function yaz(): void {
    if (alanRef.current) onChange(alanRef.current.innerHTML);
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">
          Mail metni — sayılar rapordan geldi, değerlendirme kısmını sen yaz
        </span>
        {/*
          KOD MODU DURUYOR ama VARSAYILAN DEĞİL. Bir tabloyu elle düzeltmek
          isteyen kullanıcıdan HTML'i tamamen saklamak, çözülebilir bir sorunu
          çözülemez yapardı.
        */}
        <button
          type="button"
          onClick={() => setKodModu((v) => !v)}
          className="rounded-md border border-line px-2 py-0.5 text-[11px] text-ink-muted hover:bg-surface-muted"
        >
          {kodModu ? 'Önizleme' : 'HTML'}
        </button>
      </div>

      {kodModu ? (
        <textarea
          value={deger}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          spellCheck={false}
          className="mt-0.5 w-full rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs focus:border-brand focus:outline-none"
        />
      ) : (
        <div
          ref={alanRef}
          contentEditable
          suppressContentEditableWarning
          onInput={yaz}
          onBlur={yaz}
          /*
           * YAPIŞTIRMA GİRİŞTE TEMİZLENİYOR. Word ve Gmail'den yapıştırılan
           * içerik `<o:p>`, `mso-*` stilleri ve derin `<span>` yuvaları
           * taşıyor; hepsini gönderimde atmak, kullanıcının ekranda gördüğü
           * biçimin maile girmediğini ancak sonradan öğrenmesi demekti.
           * CLAUDE.md: "Doğrulama kullanım anında değil, giriş anında."
           */
          onPaste={(e) => {
            e.preventDefault();
            const ham =
              e.clipboardData.getData('text/html') || e.clipboardData.getData('text/plain');

            /*
             * GÖRSEL YAPIŞTIRMA SESSİZCE YUTULUYORDU. Ekran görüntüsü
             * yapıştırıldığında panoda ne `text/html` ne `text/plain` var;
             * ikisi de boş geliyor ve hiçbir şey olmuyordu — kullanıcı
             * yapıştırdığını sanıp göndermeye devam ederdi.
             *
             * Görsel DESTEKLENMİYOR ve bu bilinçli: mail gövdesine gömülü bir
             * görsel ya devasa bir `data:` dizesi ya da sunucumuzda barındırılan
             * bir dosya demek; ikisi de ayrı bir iş. Söylemek tek doğru davranış.
             */
            if (ham.trim() === '') {
              setUyari(
                e.clipboardData.files.length > 0
                  ? 'Görsel yapıştırılamıyor — mail gövdesine görsel eklenmiyor.'
                  : 'Yapıştırılacak metin bulunamadı.',
              );
              return;
            }
            setUyari(null);

            const temiz = imzaTemizle(ham).html;
            // `insertHTML` eski bir API ama contentEditable'da geri alınabilir
            // (Cmd+Z) tek ekleme yolu; elle DOM'a yazmak geçmişi bozuyor.
            document.execCommand('insertHTML', false, temiz);
            yaz();
          }}
          className="mail-onizleme mt-0.5 max-h-[340px] min-h-[220px] w-full overflow-y-auto rounded-lg border border-line bg-surface px-4 py-3 text-sm focus:border-brand focus:outline-none"
        />
      )}

      {uyari !== null && <p className="mt-1 text-[11px] text-warn">{uyari}</p>}

      {kirpilan.length > 0 && (
        /*
         * GÖNDERİMDE ATILACAKLAR ÖNCEDEN SÖYLENİYOR. Sunucu aynı temizliği
         * yapıyor ve sessiz kalsaydı fark yalnızca alıcının istemcisinde
         * görünürdü.
         */
        <p className="mt-1 text-[11px] text-warn">
          Gönderimde şunlar kaldırılacak: {kirpilan.join(', ')}
        </p>
      )}
    </div>
  );
}

/**
 * ═══ DOM'A YAZMALI MIYIZ ═══
 *
 * SAF FONKSİYON ve bunun sebebi bir üretim hatası: bu karar effect'in içine
 * gömülüydü, panelde React bileşeni render eden bir test altyapısı yok
 * (`vitest.config.ts` bunu bilinçli olarak reddediyor) ve yazdığım kaynak
 * taraması yanlış davranışı KİLİTLEMİŞTİ — `[taslakAnahtari, kodModu]`
 * bağımlılığını doğru sanıp iddia hâline getirmiştim.
 *
 * Karar dışarı çıkınca `node` ortamında doğrudan sınanabiliyor ve üç hâlin
 * üçü de ayrı ayrı kilitleniyor.
 */
export function domaYazilmali(params: {
  /** Alanın şu anki içeriği. */
  mevcutHtml: string;
  /** State'teki hedef içerik. */
  hedefHtml: string;
  /** Kullanıcı şu anda bu alanda mı yazıyor. */
  odakta: boolean;
}): boolean {
  // Aynı içeriği yeniden yazmak imleci gereksiz yere oynatıyor.
  if (params.mevcutHtml === params.hedefHtml) return false;

  /*
   * KULLANICI YAZARKEN DOKUNMUYORUZ — ama YALNIZCA içerik varsa.
   *
   * Alan odakta AMA BOŞSA yazıyoruz: o hâl "kullanıcı taslak gelmeden alana
   * tıkladı" demek ve orada dokunmamak kutuyu KALICI olarak boş bırakırdı.
   * Üretimde tam bu oldu — kutu boş kaldı, sonra `onBlur` o boşluğu state'e
   * geri yazıp sunucudan gelen taslağı da sildi.
   */
  if (params.odakta && params.mevcutHtml.trim() !== '') return false;

  return true;
}
