# Pilot işine devam promptu

Yeni bir Claude Code oturumuna aşağıdaki metni olduğu gibi yapıştır. Oturumu
`.claude/worktrees/advcampaign-agents-strategy-1d8a19` worktree'sinde aç.

---

Advetics'te "Pilot" işine devam ediyoruz. Pilot, AdvStrategy ile AdvCampaign'in yapay zekâ odaklı
yeniden kurgusu. Kaldığımız yer `docs/advcampaign/PILOT-DEVIR.md` içinde; önce onu, `CLAUDE.md`yi ve
`docs/advcampaign/MIMARI.md` §12–§14'ü oku. İş `claude/advcampaign-agents-strategy-1d8a19` dalında.
Dal main'e birleştirilmedi, push ve deploy edilmedi.

Durum (2026-10-08 sonu):
- Reklam metni kararı (a) olarak kapandı: metin plan anında yazılıyor, planda görünüyor, onay özeti metni kapsıyor.
- Ajan 1, 2 ve 3'ün ikinci turu bitti. B-1…B-5, override, ajans onayı denetim kaydı ve C-16 düzeltildi.
- Ajan 4'ün kapı turu YARIDA kesildi; kapı kararı yok.

Kurallar:
- Beş ajan düzeni geçerli (CLAUDE.md "BEŞ AJAN, MODÜL MODÜL"). Kapı açılmadan main'e birleştirme ve deploy yok.
- MIMARI.md §9 ve PILOT-DEVIR.md'deki kullanıcı kararları kapandı; yeniden sorma.
- `pnpm` PATH'te yok, `npx -y pnpm@9 ...` kullan.
- Tam API test paketini TEK BAŞINA, ön planda ve yüksek timeout'la koş.
- Push'tan önce `git pull --rebase` yap; force push yok.

Sırayla:
1. Ajan 4 kapı turunu baştan koştur. Görev listesi PILOT-DEVIR.md "Sıradaki iş" 1. maddede:
   - tam API paketi sonuna kadar;
   - shared derlemesi + typecheck + web testleri;
   - kalan `it.fails` sayımı;
   - yeni yüzeylere düşmanca bakış: SECURITY DEFINER fonksiyon, durdur politikası, görsel ucu IDOR, onaydan sonra metin değişimi, worker yarışı, `PilotKurulumYaniti.plan.yayinKipi`, plan anında Gemini;
   - en az 8 mutasyon;
   - Ajan 5 SQL listesi.

   Ajan 4 kod düzeltmez; bulguyu `it.fails` ile kilitler.
2. Bulgu varsa düzeltmeyi üreten ajana ver, sonra kapıyı yeniden koştur.
3. Kapı açıksa Ajan 5:
   - PILOT-DEVIR.md'deki salt okunur SQL'leri bana ver;
   - migration sırasını kontrol et;
   - `docs/DEVAM.md`yi güncelle;
   - deploy komutunu ver (deploy'u kendin yapma).

Her adımın sonunda bana en fazla beş satırla ne olduğunu yaz.
