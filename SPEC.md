# miniplay-Spotify — GitHub Pages web app

## Baggrund
Vi skal bruge en simpel web-controller til en tale, hvor der mellem hvert talepunkt afspilles et kort musikudsnit fra Spotify. Controlleren skal køre som en statisk GitHub Pages-side og styres fra en Android-telefon.

## Krav

### Platform
- Statisk HTML/CSS/JS — ingen backend, ingen server
- Hostes på GitHub Pages
- Fungerer i Chrome på Android (mobildata og wifi)

### Auth
- Spotify OAuth via PKCE-flow (Implicit Grant er deprecated)
- Kun Client ID bruges — ingen Client Secret
- Token gemmes i sessionStorage eller localStorage så brugeren ikke logger ind igen ved næste besøg

### Kernefunktion
Konfig-fil (config.json eller inline i HTML) der definerer hvert talepunkt:
```json
[
  {
    "label": "Punkt 1 — Velkomst",
    "track_uri": "spotify:track:TRACK_ID_HER",
    "start_ms": 30000,
    "duration_ms": 20000
  },
  {
    "label": "Punkt 2 — Barndom",
    "track_uri": "spotify:track:TRACK_ID_HER",
    "start_ms": 62000,
    "duration_ms": 25000
  }
]
```

- Spotify Web API bruges til at styre afspilning: `PUT /me/player/play` med `position_ms`
- Automatisk stop efter `duration_ms` via `setTimeout` + `PUT /me/player/pause`

### UI
- Stort, mobil-venligt layout (ingen mouse-only elementer)
- Én stor knap per talepunkt — viser label
- Aktiv knap highlightes visuelt under afspilning
- "Stop"-knap der stopper musikken øjeblikkeligt
- Login-knap øverst hvis ikke autentificeret

## Forudsætninger / Setup
- Spotify Premium kræves (API playback-kontrol virker ikke med gratis)
- Spotify-appen skal køre på telefonen (kan være minimeret)
- Redirect URI i Spotify Developer Dashboard skal matche GitHub Pages URL'en
- Client ID hardcodes i config.json eller som konstant i JS

## Out of scope
- Ingen playlist-management
- Ingen valg af enhed (bruger aktiv enhed automatisk)
- Ingen backend/server

## Acceptkriterier
- [ ] Login med Spotify virker i Chrome på Android
- [ ] Knap starter korrekt sang fra korrekt tidspunkt
- [ ] Sangen stopper automatisk efter angivet varighed
- [ ] Stop-knap virker manuelt
- [ ] Konfig er let at redigere (ny sang = nyt entry i JSON/array)
- [ ] Siden virker udenfor hjemmenetværk (ren HTTPS → Spotify API)
