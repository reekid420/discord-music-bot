import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from '../db/database.js';
import { setupPlayer } from './player/setup.js';
import { startWebServer } from '../web/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Validate environment ───
const requiredEnv = ['DISCORD_TOKEN', 'CLIENT_ID'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`[Boot] Missing required env var: ${key}. See .env.example`);
    process.exit(1);
  }
}

// ─── Initialize database ───
const dbPath = process.env.DB_PATH || './data/groove.db';
initDatabase(dbPath);

// ─── Create Discord client ───
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    // Note: MessageContent and Presence intents are NOT needed for slash commands
    // Only add them back if you add prefix commands later (and enable them in the Dev Portal)
  ],
});

// ─── Slash commands collection ───
client.commands = new Collection();

async function loadCommands() {
  const commandsPath = join(__dirname, 'commands');
  const commandFiles = readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const command = await import(`file://${filePath}`);
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
      console.log(`[Commands] Loaded: /${command.data.name}`);
    } else {
      console.warn(`[Commands] Skipping ${file}: missing data or execute export`);
    }
  }
}

// ─── Load events ───
async function loadEvents() {
  const eventsPath = join(__dirname, 'events');
  const eventFiles = readdirSync(eventsPath).filter(f => f.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = join(eventsPath, file);
    const event = await import(`file://${filePath}`);
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args));
    } else {
      client.on(event.name, (...args) => event.execute(...args));
    }
    console.log(`[Events] Loaded: ${event.name}`);
  }
}

// ─── Boot sequence ───
async function main() {
  console.log('[Boot] Starting Groove bot...');

  // Set up discord-player
  const player = await setupPlayer(client);
  client.player = player;

  // Load commands and events
  await loadCommands();
  await loadEvents();

  // Start web dashboard (runs in same process)
  startWebServer(client);

  // Login to Discord
  try {
    await client.login(process.env.DISCORD_TOKEN);
    console.log('[Boot] Discord client logged in');
  } catch (err) {
    console.error('[Boot] Discord login failed:', err.message);
    console.error('[Boot] Dashboard is still running — fix your DISCORD_TOKEN in .env');
  }
}

main().catch(err => {
  console.error('[Boot] Fatal error:', err);
  process.exit(1);
});
