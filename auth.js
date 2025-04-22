function randomString(length = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  while (result.length < length) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startLogin() {
  const verifier = randomString();
  const challenge = await sha256(verifier);

  localStorage.setItem('code_verifier', verifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: '05f8b9b243c94d1aa39bef811f03df42',
    redirect_uri: 'https://yarinar.github.io/snipify/callback.html',
    scope: 'playlist-read-private streaming user-read-playback-state user-modify-playback-state',
    code_challenge_method: 'S256',
    code_challenge: challenge
  });

  window.location = `https://accounts.spotify.com/authorize?${params}`;
}

export async function finishLogin() {
  const code = new URLSearchParams(window.location.search).get('code');
  const verifier = localStorage.getItem('code_verifier');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: '05f8b9b243c94d1aa39bef811f03df42',
    code,
    redirect_uri: 'https://yarinar.github.io/snipify/callback.html',
    code_verifier: verifier
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const data = await response.json();
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);

  window.location.href = 'https://yarinar.github.io/snipify/';
}
