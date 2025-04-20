const { Client, GatewayIntentBits, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
require('dotenv').config();

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ] 
});

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// Command definitions
const commands = [
  new SlashCommandBuilder()
    .setName('log')
    .setDescription('Log your daily metrics'),

  new SlashCommandBuilder()
    .setName('settimezone')
    .setDescription('Set your timezone')
    .addStringOption(option =>
      option.setName('timezone')
        .setDescription('Your timezone code')
        .setRequired(true)
        .addChoices(
          { name: 'Pacific Time (GMT-8)', value: 'PST' },
          { name: 'Pacific Daylight (GMT-7)', value: 'PDT' },
          { name: 'Mountain Time (GMT-7)', value: 'MST' },
          { name: 'Mountain Daylight (GMT-6)', value: 'MDT' },
          { name: 'Central Time (GMT-6)', value: 'CST' },
          { name: 'Central Daylight (GMT-5)', value: 'CDT' },
          { name: 'Eastern Time (GMT-5)', value: 'EST' },
          { name: 'Eastern Daylight (GMT-4)', value: 'EDT' },
          { name: 'Greenwich Mean Time', value: 'GMT' },
          { name: 'British Summer Time (GMT+1)', value: 'BST' },
          { name: 'Central European (GMT+1)', value: 'CET' },
          { name: 'Eastern European (GMT+2)', value: 'EET' },
          { name: 'India Standard (GMT+5:30)', value: 'IST' },
          { name: 'China Standard (GMT+8)', value: 'CST_CN' },
          { name: 'Japan Standard (GMT+9)', value: 'JST' },
          { name: 'Australia Eastern (GMT+10)', value: 'AEST' },
          { name: 'New Zealand (GMT+12)', value: 'NZST' }
        )),

  new SlashCommandBuilder()
    .setName('streak')
    .setDescription('Check your current streak'),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the streak leaderboard')
];

// Register commands
const rest = new REST({ version: '9' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands },
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
})();

// Event handlers
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      // Handle slash commands
      switch (interaction.commandName) {
        case 'log':
          await handleLogCommand(interaction);
          break;
        case 'settimezone':
          await handleTimezoneCommand(interaction);
          break;
        case 'streak':
          await handleStreakCommand(interaction);
          break;
        case 'leaderboard':
          await handleLeaderboardCommand(interaction);
          break;
      }
    } else if (interaction.isModalSubmit()) {
      // Handle modal submissions
      if (interaction.customId === 'dailyLogModal') {
        await handleDailyLogSubmission(interaction);
      }
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    try {
      const errorMessage = "❌ An error occurred. Please try again.";
      if (interaction.deferred) {
        await interaction.editReply({ content: errorMessage, ephemeral: true });
      } else if (!interaction.replied) {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
});

async function handleLogCommand(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('dailyLogModal')
    .setTitle('Daily Log');

  // Priority 1
  const priority1Row = new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('priority1')
      .setLabel('Priority 1 (format: label | value | unit)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Exercise | 30 | minutes')
      .setRequired(true)
  );

  // Priority 2
  const priority2Row = new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('priority2')
      .setLabel('Priority 2 (optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Meditation | 15 | minutes')
      .setRequired(false)
  );

  // Priority 3
  const priority3Row = new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('priority3')
      .setLabel('Priority 3 (optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Reading | 2 | chapters')
      .setRequired(false)
  );

  // Satisfaction
  const satisfactionRow = new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('satisfaction')
      .setLabel('Satisfaction (1-10)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Rate your day (1-10)')
      .setRequired(true)
  );

  // Notes
  const notesRow = new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('notes')
      .setLabel('Notes (optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Any additional notes or reflections')
      .setRequired(false)
  );

  modal.addComponents(priority1Row, priority2Row, priority3Row, satisfactionRow, notesRow);
  await interaction.showModal(modal);
}

async function handleTimezoneCommand(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const timezone = interaction.options.getString('timezone');
    const userId = interaction.user.id;
    
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'setTimezone',
        userId: userId,
        timezone: timezone
      })
    });

    const result = await response.json();
    
    if (result.success) {
      await interaction.editReply({
        content: result.message,
        ephemeral: true
      });
    } else {
      await interaction.editReply({
        content: result.message || "Failed to set timezone. Please try again.",
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error setting timezone:', error);
    if (interaction.deferred) {
      await interaction.editReply({
        content: "❌ There was an error setting your timezone. Please try again.",
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: "❌ There was an error setting your timezone. Please try again.",
        ephemeral: true
      });
    }
  }
}

async function handleStreakCommand(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'getStreak',
        userId: interaction.user.id
      })
    });

    const result = await response.json();
    await interaction.editReply({
      content: result.message,
      ephemeral: true
    });
  } catch (error) {
    console.error('Error getting streak:', error);
    await interaction.editReply({
      content: "❌ There was an error getting your streak. Please try again.",
      ephemeral: true
    });
  }
}

async function handleLeaderboardCommand(interaction) {
  try {
    await interaction.deferReply();
    
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'getLeaderboard',
        userId: interaction.user.id
      })
    });

    const result = await response.json();
    await interaction.editReply(result.message);
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    await interaction.editReply("❌ There was an error getting the leaderboard. Please try again.");
  }
}

async function handleDailyLogSubmission(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Parse priorities
    const priorities = [];
    for (let i = 1; i <= 3; i++) {
      const priorityInput = interaction.fields.getTextInputValue(`priority${i}`);
      if (priorityInput) {
        const [label, value, unit] = priorityInput.split('|').map(s => s.trim());
        priorities.push({ label, value, unit });
      } else {
        priorities.push({ label: '', value: '', unit: '' });
      }
    }

    const satisfaction = interaction.fields.getTextInputValue('satisfaction');
    const notes = interaction.fields.getTextInputValue('notes');

    // Send to Google Apps Script
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'logDaily',
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        data: {
          priority1_label: priorities[0].label,
          priority1_value: priorities[0].value,
          priority1_unit: priorities[0].unit,
          priority2_label: priorities[1].label,
          priority2_value: priorities[1].value,
          priority2_unit: priorities[1].unit,
          priority3_label: priorities[2].label,
          priority3_value: priorities[2].value,
          priority3_unit: priorities[2].unit,
          satisfaction: satisfaction,
          notes: notes
        }
      })
    });

    const result = await response.json();
    
    if (result.success) {
      // Send the confirmation message to the user
      await interaction.editReply({
        content: result.message,
        ephemeral: true
      });

      // If there are any milestones, announce them in the channel
      if (result.milestone) {
        await interaction.channel.send(result.milestone);
      }
    } else {
      await interaction.editReply({
        content: "❌ Failed to log your entry. Please try again.",
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error handling daily log submission:', error);
    await interaction.editReply({
      content: "❌ There was an error submitting your log. Please try again.",
      ephemeral: true
    });
  }
}

client.login(process.env.DISCORD_TOKEN);
