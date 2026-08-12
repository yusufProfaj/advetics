-- İlk girişte parola değiştirme zorunluluğu
--
-- Seed ve yönetici tarafından kurulan parolalar geçici sayılıyor: o parola
-- en az bir kez bir insanın gözünden geçiyor ve kalıcı olmamalı.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

