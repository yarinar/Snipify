// quiz.js (v2.2)
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

let access, deviceId, tracks = [], current, revealed = false;

//---------------------------------- INIT -----------------------------------
(async function init() {
  access = localStorage.getItem('access_token');
  if (!access) return startLogin();

  const playlistId = localStorage.getItem('selected_playlist');
  if (!playlistId) return (location.href = 'selector.html');

  try {
    await loadTracks(playlistId);
    setupPlayer();
    pickRandom();
  } catch (err) {
    console.error(err);
    location.href = 'selector.html';
  }
})();

//-------------------------------- API --------------------------------------
function api(path, opts = {}) {
  return fetch(`https://api.spotify.com/v1/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${access}`, ...opts.headers }
  }).then(async r => {
    if (!r.ok) throw new Error(await r.text());
    if (r.status === 204) return {};
    return r.json();
  });
}

async function loadTracks(playlistId) {
  const res = await api(`playlists/${playlistId}/tracks?limit=100`);
  tracks = res.items.map(i => i.track).filter(Boolean);
  if (!tracks.length) throw new Error('Playlist empty');
}

//-------------------------------- UI Helpers -------------------------------
function updateTrackDisplay() {
  if (revealed) {
    albumArt.hidden = false;
    albumArt.src = current.album?.images?.[0]?.url || '';
    trackNameEl.textContent = current.name;
    trackArtistEl.textContent = current.artists.map(a => a.name).join(', ');
  } else {
    albumArt.hidden = true;
    albumArt.src = '';
    trackNameEl.textContent = '';
    trackArtistEl.textContent = '';
  }
  waveform.style.opacity = 0;
  fullBtn.textContent = 'Play full';
}

function resetSnippetButtons() {
  buttons.forEach(b => b.classList.remove('used'));
}

function pickRandom() {
  current = tracks[Math.floor(Math.random() * tracks.length)];
  revealed = false;
  resetSnippetButtons();
  updateTrackDisplay();
}

//-------------------------------- PLAYER SETUP -----------------------------
window.onSpotifyWebPlaybackSDKReady = setupPlayer;

function setupPlayer() {
  const player = new Spotify.Player({ name: 'Snipify Player', getOAuthToken: cb => cb(access), volume: 0.8 });

  player.addListener('ready', e => (deviceId = e.device_id));
  player.connect();
  document.body.addEventListener('click', () => player.activateElement(), { once: true });

  // Buttons
  buttons.forEach(b => (b.onclick = () => { b.classList.add('used'); playSnippet(+b.dataset.sec); }));

  fullBtn.onclick = () => {
    if (!current?.uri) return;
    const playing = waveform.style.opacity === '1';
    playing ? pause() : playTrack(current.uri);
    waveform.style.opacity = playing ? 0 : 1;
    fullBtn.textContent   = playing ? 'Play full' : 'Stop';
  };

  nextBtn.onclick = () => { pause(); pickRandom(); };

  revealBtn.onclick = () => { revealed = !revealed; revealBtn.textContent = revealed ? 'Hide 🎵' : 'Reveal 🎵'; updateTrackDisplay(); };

  backBtn.onclick = () => { pause(); location.href = 'selector.html'; };
}

//-------------------------------- Playback Helpers -------------------------
function playTrack(uri, pos = 0) {
  return api(`me/player/play?device_id=${deviceId}`, { method: 'PUT', body: JSON.stringify({ uris: [uri], position_ms: pos }) });
}

function pause() {
  return fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, { method: 'PUT', headers: { Authorization: `Bearer ${access}` } });
}

async function playSnippet(sec) {
  if (!current?.uri) return;

  try {
    await playTrack(current.uri, 0);

    // Wait until the Spotify SDK confirms playback has actually started
    await waitUntilActuallyPlaying();

    waveform.style.opacity = 1;

    setTimeout(async () => {
      await pause();
      waveform.style.opacity = 0;
    }, sec * 1000);
  } catch (err) {
    console.error("Snippet error:", err);
  }
}

function waitUntilActuallyPlaying(timeout = 2000) {
  return new Promise(resolve => {
    const startTime = Date.now();

    const check = async () => {
      try {
        const state = await api("me/player");
        if (state?.is_playing) return resolve();
      } catch (e) {
        console.warn("Error checking playback state", e);
      }

      if (Date.now() - startTime > timeout) return resolve(); // fallback
      setTimeout(check, 50); // slower polling is more stable than requestAnimationFrame
    };

    check();
  });
}
