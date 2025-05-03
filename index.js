require('dotenv').config();
const { 
  Client, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, 
  ActionRowBuilder, Events, REST, Routes, SlashCommandBuilder 
} = require('discord.js');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const { GoogleGenerativeAI } = require('@google/generative-ai');

const fs = require('fs').promises;
const path = require('path');

// ====== ENVIRONMENT VARIABLES ======
const APPLICATION_ID = process.env.APPLICATION_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SCRIPT_URL = process.env.SCRIPT_URL;

// Add to your environment variables section
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ====== Global Error Handlers ======
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception thrown:', err);
  process.exit(1);
});

// Add near other constants/env vars
const INSIGHTS_COOLDOWN = 0 //3600000; // 1 hour in milliseconds
const userInsightsCooldowns = new Map();

// Initialize Gemini with error handling
let genAI;
try {
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
} catch (error) {
  console.error('Failed to initialize Gemini:', error);
}

// Add Gemini configuration here
const GEMINI_CONFIG = {
  temperature: 0.8,
  topK: 50,
  topP: 0.95,
  maxOutputTokens: 1024
};

// Add this function to test the AI integration
async function testGeminiAPI() {
  try {
    console.log("Starting testGeminiAPI");
    
    if (!genAI) {
      console.error("genAI not initialized. GEMINI_API_KEY:", 
        GEMINI_API_KEY ? "present" : "missing");
      throw new Error('Gemini AI not initialized');
    }

    console.log("Creating model instance");
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const prompt = "Generate a short test response: What's the best thing about keeping a daily log?";
    console.log("Sending test prompt:", prompt);
    
    const result = await model.generateContent(prompt);
    console.log("Raw result:", result);
    
    const response = await result.response;
    console.log("Response object:", response);
    
    const text = response.text();
    console.log("Final text:", text);
    
    return {
      success: true,
      message: text
    };
  } catch (error) {
    console.error('Detailed Gemini API test error:', {
      error: error.toString(),
      stack: error.stack,
      message: error.message
    });
    return {
      success: false,
      error: error.message
    };
  }
}


const QUEUE_CONFIG = {
  BATCH_SIZE: 10,
  BATCH_DELAY: 1000, // 1 second between batches
  MAX_RETRIES: 3,
  RETRY_DELAY: 5000  // 5 seconds between retries
};

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
        
        // Add to your existing slash commands array
        new SlashCommandBuilder()
        .setName('testai')
        .setDescription('Test the AI integration')
        .toJSON(),
        
        new SlashCommandBuilder()
          .setName('leaderboard')
          .setDescription('View the streak leaderboard')
          .toJSON(),

        new SlashCommandBuilder()
          .setName('insights7')
          .setDescription('Get AI insights from your last 7 days of logs')
          .toJSON(),
        new SlashCommandBuilder()
          .setName('insights30')
          .setDescription('Get AI insights from your last 30 days of logs')
          .toJSON(),

        // Add this to your slash commands array in the registration section
        new SlashCommandBuilder()
          .setName('setweek')
          .setDescription('Set your weekly priority labels and units')
          .toJSON()
      ]}
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
})();

