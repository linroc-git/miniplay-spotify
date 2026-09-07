/**
 * miniplay-Spotify — script.js
 *
 * Phase 1: OAuth PKCE flow, device picker, config loading, UI state.
 * Phase 2 (TODO): Playback control (play/pause/auto-stop).
 *
 * See ARCHITECTURE.md for design decisions.
 */

// ============================================================================
// Config
// ============================================================================

// Spotify Client ID (public — safe to commit; PKCE flow, no client secret used).
// Registered at https://developer.spotify.com/dashboard
const SPOTIFY_CLIENT_ID = '80be63b6ca1f4d38a7b1a3cc33b10c3e';

// Redirect URI must match exactly what's registered in the Spotify dashboard.
// Uses current origin + path so it works both locally and on GitHub Pages.
const REDIRECT_URI = window.location.origin + window.location.pathname;

// Scopes required for reading devices and controlling playback (Phase 2).
const SCOPES = [
    'user-read-private',
    'user-read-email',
    'user-read-playback-state',
    'user-modify-playback-state',
    'streaming',
].join(' ');

const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

// sessionStorage keys
const SS_ACCESS_TOKEN = 'sp_access_token';
const SS_REFRESH_TOKEN = 'sp_refresh_token';
const SS_TOKEN_EXPIRES_AT = 'sp_token_expires_at';
const SS_CODE_VERIFIER = 'sp_code_verifier';
const SS_SELECTED_DEVICE = 'sp_selected_device_id';

// ============================================================================
// App state
// ============================================================================

const state = {
    accessToken: null,
    refreshToken: null,
    tokenExpiresAt: 0, // epoch ms
    user: null,
    devices: [],
    selectedDeviceId: null,
    config: null, // parsed config.json
};

// ============================================================================
// PKCE helpers
// ============================================================================

/** Generate a cryptographically random string, URL-safe. */
function generateRandomString(length = 64) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    let out = '';
    for (let i = 0; i < length; i++) {
        out += chars[values[i] % chars.length];
    }
    return out;
}

/** SHA256 → base64url. Used to derive code_challenge from code_verifier. */
async function sha256Base64Url(input) {
    const data = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest('SHA-256', data);
    // Convert ArrayBuffer → base64url
    const bytes = new Uint8Array(hash);
    let bin = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// ============================================================================
// Auth flow
// ============================================================================

/**
 * Start the PKCE login flow. Redirects the browser to Spotify's auth page.
 */
async function startLogin() {
    const codeVerifier = generateRandomString(64);
    const codeChallenge = await sha256Base64Url(codeVerifier);

    // Persist verifier so the callback handler can exchange the auth code.
    sessionStorage.setItem(SS_CODE_VERIFIER, codeVerifier);

    const params = new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge,
        scope: SCOPES,
    });

    window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * After Spotify redirects back with ?code=..., exchange it for tokens.
 * Returns true if a callback was handled (successful or not).
 */
