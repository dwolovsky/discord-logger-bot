require('dotenv').config();
const { Client, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, Events, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

// Register the /log command on startup (for your server only)
const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.APPLICATION_ID, process.env.GUILD_ID),
      { body: [
        new SlashCommandBuilder()
          .setName('log')
          .setDescription('Open the daily log form')
          .toJSON()
      ]}
    );
    console.log('Slash command registered.');
  } catch (error) {
    console.error('Error registering slash command:', error);
  }
})();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'log') {
    const modal = new ModalBuilder()
      .setCustomId('dailyLog')
      .setTitle('Daily Log');

    // 1. Priority 1
    const priority1 = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('priority1')
        .setLabel('Priority 1 (label - value - unit)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    );
    // 2. Priority 2
    const priority2 = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('priority2')
        .setLabel('Priority 2 (label - value - unit)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    );
    // 3. Priority 3
    const priority3 = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('priority3')
        .setLabel('Priority 3 (label - value - unit)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    );
    // 4. Satisfaction
    const satisfaction = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('satisfaction')
        .setLabel('Satisfaction (0-10)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
    );
    // 5. Notes & Experiment
    const notes = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('notes')
        .setLabel('Notes & Experiment')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
    );

    modal.addComponents(priority1, priority2, priority3, satisfaction, notes);
    await interaction.showModal(modal);
  }

  // Handle modal submission
  if (interaction.isModalSubmit() && interaction.customId === 'dailyLog') {
    await interaction.deferReply({ ephemeral: true });

    // Helper to parse "label - value - unit"
    const parsePriority = (value) => {
      const parts = value.split('-').map(p => p.trim());
      return {
        label: parts[0] || '',
        value: parts[1] || '',
        unit: parts[2] || 'effort'
      };
    };

    const priority1 = parsePriority(interaction.fields.getTextInputValue('priority1'));
    const priority2 = parsePriority(interaction.fields.getTextInputValue('priority2'));
    const priority3 = parsePriority(interaction.fields.getTextInputValue('priority3'));

    const data = {
      priority1_label: priority1.label,
      priority1_value: priority1.value,
      priority1_unit: priority1.unit,
      priority2_label: priority2.label,
      priority2_value: priority2.value,
      priority2_unit: priority2.unit,
      priority3_label: priority3.label,
      priority3_value: priority3.value,
      priority3_unit: priority3.unit,
      experiment: '', // left blank, since it's now in notes
      satisfaction: interaction.fields.getTextInputValue('satisfaction') || '',
      notes: interaction.fields.getTextInputValue('notes') || ''
    };

    // Send data to Google Apps Script webhook
    try {
      const response = await fetch(process.env.SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: interaction.user.id,
          userTag: interaction.user.tag,
          data
        })
      });
      const result = await response.json();
      if (result.success) {
        await interaction.editReply('✅ Your log was recorded. Thanks!');
      } else {
        await interaction.editReply('❌ There was an error logging your entry.');
      }
    } catch (err) {
      console.error('Error sending to Google Apps Script:', err);
      await interaction.editReply('❌ There was an error sending your data. Please try again later.');
    }
  }
});

client.login(process.env.BOT_TOKEN);
