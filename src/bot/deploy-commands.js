import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // Optional: for fast guild-scoped dev registration

if (!token || !clientId) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

// Collect all command data
const commands = [];
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = await import(`file://${filePath}`);
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`[Deploy] Loaded: /${command.data.name}`);
  }
}

// Deploy
const rest = new REST({ version: '10' }).setToken(token);

try {
  console.log(`[Deploy] Registering ${commands.length} slash commands...`);

  if (guildId) {
    // Guild-scoped: instant, good for dev
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`[Deploy] Registered to guild ${guildId} (instant)`);
  } else {
    // Global: takes ~1 hour to propagate
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('[Deploy] Registered globally (may take up to 1 hour to propagate)');
  }
} catch (error) {
  console.error('[Deploy] Error:', error);
}
