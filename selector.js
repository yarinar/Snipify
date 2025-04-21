// selector.js
import { startLogin } from './auth.js';

const playlistGrid = document.getElementById('playlistGrid');
const nextBtn = document.getElementById('nextBtn');

let selectedId = null;
let accessToken = localStorage.getItem('access_token');

if (!accessToken) {
  startLogin();
} else {
  loadPlaylists();
}

async function loadPlaylists() {
  try {
    const res = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const data = await res.json();
    renderPlaylists(data.items);
  } catch (err) {
    console.error('Failed to load playlists:', err);
    alert('Error loading playlists. Please try logging in again.');
    startLogin();
  }
}

function renderPlaylists(playlists) {
  playlistGrid.innerHTML = '';
  playlists.forEach(p => {
    const div = document.createElement('div');
    div.className = 'playlist';
    div.onclick = () => {
      document.querySelectorAll('.playlist.selected').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      selectedId = p.id;
      nextBtn.disabled = false;
    };

    const img = document.createElement('img');
    img.src = p.images[0]?.url || 'https://via.placeholder.com/150';

    const name = document.createElement('div');
    name.className = 'playlist-name';
    name.textContent = p.name;

    div.appendChild(img);
    div.appendChild(name);
    playlistGrid.appendChild(div);
  });
}

nextBtn.onclick = () => {
  if (selectedId) {
    localStorage.setItem('selected_playlist_id', selectedId);
    window.location.href = 'index.html';
  }
};