async function generateInsights(structuredData) {
  console.log('generateInsights called with:', structuredData);
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt = INSIGHTS_PROMPT_TEMPLATE(structuredData); // Pass the data to the template function

   const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Maximum possible length while staying under Discord's 2000 limit
    const MAX_LENGTH = 1999;
    const finalText = text.length > MAX_LENGTH 
      ? text.substring(0, MAX_LENGTH) + "..."
      : text;

    return {
      success: true,
      insights: finalText,
      metadata: {
        generatedAt: new Date().toISOString(),
        dataPoints: structuredData.priorities.length,
        periodDays: structuredData.userMetrics.periodDays
      }
    };
  } catch (error) {
    console.error('Error generating insights:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

const INSIGHTS_PROMPT_TEMPLATE = (data) => `Please provide a concise analysis (under 1850 characters total) of this user's data with a supportive, growth-focused summary:

### 🫂 Challenges
Review their journey through:
- Priority Stats:
${data.priorities.map(p => 
  `  • ${p.label}: ${p.metrics.average} ${p.unit}\n    Variation: ${p.metrics.variation}%`
).join('\n')}

- Satisfaction Trend: ${data.satisfaction.map(s => s.value).join(', ')}
- Notes trends and themes:
${data.notes.map(n => `  • ${n.content}`).join('\n')}

Acknowledge their challenges with compassion. Normalize their struggles. Focus on validating their experience without offering solutions yet.

### 🌱 Transformations
Analyze patterns in:
- Priority Trends:
${data.priorities.map(p => 
  `  • ${p.label}: ${p.metrics.average} ${p.unit}\n    Variation: ${p.metrics.variation}%`
).join('\n')}
${data.correlations?.length ? `- Correlations:\n${data.correlations.map(c => 
  `  • ${c.priority}: ${c.interpretation} (n=${c.n})`
).join('\n')}` : ''}
- Recent Notes:
${data.notes.map(n => `  • ${n.date}: ${n.content}`).join('\n')}

Look for subtle shifts in language, hidden wins, and emerging patterns. How are they evolving to become more like the person they want to become?

### 🧪 Experiments
Consider their complete journey:
- Priorities & Trends:
${data.priorities.map(p => 
  `  • ${p.label}: ${p.metrics.average} ${p.unit}\n    Variation: ${p.metrics.variation}%`
).join('\n')}

- Satisfaction Patterns:
  • Recent scores: ${data.satisfaction.map(s => s.value).join(', ')}
  • Correlations: ${data.correlations?.map(c => c.interpretation).join('\n  ') || 'None'}


- Note Themes:
${data.notes.map(n => `  • ${n.date}: ${n.content}`).join('\n')}

Based on this comprehensive view, suggest 2-3 experiments that:
1. Build on patterns where they're seeing progress
2. Address areas with high variation or declining trends
3. Explore themes mentioned in their notes
4. Mix familiar approaches with creative new directions

Remember: Keep the total response under 1800 characters while maintaining a supportive tone.`;


// ====== DISCORD CLIENT ======
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Process queue immediately on startup
  processMessageQueue().catch(console.error);
  
  // Then set up the interval (every 3 minutes)
  setInterval(() => {
    processMessageQueue().catch(console.error);
  }, 3 * 60 * 1000);
});

