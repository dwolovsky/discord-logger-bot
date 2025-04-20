require('dotenv').config();
const { 
  Client, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, 
  ActionRowBuilder, Events, REST, Routes, SlashCommandBuilder 
} = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

// ====== ENVIRONMENT VARIABLES ======
const APPLICATION_ID = process.env.APPLICATION_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SCRIPT_URL = process.env.SCRIPT_URL;

// ====== TIMEZONE CHOICES (from your CONFIG) ======
const TIMEZONE_CHOICES = [
  { name: 'Pacific Time (GMT-8)', value: 'PST' },
  { name: 'Pacific Daylight (GMT-7)', value: 'PDT' },
  { name: 'Mountain Time (GMT-7)', value: 'MST' },
  { name: 'Mountain Daylight (GMT-6)', value: 'MDT' },
  { name: 'Central Time (GMT-6)', value: 'CST' },
  { name: 'Central Daylight (GMT-5)', value: 'CDT' },
  { name: 'Eastern Time (GMT-5)', value: 'EST' },
  { name: 'Eastern Daylight (GMT-4)', value: 'EDT' },
  { name: 'Greenwich Mean Time', value: 'GMT' },
  { name: 'Universal Time', value: 'UTC' },
  { name: 'British Summer Time (GMT+1)', value: 'BST' },
  { name: 'Central European Time (GMT+1)', value: 'CET' },
  { name: 'Central European Summer Time (GMT+2)', value: 'CEST' },
  { name: 'Eastern European Time (GMT+2)', value: 'EET' },
  { name: 'Eastern European Summer Time (GMT+3)', value: 'EEST' },
  { name: 'Moscow Time (GMT+3)', value: 'MSK' },
  { name: 'South African Standard Time (GMT+2)', value: 'SAST' },
  { name: 'India Standard Time (GMT+5:30)', value: 'IST' },
  { name: 'Pakistan Standard Time (GMT+5)', value: 'PKT' },
  { name: 'Singapore Time (GMT+8)', value: 'SGT' },
  { name: 'China Standard Time (GMT+8)', value: 'CST_CN' },
  { name: 'Japan Standard Time (GMT+9)', value: 'JST' },
  { name: 'Korea Standard Time (GMT+9)', value: 'KST' },
  { name: 'Australian Eastern Standard Time (GMT+10)', value: 'AEST' },
  { name: 'New Zealand Standard Time (GMT+12)', value: 'NZST' }
];

// ====== REGISTER SLASH COMMANDS ======
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID),
      { body: [
        new SlashCommandBuilder()
          .setName('log')
          .setDescription('Open the daily log form')
          .toJSON(),
        new SlashCommandBuilder()
          .setName('settimezone')
          .setDescription('Set your timezone')
          .addStringOption(option => {
            option.setName('timezone')
              .setDescription('Your timezone (e.g., PST, EST, GMT)')
              .setRequired(true);
            TIMEZONE_CHOICES.forEach(tz => option.addChoices(tz));
            return option;
          })
          .toJSON(),
        new SlashCommandBuilder()
          .setName('streak')
          .setDescription('Check your current streak')
          .toJSON(),
        new SlashCommandBuilder()
          .setName('leaderboard')
          .setDescription('View the streak leaderboard')
          .toJSON()
      ]}
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
})();

