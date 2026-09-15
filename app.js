(function () {
  "use strict";

  var els = {};
  var state = {
    mode: "code", // "code" | "zip"
    zipHtml: null,
    createdUrls: [],
    miniTimer: null,
    isRecording: false,
    frameLoaded: false,
  };

  function cacheEls() {
    els.code = document.getElementById("h2v-code");
    els.iframe = document.getElementById("h2v-iframe");
    els.frameOuter = document.getElementById("h2v-frame-outer");
    els.frameBox = document.getElementById("h2v-frame-box");
    els.width = document.getElementById("h2v-width");
    els.height = document.getElementById("h2v-height");
    els.duration = document.getElementById("h2v-duration");
    els.fps = document.getElementById("h2v-fps");
    els.generateBtn = document.getElementById("h2v-generate");
    els.resetBtn = document.getElementById("h2v-reset");
    els.zipBtn = document.getElementById("h2v-zip-btn");
    els.zipInput = document.getElementById("h2v-zip-input");
    els.zipName = document.getElementById("h2v-zip-name");
    els.miniCanvas = document.getElementById("h2v-mini-canvas");
    els.status = document.getElementById("h2v-status");
    els.statusText = document.getElementById("h2v-status-text");
    els.progressFill = document.getElementById("h2v-progress-fill");
    els.videoBox = document.getElementById("h2v-video-box");
    els.video = document.getElementById("h2v-video");
    els.download = document.getElementById("h2v-download");
  }

  var DEFAULT_CODE =
    '<!doctype html>\n<html>\n<head>\n<style>\n  body {\n    margin: 0;\n    height: 100vh;\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    background: linear-gradient(135deg, #1d2233, #3a2f6b);\n    font-family: system-ui, sans-serif;\n  }\n  .box {\n    width: 120px;\n    height: 120px;\n    border-radius: 16px;\n    background: #818cf8;\n    animation: spin 3s linear infinite;\n  }\n  @keyframes spin {\n    from { transform: rotate(0deg); }\n    to { transform: rotate(360deg); }\n  }\n</style>\n</head>\n<body>\n  <div class="box"></div>\n</body>\n</html>\n';

  // ---------- Lazy-load library CDN ----------
  var libState = {};

  function loadScriptOnce(key, src) {
    if (libState[key] === "ready") return Promise.resolve();
    if (libState[key]) return libState[key];
    libState[key] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () {
        libState[key] = "ready";
        resolve();
      };
      s.onerror = function () {
        libState[key] = null;
        reject(new Error("Gagal memuat pustaka dari CDN (" + key + ")."));
      };
      document.head.appendChild(s);
    });
    return libState[key];
  }

  function loadHtml2Canvas() {
    return loadScriptOnce(
      "html2canvas",
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
    );
  }

  function loadJSZip() {
    return loadScriptOnce(
      "jszip",
      "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
    );
  }

  // ---------- Util umum ----------
  function setStatus(mode, text) {
    els.status.className = "h2v-status" + (mode ? " " + mode : "");
    els.statusText.textContent = text;
  }

  function trackUrl(url) {
    state.createdUrls.push(url);
    return url;
  }

  function revokeTrackedUrls() {
    state.createdUrls.forEach(function (u) {
      try {
        URL.revokeObjectURL(u);
      } catch (e) {}
    });
    state.createdUrls = [];
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () {
        fn.apply(null, args);
      }, wait);
    };
  }

  function pickMimeType() {
    var candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    for (var i = 0; i < candidates.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(candidates[i])) {
        return candidates[i];
      }
    }
    return "";
  }

  // ---------- ZIP: ekstrak & rekonstruksi path relatif jadi blob URL ----------
  var TEXT_EXT = ["html", "htm", "css", "js", "mjs"];

  function guessMime(ext) {
    var map = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      ico: "image/x-icon",
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
      otf: "font/otf",
      mp4: "video/mp4",
      webm: "video/webm",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      json: "application/json",
      txt: "text/plain",
    };
    return map[ext] || "application/octet-stream";
  }

  function detectCommonRoot(paths) {
    if (!paths.length) return "";
    var slashIdx = paths[0].indexOf("/");
    if (slashIdx === -1) return "";
    var candidate = paths[0].slice(0, slashIdx + 1);
    for (var i = 1; i < paths.length; i++) {
      if (paths[i].indexOf(candidate) !== 0) return "";
    }
    return candidate;
  }

  function resolveRelative(baseDir, rel) {
    var stack = baseDir ? baseDir.split("/").filter(Boolean) : [];
    if (rel.charAt(0) === "/") {
      stack = [];
      rel = rel.slice(1);
    }
    var parts = rel.split("/");
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p === "" || p === ".") continue;
      if (p === "..") {
        stack.pop();
        continue;
      }
      stack.push(p);
    }
    return stack.join("/");
  }

  function isExternalRef(v) {
    return (
      !v ||
      /^([a-z][a-z0-9+.-]*:)?\/\//i.test(v) ||
      v.indexOf("data:") === 0 ||
      v.indexOf("mailto:") === 0 ||
      v.indexOf("#") === 0
    );
  }

  function extractZip(file) {
    return loadJSZip()
      .then(function () {
        return file.arrayBuffer();
      })
      .then(function (buf) {
        return window.JSZip.loadAsync(buf);
      })
      .then(function (zip) {
        var entries = [];
        zip.forEach(function (relPath, entry) {
          if (!entry.dir) entries.push({ relPath: relPath, entry: entry });
        });
        if (!entries.length) throw new Error("ZIP kosong atau tidak valid.");

        var commonRoot = detectCommonRoot(
          entries.map(function (e) {
            return e.relPath;
          })
        );
        var fileMap = {};
        var jobs = entries.map(function (item) {
          var norm = commonRoot ? item.relPath.slice(commonRoot.length) : item.relPath;
          if (!norm) return Promise.resolve();
          var ext = (norm.split(".").pop() || "").toLowerCase();
          if (TEXT_EXT.indexOf(ext) !== -1) {
            return item.entry.async("string").then(function (text) {
              fileMap[norm] = { ext: ext, isText: true, text: text };
            });
          }
          return item.entry.async("blob").then(function (blob) {
            var typed = blob.type ? blob : blob.slice(0, blob.size, guessMime(ext));
            var url = trackUrl(URL.createObjectURL(typed));
            fileMap[norm] = { ext: ext, isText: false, blobUrl: url };
          });
        });
        return Promise.all(jobs).then(function () {
          return fileMap;
        });
      });
  }

  function findEntryHtml(fileMap) {
    var keys = Object.keys(fileMap).filter(function (k) {
      return fileMap[k].isText && /\.html?$/i.test(k);
    });
    if (!keys.length) return null;
    var exact = keys.find(function (k) {
      return k.toLowerCase() === "index.html";
    });
    if (exact) return exact;
    keys.sort(function (a, b) {
      return a.split("/").length - b.split("/").length;
    });
    return keys[0];
  }

  function lookupFile(fileMap, relPath, fromDir) {
    if (isExternalRef(relPath)) return null;
    var clean = relPath.split("#")[0].split("?")[0];
    var resolved = resolveRelative(fromDir, clean);
    if (fileMap[resolved]) return fileMap[resolved];
    var lower = resolved.toLowerCase();
    var foundKey = Object.keys(fileMap).find(function (k) {
      return k.toLowerCase() === lower;
    });
    return foundKey ? fileMap[foundKey] : null;
  }

  function urlForFile(fileEntry) {
    if (!fileEntry) return null;
    if (fileEntry.blobUrl) return fileEntry.blobUrl;
    if (fileEntry.isText) {
      if (!fileEntry._blobUrl) {
        var mime =
          fileEntry.ext === "css"
            ? "text/css"
            : fileEntry.ext === "js" || fileEntry.ext === "mjs"
            ? "text/javascript"
            : "text/plain";
        fileEntry._blobUrl = trackUrl(URL.createObjectURL(new Blob([fileEntry.text], { type: mime })));
      }
      return fileEntry._blobUrl;
    }
    return null;
  }

  function rewriteCssUrls(cssText, cssDir, fileMap) {
    return cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (m, q, p) {
      if (isExternalRef(p)) return m;
      var f = lookupFile(fileMap, p, cssDir);
      var u = urlForFile(f);
      return u ? 'url("' + u + '")' : m;
    });
  }

  function dirOf(path) {
    return path.indexOf("/") !== -1 ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  }

  function buildPreviewHtml(fileMap, entryPath) {
    var entryFile = fileMap[entryPath];
    var doc = new DOMParser().parseFromString(entryFile.text, "text/html");
    var baseDir = dirOf(entryPath);

    doc.querySelectorAll('link[rel~="stylesheet"][href], link[rel~="icon"][href]').forEach(function (el) {
      var href = el.getAttribute("href");
      var f = lookupFile(fileMap, href, baseDir);
      if (!f) return;
      if (f.isText) {
        var resolvedPath = resolveRelative(baseDir, href.split("#")[0].split("?")[0]);
        var rewritten = rewriteCssUrls(f.text, dirOf(resolvedPath), fileMap);
        el.setAttribute("href", trackUrl(URL.createObjectURL(new Blob([rewritten], { type: "text/css" }))));
      } else {
        el.setAttribute("href", urlForFile(f));
      }
    });

    doc.querySelectorAll("script[src]").forEach(function (el) {
      var f = lookupFile(fileMap, el.getAttribute("src"), baseDir);
      if (f) el.setAttribute("src", urlForFile(f));
    });

    doc.querySelectorAll("img[src], source[src], video[src], audio[src]").forEach(function (el) {
      var f = lookupFile(fileMap, el.getAttribute("src"), baseDir);
      if (f) el.setAttribute("src", urlForFile(f));
    });

    doc.querySelectorAll("style").forEach(function (el) {
      el.textContent = rewriteCssUrls(el.textContent, baseDir, fileMap);
    });

    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  }

  function handleZipFile(file) {
    revokeTrackedUrls();
    setStatus("", "Mengekstrak ZIP...");
    els.generateBtn.disabled = true;

    extractZip(file)
      .then(function (fileMap) {
        var entryPath = findEntryHtml(fileMap);
        if (!entryPath) throw new Error("Tidak ada file .html ditemukan di dalam ZIP.");
        var html = buildPreviewHtml(fileMap, entryPath);
        state.mode = "zip";
        state.zipHtml = html;
        els.zipName.textContent = file.name + " (" + entryPath + ")";
        updatePreview();
        setStatus("done", "ZIP diekstrak - pratinjau saja, bukan deploy.");
      })
      .catch(function (err) {
        setStatus("", "Gagal ekstrak ZIP: " + err.message);
      })
      .finally(function () {
        els.generateBtn.disabled = false;
      });
  }

  // ---------- Preview & ukuran frame ----------
  function currentSourceHtml() {
    return state.mode === "zip" && state.zipHtml ? state.zipHtml : els.code.value;
  }

  function updatePreview() {
    state.frameLoaded = false;
    els.iframe.srcdoc = currentSourceHtml();
  }

  function getWidthHeight() {
    var w = Math.min(3840, Math.max(64, parseInt(els.width.value, 10) || 800));
    var h = Math.min(2160, Math.max(64, parseInt(els.height.value, 10) || 600));
    return { w: w, h: h };
  }

  // Kunci perbaikan bug ukuran: iframe diberi lebar/tinggi ASLI (piksel penuh)
  // sesuai input pengguna, lalu di-scale visual pakai transform supaya pas di
  // panel pratinjau -- bukan dipaksa 100% lebar panel seperti sebelumnya.
  function applyFrameSize() {
    var wh = getWidthHeight();
    els.iframe.style.width = wh.w + "px";
    els.iframe.style.height = wh.h + "px";

    var outerW = els.frameOuter.clientWidth;
    var outerH = els.frameOuter.clientHeight;
    var scale = Math.min(outerW / wh.w, outerH / wh.h);
    if (!isFinite(scale) || scale <= 0) scale = 1;

    els.iframe.style.transform = "scale(" + scale + ")";
    els.frameBox.style.width = wh.w * scale + "px";
    els.frameBox.style.height = wh.h * scale + "px";
  }

  // ---------- Mini live preview (dekat kontrol ukuran) ----------
  function startMiniPreviewLoop() {
    stopMiniPreviewLoop();
    if (!window.html2canvas) return;
    state.miniTimer = setInterval(drawMiniPreview, 500);
    drawMiniPreview();
  }

  function stopMiniPreviewLoop() {
    if (state.miniTimer) {
      clearInterval(state.miniTimer);
      state.miniTimer = null;
    }
  }

  function drawMiniPreview() {
    if (state.isRecording || !window.html2canvas || !els.iframe.contentDocument) return;
    var wh = getWidthHeight();
    window
      .html2canvas(els.iframe.contentDocument.documentElement, {
        width: wh.w,
        height: wh.h,
        windowWidth: wh.w,
        windowHeight: wh.h,
        backgroundColor: null,
        scale: 1,
        logging: false,
      })
      .then(function (frameCanvas) {
        var ctx = els.miniCanvas.getContext("2d");
        var cw = els.miniCanvas.width;
        var ch = els.miniCanvas.height;
        var scale = Math.min(cw / wh.w, ch / wh.h);
        var dw = wh.w * scale;
        var dh = wh.h * scale;
        var dx = (cw - dw) / 2;
        var dy = (ch - dh) / 2;
        ctx.clearRect(0, 0, cw, ch);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(frameCanvas, dx, dy, dw, dh);
      })
      .catch(function () {
        /* frame belum siap / lintas asal - abaikan, coba lagi di tick berikutnya */
      });
  }

  function waitForIframeLoad(iframe) {
    return new Promise(function (resolve) {
      var handled = false;
      iframe.addEventListener(
        "load",
        function onLoad() {
          if (handled) return;
          handled = true;
          setTimeout(resolve, 60);
        },
        { once: true }
      );
    });
  }

  // ---------- Generate & rekam ----------
  function generateVideo() {
    if (!window.MediaRecorder) {
      setStatus("", "Browser ini tidak mendukung MediaRecorder. Gunakan Chrome/Edge terbaru.");
      return;
    }

    var wh = getWidthHeight();
    var duration = Math.min(60, Math.max(1, parseFloat(els.duration.value) || 5));
    var fps = Math.min(30, Math.max(5, parseInt(els.fps.value, 10) || 15));

    els.generateBtn.disabled = true;
    els.videoBox.style.display = "none";
    setStatus("", "Menyiapkan perekaman...");

    loadHtml2Canvas()
      .then(function () {
        applyFrameSize();
        if (!state.frameLoaded) return waitForIframeLoad(els.iframe);
      })
      .then(function () {
        stopMiniPreviewLoop();
        state.isRecording = true;
        return startRecording(wh.w, wh.h, duration, fps);
      })
      .catch(function (err) {
        setStatus("", "Gagal: " + err.message);
      })
      .finally(function () {
        state.isRecording = false;
        els.generateBtn.disabled = false;
        startMiniPreviewLoop();
      });
  }

  function startRecording(width, height, duration, fps) {
    return new Promise(function (resolve, reject) {
      var recCanvas = document.createElement("canvas");
      recCanvas.width = width;
      recCanvas.height = height;
      var ctx = recCanvas.getContext("2d");

      var mimeType = pickMimeType();
      var stream = recCanvas.captureStream(fps);
      var recorder;
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType: mimeType, videoBitsPerSecond: 4000000 } : {});
      } catch (e) {
        reject(new Error("MediaRecorder tidak bisa dijalankan: " + e.message));
        return;
      }

      var chunks = [];
      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = function () {
        clearInterval(captureTimer);
        var blob = new Blob(chunks, { type: mimeType || "video/webm" });
        var url = trackUrl(URL.createObjectURL(blob));
        els.video.src = url;
        els.download.href = url;
        els.download.download = "html2video-" + Date.now() + ".webm";
        els.videoBox.style.display = "block";
        setStatus("done", "Video siap (" + (blob.size / 1024 / 1024).toFixed(2) + " MB) - otomatis terdownload.");
        els.download.click();
        resolve();
      };

      var target = els.iframe.contentDocument.documentElement;
      var totalFrames = Math.round(duration * fps);
      var frameCount = 0;
      var frameInterval = 1000 / fps;

      setStatus("recording", "Merekam 0 / " + totalFrames + " frame...");
      recorder.start();

      var captureTimer = setInterval(function () {
        if (frameCount >= totalFrames) {
          clearInterval(captureTimer);
          recorder.stop();
          return;
        }
        window
          .html2canvas(target, {
            width: width,
            height: height,
            windowWidth: width,
            windowHeight: height,
            backgroundColor: null,
            scale: 1,
            logging: false,
          })
          .then(function (frameCanvas) {
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(frameCanvas, 0, 0, width, height);
            frameCount++;
            var pct = Math.round((frameCount / totalFrames) * 100);
            els.progressFill.style.width = pct + "%";
            setStatus("recording", "Merekam " + frameCount + " / " + totalFrames + " frame...");
          })
          .catch(function (err) {
            clearInterval(captureTimer);
            recorder.stop();
            reject(err);
          });
      }, frameInterval);
    });
  }

  function resetAll() {
    revokeTrackedUrls();
    state.mode = "code";
    state.zipHtml = null;
    els.zipName.textContent = "";
    els.code.value = DEFAULT_CODE;
    els.videoBox.style.display = "none";
    els.progressFill.style.width = "0%";
    updatePreview();
    setStatus("", "Siap membuat video.");
  }

  function init() {
    cacheEls();
    els.code.value = DEFAULT_CODE;
    updatePreview();
    applyFrameSize();
    setStatus("", "Siap membuat video.");

    loadHtml2Canvas().then(startMiniPreviewLoop);

    els.iframe.addEventListener("load", function () {
      state.frameLoaded = true;
    });

    els.code.addEventListener(
      "input",
      debounce(function () {
        state.mode = "code";
        els.zipName.textContent = "";
        updatePreview();
      }, 500)
    );

    els.width.addEventListener("input", applyFrameSize);
    els.height.addEventListener("input", applyFrameSize);
    window.addEventListener("resize", debounce(applyFrameSize, 150));

    els.zipBtn.addEventListener("click", function () {
      els.zipInput.value = "";
      els.zipInput.click();
    });
    els.zipInput.addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) handleZipFile(file);
    });

    els.generateBtn.addEventListener("click", generateVideo);
    els.resetBtn.addEventListener("click", resetAll);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
