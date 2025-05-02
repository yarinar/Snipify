// quiz.js (v2.5)
// Robust‑playback version: retries device transfer & skips tracks on SDK errors
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

let access, player, deviceId;
let tracks=[], playQueue=[], queueIdx=0, played=new Set();
let current, revealed=false;
let snippetWatch=null;
let playerReady = false;

// ─────────── INIT ───────────
(async()=>{
  access=localStorage.getItem('access_token');
  if(!access) return startLogin();

  const plId=localStorage.getItem('selected_playlist');
  if(!plId)   return location.href='selector.html';

  try{
    await loadTracks(plId);
    setupPlayer();
    // Don't call pickNext() here - will be called when player is ready
  }catch(e){ console.error(e); location.href='selector.html'; }
})();

// ─────────── API ───────────
function api(path,opts={}){
  return fetch(`https://api.spotify.com/v1/${path}`,{
    ...opts,
    headers:{Authorization:`Bearer ${access}`,...opts.headers}
  }).then(async r=> (r.status===204?{}:r.json()));
}

async function transferHere(){
  try {
    // First check current playback state
    const currentPlayback = await api('me/player').catch(() => null);
    
    // Only transfer if needed (device ID is different or no active device)
    if (!currentPlayback || currentPlayback.device?.id !== deviceId) {
      await api('me/player',{
        method:'PUT',
        body:JSON.stringify({device_ids:[deviceId],play:false})
      });
      
      // Give Spotify a moment to register the device transfer
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    return true;
  } catch(e) {
    console.warn('Device transfer failed:', e);
    return false;
  }
}

// ─────────── PLAYLIST ───────────
async function loadTracks(id){
  const res=await api(`playlists/${id}/tracks?limit=100`);
  tracks=res.items.map(i=>i.track).filter(t=>t?.is_playable!==false);
  if(!tracks.length) throw new Error('No playable tracks');
  
  // Reset queue state entirely when loading new tracks
  playQueue=[...tracks];
  queueIdx=0;
  played.clear();
  // Defer shuffling and pickNext until player is ready
}
function shuffle(a){for(let i=a.length-1;i;--i){const j=(Math.random()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]]}}

// ─────────── UI ───────────
function refresh(){
  albumArt.hidden=!revealed;
  if(revealed){
    albumArt.src=current.album?.images?.[0]?.url||'';
    trackNameEl.textContent=current.name;
    trackArtistEl.textContent=current.artists.map(a=>a.name).join(', ');
  }else{
    albumArt.src=''; trackNameEl.textContent=trackArtistEl.textContent='';
  }
  waveform.style.opacity=0;
  fullBtn.textContent='Play full';
  revealBtn.textContent='Reveal 🎵';
  buttons.forEach(b=>b.classList.remove('used'));
}
function pickNext(){
  if(!playQueue.length) return;
  current=playQueue[queueIdx];
  played.add(current.id);
  queueIdx++;
  if(queueIdx>=playQueue.length){
    queueIdx=0;
    played.clear();
    // Don't shuffle here - only shuffle when explicitly requested
  }
  revealed=false;
  player && player.pause();
  refresh();
}

// ─────────── PLAYER ───────────
window.onSpotifyWebPlaybackSDKReady=setupPlayer;
function setupPlayer(){
  player=new Spotify.Player({name:'Snipify Player',getOAuthToken:cb=>cb(access),volume:0.8});

  player.addListener('ready',async e=>{
    deviceId=e.device_id; 
    await transferHere();
    playerReady = true;
    
    // Explicitly reset queue index to ensure we start at the first track
    queueIdx = 0;
    
    // Only shuffle if explicitly enabled, and do it *before* picking the first track
    if(localStorage.getItem('shuffle')==='1') {
      shuffle(playQueue);
    }
    
    // Now pick the first track after player is ready
    pickNext();
  });
  player.addListener('not_ready',()=>console.warn('Web player went offline'));
  player.addListener('playback_error',e=>{console.warn('SDK playback error',e); nextBtn.click();});
  player.connect();
  document.body.addEventListener('click',()=>player.activateElement(),{once:true});

  buttons.forEach(b=>b.onclick=()=>{b.classList.add('used'); playSnippet(+b.dataset.sec);});
  fullBtn.onclick=toggleFull;
  nextBtn.onclick =()=>{
    player.pause();
    revealed = false;
    pickNext();
  };
  revealBtn.onclick=()=>{
    revealed=!revealed;
    revealBtn.textContent=revealed?'Hide 🎵':'Reveal 🎵';
    refresh();
  };
  backBtn.onclick  =()=>{player.pause(); location.href='selector.html';};
}
async function toggleFull(){
  if(!current?.uri || !playerReady) return;
  const playing=waveform.style.opacity==='1';
  if(playing){
    await player.pause();
    waveform.style.opacity=0;
    fullBtn.textContent='Play full';
  }else{
    await playTrack(current.uri, 0);
    waveform.style.opacity=1;
    fullBtn.textContent='Stop';
  }
}

// ─────────── PLAYBACK HELPERS ───────────
async function playTrack(uri,pos=0){
  if(!playerReady) return;
  
  // Try transferring device up to 3 times
  let attempts = 0;
  let success = false;
  while (!success && attempts < 3) {
    try {
      await transferHere();
      await api(`me/player/play?device_id=${deviceId}`,{
        method:'PUT',body:JSON.stringify({uris:[uri],position_ms:pos})
      });
      success = true;
    } catch (err) {
      console.warn('Playback error, attempt:', attempts, err);
      attempts++;
      // Short delay before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  if (!success) {
    console.error('Failed to play track after multiple attempts');
  }
}
async function playSnippet(sec){
  if(!current?.uri || !playerReady) return;
  clearInterval(snippetWatch);
  
  let attempts = 0;
  const maxAttempts = 2;
  
  while (attempts < maxAttempts) {
    try{
      await playTrack(current.uri, 0);
      const playingState = await waitUntilPlaying(3000);
      
      if (!playingState) {
        console.warn('Track failed to start playing within timeout');
        attempts++;
        continue;
      }
      
      waveform.style.opacity=1; 
      const t0=Date.now();
      
      snippetWatch=setInterval(async()=>{
        const state=await player.getCurrentState().catch(()=>null);
        if(!state || state.paused){
          clearInterval(snippetWatch); 
          waveform.style.opacity=0; 
          return;
        }
        if(Date.now()-t0>=sec*1000){
          clearInterval(snippetWatch); 
          waveform.style.opacity=0; 
          await player.pause();
        }
      },120);
      
      // Successfully started playing
      return;
      
    } catch(e){
      console.error('Snippet playback error:', e);
      attempts++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // If we got here, all attempts failed
  console.error('Failed to play snippet after multiple attempts');
  nextBtn.click();
}
function waitUntilPlaying(timeout=2500){
  return new Promise(res=>{
    const s=Date.now();
    (async function p(){
      const st=await player.getCurrentState().catch(()=>null);
      if(st && !st.paused && st.position > 0) return res(st);
      if(Date.now()-s > timeout) return res(null);
      setTimeout(p,60);
    })();
  });
}
