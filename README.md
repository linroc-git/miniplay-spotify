# miniplay-Spotify

En simpel web-controller til at afspille musikudsnit fra Spotify mellem talepunkter.

**Stack:** Statisk HTML/CSS/JS, hostet på GitHub Pages
**Live URL:** <https://linroc-git.github.io/miniplay-spotify/>

---

## Quick Start (til slutbrugere)

### Krav

- **Spotify Premium**-konto (API-playback virker ikke på Free)
- Spotify-app kørende på en enhed (PC, mobil, Sonos, Chromecast, ...)
- Browser: Chrome / Edge / Safari

### Første gang

1. Åbn <https://linroc-git.github.io/miniplay-spotify/>
2. Klik **"Login med Spotify"** → godkend adgang
3. Du bliver sendt tilbage til siden, nu logget ind

### Sådan afspiller du

1. **Start Spotify-appen** på den enhed du vil bruge (PC-app, mobil, Sonos-højttaler, ...)
2. **Spil kort en tilfældig sang** i Spotify-appen → enheden bliver "aktiv" og synlig for miniplay
3. Tilbage i miniplay: **vælg enhed** i dropdown (fx `MAX (Computer)` eller din mobil)
4. Klik en af **track-knapperne** — det afspiller uddraget defineret i `config.json`
5. **Stop musikk** stopper afspilningen

**Hvis enheden ikke er i dropdown:** Klik **🔄 Genindlæs enheder**. Enheder forsvinder efter få minutters idle — start en sang kort i Spotify-app igen for at "vække" den.

### Sådan finder du track-URI'er til config.json

1. Start en sang i Spotify (hvilken som helst enhed)
2. I miniplay: klik **🔍 Vis nuværende spor**
3. Info-boks viser:
   ```
   Artist — Title
   Album (år)
   ID:   4uLU6hMCjMI75M1A2tKUQC
   URI:  spotify:track:4uLU6hMCjMI75M1A2tKUQC  [📋 Kopiér]
   ```
4. Klik **📋 Kopiér** → URI'en er i clipboard
5. Paste ind i `config.json` under `track_uri`

Alternativt: højreklik en sang direkte i Spotify-appen → Share → Copy Spotify URI.

### Fejlfinding

| Problem | Løsning |
|---|---|
| "Ingen enheder" | Start en sang i Spotify-app, klik 🔄 Genindlæs |
| "Playback afvist — kræver Spotify Premium" | Free-konto, virker ikke |
| "Enhed ikke aktiv" | Genstart en sang kort i Spotify-app for at vække enheden |
| Ingenting sker når du klikker en knap | Åbn Console (F12), tjek fejl. Ofte cached JS — Ctrl+Shift+R for hard-reload |
| Login fejler / loop | Log ud, ryd cookies, prøv igen |

---

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

- `label` — vises på knappen
- `track_uri` — Spotify track URI (format `spotify:track:XXXXX`)
- `start` — hvor i sangen den starter. Streng i `m:ss` (eller `h:mm:ss`). Kan udelades → starter fra 0
- `duration` — hvor længe den spiller

---

## Setup (til udvikler / første deploy)

### 1. Spotify Developer Registration

1. Gå til <https://developer.spotify.com/dashboard>
2. Login (eller opret konto)
3. Opret ny "Application"
4. Accepter vilkårene
5. Kopiér **Client ID**

### 2. Redirect URI i Spotify Dashboard

1. I Application-indstillinger, gå til "Edit Settings"
2. Sæt **Redirect URIs** til: `https://linroc-git.github.io/miniplay-spotify/`
3. Gem

### 3. Client ID i koden

1. I `script.js`, erstat `YOUR_CLIENT_ID` med din Client ID fra step 1

### 4. Deploy til GitHub Pages

1. Aktiver GitHub Pages i repo-settings:
   - Settings → Pages
   - Source: `main` branch, root folder
   - Save
2. Første deploy tager 1-2 min. Efterfølgende push til `main` deployes automatisk

---

## Udvikling

Se `ARCHITECTURE.md` for design-decisioner og implementation-faser.

---

**Made with ♡ on Rocinante**
