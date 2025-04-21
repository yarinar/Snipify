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
  }).then(r => r.json());
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
  const data = await api(`playlists/${playlistUI.value}/tracks?fields=items(track(uri,name,artists(name)))&limit=100`);
  tracks = data.items.map(i => i.track).filter(Boolean);
  pickRandom();
};

function pickRandom() {
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
  if (current?.uri) playTrack(current.uri);
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
  if (!current?.uri) return;
  await playTrack(current.uri, 0);
  setTimeout(() => {
    api(`me/player/pause?device_id=${deviceId}`, { method: 'PUT' });
  }, seconds * 1000);
}
