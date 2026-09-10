import { redirect } from 'next/navigation';

/**
 * WORKSPACE LİSTESİ ŞİRKETLER SAYFASINA TAŞINDI.
 *
 * Kenar çubuğunda "Şirketler" ve "Workspace'ler" yan yana iki satırdı ve bu
 * hiyerarşiyi gizliyordu: workspace şirketin İÇİNDE, yanında değil.
 *
 * SAYFA SİLİNMİYOR, YÖNLENDİRİYOR. Bu adres panelin dört ayrı yerinden
 * bağlanıyordu ve kullanıcıların yer imlerinde de duruyor; silmek onları
 * 404'e düşürürdü. Alt yollar (`/ayarlar/musteriler/[id]/ekip` ve
 * `/kanallar`) YERİNDE KALIYOR — onlar tek bir workspace'in detay ekranı ve
 * şirket sayfasının içine sığmıyor.
 */
export default function MusterilerPage() {
  redirect('/ayarlar/ust-hesap');
}
