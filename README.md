# miniplay-Spotify

En simpel web-controller til at afspille musikudsnit fra Spotify mellem talepunkter.

**Stack:** Statisk HTML/CSS/JS, hostet på GitHub Pages

## Setup

### 1. Spotify Developer Registration
1. Gå til https://developer.spotify.com/dashboard
2. Login (eller opret konto)
3. Opret ny "Application"
4. Accepter vilkårene
5. Nå får du **Client ID**

### 2. Redirect URI i Spotify Dashboard
1. I Application-indstillinger, gå til "Edit Settings"
2. Sæt **Redirect URIs** til: `https://linroc-git.github.io/miniplay-spotify/`
3. Gem

### 3. Client ID i koden
1. I `script.js`, erstat `YOUR_CLIENT_ID` med din Client ID fra step 1

### 4. Spotify Premium krav
- Spotify Premium-konto kræves (API playback virker ikke på gratis-konti)
- Spotify-appen skal køre på telefonen (kan være minimeret)

## Config

Rediger `config.json` for at tilpasse talepunkterne.

**Format:**
```json
[
  {
    "label": "Navn på punkt",
    "track_uri": "spotify:track:TRACK_ID",
    "start": "0:30",
    "duration": "0:20"
  }
]
```

- `start` og `duration` er strenge i `m:ss` (eller `h:mm:ss`). `start` kan udelades — så startes fra 0.

**Få Track URI:**
1. Åben Spotify-app eller web
2. Ret-klik på sang → "Share" → "Spotify URI" (kopiér)
3. Brug hele streng: `spotify:track:XXXXX`

## Deploy

1. Aktiver GitHub Pages i repo-settings:
   - Settings → Pages
   - Source: `main` branch, root folder
   - Save

2. Gå til `https://linroc-git.github.io/miniplay-spotify/` og test

## Udvikling

Se `ARCHITECTURE.md` for design-decisioner og implementation-faser.

Starter med:
- [ ] Auth (PKCE-flow)
- [ ] Device picker
- [ ] Playback control (play/stop buttons)
- [ ] Token refresh
- [ ] UI polish

## Testing

**Manual test på Android:**
1. Åben Chrome
2. Gå til GitHub Pages URL
3. Login med Spotify
4. Vælg device
5. Tryk knap → musik skal starte

## Troubleshooting

**"Playback kontrollen virker ikke"**
- Spotify-app skal køre på enhed
- Kræver Spotify Premium

**"Token udløbet"**
- Implementation af token refresh i phase 2

**"Device ikke fundet"**
- Åben Spotify-app og spil en sang først
- Da vil enheden blive synlig i device-listen

---

**Made with ♡ on Rocinante**
