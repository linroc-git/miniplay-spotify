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
    // Playback (Phase 2)
    activeTrackIndex: null,     // which track-button is currently playing
    autoStopTimeoutId: null,    // setTimeout handle for auto-pause
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

/**
 * Start playback of a single track on the selected device.
 * Uses PUT /me/player/play?device_id=... with uris + position_ms.
 */
async function playTrack(trackUri, positionMs, deviceId) {
    const path = `/me/player/play?device_id=${encodeURIComponent(deviceId)}`;
    const res = await spotifyFetch(path, {
        method: 'PUT',
        body: JSON.stringify({
            uris: [trackUri],
            position_ms: positionMs || 0,
        }),
    });
    // 204 = success (no body). 202 = accepted (device waking up).
    if (res.status === 204 || res.status === 202) return;
    if (res.status === 404) {
        throw new Error('Enhed ikke aktiv. Åbn Spotify-appen på enheden og prøv igen.');
    }
    if (res.status === 403) {
        throw new Error('Playback afvist — kræver Spotify Premium.');
    }
    const text = await res.text().catch(() => '');
    throw new Error(`Play fejlede (${res.status}): ${text}`);
}

/** Pause playback on the selected device. */
async function pausePlayback(deviceId) {
    const path = deviceId
        ? `/me/player/pause?device_id=${encodeURIComponent(deviceId)}`
        : '/me/player/pause';
    const res = await spotifyFetch(path, { method: 'PUT' });
    // 204 success. 403 often means "already paused" — treat as OK.
    if (res.status === 204 || res.status === 202 || res.status === 403) return;
    if (res.status === 404) {
        // Device disappeared — silent OK, nothing to pause.
        return;
    }
    const text = await res.text().catch(() => '');
    throw new Error(`Pause fejlede (${res.status}): ${text}`);
}

/**
 * Fetch the user's currently playing track (any device, any context — not
 * limited to the picked one). Returns null when nothing is playing (Spotify
 * returns 204 No Content in that case).
 *
 * Doc: https://developer.spotify.com/documentation/web-api/reference/get-the-users-currently-playing-track
 */
async function fetchCurrentlyPlaying() {
    const res = await spotifyFetch('/me/player/currently-playing');
    // 204 = nothing playing (or private session). Treat as "unknown".
    if (res.status === 204) return null;
    if (!res.ok) {
        throw new Error(`Kunne ikke hente nuværende spor (${res.status})`);
    }
    const data = await res.json();
    // data.item can be null on ads or podcasts we don't handle.
    if (!data || !data.item) return null;
    return data;
}

// ============================================================================
// Config
// ============================================================================

/**
 * Parse a time string in "m:ss" or "h:mm:ss" form into milliseconds.
 * Also accepts a plain number of seconds as a string ("90") or a bare
 * number (already ms is NOT supported — keep the format explicit).
 * Throws on invalid input.
 */
