/**
 * ═══ BULLMQ'NUN VAZGEÇTİĞİ İŞ TABLOYA YAZILMIYORDU ═══
 *
 * `sync_jobs` satırını işleyicinin KENDİSİ kapatıyor (`recordFailure`). Ama
 * işleyicinin hiç koşmadığı ya da yarıda kesildiği yollar var:
 *
 *   · İş `stalled` oldu — worker deploy sırasında öldürüldü, kilit düştü.
 *     BullMQ işi bir kez geri veriyor, `maxStalledCount` aşılınca ATIYOR.
 *     İşleyici o sırada çalışmadığı için tabloya tek bir satır bile
 *     yazılmıyor: kayıt sonsuza kadar `running` kalıyor.
 *   · Denemeler tükendi ve son deneme işleyicinin dışında düştü.
 *
 * Belirti canlıda görüldü: toplu tazeleme çubuğu 1259/1266'da saatlerce
 * durdu, ekran "İşleniyor" yazmaya devam etti ve hiçbir log satırı yoktu.
 *
 * KARAR AYRI BİR FONKSİYONDA çünkü worker'ın olay dinleyicisi test
 * edilemiyor: süreç ayağa kalkmadan o kod hiç koşmuyor ve kaynak taraması
 * "denemeler tükendi mi" gibi bir kuralı ÖLÇEMİYOR.
 */
export function nihaiBasarisizlik(job: {
  attemptsMade: number;
  opts?: { attempts?: number };
  kalici?: boolean;
}): boolean {
  // Kalıcı hata (UnrecoverableError) tek denemede bitiyor: BullMQ tekrar
  // denemiyor, yani satır da açık bırakılmamalı.
  if (job.kalici === true) return true;

  /*
   * VARSAYILAN 1, 5 DEĞİL. `attempts` verilmemiş bir işi beş denemeli
   * saymak, ilk düşüşte satırı açık bırakıp BullMQ'nun onu bir daha hiç
   * denememesi demek — düzeltilen hatanın ta kendisi.
   */
  const izinli = job.opts?.attempts ?? 1;
  return job.attemptsMade >= izinli;
}
