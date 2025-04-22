// quiz.js (v2.4)
import { startLogin } from './auth.js';

const backBtn       = document.getElementById('back');
const albumArt      = document.getElementById('albumArt');
const trackNameEl   = document.getElementById('trackName');
const trackArtistEl = document.getElementById('trackArtist');
const waveform      = document.getElementById('waveform');
const buttons       = [...document.querySelectorAll('[data-sec]')];
const fullBtn       = document.getElementById('full');
const revealBtn     = document.getElementById('reveal');
const nextBtn       = document.getElementById('next');

let access, player, deviceId;
let tracks = [], playQueue = [], queueIdx = 0, played = new Set();
let current, revealed = false;
let snippetWatch = null;

// ────────────────────────────── INIT ──────────────────────────────────────
(async () => {
  access = localStorage.getItem('access_token');
  if (!access) return startLogin();

  const plId = localStorage.getItem('selected_playlist');
  if (!plId)  return location.href = 'selector.html';

  try {
    await loadTracks(plId);
    setupPlayer();
  } catch (e) {
    console.error(e);
    location.href = 'selector.html';
  }
})();

// ───────────────────────────── API HELPERS ────────────────────────────────
function api(path, opts = {}) {
  return fetch(`https://api.spotify.com/v1/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${access}`, ...opts.headers }
  }).then(async r => (r.status === 204 ? {} : r.json()));
}

async function ensureDeviceActive() {
  const info = await api('me/player');
  if (info?.device?.id !== deviceId) {
    await api('me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [deviceId], play: false })
    });
  }
}

// ───────────────────────────── PLAYLIST LOAD ──────────────────────────────
async function loadTracks(id) {
  const res = await api(`playlists/${id}/tracks?limit=100`);
  tracks = res.items.map(i => i.track).filter(t => t?.is_playable !== false);
  if (!tracks.length) throw new Error('No playable tracks.');

  playQueue = [...tracks];
  if (localStorage.getItem('shuffle') === '1') shuffle(playQueue);
  queueIdx = 0;
  pickNext();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ───────────────────────────── UI UTIL ────────────────────────────────────
function refreshDisplay() {
  albumArt.hidden = !revealed;
  if (revealed) {
    albumArt.src = current.album?.images?.[0]?.url || '';
    trackNameEl.textContent   = current.name;
    trackArtistEl.textContent = current.artists.map(a => a.name).join(', ');
  } else {
    albumArt.src = '';
    trackNameEl.textContent = trackArtistEl.textContent = '';
  }
  waveform.style.opacity = 0;
  fullBtn.textContent = 'Play full';
  buttons.forEach(b => b.classList.remove('used'));
}

function pickNext() {
  if (!playQueue.length) return;
  do  { current = playQueue[queueIdx++]; }
  while (current && played.has(current.id) && queueIdx < playQueue.length);

  played.add(current.id);
  if (queueIdx >= playQueue.length) {
    queueIdx = 0;
    played.clear();
    if (localStorage.getItem('shuffle') === '1') shuffle(playQueue);
  }
  revealed = false;
  refreshDisplay();
}

// ───────────────────────── PLAYER SETUP ───────────────────────────────────
window.onSpotifyWebPlaybackSDKReady = setupPlayer;

function setupPlayer() {
  player = new Spotify.Player({
    name: 'Snipify Player',
    getOAuthToken: cb => cb(access),
    volume: 0.8
  });

  player.addListener('ready', async e => {
    deviceId = e.device_id;
    await ensureDeviceActive();               // first transfer
  });
  player.connect();
  document.body.addEventListener('click', () => player.activateElement(), { once: true });

  // buttons
  buttons.forEach(b => b.onclick = () => { b.classList.add('used'); playSnippet(+b.dataset.sec); });
  fullBtn.onclick   = toggleFull;
  nextBtn.onclick   = () => { player.pause(); pickNext(); };
  revealBtn.onclick = () => { revealed = !revealed; revealBtn.textContent = revealed ? 'Hide 🎵' : 'Reveal 🎵'; refreshDisplay(); };
  backBtn.onclick   = () => { player.pause(); location.href = 'selector.html'; };
}

async function toggleFull() {
  if (!current?.uri) return;
  const playing = waveform.style.opacity === '1';
  playing ? player.pause() : await playTrack(current.uri);
  waveform.style.opacity = playing ? 0 : 1;
  fullBtn.textContent    = playing ? 'Play full' : 'Stop';
}

// ───────────────────────────── PLAYBACK ───────────────────────────────────
async function playTrack(uri, pos = 0) {
  await ensureDeviceActive();                   // guarantee right device
  await api(`me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms: pos })
  });
}

async function playSnippet(sec) {
  if (!current?.uri) return;

  clearInterval(snippetWatch);

  try {
    await playTrack(current.uri, 0);
    await waitUntilPlaying();
    waveform.style.opacity = 1;
    const t0 = Date.now();

    snippetWatch = setInterval(async () => {
      const played = (Date.now() - t0) / 1000;
      if (played >= sec) {
        clearInterval(snippetWatch);
        waveform.style.opacity = 0;
        await player.pause();
      }
    }, 100);
  } catch (e) {
    console.error('Snippet error', e);
    pickNext();                  // fallback: skip problematic track
  }
}

function waitUntilPlaying(timeout = 2000) {
  return new Promise(resolve => {
    const start = Date.now();
    (async function poll() {
      const st = await player.getCurrentState().catch(() => null);
      if (st && !st.paused && st.position > 0) return resolve();
      if (Date.now() - start > timeout)        return resolve();
      setTimeout(poll, 50);
    })();
  });
}