async function handleAuthCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
        showError(`Login fejlede: ${error}`);
        cleanUrl();
        return true;
    }

    if (!code) {
        return false;
    }

    const codeVerifier = sessionStorage.getItem(SS_CODE_VERIFIER);
    if (!codeVerifier) {
        showError('Manglende code_verifier. Prøv login igen.');
        cleanUrl();
        return true;
    }

    try {
        const body = new URLSearchParams({
            client_id: SPOTIFY_CLIENT_ID,
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
            code_verifier: codeVerifier,
        });

        const res = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Token exchange fejlede (${res.status}): ${text}`);
        }

        const data = await res.json();
        saveTokens(data);
        sessionStorage.removeItem(SS_CODE_VERIFIER);
    } catch (err) {
        showError(err.message || String(err));
    } finally {
        cleanUrl();
    }

    return true;
}

/** Strip ?code=... and ?error=... from the URL without reloading. */
function cleanUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.searchParams.delete('error');
    url.searchParams.delete('state');
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
}

/** Store token payload from /api/token in state + sessionStorage. */
function saveTokens(tokenPayload) {
    const now = Date.now();
    const expiresIn = (tokenPayload.expires_in || 3600) * 1000;
    state.accessToken = tokenPayload.access_token;
    state.tokenExpiresAt = now + expiresIn;

    sessionStorage.setItem(SS_ACCESS_TOKEN, state.accessToken);
    sessionStorage.setItem(SS_TOKEN_EXPIRES_AT, String(state.tokenExpiresAt));

    if (tokenPayload.refresh_token) {
        state.refreshToken = tokenPayload.refresh_token;
        sessionStorage.setItem(SS_REFRESH_TOKEN, state.refreshToken);
    }
}

/** Load persisted tokens into state. Returns true if a valid token is present. */
function loadTokensFromStorage() {
    const accessToken = sessionStorage.getItem(SS_ACCESS_TOKEN);
    const refreshToken = sessionStorage.getItem(SS_REFRESH_TOKEN);
    const expiresAt = Number(sessionStorage.getItem(SS_TOKEN_EXPIRES_AT) || 0);

    if (!accessToken) return false;

    state.accessToken = accessToken;
    state.refreshToken = refreshToken || null;
    state.tokenExpiresAt = expiresAt;

    return Date.now() < expiresAt;
}

/** Clear tokens (used by logout). */
function clearTokens() {
    state.accessToken = null;
    state.refreshToken = null;
    state.tokenExpiresAt = 0;
    sessionStorage.removeItem(SS_ACCESS_TOKEN);
    sessionStorage.removeItem(SS_REFRESH_TOKEN);
    sessionStorage.removeItem(SS_TOKEN_EXPIRES_AT);
    sessionStorage.removeItem(SS_SELECTED_DEVICE);
}

/**
 * Phase 2 helper: refresh access_token when close to expiry.
 * Not called automatically in Phase 1, but wired up for reuse.
 */
async function refreshAccessToken() {
    if (!state.refreshToken) {
        throw new Error('Ingen refresh_token — login igen.');
    }

    const body = new URLSearchParams({
        client_id: SPOTIFY_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: state.refreshToken,
    });

    const res = await fetch(TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Refresh fejlede (${res.status}): ${text}`);
    }

    const data = await res.json();
    saveTokens(data);
}

// ============================================================================
// Spotify Web API
// ============================================================================

/** Authenticated fetch against Spotify Web API. Auto-refreshes on 401 if possible. */
async function spotifyFetch(path, options = {}) {
    if (!state.accessToken) {
        throw new Error('Ikke logget ind.');
    }

    const doFetch = () =>
        fetch(`${API_BASE}${path}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${state.accessToken}`,
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
        });

    let res = await doFetch();

    if (res.status === 401 && state.refreshToken) {
        try {
            await refreshAccessToken();
            res = await doFetch();
        } catch (err) {
            clearTokens();
            renderUI();
            throw err;
        }
    }

    return res;
}

async function fetchUserProfile() {
    const res = await spotifyFetch('/me');
    if (!res.ok) {
        throw new Error(`Kunne ikke hente bruger (${res.status})`);
    }
    return res.json();
}

async function fetchDevices() {
    const res = await spotifyFetch('/me/player/devices');
    if (!res.ok) {
        throw new Error(`Kunne ikke hente enheder (${res.status})`);
    }
    const data = await res.json();
    return data.devices || [];
}

// ============================================================================
// Config
// ============================================================================

async function loadConfig() {
    const res = await fetch('config.json', { cache: 'no-cache' });
    if (!res.ok) {
        throw new Error(`Kunne ikke loade config.json (${res.status})`);
    }
    const raw = await res.json();
    if (!Array.isArray(raw)) {
        throw new Error('config.json skal være et array af tracks.');
    }
    // Minimal validation — Phase 2 will consume these fields.
    for (const entry of raw) {
        if (!entry.label || !entry.track_uri || typeof entry.duration_ms !== 'number') {
            throw new Error(`Ugyldig config-entry: ${JSON.stringify(entry)}`);
        }
    }
    return raw;
}

// ============================================================================
// UI
// ============================================================================

const els = {};

function cacheEls() {
    els.loginBtn = document.getElementById('login-btn');
    els.logoutBtn = document.getElementById('logout-btn');
    els.devicePicker = document.getElementById('device-picker');
    els.deviceSelect = document.getElementById('device-select');
    els.userInfo = document.getElementById('user-info');
    els.userName = document.getElementById('user-name');
    els.playbackArea = document.getElementById('playback-area');
    els.trackButtons = document.getElementById('track-buttons');
    els.stopBtn = document.getElementById('stop-btn');
    els.statusText = document.getElementById('status-text');
    els.loading = document.getElementById('loading');
    els.error = document.getElementById('error');
    els.errorText = document.getElementById('error-text');
}

function show(el, display = 'block') {
    if (el) el.style.display = display;
}

function hide(el) {
    if (el) el.style.display = 'none';
}

function showError(msg) {
    console.error(msg);
    if (els.errorText) els.errorText.textContent = msg;
    show(els.error);
}