// ====== DISCORD CLIENT ======
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ====== INTERACTION HANDLER ======
client.on(Events.InteractionCreate, async interaction => {
  try {
    // Handle /log command
    if (interaction.isChatInputCommand() && interaction.commandName === 'log') {
      try {
        const modal = new ModalBuilder()
          .setCustomId('dailyLog')
          .setTitle('Daily Log');

        // Priority fields (all required, new format)
        const placeholder = 'e.g. "Meditation, 30 minutes" OR "Health, 8/10 effort"';
        const priority1 = new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('priority1')
            .setLabel('Priority 1 (Measurement or effort rating)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(placeholder)
            .setRequired(true)
        );
        const priority2 = new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('priority2')
            .setLabel('Priority 2 (Measurement or effort rating)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(placeholder)
            .setRequired(true)
        );
        const priority3 = new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('priority3')
            .setLabel('Priority 3 (Measurement or effort rating)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(placeholder)
            .setRequired(true)
        );
        const satisfaction = new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('satisfaction')
            .setLabel('Satisfaction (0-10)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        );
        const notes = new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('notes')
            .setLabel('Notes')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        );

        modal.addComponents(priority1, priority2, priority3, satisfaction, notes);
        await interaction.showModal(modal);
      } catch (error) {
        console.error('Error showing modal:', error);
        if (!interaction.replied) {
          await interaction.reply({ 
            content: '❌ There was an error showing the form. Please try again.',
            ephemeral: true 
          });
        }
      }
      return;
    }

    // Handle /settimezone command
    if (interaction.isChatInputCommand() && interaction.commandName === 'settimezone') {
      try {
        await interaction.deferReply({ ephemeral: true });
        const timezone = interaction.options.getString('timezone');
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'setTimezone',
            userId: interaction.user.id,
            userTag: interaction.user.tag,
            timezone: timezone
          })
        });
        const result = await response.json();
        await interaction.editReply({
          content: result.message,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error setting timezone:', error);
        await interaction.editReply({
          content: '❌ Unable to set timezone. Please try again or contact support.',
          ephemeral: true
        });
      }
      return;
    }

    // Handle /streak command
    if (interaction.isChatInputCommand() && interaction.commandName === 'streak') {
      try {
        await interaction.deferReply({ ephemeral: true });
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'getStreak',
            userId: interaction.user.id,
            userTag: interaction.user.tag
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
          content: '❌ Unable to retrieve your streak. Please try again.',
          ephemeral: true
        });
      }
      return;
    }

    // Handle /leaderboard command (ephemeral)
    if (interaction.isChatInputCommand() && interaction.commandName === 'leaderboard') {
      try {
        await interaction.deferReply({ ephemeral: true });
        const response = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'getLeaderboard',
            userId: interaction.user.id,
            userTag: interaction.user.tag
          })
        });
        const result = await response.json();
        await interaction.editReply({
          content: result.message,
          ephemeral: true
        });
      } catch (error) {
        console.error('Error getting leaderboard:', error);
        await interaction.editReply({
          content: '❌ Unable to retrieve the leaderboard. Please try again.',
          ephemeral: true
        });
      }
      return;
    }

    // Handle modal submission
    if (interaction.isModalSubmit() && interaction.customId === 'dailyLog') {
      try {
        await interaction.deferReply({ ephemeral: true });

        // ====== PRIORITY PARSING FUNCTION ======
        function parsePriority(input) {
          // Accepts: "Meditation, 30 minutes", "Focus: 8", "Health, 8/10", etc.
          // Separators: comma, period, dash, underscore, colon
          const regex = /^(.*?)[,\.\-_:]+\s*(\d+)\s*(.*)$/;
          const match = input.trim().match(regex);
          if (!match) return null;
          let [_, label, value, unit] = match;
          label = label.trim().substring(0, 500);
          value = value.trim();
          unit = unit.trim();
          // If unit is blank, set to "effort"
          if (!unit) unit = 'effort';
          return { label, value, unit };
        }

        // Parse and validate priorities
        const priorities = [];
        for (let i = 1; i <= 3; i++) {
          const input = interaction.fields.getTextInputValue(`priority${i}`);
          const parsed = parsePriority(input);
          if (!parsed || !parsed.label || !parsed.value) {
            return await interaction.editReply({
              content: `❌ Invalid format for Priority ${i}. Use: "Activity, value units" or "Rating, number/10 effort"`,
              ephemeral: true
            });
          }
          priorities.push(parsed);
        }

        // Validate satisfaction (0-10)
        const satisfactionRaw = interaction.fields.getTextInputValue('satisfaction');
        const satisfaction = parseInt(satisfactionRaw, 10);
        if (isNaN(satisfaction) || satisfaction < 0 || satisfaction > 10) {
          return await interaction.editReply({
            content: "❌ Satisfaction must be a number between 0 and 10.",
            ephemeral: true
          });
        }
// Notes (required)
        const notes = interaction.fields.getTextInputValue('notes');
        if (!notes || !notes.trim()) {
          return await interaction.editReply({
            content: "❌ Notes field is required.",
            ephemeral: true
          });
        }

        // Prepare data for Google Apps Script
        const data = {
          priority1_label: priorities[0].label,
          priority1_value: priorities[0].value,
          priority1_unit: priorities[0].unit,
          priority2_label: priorities[1].label,
          priority2_value: priorities[1].value,
          priority2_unit: priorities[1].unit,
          priority3_label: priorities[2].label,
          priority3_value: priorities[2].value,
          priority3_unit: priorities[3].unit,
          satisfaction: satisfaction,
          notes: notes
        };

        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timed out')), 15000)
        );

        // Send to Google Apps Script with timeout
        const response = await Promise.race([
            fetch(SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'logDaily',
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    data
                })
            }),
            timeoutPromise
        ]);
        const result = await response.json();

        if (result.success) {
          // Ephemeral confirmation
          await interaction.editReply({ 
            content: result.message || '✅ Your log was recorded. Thanks!',
            ephemeral: true 
          });

          // Public channel announcement
          if (result.milestone) {
            await interaction.channel.send(result.milestone);
          } else {
            await interaction.channel.send(`🎯 ${interaction.user} just logged their daily metrics!`);
          }

          // DM for milestone if provided
          if (result.dmMessage) {
            try {
              await interaction.user.send(result.dmMessage);
            } catch (dmError) {
              console.error('Could not send DM:', dmError);
            }
          }
        } else {
          await interaction.editReply({ 
            content: result.message || '❌ There was an error logging your entry.',
            ephemeral: true 
          });
        }
      } catch (err) {
        console.error('Error in modal submission:', err);
        try {
          await interaction.editReply({ 
            content: err.message === 'Request timed out'
              ? '❌ The request took too long. Please try again.'
              : '❌ There was an error sending your data. Please try again later.',
            ephemeral: true 
          });
        } catch (replyErr) {
          console.error('Error sending error message:', replyErr);
        }
      }
      return;
    }
  } catch (outerError) {
    console.error('Error handling interaction:', outerError);
    if (!interaction.replied) {
      await interaction.reply({ 
        content: '❌ An unexpected error occurred. Please try again.',
        ephemeral: true 
      });
    }
  }
});

client.login(DISCORD_TOKEN);
