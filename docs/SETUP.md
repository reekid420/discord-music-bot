# Groove Bot — Setup Guide

## 1. Create a Discord Bot Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **"New Application"** → name it (e.g. "Groove") → **Create**
3. Navigate to the **"Bot"** tab in the sidebar
4. Click **"Reset Token"** → copy the token → **save it securely** (this is your `DISCORD_TOKEN`)
5. Under **"Privileged Gateway Intents"**, enable:
   - ✅ Presence Intent
   - ✅ Server Members Intent
   - ✅ Message Content Intent
6. Click **Save Changes**

## 2. Get Your Client ID

1. Go to the **"General Information"** tab
2. Copy the **Application ID** — this is your `CLIENT_ID`

## 3. Generate an Invite Link

1. Go to **"OAuth2"** → **"URL Generator"**
2. Under **Scopes**, select: `bot`, `applications.commands`
3. Under **Bot Permissions**, select:
   - Connect
   - Speak
   - View Channels
   - Send Messages
   - Embed Links
   - Read Message History
   - Use Slash Commands
4. Copy the generated URL at the bottom
5. Paste it in your browser → select your server → **Authorize**

## 4. Get Your Guild ID (for fast command registration)

1. In Discord, go to **Settings → Advanced → Developer Mode** (enable it)
2. Right-click your server name → **Copy Server ID**
3. This is your `GUILD_ID` (optional but recommended for development)

## 5. Configure the Bot

```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your values:
# DISCORD_TOKEN=<your bot token>
# CLIENT_ID=<your application ID>
# GUILD_ID=<your server ID>  (optional)
# DASHBOARD_PASSWORD=<pick a strong password>
```

## 6. Install Dependencies (Debian 13)

```bash
# Install Node.js 22 LTS
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
fnm install 22
fnm use 22

# Install pnpm
corepack enable
corepack prepare pnpm@latest --activate

# Install ffmpeg (required for audio)
sudo apt update && sudo apt install -y ffmpeg

# Install project dependencies
cd /path/to/discord-bot
pnpm install
```

## 7. Register Slash Commands

```bash
# One-time: registers all /commands with Discord
node src/bot/deploy-commands.js
```

If `GUILD_ID` is set in `.env`, commands register instantly for that server.
If not set, commands register globally (can take up to 1 hour).

## 8. Start the Bot

### Development (with auto-restart on file changes)
```bash
pnpm run dev
```

### Production (with PM2)
```bash
# Install PM2 globally
pnpm add -g pm2

# Start
pm2 start pm2.ecosystem.config.cjs

# Enable auto-start on system boot
pm2 startup systemd
pm2 save

# View logs
pm2 logs groove-bot

# Restart / Stop
pm2 restart groove-bot
pm2 stop groove-bot
```

## 9. Access the Dashboard

Open your browser to `http://<your-server-ip>:3000`

Enter the password you set in `DASHBOARD_PASSWORD`.

## Troubleshooting

| Issue | Solution |
|---|---|
| Bot not responding to commands | Run `node src/bot/deploy-commands.js` again |
| "Missing Access" error | Re-invite bot with correct permissions (Step 3) |
| Audio cutting out | Check ffmpeg is installed: `ffmpeg -version` |
| YouTube 403 errors | Usually temporary; SoundCloud fallback should work |
| Dashboard won't connect | Check firewall allows port 3000 |
| `opusscript` errors | Install native opus: `sudo apt install libopus0` |
