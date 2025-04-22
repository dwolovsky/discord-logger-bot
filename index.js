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
          .setName('testlog')
          .setDescription('Preview how your daily log will look')
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
        // const placeholder = 'e.g. "Meditation, 15 mins"';
        const priority1 = new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('priority1')
            .setLabel('Priority 1 (Measurement or Effort Rating)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. "Health, 7/10 effort"')
            .setRequired(true)
        );
        const priority2 = new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('priority2')
            .setLabel('Priority 2 (Measurement or Effort Rating)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. "Meditation, 15 mins"')
            .setRequired(true)
        );
        const priority3 = new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('priority3')
            .setLabel('Priority 3 (Measurement or Effort Rating)')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. "Writing, 500 words"')
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
            .setLabel('Notes / Experiment / "I\'m learning..."')
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

// Handle /testlog command
if (interaction.isChatInputCommand() && interaction.commandName === 'testlog') {
  try {
    const modal = new ModalBuilder()
      .setCustomId('testLogPreview')  // Different customId to differentiate from real logs
      .setTitle('Daily Log Preview');

    // Use exact same form components as /log
    const priority1 = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('priority1')
        .setLabel('Priority 1 (Measurement or Effort Rating)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. "Meditation, 15 mins"')
        .setRequired(true)
    );
    const priority2 = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('priority2')
        .setLabel('Priority 2 (Measurement or Effort Rating)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. "Focus, 8/10 effort"')
        .setRequired(true)
    );
    const priority3 = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('priority3')
        .setLabel('Priority 3 (Measurement or Effort Rating)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. "Writing, 500 words"')
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
        .setLabel('Notes / Experiment / "I\'m learning..."')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
    );

    modal.addComponents(priority1, priority2, priority3, satisfaction, notes);
    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error showing test modal:', error);
    if (!interaction.replied) {
      await interaction.reply({ 
        content: '❌ There was an error showing the form. Please try again.',
        ephemeral: true 
      });
    }
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
          priority3_unit: priorities[2].unit,
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
    await handleRoleUpdate(interaction, result.currentStreak);
    await interaction.channel.send(result.milestone);
  } else {
    await interaction.channel.send(`🎯 ${interaction.user} just logged their daily metrics!`);
  }

  // Send DM for milestone if provided
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

// Handle test modal submission
if (interaction.isModalSubmit() && interaction.customId === 'testLogPreview') {
  try {
    // Use same priority parsing function
    function parsePriority(input) {
      const regex = /^(.*?)[,\.\-_:]+\s*(\d+)\s*(.*)$/;
      const match = input.trim().match(regex);
      if (!match) return null;
      let [_, label, value, unit] = match;
      label = label.trim().substring(0, 500);
      value = value.trim();
      unit = unit.trim();
      if (!unit) unit = 'effort';
      return { label, value, unit };
    }

    // Validate priorities
    const priorities = [];
    for (let i = 1; i <= 3; i++) {
      const input = interaction.fields.getTextInputValue(`priority${i}`);
      const parsed = parsePriority(input);
      if (!parsed || !parsed.label || !parsed.value) {
        return await interaction.reply({
          content: `❌ Invalid format for Priority ${i}. Use: "Activity, value units" or "Rating, number/10 effort"`,
          ephemeral: true
        });
      }
      priorities.push(parsed);
    }

    // Validate satisfaction
    const satisfactionRaw = interaction.fields.getTextInputValue('satisfaction');
    const satisfaction = parseInt(satisfactionRaw, 10);
    if (isNaN(satisfaction) || satisfaction < 0 || satisfaction > 10) {
      return await interaction.reply({
        content: "❌ Satisfaction must be a number between 0 and 10.",
        ephemeral: true
      });
    }

    // Validate notes
    const notes = interaction.fields.getTextInputValue('notes');
    if (!notes || !notes.trim()) {
      return await interaction.reply({
        content: "❌ Notes field is required.",
        ephemeral: true
      });
    }

    // If all validation passes, show preview
    await interaction.reply({
      content: `✅ Your log would look like this:

Priority 1: ${priorities[0].label}, ${priorities[0].value} ${priorities[0].unit}
Priority 2: ${priorities[1].label}, ${priorities[1].value} ${priorities[1].unit}
Priority 3: ${priorities[2].label}, ${priorities[2].value} ${priorities[2].unit}
Satisfaction: ${satisfaction}/10
Notes: ${notes}

Ready to log for real? Use /log to begin your streak!`,
      ephemeral: true
    });
  } catch (error) {
    console.error('Error in test modal submission:', error);
    await interaction.reply({
      content: '❌ There was an error processing your test log. Please try again.',
      ephemeral: true
    });
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

async function handleRoleUpdate(interaction, streakCount) {
  try {
    const guild = interaction.guild;
    const member = interaction.member;
    
    // Get all role definitions sorted by days descending
    const roleDefinitions = Object.values(CONFIG.STREAK.MILESTONES.ROLES)
      .sort((a, b) => b.days - a.days);

    // Find the highest role the user qualifies for
    const qualifiedRole = roleDefinitions.find(role => streakCount >= role.days);
    
    if (qualifiedRole) {
      // Ensure the role exists
      const newRole = await ensureRole(guild, qualifiedRole.name, qualifiedRole.color);
      
      // If user doesn't have this role yet
      if (!member.roles.cache.has(newRole.id)) {
        // Remove all other streak roles
        for (const roleDef of roleDefinitions) {
          const existingRole = guild.roles.cache.find(r => r.name === roleDef.name);
          if (existingRole && member.roles.cache.has(existingRole.id)) {
            await member.roles.remove(existingRole.id);
          }
        }
        
        // Add new role
        await member.roles.add(newRole.id);
        await interaction.channel.send(
          `🎊 ${member.user} has achieved the rank of ${qualifiedRole.name}! ` +
          `(Day ${streakCount})`
        );
      }
    }
  } catch (error) {
    console.error('Error updating roles:', error);
  }
}

async function ensureRole(guild, roleName, color) {
  let role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      color: color,
      reason: 'Achievement role'
    });
  }
  return role;
}

client.login(DISCORD_TOKEN);
