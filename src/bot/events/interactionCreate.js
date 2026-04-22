export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`[Interaction] Unknown command: ${interaction.commandName}`);
    await interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`[Interaction] Error executing /${interaction.commandName}:`, error);
    const reply = {
      content: '❌ Something went wrong executing that command.',
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
}