function clearError() {
    hide(els.error);
    if (els.errorText) els.errorText.textContent = '';
}

function setStatus(msg) {
    if (els.statusText) els.statusText.textContent = msg;
}

/** Re-render UI based on current state (auth + data). */
function renderUI() {
    const loggedIn = !!state.accessToken && Date.now() < state.tokenExpiresAt;

    if (!loggedIn) {
        show(els.loginBtn);
        hide(els.devicePicker);
        hide(els.userInfo);
        hide(els.playbackArea);
        return;
    }

    hide(els.loginBtn);
    show(els.userInfo);
    if (state.user && els.userName) {
        els.userName.textContent = state.user.display_name || state.user.id || '(ukendt)';
    }

    // Device picker
    if (state.devices.length > 0) {
        els.deviceSelect.innerHTML = '';
        for (const d of state.devices) {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = `${d.name} (${d.type})${d.is_active ? ' — aktiv' : ''}`;
            els.deviceSelect.appendChild(opt);
        }
        if (state.selectedDeviceId) {
            els.deviceSelect.value = state.selectedDeviceId;
        }
        show(els.devicePicker, 'flex');
    } else {
        els.deviceSelect.innerHTML = '';
        const opt = document.createElement('option');
        opt.textContent = 'Ingen enheder — åbn Spotify-appen først';
        opt.disabled = true;
        els.deviceSelect.appendChild(opt);
        show(els.devicePicker, 'flex');
    }

    // Track buttons (rendered as placeholders — Phase 2 wires them to playback)
    if (state.config && state.config.length > 0) {
        renderTrackButtons(state.config);
        show(els.playbackArea, 'flex');
    }
}

function renderTrackButtons(tracks) {
    els.trackButtons.innerHTML = '';
    tracks.forEach((track, i) => {
        const btn = document.createElement('button');
        btn.className = 'track-btn';
        btn.textContent = track.label;
        btn.dataset.index = String(i);
        btn.addEventListener('click', () => {
            // TODO Phase 2: start playback with track.track_uri at start_ms,
            // auto-stop after duration_ms, highlight this button.
            setStatus(`(Phase 2) Ville afspille: ${track.label}`);
        });
        els.trackButtons.appendChild(btn);
    });
}

// ============================================================================
// Boot
// ============================================================================

async function init() {
    cacheEls();

    // Wire up static handlers
    els.loginBtn.addEventListener('click', () => {
        clearError();
        startLogin();
    });
    els.logoutBtn.addEventListener('click', () => {
        clearTokens();
        state.user = null;
        state.devices = [];
        state.selectedDeviceId = null;
        renderUI();
    });
    els.deviceSelect.addEventListener('change', (e) => {
        state.selectedDeviceId = e.target.value;
        sessionStorage.setItem(SS_SELECTED_DEVICE, state.selectedDeviceId);
    });
    els.stopBtn.addEventListener('click', () => {
        // TODO Phase 2: PUT /me/player/pause
        setStatus('(Phase 2) Ville stoppe afspilning');
    });

    // Load config.json in parallel with auth resolution
    const configPromise = loadConfig().catch((err) => {
        showError(err.message);
        return null;
    });

    // If we came back from Spotify with ?code=..., handle it first.
    const handled = await handleAuthCallback();

    // Otherwise try to hydrate from sessionStorage.
    if (!handled) {
        loadTokensFromStorage();
    } else {
        loadTokensFromStorage();
    }

    // If we have a token, fetch user + devices.
    if (state.accessToken && Date.now() < state.tokenExpiresAt) {
        try {
            const [user, devices] = await Promise.all([
                fetchUserProfile(),
                fetchDevices(),
            ]);
            state.user = user;
            state.devices = devices;

            // Restore previously selected device if it still exists.
            const stored = sessionStorage.getItem(SS_SELECTED_DEVICE);
            if (stored && devices.some((d) => d.id === stored)) {
                state.selectedDeviceId = stored;
            } else if (devices.length > 0) {
                // Default to active device, or first in list.
                const active = devices.find((d) => d.is_active);
                state.selectedDeviceId = (active || devices[0]).id;
                sessionStorage.setItem(SS_SELECTED_DEVICE, state.selectedDeviceId);
            }
        } catch (err) {
            showError(err.message);
        }
    }

    state.config = await configPromise;
    renderUI();
    setStatus('Klar (Phase 1) — playback kommer i Phase 2');
}

document.addEventListener('DOMContentLoaded', init);