function parseTimeString(value, fieldName) {
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} skal være en streng i formatet "m:ss" eller "h:mm:ss" (fik ${JSON.stringify(value)})`);
    }
    const parts = value.trim().split(':');
    if (parts.length < 2 || parts.length > 3) {
        throw new Error(`${fieldName} = "${value}" er ikke gyldigt tidsformat (brug "m:ss" eller "h:mm:ss")`);
    }
    const nums = parts.map((p) => {
        const n = Number(p);
        if (!Number.isFinite(n) || n < 0) {
            throw new Error(`${fieldName} = "${value}" indeholder ugyldigt tal (${p})`);
        }
        return n;
    });
    let h = 0, m = 0, s = 0;
    if (nums.length === 2) {
        [m, s] = nums;
    } else {
        [h, m, s] = nums;
    }
    if (s >= 60 || m >= 60) {
        throw new Error(`${fieldName} = "${value}" har sekunder/minutter >= 60`);
    }
    return Math.round((h * 3600 + m * 60 + s) * 1000);
}

async function loadConfig() {
    const res = await fetch('config.json', { cache: 'no-cache' });
    if (!res.ok) {
        throw new Error(`Kunne ikke loade config.json (${res.status})`);
    }
    const raw = await res.json();
    if (!Array.isArray(raw)) {
        throw new Error('config.json skal være et array af tracks.');
    }
    // Parse timestamps up front so playback code can use ms internally.
    //
    // Two entry shapes are supported:
    //   1. Legacy single-clip:  { label, track_uri, start, duration }
    //   2. Multi-clip medley:   { label, clips: [{ track_uri, start, duration }, ...] }
    //
    // Both normalise to the same in-memory shape: `clips` is always an array
    // of one or more clips. Playback code doesn't need to know which format
    // the user wrote.
    return raw.map((entry, i) => {
        if (!entry || typeof entry !== 'object') {
            throw new Error(`Ugyldig config-entry [${i}]: ${JSON.stringify(entry)}`);
        }
        if (!entry.label) {
            throw new Error(`Config-entry [${i}] mangler label`);
        }

        // Reject mixing the two formats — forces the author to be explicit.
        const hasClips = Array.isArray(entry.clips);
        const hasInlineTrack = entry.track_uri !== undefined;
        if (hasClips && hasInlineTrack) {
            throw new Error(`Config-entry [${i}] (${entry.label}) må ikke have både "track_uri" og "clips" — vælg én`);
        }
        if (!hasClips && !hasInlineTrack) {
            throw new Error(`Config-entry [${i}] (${entry.label}) mangler enten "track_uri" eller "clips"`);
        }

        // Normalise the raw clip list — legacy single-clip becomes a one-element list.
        const rawClips = hasClips
            ? entry.clips
            : [{ track_uri: entry.track_uri, start: entry.start, duration: entry.duration }];

        if (rawClips.length === 0) {
            throw new Error(`Config-entry [${i}] (${entry.label}) har tom clips-liste`);
        }

        const clips = rawClips.map((clip, j) => {
            const where = `[${i}] ${entry.label}.clips[${j}]`;
            if (!clip || typeof clip !== 'object') {
                throw new Error(`Ugyldig clip ${where}: ${JSON.stringify(clip)}`);
            }
            if (!clip.track_uri) {
                throw new Error(`Clip ${where} mangler track_uri`);
            }
            if (clip.duration === undefined) {
                throw new Error(`Clip ${where} mangler duration ("m:ss")`);
            }
            const start_ms = clip.start !== undefined
                ? parseTimeString(clip.start, `${where}.start`)
                : 0;
            const duration_ms = parseTimeString(clip.duration, `${where}.duration`);
            if (duration_ms <= 0) {
                throw new Error(`Clip ${where} duration skal være > 0`);
            }
            // Optional clip.label — shown in status line during medley playback
            // so the user can see which song of the medley is currently playing.
            // Missing/empty is fine (falls back to just showing '(N/M)').
            return {
                label: (typeof clip.label === 'string' && clip.label.trim()) || null,
                track_uri: clip.track_uri,
                start_ms,
                duration_ms,
            };
        });

        return { label: entry.label, clips };
    });
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
    els.refreshDevicesBtn = document.getElementById('refresh-devices-btn');
    els.userInfo = document.getElementById('user-info');
    els.userName = document.getElementById('user-name');
    els.playbackArea = document.getElementById('playback-area');
    els.trackButtons = document.getElementById('track-buttons');
    els.stopBtn = document.getElementById('stop-btn');
    els.whatsPlayingBtn = document.getElementById('whats-playing-btn');
    els.nowPlayingInfo = document.getElementById('now-playing-info');
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
        btn.addEventListener('click', () => handleTrackClick(i));
        els.trackButtons.appendChild(btn);
    });
}

/** Update .active class on track buttons based on state.activeTrackIndex. */
function updateActiveButton() {
    const buttons = els.trackButtons.querySelectorAll('.track-btn');
    buttons.forEach((btn, i) => {
        btn.classList.toggle('active', i === state.activeTrackIndex);
    });
}

/** Cancel any pending auto-stop timer. */
function clearAutoStop() {
    if (state.autoStopTimeoutId !== null) {
        clearTimeout(state.autoStopTimeoutId);
        state.autoStopTimeoutId = null;
    }
}

/**
 * User clicked a track button — start playback of the entry's clip sequence.
 *
 * Every entry has a `clips` array (single-clip entries are normalised to a
 * length-1 array during load). We chain clips by scheduling the next `play`
 * call at the end of the current clip's duration — no explicit pause in
 * between so the user hears a seamless-ish transition (Spotify's play call
 * has ~200-400ms buffering latency; can't eliminate that with the Web API).
 *
 * After the LAST clip we pause. Stop button or a new track click cancels the
 * pending chain via clearAutoStop() (the timer holds the whole sequence).
 */
async function handleTrackClick(index) {
    clearError();
    const track = state.config[index];
    if (!track) return;

    if (!state.selectedDeviceId) {
        showError('Vælg en enhed først.');
        return;
    }

    // Cancel any in-flight playback + timer before starting a new one.
    clearAutoStop();

    const deviceId = state.selectedDeviceId;
    state.activeTrackIndex = index;
    updateActiveButton();

    // Helper: schedule advance to next clip, or final pause if this was the last.
    // clipIdx is the clip we JUST STARTED — timer fires when it should end.
    const scheduleAdvance = (clipIdx) => {
        const currentClip = track.clips[clipIdx];
        state.autoStopTimeoutId = setTimeout(async () => {
            state.autoStopTimeoutId = null;
            // Bail out if the user started something else in the meantime.
            if (state.activeTrackIndex !== index) return;

            const nextIdx = clipIdx + 1;
            if (nextIdx < track.clips.length) {
                // Chain to next clip. No pause between — straight new play call.
                try {
                    await playClip(nextIdx);
                } catch (err) {
                    state.activeTrackIndex = null;
                    updateActiveButton();
                    showError(`Medley-clip ${nextIdx + 1} fejlede: ${err.message}`);
                    setStatus('Klar');
                }
            } else {
                // Last clip done — pause + reset UI.
                try {
                    await pausePlayback(deviceId);
                } catch (err) {
                    showError(`Auto-stop fejlede: ${err.message}`);
                }
                if (state.activeTrackIndex === index) {
                    state.activeTrackIndex = null;
                    updateActiveButton();
                    setStatus(`Færdig: ${track.label}`);
                }
            }
        }, currentClip.duration_ms);
    };

    // Helper: start clip N in the sequence + update status + schedule its end.
    // Extracted so scheduleAdvance() can call it recursively without duplicating
    // the play-and-schedule logic.
    const playClip = async (clipIdx) => {
        const clip = track.clips[clipIdx];
        const total = track.clips.length;
        // Compose the status line. For medleys we tack on the per-clip label
        // (when provided) so the user can identify the current song:
        //   'Medley (2/6) — Cliff Move it'
        // Single-clip entries keep the simple 'Afspiller: <label>' form.
        let progressLabel;
        if (total > 1) {
            progressLabel = `${track.label} (${clipIdx + 1}/${total})`;
            if (clip.label) progressLabel += ` — ${clip.label}`;
        } else {
            progressLabel = track.label;
        }
        setStatus(`Afspiller: ${progressLabel}`);
        await playTrack(clip.track_uri, clip.start_ms || 0, deviceId);
        scheduleAdvance(clipIdx);
    };

    try {
        setStatus(`Starter: ${track.label}…`);
        await playClip(0);
    } catch (err) {
        state.activeTrackIndex = null;
        updateActiveButton();
        showError(err.message);
        setStatus('Klar');
    }
}

/** Manual stop button — cancel timer + pause immediately. */
async function handleStopClick() {
    clearError();
    clearAutoStop();
    const deviceId = state.selectedDeviceId;
    const wasActive = state.activeTrackIndex !== null;
    state.activeTrackIndex = null;
    updateActiveButton();

    if (!wasActive) {
        setStatus('Ingenting spiller');
        return;
    }

    try {
        await pausePlayback(deviceId);
        setStatus('Stoppet');
    } catch (err) {
        showError(err.message);
    }
}

/**
 * Query Spotify for the user's currently playing track and render it in the
 * #now-playing-info block. Purpose: quick way to grab a Spotify track URI
 * for use in config.json without leaving the app for the Spotify client.
 *
 * Renders artist, title, album (year), and a copy-to-clipboard button for the
 * full `spotify:track:<id>` URI. Copy uses the async Clipboard API; on
 * insecure contexts (http://) it silently falls back to a manual-select prompt.
 */
async function handleWhatsPlayingClick() {
    clearError();
    // Show "loading" state in the info box immediately so the user knows the
    // click registered even if the API round-trip takes a second.
    els.nowPlayingInfo.innerHTML = '<p><em>Henter…</em></p>';
    show(els.nowPlayingInfo);

    try {
        const data = await fetchCurrentlyPlaying();
        if (!data) {
            els.nowPlayingInfo.innerHTML =
                '<p><em>Ingen sang spiller lige nu. Start en sang i Spotify-appen og prøv igen.</em></p>';
            return;
        }
        const track = data.item;
        const id = track.id;
        const uri = track.uri; // "spotify:track:<id>"
        const artists = track.artists.map(a => a.name).join(', ');
        const albumName = track.album.name;
        const albumYear = (track.album.release_date || '').slice(0, 4);

        // Build the info card. Escape user-facing strings via textContent when
        // assigning below to guard against tracks with markup in their names.
        els.nowPlayingInfo.innerHTML = `
            <div class="now-playing-card">
                <p><strong class="np-title"></strong></p>
                <p class="np-album"></p>
                <p>ID: <code class="np-id"></code></p>
                <p>URI: <code class="np-uri"></code>
                    <button type="button" class="btn btn-small np-copy" title="Kopiér URI">📋 Kopiér</button>
                </p>
            </div>
        `;
        els.nowPlayingInfo.querySelector('.np-title').textContent = `${artists} — ${track.name}`;
        els.nowPlayingInfo.querySelector('.np-album').textContent =
            albumYear ? `${albumName} (${albumYear})` : albumName;
        els.nowPlayingInfo.querySelector('.np-id').textContent = id;
        els.nowPlayingInfo.querySelector('.np-uri').textContent = uri;

        const copyBtn = els.nowPlayingInfo.querySelector('.np-copy');
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(uri);
                copyBtn.textContent = '✅ Kopieret';
                setTimeout(() => { copyBtn.textContent = '📋 Kopiér'; }, 1500);
            } catch (err) {
                // Fallback for insecure contexts (http://) where Clipboard API is blocked.
                // Select the URI text so the user can Ctrl+C manually.
                const range = document.createRange();
                range.selectNode(els.nowPlayingInfo.querySelector('.np-uri'));
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
                copyBtn.textContent = '→ Markeret — tryk Ctrl+C';
                setTimeout(() => { copyBtn.textContent = '📋 Kopiér'; }, 2500);
            }
        });
    } catch (err) {
        els.nowPlayingInfo.innerHTML = `<p class="error-inline">${err.message}</p>`;
    }
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
    els.stopBtn.addEventListener('click', handleStopClick);
    els.whatsPlayingBtn.addEventListener('click', handleWhatsPlayingClick);
    els.refreshDevicesBtn.addEventListener('click', async () => {
        clearError();
        setStatus('Henter enheder...');
        try {
            const devices = await fetchDevices();
            state.devices = devices;
            const stored = sessionStorage.getItem(SS_SELECTED_DEVICE);
            if (stored && devices.some((d) => d.id === stored)) {
                state.selectedDeviceId = stored;
            } else if (devices.length > 0) {
                const active = devices.find((d) => d.is_active);
                state.selectedDeviceId = (active || devices[0]).id;
                sessionStorage.setItem(SS_SELECTED_DEVICE, state.selectedDeviceId);
            } else {
                state.selectedDeviceId = null;
            }
            renderUI();
            setStatus(devices.length
                ? `Fandt ${devices.length} enhed(er)`
                : 'Ingen enheder fundet — åbn Spotify-appen og start en sang kort');
        } catch (err) {
            showError(err.message);
        }
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
    setStatus('Klar');
}

document.addEventListener('DOMContentLoaded', init);
