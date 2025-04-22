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
    setupShuffleToggle();
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
      window.location.href = 'index.html';
    };
    grid.appendChild(card);
  });
}

function setupShuffleToggle() {
  // Create the shuffle toggle container
  const shuffleContainer = document.createElement('div');
  shuffleContainer.className = 'shuffle-container';
  shuffleContainer.style.cssText = 'text-align: center; margin: 1rem 0; color: #ddd;';
  
  // Create the label and checkbox
  const label = document.createElement('label');
  label.style.cssText = 'cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 0.5rem;';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = 'shuffleToggle';
  
  // Set the initial state from localStorage
  const savedShuffle = localStorage.getItem('shuffle');
  checkbox.checked = savedShuffle === null ? true : savedShuffle === '1';
  
  // Add event listener to save preference
  checkbox.addEventListener('change', () => {
    const shuffle = checkbox.checked;
    localStorage.setItem('shuffle', shuffle ? '1' : '0');
  });
  
  // Add text to the label
  const text = document.createTextNode('Shuffle songs');
  
  // Assemble the elements
  label.appendChild(checkbox);
  label.appendChild(text);
  shuffleContainer.appendChild(label);
  
  // Add to the page before the grid
  const logo = document.getElementById('logo');
  logo.parentNode.insertBefore(shuffleContainer, logo.nextSibling);
}
