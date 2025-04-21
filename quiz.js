// quiz.js
import { startLogin } from './auth.js';

const loginBtn   = document.getElementById('login');
const gameArea   = document.getElementById('game');
const answerUI   = document.getElementById('answer');
const buttons    = [...document.querySelectorAll('[data-sec]')];
const fullBtn    = document.getElementById('full');
const nextBtn    = document.getElementById('next');
const revealBtn  = document.getElementById('reveal');
const backBtn    = document.getElementById('back');
const albumImg   = document.getElementById('albumArt');
const trackName  = document.getElementById('trackName');
const trackArtist = document.getElementById('trackArtist');
const waveform   = document.getElementById('waveform');

let access, deviceId, tracks = [], current, isRevealed = false, isFullPlaying = false;

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
  gameArea.hidden = false;

  const playlistId = localStorage.getItem('selected_playlist_id');
  if (!playlistId) {
    window.location.href = 'selector.html';
    return;
  }

  await loadTracks(playlistId);
})()

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

async function loadTracks(playlistId) {
  try {
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

    setupPlayer();
    pickRandom();
  } catch (err) {
    console.error("Playlist load error:", err);
    alert("An error occurred loading the playlist.");
  }
}

function pickRandom() {
  if (!tracks || tracks.length === 0) {
    alert("No tracks loaded.");
    return;
  }
  current = tracks[Math.floor(Math.random() * tracks.length)];
  isRevealed = false;
  updateDetails();
}

function updateDetails() {
  albumImg.src = isRevealed ? (current.album?.images?.[0]?.url || '') : '';
  trackName.textContent = isRevealed ? current.name : '';
  trackArtist.textContent = isRevealed ? current.artists.map(a => a.name).join(', ') : '';
  waveform.style.opacity = 0;
  buttons.forEach(btn => btn.classList.remove('used'));
  fullBtn.textContent = 'Play full';
  isFullPlaying = false;
}

window.onSpotifyWebPlaybackSDKReady = () => {
  setupPlayer();
};

let player;
async function setupPlayer() {
  player = new Spotify.Player({
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

  fullBtn.onclick = async () => {
    if (!current?.uri) return;

    if (isFullPlaying) {
      await pausePlayback();
      isFullPlaying = false;
      fullBtn.textContent = 'Play full';
      waveform.style.opacity = 0;
    } else {
      await playTrack(current.uri);
      isFullPlaying = true;
      fullBtn.textContent = 'Stop';
      waveform.style.opacity = 1;
    }
  };

  nextBtn.onclick = async () => {
    await pausePlayback();
    pickRandom();
  };

  revealBtn.onclick = () => {
    isRevealed = !isRevealed;
    revealBtn.textContent = isRevealed ? 'Hide 🔒' : 'Reveal 🎵';
    updateDetails();
  };

  backBtn.onclick = async () => {
    await pausePlayback();
    window.location.href = 'selector.html';
  };
}

function playTrack(uri, position_ms = 0) {
  return api(`me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms })
  });
}

async function pausePlayback() {
  try {
    const res = await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${access}` }
    });

    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      console.warn("Pause failed:", text);
    } else {
      console.log("✅ Paused successfully");
    }
  } catch (err) {
    console.error("Pause error:", err);
  }
}

async function playSnippet(seconds) {
  if (!current?.uri) {
    console.warn("No track loaded yet.");
    alert("Pick a playlist and wait for a song to load first.");
    return;
  }

  try {
    await playTrack(current.uri, 0);
    waveform.style.opacity = 1;

    setTimeout(() => {
      pausePlayback();
      waveform.style.opacity = 0;
    }, seconds * 1000);
  } catch (err) {
    console.error("Error during snippet playback:", err);
  }
}