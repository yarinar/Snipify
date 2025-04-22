// selector.js (v2.1)
import { startLogin, getValidToken } from './auth.js';

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
    const access = await getValidToken();
    if (!access) {
      startLogin();
      return;
    }

    const response = await fetch('https://api.spotify.com/v1/me/playlists', {
      headers: {
        'Authorization': `Bearer ${access}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const grid = document.getElementById('playlist-grid');
    grid.innerHTML = '';

    data.items.forEach(playlist => {
      const div = document.createElement('div');
      div.className = 'playlist';
      div.innerHTML = `
        <img src="${playlist.images[0]?.url || 'default-playlist.png'}" alt="${playlist.name}">
        <h3>${playlist.name}</h3>
      `;
      div.onclick = () => {
        localStorage.setItem('selected_playlist', playlist.id);
        window.location.href = 'quiz.html';
      };
      grid.appendChild(div);
    });

    setupShuffleToggle();
  } catch (error) {
    console.error('Error initializing selector:', error);
    localStorage.clear();
    window.location.href = 'login.html';
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
