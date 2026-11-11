import 'dotenv/config';
import { REST, Routes, Client, GatewayIntentBits } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID; // Optional: single-guild dev mode

if (!token || !clientId) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

// Collect all command data
const commands = [];
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = await import(`file://${filePath}`);
  if (command.data) {
    commands.push(command.data.toJSON());
    console.log(`[Deploy] Loaded: /${command.data.name}`);
  }
}

const rest = new REST({ version: '10' }).setToken(token);

try {
  if (guildId) {
    // Single guild: instant, good for dev
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`[Deploy] Registered ${commands.length} commands to guild ${guildId} (instant)`);
  } else {
    // All servers: log in via gateway to get the guild list,
    // then register per-guild so updates are instant everywhere
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(token);

    // Give the gateway a moment to populate the guild cache
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const guilds = client.guilds.cache;
    console.log(`[Deploy] Registering ${commands.length} commands to ${guilds.size} servers...`);

    for (const [, guild] of guilds) {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body: commands });
        console.log(`[Deploy] ✔ ${guild.name} (${guild.id})`);
      } catch (err) {
        console.error(`[Deploy] ✖ ${guild.name} (${guild.id}):`, err.message);
      }
    }

    client.destroy();
    console.log('[Deploy] Done — commands live on all servers (instant)');
  }
} catch (error) {
  console.error('[Deploy] Error:', error);
}

