(function () {
  "use strict";

  // Halaman ini (index.html) sengaja cuma berisi pesan proteksi.
  // Aplikasi asli ada di app.html, dan baru dibuka lewat redirect JS ini —
  // jadi kalau ada tool yang cuma nge-fetch HTML mentah dari domain ini
  // (bukan menjalankan JS-nya, seperti "save page"/web-to-zip), yang
  // kebaca cuma halaman proteksi ini, bukan aplikasi sebenarnya.
  window.location.replace("app.html");
})();
