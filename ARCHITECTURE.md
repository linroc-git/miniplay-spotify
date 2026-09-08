# miniplay-Spotify — Architecture Plan

## Overview
Statisk GitHub Pages web-app (HTML/CSS/JS) der styrer Spotify-afspilning via OAuth + Web API.

## Critical Decisions

### 1. Spotify Integration Approach
**Decision: Spotify Web Playback SDK + Web API**
- ✅ Web Playback SDK handles OAuth + playback control reliably
- ✅ Built-in error handling for CORS, device selection
- ✅ No backend needed
- Rationale: Raw API fetch has CORS issues; SDK is battle-tested for browser-based apps

### 2. Token Management
**Decision: OAuth PKCE flow with refresh**
- ✅ Get access_token + refresh_token on login
- ✅ Store in sessionStorage (security: not visible after browser close)
- ✅ Auto-refresh when token expires (before making API calls)
- Rationale: Avoids re-login mid-presentation

### 3. Device Selection
**Decision: Explicit device_id parameter**
- ✅ Fetch available devices via `GET /me/player/devices` on login
- ✅ Let user pick one (or auto-select if only one active)
- ✅ Pass device_id to all `PUT /me/player/play` calls
- Rationale: Prevents unexpected playback on wrong device

### 4. Config Format
**Decision: JSON array in `config.json` (checked into repo)**
- ✅ Static file, no server needed
- ✅ Easy to edit for new presentations
- ✅ Structure: label, track_uri, start ("m:ss"), duration ("m:ss")
- Rationale: Simple, version-controlled, no build step needed

## File Structure
```
miniplay-spotify/
├── index.html          # Main app (includes all JS)
├── config.json         # Presentation config (user-editable)
├── style.css           # Mobile-friendly UI
├── script.js           # Auth + playback logic
├── SPEC.md            # Requirements (from Miller)
├── ARCHITECTURE.md    # This file
└── .github/
    └── workflows/
        └── build.yml  # (optional) validate config on push
```

## Implementation Phases

### Phase 1: Core Auth + UI (Amos)
**Deliverable:** Login button works, device picker shows
- [ ] Spotify OAuth PKCE flow
- [ ] Load Web Playback SDK
- [ ] Fetch user devices on login
- [ ] Store tokens in sessionStorage
- [ ] Basic HTML layout (login button, device selector)
- [ ] Load config.json

**Tests:**
- Manual: Login from Android Chrome, see device list
- Config loads without errors

### Phase 2: Playback Control (Amos)
**Deliverable:** Play/stop buttons work
- [ ] Implement track button (calls PUT /me/player/play with position_ms)
- [ ] Auto-stop timer (setTimeout + PUT /me/player/pause)
- [ ] Stop button (manual pause)
- [ ] Highlight active button during playback
- [ ] Handle API errors gracefully

**Tests:**
- Manual: Press button → song starts at correct position
- Auto-stop triggers after duration (parsed from "m:ss" to ms internally)
- Stop button works
- No errors on network hiccups

### Phase 3: Polish + Deploy (TBD)
**Deliverable:** Ready for production
- [ ] Token refresh implementation
- [ ] Error messages for failed playback
- [ ] Mobile UI refinements (touch targets, responsiveness)
- [ ] README with setup instructions
- [ ] Enable GitHub Pages
- [ ] Register Spotify app + set redirect URI

## Key APIs
- **Spotify Web Playback SDK:** `window.Spotify.Player` — handles auth + playback
- **Spotify Web API (`PUT /me/player/play`):** Start playback with position
- **Spotify Web API (`PUT /me/player/pause`):** Stop playback
- **Spotify Web API (`GET /me/player/devices`):** List available devices

## Known Constraints
- Spotify Premium required (API playback won't work for free accounts)
- Spotify-app must be running on phone (can be minimized)
- HTTPS only (required by Spotify OAuth)
- No playlist management in scope

## Next Steps
1. Amos starts Phase 1 (auth + device picker)
2. Manual test on Android
3. Checkpoint before Phase 2
