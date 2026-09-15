# html2video

Tempel kode HTML (boleh sekalian ada `<style>` dan `<script>`), atau extrak file
ZIP situs statis, lalu klik **Generate video** — hasil rekaman `.webm` langsung
otomatis terdownload. Semua diproses di browser, tanpa upload ke server.

## Yang baru di update ini

### 1. Dukungan ZIP (preview saja, bukan deploy)
Klik **Extrak ZIP**, pilih file `.zip` situs statis. Prosesnya:
- `index.html` di dalam ZIP dicari otomatis (kalau semua file ada di dalam satu
  folder pembungkus, itu terdeteksi dan dilepas otomatis).
- Semua `<link rel="stylesheet">`, `<script src>`, `<img>`, `<video>`,
  `<audio>`, `<source>`, dan `url(...)` di dalam CSS yang menunjuk ke file lain
  di dalam ZIP (path relatif) otomatis disambungkan ke isi file aslinya.
- Ini murni pratinjau di browser (pakai blob URL sementara) — **tidak** meng-upload
  atau men-deploy ZIP itu ke mana pun.
- Batasan: referensi lewat `fetch()`/`import()` dinamis di JavaScript, atau
  `@import` di CSS, belum ikut disambungkan — cocok untuk situs statis
  sederhana, bukan pengganti server sungguhan.

### 2. Perbaikan bug lebar/tinggi
Sebelumnya, ukuran video hasil rekaman suka "keluar area"/tidak sesuai kalau
lebar-tinggi diatur ke angka kecil atau besar. Penyebabnya: pratinjau selalu
dipaksa 100% lebar panel, sedangkan proses rekam pakai ukuran piksel yang
beda sendiri — jadi apa yang terlihat ≠ apa yang terekam.

Sekarang: iframe pratinjau diberi ukuran piksel **asli** persis sesuai lebar
&amp; tinggi yang diatur, lalu discale visual (bukan dipaksa penuh) supaya pas
di panel — jadi videonya konsisten dengan apa yang kelihatan di pratinjau,
berapa pun ukurannya.

### 3. Live preview ukuran
Di panel "Ukuran & rekam" ada kanvas kecil yang tiap setengah detik menampilkan
screenshot langsung dari mesin perekam (`html2canvas`) di resolusi yang
diatur — jadi sebelum klik Generate, sudah kelihatan persis framing yang bakal
terekam.

### 4. Auto-download
Begitu rekaman selesai, video langsung otomatis terdownload (selain juga tetap
tampil di player untuk ditonton dulu).

### 5. Desain Neo Brutalism
Border tebal hitam, shadow offset keras (bukan blur), warna flat (krem,
kuning, biru, tanpa gradient/neon/glow), tombol dengan efek "ditekan" saat
diklik.

## Cara kerja inti (tetap sama)

1. Kode/ZIP dirender di `<iframe>` sebagai pratinjau langsung.
2. `html2canvas` mengambil screenshot iframe berkali-kali per detik sesuai FPS.
3. Tiap screenshot digambar ke `<canvas>`, lalu `canvas.captureStream()` +
   `MediaRecorder` merekamnya jadi video WebM.
4. Video otomatis terdownload + tampil di player.

## Struktur proyek

```
index.html      <- HALAMAN PROTEKSI (anti-clone). Ini yang kebaca kalau discrape.
anti-clone.js    <- redirect browser asli dari index.html -> app.html
app.html         <- WEB ASLI (tool html2video sepenuhnya)
style.css        <- tema neo-brutalism
app.js           <- logic: render iframe, ekstrak ZIP, rekam video
```

Catatan proteksi anti-clone sama seperti sebelumnya: menghalangi scraper yang
cuma download `index.html` mentah, tapi nama file `app.html` tetap terbaca di
`anti-clone.js`, jadi bukan proteksi mutlak.

## Deploy ke Vercel

1. Push semua file ini (satu root) ke repo GitHub.
2. Import repo di [vercel.com/new](https://vercel.com/new) — semua statis,
   tidak perlu konfigurasi build.
3. Deploy.
