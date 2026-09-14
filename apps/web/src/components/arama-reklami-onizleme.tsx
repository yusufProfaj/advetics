/**
 * ═══ ARAMA REKLAMI ÖNİZLEMESİ — METİN REKLAMININ "KREATİFİ" METNİDİR ═══
 *
 * Google arama reklamının görseli yok ve olmayacak. Reklam Keşfi'nde o
 * reklamlar için görsel kutusu hiç çizilmiyordu; kart sadece adı, kampanyayı
 * ve metni listeliyordu. Sonuç: ekranın asıl sorusu olan "bu reklam NE
 * DİYOR" cevapsız kalıyordu. Aynı eksik rapor tarafında da vardı ve orada
 * çözülmüştü (`report-document.tsx`); panel geride kalmıştı.
 *
 * GERÇEK ARAMA SONUCUNUN YAPISI TAKLİT EDİLİYOR: Reklam rozeti, görünen
 * adres, başlık, açıklama. UYDURMA YOK: olmayan alan çizilmiyor, boş yer
 * tutucu konmuyor.
 *
 * ┌─ TEK BİR KOMBİNASYON GÖSTERİLİYOR ────────────────────────────────────┐
 * │ Duyarlı arama reklamında (RSA) on beşe kadar başlık ve dörde kadar     │
 * │ açıklama var; hangi kombinasyonun yayınlanacağına Google karar veriyor.│
 * │ Senkronizasyon yalnızca İLKİNİ saklıyor (`mapGoogleCreative`), yani bu │
 * │ önizleme o reklamın gördüğü tek hâli değil, örnek bir hâli. Bunu       │
 * │ ekranda "kesin görünüm" gibi sunmamak için başlık altında yazıyor.     │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export function AramaReklamiOnizleme({
  baslik,
  aciklama,
  gorunenAdres,
  className = '',
}: {
  baslik: string | null;
  aciklama: string | null;
  gorunenAdres: string | null;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface-muted p-3 ${className}`}
      aria-label="Arama reklamı önizlemesi"
    >
      <p className="text-[10px] font-bold text-ink">Reklam</p>
      {gorunenAdres && <p className="truncate text-[11px] text-ink-muted">{gorunenAdres}</p>}
      {/*
        BAŞLIK MARKA RENGİNDE DEĞİL. Arama sonucunda başlık mavi görünüyor
        ama beyaz etiketli üründe marka rengi her müşteride farklı ve
        kırmızı bir başlık "hata" gibi okunuyor. Vurgu renkle değil
        büyüklükle: önizlemenin en büyük metni başlık.
      */}
      <p className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-ink">
        {baslik ?? 'Başlık yok'}
      </p>
      {aciklama && (
        <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-ink-muted">{aciklama}</p>
      )}
      <p className="mt-2 text-[10px] text-ink-muted">Örnek bir başlık ve açıklama</p>
    </div>
  );
}
