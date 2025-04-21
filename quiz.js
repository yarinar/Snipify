// quiz.js
import { startLogin } from './auth.js';

const backBtn     = document.getElementById('back');
const albumArt    = document.getElementById('albumArt');
const trackNameEl = document.getElementById('trackName');
const trackArtistEl = document.getElementById('trackArtist');
const waveform    = document.getElementById('waveform');
const buttons     = [...document.querySelectorAll('[data-sec]')];
const fullBtn     = document.getElementById('full');
const revealBtn   = document.getElementById('reveal');
const nextBtn     = document.getElementById('next');

let access, deviceId, tracks = [], current, revealed = false;

(async function init() {
  access = localStorage.getItem('access_token');
  if (!access) return startLogin();

  const playlistId = localStorage.getItem('selected_playlist');
  if (!playlistId) return location.href = 'selector.html';

  try {
    const profile = await api("me");
    console.log("✅ Logged in as:", profile.display_name || profile.id);

    const playbackCheck = await fetch("https://api.spotify.com/v1/me/player", {
      headers: { Authorization: `Bearer ${access}` }
    });
    console.log("🎧 Player control status:", playbackCheck.status);

    const res = await api(`playlists/${playlistId}/tracks?limit=100`);
    if (!res?.items?.length) throw new Error('Empty or invalid playlist');
    tracks = res.items.map(i => i.track).filter(Boolean);
    pickRandom();
  } catch (err) {
    console.error("Playlist load error:", err);
    alert("Couldn't load playlist. Returning to selector.");
    location.href = 'selector.html';
  }
})();

function api(path, opts = {}) {
  return fetch(`https://api.spotify.com/v1/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${access}`,
      ...opts.headers
    }
  }).then(async res => {
    if (res.status === 204) return {};
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  });
}

function pickRandom() {
  current = tracks[Math.floor(Math.random() * tracks.length)];
  revealed = false;
  updateTrackDisplay();
  resetSnippetButtons();
}

function updateTrackDisplay() {
  albumArt.src = current.album?.images?.[0]?.url || '';
  trackNameEl.textContent = revealed ? current.name : '';
  trackArtistEl.textContent = revealed ? current.artists.map(a => a.name).join(', ') : '';
  waveform.style.opacity = 0;
  fullBtn.textContent = 'Play full';
}

function resetSnippetButtons() {
  buttons.forEach(b => b.classList.remove('used'));
}

window.onSpotifyWebPlaybackSDKReady = () => {
  setupPlayer();
};

async function setupPlayer() {
  const player = new Spotify.Player({
    name: 'Quiz Player',
    getOAuthToken: cb => cb(access),
    volume: 0.8
  });

  player.addListener('ready', e => {
    deviceId = e.device_id;
    console.log('Player ready:', deviceId);
  });

  player.addListener('initialization_error', e => console.error(e));
  player.addListener('authentication_error', e => console.error(e));
  player.addListener('account_error', e => console.error(e));
  player.addListener('playback_error', e => console.error(e));

  await player.connect();

  document.body.addEventListener('click', () => player.activateElement(), { once: true });

  buttons.forEach(b => b.onclick = () => {
    b.classList.add('used');
    playSnippet(+b.dataset.sec);
  });

  fullBtn.onclick = () => {
    if (!current?.uri) return;
    const isPlaying = waveform.style.opacity === '1';
    if (isPlaying) {
      pause();
      fullBtn.textContent = 'Play full';
    } else {
      playTrack(current.uri);
      waveform.style.opacity = 1;
      fullBtn.textContent = 'Stop';
    }
  };

  nextBtn.onclick = () => {
    pause();
    pickRandom();
  };

  revealBtn.onclick = () => {
    revealed = !revealed;
    revealBtn.textContent = revealed ? 'Hide 🎵' : 'Reveal 🎵';
    updateTrackDisplay();
  };

  backBtn.onclick = () => {
    pause();
    location.href = 'selector.html';
  };
}

function playTrack(uri, position_ms = 0) {
  return api(`me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms })
  });
}

function pause() {
  return fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${access}` }
  });
}

async function playSnippet(seconds) {
  if (!current?.uri) return;
  try {
    await playTrack(current.uri, 0);
    waveform.style.opacity = 1;
    setTimeout(async () => {
      await pause();
      waveform.style.opacity = 0;
    }, seconds * 1000);
  } catch (err) {
    console.error("Snippet error:", err);
  }
}