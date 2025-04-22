// quiz.js (v2.3)
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
let player;
let snippetTimer = null;

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
  player = new Spotify.Player({ name: 'Snipify Player', getOAuthToken: cb => cb(access), volume: 0.8 });

  player.addListener('ready', e => (deviceId = e.device_id));
  player.connect();
  document.body.addEventListener('click', () => player.activateElement(), { once: true });

  // Buttons
  buttons.forEach(b => (b.onclick = () => { b.classList.add('used'); playSnippet(+b.dataset.sec); }));

  fullBtn.onclick = () => {
    if (!current?.uri) return;
    const playing = waveform.style.opacity === '1';
    playing ? player.pause() : playTrack(current.uri);
    waveform.style.opacity = playing ? 0 : 1;
    fullBtn.textContent   = playing ? 'Play full' : 'Stop';
  };

  nextBtn.onclick = () => { player.pause(); pickRandom(); };

  revealBtn.onclick = () => { revealed = !revealed; revealBtn.textContent = revealed ? 'Hide 🎵' : 'Reveal 🎵'; updateTrackDisplay(); };

  backBtn.onclick = () => { player.pause(); location.href = 'selector.html'; };
}

//-------------------------------- Playback Helpers -------------------------
function playTrack(uri, pos = 0) {
  return api(`me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms: pos })
  });
}

async function playSnippet(sec) {
  if (!current?.uri || !player) return;

  if (snippetTimer) {
    clearTimeout(snippetTimer);
    snippetTimer = null;
  }

  try {
    await playTrack(current.uri, 0);

    await waitUntilPlayingSDK();

    waveform.style.opacity = 1;

    snippetTimer = setTimeout(async () => {
      await player.pause();
      waveform.style.opacity = 0;
      snippetTimer = null;
    }, sec * 1000);

  } catch (err) {
    console.error('Snippet error:', err);
  }
}

function waitUntilPlayingSDK(timeout = 2000) {
  return new Promise(resolve => {
    const start = Date.now();

    const poll = async () => {
      try {
        const state = await player.getCurrentState();
        if (state && !state.paused && state.position > 0) return resolve();
      } catch {}

      if (Date.now() - start > timeout) return resolve();
      setTimeout(poll, 50);
    };

    poll();
  });
}
