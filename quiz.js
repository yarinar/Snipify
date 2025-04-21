import { startLogin } from './auth.js';

const loginBtn   = document.getElementById('login');
const gameArea   = document.getElementById('game');
const playlistUI = document.getElementById('playlistSelect');
const answerUI   = document.getElementById('answer');
const buttons    = [...document.querySelectorAll('[data-sec]')];
const fullBtn    = document.getElementById('full');
const nextBtn    = document.getElementById('next');
const revealBtn  = document.getElementById('reveal');
const statusUI   = document.getElementById('status');
const artworkUI  = document.getElementById('artwork');
const songNameUI = document.getElementById('songName');

let access, deviceId, tracks = [], current, isPlayingFull = false;

(async function init() {
  access = localStorage.getItem('access_token');
  if (!access) {
    loginBtn.onclick = startLogin;
    return;
  }

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
    if (res.status === 204) return {};
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
    const res = await api(`playlists/${playlistUI.value}/tracks?limit=100`);
    if (!res || !Array.isArray(res.items)) {
      alert("Failed to load playlist tracks.");
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
  }
};

function pickRandom() {
  current = tracks[Math.floor(Math.random() * tracks.length)];
  answerUI.textContent = '❓';
  artworkUI.hidden = true;
  artworkUI.src = '';
  songNameUI.textContent = '';
  resetSnippetButtons();
  updateStatus('⏸️ Paused');
  isPlayingFull = false;
  fullBtn.textContent = 'Play full';
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

  buttons.forEach(b => {
    b.onclick = () => {
      playSnippet(+b.dataset.sec);
      b.classList.add('used');
    };
  });

  fullBtn.onclick = () => {
    if (!current?.uri) return;
    if (isPlayingFull) {
      pause();
      fullBtn.textContent = 'Play full';
      isPlayingFull = false;
      updateStatus('⏸️ Paused');
    } else {
      playTrack(current.uri);
      fullBtn.textContent = 'Stop';
      isPlayingFull = true;
      updateStatus('🔊 Playing full');
    }
  };

  nextBtn.onclick = () => {
    pause();
    pickRandom();
  };

  revealBtn.onclick = () => {
    answerUI.textContent = `${current.name} – ${current.artists.map(a => a.name).join(', ')}`;
    if (current.album?.images?.length) {
      artworkUI.src = current.album.images[0].url;
      artworkUI.hidden = false;
      songNameUI.textContent = current.name;
    }
  };
}

function resetSnippetButtons() {
  buttons.forEach(b => b.classList.remove('used'));
}

function updateStatus(msg) {
  statusUI.textContent = msg;
}

function playTrack(uri, position_ms = 0) {
  updateStatus('🔊 Playing');
  return api(`me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms })
  });
}

function pause() {
  return fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${access}` }
  }).then(() => updateStatus('⏸️ Paused'));
}

async function playSnippet(seconds) {
  if (!current?.uri) return alert("Pick a playlist and wait for a song to load.");
  try {
    await playTrack(current.uri, 0);
    setTimeout(() => pause(), seconds * 1000);
  } catch (err) {
    console.error("Error during snippet playback:", err);
  }
}