import { startLogin } from './auth.js';

const loginBtn   = document.getElementById('login');
const gameArea   = document.getElementById('game');
const playlistUI = document.getElementById('playlistSelect');
const answerUI   = document.getElementById('answer');
const buttons    = [...document.querySelectorAll('[data-sec]')];

let access, deviceId, tracks = [], current;

(async function init() {
  access = localStorage.getItem('access_token');
  if (!access) {
    loginBtn.onclick = startLogin;
    return;
  }

  // 🧪 DEBUG: Check who you are and verify token scopes
  try {
    const profile = await api("me");
    console.log("✅ Logged in as:", profile.display_name || profile.id);

    const playbackCheck = await fetch("https://api.spotify.com/v1/me/player", {
      headers: { Authorization: `Bearer ${access}` }
    });
    console.log("🎧 Player control status:", playbackCheck.status);
    if (playbackCheck.status === 403) {
      console.warn("❌ You are missing some playback-related scopes!");
    }
  } catch (err) {
    console.error("⚠️ Error verifying token or playback access:", err);
  }

  loginBtn.hidden = true;
  await loadPlaylists();
  gameArea.hidden = false;
})();


function api(path, opts = {}) {
  return fetch(`https://api.spotify.com/v1/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${access}`,
      ...opts.headers
    }
  }).then(async res => {
    if (res.status === 204) return {}; // No content to parse
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Spotify API error (${res.status}): ${text}`);
    }
    return res.json().catch(() => ({}));
  });
}

async function loadPlaylists() {
  const data = await api('me/playlists?limit=50');
  data.items.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    playlistUI.appendChild(opt);
  });
}

playlistUI.onchange = async () => {
  try {
    const playlistId = playlistUI.value;

    const res = await api(`playlists/${playlistId}/tracks?limit=100`);

    if (!res || typeof res !== 'object' || !Array.isArray(res.items)) {
      console.error("Invalid playlist response:", res);
      alert("Failed to load playlist tracks. Try logging in again or pick another playlist.");
      return;
    }

    tracks = res.items.map(i => i.track).filter(Boolean);

    if (tracks.length === 0) {
      alert("This playlist has no playable tracks.");
      return;
    }

    pickRandom();
  } catch (err) {
    console.error("Playlist load error:", err);
    alert("An error occurred loading the playlist.");
  }
};

function pickRandom() {
  if (!tracks || tracks.length === 0) {
    alert("No tracks loaded.");
    return;
  }
  current = tracks[Math.floor(Math.random() * tracks.length)];
  answerUI.textContent = '❓';
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

  buttons.forEach(b => b.onclick = () => playSnippet(+b.dataset.sec));
  document.getElementById('full').onclick = () => {
    if (!current?.uri) {
      alert("No track loaded yet.");
      return;
    }
    playTrack(current.uri);
  };
  document.getElementById('next').onclick  = pickRandom;
  document.getElementById('reveal').onclick = () =>
    answerUI.textContent = `${current.name} – ${current.artists.map(a => a.name).join(', ')}`;
}

function playTrack(uri, position_ms = 0) {
  return api(`me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms })
  });
}

async function playSnippet(seconds) {
  if (!current?.uri) {
    console.warn("No track loaded yet.");
    alert("Pick a playlist and wait for a song to load first.");
    return;
  }

  try {
    await playTrack(current.uri, 0);
    setTimeout(async () => {
      try {
        await api(`me/player/pause?device_id=${deviceId}`, { method: 'PUT' });
        console.log("Playback paused");
      } catch (err) {
        console.error("Pause failed:", err);
      }
    }, seconds * 1000);
  } catch (err) {
    console.error("Error during snippet playback:", err);
  }
}
