// quiz.js (v2.3)
import { startLogin } from './auth.js';

const backBtn       = document.getElementById('back');
const albumArt      = document.getElementById('albumArt');
const trackNameEl   = document.getElementById('trackName');
const trackArtistEl = document.getElementById('trackArtist');
const waveform      = document.getElementById('waveform');
const buttons       = [...document.querySelectorAll('[data-sec]')];
const fullBtn       = document.getElementById('full');
const revealBtn     = document.getElementById('reveal');
const nextBtn       = document.getElementById('next');

let access, deviceId, tracks = [], current, revealed = false;
let player;
let snippetWatcher = null; 
let playQueue = [];
let queueIndex = 0;

//---------------------------------- INIT -----------------------------------
(async function init() {
  access = localStorage.getItem('access_token');
  if (!access) return startLogin();

  // Check if token is expired
  if (isTokenExpired()) {
    console.log('Token expired, refreshing...');
    try {
      await refreshToken();
    } catch (err) {
      console.error('Failed to refresh token:', err);
      return startLogin();
    }
  }

  const playlistId = localStorage.getItem('selected_playlist');
  if (!playlistId) return (location.href = 'selector.html');

  try {
    await loadTracks(playlistId);
    setupPlayer();
    pickNext();
  } catch (err) {
    console.error(err);
    location.href = 'selector.html';
  }
})();

// Check if token is expired
function isTokenExpired() {
  const tokenExpiry = localStorage.getItem('token_expiry');
  if (!tokenExpiry) return true;
  
  // Check if token is expired or will expire in the next 5 minutes
  return Date.now() >= parseInt(tokenExpiry) - 300000;
}

// Simplified refresh token function that redirects to login
async function refreshToken() {
  console.log('Token expired, redirecting to login...');
  localStorage.removeItem('access_token');
  location.href = 'selector.html';
}

//-------------------------------- API --------------------------------------
/**
 * Makes an API request to Spotify's Web API
 * 
 * Note: If you're hosting this on a server, you may need to set up CORS headers
 * on your server to allow requests to Spotify's API. For client-side only apps,
 * this should work fine in modern browsers.
 */
function api(path, opts = {}) {
  return fetch(`https://api.spotify.com/v1/${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${access}`, ...opts.headers }
  }).then(async r => {
    if (!r.ok) {
      const errorText = await r.text();
      console.error(`API Error (${r.status}): ${errorText}`);
      
      // Handle specific error codes
      if (r.status === 401) {
        console.error('Token expired or invalid. Redirecting to login...');
        localStorage.removeItem('access_token');
        location.href = 'selector.html';
        return;
      }
      
      if (r.status === 403) {
        console.error('Insufficient permissions. Please check your Spotify account.');
      }
      
      throw new Error(errorText);
    }
    
    if (r.status === 204) return {};
    return r.json();
  });
}

async function loadTracks(id){
  const res = await api(`playlists/${id}/tracks?limit=100`);
  playQueue = res.items.map(i=>i.track).filter(Boolean);

  if(localStorage.getItem('shuffle') === '1'){
    shuffleArray(playQueue);
  }
  queueIndex = 0;
}

//-------------------------------- UI Helpers -------------------------------
function updateTrackDisplay() {
  if (revealed) {
    albumArt.hidden = false;
    albumArt.src = current.album?.images?.[0]?.url || '';
    trackNameEl.textContent = current.name;
    trackArtistEl.textContent = current.artists.map(a => a.name).join(', ');
  } else {
    albumArt.hidden = true;
    albumArt.src = '';
    trackNameEl.textContent = '';
    trackArtistEl.textContent = '';
  }
  waveform.style.opacity = 0;
  fullBtn.textContent = 'Play full';
}

function resetSnippetButtons() {
  buttons.forEach(b => b.classList.remove('used'));
}

function pickNext(){
  if(playQueue.length === 0) return;

  current = playQueue[queueIndex++];
  if(queueIndex >= playQueue.length){  // loop
    queueIndex = 0;
    if(localStorage.getItem('shuffle') === '1') shuffleArray(playQueue);
  }
  revealed = false;
  resetSnippetButtons();
  updateTrackDisplay();
}

function shuffleArray(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
}

