import { startLogin } from './auth.js';

const loginBtn    = document.getElementById('login');
const gameArea    = document.getElementById('game');
const playlistUI  = document.getElementById('playlistSelect');
const statusUI    = document.getElementById('status');

// UI elements for reveal
const artworkUI   = document.getElementById('artwork');
const songNameUI  = document.getElementById('songName');
const songArtistUI= document.getElementById('songArtists');

const buttons     = [...document.querySelectorAll('[data-sec]')];
const fullBtn     = document.getElementById('full');
const nextBtn     = document.getElementById('next');
const revealBtn   = document.getElementById('reveal');

let access, deviceId, tracks = [], current, isPlayingFull = false, isRevealed = false;

//------------------------------------ INIT ----------------------------------
(async function init() {
  access = localStorage.getItem('access_token');
  if (!access) {
    loginBtn.onclick = startLogin;
    return;
  }

  loginBtn.hidden = true;
  await loadPlaylists();
  gameArea.hidden = false;
})();

//-------------------------------- Spotify API helper ------------------------
function api(path, opts = {}) {
  return fetch(`https://api.spotify.com/v1/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${access}`, ...opts.headers }
  }).then(async res => {
    if (res.status === 204) return {};
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  });
}

//-------------------------------- Playlists ---------------------------------
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
  const res = await api(`playlists/${playlistUI.value}/tracks?limit=100`);
  tracks = res.items.map(i => i.track).filter(Boolean);
  pickRandom();
};

function pickRandom() {
  current = tracks[Math.floor(Math.random() * tracks.length)];
  // reset UI
  artworkUI.hidden = true;
  songNameUI.hidden = true;
  songArtistUI.hidden = true;
  artworkUI.src = '';
  songNameUI.textContent = '';
  songArtistUI.textContent = '';
  isRevealed = false;
  revealBtn.textContent = 'Reveal 🎵';
  resetSnippetButtons();
  updateStatus('⏸️ Paused');
  isPlayingFull = false;
  fullBtn.textContent = 'Play full';
}

//-------------------------------- Web Playback SDK --------------------------
window.onSpotifyWebPlaybackSDKReady = () => {
  setupPlayer();
};

async function setupPlayer() {
  const player = new Spotify.Player({ name: 'Snipify Player', getOAuthToken: cb => cb(access), volume: 0.8 });
  player.addListener('ready', e => deviceId = e.device_id);
  await player.connect();
  document.body.addEventListener('click', () => player.activateElement(), { once: true });

  // snippet buttons
  buttons.forEach(b => b.onclick = () => { playSnippet(+b.dataset.sec); b.classList.add('used'); });

  // full play / stop
  fullBtn.onclick = () => {
    if (!current?.uri) return;
    if (isPlayingFull) {
      pause();
      fullBtn.textContent = 'Play full';
      updateStatus('⏸️ Paused');
    } else {
      playTrack(current.uri);
      fullBtn.textContent = 'Stop';
      updateStatus('🔊 Playing full');
    }
    isPlayingFull = !isPlayingFull;
  };

  // next song
  nextBtn.onclick = () => { pause(); pickRandom(); };

  // reveal / hide toggle
  revealBtn.onclick = () => {
    if (!current) return;
    isRevealed = !isRevealed;
    if (isRevealed) {
      songNameUI.textContent = current.name;
      songArtistUI.textContent = current.artists.map(a => a.name).join(', ');
      if (current.album?.images?.length) artworkUI.src = current.album.images[0].url;
    }
    artworkUI.hidden = !isRevealed;
    songNameUI.hidden = !isRevealed;
    songArtistUI.hidden = !isRevealed;
    revealBtn.textContent = isRevealed ? 'Hide 🔒' : 'Reveal 🎵';
  };
}

//-------------------------------- Helpers -----------------------------------
function resetSnippetButtons() { buttons.forEach(b => b.classList.remove('used')); }
function updateStatus(txt) { statusUI.textContent = txt; }

function playTrack(uri, position_ms = 0) {
  updateStatus('🔊 Playing');
  return api(`me/player/play?device_id=${deviceId}`, { method:'PUT', body: JSON.stringify({ uris:[uri], position_ms }) });
}
function pause() {
  return fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, { method:'PUT', headers:{Authorization:`Bearer ${access}`} }).then(()=>updateStatus('⏸️ Paused'));
}
async function playSnippet(sec) {
  if (!current?.uri) return;
  await playTrack(current.uri); setTimeout(()=> pause(), sec*1000);
}
