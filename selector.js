// selector.js
import { startLogin } from './auth.js';

const loginBtn = document.getElementById('login');
const grid     = document.getElementById('playlistGrid');

let access;

(async function init() {
  access = localStorage.getItem('access_token');
  if (!access) return loginBtn.onclick = startLogin;
  loginBtn.hidden = true;

  try {
    const user = await api('me');
    console.log('✅ Logged in as:', user.display_name || user.id);
    const data = await api('me/playlists?limit=50');
    renderGrid(data.items);
  } catch (err) {
    console.error("Auth or playlist fetch error:", err);
    startLogin();
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
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  });
}

function renderGrid(playlists) {
  grid.innerHTML = '';
  playlists.forEach(p => {
    const div = document.createElement('div');
    div.className = 'playlist';
    div.innerHTML = `
      <img src="${p.images[0]?.url || ''}" alt="${p.name}" />
      <p>${p.name}</p>
    `;
    div.onclick = () => {
      localStorage.setItem('selected_playlist', p.id);
      location.href = 'index.html';
    };
    grid.appendChild(div);
  });
}