//-------------------------------- PLAYER SETUP -----------------------------
// Check if SDK is already loaded
if (window.Spotify) {
  setupPlayer();
} else {
  window.onSpotifyWebPlaybackSDKReady = setupPlayer;
}

function setupPlayer() {
  player = new Spotify.Player({ name: 'Snipify Player', getOAuthToken: cb => cb(access), volume: 0.8 });

  player.addListener('ready', e => {
    deviceId = e.device_id;
    console.log('Player ready with Device ID:', deviceId);
  });
  
  player.addListener('not_ready', e => {
    console.error('Device ID has gone offline:', e.device_id);
    // If this was our active device, we need to handle it
    if (e.device_id === deviceId) {
      deviceId = null;
      // Try to reconnect
      setTimeout(() => {
        console.log('Attempting to reconnect player...');
        player.connect();
      }, 2000);
    }
  });
  
  player.addListener('initialization_error', ({ message }) => {
    console.error('Failed to initialize player:', message);
  });

  player.addListener('authentication_error', ({ message }) => {
    console.error('Failed to authenticate:', message);
    // Token might be invalid, redirect to login
    localStorage.removeItem('access_token');
    location.href = 'selector.html';
  });

  player.addListener('account_error', ({ message }) => {
    console.error('Failed to validate Spotify account:', message);
  });

  player.addListener('playback_error', ({ message }) => {
    console.error('Failed to perform playback:', message);
  });

  player.connect();
  document.body.addEventListener('click', () => player.activateElement(), { once: true });

  // Buttons
  buttons.forEach(b => (b.onclick = () => { b.classList.add('used'); playSnippet(+b.dataset.sec); }));

  fullBtn.onclick = () => {
    if (!current?.uri) return;
    const playing = waveform.style.opacity === '1';
    playing ? player.pause() : playTrack(current.uri);
    waveform.style.opacity = playing ? 0 : 1;
    fullBtn.textContent   = playing ? 'Play full' : 'Stop';
  };

  nextBtn.onclick = () => { player.pause(); pickRandom(); };

  revealBtn.onclick = () => { revealed = !revealed; revealBtn.textContent = revealed ? 'Hide 🎵' : 'Reveal 🎵'; updateTrackDisplay(); };

  backBtn.onclick = () => { player.pause(); location.href = 'selector.html'; };
}

//-------------------------------- Playback Helpers -------------------------
function playTrack(uri, pos = 0) {
  return api(`me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({ uris: [uri], position_ms: pos })
  });
}

async function playSnippet(sec) {
  if (!current?.uri || !player) return;

  // stop any previous snippet watcher
  if (snippetWatcher) {
    clearInterval(snippetWatcher);
    snippetWatcher = null;
  }

  try {
    await playTrack(current.uri, 0);
    await waitUntilPlayingSDK();

    waveform.style.opacity = 1;
    const startTime = Date.now();

    // poll the local SDK every 100 ms
    snippetWatcher = setInterval(async () => {
      try {
        const state = await player.getCurrentState();
        if (!state || state.paused) {
          // If playback stopped unexpectedly, clean up
          clearInterval(snippetWatcher);
          snippetWatcher = null;
          waveform.style.opacity = 0;
          return;
        }
        
        const elapsed = Date.now() - startTime;
        if (elapsed >= sec * 1000) {
          await player.pause();                                      // reliable pause
          waveform.style.opacity = 0;
          clearInterval(snippetWatcher);
          snippetWatcher = null;
        }
      } catch (err) { 
        // Log error but don't crash
        console.error('Error in snippet watcher:', err);
        // Clean up on error
        clearInterval(snippetWatcher);
        snippetWatcher = null;
        waveform.style.opacity = 0;
      }
    }, 100);
  } catch (err) {
    console.error('Snippet error:', err);
    // Ensure cleanup on error
    if (snippetWatcher) {
      clearInterval(snippetWatcher);
      snippetWatcher = null;
    }
    waveform.style.opacity = 0;
  }
}

function waitUntilPlayingSDK(timeout = 2000) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const poll = async () => {
      const st = await player.getCurrentState().catch(() => null);
      if (st && !st.paused && st.position > 0) return resolve();
      if (Date.now() - t0 > timeout) return resolve();               // fallback
      setTimeout(poll, 50);
    };
    poll();
  });
}
