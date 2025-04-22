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
    scope: 'playlist-read-private streaming user-read-playback-state user-modify-playback-state user-read-email user-read-private',
    code_challenge_method: 'S256',
    code_challenge: challenge
  });

  window.location = `https://accounts.spotify.com/authorize?${params}`;
}

export async function finishLogin() {
  try {
    const code = new URLSearchParams(window.location.search).get('code');
    const verifier = localStorage.getItem('code_verifier');

    if (!code || !verifier) {
      throw new Error('Missing code or verifier');
    }

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

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('token_expiry', Date.now() + (data.expires_in * 1000));

    window.location.href = 'https://yarinar.github.io/snipify/';
  } catch (error) {
    console.error('Login error:', error);
    localStorage.clear();
    window.location.href = 'https://yarinar.github.io/snipify/login.html';
  }
}

export async function refreshToken() {
  try {
    const refresh_token = localStorage.getItem('refresh_token');
    if (!refresh_token) {
      throw new Error('No refresh token available');
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: '05f8b9b243c94d1aa39bef811f03df42',
      refresh_token
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('token_expiry', Date.now() + (data.expires_in * 1000));
    
    if (data.refresh_token) {
      localStorage.setItem('refresh_token', data.refresh_token);
    }

    return data.access_token;
  } catch (error) {
    console.error('Token refresh error:', error);
    localStorage.clear();
    window.location.href = 'https://yarinar.github.io/snipify/login.html';
    return null;
  }
}

export function isTokenExpired() {
  const expiry = localStorage.getItem('token_expiry');
  if (!expiry) return true;
  return Date.now() > parseInt(expiry);
}

export async function getValidToken() {
  if (isTokenExpired()) {
    return await refreshToken();
  }
  return localStorage.getItem('access_token');
}
