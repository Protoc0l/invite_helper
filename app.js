// app.js
import { BrowserQRCodeReader } from "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm";

// Shorthand and elements
const $ = (id) => document.getElementById(id);
const ekInput   = $('ek');
const statusEl  = $('status');
const logEl     = $('log');
const videoEl   = $('video');
const photoIn   = $('photo');
const deviceUrl = $('deviceUrl');

function setStatus(msg, cls='') {
  statusEl.className = cls;
  statusEl.textContent = msg || '';
}
function log(msg) {
  logEl.textContent += msg + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

// 1) Read EK from fragment first (#ek=...), then query (?ek=...)
(function initFromLocation() {
  const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const qs   = new URLSearchParams(location.search);
  const raw  = hash.get('ek') || qs.get('ek') || hash.get('key') || qs.get('key') || '';
  if (raw) {
    ekInput.value = raw.startsWith('ek=') ? raw.split('=')[1] : raw;
    log('Loaded invite from URL fragment/query.');
  }
})();

// 2) Copy / Clear
$('copy')?.addEventListener('click', async () => {
  const v = ekInput.value.trim();
  if (!v) return setStatus('Nothing to copy.', 'warn');
  try { await navigator.clipboard.writeText(v); setStatus('Copied invite to clipboard.', 'ok'); }
  catch { setStatus('Copy failed — long-press to paste manually.', 'warn'); }
});
$('clear')?.addEventListener('click', () => { ekInput.value = ''; setStatus('Cleared.'); });

// 3) LIVE scan (works on iOS Safari)
let codeReader, liveControls, liveStream;
async function startLiveScan() {
  try {
    setStatus('Starting camera…');
    if (!codeReader) codeReader = new BrowserQRCodeReader();

    // Request rear camera
    const constraints = { video: { facingMode: { ideal: 'environment' } }, audio: false };
    liveStream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = liveStream;
    await videoEl.play();
    videoEl.style.display = 'block';
    setStatus('Point camera at the QR code…');

    // Decode continuously until we get a result
    liveControls = await codeReader.decodeFromVideoDevice(
      null,
      videoEl,
      (result, err) => {
        if (result) {
          const text = result.getText();
          deviceUrl.value = text;
          setStatus('QR scanned — ready to deliver.', 'ok');
          log('QR (live) scanned: ' + text);
          stopLiveScan();
        }
      }
    );
  } catch (e) {
    console.error(e);
    setStatus('Live scan failed — use Photo Scan instead.', 'warn');
    log('Live scan error: ' + e);
  }
}
function stopLiveScan() {
  try { liveControls?.stop(); } catch {}
  if (liveStream) {
    liveStream.getTracks().forEach(t => t.stop());
    liveStream = null;
  }
  videoEl.pause();
  videoEl.srcObject = null;
  videoEl.style.display = 'none';
}

$('scanLive')?.addEventListener('click', startLiveScan);
window.addEventListener('beforeunload', stopLiveScan);

// 4) PHOTO scan (maximum compatibility; great on iOS)
$('scanPhoto')?.addEventListener('click', () => photoIn.click());
photoIn?.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const imgURL = URL.createObjectURL(file);
  const img = new Image();
  img.onload = async () => {
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      // Lazy-import jsQR as an ES module
      const { default: jsQR } = await import("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm");
      const imageData = ctx.getImageData(0, 0, c.width, c.height);
      const res = jsQR(imageData.data, c.width, c.height);
      if (res?.data) {
        deviceUrl.value = res.data;
        setStatus('QR scanned — ready to deliver.', 'ok');
        log('QR (photo) scanned: ' + res.data);
      } else {
        setStatus('No QR found in photo. Try again.', 'warn');
      }
    } catch (err) {
      console.error(err);
      setStatus('Photo scan failed.', 'err');
    } finally {
      URL.revokeObjectURL(imgURL);
    }
  };
  img.onerror = () => { setStatus('Failed to load image.', 'err'); URL.revokeObjectURL(imgURL); };
  img.src = imgURL;
});

// 5) Manual URL helper
$('manual')?.addEventListener('click', () => {
  deviceUrl.focus();
  setStatus('Paste device URL (e.g., http://deck.local:6464/join?code=LAN-TEST).');
});

// 6) Deliver by navigation (avoids HTTPS→HTTP CORS/mixed-content fetch)
$('deliver')?.addEventListener('click', () => {
  const urlText = deviceUrl.value.trim();
  const ek = ekInput.value.trim();
  if (!urlText) return setStatus('Missing device URL. Scan QR or paste it.', 'warn');
  if (!ek) return setStatus('Missing invite. Paste ek=... or include #ek= in this page URL.', 'warn');
  try {
    const u = new URL(urlText);
    const ekValue = ek.startsWith('ek=') ? ek.split('=')[1] : ek;
    u.searchParams.set('ek', ekValue);
    log('Navigating to device: ' + u.toString());
    location.href = u.toString();
  } catch (e) {
    setStatus('Invalid device URL: ' + e, 'err');
  }
});
