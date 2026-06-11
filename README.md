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
- **Sources:** YouTube links & search, **YouTube playlists**, and **Spotify track
  links** (title/artist are extracted and searched on YouTube).
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
   ```

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
