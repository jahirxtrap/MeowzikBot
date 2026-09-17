# Meowzik — Discord music bot

A Discord music bot that streams audio from YouTube. Request songs with slash
commands or by typing in a dedicated music channel that has a full control panel
(built with Discord **Components V2**).

## Features

- **Slash commands:** `/play`, `/skip`, `/pause`, `/join`, `/leave`, `/setup`, `/autoplay`
- **Music channel** (`/setup`): type a song name or link there and it plays; your
  message is deleted and the panel updates, keeping the channel clean.
- **Control panel** (Components V2): Back · Pause/Resume · Skip · Stop · Loop ·
  Shuffle · Autoplay · Add song · Favorite, plus scrollable dropdowns for the
  **Queue**, **History** (replay previous songs) and **Favorites**.
- **Autoplay** (♾️): when the queue runs out it keeps playing songs similar to
  what was queued (YouTube radio mixes). Remembered per server.
- **Favorites** ⭐ saved per server.
- **Sources:** YouTube links & search, **YouTube playlists**, **SoundCloud tracks
  & sets**, **Spotify track links** (title/artist are extracted and searched on
  the selected source), and **Suno song links**.
- **Search source** (`SEARCH_SOURCE`): `youtube` (default) or `soundcloud` decides
  where a typed song name is looked up, autoplay included. Links always go to the
  site they point at.
- Commands **auto-register** in every server the bot is in (and any new one it
  joins) — no manual deploy step.

## Requirements

- Node.js 18+
- `ffmpeg` and `yt-dlp` available on the system PATH

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill it in:

   ```
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_application_id
   ```

3. In the Discord Developer Portal → your app → **Bot** → enable
   **Message Content Intent** (required for the music-channel feature).

4. Start the bot (commands register automatically):

   ```bash
   npm start          # production
   npm run dev        # development (auto-reload on file changes)
   npm run detach     # background; keeps running after the terminal closes
   npm run stop       # stop a bot started with detach
   ```

   `detach` writes its pid to `.detached.pid` and its output to `meowzik.log`;
   starting a second one while the first is alive is refused.

## Invite link

Replace `CLIENT_ID` with your application id:

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=2150722576&scope=bot%20applications.commands
```

## Notes

- Queue/playback state lives in memory and resets on restart. The music channel,
  panel id, autoplay setting and favorites are saved in `data/config.json`.
- **Voice / DAVE:** since Discord enforced the DAVE (E2EE) protocol for voice
  (March 2026), the bot needs `@discordjs/voice` **>= 0.19** plus the native
  **`@snazzah/davey`** dependency (both in `package.json`). Without them the voice
  gateway rejects the connection with close code **4017** and no audio plays — do
  not remove `@snazzah/davey`.
- **YouTube bot checks:** datacenter IPs (any VPS) are answered with *"Sign in to
  confirm you're not a bot"*. Point `YTDLP_COOKIES` at a Netscape-format
  `cookies.txt` exported from a **throwaway** YouTube account and the bot retries
  with it the moment YouTube asks — a desktop run on a residential IP never
  reaches that path, so cookies stay unused. `YTDLP_ARGS` appends extra flags to
  every yt-dlp call (proxies, extractor args), and `YTDLP_PATH` points at the
  binary when it isn't on PATH.
- **Never point yt-dlp at `YTDLP_COOKIES` by hand.** yt-dlp rewrites the cookie file
  it is given with whatever the server answered. Two things travel in that answer and
  they pull in opposite directions: Google rotates `__Secure-1PSIDTS` on nearly every
  request and rejects the previous value soon after, so **dropping the rotation kills
  the session within days**; but a run that hits the bot check answers without the
  login cookies at all, so **taking the file as-is wipes the session immediately**.
  Neither replacing nor discarding the file is right. The bot hands yt-dlp a throwaway
  copy and merges what comes back into the real jar by `(domain, path, name)`: rotated
  values win, and nothing is ever deleted. From a shell, copy the file first or go
  through `npm run cookies`.
- **Installing cookies:** `npm run cookies <exported-file>` takes either a Netscape
  `cookies.txt` or the JSON a browser extension exports. It refuses an export made
  without a session, refuses expired ones, resolves a login-only video to prove the
  account still works, and only then writes `YTDLP_COOKIES` with mode 600. Run with
  no argument it audits the cookies already in place.
- **SoundCloud as the search source:** set `SEARCH_SOURCE=soundcloud` and no login is
  needed at all, which is the way out when YouTube keeps revoking the account. It asks
  for five results instead of one and skips the DRM-protected ones (Go+ tracks are
  common on official uploads), so what plays is often a re-upload or a remix rather
  than the official master. Autoplay follows the track's SoundCloud recommendations.
- **PO tokens:** on this VPS a [bgutil provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider)
  runs as `bgutil-pot.service` on `127.0.0.1:4416`, with its yt-dlp plugin in
  `~/.config/yt-dlp/plugins/`. It makes ordinary videos work from a flagged IP
  without any cookies; videos YouTube gates behind a login still need them.
