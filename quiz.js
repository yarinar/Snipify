// quiz.js (v2.3)
import { getValidToken } from './auth.js';

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
let snippetTimer = null;
let snippetWatcher = null;
let playQueue = [];
let queueIndex = 0;
let playedTracks = new Set();
let currentTrack = null;
let currentIndex = 0;

//---------------------------------- INIT -----------------------------------
async function init() {
  try {
    const access = await getValidToken();
    if (!access) {
      window.location.href = 'login.html';
      return;
    }

    const playlistId = localStorage.getItem('selected_playlist');
    if (!playlistId) {
      window.location.href = 'selector.html';
      return;
    }

    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
      headers: {
        'Authorization': `Bearer ${access}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    tracks = data.items.map(item => item.track).filter(track => track);
    
    if (tracks.length === 0) {
      throw new Error('No tracks found in playlist');
    }

    // Initialize Spotify Web Playback SDK
    window.onSpotifyWebPlaybackSDKReady = () => {
      const token = localStorage.getItem('access_token');
      player = new Spotify.Player({
        name: 'Snipify Player',
        getOAuthToken: cb => { cb(token); },
        volume: 0.5
      });

      // Error handling
      player.addListener('initialization_error', ({ message }) => { 
        console.error('Failed to initialize:', message);
        alert('Failed to initialize Spotify player. Please try again.');
      });
      player.addListener('authentication_error', ({ message }) => { 
        console.error('Failed to authenticate:', message);
        window.location.href = 'login.html';
      });
      player.addListener('account_error', ({ message }) => { 
        console.error('Failed to validate Spotify account:', message);
        alert('Please make sure you have a Spotify Premium account.');
      });
      player.addListener('playback_error', ({ message }) => { 
        console.error('Failed to perform playback:', message);
      });

      // Playback status updates
      player.addListener('player_state_changed', state => { 
        console.log('Player state changed:', state);
      });

      // Ready
      player.addListener('ready', async ({ device_id }) => {
        console.log('Ready with Device ID', device_id);
        deviceId = device_id;
        
        // Transfer playback to our device
        try {
          const transferResponse = await fetch('https://api.spotify.com/v1/me/player', {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              device_ids: [device_id]
            })
          });
          
          if (!transferResponse.ok) {
            throw new Error(`Failed to transfer playback: ${transferResponse.status}`);
          }
          
          // Wait a bit for the transfer to complete
          setTimeout(() => {
            loadNextTrack();
          }, 1000);
        } catch (error) {
          console.error('Failed to transfer playback:', error);
          alert('Failed to transfer playback to Snipify. Please try again.');
        }
      });

      // Connect to the player
      player.connect();
    };

    // Load the Spotify Web Playback SDK
    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    document.body.appendChild(script);

  } catch (error) {
    console.error('Error initializing quiz:', error);
    localStorage.clear();
    window.location.href = 'login.html';
  }
}

async function loadNextTrack() {
  try {
    const access = await getValidToken();
    if (!access) {
      window.location.href = 'login.html';
      return;
    }

    currentTrack = tracks[currentIndex];
    document.getElementById('track-info').textContent = 'Loading...';
    
    const response = await fetch(`https://api.spotify.com/v1/tracks/${currentTrack.id}`, {
      headers: {
        'Authorization': `Bearer ${access}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const track = await response.json();
    document.getElementById('track-info').textContent = `${track.name} - ${track.artists.map(a => a.name).join(', ')}`;
    
    // Start playback
    const playResponse = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${access}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uris: [`spotify:track:${currentTrack.id}`]
      })
    });

    if (!playResponse.ok) {
      throw new Error(`Failed to start playback: ${playResponse.status}`);
    }

    // Set timer to stop playback after 30 seconds
    setTimeout(async () => {
      try {
        const pauseResponse = await fetch(`https://api.spotify.com/v1/me/player/pause?device_id=${deviceId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${access}`
          }
        });
        
        if (!pauseResponse.ok) {
          console.error('Failed to pause playback:', pauseResponse.status);
        }
      } catch (error) {
        console.error('Error pausing playback:', error);
      }
    }, 30000);

  } catch (error) {
    console.error('Error loading track:', error);
    if (error.message.includes('HTTP error! status: 401')) {
      window.location.href = 'login.html';
    } else {
      alert('Failed to play track. Please try again.');
    }
  }
}

function nextTrack() {
  currentIndex = (currentIndex + 1) % tracks.length;
  loadNextTrack();
}

//-------------------------------- API --------------------------------------
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

function pickNext() {
  if (playQueue.length === 0) return;
  
  // Get the next track from the queue
  current = playQueue[queueIndex++];
  
  // Mark this track as played
  playedTracks.add(current.id);
  
  // If we've reached the end of the queue
  if (queueIndex >= playQueue.length) {
    // Reset queue index
    queueIndex = 0;
    
    // If all tracks have been played, reset the played tracks set
    if (playedTracks.size >= tracks.length) {
      playedTracks.clear();
    }
    
    // If shuffle is enabled, reshuffle the queue
    if (localStorage.getItem('shuffle') === '1') {
      shuffleArray(playQueue);
    }
  }
  
  revealed = false;
  resetSnippetButtons();
  updateTrackDisplay();
}

function shuffleArray(array) {
  // Fisher-Yates shuffle algorithm
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

//-------------------------------- PLAYER SETUP -----------------------------
window.onSpotifyWebPlaybackSDKReady = setupPlayer;

function setupPlayer() {
  player = new Spotify.Player({ name: 'Snipify Player', getOAuthToken: cb => cb(access), volume: 0.8 });

  player.addListener('ready', e => (deviceId = e.device_id));
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

  nextBtn.onclick = () => { player.pause(); pickNext(); };

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
        if (!state || state.paused) return;                          // already paused
        const elapsed = Date.now() - startTime;
        if (elapsed >= sec * 1000) {
          await player.pause();                                      // reliable pause
          waveform.style.opacity = 0;
          clearInterval(snippetWatcher);
          snippetWatcher = null;
        }
      } catch { /* ignore transient SDK errors */ }
    }, 100);
  } catch (err) {
    console.error('Snippet error:', err);
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

// Event listeners
document.getElementById('next-btn').addEventListener('click', nextTrack);

// Initialize
init();