async function processMessageQueue() {
  try {
    console.log('Starting queue check...');
    console.log('SCRIPT_URL:', SCRIPT_URL);
    
    const requestBody = {
      action: 'getQueuedMessages'
    };
    console.log('Request body:', JSON.stringify(requestBody));

    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    console.log('Response status:', response.status);
    const responseText = await response.text();
    console.log('Raw response:', responseText);
    
    const result = JSON.parse(responseText);
    console.log('Parsed response:', result);
    
    if (!result.messages?.length) {
      console.log('No messages in queue');
      return;
    }

    console.log(`Processing ${result.messages.length} messages in queue`);

    // Process messages in batches
    for (let i = 0; i < result.messages.length; i += QUEUE_CONFIG.BATCH_SIZE) {
      const batch = result.messages.slice(i, i + QUEUE_CONFIG.BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i/QUEUE_CONFIG.BATCH_SIZE) + 1}`);
      
      for (const msg of batch) {
        try {
          console.log(`Attempting to deliver message ${msg.id} to user ${msg.userTag}`);
          const user = await client.users.fetch(msg.userId);
          await user.send(msg.message);
          console.log('Message sent successfully');
          
          // Confirm delivery
          console.log(`Confirming delivery for message ${msg.id}`);
          const confirmResponse = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'confirmDelivery',
              messageId: msg.id
            })
          });

          const confirmText = await confirmResponse.text();
          console.log('Confirmation response:', confirmText);
          
          const confirmResult = JSON.parse(confirmText);
          console.log('Parsed confirmation result:', confirmResult);

          if (!confirmResult.success) {
            throw new Error('Failed to confirm delivery: ' + (confirmResult.error || 'Unknown error'));
          }
          
          console.log(`Successfully delivered and confirmed message to ${msg.userTag}`);

        } catch (error) {
          console.error(`Failed to process message ${msg.id}:`, error);
          
          try {
            console.log(`Reporting failure for message ${msg.id}`);
            await fetch(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'deliveryFailed',
                messageId: msg.id,
                error: error.message
              })
            });
            console.log(`Reported delivery failure for ${msg.userTag}`);
          } catch (reportError) {
            console.error('Failed to report message delivery failure:', reportError);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in message queue processing:', error);
  }
}

// ====== INTERACTION HANDLER ======
// ====== INTERACTION HANDLER ======
client.on(Events.InteractionCreate, async interaction => {
  console.log(`⚡ Received interaction:`, {
    type: interaction.type,
    isCommand: interaction.isChatInputCommand?.(),
    command: interaction.commandName,
    user: interaction.user?.tag
  });

  if (interaction.isChatInputCommand()) {
    try {
      switch (interaction.commandName) {
        case 'log': {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2800);

          let response;
          try {
            response = await fetch(SCRIPT_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'getWeeklyPriorities',
                userId: interaction.user.id
              }),
              signal: controller.signal
            });
          } finally {
            clearTimeout(timeoutId);
          }

          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const result = await response.json();

          if (!result.success) {
            await interaction.reply({
              content: "❌ Script error: " + (result.error || "Unknown error"),
              ephemeral: true
            });
            return;
          }

          const weeklyPriorities = result.priorities;

          const modal = new ModalBuilder()
            .setCustomId('dailyLog')
            .setTitle('Daily Log');

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('priority1')
                .setLabel(`${weeklyPriorities.Priority1.label}, ${weeklyPriorities.Priority1.unit}`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('priority2')
                .setLabel(`${weeklyPriorities.Priority2.label}, ${weeklyPriorities.Priority2.unit}`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('priority3')
                .setLabel(`${weeklyPriorities.Priority3.label}, ${weeklyPriorities.Priority3.unit}`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('satisfaction')
                .setLabel('Satisfaction (0-10)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('notes')
                .setLabel('Experiment Notes, Questions, Thoughts')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );

          return await interaction.showModal(modal);
        }

        case 'testlog': {
          const modal = new ModalBuilder()
            .setCustomId('testLogPreview')
            .setTitle('Daily Log Preview');

          modal.addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('priority1')
                .setLabel('Priority 1 (Measurement or Effort Rating)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. "Meditation, 15 mins"')
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('priority2')
                .setLabel('Priority 2 (Measurement or Effort Rating)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. "Focus, 8/10 effort"')
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('priority3')
                .setLabel('Priority 3 (Measurement or Effort Rating)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g. "Writing, 500 words"')
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('satisfaction')
                .setLabel('Satisfaction (0-10)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('notes')
                .setLabel('Notes / Experiment / Good & Bad')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          );

          return await interaction.showModal(modal);
        }


        case 'streak': {
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

          if (!result.success) {
            return await interaction.editReply({
              content: "❌ Script error: " + (result.error || "Unknown error"),
              ephemeral: true
            });
          }

          return await interaction.editReply({
            content: result.message,
            ephemeral: true
          });
        }
        case 'testai': {
          await interaction.deferReply({ ephemeral: true });

          const result = await testGeminiAPI();

          const message = result.success
            ? `✅ AI Integration Test Successful!\n\nResponse:\n${result.message}`
            : `❌ AI Integration Test Failed:\n${result.error}`;

          return await interaction.editReply({
            content: message,
            ephemeral: true
          });
        }

        case 'leaderboard': {
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

          if (!result.success) {
            return await interaction.editReply({
              content: "❌ Script error: " + (result.error || "Unknown error"),
              ephemeral: true
            });
          }

          return await interaction.editReply({
            content: result.message,
            ephemeral: true
          });
        }

        case 'setweek': {
          let acknowledged = false;

          try {
            const modal = new ModalBuilder()
              .setCustomId('weeklyPriorities')
              .setTitle('Set Weekly Priorities');

            for (let i = 1; i <= 3; i++) {
              modal.addComponents(
                new ActionRowBuilder().addComponents(
                  new TextInputBuilder()
                    .setCustomId(`priority${i}`)
                    .setLabel(`Priority ${i} (e.g. "Meditation, minutes")`)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                )
              );
            }

            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Modal show timed out')), 2800)
            );

            await Promise.race([
              interaction.showModal(modal),
              timeoutPromise
            ]);

            acknowledged = true;
          } catch (error) {
            console.error('❌ Error in /setweek:', error);

            if (!acknowledged && !interaction.replied && !interaction.deferred) {
              try {
                await interaction.reply({
                  content: '❌ There was an error showing the form. Please try again.',
                  ephemeral: true
                });
              } catch (fallbackError) {
                console.error('⚠️ Failed to send fallback error reply:', fallbackError);
              }
            }
          }

          return;
        }

        case 'insights7':
        case 'insights30': {
          await interaction.deferReply({ ephemeral: true });

          const periodDays = interaction.commandName === 'insights7' ? 7 : 30;

          const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'getInsights',
              userId: interaction.user.id,
              userTag: interaction.user.tag,
              periodDays: periodDays
            })
          });

          const responseText = await response.text();
          const result = JSON.parse(responseText);

          if (!response.ok || !result.success) {
            return await interaction.editReply({
              content: result.message || `❌ ${result.error || 'Failed to generate insights'}`,
              ephemeral: true
            });
          }

          if (result.cached && result.data.aiText) {
            return await interaction.editReply({
              content: `${result.fallback ? '⚠️ Using recent insights while generating new ones.\n\n' : ''}${result.data.aiText}`,
              ephemeral: true
            });
          }

          const aiResult = await generateInsights(result.data.insights.stats);
          if (!aiResult.success) {
            return await interaction.editReply({
              content: `❌ ${aiResult.error || 'Failed to generate AI insights'}`,
              ephemeral: true
            });
          }

          await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'storeInsights',
              userId: interaction.user.id,
              userTag: interaction.user.tag,
              periodDays: periodDays,
              insights: {
                structuredData: result.data.insights,
                aiText: aiResult.insights,
                dataPoints: result.data.insights.userMetrics.dataPoints
              }
            })
          });

          await interaction.user.send(aiResult.insights);

          return await interaction.editReply({
            content: "✨ Check your DMs for insights! 🚀",
            ephemeral: true
          });
        }
        default: {
          console.warn('⚠️ Unrecognized command:', interaction.commandName);
          return await interaction.reply({
            content: '🤔 Unknown command. Please try again or contact support.',
            ephemeral: true
          });
        }
      } // end of switch
        } catch (error) {
      console.error('❌ Error in command handler:', error);

      const timeoutMessage = '🚗 Had to warm up the engine. Please try again now.';
      const genericMessage = '❌ Something went wrong while handling your command.';

      const message = error.name === 'AbortError' ? timeoutMessage : genericMessage;

      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content: message,
            ephemeral: true
          });
        } catch (fallbackError) {
          console.error('⚠️ Failed to send fallback error reply:', fallbackError);
        }
      }
    }
  } // end of isChatInputCommand if


   // Handle modal submission
if (interaction.isModalSubmit() && interaction.customId === 'dailyLog') {
 
  try {
    console.log('Parsed modal data:', {
      priority1: interaction.fields.getTextInputValue('priority1'),
      priority2: interaction.fields.getTextInputValue('priority2'),
      priority3: interaction.fields.getTextInputValue('priority3'),
      satisfaction: interaction.fields.getTextInputValue('satisfaction'),
      notes: interaction.fields.getTextInputValue('notes')
    });

    // Get the weekly priorities first
    const prioritiesResponse = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getWeeklyPriorities',
        userId: interaction.user.id
      })
    });

    const prioritiesResult = await prioritiesResponse.json();
    const weeklyPriorities = prioritiesResult.success ? prioritiesResult.priorities : null;
    
    if (!weeklyPriorities) {
      return await interaction.reply({
        content: '❌ Could not retrieve your priorities. Please set them using /setweek first.',
        ephemeral: true
      });
     }

    const now = new Date();
    console.log('=== Log Submission Time Debug ===');
    console.log('Time being sent to Apps Script:', {
      rawDate: now,
      localLA: now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }),
      utc: now.toUTCString(),
      hours: now.getHours(),
      hoursUTC: now.getUTCHours(),
      timestamp: now.getTime()
    });

    // Get values from modal inputs
    const priorities = [];
    for (let i = 1; i <= 3; i++) {
      const value = interaction.fields.getTextInputValue(`priority${i}`);
      if (!value || !value.trim()) {
        return await interaction.editReply({
          content: `❌ Value required for Priority ${i}.`,
          flags: ['Ephemeral']
        });
      }
      priorities.push({ value: value.trim() });
    }

    // Validate satisfaction (0-10)
    const satisfactionRaw = interaction.fields.getTextInputValue('satisfaction');
    const satisfaction = parseInt(satisfactionRaw, 10);
    if (isNaN(satisfaction) || satisfaction < 0 || satisfaction > 10) {
      return await interaction.editReply({
        content: "❌ Satisfaction must be a number between 0 and 10.",
        flags: ['Ephemeral']
      });
    }

    // Notes (required)
    const notes = interaction.fields.getTextInputValue('notes');
    if (!notes || !notes.trim()) {
      return await interaction.editReply({
        content: "❌ Notes field is required.",
        flags: ['Ephemeral']
      });
    }

    // Prepare data for Google Apps Script
    const data = {
      priority1_label: weeklyPriorities.Priority1.label,
      priority1_value: priorities[0].value,
      priority1_unit: weeklyPriorities.Priority1.unit,
      priority2_label: weeklyPriorities.Priority2.label,
      priority2_value: priorities[1].value,
      priority2_unit: weeklyPriorities.Priority2.unit,
      priority3_label: weeklyPriorities.Priority3.label,
      priority3_value: priorities[2].value,
      priority3_unit: weeklyPriorities.Priority3.unit,
      satisfaction: satisfaction,
      notes: notes
    };

    // Create timeout promise
    await interaction.deferReply({ ephemeral: true });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), 25000)
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

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
  console.error("❌ Script returned error:", result.error);
  await interaction.editReply({
    content: "❌ Script error: " + (result.error || "Unknown error"),
    ephemeral: true
  });
  return;
  }

    if (result.success) {
      const [firstLine, ...restOfMessage] = result.message.split('\n\n');
      const streakLine = `📈 **Current Streak**: ${result.currentStreak} days`;
      const fullMessage = [firstLine, streakLine, ...restOfMessage].join('\n\n');

      await interaction.editReply({
        content: fullMessage,
        flags: ['Ephemeral']
      });

      const logSummary = [
        '📝 **Daily Log Summary**',
        '',
        `• ${data.priority1_label}, ${data.priority1_value} ${data.priority1_unit}`,
        `• ${data.priority2_label}, ${data.priority2_value} ${data.priority2_unit}`,
        `• ${data.priority3_label}, ${data.priority3_value} ${data.priority3_unit}`,
        `• Satisfaction: ${data.satisfaction}/10`,
        '',
        `**Notes:**\n${data.notes}`
      ].join('\n');

      try {
        await interaction.user.send(logSummary);
      } catch (dmError) {
        console.error('Could not send log summary DM:', dmError);
        await interaction.followUp({
          content: "⚠️ I couldn't send you a DM with your log summary. To receive summaries, please:\n1. Right-click the server name\n2. Click 'Privacy Settings'\n3. Enable 'Direct Messages'",
          flags: ['Ephemeral']
        });
      }

      if (result.milestone) {
        await handleRoleUpdate(interaction, result.currentStreak, result);
      }

      if (result.milestone && result.roleInfo) {
        await interaction.channel.send(`🎊 ${interaction.user} has achieved ${result.roleInfo.name} status for ${result.currentStreak} consecutive days logged!`);
      } else {
        await interaction.channel.send(`🎯 ${interaction.user} just extended their daily logging streak!`);
      }

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
        flags: ['Ephemeral']
      });
    }

  } catch (err) {
    console.error('❌ Error in modal submission:', err);

    try {
      if (typeof response !== 'undefined' && response?.text) {
        const rawText = await response.text();
        if (rawText) console.error('❗ Raw response text:', rawText);
      }
    } catch (_) {}

    try {
  if (interaction.deferred) {
    await interaction.editReply({
      content: err.message === 'Request timed out'
        ? '❌ The request took too long. Please try again.'
        : '❌ There was an error sending your data. Please try again later.',
      flags: ['Ephemeral']
    });
  } else if (!interaction.replied) {
    await interaction.reply({
      content: err.message === 'Request timed out'
        ? '❌ The request took too long. Please try again.'
        : '❌ There was an error sending your data. Please try again later.',
      ephemeral: true
    });
  }
 } catch (fallbackError) {
  console.error('❌ Error sending fallback reply:', fallbackError);
 }
    return;
  }
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
          flags: ['Ephemeral']
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
        flags: ['Ephemeral']
      });
    }

    // Validate notes
    const notes = interaction.fields.getTextInputValue('notes');
    if (!notes || !notes.trim()) {
      return await interaction.reply({
        content: "❌ Notes field is required.",
        flags: ['Ephemeral']
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
      flags: ['Ephemeral']
    });
  } catch (error) {
    console.error('Error in test modal submission:', error);
    await interaction.reply({
      content: '❌ There was an error processing your test log. Please try again.',
      flags: ['Ephemeral']
    });
  }
  return;
}

// Modal submission handler
if (interaction.isModalSubmit() && interaction.customId === 'weeklyPriorities') {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Get and validate priorities
    const priorities = [];
    for (let i = 1; i <= 3; i++) {
      const input = interaction.fields.getTextInputValue(`priority${i}`).trim();
      
      // Check comma format
      if (!input.includes(',')) {
        await interaction.editReply({
          content: `❌ Priority ${i} must include a comma to separate the label and unit.\nExample: "Meditation, minutes"`,
          ephemeral: true
        });
        return;
      }

      // Split and trim
      const [label, unit] = input.split(',').map(part => part.trim());
      
      if (!label || !unit) {
        await interaction.editReply({
          content: `❌ Priority ${i} must have both a label and unit.\nExample: "Meditation, minutes"`,
          ephemeral: true
        });
        return;
      }

      priorities.push(input);
    }

    // Send to Google Apps Script
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'updateWeeklyPriorities',
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        priorities: priorities
      })
    });

    const result = await response.json();
    if (!result.success) {
  console.error("❌ Script returned error:", result.error);
  await interaction.editReply({
    content: "❌ Script error: " + (result.error || "Unknown error"),
    ephemeral: true
  });
  return;
  }

    if (result.success) {
      // Show confirmation
      const confirmationMessage = [
        '✅ Weekly priorities set!',
        '',
        'Your priorities:',
        ...priorities.map((p, i) => `${i + 1}. **${p}**`)
      ].join('\n');

      await interaction.editReply({
        content: confirmationMessage,
        ephemeral: true
      });
    } else {
      await interaction.editReply({
        content: `❌ ${result.error || 'Failed to set priorities. Please try again.'}`,
        ephemeral: true
      });
    }

  } catch (error) {
    console.error('Error in weekly priorities submission:', error);
    await interaction.editReply({
      content: '❌ An error occurred while saving your priorities. Please try again.',
      ephemeral: true
    });
  }
 }
}); // end of client.on(Events.InteractionCreate)

// Helper functions outside the interaction handler
async function handleRoleUpdate(interaction, streakCount, result) {
  try {
    const guild = interaction.guild;
    const member = interaction.member;
    
    // Get all existing streak roles from the user
    const existingRoles = member.roles.cache.filter(role => 
      role.tags?.botId === client.user.id  // Roles created by this bot
    );

    // Remove any existing streak roles
    for (const [_, role] of existingRoles) {
      await member.roles.remove(role.id);
    }

    // Create and assign the new role if roleInfo is provided
    if (result.roleInfo) {
      const newRole = await ensureRole(guild, result.roleInfo.name, result.roleInfo.color);
      await member.roles.add(newRole.id);
    }
  } catch (error) {
    console.error('Error in handleRoleUpdate:', error);
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

client.login(DISCORD_TOKEN).catch(err => {
  console.error('❌ Failed to login to Discord:', err);
  process.exit(1);
});
