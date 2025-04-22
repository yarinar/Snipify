// selector.js (v2.1)
import { startLogin } from './auth.js';

const grid = document.getElementById('grid'); // matches <div id="grid"> in selector.html

let access = localStorage.getItem('access_token');
if (!access) {
  // redirect user to Spotify login flow
  startLogin();
} else {
  init();
}

async function init() {
  try {
    const user = await api('me');
    console.log('✅ Logged in as', user.display_name || user.id);

    // fetch *all* playlists (pagination)
    let next = 'me/playlists?limit=50';
    const playlists = [];
    while (next) {
      const data = await api(next);
      playlists.push(...data.items);
      next = data.next ? data.next.replace('https://api.spotify.com/v1/', '') : null;
    }

    renderGrid(playlists);
  } catch (err) {
    console.error('Auth/playlist error', err);
    startLogin();
  }
}

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

function renderGrid(playlists) {
  grid.innerHTML = '';
  playlists.forEach(p => {
    const card = document.createElement('div');
    card.className = 'playlist';
    card.innerHTML = `
      <img src="${p.images?.[0]?.url || ''}" alt="${p.name}">
      <div class="playlist-name">${p.name}</div>`;
    card.onclick = () => {
      localStorage.setItem('selected_playlist', p.id);
      const shuffle = document.getElementById('shuffleToggle').checked;
      localStorage.setItem('shuffle', shuffle ? '1' : '0');
      window.location.href = 'index.html';
    };
    grid.appendChild(card);
  });
}
