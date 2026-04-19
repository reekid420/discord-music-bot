import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildSettings, updateGuildSettings } from '../../db/database.js';

export const data = new SlashCommandBuilder()
  .setName('settings')
  .setDescription('Configure bot settings for this server (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
    opt.setName('key')
      .setDescription('Setting to change')
      .setRequired(true)
      .addChoices(
        { name: 'DJ Role', value: 'dj_role' },
        { name: 'Vote-skip Threshold (%)', value: 'vote_threshold' },
        { name: 'Auto-leave Timeout (seconds)', value: 'auto_leave' },
        { name: 'Default Volume', value: 'default_volume' },
      )
  )
  .addStringOption(opt =>
    opt.setName('value')
      .setDescription('New value for the setting')
      .setRequired(true)
  );

export async function execute(interaction) {
  const key = interaction.options.getString('key', true);
  const value = interaction.options.getString('value', true);

  const settings = getGuildSettings(interaction.guildId);

  try {
    switch (key) {
      case 'dj_role': {
        // Accept role mention, role ID, or "none"
        const roleId = value.toLowerCase() === 'none'
          ? null
          : value.replace(/[<@&>]/g, '');
        if (roleId && !interaction.guild.roles.cache.has(roleId)) {
          return interaction.reply({ content: '❌ Role not found. Use a mention or role ID.', ephemeral: true });
        }
        updateGuildSettings(interaction.guildId, { dj_role_id: roleId });
        await interaction.reply(`✅ DJ role set to ${roleId ? `<@&${roleId}>` : '**none**'}.`);
        break;
      }

      case 'vote_threshold': {
        const pct = parseFloat(value);
        if (isNaN(pct) || pct < 1 || pct > 100) {
          return interaction.reply({ content: '❌ Threshold must be 1-100 (percentage).', ephemeral: true });
        }
        updateGuildSettings(interaction.guildId, { vote_threshold: pct / 100 });
        await interaction.reply(`✅ Vote-skip threshold set to **${pct}%**.`);
        break;
      }

      case 'auto_leave': {
        const seconds = parseInt(value, 10);
        if (isNaN(seconds) || seconds < 0 || seconds > 3600) {
          return interaction.reply({ content: '❌ Timeout must be 0-3600 seconds.', ephemeral: true });
        }
        updateGuildSettings(interaction.guildId, { auto_leave_s: seconds });
        await interaction.reply(`✅ Auto-leave timeout set to **${seconds}s**.`);
        break;
      }

      case 'default_volume': {
        const vol = parseInt(value, 10);
        if (isNaN(vol) || vol < 1 || vol > 100) {
          return interaction.reply({ content: '❌ Volume must be 1-100.', ephemeral: true });
        }
        updateGuildSettings(interaction.guildId, { default_volume: vol });
        await interaction.reply(`✅ Default volume set to **${vol}%**.`);
        break;
      }
    }
  } catch (err) {
    console.error('[Settings]', err);
    await interaction.reply({ content: '❌ Failed to update settings.', ephemeral: true });
  }
}
