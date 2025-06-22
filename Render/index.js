require('dotenv').config();
const {
  Client, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, Events, REST, Routes, SlashCommandBuilder,
  ButtonBuilder, ButtonStyle, MessageFlags, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder
} = require('discord.js');

const admin = require('firebase-admin');

// Correct way to load service account based on Render's environment
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON);
        if (serviceAccount && serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
          } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY_JSON:', e);
        // Consider how to handle this error: e.g., process.exit(1) or disable features that need admin
    }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // If you've set the GOOGLE_APPLICATION_CREDENTIALS env var to the path of the key file on Render
    // This is often a common pattern for Google Cloud services.
    // Firebase Admin SDK can pick it up automatically if the path is correct.
    console.log('Attempting to use GOOGLE_APPLICATION_CREDENTIALS for Firebase Admin.');
} else {
    console.error('Firebase Admin: Service account key JSON not found in env FIREBASE_SERVICE_ACCOUNT_KEY_JSON or GOOGLE_APPLICATION_CREDENTIALS not set. Admin features will be disabled.');
    // Consider how to handle this error
}

let dbAdmin; // Declare dbAdmin here so it's accessible

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            // Add your databaseURL if it's needed by other parts of your admin usage
            // or if you encounter issues without it. For Firestore, projectId from the key is usually enough.
            // databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
        });
        console.log("Firebase Admin SDK Initialized successfully using service account JSON.");
        dbAdmin = admin.firestore(); // Initialize dbAdmin here
    } catch (error) {
        console.error("Firebase Admin SDK Initialization Error with service account JSON:", error);
        // Consider how to handle this error
    }
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // This branch is for when GOOGLE_APPLICATION_CREDENTIALS is set, but FIREBASE_SERVICE_ACCOUNT_KEY_JSON is not.
    // The Admin SDK will attempt to use the credentials file pointed to by the env var.
    try {
        admin.initializeApp(); // No arguments needed if GOOGLE_APPLICATION_CREDENTIALS is set correctly
        console.log("Firebase Admin SDK Initialized successfully using GOOGLE_APPLICATION_CREDENTIALS.");
        dbAdmin = admin.firestore(); // Initialize dbAdmin here
    } catch (error) {
        console.error("Firebase Admin SDK Initialization Error with GOOGLE_APPLICATION_CREDENTIALS:", error);
        // Consider how to handle this error
    }
} else {
    // This 'else' corresponds to the initial check where neither env var was found
    console.warn("Firebase Admin SDK NOT Initialized - Firestore listener for stats notifications and other admin features will NOT work.");
}


// This map will temporarily hold the full stats report for a user navigating the paginated view.
// Key: userId, Value: { statsReportData, experimentId }
const userStatsReportData = new Map();


/**
 * Builds the embed fields for Page 1 (Core Statistics).
 * @param {EmbedBuilder} embed - The embed to add fields to.
 * @param {object} statsReportData - The full stats report data from Firestore.
 */
function buildCoreStatsPage(embed, statsReportData) {
    embed.setTitle('📊 Core Statistics (Page 1 of 3)');
    if (statsReportData.calculatedMetricStats && typeof statsReportData.calculatedMetricStats === 'object' && Object.keys(statsReportData.calculatedMetricStats).length > 0) {
        for (const metricKey in statsReportData.calculatedMetricStats) {
            const metric = statsReportData.calculatedMetricStats[metricKey];
            let fieldValue = '';

            if (metric.status === 'skipped_insufficient_data') {
                fieldValue = `*Not enough data (had ${metric.dataPoints}, needed 5).*`;
            } 
            // --- NEW: Yes/No Metric Handling ---
            else if (isYesNoMetric(metric.unit)) {
                const percentage = (metric.average * 100).toFixed(0);
                const completions = Math.round(metric.average * metric.dataPoints);
                fieldValue += `**Completion:** ${percentage}%\n`;
                fieldValue += `*Completed on ${completions} of ${metric.dataPoints} days.*`;
            } 
            // --- END: Yes/No Metric Handling ---
            else {
                // This is the original logic for all other metric types
                const unit = metric.unit ?
` ${metric.unit}` : '';
                const formatValue = (val) => (isTimeMetric(metric.unit) ? formatDecimalAsTime(val) : val);

                fieldValue += `**Avg:** ${formatValue(metric.average)}${unit}\n`;
                fieldValue += `**Median:** ${formatValue(metric.median)}${unit}\n`;
                fieldValue += `**Min:** ${formatValue(metric.min)}${unit}, **Max:** ${formatValue(metric.max)}${unit}\n`;

                const variation = metric.variationPercentage;
                let consistencyLabel = "Not enough data";
                if (variation !== undefined && variation !== null) {
                    if (variation < 20) {
                        consistencyLabel = `🟩 Consistent (${variation.toFixed(1)}%)`;
                    } else if (variation <= 35) {
                        consistencyLabel = `🟨 Moderate (${variation.toFixed(1)}%)`;
                    } else {
                        consistencyLabel = `🟧 Variable (${variation.toFixed(1)}%)`;
                    }
                }
                fieldValue += `**Consistency:** ${consistencyLabel}\n`;
                fieldValue += `**Data Points:** ${metric.dataPoints}`;
            }
            embed.addFields({ name: metric.label || metricKey, value: fieldValue, inline: true });
        }
    } else {
        embed.addFields({ name: 'Statistics', value: 'No core statistics were calculated for this report.', inline: false });
    }
}

/**
 * Builds the embed fields for Page 2 (Correlations/Impacts).
 * @param {EmbedBuilder} embed - The embed to add fields to.
 * @param {object} statsReportData - The full stats report data from Firestore.
 */
function buildCorrelationsPage(embed, statsReportData) {
    embed.setTitle('🔗 Habit Impacts (Page 2 of 3)')
         .setDescription('How did your daily habits influence your outcome?');

    if (statsReportData.correlations && typeof statsReportData.correlations === 'object' && Object.keys(statsReportData.correlations).length > 0) {
        for (const key in statsReportData.correlations) {
            const corr = statsReportData.correlations[key];
            if (!corr || corr.status !== 'calculated' || corr.coefficient === undefined || isNaN(corr.coefficient)) {
                embed.addFields({ name: `Impact of **${corr.label || key}**`, value: `*Not enough data to determine an impact.*`, inline: false });
                continue;
            }

            const rSquared = corr.coefficient * corr.coefficient;
            const direction = corr.coefficient >= 0 ? 'went up' : 'went down';
            const isConfident = corr.pValue !== null && corr.pValue < 0.05;
            const confidenceText = isConfident ? "We're 95% confident in this relationship." : "This may be worth getting more data to confirm.";

            let strengthText = "No detectable";
            let strengthEmoji = "🟦";
            const absCoeff = Math.abs(corr.coefficient);
            if (absCoeff >= 0.7) { strengthText = "Very Strong"; strengthEmoji = "🟥"; }
            else if (absCoeff >= 0.45) { strengthText = "Strong"; strengthEmoji = "🟧"; }
            else if (absCoeff >= 0.3) { strengthText = "Moderate"; strengthEmoji = "🟨"; }
            else if (absCoeff >= 0.15) { strengthText = "Weak"; strengthEmoji = "🟩"; }
            
            const value = `When you increased **${corr.label}**...\n...your **${corr.vsOutputLabel}** ${direction}.\n\n` +
                          `**Influence Strength:** ${strengthEmoji} ${strengthText} (${(rSquared * 100).toFixed(1)}%)\n` +
                          `*${confidenceText}*`;

            embed.addFields({ name: `Impact of **${corr.label}** on **${corr.vsOutputLabel}**`, value, inline: false });
        }
    } else {
        embed.addFields({ name: 'Impacts', value: 'No habit impact data was calculated for this report.', inline: false });
    }
}

/**
 * Builds the embed fields for Page 3 (Combined Effects).
 * @param {EmbedBuilder} embed - The embed to add fields to.
 * @param {object} statsReportData - The full stats report data from Firestore.
 */
function buildCombinedEffectsPage(embed, statsReportData) {
    embed.setTitle('🤝 Synergistic Effects (Page 3 of 3)')
         .setDescription('*Sometimes, habits work even better when you do them together.*');

    const results = statsReportData.pairwiseInteractionResults;
    let hasMeaningfulResults = false;

    if (results && typeof results === 'object' && Object.keys(results).length > 0) {
        for (const pairKey in results) {
            const pairData = results[pairKey];
            const summary = pairData.summary || "";
            const isSignificant = !summary.toLowerCase().includes("skipped") &&
                                  !summary.toLowerCase().includes("no meaningful conclusion") &&
                                  !summary.toLowerCase().includes("did not show any group");

            if (isSignificant && pairData.input1Label && pairData.input2Label) {
                hasMeaningfulResults = true;
                const bestGroup = summary.includes("higher") ? /Avg.*higher \(([\d.]+)\) when (.*) \(n=([\d]+)\)/.exec(summary) : null;
                const worstGroup = summary.includes("lower") ? /Avg.*lower \(([\d.]+)\) when (.*) \(n=([\d]+)\)/.exec(summary) : null;

                let value = "";
                if (bestGroup) {
                    value += `✅ **A Winning Combo!**\nYour **'${pairData.outputMetricLabel}'** was significantly **higher** (average of **${bestGroup[1]}**) on days when:\n*${bestGroup[2]}*.`;
                }
                if (worstGroup) {
                    if (value) value += "\n\n";
                    value += `❌ **A Losing Combo!**\nYour **'${pairData.outputMetricLabel}'** was significantly **lower** (average of **${worstGroup[1]}**) on days when:\n*${worstGroup[2]}*.`;
                }
                embed.addFields({ name: `**${pairData.input1Label}** + **${pairData.input2Label}**`, value: value, inline: false });
            }
        }
    }

    if (!hasMeaningfulResults) {
        embed.addFields({ name: 'No Clear Relationship', value: "No significant combined effects were found with the current data.", inline: false });
    }
}

// Configuration for each page of the stats report. Makes it easy to add more pages later.
const statsPageConfig = [
    { page: 1, builder: buildCoreStatsPage },
    { page: 2, builder: buildCorrelationsPage },
    { page: 3, builder: buildCombinedEffectsPage },
    // To add a new page (e.g., Lag Time Regression), just add an object here:
    // { page: 4, builder: buildLagTimeRegressionPage },
];

/**
 * Sends a specific page of the stats report to a user.
 * This is now called by the listener for the first page, and by button handlers for navigation.
 * @param {import('discord.js').Interaction | { user: import('discord.js').User }} interactionOrUser - The interaction object or a user object for the initial DM.
 * @param {string} userId - The user's ID.
 * @param {string} experimentId - The experiment's ID.
 * @param {number} targetPage - The page number to display.
 */
async function sendStatsPage(interactionOrUser, userId, experimentId, targetPage) {
    const isInteraction = 'update' in interactionOrUser;
    const user = isInteraction ? interactionOrUser.user : interactionOrUser;
    
    const reportInfo = userStatsReportData.get(userId);
    if (!reportInfo || !reportInfo.statsReportData) {
        const errorMessage = "Your stats report session has expired. Please request it again via the `/go` command.";
        if (isInteraction) await interactionOrUser.update({ content: errorMessage, embeds: [], components: [] });
        else await user.send(errorMessage);
        return;
    }

    const { statsReportData } = reportInfo;
    const totalPages = statsPageConfig.length;

    const pageConfig = statsPageConfig.find(p => p.page === targetPage);
    if (!pageConfig) {
        console.error(`[sendStatsPage] Invalid targetPage requested: ${targetPage}`);
        return;
    }

    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setFooter({ text: `Experiment ID: ${experimentId}` });

    // Call the builder function for the specific page
    pageConfig.builder(embed, statsReportData);

    // Build navigation buttons
    const row = new ActionRowBuilder();
    if (targetPage > 1) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`stats_nav_back_${experimentId}_${targetPage - 1}`)
                .setLabel('⬅️ Back')
                .setStyle(ButtonStyle.Secondary)
        );
    }
    if (targetPage < totalPages) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`stats_nav_next_${experimentId}_${targetPage + 1}`)
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Primary)
        );
    } else { // On the last page
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`stats_finish_${experimentId}`)
                .setLabel('✅ Finish & Get Summary')
                .setStyle(ButtonStyle.Success)
        );
    }
    
    // Send or update the message
    if (isInteraction) {
        await interactionOrUser.update({ embeds: [embed], components: [row] });
    } else {
        await user.send({ embeds: [embed], components: [row] });
    }
    console.log(`[sendStatsPage] Sent page ${targetPage} of stats report for experiment ${experimentId} to user ${userId}.`);
}


function setupStatsNotificationListener(client) {
  console.log("<<<<< NEW PAGINATED STATS LISTENER IS ACTIVE >>>>>");
  if (!admin.apps.length || !dbAdmin) {
      console.warn("Firebase Admin SDK not initialized. Stats notification listener will NOT run.");
      return;
  }

  const notificationsRef = dbAdmin.collection('pendingStatsNotifications');
  notificationsRef.where('status', '==', 'ready').onSnapshot(snapshot => {
      if (snapshot.empty) return;

      snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added' || change.type === 'modified') {
              const notification = change.doc.data();
              const docId = change.doc.id;
              const { userId, experimentId, userTag, statsDocumentId } = notification;
              console.log(`[StatsListener] Detected 'ready' notification for user ${userId}, experiment ${experimentId}.`);

              let discordUser;
              try {
                  discordUser = await client.users.fetch(userId);
              } catch (userFetchError) {
                  console.error(`[StatsListener] Failed to fetch Discord user ${userId} for stats. Doc ID: ${docId}:`, userFetchError);
                  await change.doc.ref.update({ status: 'error_user_not_found', processedAt: admin.firestore.FieldValue.serverTimestamp(), errorMessage: `Failed to fetch Discord user for stats: ${userFetchError.message}`.substring(0, 499) });
                  return;
              }

              if (!discordUser) {
                   console.error(`[StatsListener] Fetched Discord user is null for ID: ${userId}.`);
                   await change.doc.ref.update({ status: 'error_user_not_found', processedAt: admin.firestore.FieldValue.serverTimestamp(), errorMessage: 'Fetched Discord user was null.' });
                   return;
              }

              try {
                  const statsReportRef = dbAdmin.collection('users').doc(userId).collection('experimentStats').doc(statsDocumentId || experimentId);
                  const statsReportSnap = await statsReportRef.get();

                  if (statsReportSnap.exists) {
                      const statsReportData = statsReportSnap.data();
                      
                      // Store the full report data in the map for this user
                      userStatsReportData.set(userId, { statsReportData, experimentId: statsDocumentId || experimentId });

                      // Send the FIRST page of the report directly
                      await sendStatsPage(discordUser, userId, statsDocumentId || experimentId, 1);

                      // Mark the Firestore notification as processed
                      await change.doc.ref.update({
                          status: 'processed_by_bot',
                          processedAt: admin.firestore.FieldValue.serverTimestamp(),
                          botProcessingNode: process.env.RENDER_INSTANCE_ID || 'local_dev_stats'
                      });
                      console.log(`[StatsListener] Updated notification ${docId} to 'processed_by_bot'.`);

                  } else {
                      console.error(`[StatsListener] Stats report document not found for user ${userId}, experiment ${statsDocumentId || experimentId}.`);
                      await change.doc.ref.update({ status: 'error_report_not_found', processedAt: admin.firestore.FieldValue.serverTimestamp(), errorMessage: 'Stats report document could not be found in Firestore.' });
                  }
              } catch (error) {
                  console.error(`[StatsListener] Error processing notification ${docId} for user ${userId}:`, error);
                  await change.doc.ref.update({ status: 'error_processing_in_bot', processedAt: admin.firestore.FieldValue.serverTimestamp(), errorMessage: error.message });
              }
          }
      });
  }, err => {
      console.error("Error in 'pendingStatsNotifications' listener:", err);
  });
  console.log("Firestore listener for 'pendingStatsNotifications' is active.");
}

// In render index testing1.txt
// Add this function definition, for example, after setupStatsNotificationListener

function setupReminderDMsListener(client) {
  if (!admin.apps.length || !dbAdmin) {
    console.warn("Firebase Admin SDK not initialized. Reminder DMs listener will NOT run.");
    return;
  }

  console.log("Setting up Firestore listener for 'pendingReminderDMs'...");

  const remindersRef = dbAdmin.collection('pendingReminderDMs');
  remindersRef.where('status', '==', 'pending').onSnapshot(snapshot => {
    if (snapshot.empty) {
      // console.log("[ReminderListener] No pending reminder DMs found."); // Can be noisy
      return;
    }

    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'added' || (change.type === 'modified' && change.doc.data().status === 'pending')) {
        const reminderData = change.doc.data();
        const docId = change.doc.id; // Firestore document ID for this reminder task
        const { userId, userTag, messageToSend, experimentId } = reminderData;

        console.log(`[ReminderListener] Detected 'pending' reminder for user ${userId} (Tag: ${userTag || 'N/A'}), experiment ${experimentId || 'N/A'}. Doc ID: ${docId}`);

        try {
          const discordUser = await client.users.fetch(userId).catch(err => {
            console.error(`[ReminderListener] Failed to fetch Discord user ${userId} for reminder:`, err);
            return null;
          });

          if (discordUser) {
            await discordUser.send(messageToSend)
              .then(async () => {
                console.log(`[ReminderListener] Successfully sent reminder DM to user ${userId}.`);
                await change.doc.ref.update({
                  status: 'sent',
                  sentAt: admin.firestore.FieldValue.serverTimestamp(),
                  botProcessingNode: process.env.RENDER_INSTANCE_ID || 'unknown_render_instance'
                });
                console.log(`[ReminderListener] Updated reminder ${docId} to 'sent'.`);
              })
              .catch(async (dmError) => {
                console.error(`[ReminderListener] Failed to send reminder DM to user ${userId}:`, dmError);
                await change.doc.ref.update({
                  status: 'error_dm_failed',
                  processedAt: admin.firestore.FieldValue.serverTimestamp(),
                  errorMessage: dmError.message
                });
              });
          } else {
            console.warn(`[ReminderListener] Discord user ${userId} not found. Cannot send reminder DM.`);
            await change.doc.ref.update({
              status: 'error_user_not_found',
              processedAt: admin.firestore.FieldValue.serverTimestamp(),
              errorMessage: 'Discord user could not be fetched for reminder.'
            });
          }
        } catch (error) {
          console.error(`[ReminderListener] Error processing reminder notification ${docId} for user ${userId}:`, error);
          try {
            await change.doc.ref.update({
              status: 'error_processing_in_bot',
              processedAt: admin.firestore.FieldValue.serverTimestamp(),
              errorMessage: error.message,
              errorStack: error.stack // Optional for debugging
            });
          } catch (updateError) {
            console.error(`[ReminderListener] CRITICAL: Failed to update error status for reminder ${docId}:`, updateError);
          }
        }
      }
    });
  }, err => {
    console.error("[ReminderListener] Error in 'pendingReminderDMs' listener:", err);
    // Potentially re-initialize or alert
  });

  console.log("Firestore listener for 'pendingReminderDMs' is active.");
}

// ADD this entire new function to render/index.js.

/**
 * Listens for documents in the 'pendingPublicMessages' collection and posts them to the specified channel.
 * @param {import('discord.js').Client} client - The Discord client instance.
 */
function setupPublicMessageListener(client) {
    if (!dbAdmin) {
        console.warn("Firebase Admin SDK not initialized. Public message listener will NOT run.");
        return;
    }

    console.log("Setting up Firestore listener for 'pendingPublicMessages'...");

    const publicMessagesRef = dbAdmin.collection('pendingPublicMessages');
    publicMessagesRef.where('status', '==', 'pending').onSnapshot(snapshot => {
        if (snapshot.empty) {
            return;
        }

        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                const data = change.doc.data();
                const docId = change.doc.id;
                const { message, channelId, userId } = data;

                console.log(`[PublicMessageListener] Detected pending public message for user ${userId} in channel ${channelId}.`);

                try {
                    const channel = await client.channels.fetch(channelId);
                    if (channel && channel.isTextBased()) {
                        await channel.send(message);
                        console.log(`[PublicMessageListener] Successfully sent public message to channel ${channelId}.`);
                        // Mark as processed by deleting the document
                        await change.doc.ref.delete();
                    } else {
                        console.warn(`[PublicMessageListener] Channel ${channelId} not found or is not a text channel. Deleting job.`);
                        await change.doc.ref.delete(); // Delete to prevent retries
                    }
                } catch (error) {
                    console.error(`[PublicMessageListener] Error processing public message ${docId}:`, error);
                    // Update status to 'error' instead of deleting to allow for manual review
                    await change.doc.ref.update({ status: 'error', errorMessage: error.message });
                }
            }
        });
    }, err => {
        console.error("[PublicMessageListener] Error in 'pendingPublicMessages' listener:", err);
    });

    console.log("Firestore listener for 'pendingPublicMessages' is active.");
}

const { performance } = require('node:perf_hooks'); // Add this line
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const fs = require('fs').promises;
const path = require('path');

// Near the top of render index.txt
const { getAuth, signInWithCustomToken, getIdToken } = require("firebase/auth");

const userExperimentSetupData = new Map(); // To temporarily store data between modals


/**
 * Configuration for the AI-assisted experiment setup DM flow.
 * Each key is a `dmFlowState`, and the value contains:
 * - prompt: A function that returns the { content, embeds, components } for that step.
 * - fieldsToClear: An array of keys in `setupData` to delete when going BACK from a future step TO this one.
 */
const dmFlowConfig = {
  // Phase 2: Outcome Definition
  'awaiting_outcome_suggestion_selection': {
    fieldsToClear: ['outcome', 'inputs', 'aiGeneratedInputSuggestions'], // Clears everything from this phase onward
    prompt: (setupData) => {
      const outcomeLabelSelectMenu = new StringSelectMenuBuilder()
        .setCustomId('ai_outcome_select') // The handler for this will show the modal
        .setPlaceholder('Select an Outcome or write your own');

      outcomeLabelSelectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("✏️ Write my own from scratch")
          .setValue('write_my_own_outcome')
      );

      // BUG FIX: Check if suggestions exist before trying to loop
      if (setupData.aiGeneratedOutcomeSuggestions && Array.isArray(setupData.aiGeneratedOutcomeSuggestions)) {
        setupData.aiGeneratedOutcomeSuggestions.forEach((suggestion, index) => {
          // New display format: "Label (Goal Unit)"
          const displayLabel = `${suggestion.label} (${suggestion.goal} ${suggestion.unit})`;
          outcomeLabelSelectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(displayLabel.substring(0, 100))
              .setValue(`ai_outcome_suggestion_${index}`)
          );
        });
      }

      const content = `Here are 5 starting points for an outcome metric to support your wish. Select 1 to customize it, or write your own from scratch.`;
      const components = [new ActionRowBuilder().addComponents(outcomeLabelSelectMenu)];
      return { content, components };
    }
  },

  // This is a conceptual state. The modal is the prompt.
  // The 'back' button on the *next* step will point here.
  'awaiting_outcome_confirmation_modal': {
      fieldsToClear: ['outcome', 'inputs', 'aiGeneratedInputSuggestions'],
      prompt: () => {
        // This state is triggered by a selection, not a back button.
        // It's a placeholder for the back-button logic to know what to clear when leaving the *next* state.
        return {};
      }
  },
  
  // Phase 3: Habit Definition
  'awaiting_input1_suggestion_selection': {
    fieldsToClear: ['inputs', 'aiGeneratedInputSuggestions'],
    prompt: (setupData) => {
        const habitLabelSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('ai_input1_select') // New ID for habit 1
            .setPlaceholder('Select a Habit or write your own.');
        habitLabelSelectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("✏️ Write my own from scratch")
                .setValue('write_my_own_input1')
        );

        // BUG FIX: Check for suggestions array
        if (setupData.aiGeneratedInputSuggestions && Array.isArray(setupData.aiGeneratedInputSuggestions)) {
            setupData.aiGeneratedInputSuggestions.forEach((suggestion, index) => {
                const displayLabel = `${suggestion.label} (${suggestion.goal} ${suggestion.unit})`;
                habitLabelSelectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(displayLabel.substring(0, 100))
                        .setValue(`ai_input1_suggestion_${index}`)
                );
            });
        }
        
        const backButton = new ButtonBuilder()
            // Go back to the outcome dropdown. This effectively restarts the Outcome phase.
            .setCustomId('back_to:awaiting_outcome_suggestion_selection')
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary);

        const content = `Great! Here are some ideas for your first **Daily Habit** to test.`;
        const components = [
            new ActionRowBuilder().addComponents(habitLabelSelectMenu),
            new ActionRowBuilder().addComponents(backButton)
        ];
        return { content, components };
    }
  },

  'awaiting_habit_confirmation_modal': {
      fieldsToClear: ['inputs'],
       prompt: () => {
        return {};
      }
  },

 // START OF NEW SECTION TO ADD
  'awaiting_input2_suggestion_selection': {
    fieldsToClear: [], // Intentionally empty to preserve habit 1 when going back
    prompt: (setupData) => {
        const habitLabelSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('ai_input2_label_select') // For the 2nd habit
            .setPlaceholder('Select a Habit to edit or write your own.');
        habitLabelSelectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("✏️ Write my own from scratch")
                .setValue('custom_input2_label')
        );
        if (setupData.aiGeneratedInputSuggestions && Array.isArray(setupData.aiGeneratedInputSuggestions)) {
            setupData.aiGeneratedInputSuggestions.forEach((suggestion, index) => {
                const displayLabel = `${suggestion.label} (${suggestion.goal} ${suggestion.unit})`;
                habitLabelSelectMenu.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(displayLabel.substring(0, 100))
                        .setValue(`ai_input2_label_suggestion_${index}`)
                );
            });
        }
        
        const backButton = new ButtonBuilder()
            // Go back to the outcome confirmation modal step
            .setCustomId('back_to:awaiting_outcome_confirmation_modal')
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary);
        const content = `Let's define your **2nd Daily Habit** to test.`;
        const components = [
            new ActionRowBuilder().addComponents(habitLabelSelectMenu),
            new ActionRowBuilder().addComponents(backButton)
        ];
        return { content, components };
    }
  },

  'awaiting_habit_2_confirmation_modal': {
      fieldsToClear: ['inputs'], // This should now correctly target the state for habit 2
       prompt: () => {
        return {};
      }
  },
  // END OF NEW SECTION TO ADD

  'awaiting_final_confirmation': {
    fieldsToClear: [], // Nothing to clear when going back from the final summary
    prompt: (setupData) => {
        const formatGoalForDisplay = (goal, unit) => {
            const isTime = TIME_OF_DAY_KEYWORDS.includes(unit.toLowerCase().trim());
            return isTime ? formatDecimalAsTime(goal) : goal;
        };
        let summaryDescription = `**🌠 Deeper Wish:**\n${setupData.deeperProblem}\n\n` +
                              `**📊 Daily Outcome to Track:**\n\`${formatGoalForDisplay(setupData.outcome.goal, setupData.outcome.unit)}, ${setupData.outcome.unit}, ${setupData.outcome.label}\`\n\n` +
                              `**🛠️ Daily Habits to Test:**\n`;
        setupData.inputs.forEach((input, index) => {
            if (input && input.label) {
                summaryDescription += `${index + 1}. \`${formatGoalForDisplay(input.goal, input.unit)}, ${input.unit}, ${input.label}\`\n`;
            }
        });
        const confirmEmbed = new EmbedBuilder()
            .setColor('#FFBF00') // Amber
            .setTitle('🔬 Review Your Experiment Metrics')
            .setDescription(summaryDescription + "\n\nDoes this look correct? Click Confirm to save and proceed.");
        const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_metrics_proceed_btn')
            .setLabel('✅ Confirm, Next')
            .setStyle(ButtonStyle.Success);
        
        // Determine where the back button should go
        const lastHabitIndex = setupData.inputs.length;
        const backTargetState = `awaiting_input${lastHabitIndex}_suggestion_selection`;
        
        const backButton = new ButtonBuilder()
            .setCustomId(`back_to:${backTargetState}`)
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary);
            
        const row = new ActionRowBuilder().addComponents(backButton, confirmButton);
        return { embeds: [confirmEmbed], components: [row] };
    }
  }
};

/**
 * Formats a decimal number representing hours into a 12-hour clock format (e.g., 8.5 -> "8:30 AM").
 * @param {number | null} decimalHours - The decimal time to format.
 * @returns {string} The formatted time string or 'N/A'.
 */
function formatDecimalAsTime(decimalHours) {
    if (isNaN(decimalHours) || decimalHours === null) return 'N/A';
    decimalHours = decimalHours % 24; // Handle values >= 24 from shifted calculations
    let hours = Math.floor(decimalHours) % 24;
    const minutesFraction = decimalHours - Math.floor(decimalHours);
    let minutes = Math.round(minutesFraction * 60);
    const paddedMinutes = minutes < 10 ? '0' + minutes : String(minutes);
    const period = hours >= 12 ? 'PM' : 'AM';
    if (hours > 12) { hours -= 12; }
    else if (hours === 0) { hours = 12; } // 0 hour is 12 AM
    return `${hours}:${paddedMinutes} ${period}`;
}

/**
 * Checks if a metric's unit suggests it's a binary yes/no or completion task.
 * @param {string | null} unit - The unit string from the metric.
 * @returns {boolean} True if the unit is considered a yes/no type.
 */
function isYesNoMetric(unit) {
    if (!unit) return false;

    const yesNoKeywords = [
        'yes/no',
        'yes / no',
        'y/n',
        'completion',
        'complete',
        'done',
        'complete/incomplete',
        'pass/fail',
        'did/didn\'t',
        'did/not',
        'binary',
        'true/false',
        'check',
        'yes or no',
        'done/not done',
        '1/0',
        '1 or 0',
        'y / n'
    ];

    const lowerUnit = unit.toLowerCase().trim();
    return yesNoKeywords.includes(lowerUnit);
}

/**
 * Parses a flexible time string (e.g., "8pm", "22:30", "8:30") into decimal hours.
 * @param {string} timeStr - The time string to parse.
 * @returns {number | null} The time as a decimal number (e.g., 20.5) or null if invalid.
 */
function parseTimeGoal(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;

    const lowerTimeStr = timeStr.toLowerCase().trim();
    // Regex to capture hours, optional minutes, and optional am/pm
    // Supports formats like: 8pm, 8 pm, 8:30pm, 8:30 pm, 22:30
    const match = lowerTimeStr.match(/^(\d{1,2})[:\.]?(\d{2})?\s*(am|pm)?$/);

    if (!match) return null;

    let [, hours, minutes, period] = match;
    let h = parseInt(hours, 10);
    const m = minutes ? parseInt(minutes, 10) : 0;

    if (isNaN(h) || isNaN(m) || h > 23 || m > 59) return null;

    if (period) { // 12-hour format with am/pm
        if (h > 12 || h === 0) return null; // e.g., "13pm" or "0am" is invalid in this context
        if (period === 'pm' && h < 12) {
            h += 12;
        } else if (period === 'am' && h === 12) { // Midnight case "12am"
            h = 0;
        }
    }
    // For 24-hour format (no period), h is already correct.

    return h + (m / 60);
}

// In render/index.js, after the parseTimeGoal function

/**
 * Parses a goal string that can be a number, 'yes', or 'no'.
 * @param {string} goalStr The goal string from the modal input.
 * @returns {{goal: number | null, error: string | null}} Parsed goal or an error object.
 */
function parseGoalValue(goalStr) {
  if (!goalStr || typeof goalStr !== 'string') {
    return { goal: null, error: "The Target cannot be empty." };
  }
  const lowerGoalStr = goalStr.trim().toLowerCase();
  if (lowerGoalStr === 'yes') {
    return { goal: 1, error: null };
  }
  if (lowerGoalStr === 'no') {
    return { goal: 0, error: null };
  }
  const num = parseFloat(goalStr);
  if (isNaN(num)) {
    return { goal: null, error: `The Target ("${goalStr}") must be a valid number, 'yes', or 'no'.` };
  }
  if (num < 0) {
    return { goal: null, error: "The Target Number must be 0 or a positive number." };
  }
  return { goal: num, error: null };
}

/**
 * Manages the sequential flow for logging time-based metrics.
 * It either prompts for the next time metric or shows a button to open the final modal.
 * @param {import('discord.js').Interaction} interaction - The interaction to reply to or update.
 * @param {string} userId - The ID of the user.
 */
async function sendNextTimeLogPrompt(interaction, userId) {
  const setupData = userExperimentSetupData.get(userId);
  if (!setupData || !setupData.logFlowSettings) {
    console.error(`[sendNextTimeLogPrompt] Critical: Missing setupData or logFlowSettings for ${userId}.`);
    // Use editReply since the interaction is already deferred
    await interaction.editReply({ content: "Error: Your logging session has expired or is invalid. Please start again with `/go`.", components: [], embeds: [] });
    return;
  }

  const { logFlowTimeMetrics = [], logFlowSettings = {} } = setupData;
  const timeLogIndex = setupData.timeLogIndex || 0;

  if (timeLogIndex < logFlowTimeMetrics.length) {
    // --- There are more time metrics to log ---
    const currentMetric = logFlowTimeMetrics[timeLogIndex];
    console.log(`[sendNextTimeLogPrompt] Prompting user ${userId} for time metric ${timeLogIndex + 1}/${logFlowTimeMetrics.length}: "${currentMetric.label}"`);

    const stepIndicator = `(Step ${timeLogIndex + 1} of ${logFlowTimeMetrics.length})`;
    const timeEmbed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle(`🕰️ Log Time for: ${currentMetric.label}`)
      .setDescription(`Please select the time you are logging for this specific metric. ${stepIndicator}`)
      .setFooter({ text: 'Make your selection, then click Next.' });

    const timeHourSelect = new StringSelectMenuBuilder().setCustomId(LOG_TIME_SELECT_H_ID).setPlaceholder('Select the HOUR').addOptions(Array.from({ length: 12 }, (_, i) => new StringSelectMenuOptionBuilder().setLabel(String(i + 1)).setValue(String(i + 1))));
    const timeMinuteSelect = new StringSelectMenuBuilder().setCustomId(LOG_TIME_SELECT_M_ID).setPlaceholder('Select the MINUTE').addOptions(
      new StringSelectMenuOptionBuilder().setLabel(':00').setValue('00'),
      new StringSelectMenuOptionBuilder().setLabel(':05').setValue('05'),
      new StringSelectMenuOptionBuilder().setLabel(':10').setValue('10'),
      new StringSelectMenuOptionBuilder().setLabel(':15').setValue('15'),
      new StringSelectMenuOptionBuilder().setLabel(':20').setValue('20'),
      new StringSelectMenuOptionBuilder().setLabel(':25').setValue('25'),
      new StringSelectMenuOptionBuilder().setLabel(':30').setValue('30'),
      new StringSelectMenuOptionBuilder().setLabel(':35').setValue('35'),
      new StringSelectMenuOptionBuilder().setLabel(':40').setValue('40'),
      new StringSelectMenuOptionBuilder().setLabel(':45').setValue('45'),
      new StringSelectMenuOptionBuilder().setLabel(':50').setValue('50'),
      new StringSelectMenuOptionBuilder().setLabel(':55').setValue('55')
    );
    
    
    const timeAmPmSelect = new StringSelectMenuBuilder().setCustomId(LOG_TIME_SELECT_AP_ID).setPlaceholder('Select AM or PM').addOptions(new StringSelectMenuOptionBuilder().setLabel('AM').setValue('AM'), new StringSelectMenuOptionBuilder().setLabel('PM').setValue('PM'));
    const nextButton = new ButtonBuilder().setCustomId(LOG_TIME_NEXT_BTN_ID).setLabel('Next →').setStyle(ButtonStyle.Primary);

    await interaction.editReply({
      embeds: [timeEmbed],
      components: [
        new ActionRowBuilder().addComponents(timeHourSelect),
        new ActionRowBuilder().addComponents(timeMinuteSelect),
        new ActionRowBuilder().addComponents(timeAmPmSelect),
        new ActionRowBuilder().addComponents(nextButton)
      ]
    });
  } else {
    // --- All time metrics are logged. Show a button to open the final modal. ---
    console.log(`[sendNextTimeLogPrompt] All ${logFlowTimeMetrics.length} time metrics logged for ${userId}. Prompting to open final modal.`);
    
    const finalButton = new ButtonBuilder()
        .setCustomId('continue_to_final_log_btn') // New Custom ID
        .setLabel('✍️ Continue to Final Step')
        .setStyle(ButtonStyle.Success);

    await interaction.editReply({
        content: "---\n---\n\nClick below to log your remaining metrics and notes.",
        embeds: [],
        components: [new ActionRowBuilder().addComponents(finalButton)]
    });
  }
}

// ====== ENVIRONMENT VARIABLES ======
const APPLICATION_ID = process.env.APPLICATION_ID;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const SCRIPT_URL = process.env.SCRIPT_URL;

// Add this block after your initial require statements

const { initializeApp } = require("firebase/app");
const { getFunctions, httpsCallable } = require("firebase/functions"); // Ensure this is imported

const inspirationalMessages = [
  "Congratulations on recording your metrics! 🎊",
  "Notice how you feel as if it's the first time you've ever felt this way.",
  "Amazing work logging your progress! 🌟",
  "Each moment of awareness builds a bridge to deeper understanding.",
  "Thank you for sharing your ratings! 🙏",
  "Every data point tells a story of growth.\nWhat passage did you write today?",
  "Thank you for your forward steps! 💫",
  "Like footprints in the sand, each entry marks your path.",
  "Beautiful reflection! 🌅",
  "In the quiet space between thoughts,\nwisdom grows like mushrooms.",
  "You've noted your progress! 🍃",
  "May your awareness move with grace.",
  "What a mindful moment! 🕊️",
  "In measuring our days,\nwe live bigger lives.",
  "Thanks for dotting this data point! 🌈\n\nEach rating is a window\ninto the landscape of your experience.",
  "You care courageously!",
  "Watch how your awareness grows 🌺\nlike garden seeds planted with intention.",
  "You've planted your daily marker!",
  "Your efforts are like a constellation ⭐\neach point shining with possibility.",
  "Reflection reflected! 🌙",
  "The gentle rhythm of daily practice,\nshows our deepest insights.",
  "Progress snapshot captured!",
  "🦋Like a butterfly's flap,\nyour growth can change the weather.",
  "What mindful metrics! 🎯\n\nYou've earned this moment of reflection.",
  "Like morning dew on grass,\nmay your insights meet the morning sun.",
  "A moment of truth! 🔮",
  "Self-reflection is a mirror.\nWhat clarity do you see today?",
  "Each mindful pause creates space\nfor deeper understanding to emerge.",
  "You've written today's sentence! 📖\n\nWhat themes are surfacing\nin the story of your growth?",
  "That reflection is rippling!",
  "Like stones thrown in water 💧\nyour awareness creates waves.",
  "Illumination! 🌠",
  "In the darkness of uncertainty,\neach data point is a star to guide us home 🕯️",
  "Mindful milestone marked!",
  "Behind the ups and downs 🎭,\nwhat truth is revealing itself to you?",
  "You're amazing! \n\nYou know that?\nYOU ARE AMAZING!",
  "Nothing great was ever done but in little steps.",
  "Your life is bigger than it seems. \nToday made a difference.",
  "Consistency is the glue of growth. \nIncremental progress is all it takes!",
  "Don't be surprised when good things happen \n\nYou're putting in the work!"
];

const experimentSetupMotivationalMessages = [
  "🎉 Awesome! Your new experiment is locked in. Daily logging is your renewable fuel!",
  "✨ Experiment set! Remember, every small step contributes to big discoveries and improvements.",
  "🚀 You're all set to explore! What insights will this next phase bring? Excited for you!",
  "🎯 New experiment configured! This is your lab, and you're the lead scientist. Go get that data!",
  "🌟 Great job setting up your experiment! Embrace the process and deep learning ahead."
];

const FREEZE_ROLE_BASENAME = '❄️ Freezes';
const STREAK_MILESTONE_ROLE_NAMES = [
  'Level 1', 'Level 15', 'Level 30', 'Level 60', 'Level 100',
  'Level 150', 'Level 200', 'Level 250', 'Level 300', 'Level Kronos',
  'Level 400', 'Level 450', 'Level 500', 'Level 550', 'Level 600',
  'Level 650', 'Level 700', 'Level Biennium', 'Level 750', 'Level 800',
  'Level 850', 'Level 900', 'Level 950', 'Level 1000'
];

// render index.txt - Near the top with other constants

// Predefined Unit Suggestions with Labels and Descriptions
const PREDEFINED_OUTCOME_UNIT_SUGGESTIONS = [
    { label: 'out of 10', description: '0-10 scale. E.g. for self-confidence, satisfaction, mood.' },
    { label: 'Time of Day', description: 'E.g. for tracking mealtimes, bedtimes, etc.' },
    { label: '% growth', description: 'E.g. for tracking strength gains, income, or followers (no negative #s).' },
    { label: 'Compared to yesterday', description: '0=much Worse, 5=same, 10=much Better.' }
];

const PREDEFINED_HABIT_UNIT_SUGGESTIONS = [
    { label: 'Reps', description: 'Good for repeated actions like exercises or cold calls' },
    { label: 'Time of Day', description: 'Track when you do something (e.g., wake-up time, lunch, start of work)' },
    { label: 'Minutes', description: 'For tracking "sessions", e.g. meditation, exercise, deep work.' },
    { label: 'Times', description: 'How often it happens (e.g., breaks taken, distractions, check-ins' },
    { label: 'Tasks done', description: 'Checklist items completed, e.g. morning routine or to-do list.' },
    { label: '% done', description: 'Estimate how much of a task or habit you completed today (0-100%).' }
];

// --- Custom IDs for Time-based Metric Logging ---
const LOG_TIME_SELECT_H_ID = 'log_time_select_h';
const LOG_TIME_SELECT_M_ID = 'log_time_select_m';
const LOG_TIME_SELECT_AP_ID = 'log_time_select_ap';
const LOG_TIME_NEXT_BTN_ID = 'log_time_next_btn';

// --- Keywords for detecting Time of Day units ---
// This list is used to flexibly identify when a user-entered UNIT
// should trigger the special time-picker UI. It is checked case-insensitively.
const TIME_OF_DAY_KEYWORDS = [
    'time of day',      // The primary, explicit unit
    'clock time',       // A common alternative
    'specific time',
    'exact time',
    "o'clock",          // e.g., for a goal of "8 o'clock"
    'oclock',           // Common misspelling
    'o clock',          // Common variant
    'am/pm',            // Indicates a 12-hour clock time
    'a.m./p.m.',
    'am',
    'pm',
    'a.m.',
    'p.m.',
    'am.',
    'pm.'
];

// --- New Custom IDs for AI-Assisted Experiment Setup Time Targets ---
const EXP_SETUP_OUTCOME_H_ID = 'exp_setup_outcome_h';
const EXP_SETUP_OUTCOME_M_ID = 'exp_setup_outcome_m';
const EXP_SETUP_OUTCOME_AP_ID = 'exp_setup_outcome_ap';
const CONFIRM_OUTCOME_TARGET_TIME_BTN_ID = 'confirm_outcome_target_time_btn';

const EXP_SETUP_INPUT_H_ID = 'exp_setup_input_h';
const EXP_SETUP_INPUT_M_ID = 'exp_setup_input_m';
const EXP_SETUP_INPUT_AP_ID = 'exp_setup_input_ap';
const CONFIRM_INPUT_TARGET_TIME_BTN_ID = 'confirm_input_target_time_btn';

// These Custom IDs remain the same from our previous discussion
const OUTCOME_UNIT_SELECT_ID = 'outcome_unit_select';
const INPUT_UNIT_SELECT_ID_PREFIX = 'input_unit_select_'; // e.g., input_unit_select_1
const CUSTOM_UNIT_OPTION_VALUE = 'custom_unit_selected_option'; // Value for "Enter my own..."

// --- New Custom IDs for Reminder Setup ---
const REMINDER_SELECT_START_HOUR_ID = 'reminder_select_start_hour';
const REMINDER_SELECT_END_HOUR_ID = 'reminder_select_end_hour';
const REMINDER_SELECT_FREQUENCY_ID = 'reminder_select_frequency';
const REMINDER_SELECT_TIME_H_ID = 'reminder_select_time_h';
const REMINDER_SELECT_TIME_M_ID = 'reminder_select_time_m';
const REMINDER_SELECT_TIME_AP_ID = 'reminder_select_time_ap';
const CONFIRM_REMINDER_BTN_ID = 'confirm_reminder_btn';
const REMINDERS_SET_TIME_NEXT_BTN_ID = 'reminders_set_time_next_btn';

// --- New Custom IDs for Experiment Setup Choice ---
const AI_ASSISTED_SETUP_BTN_ID = 'ai_assisted_setup_btn';
const MANUAL_SETUP_BTN_ID = 'manual_setup_btn';

// ====== FIREBASE CLIENT CONFIGURATION ======
// Load config from .env file
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID // Optional
};

// ===== ADD THIS LOGGING BLOCK =====
console.log("--- Firebase Config Check ---");
console.log("API Key Loaded:", !!process.env.FIREBASE_API_KEY);
console.log("Auth Domain Loaded:", !!process.env.FIREBASE_AUTH_DOMAIN);
console.log("Project ID Loaded:", !!process.env.FIREBASE_PROJECT_ID);
// Log the actual values to be sure, but be mindful if sharing logs later
console.log("Using Project ID:", process.env.FIREBASE_PROJECT_ID);
console.log("Using API Key:", process.env.FIREBASE_API_KEY ? process.env.FIREBASE_API_KEY.substring(0, 5) + '...' : 'MISSING'); // Log start of API key
console.log("Full Config Object being used:", JSON.stringify(firebaseConfig, null, 2));
console.log("-----------------------------");
// ===== END LOGGING BLOCK =====

// Check if all required config values are present
const requiredConfigKeys = ['apiKey', 'authDomain', 'projectId', 'FIREBASE_FUNC_URL_GET_TOKEN']; // Added function URL check
const missingKeys = requiredConfigKeys.filter(key => !process.env[key] && !firebaseConfig[key]); // Check process.env directly too for URL

let firebaseApp;
let firebaseAuth;
let firebaseFunctions;

if (missingKeys.length > 0) {
  console.warn(`⚠️ Firebase client or function URL configuration incomplete. Missing keys in .env: ${missingKeys.join(', ')}. Firebase features may fail.`);
} else {
  try {
    // Initialize Firebase Client App
    firebaseApp = initializeApp(firebaseConfig);
    firebaseAuth = getAuth(firebaseApp); // Get Auth instance
    firebaseFunctions = getFunctions(firebaseApp); // Get Functions instance (uses default region)
    // Optional: Specify region if your functions aren't in us-central1
    // firebaseFunctions = getFunctions(firebaseApp, 'your-region');
    console.log("Firebase Client App Initialized.");
  } catch (error) {
    console.error("❌ Failed to initialize Firebase Client App:", error);
    // Consider exiting if Firebase is critical
    // process.exit(1);
  }
}

// ====== Corrected Helper Function for Firebase Authentication =====
// Fetches custom token via HTTPS and signs in user with Firebase client SDK
async function authenticateFirebaseUser(userId) {
  // Ensure auth client is initialized and function URL is present
  const functionUrl = process.env.FIREBASE_FUNC_URL_GET_TOKEN;
  if (!firebaseAuth || !functionUrl) {
      console.error("Firebase auth not initialized or FIREBASE_FUNC_URL_GET_TOKEN missing in .env.");
      throw new Error("Firebase client auth/config not ready.");
  }

  // Use node-fetch v3 syntax correctly - scoped import
  const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
  let customTokenResponse;

  try {
      // STEP 1: Directly fetch the custom token using the Function URL
      console.log(`Requesting custom token for userId: ${userId} directly from ${functionUrl}`);
      customTokenResponse = await fetch(functionUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // v2 onCall expects data wrapped in { data: ... }
          body: JSON.stringify({ data: { userId: userId } })
      });

      // Check if the fetch itself was successful
      if (!customTokenResponse.ok) {
          const errorText = await customTokenResponse.text();
          console.error(`Error fetching custom token directly: ${customTokenResponse.status}`, errorText);
          // Throw the specific error text if available
          throw new Error(`Failed to fetch custom token (${customTokenResponse.status}): ${errorText}`);
      }

      // Parse the JSON response
      const tokenResult = await customTokenResponse.json();

      // v2 onCall wraps the actual return value in { "result": ... }
      const customToken = tokenResult.result?.token;

      if (!customToken) {
        console.error("Custom token missing from direct function response:", JSON.stringify(tokenResult));
        throw new Error('Custom token was not returned from the getFirebaseAuthToken function.');
      }
      // console.log(`Custom token received directly for user ${userId}.`); // Optional log

      // STEP 2: Sign in with Custom Token using the Firebase client SDK
      // console.log(`Signing in user ${userId} with custom token...`); // Optional log
      await signInWithCustomToken(firebaseAuth, customToken);
      // console.log(`User ${userId} signed in successfully to Firebase client.`); // Optional log

      // No need to return anything, the auth state is handled by the SDK instance

  } catch (error) {
    console.error(`Firebase authentication process failed for user ${userId}:`, error);
    // Re-throw error to be caught by callFirebaseFunction or command handler
    throw new Error(`Firebase authentication failed: ${error.message || error}`);
  }
}

// ===== Helper Function for Calling Firebase Callable Functions ====
// Wraps authentication and the function call
async function callFirebaseFunction(functionName, data = {}, userId) {
    // Ensure Functions client is initialized
    if (!firebaseFunctions) {
        console.error("Firebase Functions client not initialized. Cannot call function.");
        // Throw an error that can be caught by the command handler
        throw new Error("Firebase connection not ready. Please try again later.");
    }
    try {
        // Ensure user is authenticated for this specific call
        // authenticateFirebaseUser handles logging and throws errors on failure
        await authenticateFirebaseUser(userId);

        console.log(`Calling Firebase function: ${functionName} by user ${userId} with data:`, data);
        // Get a reference to the callable function
        const func = httpsCallable(firebaseFunctions, functionName);
        // Call the function with the provided data payload
        const result = await func(data);
        console.log(`Received response from ${functionName} for user ${userId}.`); // Don't log result.data here as it might be large/sensitive

        // Callable functions return the result in the 'data' property of the response object
        return result.data;

    } catch (error) {
        console.error(`Error calling Firebase function ${functionName} for user ${userId}:`, error);
        // Check if it's a Firebase Functions error object (which includes code/message)
        if (error.code && error.message) {
             // Re-throw with a cleaner message for the user-facing error handler
             throw new Error(`Firebase Error (${error.code}): ${error.message}`);
        }
        // Re-throw other types of errors (e.g., network errors, auth errors from helper)
        throw error;
    }
}

/**
 * Shows an ephemeral message asking the user if they want to post publicly.
 * The summary DM is now sent *after* they make a choice.
 * @param {import('discord.js').Interaction} interaction - The interaction to reply to (usually Button or ModalSubmit)
 * @param {object} setupData - The data stored in userExperimentSetupData
 */
async function showPostToGroupPrompt(interaction, setupData) {
  // --- Show Ephemeral "Post to group?" Buttons ---
  const postToGroupButtons = new ActionRowBuilder()
      .addComponents(
          new ButtonBuilder().setCustomId('post_exp_final_yes').setLabel('📣 Yes, Post It!').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('post_exp_final_no').setLabel('🤫 No, Keep Private').setStyle(ButtonStyle.Secondary)
      );
  try {
       // Check if we can editReply (it should be possible as the interaction was deferred/updated)
       if (interaction.replied || interaction.deferred) {
            await interaction.editReply({
               content: "✨ Your experiment is fully configured!\n\nShare your commitment with the #experiments channel?\n\n*(I'll send you a DM with your setup summary after you choose.)*",
               components: [postToGroupButtons],
               embeds: [] // Clear any previous ephemeral embeds
           });
           console.log(`[showPostToGroupPrompt ${interaction.id}] Edited reply with post-to-group prompt.`);
       } else {
            // Fallback if somehow the interaction wasn't replied/deferred (less likely)
            await interaction.reply({
                content: "✨ Your experiment is fully configured!\n\nShare your commitment with the #experiments channel?\n\n*(I'll send you a DM with your setup summary after you choose.)*",
                components: [postToGroupButtons],
                flags: MessageFlags.Ephemeral
            });
           console.log(`[showPostToGroupPrompt ${interaction.id}] Replied with post-to-group prompt (fallback).`);
       }
  } catch (promptError) {
       console.error(`[showPostToGroupPrompt ${interaction.id}] Error showing post-to-group prompt:`, promptError);
       try {
           await interaction.followUp({
               content: "✨ Experiment configured! Failed to show post prompt buttons.",
               flags: MessageFlags.Ephemeral
           });
       } catch (followUpError) {
           console.error(`[showPostToGroupPrompt ${interaction.id}] Error sending follow-up error message:`, followUpError);
       }
  }
  // Note: userExperimentSetupData cleanup happens *after* the Yes/No buttons are handled.
}

/**
 * Sends the final experiment summary DM to the user.
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @param {object} setupData - The data stored in userExperimentSetupData.
 */
async function sendFinalSummaryDM(interaction, setupData) {
    console.log(`[sendFinalSummaryDM ${interaction.id}] Preparing to send final summary DM to ${interaction.user.tag}`);
    if (!setupData) {
        console.error(`[sendFinalSummaryDM ${interaction.id}] setupData is missing.`);
        return; // Can't send without data
    }

    const randomMotivationalMessage = experimentSetupMotivationalMessages[Math.floor(Math.random() * experimentSetupMotivationalMessages.length)];
    const dmEmbed = new EmbedBuilder()
      .setColor('#57F287') // Green for success
      .setTitle('🎉 Experiment Setup Complete! 🎉')
      .setDescription(`${randomMotivationalMessage}\n\nHere's the final summary of your new experiment. Good luck!`)
      .addFields(
          { name: '🎯 Deeper Wish', value: setupData.deeperProblem || 'Not specified' },
          { name: '📋 Settings', value: `Outcome: "${setupData.outputLabel}"\nHabit 1: "${setupData.input1Label}"${setupData.input2Label ? `\nHabit 2: "${setupData.input2Label}"`:''}${setupData.input3Label ? `\nHabit 3: "${setupData.input3Label}"`:''}` },
          { name: '🗓️ Experiment Duration', value: `${setupData.experimentDuration.replace('_', ' ')} (Stats report interval)` },
          { name: '⏰ Reminders', value: setupData.reminderSummary || 'Reminder status not recorded.' } // Use stored summary
      )
     .setFooter({ text: `User: ${interaction.user.tag}`})
     .setTimestamp();

    try {
      await interaction.user.send({ embeds: [dmEmbed] });
      console.log(`[sendFinalSummaryDM ${interaction.id}] Sent final summary DM to ${interaction.user.tag}`);
    } catch (dmError) {
      console.error(`[sendFinalSummaryDM ${interaction.id}] Failed to send DM confirmation to ${interaction.user.tag}:`, dmError);
      // Re-throw the error so the calling button handler can be aware of the failure.
      throw dmError;
    }
}

/**
 * Asynchronously sends a DM with the user's logged data and notes.
 * @param {import('discord.js').Interaction} interaction - The interaction object to get the user from.
 * @param {object | null} aiResponse - The AI response object (used only to determine if notes existed).
 * @param {object} settings - The user's experiment settings.
 * @param {object} payload - The submitted log data, including notes and values.
 */
async function sendAppreciationDM(interaction, aiResponse, settings, payload) {
  try {
    const dmEmbed = new EmbedBuilder()
      .setColor(0x3498DB) // A nice blue
      .setTitle("✨ Daily Log Summary ✨")
      .setFooter({ text: "This is a private copy of your log entry." });

    // Set the embed's main text to be the user's notes.
    if (payload.notes && payload.notes.trim() !== "") {
      dmEmbed.setDescription(payload.notes);
    } else {
      dmEmbed.setDescription("*No notes were provided for this log.*");
    }

    // Add the logged numerical data as fields
    const loggedMetrics = [];
    if (settings.output) {
        loggedMetrics.push({
            label: settings.output.label,
            unit: settings.output.unit,
            value: payload.outputValue
        });
    }
    for (let i = 0; i < 3; i++) {
        if (settings[`input${i + 1}`] && payload.inputValues[i]) {
            loggedMetrics.push({
                label: settings[`input${i + 1}`].label,
                unit: settings[`input${i + 1}`].unit,
                value: payload.inputValues[i]
            });
        }
    }
    
            // 1. Build a single description string that INCLUDES the header.
            let newDescription = payload.notes && payload.notes.trim() !== "" 
                ? payload.notes.trim() 
                : "*No notes were provided for this log.*";

            if (loggedMetrics.length > 0) {
                // Add two newlines for a clean break, then add the bolded header.
                newDescription += `\n\n**Logged Data**`; 
            }

            dmEmbed.setDescription(newDescription);

            // 2. Now, ONLY add the fields for the actual metrics. Do NOT add the separate header field.
            if (loggedMetrics.length > 0) {
                loggedMetrics.forEach(metric => {
                    if (metric.label) {
                        dmEmbed.addFields({ name: `${metric.label} (${metric.unit})`, value: `${metric.value}`, inline: true });
                    }
                });
            }


    await interaction.user.send({ embeds: [dmEmbed] });
    console.log(`[sendAppreciationDM] Successfully sent log summary DM to ${interaction.user.tag}.`);

  } catch (error) {
    if (error.code === 50007) { // Cannot send messages to this user
      console.warn(`[sendAppreciationDM] Could not send log summary DM to ${interaction.user.tag} (DMs likely disabled).`);
    } else {
      console.error(`[sendAppreciationDM] Error sending log summary DM to ${interaction.user.tag}:`, error);
    }
  }
}

// In render/index.js, add this entire new function.
// A good place is after the sendAppreciationDM function.

/**
 * Checks for and executes pending actions for a user from Firestore,
 * such as sending DMs or updating roles, then clears the pending flags.
 * @param {import('discord.js').Interaction} interaction - The interaction object, used to get guild and member info.
 * @param {string} userId - The ID of the user to process actions for.
 */
async function processPendingActions(interaction, userId) {
    const guild = interaction.guild;
    const member = interaction.member;

    // Ensure we have the necessary guild and member objects to manage roles.
    if (!guild || !member) {
        console.error(`[processPendingActions] Could not find Guild or Member for user ${userId}. Cannot process role updates.`);
        return;
    }

    console.log(`[processPendingActions] Starting to process pending actions for user ${userId} in guild ${guild.name}.`);

    try {
        // Step 1: Fetch the latest user data, including any pending action flags.
        const result = await callFirebaseFunction('getUserDataForBot', {}, userId);
        if (!result || !result.success || !result.userData) {
            console.error(`[processPendingActions] Failed to get user data for ${userId}. Aborting.`);
            return;
        }

        const {
            pendingDmMessage,
            pendingRoleUpdate,
            pendingFreezeRoleUpdate,
            pendingRoleCleanup
        } = result.userData;

        let actionsProcessed = false;

        // Step 2: Process pending DMs.
        if (pendingDmMessage) {
            actionsProcessed = true;
            console.log(`[processPendingActions] User ${userId} has pending DM: "${pendingDmMessage}"`);
            try {
                await interaction.user.send(pendingDmMessage);
                console.log(`[processPendingActions] Successfully sent pending DM to ${userId}.`);
            } catch (dmError) {
                console.warn(`[processPendingActions] Failed to send pending DM to user ${userId}. They may have DMs disabled.`, dmError);
            }
        }

        // Step 3: Process role cleanup if a streak was reset.
        if (pendingRoleCleanup) {
            actionsProcessed = true;
            console.log(`[processPendingActions] User ${userId} has pending role cleanup.`);
            const rolesToRemove = member.roles.cache.filter(role => STREAK_MILESTONE_ROLE_NAMES.includes(role.name));
            if (rolesToRemove.size > 0) {
                await member.roles.remove(rolesToRemove, 'Streak reset cleanup');
                console.log(`[processPendingActions] Removed ${rolesToRemove.size} milestone role(s) from ${userId}.`);
            }
        }

        // Step 4: Process the main streak role update.
        if (pendingRoleUpdate && pendingRoleUpdate.name) {
            actionsProcessed = true;
            console.log(`[processPendingActions] User ${userId} has pending role update: ${pendingRoleUpdate.name}`);
            const newMilestoneRole = await ensureRole(guild, pendingRoleUpdate.name, pendingRoleUpdate.color);
            if (newMilestoneRole) {
                await member.roles.add(newMilestoneRole, 'Streak milestone achieved');
                console.log(`[processPendingActions] Added role "${newMilestoneRole.name}" to ${userId}.`);
            }
        }

        // Step 5: Process the streak freeze role update.
        if (pendingFreezeRoleUpdate) {
            actionsProcessed = true;
            console.log(`[processPendingActions] User ${userId} has pending freeze role update: ${pendingFreezeRoleUpdate}`);
            // Remove all old freeze roles first
            const oldFreezeRoles = member.roles.cache.filter(role => role.name.startsWith(FREEZE_ROLE_BASENAME));
            if (oldFreezeRoles.size > 0) {
                await member.roles.remove(oldFreezeRoles, 'Updating freeze count role');
                console.log(`[processPendingActions] Removed ${oldFreezeRoles.size} old freeze role(s) from ${userId}.`);
            }
            // Add the new one
            if (pendingFreezeRoleUpdate.includes(": 0") || pendingFreezeRoleUpdate.includes(": 1") || pendingFreezeRoleUpdate.includes(": 2") || pendingFreezeRoleUpdate.includes(": 3") || pendingFreezeRoleUpdate.includes(": 4") || pendingFreezeRoleUpdate.includes(": 5")) {
                 const newFreezeRole = await ensureRole(guild, pendingFreezeRoleUpdate);
                 if (newFreezeRole) {
                    await member.roles.add(newFreezeRole, 'Freeze count updated');
                    console.log(`[processPendingActions] Added role "${newFreezeRole.name}" to ${userId}.`);
                 }
            }
        }

        // Step 6: If any action was processed, clear the flags in Firestore.
        if (actionsProcessed) {
            console.log(`[processPendingActions] Actions were processed for ${userId}. Calling clearPendingUserActions.`);
            await callFirebaseFunction('clearPendingUserActions', {}, userId);
            console.log(`[processPendingActions] Successfully cleared pending actions for ${userId}.`);
        } else {
            console.log(`[processPendingActions] No pending actions found for user ${userId}.`);
        }

    } catch (error) {
        console.error(`[processPendingActions] A critical error occurred while processing pending actions for user ${userId}:`, error);
    }
}
// End of Firebase initialization and helper functions block
// Your existing bot code (const client = new Client(...), etc.) starts below this

// ====== Global Error Handlers ======
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', err => {
  console.error('💥 Uncaught Exception thrown:', err);
  process.exit(1);
});

// ====== REGISTER SLASH COMMANDS ======
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID),
      { body: [
        new SlashCommandBuilder()
          .setName('streak')
          .setDescription('Check your current streak')
          .toJSON(),        
        new SlashCommandBuilder()
          .setName('go')
          .setDescription('Self Science Hub')
          .toJSON(),
        new SlashCommandBuilder()
          .setName('hi')
          .setDescription('Begin the welcome and onboarding sequence.')
          .toJSON()
      ]}
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
})();


// ====== DISCORD CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages, // Add this
    GatewayIntentBits.MessageContent,  // Add this (needed to read message content in DMs)
    GatewayIntentBits.GuildMembers
  ]
});

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);

  if (admin.apps.length && typeof dbAdmin !== 'undefined' && dbAdmin !== null) {
    setupStatsNotificationListener(client);
    setupReminderDMsListener(client); // <<< ADD THIS LINE TO CALL THE NEW LISTENER
//    setupAIResponseListener(client);
    setupPublicMessageListener(client);
  } else {
    console.warn("Firebase Admin SDK (dbAdmin) is not properly initialized. Listeners for stats and reminders will NOT be started. Please check your Firebase Admin setup at the top of the file.");
  }
});

client.on(Events.MessageCreate, async message => {
  // Ignore messages from bots and messages not in DMs
  if (message.author.bot || message.guild) return;

  const userId = message.author.id;
  const userTag = message.author.tag;
  const messageContent = message.content.trim();

  // Retrieve user's current DM flow state
  const setupData = userExperimentSetupData.get(userId);

  if (!setupData || !setupData.dmFlowState) {
    // User is not in an active DM flow with this bot, or state is missing
    // You might want to send a generic "I'm not sure what you mean, use /go to start" if they DM out of context.
    // For now, we'll just ignore.
    return;
  }

  const interactionIdForLog = setupData.interactionId || 'DM_FLOW'; // Use stored interaction ID or a generic one

  console.log(`[MessageCreate DM_HANDLER START ${interactionIdForLog}] Received DM from ${userTag} (ID: ${userId}). State: ${setupData.dmFlowState}. Content: "${messageContent}"`);

  // Handle 'cancel' command universally within this DM flow
  if (messageContent.toLowerCase() === 'cancel') {
    console.log(`[MessageCreate DM_CANCEL ${interactionIdForLog}] User ${userTag} cancelled DM flow from state: ${setupData.dmFlowState}.`);
    userExperimentSetupData.delete(userId);
    await message.author.send("Okay, I've cancelled the current experiment setup.\n\nYou can always start over using the `/go` command! 👍");
    console.log(`[MessageCreate DM_CANCEL_CONFIRMED ${interactionIdForLog}] Cancellation confirmed to ${userTag}.`);
    return;
  }

    if (setupData.dmFlowState === 'awaiting_wish') {
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';

      if (!messageContent) {
        await message.author.send("It looks like your Deeper Wish was empty. Please try again.");
        console.log(`[MessageCreate AWAITING_WISH_EMPTY ${interactionIdForLog}] User ${userTag} sent empty wish.`);
        return;
      }

      // Store the wish
      setupData.deeperWish = messageContent;
      setupData.deeperProblem = messageContent; // For compatibility
      console.log(`[MessageCreate AWAITING_WISH_RECEIVED ${interactionIdForLog}] User ${userTag} submitted Deeper Wish. Style: ${setupData.setupStyle}`);

      // --- "Send New, Edit Old" PATTERN to confirm receipt ---
      const oldPromptId = setupData.lastPromptMessageId;
      if (oldPromptId) {
          try {
              const oldPrompt = await message.channel.messages.fetch(oldPromptId);
              await oldPrompt.edit({ content: "✅️ Wish received. **Scroll down for the next step...**", components: [], embeds: [] });
              setupData.lastConfirmationMessageId = oldPrompt.id;
            } catch (editError) {
              console.warn(`[MessageCreate EDIT_OLD_PROMPT_FAIL ${interactionIdForLog}] Could not edit old 'wish' prompt. Error: ${editError.message}`);
          }
      }
      
      // --- NEW: Branch based on setupStyle ---
      if (setupData.setupStyle === 'thorough') {
          // --- THOROUGH PATH: Ask for blockers ---
          setupData.dmFlowState = 'awaiting_blockers';
          console.log(`[MessageCreate THOROUGH_PATH ${interactionIdForLog}] State changed to '${setupData.dmFlowState}'.`);
          
          const newPromptEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle("In-depth Questions")
            .setDescription(`Please answer 3 quick questions.\n\n### Question 1\nWhat obstacles make "${setupData.deeperWish}" hard to reach?`);

          const newPromptMessage = await message.author.send({ embeds: [newPromptEmbed] });
          setupData.lastPromptMessageId = newPromptMessage.id;
          userExperimentSetupData.set(userId, setupData);
          console.log(`[MessageCreate ASK_BLOCKERS ${interactionIdForLog}] Sent new prompt for blockers.`);

      } else {
          // --- EXPRESS PATH: Go directly to AI suggestions ---
          setupData.dmFlowState = 'processing_outcome_suggestions';
          userExperimentSetupData.set(userId, setupData);
          console.log(`[MessageCreate EXPRESS_PATH ${interactionIdForLog}] State changed to '${setupData.dmFlowState}'.`);

          const thinkingEmbed = new EmbedBuilder()
              .setColor('#5865F2')
              .setDescription("🧠 Analyzing your wish to suggest a personalized experiment...");
          const thinkingMessage = await message.author.send({ embeds: [thinkingEmbed] });
          setupData.lastPromptMessageId = thinkingMessage.id;
          userExperimentSetupData.set(userId, setupData);

          try {
              console.log(`[MessageCreate LLM_CALL_START ${interactionIdForLog}] Calling 'generateOutcomeLabelSuggestions' (Express) for ${userTag}.`);
              const llmResult = await callFirebaseFunction(
                'generateOutcomeLabelSuggestions',
                { userWish: setupData.deeperWish }, // Only send the wish
                userId
              );
              console.log(`[MessageCreate LLM_CALL_END ${interactionIdForLog}] Firebase function returned for ${userTag}.`);

              if (llmResult && llmResult.success && llmResult.suggestions?.length > 0) {
                  setupData.aiGeneratedOutcomeSuggestions = llmResult.suggestions;
                  setupData.dmFlowState = 'awaiting_outcome_suggestion_selection';
                  userExperimentSetupData.set(userId, setupData);
                  
                  const stepConfig = dmFlowConfig[setupData.dmFlowState];
                  const { content, components } = stepConfig.prompt(setupData);

                  const resultsEmbed = new EmbedBuilder()
                      .setColor('#57F287') // Green
                      .setTitle("Outcome Metric Suggestions")
                      .setDescription(content);
                  
                  await thinkingMessage.edit({
                      embeds: [resultsEmbed],
                      components: components
                  });
                  console.log(`[MessageCreate LABEL_DROPDOWN_SENT ${interactionIdForLog}] Edited 'thinking' message to display AI suggestions to ${userTag}.`);
              } else {
                  throw new Error(llmResult?.message || 'AI failed to return valid suggestions.');
              }
          } catch (error) {
              console.error(`[MessageCreate FIREBASE_FUNC_ERROR ${interactionIdForLog}] Error in Express path for ${userTag}:`, error);
              const errorEmbed = new EmbedBuilder()
                  .setColor('#ED4245')
                  .setTitle("Connection Error")
                  .setDescription("I encountered an issue connecting to my AI brain for suggestions. Please type `cancel` and try the `/go` command again.");
              await thinkingMessage.edit({ embeds: [errorEmbed], components: [] });
          }
      }
    }

    // --- Stage 2: Handle "awaiting_blockers" and transition to second question ---
    else if (setupData.dmFlowState === 'awaiting_blockers') {
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';

      if (!messageContent) {
        await message.author.send("It looks like your response was empty. Please tell me, what are the biggest blockers to your wish?");
        console.log(`[MessageCreate AWAITING_BLOCKERS_EMPTY ${interactionIdForLog}] User ${userTag} sent empty blockers response.`);
        return;
      }
      
      // Store the blockers and transition state
      setupData.userBlockers = messageContent;
      setupData.dmFlowState = 'awaiting_positive_habits';
      console.log(`[MessageCreate AWAITING_BLOCKERS_RECEIVED ${interactionIdForLog}] User ${userTag} submitted blockers. State changed to '${setupData.dmFlowState}'.`);

      // --- "Send New, Edit Old" PATTERN ---

      // 1. Send NEW prompt as an Embed
       const newPromptEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle("Positive Momentum...")
        .setDescription("What are 1 or more positive habits you already do consistently?\n\nThey can be related to the wish or not.\n\n**It all helps** 💃");

      const newPromptMessage = await message.author.send({ embeds: [newPromptEmbed] });
      console.log(`[MessageCreate ASK_POSITIVE_HABITS ${interactionIdForLog}] Sent new prompt for positive habits as an embed.`);

      // 2. EDIT OLD prompt
      const oldPromptId = setupData.lastPromptMessageId;
      if (oldPromptId) {
          try {
              const oldPrompt = await message.channel.messages.fetch(oldPromptId);
              await oldPrompt.edit({
                  content: "✅️ Blockers received. **Scroll down**",
                  components: [],
                  embeds: []
              });
              console.log(`[MessageCreate EDITED_OLD_PROMPT ${interactionIdForLog}] Edited previous 'blockers' prompt.`);
          } catch (editError) {
              console.warn(`[MessageCreate EDIT_OLD_PROMPT_FAIL ${interactionIdForLog}] Could not edit old prompt (ID: ${oldPromptId}). Error: ${editError.message}`);
          }
      }

      // 3. Update setupData for the NEXT step
      setupData.lastPromptMessageId = newPromptMessage.id;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate NEXT_PROMPT_ID_STORED ${interactionIdForLog}] Stored new prompt ID ${newPromptMessage.id} for the next step.`);
    }

    // --- Stage 3: Handle "awaiting_positive_habits" and transition to final question ---

    else if (setupData.dmFlowState === 'awaiting_positive_habits') {
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';

      if (!messageContent) {
        await message.author.send("It looks like your response was empty. Please tell me one positive habit you have, even a small one.");
        console.log(`[MessageCreate AWAITING_POSITIVE_HABITS_EMPTY ${interactionIdForLog}] User ${userTag} sent empty positive habits response.`);
        return;
      }
      
      // Store the positive habits and transition state
      setupData.userPositiveHabits = messageContent;
      setupData.dmFlowState = 'awaiting_vision';
      console.log(`[MessageCreate AWAITING_POSITIVE_HABITS_RECEIVED ${interactionIdForLog}] User ${userTag} submitted positive habits. State changed to '${setupData.dmFlowState}'.`);

      // --- "Send New, Edit Old" PATTERN ---

      // 1. Send NEW prompt as an Embed
      const newPromptEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle("Noticeable Success")
        .setDescription("If your wish came true, what's the **first positive change** you'd find?\n### Example\nIf **Wish** = 'More energy'\n\nThen **1st Change** = 'Less coffee'")

      const newPromptMessage = await message.author.send({ embeds: [newPromptEmbed] });
      console.log(`[MessageCreate ASK_VISION ${interactionIdForLog}] Sent new prompt for vision of success as an embed.`);

      // 2. EDIT OLD prompt
      const oldPromptId = setupData.lastPromptMessageId;
      if (oldPromptId) {
          try {
              const oldPrompt = await message.channel.messages.fetch(oldPromptId);
              await oldPrompt.edit({
                  content: "✅️ Positive habits received. **Scroll down**",
                  components: [],
                  embeds: []
              });
              console.log(`[MessageCreate EDITED_OLD_PROMPT ${interactionIdForLog}] Edited previous 'positive habits' prompt.`);
          } catch (editError) {
              console.warn(`[MessageCreate EDIT_OLD_PROMPT_FAIL ${interactionIdForLog}] Could not edit old prompt (ID: ${oldPromptId}). Error: ${editError.message}`);
          }
      }

      // 3. Update setupData for the NEXT step
      setupData.lastPromptMessageId = newPromptMessage.id;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate NEXT_PROMPT_ID_STORED ${interactionIdForLog}] Stored new prompt ID ${newPromptMessage.id} for the next step.`);
    }

    // --- Stage 4: Handle "awaiting_vision", process all context, and call AI ---

    else if (setupData.dmFlowState === 'awaiting_vision') {
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';

      if (!messageContent) {
        await message.author.send("It looks like your response was empty. Please tell me, what is the first small change you'd notice if the experiment was a success?");
        console.log(`[MessageCreate AWAITING_VISION_EMPTY ${interactionIdForLog}] User ${userTag} sent empty vision response.`);
        return;
      }

      // Store the final piece of context
      setupData.userVision = messageContent;
      setupData.dmFlowState = 'processing_context'; // New state
      console.log(`[MessageCreate AWAITING_VISION_RECEIVED ${interactionIdForLog}] User ${userTag} submitted vision: "${messageContent}". State changed to '${setupData.dmFlowState}'.`);

      // --- "Send New, Edit Old" PATTERN for Loading State ---

      // 1. EDIT OLD prompt
      const oldPromptId = setupData.lastPromptMessageId;
      if (oldPromptId) {
          try {
              const oldPrompt = await message.channel.messages.fetch(oldPromptId);
              await oldPrompt.edit({
                  content: `✅️ Vision received. **Scroll down**`,
                  components: [],
                  embeds: []
              });
              console.log(`[MessageCreate EDITED_OLD_PROMPT ${interactionIdForLog}] Edited previous 'vision' prompt.`);
          } catch (editError) {
              console.warn(`[MessageCreate EDIT_OLD_PROMPT_FAIL ${interactionIdForLog}] Could not edit old prompt (ID: ${oldPromptId}). It may have been deleted. Error: ${editError.message}`);
          }
      }

      // 2. Send NEW "Thinking" message as an Embed
      const thinkingEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setDescription("🧠 Analyzing your responses to suggest a personalized experiment...");
      
      const thinkingMessage = await message.author.send({ embeds: [thinkingEmbed] });
      
      // 3. Update setupData for the NEXT step (the AI call)
      setupData.lastPromptMessageId = thinkingMessage.id;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate THINKING_MESSAGE_SENT ${interactionIdForLog}] Sent new 'thinking' message ${thinkingMessage.id} and stored it as lastPromptMessageId.`);

      // --- Call Firebase Function with the complete context ---
      try {
        console.log(`[MessageCreate LLM_CALL_START ${interactionIdForLog}] Calling 'generateOutcomeLabelSuggestions' Firebase function for ${userTag} with full context.`);
        if (!firebaseFunctions) {
            throw new Error("Firebase Functions client not initialized.");
        }

        const llmResult = await callFirebaseFunction(
          'generateOutcomeLabelSuggestions',
          { // Payload now includes all collected context
            userWish: setupData.deeperWish,
            userBlockers: setupData.userBlockers,
            userPositiveHabits: setupData.userPositiveHabits,
            userVision: setupData.userVision
          },
          userId
        );
        console.log(`[MessageCreate LLM_CALL_END ${interactionIdForLog}] Firebase function 'generateOutcomeLabelSuggestions' returned for ${userTag}.`);

          if (llmResult && llmResult.success && llmResult.suggestions?.length > 0) {
                setupData.aiGeneratedOutcomeSuggestions = llmResult.suggestions;
                setupData.dmFlowState = 'awaiting_outcome_suggestion_selection';
                userExperimentSetupData.set(userId, setupData);

                // This uses the central config to build the dropdown correctly
                const stepConfig = dmFlowConfig[setupData.dmFlowState];
                const { content, components } = stepConfig.prompt(setupData);

                const resultsEmbed = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle("Personalized Suggestions")
                    .setDescription(content);

                await thinkingMessage.edit({
                    embeds: [resultsEmbed],
                    components: components
                });
                console.log(`[MessageCreate LABEL_DROPDOWN_SENT ${interactionIdForLog}] Edited 'thinking' message to display AI suggestions to ${userTag}.`);
            } else {
            // This 'else' block handles cases where the LLM call failed or returned unexpected data.
            let failureReason = "AI failed to return valid suggestions";
            if (llmResult && llmResult.error) {
                failureReason = llmResult.error;
            } else if (llmResult && llmResult.suggestions) {
                failureReason = `AI returned an unexpected number of suggestions (${llmResult.suggestions?.length || 0}).`;
            }
            console.error(`[MessageCreate LLM_ERROR ${interactionIdForLog}] LLM call 'generateOutcomeLabelSuggestions' failed or returned invalid data for ${userTag}. Reason: ${failureReason}. Result:`, llmResult);
            
            // Edit the "thinking" message with the fallback prompt
            const fallbackEmbed = new EmbedBuilder()
              .setColor('#FEE75C') // Yellow for warning/fallback
              .setTitle("Manual Input Required")
              .setDescription("I had a bit of trouble brainstorming suggestions right now. 😕\n\nYou're gonna have to go hands on or restart at /go!\n\nWhat **Label** would you like to give your Outcome Metric? This is the main measure you want to improve.\n\nE.g., 'Energy Level', 'Sleep Quality', 'Tasks Completed'\n\nType just the label below (max 30 characters).");
            
            await thinkingMessage.edit({ embeds: [fallbackEmbed], components: [] });

            // Fallback to direct text input for the outcome label
            setupData.dmFlowState = 'awaiting_outcome_label';
            userExperimentSetupData.set(userId, setupData);
            console.log(`[MessageCreate LLM_FAIL_RECOVERY_LABEL ${interactionIdForLog}] LLM failed for outcome label suggestions, sent fallback 'Ask Outcome Label (text)' prompt to ${userTag}. State: ${setupData.dmFlowState}.`);
        }
      } catch (error) {
        console.error(`[MessageCreate FIREBASE_FUNC_ERROR ${interactionIdForLog}] Error calling Firebase function 'generateOutcomeLabelSuggestions' or processing its result for ${userTag}:`, error);
        
        // Try to edit the "thinking" message with an error message
        try {
          const errorEmbed = new EmbedBuilder()
            .setColor('#ED4245') // Red for error
            .setTitle("Connection Error")
            .setDescription("I encountered an issue connecting with my AI brain for suggestions. Please try again in a bit, or you can type `cancel` and use the manual setup for now.");

          await thinkingMessage.edit({ embeds: [errorEmbed], components: [] });
        } catch (editError) {
          console.error(`[MessageCreate EDIT_THINKING_MESSAGE_ON_ERROR_FAIL ${interactionIdForLog}] Could not edit thinkingMessage after catch. Sending new message. Error:`, editError);
          await message.author.send("I encountered a critical issue trying to connect with my AI brain for suggestions. Please try again in a bit, or you can type `cancel` and use the manual setup for now.");
        }
        
        // Do not revert state here; allow user to type 'cancel' or wait for the issue to be resolved.
      }
    }

    else if (setupData.dmFlowState === 'processing_wish') {
      // User sent another message while wish was being processed.
      // Tell them to wait or handle appropriately.
      await message.author.send("I'm still thinking about your wish!\n\nI'll send the examples as soon as they're ready. 😊");
      console.log(`[MessageCreate PROCESSING_WISH_INTERRUPT ${interactionIdForLog}] User ${userTag} sent message while wish was processing.`);
    }

    else if (setupData.dmFlowState === 'awaiting_outcome_label') {
      const outcomeLabel = messageContent;
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';

      if (!outcomeLabel) {
        await message.author.send("It looks like your response was empty. What **Label** would you give your Outcome Metric? (e.g., 'Energy Level', 'Sleep Quality')");
        console.log(`[MessageCreate AWAITING_OUTCOME_LABEL_EMPTY ${interactionIdForLog}] User ${userTag} sent empty outcome label.`);
        return;
      }

      const MAX_LABEL_LENGTH = 30;
      if (outcomeLabel.length > MAX_LABEL_LENGTH) {
        await message.author.send(
          `That label is a bit long! Please keep it under **${MAX_LABEL_LENGTH} characters**.\n\n` +
          `Your label for the Outcome Metric was: "${outcomeLabel}" (${outcomeLabel.length} chars).\n\n` +
          `Could you provide a shorter one?`
        );
        console.log(`[MessageCreate OUTCOME_LABEL_TOO_LONG ${interactionIdForLog}] User ${userTag} sent outcome label over ${MAX_LABEL_LENGTH} chars.`);
        return;
      }

      // --- "Send New, Edit Old" Pattern ---
      // 1. EDIT OLD prompt
      const oldPromptId = setupData.lastPromptMessageId;
      if (oldPromptId) {
          try {
              const oldPrompt = await message.channel.messages.fetch(oldPromptId);
              await oldPrompt.edit({
                  content: `✅️ Outcome Label: "${outcomeLabel}". **Scroll down**`,
                  embeds: [],
                  components: []
              });
              console.log(`[MessageCreate EDITED_OLD_PROMPT ${interactionIdForLog}] Edited previous 'outcome label' prompt.`);
          } catch (editError) {
              console.warn(`[MessageCreate EDIT_OLD_PROMPT_FAIL ${interactionIdForLog}] Could not edit old prompt (ID: ${oldPromptId}). Error: ${editError.message}`);
          }
      }
      
      // Store data and transition state
      setupData.outcomeLabel = outcomeLabel;
      setupData.dmFlowState = 'awaiting_outcome_unit_dropdown_selection';
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate OUTCOME_LABEL_RECEIVED ${interactionIdForLog}] User ${userTag} submitted label: "${outcomeLabel}". State changed to '${setupData.dmFlowState}'.`);

      // 2. SEND NEW prompt using the dmFlowConfig
      const nextStepConfig = dmFlowConfig[setupData.dmFlowState];
      const { content, components } = nextStepConfig.prompt(setupData);
      
      const newPromptEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle("📏 How to Measure?")
          .setDescription(content);

      const newPromptMessage = await message.author.send({
          embeds: [newPromptEmbed],
          components: components
      });

      // 3. Update state with the new message ID
      setupData.lastPromptMessageId = newPromptMessage.id;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate ASK_OUTCOME_UNIT_DROPDOWN ${interactionIdForLog}] Sent new unit dropdown prompt to ${userTag}. Stored new prompt ID ${newPromptMessage.id}.`);
    }

      // [render index with AI set exp.txt]
    else if (setupData.dmFlowState === 'awaiting_custom_outcome_label_text') {
      const customLabelText = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';

      if (!customLabelText) {
        await message.author.send(
          "It looks like your Outcome was empty. Please type your Outcome Metric, e.g., \"Overall Well-being\" (max 30 characters)."
        );
        console.log(`[MessageCreate CUSTOM_OUTCOME_LABEL_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom outcome label.`);
        return;
      }

      const MAX_LABEL_LENGTH = 30;
      if (customLabelText.length > MAX_LABEL_LENGTH) {
        await message.author.send(
          `That custom label is a bit long! Please keep it under **${MAX_LABEL_LENGTH} characters**.\n\n` +
          `Your label was: "${customLabelText}" (${customLabelText.length} chars).\n\n` +
          `Could you provide a shorter one for your Outcome Metric?`
        );
        console.log(`[MessageCreate CUSTOM_OUTCOME_LABEL_TOO_LONG ${interactionIdForLog}] User ${userTag} sent custom outcome label over ${MAX_LABEL_LENGTH} chars.`);
        return;
      }

      setupData.outcomeLabel = customLabelText;
      delete setupData.outcomeLabelSuggestedUnitType;
      setupData.dmFlowState = 'awaiting_outcome_unit_dropdown_selection';
      console.log(`[MessageCreate CUSTOM_OUTCOME_LABEL_RECEIVED ${interactionIdForLog}] User ${userTag} submitted custom outcome label: "${customLabelText}".`);

      // --- "Send New, Edit Old" ---
      // 1. EDIT OLD
      const oldPromptId = setupData.lastPromptMessageId;
      if (oldPromptId) {
          try {
              const oldPrompt = await message.channel.messages.fetch(oldPromptId);
              await oldPrompt.edit({
                  content: `✅️ Custom Label: "${customLabelText}" **Scroll down**`,
                  embeds: [],
                  components: []
              });
              console.log(`[MessageCreate EDITED_OLD_PROMPT ${interactionIdForLog}] Edited previous 'custom label' prompt.`);
          } catch (editError) {
              console.warn(`[MessageCreate EDIT_OLD_PROMPT_FAIL ${interactionIdForLog}] Could not edit old 'custom label' prompt (ID: ${oldPromptId}). Error: ${editError.message}`);
          }
      }

      // 2. SEND NEW
      const nextStepConfig = dmFlowConfig[setupData.dmFlowState];
      const { content, components } = nextStepConfig.prompt(setupData);
      
      const newPromptEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle("📏 How to Measure?")
          .setDescription(content);
      
      const newPromptMessage = await message.author.send({
          embeds: [newPromptEmbed],
          components: components
      });

      // 3. UPDATE STATE
      setupData.lastPromptMessageId = newPromptMessage.id;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate CUSTOM_LABEL_OUTCOME_UNIT_DROPDOWN_SENT ${interactionIdForLog}] Prompted ${userTag} with outcome unit dropdown. State: ${setupData.dmFlowState}.`);
    }

    else if (setupData.dmFlowState === 'awaiting_custom_outcome_unit_text') {
      const customOutcomeUnit = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      
      if (!customOutcomeUnit) {
        await message.author.send(
          `It looks like your custom unit was empty for **"${setupData.outcomeLabel}"**.\n\nPlease enter a concise scale or unit name (e.g., "out of 10", "Tasks"). Max 15 characters.`
        );
        console.log(`[MessageCreate CUSTOM_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom unit.`);
        return;
      }

      const MAX_UNIT_ONLY_LENGTH = 15;
      if (customOutcomeUnit.length > MAX_UNIT_ONLY_LENGTH) {
        await message.author.send(
          `That unit ("${customOutcomeUnit}") is a bit long (max ${MAX_UNIT_ONLY_LENGTH} characters).\n\nPlease enter a concise scale or unit name (e.g., "0-10", "Tasks").`
        );
        console.log(`[MessageCreate CUSTOM_UNIT_TOO_LONG ${interactionIdForLog}] User ${userTag} sent unit over ${MAX_UNIT_ONLY_LENGTH} chars.`);
        return;
      }

      const combinedLength = (setupData.outcomeLabel + " " + customOutcomeUnit).length;
      const MAX_COMBINED_LENGTH = 45;

      if (combinedLength > MAX_COMBINED_LENGTH) {
        await message.author.send(
            `The combination of your label ("${setupData.outcomeLabel}") and your unit ("${customOutcomeUnit}") is too long for the daily log form (max ~${MAX_COMBINED_LENGTH} chars).\n\n` +
            `Could you please provide a shorter Unit/Scale for **"${setupData.outcomeLabel}"**? Or, type 'cancel' and restart with a shorter label.`
        );
        console.warn(`[MessageCreate CUSTOM_UNIT_COMBO_TOO_LONG ${interactionIdForLog}] Combined length is ${combinedLength} (max ${MAX_COMBINED_LENGTH}).`);
        return;
      }
      
      // --- "Send New, Edit Old" Pattern ---
      // 1. EDIT OLD prompt
      const oldPromptId = setupData.lastPromptMessageId;
      if (oldPromptId) {
          try {
              const oldPrompt = await message.channel.messages.fetch(oldPromptId);
              await oldPrompt.edit({
                  content: `✅️ Custom Unit: "${customOutcomeUnit}". **Scroll down**`,
                  embeds: [],
                  components: []
              });
              console.log(`[MessageCreate EDITED_OLD_PROMPT ${interactionIdForLog}] Edited previous 'custom unit' prompt.`);
          } catch (editError) {
              console.warn(`[MessageCreate EDIT_OLD_PROMPT_FAIL ${interactionIdForLog}] Could not edit old prompt (ID: ${oldPromptId}). Error: ${editError.message}`);
          }
      }

      // Store data and transition state
      setupData.outcomeUnit = customOutcomeUnit;
      delete setupData.outcomeUnitCategory;
      delete setupData.aiGeneratedOutcomeUnitSuggestions;
      
      const isTimeMetric = TIME_OF_DAY_KEYWORDS.includes(customOutcomeUnit.toLowerCase().trim());
      const nextState = isTimeMetric ? 'awaiting_outcome_target_time' : 'awaiting_outcome_target_number';
      setupData.dmFlowState = nextState;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate CUSTOM_UNIT_VALID ${interactionIdForLog}] User ${userTag} confirmed custom unit: "${customOutcomeUnit}". State changed to '${nextState}'.`);

      // 2. SEND NEW prompt using the dmFlowConfig
      const step = dmFlowConfig[nextState];
      const { content, embeds, components } = step.prompt(setupData);

      const newPromptEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle("🎯 Daily Target?")
          .setDescription(content);

      const newPromptMessage = await message.author.send({
        embeds: embeds ? [newPromptEmbed, ...embeds] : [newPromptEmbed],
        components: components
      });

      // 3. Update state with the new message ID
      setupData.lastPromptMessageId = newPromptMessage.id;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate CUSTOM_UNIT_TARGET_PROMPT_SENT ${interactionIdForLog}] Prompted ${userTag} for outcome target. Stored new prompt ID ${newPromptMessage.id}.`);
    }

    else if (setupData.dmFlowState === 'awaiting_outcome_target_number') {
      const targetNumberStr = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';

      const backButton = new ButtonBuilder()
          .setCustomId('back_to:awaiting_outcome_unit_dropdown_selection')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary);

      if (!targetNumberStr) {
        await message.author.send({
          content: `It looks like your response was empty. What is your daily **Target #** for **${setupData.outcomeLabel}** (${setupData.outcomeUnit})?\n\nPlease type just the number (e.g. 7, 7.5, 0, 1).`,
          components: [new ActionRowBuilder().addComponents(backButton)]
        });
        console.log(`[MessageCreate OUTCOME_TARGET_EMPTY ${interactionIdForLog}] User ${userTag} sent empty target number.`);
        return;
      }

      const targetNumber = parseFloat(targetNumberStr);
      if (isNaN(targetNumber)) {
        await message.author.send({
          content: `Hmm, "${targetNumberStr}" doesn't seem to be a valid number. \n\nWhat is your daily **Target #** for **${setupData.outcomeLabel}** (${setupData.outcomeUnit})?\n\nPlease type just the number (e.g. 7, 7.5, 0, 1).`,
          components: [new ActionRowBuilder().addComponents(backButton)]
        });
        console.log(`[MessageCreate OUTCOME_TARGET_NAN ${interactionIdForLog}] User ${userTag} sent non-numeric target: "${targetNumberStr}".`);
        return;
      }
      
      // --- "Send New, Edit Old" Pattern ---
      // 1. EDIT OLD prompt
      const oldPromptId = setupData.lastPromptMessageId;
      if (oldPromptId) {
          try {
              const oldPrompt = await message.channel.messages.fetch(oldPromptId);
              await oldPrompt.edit({
                  content: `✅️ Daily Target: "${targetNumber}". **Scroll down**`,
                  embeds: [],
                  components: []
              });
              console.log(`[MessageCreate EDITED_OLD_PROMPT ${interactionIdForLog}] Edited previous 'target number' prompt.`);
          } catch (editError) {
              console.warn(`[MessageCreate EDIT_OLD_PROMPT_FAIL ${interactionIdForLog}] Could not edit old prompt (ID: ${oldPromptId}). Error: ${editError.message}`);
          }
      }

      // Store data and transition state BEFORE async call
      setupData.outcomeGoal = targetNumber;
      console.log(`[MessageCreate OUTCOME_METRIC_DEFINED ${interactionIdForLog}] User ${userTag} defined Outcome Metric: Label="${setupData.outcomeLabel}", Unit="${setupData.outcomeUnit}", Goal=${setupData.outcomeGoal}.`);
      
      setupData.currentInputIndex = 1;
      setupData.inputs = setupData.inputs || [];
      setupData.dmFlowState = 'processing_input1_label_suggestions';
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate PROCESS_INPUT1_LABELS_START ${interactionIdForLog}] State changed to '${setupData.dmFlowState}'.`);

      // 2. SEND NEW "thinking" message
      const thinkingEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setDescription(`✅ **Outcome Metric Confirmed!**\n\n> **${setupData.outcomeLabel}**\n> (${setupData.outcomeUnit}, Target: ${setupData.outcomeGoal})\n\nGreat! Now, let's define your first **Daily Habit**.\n\n🧠 I'll brainstorm some ideas...`);
      
      const thinkingMessage = await message.author.send({ embeds: [thinkingEmbed] });

      // 3. Update state with the new message ID
      setupData.lastPromptMessageId = thinkingMessage.id;
      userExperimentSetupData.set(userId, setupData);

      // --- Call Firebase Function ---
      try {
        const habitSuggestionsResult = await callFirebaseFunction(
          'generateInputLabelSuggestions',
          {
            userWish: setupData.deeperWish,
            userBlockers: setupData.userBlockers,
            userPositiveHabits: setupData.userPositiveHabits,
            userVision: setupData.userVision,
            outcomeMetric: {
              label: setupData.outcomeLabel,
              unit: setupData.outcomeUnit,
              goal: setupData.outcomeGoal
            },
            definedInputs: []
          },
          userId
        );

        if (habitSuggestionsResult && habitSuggestionsResult.success && habitSuggestionsResult.suggestions?.length > 0) {
          setupData.aiGeneratedInputLabelSuggestions = habitSuggestionsResult.suggestions;
          setupData.dmFlowState = 'awaiting_input1_label_dropdown_selection';
          userExperimentSetupData.set(userId, setupData);
          console.log(`[MessageCreate INPUT1_LABEL_SUGGESTIONS_SUCCESS ${interactionIdForLog}] Received ${habitSuggestionsResult.suggestions.length} habit suggestions.`);
          
          const step = dmFlowConfig[setupData.dmFlowState];
          const { content, components } = step.prompt(setupData);

          const resultsEmbed = new EmbedBuilder()
            .setColor('#57F287') // Green
            .setTitle("💡 Habit Ideas")
            .setDescription(content);

          await thinkingMessage.edit({ embeds: [resultsEmbed], components });
          console.log(`[MessageCreate INPUT1_LABEL_DROPDOWN_SENT ${interactionIdForLog}] Edited 'thinking' message to display habit suggestions.`);
        } else {
          let failureMessage = "I had a bit of trouble brainstorming Habit suggestions right now. 😕";
          if (habitSuggestionsResult && habitSuggestionsResult.error) {
            failureMessage += ` (Reason: ${habitSuggestionsResult.error})`;
          }
          console.warn(`[MessageCreate INPUT1_LABEL_SUGGESTIONS_FAIL ${interactionIdForLog}] AI call failed or returned no data.`);
          setupData.dmFlowState = 'awaiting_input1_label_text';
          userExperimentSetupData.set(userId, setupData);
          
          await thinkingMessage.edit({
            content: `${failureMessage}\n\nNo worries! What **Label** would you like to give your first Daily Habit? (max 30 characters).`,
            embeds: []
          });
          console.log(`[MessageCreate INPUT1_LABEL_FALLBACK_PROMPT_SENT ${interactionIdForLog}] Edited 'thinking' to prompt for text.`);
        }
      } catch (error) {
        console.error(`[MessageCreate FIREBASE_FUNC_ERROR_INPUT_LABELS ${interactionIdForLog}] Error calling 'generateInputLabelSuggestions':`, error);
        setupData.dmFlowState = 'awaiting_input1_label_text';
        userExperimentSetupData.set(userId, setupData);
        
        try {
            await thinkingMessage.edit({
                content: "I encountered an issue connecting with my AI brain for habit suggestions.\n\nLet's set it up manually: What **Label** would you like to give your first Daily Habit? (max 30 characters).",
                embeds: []
            });
        } catch (editError) {
            console.error(`[MessageCreate EDIT_THINKING_ON_ERROR_FAIL ${interactionIdForLog}] Could not edit thinkingMessage after catch. Error:`, editError);
        }
        console.log(`[MessageCreate INPUT1_LABEL_ERROR_FALLBACK_PROMPT_SENT ${interactionIdForLog}] Edited 'thinking' to prompt for text after Firebase error.`);
      }
    }

    else if (setupData.dmFlowState === 'awaiting_input1_label_text') {
      const input1Label = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW_INPUT1_LABEL_TEXT';
      
      if (!input1Label) {
        await message.author.send(
          `It looks like your label for the first Daily Habit was empty. What **Label** would you give this habit?\n(max 30 characters).`
        );
        console.log(`[MessageCreate INPUT1_LABEL_EMPTY ${interactionIdForLog}] User ${userTag} sent empty Input 1 label.`);
        return;
      }

      const MAX_LABEL_LENGTH = 30;
      if (input1Label.length > MAX_LABEL_LENGTH) {
        await message.author.send(
          `That label is a bit long! Please keep it under **${MAX_LABEL_LENGTH} characters**.\n\n` +
          `Your label was: "${input1Label}" (${input1Label.length} chars).\n\n` +
          `Could you provide a shorter one for your first Daily Habit?`
        );
        console.log(`[MessageCreate INPUT1_LABEL_TOO_LONG ${interactionIdForLog}] User ${userTag} sent Input 1 label over ${MAX_LABEL_LENGTH} chars.`);
        return;
      }
      
      // --- "Send New, Edit Old" Pattern ---
      // 1. EDIT OLD prompt
      const oldPromptId = setupData.lastPromptMessageId;
      if (oldPromptId) {
          try {
              const oldPrompt = await message.channel.messages.fetch(oldPromptId);
              await oldPrompt.edit({
                  content: `✅️ Custom Habit 1: "${input1Label}". **Scroll down**`,
                  embeds: [],
                  components: []
              });
              console.log(`[MessageCreate EDITED_OLD_PROMPT ${interactionIdForLog}] Edited previous 'input 1 label' prompt.`);
          } catch (editError) {
              console.warn(`[MessageCreate EDIT_OLD_PROMPT_FAIL ${interactionIdForLog}] Could not edit old prompt (ID: ${oldPromptId}). Error: ${editError.message}`);
          }
      }

      // Store data and transition state
      setupData.currentInputDefinition = { label: input1Label };
      setupData.dmFlowState = `awaiting_input1_unit_dropdown_selection`;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate INPUT1_LABEL_CONFIRMED ${interactionIdForLog}] User ${userTag} submitted Input 1 Label: "${input1Label}". State changed to '${setupData.dmFlowState}'.`);

      // 2. SEND NEW prompt using the dmFlowConfig
      const step = dmFlowConfig[setupData.dmFlowState];
      const { content, components } = step.prompt(setupData);

      const newPromptEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle("📏 How to Measure Habit 1?")
        .setDescription(content);

      const newPromptMessage = await message.author.send({
        embeds: [newPromptEmbed],
        components: components
      });

      // 3. Update state with the new message ID
      setupData.lastPromptMessageId = newPromptMessage.id;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate ASK_INPUT1_UNIT_DROPDOWN ${interactionIdForLog}] Sent new unit dropdown prompt for Input 1. Stored new prompt ID ${newPromptMessage.id}.`);
    }

    else if (setupData.dmFlowState === 'awaiting_input2_label_text') {
      const input2Label = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW_INPUT2_LABEL_TEXT';
      const userId = message.author.id;
      const userTag = message.author.tag;

      console.log(`[MessageCreate AWAITING_INPUT2_LABEL_TEXT ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent Input 2 Label: "${input2Label}".`);
      if (!input2Label) {
        await message.author.send(
          `It looks like your label for the second Daily Habit was empty. What **Label** would you give this habit?\n\n` +
          `E.g.\n● "Evening Review"\n● "Limit Screen Time"\n\n(max 30 characters).`
        );
        console.log(`[MessageCreate INPUT2_LABEL_EMPTY ${interactionIdForLog}] User ${userTag} sent empty Input 2 label.`);
        return;
      }

      const MAX_LABEL_LENGTH = 30;
      if (input2Label.length > MAX_LABEL_LENGTH) {
        await message.author.send(
          `That label for your second habit is a bit long! Please keep it under **${MAX_LABEL_LENGTH} characters**.\n\n` +
          `Your label was: "${input2Label}" (${input2Label.length} chars).\n\n` +
          `Could you provide a shorter one for your second Daily Habit?`
        );
        console.log(`[MessageCreate INPUT2_LABEL_TOO_LONG ${interactionIdForLog}] User ${userTag} sent Input 2 label over ${MAX_LABEL_LENGTH} chars: "${input2Label}".`);
        return;
      }

      // Custom label for Input 2 is valid
      // Ensure currentInputDefinition is correctly scoped for Input 2
      if (setupData.currentInputIndex !== 2) {
         console.warn(`[MessageCreate INPUT2_LABEL_TEXT_WARN ${interactionIdForLog}] currentInputIndex is ${setupData.currentInputIndex}, expected 2. Resetting for Input 2.`);
         setupData.currentInputIndex = 2; // Correct the index if it's off
      }
      setupData.currentInputDefinition = { label: input2Label };
      // ***** START: MODIFIED SECTION - TRANSITION TO INPUT 2 UNIT DROPDOWN *****
      setupData.dmFlowState = `awaiting_input${setupData.currentInputIndex}_unit_dropdown_selection`; // e.g., awaiting_input2_unit_dropdown_selection
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate INPUT2_LABEL_CONFIRMED ${interactionIdForLog}] User ${userTag} submitted Input 2 Label: "${input2Label}". State changed to '${setupData.dmFlowState}'.`);

      const habitUnitSelectMenu = new StringSelectMenuBuilder()
          .setCustomId(`${INPUT_UNIT_SELECT_ID_PREFIX}${setupData.currentInputIndex}`) // Dynamic ID e.g., input_unit_select_2
          .setPlaceholder('What metric makes sense for this habit?');
      habitUnitSelectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel("✏️ Enter custom unit...")
                    .setValue(CUSTOM_UNIT_OPTION_VALUE)
            );
      PREDEFINED_HABIT_UNIT_SUGGESTIONS.forEach(unitSuggestion => {
          habitUnitSelectMenu.addOptions(
              new StringSelectMenuOptionBuilder()
                  .setLabel(unitSuggestion.label.length > 100 ? unitSuggestion.label.substring(0,97) + '...' : unitSuggestion.label)
                  .setValue(unitSuggestion.label) // Or a unique ID
                  .setDescription(unitSuggestion.description.length > 100 ? unitSuggestion.description.substring(0,97) + '...' : unitSuggestion.description)
          );
      });
      
      const rowWithHabitUnitSelect = new ActionRowBuilder().addComponents(habitUnitSelectMenu);
      const unitDropdownPromptMessage = `Okay, your 2nd Daily Habit is:\n**"${input2Label}"**.\n\n` +
                                      `What metric makes sense for this habit?`;

      await message.author.send({
          content: unitDropdownPromptMessage,
          components: [rowWithHabitUnitSelect]
      });
      console.log(`[MessageCreate ASK_INPUT2_UNIT_DROPDOWN ${interactionIdForLog}] DM sent to ${userTag} asking for Input 2 Unit via dropdown.`);
      // ***** END: MODIFIED SECTION *****
    }
    
    else if (setupData.dmFlowState === 'awaiting_input3_label_text') {
      const input3Label = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW_INPUT3_LABEL_TEXT';
      const userId = message.author.id;
      const userTag = message.author.tag;

      console.log(`[MessageCreate AWAITING_INPUT3_LABEL_TEXT ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent Input 3 Label: "${input3Label}".`);
      if (!input3Label) {
        await message.author.send(
          `It looks like your label for the 3rd Daily Habit was empty. What **Label** would you give this habit?\n` +
          `(e.g., "Journaling", "Practice Instrument", max 30 characters).`
        );
        console.log(`[MessageCreate INPUT3_LABEL_EMPTY ${interactionIdForLog}] User ${userTag} sent empty Input 3 label.`);
        return;
      }

      const MAX_LABEL_LENGTH = 30;
      if (input3Label.length > MAX_LABEL_LENGTH) {
        await message.author.send(
          `That label for your 3rd habit is a bit long! Please keep it under **${MAX_LABEL_LENGTH} characters**.\n\n` +
          `Your label was: "${input3Label}" (${input3Label.length} chars).\n\n` +
          `Could you provide a shorter one for your third Daily Habit?`
        );
        console.log(`[MessageCreate INPUT3_LABEL_TOO_LONG ${interactionIdForLog}] User ${userTag} sent Input 3 label over ${MAX_LABEL_LENGTH} chars: "${input3Label}".`);
        return;
      }

      // Custom label for Input 3 is valid
      // Ensure currentInputDefinition is correctly scoped for Input 3
      if (setupData.currentInputIndex !== 3) {
         console.warn(`[MessageCreate INPUT3_LABEL_TEXT_WARN ${interactionIdForLog}] currentInputIndex is ${setupData.currentInputIndex}, expected 3. Resetting for Input 3.`);
         setupData.currentInputIndex = 3; // Correct the index if it's off
      }
      setupData.currentInputDefinition = { label: input3Label };

      // ***** START: REPLACEMENT - TRANSITION TO INPUT 3 UNIT DROPDOWN *****
      // Ensure setupData.currentInputIndex is 3
      if (setupData.currentInputIndex !== 3) { 
         console.warn(`[MessageCreate INPUT3_LABEL_TEXT_WARN_BEFORE_UNIT_DROPDOWN ${interactionIdForLog}] currentInputIndex is ${setupData.currentInputIndex}, expected 3. Correcting for Input 3 unit dropdown.`);
         setupData.currentInputIndex = 3;
      }
      setupData.dmFlowState = `awaiting_input${setupData.currentInputIndex}_unit_dropdown_selection`; // This will be 'awaiting_input3_unit_dropdown_selection'
      userExperimentSetupData.set(userId, setupData);

      const habitUnitSelectMenu = new StringSelectMenuBuilder()
          .setCustomId(`${INPUT_UNIT_SELECT_ID_PREFIX}${setupData.currentInputIndex}`) // This will be 'input_unit_select_3'
          .setPlaceholder('What metric makes sense for this habit?');
      habitUnitSelectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
              .setLabel("✏️ Enter custom unit...")
              .setValue(CUSTOM_UNIT_OPTION_VALUE) // Your constant for this option
      );

      // Assumes PREDEFINED_HABIT_UNIT_SUGGESTIONS is an array of objects: { label: string, description?: string }
      PREDEFINED_HABIT_UNIT_SUGGESTIONS.forEach(unitObj => {
          const option = new StringSelectMenuOptionBuilder()
              .setLabel(unitObj.label.length > 100 ? unitObj.label.substring(0, 97) + '...' : unitObj.label)
              .setValue(unitObj.label); // The value is the concise label
          if (unitObj.description) {
              option.setDescription(unitObj.description.length > 100 ? unitObj.description.substring(0, 97) + '...' : unitObj.description);
          }
          habitUnitSelectMenu.addOptions(option);
      });

      const rowWithHabitUnitSelect = new ActionRowBuilder().addComponents(habitUnitSelectMenu);
      // input3Label is the custom label typed by the user earlier in this 'awaiting_input3_label_text' block
      const unitDropdownPromptMessage = `Okay, your 3rd Daily Habit is: **"${input3Label}"**.\n\nHow will you measure this daily?.`;
      
      await message.author.send({
          content: unitDropdownPromptMessage,
          components: [rowWithHabitUnitSelect]
      });
      console.log(`[MessageCreate INPUT3_LABEL_CONFIRMED_UNIT_DROPDOWN_SENT ${interactionIdForLog}] Confirmed custom Input 3 Label. Prompted ${userTag} with habit unit dropdown. State: ${setupData.dmFlowState}.`);
      // ***** END: REPLACEMENT *****
    }

    else if (setupData.dmFlowState === 'awaiting_input1_custom_unit_text') {
      const customInput1Unit = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      const input1Label = setupData.currentInputDefinition?.label;
      
      if (!input1Label) {
        console.error(`[MessageCreate AWAITING_INPUT1_CUSTOM_UNIT_TEXT_ERROR ${interactionIdForLog}] Missing Input 1 label in setupData.`);
        await message.author.send("I seem to have lost track of your habit's label. Let's try defining this habit again. What Label would you give your first daily habit? (max 30 characters)");
        setupData.dmFlowState = 'awaiting_input1_label_text';
        userExperimentSetupData.set(userId, setupData);
        return;
      }

      if (!customInput1Unit) {
        await message.author.send(
          `It looks like your custom unit for **"${input1Label}"** was empty.\nPlease type your custom Unit/Scale (Max 15 characters).`
        );
        console.log(`[MessageCreate INPUT1_CUSTOM_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom unit.`);
        return;
      }

      const MAX_UNIT_ONLY_LENGTH = 15;
      if (customInput1Unit.length > MAX_UNIT_ONLY_LENGTH) {
        await message.author.send(
          `That unit ("${customInput1Unit}") is a bit long (max ${MAX_UNIT_ONLY_LENGTH} characters).\n\nCould you provide a more concise one for **"${input1Label}"**?`
        );
        console.log(`[MessageCreate INPUT1_CUSTOM_UNIT_TOO_LONG ${interactionIdForLog}] User ${userTag} sent unit over ${MAX_UNIT_ONLY_LENGTH} chars.`);
        return;
      }

      const combinedLength = (input1Label + " " + customInput1Unit).length;
      const MAX_COMBINED_LENGTH = 45;
      if (combinedLength > MAX_COMBINED_LENGTH) {
        await message.author.send(
            `The combination of your habit label ("${input1Label}") and unit ("${customInput1Unit}") is too long for the log form (max ~${MAX_COMBINED_LENGTH} chars).\n\nCould you provide a shorter Unit/Scale?`
        );
        console.warn(`[MessageCreate INPUT1_CUSTOM_UNIT_COMBO_TOO_LONG ${interactionIdForLog}] Combined length is ${combinedLength}.`);
        return;
      }

      // --- "Send New, Edit Old" Pattern ---
      // 1. EDIT OLD prompt
      const oldPromptId = setupData.lastPromptMessageId;
      if (oldPromptId) {
          try {
              const oldPrompt = await message.channel.messages.fetch(oldPromptId);
              await oldPrompt.edit({
                  content: `✅️ Custom Unit: "${customInput1Unit}". **Scroll down**`,
                  embeds: [],
                  components: []
              });
              console.log(`[MessageCreate EDITED_OLD_PROMPT ${interactionIdForLog}] Edited previous 'custom unit' prompt for Input 1.`);
          } catch (editError) {
              console.warn(`[MessageCreate EDIT_OLD_PROMPT_FAIL ${interactionIdForLog}] Could not edit old prompt (ID: ${oldPromptId}). Error: ${editError.message}`);
          }
      }

      // Store data and transition state
      if (!setupData.currentInputDefinition) setupData.currentInputDefinition = {};
      setupData.currentInputDefinition.unit = customInput1Unit;
      delete setupData.currentInputDefinition.unitCategory;
      delete setupData.aiGeneratedUnitSuggestionsForCurrentItem;

      const isTimeMetric = TIME_OF_DAY_KEYWORDS.includes(customInput1Unit.toLowerCase().trim());
      const nextState = isTimeMetric ? 'awaiting_input1_target_time' : 'awaiting_input1_target_number';
      setupData.dmFlowState = nextState;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate INPUT1_CUSTOM_UNIT_VALID ${interactionIdForLog}] User ${userTag} confirmed unit for Input 1. State changed to '${nextState}'.`);

      // 2. SEND NEW prompt using the dmFlowConfig
      const step = dmFlowConfig[nextState];
      const { content, embeds, components } = step.prompt(setupData);

      const newPromptEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle("🎯 Daily Target for Habit 1?")
          .setDescription(content);

      const newPromptMessage = await message.author.send({
        embeds: embeds ? [newPromptEmbed, ...embeds] : [newPromptEmbed],
        components: components
      });

      // 3. Update state with the new message ID
      setupData.lastPromptMessageId = newPromptMessage.id;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate INPUT1_CUSTOM_UNIT_TARGET_PROMPT_SENT ${interactionIdForLog}] Prompted ${userTag} for Input 1 target. Stored new prompt ID ${newPromptMessage.id}.`);
    }

    else if (setupData.dmFlowState === 'awaiting_input2_custom_unit_text') {
      const customInput2Unit = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      const userId = message.author.id;
      const userTag = message.author.tag;
      const input2Label = setupData.currentInputDefinition?.label;
      if (!input2Label || setupData.currentInputIndex !== 2) {
        console.error(`[MessageCreate AWAITING_INPUT2_CUSTOM_UNIT_TEXT_ERROR ${interactionIdForLog}] Missing Input 2 label or incorrect index in setupData for user ${userTag}. State: ${setupData.dmFlowState}, Index: ${setupData.currentInputIndex}. Aborting.`);
        await message.author.send("I seem to have lost track of your second habit's label. Let's try defining this habit again. What Label would you give your second daily habit? (max 30 characters)");
        setupData.dmFlowState = 'awaiting_input2_label_text';
        delete setupData.currentInputDefinition;
        userExperimentSetupData.set(userId, setupData);
        return;
      }

      console.log(`[MessageCreate AWAITING_INPUT2_CUSTOM_UNIT_TEXT ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent custom unit: "${customInput2Unit}" for Input 2 Label: "${input2Label}".`);
      if (!customInput2Unit) {
        await message.author.send(
          `It looks like your custom unit for your second habit **"${input2Label}"** was empty. How would you like to measure this habit daily?\n` +
          `Please type your custom Unit/Scale\n\nE.g.\n● "Minutes"\n● "Reps"\n● "0-10 effort"\n● "Pages"\n\n(Max 15 characters).`
        );
        console.log(`[MessageCreate INPUT2_CUSTOM_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom unit for Input 2.`);
        return;
      }

      const MAX_UNIT_ONLY_LENGTH = 15;
      if (customInput2Unit.length > MAX_UNIT_ONLY_LENGTH) {
        await message.author.send(
          `That unit ("${customInput2Unit}") is a bit long (max ${MAX_UNIT_ONLY_LENGTH} characters for the unit itself).\n\n` +
          `Could you provide a more concise scale/unit to measure for your habit\n**"${input2Label}"**?\n\nMax 15 characters.`
        );
        console.log(`[MessageCreate INPUT2_CUSTOM_UNIT_TOO_LONG ${interactionIdForLog}] User ${userTag} sent unit for Input 2 over ${MAX_UNIT_ONLY_LENGTH} chars: "${customInput2Unit}".`);
        return;
      }

      const combinedLength = (input2Label + " " + customInput2Unit).length;
      const MAX_COMBINED_LENGTH = 45;

      if (combinedLength > MAX_COMBINED_LENGTH) {
        await message.author.send(
            `The combination of your second habit label ("${input2Label}") and your unit ("${customInput2Unit}") is ${combinedLength} characters. This is a bit too long for the daily log form (max ~${MAX_COMBINED_LENGTH} for "Label Unit" display).\n\n` +
            `Could you please provide a shorter Unit/Scale for **"${input2Label}"**?`
        );
        console.warn(`[MessageCreate INPUT2_CUSTOM_UNIT_COMBO_TOO_LONG ${interactionIdForLog}] Combined length for Input 2 ("${input2Label} / ${customInput2Unit}") is ${combinedLength} (max ${MAX_COMBINED_LENGTH}).`);
        return;
      }

      setupData.currentInputDefinition.unit = customInput2Unit;
      delete setupData.currentInputDefinition.unitCategory;
      delete setupData.aiGeneratedUnitSuggestionsForCurrentItem;

      setupData.dmFlowState = 'awaiting_input2_target_number';
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate INPUT2_CUSTOM_UNIT_VALID ${interactionIdForLog}] User ${userTag} confirmed custom unit for Input 2: "${customInput2Unit}" for label "${input2Label}". Combo length: ${combinedLength}. State changed to '${setupData.dmFlowState}'.`);
      
      const targetEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle("🎯 Daily Target for Habit 2")
        .setDescription(`Great! Your second daily habit is\n\n**${input2Label} ${customInput2Unit}**.\n\nWhat is your daily **Target amount**?\n\nPlease type the number below\n(0 and up, decimals ok ✅).`);
        
      await message.author.send({ embeds: [targetEmbed] });
      console.log(`[MessageCreate INPUT2_CUSTOM_UNIT_TARGET_PROMPT_SENT ${interactionIdForLog}] Prompted ${userTag} for Input 2 target number.`);
    }

    else if (setupData.dmFlowState === 'awaiting_input3_custom_unit_text') {
      const customInput3Unit = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      const userId = message.author.id;
      const userTag = message.author.tag;
      const input3Label = setupData.currentInputDefinition?.label;
      if (!input3Label || setupData.currentInputIndex !== 3) {
        console.error(`[MessageCreate AWAITING_INPUT3_CUSTOM_UNIT_TEXT_ERROR ${interactionIdForLog}] Missing Input 3 label or incorrect index in setupData for user ${userTag}. State: ${setupData.dmFlowState}, Index: ${setupData.currentInputIndex}. Aborting.`);
        await message.author.send("I seem to have lost track of your third habit's label. Let's try defining this habit again. What Label would you give your third daily habit? (max 30 characters)");
        setupData.dmFlowState = 'awaiting_input3_label_text';
        delete setupData.currentInputDefinition;
        userExperimentSetupData.set(userId, setupData);
        return;
      }

      console.log(`[MessageCreate AWAITING_INPUT3_CUSTOM_UNIT_TEXT ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent custom unit: "${customInput3Unit}" for Input 3 Label: "${input3Label}".`);
      if (!customInput3Unit) {
        await message.author.send(
          `It looks like your custom unit for your third habit **"${input3Label}"** was empty. How would you like to measure this habit daily?\n` +
          `Please type your custom Unit/Scale\n\nE.g.\n● "Minutes"\n● "Reps"\n● "0-10 effort"\n● "Pages"\n\n(Max 15 characters).`
        );
        console.log(`[MessageCreate INPUT3_CUSTOM_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom unit for Input 3.`);
        return;
      }

      const MAX_UNIT_ONLY_LENGTH = 15;
      if (customInput3Unit.length > MAX_UNIT_ONLY_LENGTH) {
        await message.author.send(
          `That unit ("${customInput3Unit}") is a bit long (max ${MAX_UNIT_ONLY_LENGTH} characters for the unit itself).\n` +
          `Could you provide a more concise scale/unit for your habit\n**"${input3Label}"**?\n\nE.g., "minutes", "reps", "0-10 effort", "pages"\n\nMax 15 characters.`
        );
        console.log(`[MessageCreate INPUT3_CUSTOM_UNIT_TOO_LONG ${interactionIdForLog}] User ${userTag} sent unit for Input 3 over ${MAX_UNIT_ONLY_LENGTH} chars: "${customInput3Unit}".`);
        return;
      }

      const combinedLength = (input3Label + " " + customInput3Unit).length;
      const MAX_COMBINED_LENGTH = 45;

      if (combinedLength > MAX_COMBINED_LENGTH) {
        await message.author.send(
            `The combination of your third habit label ("${input3Label}") and your unit ("${customInput3Unit}") is ${combinedLength} characters. This is a bit too long for the daily log form (max ~${MAX_COMBINED_LENGTH} for "Label Unit" display).\n\n` +
            `Could you please provide a shorter Unit/Scale for **"${input3Label}"**?`
        );
        console.warn(`[MessageCreate INPUT3_CUSTOM_UNIT_COMBO_TOO_LONG ${interactionIdForLog}] Combined length for Input 3 ("${input3Label} / ${customInput3Unit}") is ${combinedLength} (max ${MAX_COMBINED_LENGTH}).`);
        return;
      }

      setupData.currentInputDefinition.unit = customInput3Unit;
      delete setupData.currentInputDefinition.unitCategory;
      delete setupData.aiGeneratedUnitSuggestionsForCurrentItem;

      setupData.dmFlowState = 'awaiting_input3_target_number';
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate INPUT3_CUSTOM_UNIT_VALID ${interactionIdForLog}] User ${userTag} confirmed custom unit for Input 3: "${customInput3Unit}" for label "${input3Label}". Combo length: ${combinedLength}. State changed to '${setupData.dmFlowState}'.`);
      
      const targetEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle("🎯 Daily Target for Habit 3")
        .setDescription(`Great! For your 3rd daily habit:\n\n**${input3Label} ${customInput3Unit}**\n\nWhat is your daily **Target #**?\nPlease type the number below.`);

      await message.author.send({ embeds: [targetEmbed] });
      console.log(`[MessageCreate INPUT3_CUSTOM_UNIT_TARGET_PROMPT_SENT ${interactionIdForLog}] Prompted ${userTag} for Input 3 target number.`);
    }

    else if (setupData.dmFlowState === 'awaiting_input1_target_number') {
      const targetNumberStr = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      const input1Label = setupData.currentInputDefinition?.label;
      const input1Unit = setupData.currentInputDefinition?.unit;

      if (!input1Label || !input1Unit) {
        console.error(`[MessageCreate AWAITING_INPUT1_TARGET_ERROR ${interactionIdForLog}] Missing Input 1 label or unit.`);
        await message.author.send("I seem to have lost track of your habit's details. Let's try defining this habit again. What Label would you give your first daily habit? (max 30 characters)");
        setupData.dmFlowState = 'awaiting_input1_label_text';
        delete setupData.currentInputDefinition;
        userExperimentSetupData.set(userId, setupData);
        return;
      }

      if (!targetNumberStr) {
        await message.author.send(
          `It looks like your response was empty. What is your daily **Target #** for **"${input1Label}"** (${input1Unit})?\nPlease type just the number.`
        );
        console.log(`[MessageCreate INPUT1_TARGET_EMPTY ${interactionIdForLog}] User ${userTag} sent empty target for Input 1.`);
        return;
      }

      const targetNumber = parseFloat(targetNumberStr);
      if (isNaN(targetNumber)) {
        await message.author.send(
          `Hmm, "${targetNumberStr}" doesn't seem to be a valid number.\n\nWhat is your daily **Target #** for **"${input1Label}"** (${input1Unit})?`
        );
        console.log(`[MessageCreate INPUT1_TARGET_NAN ${interactionIdForLog}] User ${userTag} sent non-numeric target for Input 1.`);
        return;
      }
      
      // --- "Send New, Edit Old" Pattern ---
      // 1. EDIT OLD prompt
      const oldPromptId = setupData.lastPromptMessageId;
      if (oldPromptId) {
          try {
              const oldPrompt = await message.channel.messages.fetch(oldPromptId);
              await oldPrompt.edit({
                  content: `✅️ Target for "${input1Label}": ${targetNumber}. **Scroll down**`,
                  embeds: [],
                  components: []
              });
              console.log(`[MessageCreate EDITED_OLD_PROMPT ${interactionIdForLog}] Edited previous 'input 1 target' prompt.`);
          } catch (editError) {
              console.warn(`[MessageCreate EDIT_OLD_PROMPT_FAIL ${interactionIdForLog}] Could not edit old prompt (ID: ${oldPromptId}). Error: ${editError.message}`);
          }
      }

      // Store data and transition state
      setupData.currentInputDefinition.goal = targetNumber;
      if (!setupData.inputs) setupData.inputs = [];
      setupData.inputs[0] = { ...setupData.currentInputDefinition };
      console.log(`[MessageCreate INPUT1_DEFINED ${interactionIdForLog}] User ${userTag} fully defined Input 1: ${JSON.stringify(setupData.inputs[0])}.`);

      delete setupData.currentInputDefinition;
      delete setupData.aiGeneratedUnitSuggestionsForCurrentItem;
      setupData.dmFlowState = 'awaiting_add_another_habit_choice';
      userExperimentSetupData.set(userId, setupData);

      // 2. SEND NEW prompt
      const confirmationAndNextPrompt = new EmbedBuilder()
        .setColor('#57F287')
        .setTitle('Habit 1 Confirmed!')
        .setDescription(`**${setupData.inputs[0].goal} ${setupData.inputs[0].unit}, ${setupData.inputs[0].label}**`)
        .addFields({ name: '\u200B', value: "Would you like to add another daily habit to test (up to 3 total)?" });

      const addHabitButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('add_another_habit_yes_btn')
            .setLabel('➕ Yes, Add Another')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('add_another_habit_no_btn')
            .setLabel('⏭️ No, Skip')
            .setStyle(ButtonStyle.Primary)
        );
      
      const newPromptMessage = await message.author.send({
        embeds: [confirmationAndNextPrompt],
        components: [addHabitButtons]
      });

      // 3. Update state with the new message ID
      setupData.lastPromptMessageId = newPromptMessage.id;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate PROMPT_ADD_ANOTHER_HABIT ${interactionIdForLog}] Prompted to add another habit. Stored new prompt ID ${newPromptMessage.id}.`);
    }

    else if (setupData.dmFlowState === 'awaiting_input2_target_number') {
      const targetNumberStr = messageContent.trim(); // messageContent is from the top of MessageCreate
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      const userId = message.author.id;
      const userTag = message.author.tag;
      const input2Label = setupData.currentInputDefinition?.label;
      const input2Unit = setupData.currentInputDefinition?.unit;

      // Ensure Input 2 label and unit are still in context
      if (!input2Label || !input2Unit || setupData.currentInputIndex !== 2) {
        console.error(`[MessageCreate AWAITING_INPUT2_TARGET_ERROR ${interactionIdForLog}] Missing Input 2 label/unit or incorrect index in setupData for user ${userTag}. State: ${setupData.dmFlowState}, Index: ${setupData.currentInputIndex}. Aborting.`);
        await message.author.send("I seem to have lost track of your second habit's details. Let's try defining this habit again. What Label would you give your second daily habit? (max 30 characters)");
        setupData.dmFlowState = 'awaiting_input2_label_text'; // Revert to asking for label for Input 2
        delete setupData.currentInputDefinition;
        userExperimentSetupData.set(userId, setupData);
        return;
      }

      console.log(`[MessageCreate AWAITING_INPUT2_TARGET ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent target number: "${targetNumberStr}" for Input 2: "${input2Label}" (${input2Unit}).`);

      if (!targetNumberStr) {
        await message.author.send(
          `It looks like your response was empty. What is your daily **Target #** for your second habit **"${input2Label}"** (measured in ${input2Unit})?\n` +
          `Please type just the number.`
        );
        console.log(`[MessageCreate INPUT2_TARGET_EMPTY ${interactionIdForLog}] User ${userTag} sent empty target number for Input 2.`);
        return; // Keep state, wait for new message
      }

      const targetNumber = parseFloat(targetNumberStr);
      if (isNaN(targetNumber)) {
        await message.author.send(
          `Hmm, "${targetNumberStr}" doesn't seem to be a valid number for your target.\n\nWhat is your daily **Target #** for **${input2Label} ${input2Unit}**?\n` +
          `Please type just the number.`
        );
        console.log(`[MessageCreate INPUT2_TARGET_NAN ${interactionIdForLog}] User ${userTag} sent non-numeric target for Input 2: "${targetNumberStr}".`);
        return; // Keep state
      }

      // Validation passed
      setupData.currentInputDefinition.goal = targetNumber;

      // Add the fully defined Input 2 to the inputs array
      if (!setupData.inputs) { // Should have been initialized for Input 1
        setupData.inputs = [];
      }
      // currentInputIndex should be 2
      if (setupData.currentInputIndex === 2) {
          setupData.inputs[1] = { ...setupData.currentInputDefinition }; // Store a copy at index 1
      } else {
          // This case indicates a logic flaw if currentInputIndex is not 2
          console.warn(`[MessageCreate INPUT2_TARGET_UNEXPECTED_INDEX ${interactionIdForLog}] Unexpected currentInputIndex: ${setupData.currentInputIndex} when finalizing Input 2. Storing at inputs[1].`);
          setupData.inputs[1] = { ...setupData.currentInputDefinition }; // Attempt to store anyway
      }

      console.log(`[MessageCreate INPUT2_DEFINED ${interactionIdForLog}] User ${userTag} fully defined Input 2: Label="${setupData.inputs[1].label}", Unit="${setupData.inputs[1].unit}", Goal=${setupData.inputs[1].goal}.`);

      // Clean up temporary holders
      delete setupData.currentInputDefinition;
      delete setupData.aiGeneratedUnitSuggestionsForCurrentItem;

      // --- Ask if user wants to add a third habit or finish ---
      setupData.dmFlowState = 'awaiting_add_another_habit_choice'; // Same state as after Input 1
      userExperimentSetupData.set(userId, setupData);

      const confirmationAndNextPrompt = new EmbedBuilder()
        .setColor('#57F287') // Green
        .setTitle('Daily Habit 2 Confirmed!')
        .setDescription(
            `**${setupData.inputs[1].goal} ${setupData.inputs[1].label} ${setupData.inputs[1].unit}**`
        )
        .addFields({ name: '\u200B', value: "Would you like to add a 3rd (and final) habit to test?"});

      const addHabitButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('add_another_habit_yes_btn') // Same button ID, will be handled by existing InteractionCreate handler
            .setLabel('➕ Yes, Add Habit 3')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('add_another_habit_no_btn') // Same button ID
            .setLabel('⏭️ No More Habits')
            .setStyle(ButtonStyle.Primary)
        );

      await message.author.send({
        embeds: [confirmationAndNextPrompt],
        components: [addHabitButtons]
      });
      console.log(`[MessageCreate PROMPT_ADD_ANOTHER_HABIT ${interactionIdForLog}] Input 2 defined. Prompted ${userTag} to add Input 3 or finish. State: '${setupData.dmFlowState}'.`);
    }

    else if (setupData.dmFlowState === 'awaiting_input3_target_number') {
      const targetNumberStr = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      const input3Label = setupData.currentInputDefinition?.label;
      const input3Unit = setupData.currentInputDefinition?.unit;

      if (!input3Label || !input3Unit || setupData.currentInputIndex !== 3) {
        console.error(`[MessageCreate AWAITING_INPUT3_TARGET_ERROR ${interactionIdForLog}] Missing Input 3 label/unit or incorrect index.`);
        await message.author.send("I seem to have lost track of your third habit's details. Let's try defining this habit again. What Label would you give your third daily habit?");
        setupData.dmFlowState = 'awaiting_input3_label_text';
        delete setupData.currentInputDefinition;
        userExperimentSetupData.set(userId, setupData);
        return;
      }

      const targetNumber = parseFloat(targetNumberStr);
      if (isNaN(targetNumber)) {
        await message.author.send(
          `Hmm, "${targetNumberStr}" doesn't seem to be a valid number.\n\nWhat is your daily **Target #** for **"${input3Label}"** (${input3Unit})?`
        );
        console.log(`[MessageCreate INPUT3_TARGET_NAN ${interactionIdForLog}] User ${userTag} sent non-numeric target for Input 3.`);
        return;
      }
      
      // --- "Send New, Edit Old" Pattern ---
      // 1. EDIT OLD prompt
      const oldPromptId = setupData.lastPromptMessageId;
      if (oldPromptId) {
          try {
              const oldPrompt = await message.channel.messages.fetch(oldPromptId);
              await oldPrompt.edit({
                  content: `✅️ Target for "${input3Label}": ${targetNumber}. **Scroll down**`,
                  embeds: [],
                  components: []
              });
              console.log(`[MessageCreate EDITED_OLD_PROMPT ${interactionIdForLog}] Edited previous 'input 3 target' prompt.`);
          } catch (editError) {
              console.warn(`[MessageCreate EDIT_OLD_PROMPT_FAIL ${interactionIdForLog}] Could not edit old prompt (ID: ${oldPromptId}). Error: ${editError.message}`);
          }
      }

      // Store data and transition state
      setupData.currentInputDefinition.goal = targetNumber;
      if (!setupData.inputs) setupData.inputs = [];
      setupData.inputs[2] = { ...setupData.currentInputDefinition };
      console.log(`[MessageCreate INPUT3_DEFINED ${interactionIdForLog}] User ${userTag} fully defined Input 3. All inputs defined.`);
      
      delete setupData.currentInputDefinition;
      delete setupData.aiGeneratedUnitSuggestionsForCurrentItem;
      setupData.dmFlowState = 'awaiting_metrics_confirmation';
      userExperimentSetupData.set(userId, setupData);
      
      // 2. SEND NEW prompt (The Review/Confirm step)
      // This logic is duplicated from the 'add_another_habit_no_btn' handler for consistency
      const formatGoalForDisplay = (goal, unit) => {
          const isTime = TIME_OF_DAY_KEYWORDS.includes(unit.toLowerCase().trim());
          return isTime ? formatDecimalAsTime(goal) : goal;
      };

      let summaryDescription = `**🌠 Deeper Wish:**\n${setupData.deeperProblem}\n\n` +
                              `**📊 Daily Outcome to Track:**\n\`${formatGoalForDisplay(setupData.outcomeGoal, setupData.outcomeUnit)}, ${setupData.outcomeUnit}, ${setupData.outcomeLabel}\`\n\n` +
                              `**🛠️ Daily Habits to Test:**\n`;
      setupData.inputs.forEach((input, index) => {
          if (input && input.label) {
              summaryDescription += `${index + 1}. \`${formatGoalForDisplay(input.goal, input.unit)}, ${input.unit}, ${input.label}\`\n`;
          }
      });

      const confirmEmbed = new EmbedBuilder()
        .setColor('#FFBF00') // Amber
        .setTitle('🔬 Review Your Experiment Metrics')
        .setDescription(summaryDescription + "\n\nDo these look correct? You can edit them now if needed.")
        .setFooter({ text: "Your settings are not saved until you select a duration." });

      const confirmButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('confirm_metrics_proceed_btn')
                .setLabel('✅ Looks Good')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('request_edit_metrics_modal_btn')
                .setLabel('✏️ Edit Metrics')
                .setStyle(ButtonStyle.Primary)
        );

      const newPromptMessage = await message.author.send({
        content: "Amazing, all 3 daily habits are defined! Here's the full summary of your experiment's metrics:",
        embeds: [confirmEmbed],
        components: [confirmButtons]
      });

      // 3. Update state with the new message ID
      setupData.lastPromptMessageId = newPromptMessage.id;
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate INPUT3_DEFINED_PROMPT_CONFIRM_EDIT ${interactionIdForLog}] Sent confirm/edit prompt. Stored new prompt ID ${newPromptMessage.id}.`);
    }


  console.log(`[MessageCreate DM_HANDLER END ${interactionIdForLog}] Finished DM processing for ${userTag}.`);
});

// ===== NEW MEMBER WELCOME SEQUENCE (Prompt to use /hi) =====
client.on(Events.GuildMemberAdd, async member => {
  if (member.user.bot) return;

  console.log(`[GuildMemberAdd] New member joined: ${member.user.tag} (ID: ${member.user.id}). Sending prompt to use /hi command.`);

  // --- IMPORTANT: Define WELCOME_CHANNEL_ID ---
  // Make sure WELCOME_CHANNEL_ID is defined, either from your .env or directly here if not already.
  // For example, if it's in your .env:
  // const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
  // Or hardcode it if you haven't set it up in .env for this specific ID:
  const SPECIFIC_WELCOME_CHANNEL_ID = '1363161131723526437'; // <<<< REPLACE THIS WITH YOUR ACTUAL CHANNEL ID

  if (!SPECIFIC_WELCOME_CHANNEL_ID) {
    console.error("[GuildMemberAdd] CRITICAL: WELCOME_CHANNEL_ID is not defined. Cannot send welcome prompt.");
    return;
  }

  const welcomeChannel = member.guild.channels.cache.get(SPECIFIC_WELCOME_CHANNEL_ID);
  if (!welcomeChannel || !welcomeChannel.isTextBased()) {
    console.error(`[GuildMemberAdd] Welcome channel ID ${SPECIFIC_WELCOME_CHANNEL_ID} not found or is not text-based for ${member.guild.name}. Cannot send /hi prompt for ${member.user.tag}.`);
    return;
  }

  try {
    const welcomePromptMessage = `🎉 Welcome to the Self Science Community, ${member}! 🎉\n\nTo get started, please type this:\n\n**/go**\n\n...and press Send (or enter).\n\nThen tap "Set Experiment" and "AI Assisted".`;

    await welcomeChannel.send(welcomePromptMessage);
    console.log(`[GuildMemberAdd] Sent /hi prompt to channel ${SPECIFIC_WELCOME_CHANNEL_ID} for ${member.user.tag}.`);

  } catch (error) {
    console.error(`[GuildMemberAdd] Failed to send /hi prompt to channel for ${member.user.tag}:`, error);
    if (error.code === 50013) { // Missing Permissions
        console.warn(`[GuildMemberAdd] Bot lacks permissions in welcome channel ${SPECIFIC_WELCOME_CHANNEL_ID}.`);
    }
  }
});
// ===== END NEW MEMBER WELCOME SEQUENCE =====

// ====== INTERACTION HANDLER ======
client.on(Events.InteractionCreate, async interaction => {
    const interactionEntryTimestamp = Date.now();
    const interactionEntryPerfNow = performance.now();
    const interactionTypeForLog = interaction.type; // <--- Correct: declare and assign here
    const userTagForLog = interaction.user?.tag || 'UnknownUser';
    const commandNameForLog = interaction.isChatInputCommand() ? interaction.commandName : (interaction.isButton() ? interaction.customId : 'N/A');


  console.log(`[InteractionListener ENTRY ${interaction.id}] Received. Type: ${interactionTypeForLog}, Name/ID: '${commandNameForLog}', User: ${userTagForLog}. WallTime: ${new Date(interactionEntryTimestamp).toISOString()}. PerfTime: ${interactionEntryPerfNow.toFixed(2)}ms.`);

  // --- START: ADD THIS NEW SECTION ---
    const interactionId = interaction.id; // Get the unique ID for this specific interaction event
    console.log(`\n--- InteractionCreate START [${interactionId}] ---`);
    console.log(`[${interactionId}] Timestamp: ${new Date().toISOString()}`);
    console.log(`[${interactionId}] Type: ${interaction.type}, Constructor: ${interaction.constructor.name}, User: ${interaction.user?.tag}`);
  if (interaction.isModalSubmit()) {
        console.log(`[${interactionId}] Modal Custom ID: ${interaction.customId}`);
    } else if (interaction.isButton()) {
        console.log(`[${interactionId}] Button Custom ID: ${interaction.customId}`);
    } else if (interaction.isChatInputCommand()){
        console.log(`[${interactionId}] Command Name: ${interaction.commandName}`);
    }
    // --- END: ADD THIS NEW SECTION ---

  console.log(`[NEW TEST] Top of InteractionCreate: typeof interaction.showModal = ${typeof interaction.showModal}, constructor: ${interaction.constructor.name}`);
  const interactionStartTime = performance.now();

  console.log(`[NEW TEST] Interaction received. Type: ${interaction.type}, Constructor: ${interaction.constructor.name}`);
  if (interaction.constructor.name === 'ModalSubmitInteraction') {
    console.log(`[NEW TEST] For ModalSubmit: typeof interaction.showModal = ${typeof interaction.showModal}`);
    // Let's see what methods it *does* have from a typical Interaction
    console.log(`[NEW TEST] For ModalSubmit: typeof interaction.reply = ${typeof interaction.reply}`);
    console.log(`[NEW TEST] For ModalSubmit: typeof interaction.deferReply = ${typeof interaction.deferReply}`);
    console.log(`[NEW TEST] For ModalSubmit: typeof interaction.editReply = ${typeof interaction.editReply}`);
    console.log(`[NEW TEST] For ModalSubmit: typeof interaction.followUp = ${typeof interaction.followUp}`);
    console.log(`[NEW TEST] For ModalSubmit: typeof interaction.isModalSubmit = ${typeof interaction.isModalSubmit}`); // Should be true
    // Log the object itself to inspect its structure. This might be very verbose.
    // Consider if you want to do this, as it might flood your console.
    // console.log('[NEW TEST] Raw ModalSubmitInteraction object:', interaction);
  } else if (interaction.constructor.name === 'ButtonInteraction') {
     console.log(`[NEW TEST] For Button: typeof interaction.showModal = ${typeof interaction.showModal}`);
  }

  console.log(`⚡ Received interaction:`, {
    type: interaction.type,
    isCommand: interaction.isChatInputCommand?.(),
    command: interaction.commandName,
    user: interaction.user?.tag
  });

   if (interaction.isChatInputCommand()) {
      try {
        const commandStartTime = performance.now();
        console.log(`[${interaction.commandName}] Command processing started at: ${commandStartTime.toFixed(2)}ms (Delta from interaction start: ${(commandStartTime - interactionStartTime).toFixed(2)}ms)`);
        switch (interaction.commandName) {

          case 'streak': {
            // Defer reply to acknowledge the command quickly
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            try {
              // Call the new Firebase function using your helper
              // The 'callFirebaseFunction' helper handles authentication.
              // 'getStreakData' is the name of the function you added to functions/index.js
              // No data payload is needed for getStreakData, so we pass an empty object {}.
              console.log(`[/streak] Calling getStreakData Firebase function for User: ${interaction.user.id}`);
              const result = await callFirebaseFunction(
                'getStreakData',   // Name of the Firebase function
                {},                // No data payload needed for this function
                interaction.user.id  // Pass the interacting user's ID
              );
              console.log(`[/streak] Received response from getStreakData:`, result);

              // Check if the Firebase function was successful and returned a message
              if (result && result.success === true && typeof result.message === 'string') {
                await interaction.editReply({
                  content: result.message, // Display the message from the Firebase function
                  // flags: MessageFlags.Ephemeral is already set by deferReply
                });
              } else {
                // Handle cases where the function might not return success:true or a message
                console.error(`[/streak] getStreakData function call did not return expected success or message. Result:`, result);
                await interaction.editReply({
                  content: "❌ Could not retrieve your streak information at this time. (Unexpected response)",
                });
              }
            } catch (error) {
              // This catch block handles errors from 'callFirebaseFunction'
              // (e.g., Firebase authentication errors, function execution errors, network errors)
              console.error(`[/streak] Error executing /streak for User ${interaction.user.id}:`, error);
              await interaction.editReply({
                content: `❌ An error occurred while fetching your streak: ${error.message || 'Please try again.'}`,
              });
            }
            break; // Make sure to break after the case
          }

          case 'leaderboard': {
            // Defer immediately for better UX
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // --- New code using Firebase helper ---
            try {
              // Call the Firebase function using the helper
              // `result` here will be the data returned by the Firebase function
              // (which should include { success: true, message: "...", ... })
              const result = await callFirebaseFunction(
                'getLeaderboard', // Name of the callable function in Firebase
                {},               // No data payload needed for getLeaderboard
                interaction.user.id // Pass the interacting user's ID for authentication
              );

              // Check the success status & message from the Firebase function's return value
              // Our getLeaderboard function returns { success: true, message: '...' }
              if (!result || !result.success || typeof result.message === 'undefined') {
                // If the function failed internally or returned unexpected data
                console.error("Leaderboard function failed or returned unexpected data:", result);
                // Use the error message from Firebase if available, otherwise generic
                throw new Error(result?.message || "Received an unexpected response from the leaderboard service.");
              }

              // Display the message prepared by the Firebase function
              await interaction.editReply({
                content: result.message, // Use the message directly from the Firebase function response
                flags: MessageFlags.Ephemeral
              });

            } catch (error) {
              // Catch errors from callFirebaseFunction (auth errors, function execution errors, network errors)
              console.error(`Error executing /leaderboard for user ${interaction.user.id}:`, error);
              await interaction.editReply({
                // Display the error message thrown by callFirebaseFunction or the catch block above
                content: `❌ Could not retrieve leaderboard. ${error.message || 'Please try again later.'}`,
                flags: MessageFlags.Ephemeral
              });
            }
            // --- End of new code ---
            break; // Ensure break statement is present
          } // End case 'leaderboard'

          // ****** START of REPLACEMENT for 'case exp:' block ******
          case 'go': { // <<< RENAMED from 'exp'
            const goCommandStartTime = performance.now();
            console.log(`[/go] Command received. User: ${interaction.user.tag}, InteractionID: ${interaction.id}. Time: ${goCommandStartTime.toFixed(2)}ms.`);

          try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const goDeferSuccessTime = performance.now();
            console.log(`[/go] Deferral took: ${(goDeferSuccessTime - goCommandStartTime).toFixed(2)}ms.`);

            // ===== START MODIFIED PRE-FETCH for /go =====
            (async () => {
                const GO_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours for /go's own cache refresh
                const userId = interaction.user.id;
                const userTag = interaction.user.tag;
                const interactionId = interaction.id;

                try {
                    const existingSetupData = userExperimentSetupData.get(userId) || {};
                    const currentCachedTime = existingSetupData?.preFetchedWeeklySettingsTimestamp;

                    if (existingSetupData?.preFetchedWeeklySettings && currentCachedTime && (Date.now() - currentCachedTime < GO_CACHE_MAX_AGE_MS)) {
                        console.log(`[/go ASYNC_PREFETCH_USE_CACHE ${interactionId}] Using existing recent pre-fetched settings for ${userTag}.`);
                    } else {
                        console.log(`[/go ASYNC_PREFETCH_REFRESH ${interactionId}] No recent pre-fetched settings for ${userTag} or cache is stale. Asynchronously pre-fetching.`);
                        
                        const settingsResult = await callFirebaseFunction('getWeeklySettings', {}, userId);
                        
                        // Use the most current version of setupData before modifying
                        const dataToStore = userExperimentSetupData.get(userId) || {}; 

                        if (settingsResult && settingsResult.settings) {
                            // NEW: Check for time metrics here
                            const settings = settingsResult.settings;
                            const metrics = [settings.output, settings.input1, settings.input2, settings.input3].filter(Boolean);
                            // The TIME_OF_DAY_KEYWORDS constant is defined globally in your file
                            const isTimeMetric = (unit) => {
                                if (!unit) return false;
                                const lowerUnit = unit.toLowerCase().trim();
                                return TIME_OF_DAY_KEYWORDS.includes(lowerUnit);
                            };
                            const hasTimeMetrics = metrics.some(metric => isTimeMetric(metric.unit));

                            // Store both the settings AND the time metrics flag
                            userExperimentSetupData.set(userId, {
                                ...dataToStore,
                                preFetchedWeeklySettings: settingsResult.settings,
                                logFlowHasTimeMetrics: hasTimeMetrics, 
                                preFetchedWeeklySettingsTimestamp: Date.now()
                            });
                            console.log(`[/go ASYNC_PREFETCH_SUCCESS ${interactionId}] Successfully pre-fetched settings for ${userTag}. Has Time Metrics: ${hasTimeMetrics}`);
                        } else {
                            // If no settings are returned, clear any old preFetched settings and the flag
                            delete dataToStore.preFetchedWeeklySettings;
                            delete dataToStore.preFetchedWeeklySettingsTimestamp;
                            delete dataToStore.logFlowHasTimeMetrics;
                            userExperimentSetupData.set(userId, dataToStore);
                            console.log(`[/go ASYNC_PREFETCH_NO_DATA ${interactionId}] No weekly settings found for ${userTag}. Cleared cache.`);
                        }
                    }
                } catch (fetchError) {
                    console.error(`[/go ASYNC_PREFETCH_ERROR ${interactionId}] Error pre-fetching weekly settings for ${userTag}:`, fetchError.message);
                    const dataToClearOnError = userExperimentSetupData.get(userId) || {};
                    delete dataToClearOnError.preFetchedWeeklySettings;
                    delete dataToClearOnError.preFetchedWeeklySettingsTimestamp;
                    delete dataToClearOnError.logFlowHasTimeMetrics;
                    userExperimentSetupData.set(userId, dataToClearOnError);
                }
            })();
            // ===== END MODIFIED PRE-FETCH for /go =====

            // --- Create an Embed for the Go Hub message ---
            const goHubEmbed = new EmbedBuilder()
              .setColor('#7F00FF') // A nice vibrant purple, change as you like
              .setTitle('⚡ Go Hub 🚀')
              .setDescription('Your experiment control panel')
              //.addFields(
                  //{ name: '🔬 Set Experiment', value: 'Define your goals & metrics.', inline: true },
                  //{ name: '✍️ Daily Log', value: 'Log your metrics & notes.', inline: true },
                  //{ name: '🔥 Streak Stats', value: 'View your streak and the leaderboard.', inline: true },
                  //{ name: '💡 AI Insights', value: 'Get AI-powered analysis of your data.', inline: true }
              //)

            // --- Build the Go Hub buttons ---
            const setExperimentButton = new ButtonBuilder()
              .setCustomId('set_update_experiment_btn')
              .setLabel('🔬 Set Experiment')
              .setStyle(ButtonStyle.Primary);

            const logProgressButton = new ButtonBuilder()
              .setCustomId('log_daily_progress_btn')
              .setLabel('✍️ Log Data')
              .setStyle(ButtonStyle.Success);

           /*
              const streakCenterButton = new ButtonBuilder()
              .setCustomId('streak_center_btn')
              .setLabel('🔥 Streak Progress')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true); // Disabled for now
        
            const insightsButton = new ButtonBuilder()
              .setCustomId('ai_insights_btn')
              .setLabel('💡 AI Insights')
              .setStyle(ButtonStyle.Secondary);
            */

            const row1 = new ActionRowBuilder().addComponents(setExperimentButton, logProgressButton);
            // const row2 = new ActionRowBuilder().addComponents(streakCenterButton, insightsButton);

            await interaction.editReply({
              embeds: [goHubEmbed], // Send the embed
              components: [row1], //, row2 removed
            });
            console.log(`[/go] Hub displayed successfully for ${interaction.user.tag}.`);

          } catch (error) {
            console.error(`Error handling /go command for ${interaction.user.tag}: ${error?.code || 'Unknown'}`, error);
            if (interaction.deferred && !interaction.replied) {
              try {
                await interaction.editReply({
                  content: '❌ Oops! Something went wrong displaying the Go Hub. Please try the `/go` command again.',
                  embeds: [], // Clear embeds on error
                  components: []
                });
              } catch (editError) {
                console.error("Error sending fallback editReply for /go:", editError);
              }
            }
          }
          break;
          }

          case 'hi': { // Handler for the new /hi command
              const hiCommandStartTime = performance.now();
              const interactionId = interaction.id;
              console.log(`[/hi START ${interactionId}] command invoked by ${interaction.user.tag}. Time: ${hiCommandStartTime.toFixed(2)}ms`);
              try {
                // === REUSE YOUR EXISTING welcomeEmbed1 DEFINITION ===
                // Make sure your existing welcomeEmbed1 is defined and accessible here.
                // For example, if it's defined globally or you can re-instantiate it:
                const welcomeEmbed1 = new EmbedBuilder() // Or however you defined it
                  .setColor('#57F287')
                  .setTitle('👋 Welcome to the Self Science Community!')
                  .setDescription("You're a fledgling Self Scientist, about to start your 1st experiment!")
                  .setImage('https://raw.githubusercontent.com/dwolovsky/discord-logger-bot/5ac4984b6b71a4781f3a787934d8cc6ca3b7f909/Active%20Pictures/Fledgling%20Self%20Scientist.jpeg');

                // === CREATE/REUSE YOUR BUTTON (ensure new Custom ID) ===
                const nextButton1 = new ButtonBuilder() // Or however you defined it
                  .setCustomId('welcome_ephemeral_next_1') // **NEW Custom ID for this flow**
                  .setLabel('Next Step') // Or your existing label e.g., "Next"
                  .setStyle(ButtonStyle.Primary);

                const row1 = new ActionRowBuilder().addComponents(nextButton1);

                await interaction.reply({
                  embeds: [welcomeEmbed1], // Your existing embed
                  components: [row1],
                  ephemeral: true // This makes the message visible only to the user who typed /hi
                });
                const replyTime = performance.now();
                console.log(`[/hi SUCCESS ${interactionId}] Sent ephemeral welcome step 1 to ${interaction.user.tag}. Took: ${(replyTime - hiCommandStartTime).toFixed(2)}ms`);

              } catch (error) {
                const errorTime = performance.now();
                console.error(`[/hi ERROR ${interactionId}] Error sending ephemeral welcome step 1 at ${errorTime.toFixed(2)}ms:`, error);
                if (!interaction.replied && !interaction.deferred) {
                  try {
                      await interaction.reply({ content: "Sorry, I couldn't start the welcome sequence. Please try the `/hi` command again.", ephemeral: true });
                  } catch (e) { console.error(`[/hi FALLBACK_ERROR_REPLY_FAIL ${interactionId}]`, e); }
                } else {
                  try {
                      await interaction.followUp({ content: "Sorry, I couldn't start the welcome sequence. Please try the `/hi` command again.", ephemeral: true });
                  } catch (e) { console.error(`[/hi FALLBACK_ERROR_FOLLOWUP_FAIL ${interactionId}]`, e); }
                }
              }
              break;
            } // End case 'hi'

          default: {
            console.warn('⚠️ Unrecognized command:', interaction.commandName);
            return await interaction.reply({
              content: '🤔 Unknown command. Please try again or contact support.',
              flags: MessageFlags.Ephemeral
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
              flags: MessageFlags.Ephemeral
            });
          } catch (fallbackError) {
            console.error('⚠️ Failed to send fallback error reply:', fallbackError);
          }
        }
      }
    } // end of isChatInputCommand if
    
  // --- Button Interaction Handler ---
  else if (interaction.isButton()) {
    // Optional: Add performance logging if desired
    // const buttonStartTime = performance.now();
    // console.log(`⚡ Received button interaction: ${interaction.customId} from ${interaction.user.tag} at ${buttonStartTime.toFixed(2)}ms`);
    if (interaction.customId === 'set_update_experiment_btn') {
            const handlerEntryPerfNow = performance.now();

            // ======================= MODIFICATION START =======================
            // CAPTURE USER AND GUILD IDENTIFIERS IMMEDIATELY
            const userIdForChoice = interaction.user.id;
            const userTagForChoice = interaction.user.tag;
            const guildIdForChoice = interaction.guild?.id; // Use optional chaining for safety, though guild should exist here
            const interactionIdForChoiceLog = interaction.id; // For logging this specific interaction event

            console.log(`[${interaction.customId} HANDLER_ENTRY ${interactionIdForChoiceLog}] User: ${userTagForChoice} (${userIdForChoice}), Guild: ${guildIdForChoice}. PerfTime: ${handlerEntryPerfNow.toFixed(2)}ms.`);

            // CRITICAL CHECK: Ensure guildId was captured
            if (!guildIdForChoice) {
                console.error(`[${interaction.customId} CRITICAL_ERROR ${interactionIdForChoiceLog}] Guild ID is null for 'set_update_experiment_btn'. This button should only be available in a guild.`);
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({ content: "Error: This action can only be performed in a server. Please try again from within a server channel.", ephemeral: true });
                    } else {
                        // If already deferred/replied, try followup
                        await interaction.followUp({ content: "Error: This action can only be performed in a server. Please try again from within a server channel.", ephemeral: true });
                    }
                } catch (replyError) {
                    console.error(`[${interaction.customId} CRITICAL_ERROR_REPLY_FAIL ${interactionIdForChoiceLog}] Failed to send guild ID error reply/followUp:`, replyError);
                }
                return; // Stop processing
            }
            // ======================= MODIFICATION END =========================

            try {
                // NEW LOGGING: Before Defer
                const beforeDeferPerfNow = performance.now();
                console.log(`[${interaction.customId} PRE_DEFER ${interactionIdForChoiceLog}] About to call deferUpdate. PerfTime: ${beforeDeferPerfNow.toFixed(2)}ms. DeltaFromHandlerEntry: ${(beforeDeferPerfNow - handlerEntryPerfNow).toFixed(2)}ms.`);

                await interaction.deferUpdate(); // Corrected: No flags for deferUpdate
                const afterDeferPerfNow = performance.now();
                console.log(`[${interaction.customId} POST_DEFER_SUCCESS ${interactionIdForChoiceLog}] deferUpdate successful. PerfTime: ${afterDeferPerfNow.toFixed(2)}ms. DeferCallDuration: ${(afterDeferPerfNow - beforeDeferPerfNow).toFixed(2)}ms.`);

                // ======================= MODIFICATION START =======================
                // INITIALIZE OR UPDATE userExperimentSetupData WITH CAPTURED IDs
                const existingData = userExperimentSetupData.get(userIdForChoice) || {};
                userExperimentSetupData.set(userIdForChoice, {
                    ...existingData, // Preserve other data if any (e.g., if restarting a flow)
                    userId: userIdForChoice,         // Store the captured userId
                    guildId: guildIdForChoice,       // Store the captured guildId
                    userTag: userTagForChoice,       // Store the captured userTag for convenience
                    currentFlowInitiationInteractionId: interactionIdForChoiceLog // Optional: log the interaction ID that started/reset this flow
                    // Clear any stale flow-specific data if this is a true restart point for setup
                    // dmFlowState: null, // Example: uncomment to reset DM flow
                    // experimentDuration: null, // etc.
                });
                console.log(`[${interaction.customId} SETUP_DATA_INIT ${interactionIdForChoiceLog}] Initialized/Updated setupData for user ${userIdForChoice} with userId, guildId, userTag.`);
                // ======================= MODIFICATION END =========================

                const choiceEmbed = new EmbedBuilder()
                    .setColor('#7F00FF')
                    .setTitle('🔬 Want some AI help? ✨')
                    //.setDescription("**AI Assisted (Beginner):**\nI'll guide you step-by-step, starting with a wish and helping you define your experiment with AI examples.\n\n✍️ **Manual Setup (Advanced):** You'll fill out a form with all your experiment details directly."); // [cite: 1773]
                const aiButton = new ButtonBuilder()
                    .setCustomId(AI_ASSISTED_SETUP_BTN_ID)
                    .setLabel('✨ AI Assisted Setup (Beginner)')
                    .setStyle(ButtonStyle.Primary); // [cite: 1774]
                const manualButton = new ButtonBuilder()
                    .setCustomId(MANUAL_SETUP_BTN_ID)
                    .setLabel('✍️ Manual Setup (Advanced)')
                    .setStyle(ButtonStyle.Secondary); // [cite: 1775]
                const choiceRow = new ActionRowBuilder().addComponents(aiButton, manualButton); // [cite: 1776]

                const beforeEditReplyPerfNow = performance.now();
                console.log(`[${interaction.customId} PRE_EDIT_REPLY ${interactionIdForChoiceLog}] About to call editReply. PerfTime: ${beforeEditReplyPerfNow.toFixed(2)}ms. DeltaFromDeferSuccess: ${(beforeEditReplyPerfNow - afterDeferPerfNow).toFixed(2)}ms.`);
                await interaction.editReply({
                    content: '',
                    embeds: [choiceEmbed],
                    components: [choiceRow]
                }); //
                const afterEditReplyPerfNow = performance.now();
                console.log(`[${interaction.customId} POST_EDIT_REPLY_SUCCESS ${interactionIdForChoiceLog}] editReply successful. PerfTime: ${afterEditReplyPerfNow.toFixed(2)}ms. EditReplyCallDuration: ${(afterEditReplyPerfNow - beforeEditReplyPerfNow).toFixed(2)}ms.`);

                // Async pre-fetch logic
                (async () => {
                    const prefetchAsyncStartTime = performance.now();
                    try {
                        console.log(`[${interaction.customId} ASYNC_PREFETCH_START ${interactionIdForChoiceLog}] Asynchronously pre-fetching weekly settings for ${userTagForChoice}. PerfTime: ${prefetchAsyncStartTime.toFixed(2)}ms.`);
                        const settingsResult = await callFirebaseFunction('getWeeklySettings', {}, userIdForChoice); // Use captured userIdForChoice

                        // Retrieve the latest setupData again before modifying to avoid race conditions if other async operations were to modify it (unlikely here but good practice)
                        const currentSetupDataForPrefetch = userExperimentSetupData.get(userIdForChoice) || { userId: userIdForChoice, guildId: guildIdForChoice, userTag: userTagForChoice };

                        if (settingsResult && settingsResult.settings) {
                            userExperimentSetupData.set(userIdForChoice, { ...currentSetupDataForPrefetch, weeklySettings: settingsResult.settings });
                            console.log(`[${interaction.customId} ASYNC_PREFETCH_SUCCESS ${interactionIdForChoiceLog}] Successfully pre-fetched and cached weekly settings for ${userTagForChoice}.`);
                        } else {
                            const { weeklySettings, ...restOfData } = currentSetupDataForPrefetch; // Remove weeklySettings if not found/null
                            userExperimentSetupData.set(userIdForChoice, restOfData);
                            console.log(`[${interaction.customId} ASYNC_PREFETCH_NO_DATA ${interactionIdForChoiceLog}] No weekly settings found or returned for ${userTagForChoice} during async pre-fetch.`);
                        }
                    } catch (fetchError) {
                        // Ensure essential IDs are not lost if prefetch fails
                        const currentSetupDataOnError = userExperimentSetupData.get(userIdForChoice) || { userId: userIdForChoice, guildId: guildIdForChoice, userTag: userTagForChoice };
                        const { weeklySettings, ...restOfDataOnError } = currentSetupDataOnError;
                        userExperimentSetupData.set(userIdForChoice, restOfDataOnError);
                        console.error(`[${interaction.customId} ASYNC_PREFETCH_ERROR ${interactionIdForChoiceLog}] Error pre-fetching weekly settings asynchronously for ${userTagForChoice}:`, fetchError.message);
                    } finally {
                        const prefetchAsyncEndTime = performance.now();
                        console.log(`[${interaction.customId} ASYNC_PREFETCH_DURATION ${interactionIdForChoiceLog}] Async pre-fetching settings took: ${(prefetchAsyncEndTime - prefetchAsyncStartTime).toFixed(2)}ms for ${userTagForChoice}.`);
                    }
                })();

            } catch (error) {
                const handlerErrorPerfNow = performance.now();
                console.error(`[${interaction.customId} HANDLER_ERROR ${interactionIdForChoiceLog}] Error in main try block for ${userTagForChoice}. PerfTime: ${handlerErrorPerfNow.toFixed(2)}ms. DeltaFromHandlerEntry: ${(handlerErrorPerfNow - handlerEntryPerfNow).toFixed(2)}ms. Error:`, error);
                try {
                    if (interaction.deferred && !interaction.replied) {
                        await interaction.editReply({
                            content: `❌ Oops! Something went wrong when trying to show setup options. (Error Code: ${error.code || 'N/A'}) Please try clicking "🔬 Set Experiment" again.`,
                            embeds: [],
                            components: []
                        });
                    } else if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: `❌ Oops! A problem occurred very early processing this action. Please try again. (Code: ${error.code || 'N/A'})`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                } catch (fallbackError) {
                    console.error(`[${interaction.customId} FALLBACK_REPLY_ERROR ${interactionIdForChoiceLog}] Fallback error reply failed for ${userTagForChoice}:`, fallbackError);
                }
            }
            const handlerEndPerfNow = performance.now();
            console.log(`[${interaction.customId} HANDLER_END ${interactionIdForChoiceLog}] User: ${userTagForChoice}. PerfTime: ${handlerEndPerfNow.toFixed(2)}ms. TotalInHandler: ${(handlerEndPerfNow - handlerEntryPerfNow).toFixed(2)}ms.`);
        } // End of 'set_update_experiment_btn' handler
    
      else if (interaction.isButton() && interaction.customId.startsWith('back_to:')) {
        const interactionId = interaction.id;
        const userId = interaction.user.id;
        
        try {
            await interaction.deferUpdate();
            const setupData = userExperimentSetupData.get(userId);

            if (!setupData) {
                await interaction.editReply({ content: "Your session has expired. Please start over with `/go`.", components: [], embeds: [] });
                return;
            }

            // --- NEW: Delete the previous confirmation message ---
            const confirmationMsgId = setupData.lastConfirmationMessageId;
            if (confirmationMsgId) {
                try {
                    const msgToDelete = await interaction.channel.messages.fetch(confirmationMsgId);
                    await msgToDelete.delete();
                    console.log(`[Dynamic Back Button ${interactionId}] Deleted previous confirmation message ${confirmationMsgId}.`);
                    delete setupData.lastConfirmationMessageId; // Clean up the ID after use
                } catch (deleteError) {
                    // This is not a critical error, the message might have been deleted manually.
                    console.warn(`[Dynamic Back Button ${interactionId}] Could not delete confirmation message ${confirmationMsgId}. It may have already been removed.`);
                }
            }
            // --- END NEW SECTION ---

            // 1. Determine the destination state from the button's ID
            const destinationState = interaction.customId.split(':')[1];
            
            // 2. Look up the configuration for the state we are going back TO
            const configForDestination = dmFlowConfig[destinationState];
            if (!configForDestination) {
                console.error(`[Dynamic Back Button ${interactionId}] No dmFlowConfig found for destination state: ${destinationState}`);
                await interaction.editReply({ content: "Error: Cannot find the configuration for the previous step. Please restart the setup.", components: [], embeds: [] });
                return;
            }
            const fieldsToClear = configForDestination.fieldsToClear || [];
            
            console.log(`[Dynamic Back Button ${interactionId}] User ${userId} going to ${destinationState}. Clearing fields: ${fieldsToClear.join(', ')}`);

            // 3. Update the setupData object by removing the specified fields
            for (const field of fieldsToClear) {
                delete setupData[field];
            }

            // 4. Update to the new (previous) state
            setupData.dmFlowState = destinationState;
            userExperimentSetupData.set(userId, setupData);

            // 5. Get the prompt for the destination state from our config
            const step = dmFlowConfig[destinationState];
            if (!step || typeof step.prompt !== 'function') {
                await interaction.editReply({ content: "Error: Cannot generate the prompt for the previous step. Please restart the setup.", components: [], embeds: [] });
                return;
            }

            // 6. Generate the content, embeds, and components for the previous step
            const { content, embeds, components } = step.prompt(setupData);

            // 7. Update the message (the one the 'Back' button was on) to show the previous step's prompt
            await interaction.editReply({ content, embeds: embeds || [], components: components || [] });

        } catch (error) {
            console.error(`[Dynamic Back Button ERROR ${interactionId}]`, error);
            if (interaction.deferred || interaction.replied) {
                try { await interaction.editReply({ content: "An error occurred while going back. Please try again.", components:[], embeds:[] }); } catch (e) { /* ignore */ }
            } else {
                 try { await interaction.reply({ content: "An error occurred while going back. Please try again.", ephemeral: true }); } catch (e) { /* ignore */ }
            }
        }
    }
    
    // New handler for the first button in the ephemeral welcome sequence
    else if (interaction.customId === 'welcome_ephemeral_next_1') {
      const buttonClickTime = performance.now();
      const interactionId = interaction.id;
      console.log(`[Button welcome_ephemeral_next_1 START ${interactionId}] clicked by ${interaction.user.tag}. Time: ${buttonClickTime.toFixed(2)}ms`);
      try {
        // === REUSE YOUR EXISTING welcomeEmbed2 DEFINITION ===
        const welcomeEmbed2 = new EmbedBuilder() // Or however you defined it
          .setColor('#57F287')
          .setTitle('🔬 How Experiments Improve Your Life')
          .setDescription(
            "Self Scientists run habit experiments to improve our lives.\n\nHere are the steps\n(see the comic below too).\n\n" +
            "1. Start with a wish to improve your life.\n\n" +
            "2. AI helps you turn it into a trackable metric.\n\n" +
            "3. Pick 1 - 3 habits to test.\nLog your stats each day\n(takes 2 mins).\n\n" +
            "4. At the end of the experiment,\nyou get stats and AI insights.\n\n" +
            "Then you use those insights\nto make your habits\neasier and better for YOU."
          )
          .setImage('https://raw.githubusercontent.com/dwolovsky/discord-logger-bot/refs/heads/firebase-migration/Active%20Pictures/experiment%20lifecycle%20comic%202.jpeg');

        // === CREATE/REUSE YOUR BUTTON (ensure new Custom ID) ===
        const nextButton2 = new ButtonBuilder() // Or however you defined it
          .setCustomId('welcome_ephemeral_next_2') // **NEW Custom ID for the next button**
          .setLabel('Next Step') // Or your existing label
          .setStyle(ButtonStyle.Primary);

        const row2 = new ActionRowBuilder().addComponents(nextButton2);

        await interaction.update({ // This updates the existing ephemeral message
          embeds: [welcomeEmbed2], // Your existing embed
          components: [row2],
          ephemeral: true // Keep it ephemeral
        });
        const updateTime = performance.now();
        console.log(`[Button welcome_ephemeral_next_1 SUCCESS ${interactionId}] Updated ephemeral message to step 2 for ${interaction.user.tag}. Took: ${(updateTime - buttonClickTime).toFixed(2)}ms`);
      } catch (error) {
        const errorTime = performance.now();
        console.error(`[Button welcome_ephemeral_next_1 ERROR ${interactionId}] Error updating to step 2 at ${errorTime.toFixed(2)}ms:`, error);
        try {
            if (interaction.replied || interaction.deferred) {
                 await interaction.followUp({content: "There was an issue showing the next step. Please try the `/hi` command again if you don't see an update.", ephemeral: true });
            } else {
                 await interaction.reply({content: "There was an issue showing the next step. Please try the `/hi` command again.", ephemeral: true });
            }
        } catch (e) { console.error(`[Button welcome_ephemeral_next_1 FALLBACK_ERROR ${interactionId}]`, e);}
      }
    }

    // New handler for the second button in the ephemeral welcome sequence
    else if (interaction.customId === 'welcome_ephemeral_next_2') {
      const buttonClickTime = performance.now();
      const interactionId = interaction.id;
      console.log(`[Button welcome_ephemeral_next_2 START ${interactionId}] clicked by ${interaction.user.tag}. Time: ${buttonClickTime.toFixed(2)}ms`);
      try {
        // === REUSE YOUR EXISTING welcomeEmbed3 DEFINITION ===
        const welcomeEmbed3 = new EmbedBuilder() // Or however you defined it
          .setColor('#57F287')
          .setTitle('🚀 Ready to Get Started?')
          .setDescription(
            "Type `/go` and press send. It'll open your Hub where you manage your experiments.\n\n" +
            "Good luck, Scientist!\n\nMessage the group or Davewolo directly if you have any questions."
          )
          .setImage('https://raw.githubusercontent.com/dwolovsky/discord-logger-bot/5ac4984b6b71a4781f3a787934d8cc6ca3b7f909/Active%20Pictures/Self%20Scientist%20Saluting.jpeg')
          .setFooter({ text: "Type /go and press send when ready!" });

        await interaction.update({ // Update to the final ephemeral message
          embeds: [welcomeEmbed3], // Your existing embed
          components: [], // No more buttons on the final step
          ephemeral: true // Keep it ephemeral
        });
        const updateTime = performance.now();
        console.log(`[Button welcome_ephemeral_next_2 SUCCESS ${interactionId}] Updated ephemeral message to final step for ${interaction.user.tag}. Took: ${(updateTime - buttonClickTime).toFixed(2)}ms`);
      } catch (error) {
        const errorTime = performance.now();
        console.error(`[Button welcome_ephemeral_next_2 ERROR ${interactionId}] Error updating to final step at ${errorTime.toFixed(2)}ms:`, error);
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({content: "There was an issue showing the final welcome message. You can now use the `/go` command.", ephemeral: true });
            } else {
                await interaction.reply({content: "There was an issue showing the final welcome message. You can now use the `/go` command.", ephemeral: true });
            }
        } catch (e) { console.error(`[Button welcome_ephemeral_next_2 FALLBACK_ERROR ${interactionId}]`, e);}
      }
    }

    else if (interaction.customId === MANUAL_SETUP_BTN_ID) {
        const manualSetupStartTime = performance.now();
        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        const guildId = interaction.guild?.id;
        const interactionId = interaction.id;

        console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userTag}.`);

        if (!dbAdmin) {
            console.error(`[${interaction.customId} CRITICAL ${interactionId}] dbAdmin not initialized.`);
            try {
                await interaction.reply({ content: "Error: The bot cannot connect to the database. Please contact support.", ephemeral: true });
            } catch (e) { console.error(`[${interaction.customId} CRITICAL_REPLY_FAIL ${interactionId}]`, e); }
            return;
        }
        if (!guildId) {
            console.error(`[${interaction.customId} CRITICAL ${interactionId}] Guild ID is missing.`);
            try {
                await interaction.reply({ content: "Error: Could not identify the server. This action must be performed within a server.", ephemeral: true });
            } catch (e) { console.error(`[${interaction.customId} GUILD_ID_FAIL_REPLY_FAIL ${interactionId}]`, e); }
            return;
        }

        try {
            // 1. Get pre-fetched data from the in-memory map, which was populated by the /go command handler.
            const setupData = userExperimentSetupData.get(userId) || {};
            const cachedSettings = setupData.preFetchedWeeklySettings;
            if(cachedSettings) {
                console.log(`[${interaction.customId} CACHE_HIT ${interactionId}] Using pre-fetched settings from /go command for ${userTag}.`);
            } else {
                console.log(`[${interaction.customId} CACHE_MISS ${interactionId}] No pre-fetched settings found in map for ${userTag}.`);
            }

            // 2. Prepare the initial state object
            const initialState = {
                ...setupData,
                flowType: 'MANUAL',
                interactionId: interactionId,
            };

            // 3. Update the in-memory map SYNCHRONOUSLY for immediate use.
            userExperimentSetupData.set(userId, initialState);
            console.log(`[${interaction.customId} IN_MEMORY_INIT ${interactionId}] Initialized in-memory state for ${userTag}.`);
            
            // 4. Prepare and show the modal immediately.
            let deeperProblemValue = "";
            let outcomeLabelValue = "";
            let outcomeUnitValue = "";
            let outcomeGoalValue = "";

            if (cachedSettings) {
                deeperProblemValue = cachedSettings.deeperProblem || "";
                if (cachedSettings.output) {
                    outcomeLabelValue = cachedSettings.output.label || "";
                    outcomeUnitValue = cachedSettings.output.unit || "";
                    outcomeGoalValue = cachedSettings.output.goal !== null && cachedSettings.output.goal !== undefined ? String(cachedSettings.output.goal) : "";
                }
            }

            const outcomeModal = new ModalBuilder()
                .setCustomId('manual_setup_outcome_modal')
                .setTitle('🧪 Experiment Setup (1/4): Outcome');

            const deeperProblemInput = new TextInputBuilder().setCustomId('deeper_problem_manual').setLabel("🧭 Deeper Wish / Problem To Solve").setPlaceholder("e.g., 'To be less stressed' or 'To have more energy.'").setStyle(TextInputStyle.Paragraph).setValue(deeperProblemValue).setRequired(true);
            const outcomeLabelInput = new TextInputBuilder().setCustomId('outcome_label_manual').setLabel("📊 Measurable Outcome (The Label)").setPlaceholder("e.g., 'Sleep Quality' or 'Energy Level'").setStyle(TextInputStyle.Short).setValue(outcomeLabelValue).setRequired(true);
            const outcomeUnitInput = new TextInputBuilder().setCustomId('outcome_unit_manual').setLabel("📏 Unit / Scale").setPlaceholder("e.g., 'hours', 'out of 10', 'tasks done'").setStyle(TextInputStyle.Short).setValue(outcomeUnitValue).setRequired(true);
            const outcomeGoalInput = new TextInputBuilder().setCustomId('outcome_goal_manual').setLabel("🎯 Daily Target Number").setPlaceholder("e.g., '7.5', '8', '3'").setStyle(TextInputStyle.Short).setValue(outcomeGoalValue).setRequired(true);

            outcomeModal.addComponents(
                new ActionRowBuilder().addComponents(deeperProblemInput),
                new ActionRowBuilder().addComponents(outcomeLabelInput),
                new ActionRowBuilder().addComponents(outcomeGoalInput),
                new ActionRowBuilder().addComponents(outcomeUnitInput)
                
            );

            await interaction.showModal(outcomeModal);
            const showModalTime = performance.now();
            console.log(`[${interaction.customId} MODAL_SHOWN ${interactionId}] Outcome modal shown to ${userTag}. Total time to show modal: ${(showModalTime - manualSetupStartTime).toFixed(2)}ms`);

            // 5. AFTER showing the modal, save the state to Firestore in the background.
            (async () => {
                try {
                    const setupStateRef = dbAdmin.collection('users').doc(userId).collection('inProgressFlows').doc('experimentSetup');
                    await setupStateRef.set({
                        ...initialState,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`[${interaction.customId} FIRESTORE_INIT_ASYNC ${interactionId}] Successfully initialized Firestore state for ${userTag} in the background.`);
                } catch (firestoreError) {
                    console.error(`[${interaction.customId} FIRESTORE_INIT_ASYNC_ERROR ${interactionId}] Failed to save initial state to Firestore for ${userTag} in the background:`, firestoreError);
                }
            })();

        } catch (error) {
            const errorTime = performance.now();
            console.error(`[${interaction.customId} ERROR ${interactionId}] Error in handler for ${userTag} at ${errorTime.toFixed(2)}ms:`, error);
        }
    }

    else if (interaction.customId === 'manual_continue_to_habit1_btn') {
        const buttonClickStartTime = performance.now();
        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        const interactionId = interaction.id;
        console.log(`[${interaction.customId} START ${interactionId}] Button clicked by ${userTag}.`);
        
        try {
            // Get state from the in-memory map first for speed.
            let setupData = userExperimentSetupData.get(userId);

            // Fallback: If in-memory map is empty (e.g., bot restarted), read from Firestore.
            if (!setupData) {
                console.warn(`[${interaction.customId} IN_MEMORY_MISS ${interactionId}] In-memory state not found for ${userTag}. Attempting Firestore fallback.`);
                if (dbAdmin) {
                    const setupStateRef = dbAdmin.collection('users').doc(userId).collection('inProgressFlows').doc('experimentSetup');
                    const setupStateSnap = await setupStateRef.get();
                    if (setupStateSnap.exists) {
                        setupData = setupStateSnap.data();
                        userExperimentSetupData.set(userId, setupData); // Repopulate in-memory map
                        console.log(`[${interaction.customId} FIRESTORE_FALLBACK_SUCCESS ${interactionId}] Successfully restored state from Firestore for ${userTag}.`);
                    }
                }
            }

            if (!setupData) {
                console.error(`[${interaction.customId} CRITICAL ${interactionId}] No setup state found in memory or Firestore for user ${userTag}.`);
                await interaction.reply({ content: '❌ Error: Your setup session has expired or is invalid. Please restart the setup by using the `/go` command.', ephemeral: true });
                return;
            }
            
            const cachedSettings = setupData.preFetchedWeeklySettings;
            let habit1LabelValue = "";
            let habit1UnitValue = "";
            let habit1GoalValue = "";
            if (cachedSettings && cachedSettings.input1) {
                console.log(`[${interaction.customId} CACHE_HIT ${interactionId}] Found cached settings for Habit 1 for ${userTag}.`);
                habit1LabelValue = cachedSettings.input1.label || "";
                habit1UnitValue = cachedSettings.input1.unit || "";
                habit1GoalValue = cachedSettings.input1.goal !== null && cachedSettings.input1.goal !== undefined ? String(cachedSettings.input1.goal) : "";
            }

            const habit1Modal = new ModalBuilder()
                .setCustomId('manual_setup_habit1_modal')
                .setTitle('🧪 Experiment Setup (2/4): Habit 1');
            const habit1LabelInput = new TextInputBuilder().setCustomId('habit1_label_manual').setLabel("🛠️ Daily Habit 1 (The Label)").setPlaceholder("e.g., '15-Min Afternoon Walk'").setStyle(TextInputStyle.Short).setValue(habit1LabelValue).setRequired(true);
            const habit1UnitInput = new TextInputBuilder().setCustomId('habit1_unit_manual').setLabel("📏 Unit / Scale").setPlaceholder("e.g., 'minutes', 'steps', 'yes/no'").setStyle(TextInputStyle.Short).setValue(habit1UnitValue).setRequired(true);
            const habit1GoalInput = new TextInputBuilder().setCustomId('habit1_goal_manual').setLabel("🎯 Daily Target Number").setPlaceholder("e.g., '15', '2000', '1'").setStyle(TextInputStyle.Short).setValue(habit1GoalValue).setRequired(true);
            
            habit1Modal.addComponents(
                new ActionRowBuilder().addComponents(habit1LabelInput),
                new ActionRowBuilder().addComponents(habit1GoalInput),
                new ActionRowBuilder().addComponents(habit1UnitInput)
            );
            
            await interaction.showModal(habit1Modal);
            const showModalTime = performance.now();
            console.log(`[${interaction.customId} MODAL_SHOWN ${interactionId}] Habit 1 modal shown to ${userTag}. Total time to show: ${(showModalTime - buttonClickStartTime).toFixed(2)}ms`);
        } catch (error) {
            const errorTime = performance.now();
            console.error(`[${interaction.customId} ERROR ${interactionId}] Error showing Habit 1 modal for ${userTag} at ${errorTime.toFixed(2)}ms:`, error);
        }
    }
   
    else if (interaction.customId === 'manual_add_another_habit_btn') {
        const buttonClickStartTime = performance.now();
        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        const interactionId = interaction.id;
        console.log(`[${interaction.customId} START ${interactionId}] Button clicked by ${userTag}.`);

        try {
            let setupData = userExperimentSetupData.get(userId);

            // Fallback to Firestore if in-memory data is missing
            if (!setupData) {
                console.warn(`[${interaction.customId} IN_MEMORY_MISS ${interactionId}] In-memory state not found for ${userTag}. Attempting Firestore fallback.`);
                if (dbAdmin) {
                    const setupStateRef = dbAdmin.collection('users').doc(userId).collection('inProgressFlows').doc('experimentSetup');
                    const setupStateSnap = await setupStateRef.get();
                    if (setupStateSnap.exists) {
                        setupData = setupStateSnap.data();
                        userExperimentSetupData.set(userId, setupData); // Repopulate in-memory map
                        console.log(`[${interaction.customId} FIRESTORE_FALLBACK_SUCCESS ${interactionId}] Successfully restored state from Firestore for ${userTag}.`);
                    }
                }
            }

            if (!setupData) {
                console.error(`[${interaction.customId} CRITICAL ${interactionId}] No setup state found for user ${userTag}.`);
                await interaction.reply({ content: '❌ Error: Your setup session has expired or is invalid. Please restart the setup.', ephemeral: true });
                return;
            }

            const currentHabitCount = setupData.inputs?.filter(Boolean).length || 0;
            console.log(`[${interaction.customId} INFO ${interactionId}] User has ${currentHabitCount} habits defined.`);

            if (currentHabitCount >= 3) {
                console.warn(`[${interaction.customId} WARN ${interactionId}] User tried to add more than 3 habits.`);
                await interaction.reply({ content: "You have already defined the maximum of 3 habits. Please click '✅ Finish Setup' to proceed.", ephemeral: true });
                return;
            }

            const nextHabitNumber = currentHabitCount + 1;
            const cachedSettings = setupData.preFetchedWeeklySettings;
            const cachedInputData = cachedSettings?.[`input${nextHabitNumber}`];

            let habitLabelValue = "";
            let habitUnitValue = "";
            let habitGoalValue = "";

            if (cachedInputData) {
                console.log(`[${interaction.customId} CACHE_HIT ${interactionId}] Found cached settings for Habit ${nextHabitNumber}.`);
                habitLabelValue = cachedInputData.label || "";
                habitUnitValue = cachedInputData.unit || "";
                habitGoalValue = cachedInputData.goal !== null && cachedInputData.goal !== undefined ? String(cachedInputData.goal) : "";
            } else {
                console.log(`[${interaction.customId} CACHE_MISS ${interactionId}] No cached settings for Habit ${nextHabitNumber}.`);
            }

            const habitModal = new ModalBuilder()
                .setCustomId(`manual_setup_habit${nextHabitNumber}_modal`)
                .setTitle(`🧪 Experiment Setup (${nextHabitNumber + 1}/4): Habit ${nextHabitNumber}`);

            const habitLabelInput = new TextInputBuilder().setCustomId(`habit${nextHabitNumber}_label_manual`).setLabel(`🛠️ Daily Habit ${nextHabitNumber} (The Label)`).setPlaceholder(`e.g., 'Read for 10 pages'`).setStyle(TextInputStyle.Short).setValue(habitLabelValue).setRequired(true);
            const habitUnitInput = new TextInputBuilder().setCustomId(`habit${nextHabitNumber}_unit_manual`).setLabel("📏 Unit / Scale").setPlaceholder("e.g., 'pages', 'yes/no'").setStyle(TextInputStyle.Short).setValue(habitUnitValue).setRequired(true);
            const habitGoalInput = new TextInputBuilder().setCustomId(`habit${nextHabitNumber}_goal_manual`).setLabel("🎯 Daily Target Number").setPlaceholder("e.g., '10', '1'").setStyle(TextInputStyle.Short).setValue(habitGoalValue).setRequired(true);
            
            habitModal.addComponents(
                new ActionRowBuilder().addComponents(habitLabelInput),
                new ActionRowBuilder().addComponents(habitGoalInput),
                new ActionRowBuilder().addComponents(habitUnitInput)
                
            );

            await interaction.showModal(habitModal);
            const showModalTime = performance.now();
            console.log(`[${interaction.customId} MODAL_SHOWN ${interactionId}] Habit ${nextHabitNumber} modal shown to ${userTag}. Total time: ${(showModalTime - buttonClickStartTime).toFixed(2)}ms`);

        } catch (error) {
            const errorTime = performance.now();
            console.error(`[${interaction.customId} ERROR ${interactionId}] Error showing Habit modal for ${userTag} at ${errorTime.toFixed(2)}ms:`, error);
        }
    }

    else if (interaction.customId === 'continue_to_manual_form_btn') {
      const continueButtonStartTime = performance.now();
      const userId = interaction.user.id;
      const userTag = interaction.user.tag;
      const interactionId = interaction.id;
      console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userTag}. Attempting to show manual experiment setup modal. Time: ${continueButtonStartTime.toFixed(2)}ms`);
      
      // Retrieve pre-fetched data
      const setupData = userExperimentSetupData.get(userId);
      // CORRECTED: Read from preFetchedWeeklySettings
      const cachedSettings = setupData?.preFetchedWeeklySettings; 
      const originalInteractionId = setupData?.interactionId; 

      console.log(`[${interaction.customId} CACHE_CHECK ${interactionId}] Checking for cached settings (key: preFetchedWeeklySettings) for ${userTag}. Original Interaction ID for this flow: ${originalInteractionId}`);
      let deeperProblemValue = "";
      let outputValue = "";
      let input1Value = "";
      let input2Value = "";
      let input3Value = "";
      
      if (cachedSettings) {
        console.log(`[${interaction.customId} CACHE_HIT ${interactionId}] Found cached settings (from preFetchedWeeklySettings) for ${userTag}. Populating modal fields.`);
        deeperProblemValue = cachedSettings.deeperProblem || "";

        const formatSettingToString = (setting) => {
          if (setting && typeof setting.label === 'string' && setting.label.trim() !== "" && setting.goal !== null && setting.unit !== undefined) {
            return `${setting.goal}, ${setting.unit}, ${setting.label}`;
          }
          return "";
        };

        outputValue = formatSettingToString(cachedSettings.output);
        input1Value = formatSettingToString(cachedSettings.input1);
        input2Value = formatSettingToString(cachedSettings.input2);
        input3Value = formatSettingToString(cachedSettings.input3);
      } else {
        console.log(`[${interaction.customId} CACHE_MISS ${interactionId}] No cached settings found (in preFetchedWeeklySettings) for ${userTag}. Modal will use placeholders.`);
      }

      try {
        const modal = new ModalBuilder()
          .setCustomId('experiment_setup_modal') 
          .setTitle('🧪 Set Weekly Experiment (Manual)');
        const deeperProblemInput = new TextInputBuilder()
          .setCustomId('deeper_problem')
          .setLabel("🧭 Deeper Wish?")
          .setPlaceholder("e.g. 'Reduce distractions' OR 'Go to sleep earlier.'")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);
        if (deeperProblemValue) deeperProblemInput.setValue(deeperProblemValue);

        const outputSettingInput = new TextInputBuilder()
          .setCustomId('output_setting')
          .setLabel("🎯 Daily Outcome (Goal #, Unit, Label)")
          .setPlaceholder("e.g. '7.5, hours, Sleep Quality'")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        if (outputValue) outputSettingInput.setValue(outputValue);

        const input1SettingInput = new TextInputBuilder()
          .setCustomId('input1_setting')
          .setLabel("🛠️ Daily Habit 1 (Goal #, Unit, Label)")
          .setPlaceholder("e.g. '15, minutes, Meditation'")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        if (input1Value) input1SettingInput.setValue(input1Value);

        const input2SettingInput = new TextInputBuilder()
          .setCustomId('input2_setting')
          .setLabel("🛠️ Daily Habit 2 (Optional - #, Unit, Label)")
          .setPlaceholder("e.g. '8, 0-10 effort, Relationships'")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        if (input2Value) input2SettingInput.setValue(input2Value);

        const input3SettingInput = new TextInputBuilder()
          .setCustomId('input3_setting')
          .setLabel("🛠️ Daily Habit 3 (Optional - #, Unit, Label)")
          .setPlaceholder("e.g. '10, glasses, Water'")
          .setStyle(TextInputStyle.Short)
          .setRequired(false);
        if (input3Value) input3SettingInput.setValue(input3Value);

        modal.addComponents(
          new ActionRowBuilder().addComponents(deeperProblemInput),
          new ActionRowBuilder().addComponents(outputSettingInput),
          new ActionRowBuilder().addComponents(input1SettingInput),
          new ActionRowBuilder().addComponents(input2SettingInput),
          new ActionRowBuilder().addComponents(input3SettingInput)
        );
        await interaction.showModal(modal);
        const showModalTime = performance.now();
        console.log(`[${interaction.customId} MODAL_SHOWN ${interactionId}] Manual setup modal shown to ${userTag}. Pre-population with cached data (if any from preFetchedWeeklySettings) complete. Took: ${(showModalTime - continueButtonStartTime).toFixed(2)}ms`);
      } catch (error) {
        const errorTime = performance.now();
        console.error(`[${interaction.customId} ERROR ${interactionId}] Error showing manual setup modal for ${userTag} at ${errorTime.toFixed(2)}ms:`, error);
        console.error(`[${interaction.customId} ERROR_DETAILS ${interactionId}] Error Name: ${error.name}, Message: ${error.message}, Code: ${error.code}`);
        if (error.stack) {
          console.error(`[${interaction.customId} ERROR_STACK ${interactionId}] Error Stack: ${error.stack}`);
        }
        if (!interaction.replied && !interaction.deferred) { 
            try {
                await interaction.reply({content: "Sorry, I couldn't open the manual setup form at this moment. Please try clicking 'Continue to Setup Form' again.", flags: MessageFlags.Ephemeral});
            } catch (replyError) {
                 console.error(`[${interaction.customId} FALLBACK_REPLY_ERROR ${interactionId}] Fallback error reply failed:`, replyError);
            }
        } else {
             try {
                await interaction.followUp({content: "Sorry, I couldn't open the manual setup form. Please try clicking 'Continue to Setup Form' again.", flags: MessageFlags.Ephemeral});
            } catch (followUpError) {
                 console.error(`[${interaction.customId} FALLBACK_FOLLOWUP_ERROR ${interactionId}] Fallback error followup failed:`, followUpError);
            }
        }
      }
      const handlerEndPerfNow = performance.now();
      console.log(`[${interaction.customId} END ${interactionId}] User: ${userTag}. TotalInHandler: ${(handlerEndPerfNow - continueButtonStartTime).toFixed(2)}ms.`);
    } 

    else if (interaction.customId === 'manual_finish_setup_btn') {
        const buttonClickStartTime = performance.now();
        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        const interactionId = interaction.id;
        console.log(`[${interaction.customId} START ${interactionId}] Button clicked by ${userTag}. Finalizing and saving manual setup.`);

        if (!dbAdmin) {
            console.error(`[${interaction.customId} CRITICAL ${interactionId}] dbAdmin not initialized.`);
            try {
                await interaction.reply({ content: "Error: The bot cannot connect to the database. Please contact support.", ephemeral: true });
            } catch (e) { console.error(`[${interaction.customId} CRITICAL_REPLY_FAIL ${interactionId}]`, e); }
            return;
        }

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const deferTime = performance.now();
            console.log(`[${interaction.customId} DEFERRED ${interactionId}] Reply deferred. Took: ${(deferTime - buttonClickStartTime).toFixed(2)}ms`);

            let setupData = userExperimentSetupData.get(userId);

            // Fallback to Firestore if in-memory data is missing
            if (!setupData) {
                console.warn(`[${interaction.customId} IN_MEMORY_MISS ${interactionId}] In-memory state not found for ${userTag}. Attempting Firestore fallback.`);
                const setupStateRef = dbAdmin.collection('users').doc(userId).collection('inProgressFlows').doc('experimentSetup');
                const setupStateSnap = await setupStateRef.get();
                if (setupStateSnap.exists) {
                    setupData = setupStateSnap.data();
                    userExperimentSetupData.set(userId, setupData); // Repopulate in-memory map
                    console.log(`[${interaction.customId} FIRESTORE_FALLBACK_SUCCESS ${interactionId}] Successfully restored state from Firestore for ${userTag}.`);
                }
            }

            if (!setupData || !setupData.deeperProblem || !setupData.outcome || !setupData.inputs?.length) {
                console.error(`[${interaction.customId} CRITICAL ${interactionId}] Incomplete setupData for user ${userTag}.`);
                await interaction.editReply({ content: '❌ Error: Your session data is incomplete or has expired. Please restart the setup.', components: [], embeds: [] });
                return;
            }

            // 1. Format the structured data into comma-separated strings for the backend
            const { deeperProblem, outcome, inputs } = setupData;
            const formatSettingToString = (metric) => {
                if (!metric || metric.label === undefined || metric.unit === undefined || metric.goal === undefined) return "";
                return `${metric.goal}, ${metric.unit}, ${metric.label}`;
            };

            const payload = {
                deeperProblem: deeperProblem,
                outputSetting: formatSettingToString(outcome),
                inputSettings: [
                    formatSettingToString(inputs[0]),
                    formatSettingToString(inputs[1]),
                    formatSettingToString(inputs[2])
                ],
                userTag: userTag
            };

            if (!payload.outputSetting || !payload.inputSettings[0]) {
                console.error(`[${interaction.customId} PAYLOAD_ERROR ${interactionId}] Failed to format final payload for ${userTag}.`);
                await interaction.editReply({ content: '❌ Error: Could not format your outcome or first habit correctly before saving. Please restart the setup.', components: [], embeds: [] });
                return;
            }
            
            // 2. Call the Firebase function to save the permanent settings
            console.log(`[${interaction.customId} FIREBASE_CALL ${interactionId}] Calling updateWeeklySettings for user ${userTag}.`);
            const result = await callFirebaseFunction('updateWeeklySettings', payload, userId);

            if (result && result.success) {
                console.log(`[${interaction.customId} FIREBASE_SUCCESS ${interactionId}] updateWeeklySettings successful for ${userTag}.`);

                setupData.rawPayload = payload;
                setupData.settingsMessage = result.message;

                const setupStateRef = dbAdmin.collection('users').doc(userId).collection('inProgressFlows').doc('experimentSetup');
                setupStateRef.delete().then(() => {
                    console.log(`[${interaction.customId} CLEANUP_SUCCESS ${interactionId}] Deleted temporary Firestore doc for user ${userTag}.`);
                }).catch(cleanupError => {
                    console.error(`[${interaction.customId} CLEANUP_FAIL ${interactionId}] Failed to delete temporary Firestore doc for user ${userTag}:`, cleanupError);
                });
              
                userExperimentSetupData.set(userId, setupData);
                // 4. Proceed to duration selection (the existing flow)
                setupData.experimentDuration = null; // Ensure duration is fresh for the next step
                userExperimentSetupData.set(userId, setupData); // Re-set map with minimal data for duration step.

                const durationEmbed = new EmbedBuilder()
                    .setColor('#47d264')
                    .setTitle('✅ Metrics Saved! Final Step...')
                    .setDescription("Your experiment metrics have been saved. Now, set the duration for your experiment.\n\nWhen do you want your first comprehensive stats report?")
                    .setTimestamp();

                const durationSelect = new StringSelectMenuBuilder()
                    .setCustomId('experiment_duration_select')
                    .setPlaceholder('Get your 1st stats report in...')
                    .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel('1 Week').setValue('1_week').setDescription('Report in 7 days.'),
                        new StringSelectMenuOptionBuilder().setLabel('2 Weeks').setValue('2_weeks').setDescription('Report in 14 days.'),
                        new StringSelectMenuOptionBuilder().setLabel('3 Weeks').setValue('3_weeks').setDescription('Report in 21 days.'),
                        new StringSelectMenuOptionBuilder().setLabel('4 Weeks').setValue('4_weeks').setDescription('Report in 28 days.')
                    );
                const durationRow = new ActionRowBuilder().addComponents(durationSelect);

                await interaction.editReply({
                    content: '', 
                    embeds: [durationEmbed],
                    components: [durationRow]
                });
                console.log(`[${interaction.customId} DURATION_PROMPT_SENT ${interactionId}] Prompted ${userTag} for experiment duration.`);

            } else {
                // Handle Firebase function failure
                console.error(`[${interaction.customId} FIREBASE_FAIL ${interactionId}] updateWeeklySettings failed for ${userTag}. Result:`, result);
                await interaction.editReply({ content: `❌ Error saving your experiment settings: ${result?.message || 'Unknown server error.'}. Please review your inputs and try again.`, components: [], embeds: [] });
            }

        } catch (error) {
            const errorTime = performance.now();
            console.error(`[${interaction.customId} CATCH_BLOCK_ERROR ${interactionId}] Error processing finish setup button for ${userTag} at ${errorTime.toFixed(2)}ms:`, error);
            if (interaction.deferred || interaction.replied) {
                try {
                    await interaction.editReply({ content: `❌ An unexpected error occurred while finalizing your setup: ${error.message}`, components: [], embeds: [] });
                } catch (editError) {
                    console.error(`[${interaction.customId} FALLBACK_ERROR ${interactionId}] Fallback editReply failed:`, editError);
                }
            }
        }
    }

    else if (interaction.customId === 'manual_back_to_outcome_modal_btn') {
            const userId = interaction.user.id;
            const interactionId = interaction.id;
            console.log(`[${interaction.customId} START ${interactionId}] User ${userId} wants to go back to the beginning of manual setup.`);

            const setupData = userExperimentSetupData.get(userId);

            if (!setupData || !setupData.deeperProblem || !setupData.outcome) {
                console.error(`[${interaction.customId} CRITICAL ${interactionId}] In-memory state missing critical data for user ${userId}.`);
                await interaction.reply({ content: '❌ Error: Your setup session has expired or is invalid. Please restart the setup using `/go`.', ephemeral: true });
                return;
            }

            try {
                const outcomeModal = new ModalBuilder()
                    .setCustomId('manual_setup_outcome_modal')
                    .setTitle('🧪 Experiment Setup (1/4): Edit');

                const deeperProblemInput = new TextInputBuilder()
                    .setCustomId('deeper_problem_manual')
                    .setLabel("🧭 Deeper Wish / Problem To Solve")
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(setupData.deeperProblem)
                    .setRequired(true);

                const outcomeLabelInput = new TextInputBuilder()
                    .setCustomId('outcome_label_manual')
                    .setLabel("📊 Measurable Outcome (The Label)")
                    .setStyle(TextInputStyle.Short)
                    .setValue(setupData.outcome.label)
                    .setRequired(true);

                const outcomeUnitInput = new TextInputBuilder()
                    .setCustomId('outcome_unit_manual')
                    .setLabel("📏 Unit / Scale")
                    .setStyle(TextInputStyle.Short)
                    .setValue(setupData.outcome.unit)
                    .setRequired(true);

                const outcomeGoalInput = new TextInputBuilder()
                    .setCustomId('outcome_goal_manual')
                    .setLabel("🎯 Daily Target Number")
                    .setStyle(TextInputStyle.Short)
                    .setValue(String(setupData.outcome.goal))
                    .setRequired(true);

                outcomeModal.addComponents(
                    new ActionRowBuilder().addComponents(deeperProblemInput),
                    new ActionRowBuilder().addComponents(outcomeLabelInput),
                    new ActionRowBuilder().addComponents(outcomeGoalInput),
                    new ActionRowBuilder().addComponents(outcomeUnitInput)
                );

                await interaction.showModal(outcomeModal);
                console.log(`[${interaction.customId} SUCCESS ${interactionId}] Re-opened outcome modal for editing for user ${userId}.`);
            } catch (error) {
                console.error(`[${interaction.customId} ERROR ${interactionId}] Error showing outcome modal for user ${userId}:`, error);
                try {
                    await interaction.reply({ content: '❌ An error occurred while trying to go back. Please try again.', ephemeral: true });
                } catch (e) {
                    console.error(`[${interaction.customId} FALLBACK_ERROR ${interactionId}]`, e);
                }
            }
        }

    else if (interaction.customId === AI_ASSISTED_SETUP_BTN_ID) {
      const aiSetupStartTime = performance.now();
      const userId = interaction.user.id;
      const userTag = interaction.user.tag;
      const interactionId = interaction.id;
      console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userTag}.`);
      
      try {
        // --- Stage 1: Acknowledge with a "loading" message ---
        await interaction.update({
            content: '⚙️ Contacting your AI assistant... One moment.',
            embeds: [],
            components: []
        });
        const updateTime = performance.now();
        console.log(`[${interaction.customId} ACKNOWLEDGED ${interactionId}] Updated original message to 'loading' state. Took: ${(updateTime - aiSetupStartTime).toFixed(2)}ms`);

        // --- Stage 2: Perform the logic (send DM) ---
        const dmChannel = await interaction.user.createDM();

        // --- NEW: Onboarding Embed with Plant Metaphor ---
        const welcomeEmbed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle("Let's Set Your Experiment! 🌱")
            .setDescription(
                "An experiment has 3 parts:\n\n" +
                "1. **A Wish** to aim for.\n" +
                "2. **An Outcome** to measure.\n" +
                "3. **1 - 3 Habits** to test out.\n\n"
            );

        // --- NEW: 'Start' Button ---
        const startButton = new ButtonBuilder()
          .setCustomId('ai_flow_start_btn') // New ID for the next step
          .setLabel('Start')
          .setStyle(ButtonStyle.Success);
        
        const dmRow = new ActionRowBuilder().addComponents(startButton);
        const promptMessage = await dmChannel.send({ embeds: [welcomeEmbed], components: [dmRow] });

        // --- Stage 3: Update the original message with the final button and perfect link ---
        const goToDmsButton = new ButtonBuilder()
          .setLabel('🚀 Click Here 🚀')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/@me/${dmChannel.id}/${promptMessage.id}`); // The perfect link

        const actionRow = new ActionRowBuilder().addComponents(goToDmsButton);
        
        // Use editReply because we already responded with update()
        await interaction.editReply({
            content: '✅ Your AI assistant is ready!\n\nClick below to continue.',
            components: [actionRow]
        });

        // --- Stage 4: Initialize the user's state in memory ---
        const currentSetupData = userExperimentSetupData.get(userId) || {};
        const guildIdToUse = currentSetupData.guildId || interaction.guild?.id || process.env.GUILD_ID;

        if (!guildIdToUse) {
            throw new Error(`[${AI_ASSISTED_SETUP_BTN_ID} CRITICAL] guildId could not be determined.`);
        }
        
        userExperimentSetupData.set(userId, {
            ...currentSetupData, // Keep guildId if it was already there
            interactionId: interactionId,
            dmFlowState: 'ai_onboarding_welcome', // New initial state
            lastPromptMessageId: promptMessage.id,
            // Clear any old/stale data from a previous run
            setupStyle: null,
            deeperWish: null,
            userBlockers: null,
            userPositiveHabits: null,
            userVision: null,
            outcome: null,
            inputs: [],
            aiGeneratedOutcomeSuggestions: null,
            aiGeneratedInputSuggestions: null
        });
        console.log(`[${interaction.customId} SUCCESS ${interactionId}] Full flow complete. Final button sent and state initialized for ${userTag}.`);

      } catch (error) {
        console.error(`[${interaction.customId} ERROR ${interactionId}] Error during two-stage setup for ${userTag}:`, error);
        if (error.code === 50007) {
             try {
                await interaction.editReply({
                    content: "⚠️ I couldn't send you a DM. Please check your server Privacy Settings to allow DMs from server members.",
                    components: []
                });
             } catch (e) { console.error(`[${interaction.customId} CATCH_EDIT_REPLY_FAIL ${interactionId}]`, e); }
        } else {
            try {
                if (!interaction.replied) {
                    await interaction.editReply({
                        content: '❌ An error occurred trying to start the AI assisted setup. Please try again.',
                        components: []
                    });
                }
            } catch (e) { console.error(`[${interaction.customId} CATCH_EDIT_REPLY_FAIL ${interactionId}]`, e); }
        }
        userExperimentSetupData.delete(userId);
      }
    }

    else if (interaction.customId === 'ai_flow_start_btn') {
        const startClickTime = performance.now();
        const interactionId = interaction.id;
        const userId = interaction.user.id;
        console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userId}.`);

        try {
            const setupData = userExperimentSetupData.get(userId);
            if (!setupData || setupData.dmFlowState !== 'ai_onboarding_welcome') {
                await interaction.update({ content: "This button has expired or your session is out of sync. Please restart using `/go`.", embeds: [], components: [] });
                console.warn(`[${interaction.customId} WARN ${interactionId}] User ${userId} in wrong state: ${setupData?.dmFlowState}`);
                return;
            }

            // Create the new embed with the lifecycle comic
            // This reuses the content from your previous ephemeral welcome flow for consistency
            const comicEmbed = new EmbedBuilder()
              .setColor('#57F287')
              .setTitle('🔬 How Experiments Change Lives')
              .setDescription(
                "● **Your Wish** is the forest you want to grow.\n● **The Outcome** is the height of 1 plant in that forest.\n● **Your Habits** are the sun, water, and soil."
              )
              .setImage('https://raw.githubusercontent.com/dwolovsky/discord-logger-bot/refs/heads/firebase-migration/Active%20Pictures/Deeper%20Wish%20outcome%20habits%20relationship%201.png');

            const nextButton = new ButtonBuilder()
                .setCustomId('ai_flow_comic_next_btn') // New ID for the next step in the flow
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(nextButton);

            // Update the message the user clicked on with the new content
            await interaction.update({
                embeds: [comicEmbed],
                components: [row]
            });

            // Update the user's state to reflect their progress
            setupData.dmFlowState = 'ai_onboarding_comic';
            userExperimentSetupData.set(userId, setupData);

            console.log(`[${interaction.customId} SUCCESS ${interactionId}] Updated DM to show comic for user ${userId}. State is now 'ai_onboarding_comic'.`);

        } catch (error) {
            console.error(`[${interaction.customId} ERROR ${interactionId}] Error processing button click for user ${userId}:`, error);
            // Since the interaction is already updated or deferred, we can't send a new reply, but the error is logged.
        }
    }
    

    else if (interaction.customId === 'ai_flow_comic_next_btn') {
        const comicNextClickTime = performance.now();
        const interactionId = interaction.id;
        const userId = interaction.user.id;
        console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userId}.`);

        try {
            const setupData = userExperimentSetupData.get(userId);
            if (!setupData || setupData.dmFlowState !== 'ai_onboarding_comic') {
                await interaction.update({ content: "This button has expired or your session is out of sync. Please restart using `/go`.", embeds: [], components: [] });
                console.warn(`[${interaction.customId} WARN ${interactionId}] User ${userId} in wrong state: ${setupData?.dmFlowState}`);
                return;
            }

            // Create the new embed for the Express vs. Thorough choice
            const choiceEmbed = new EmbedBuilder()
                .setColor('#7F00FF') // Purple
                .setTitle('Express or Thorough style?')
                .setDescription(
                    "**🚀 Express:** Faster, with broader AI suggestions.\n\n" +
                    "**🧠 Thorough:** Answer 3 extra questions for highly tailored suggestions."
                );

            const expressButton = new ButtonBuilder()
                .setCustomId('ai_flow_express_btn')
                .setLabel('Express')
                .setEmoji('🚀')
                .setStyle(ButtonStyle.Primary);
            
            const thoroughButton = new ButtonBuilder()
                .setCustomId('ai_flow_thorough_btn')
                .setLabel('Thorough')
                .setEmoji('🧠')
                .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(expressButton, thoroughButton);

            // Update the message with the new content
            await interaction.update({
                embeds: [choiceEmbed],
                components: [row]
            });

            // Update the user's state
            setupData.dmFlowState = 'ai_onboarding_style_choice';
            userExperimentSetupData.set(userId, setupData);

            console.log(`[${interaction.customId} SUCCESS ${interactionId}] Updated DM to show Express/Thorough choice for user ${userId}. State is now 'ai_onboarding_style_choice'.`);

        } catch (error) {
            console.error(`[${interaction.customId} ERROR ${interactionId}] Error processing button click for user ${userId}:`, error);
        }
    }

    else if (interaction.customId === 'ai_flow_thorough_btn' || interaction.customId === 'ai_flow_express_btn') {
        const choiceClickTime = performance.now();
        const interactionId = interaction.id;
        const userId = interaction.user.id;
        const choice = interaction.customId === 'ai_flow_thorough_btn' ? 'Thorough' : 'Express';
        console.log(`[ai_flow_choice START ${interactionId}] User ${userId} chose: ${choice}.`);

        try {
            const setupData = userExperimentSetupData.get(userId);
            if (!setupData || setupData.dmFlowState !== 'ai_onboarding_style_choice') {
                await interaction.update({ content: "This button has expired or your session is out of sync. Please restart using `/go`.", embeds: [], components: [] });
                console.warn(`[ai_flow_choice WARN ${interactionId}] User ${userId} in wrong state: ${setupData?.dmFlowState}`);
                return;
            }
            
            await interaction.update({
                  content: `✅️ ${choice} flow confirmed. **Scroll down**.`,
                  embeds: [],      // This removes the original embed
                  components: []   // This removes the buttons entirely
              });
            
            // Update the state with the user's choice and advance the flow
            setupData.setupStyle = choice.toLowerCase();
            setupData.dmFlowState = 'awaiting_wish';
            
            // Create and send the next prompt in the DM channel (asking for the wish)
            const wishEmbed = new EmbedBuilder()
                .setColor('#5865F2') // Blue for questions
                .setTitle("✨ Let's Start With A Wish")
                .setDescription(
                    "What's one thing you'd like to improve in your life?\n\n" +
                    "**Examples:**\n" +
                    "● *'To be less stressed'*\n" +
                    "● *'To have more energy'*\n" +
                    "● *'To have better relationships'*\n\n" +
                    "Type your wish in a message below (click <:chaticon:1384220348685488299> on mobile)."
                );

            const newPromptMessage = await interaction.user.send({ embeds: [wishEmbed] });

            // Save the new prompt ID and the updated state
            setupData.lastPromptMessageId = newPromptMessage.id;
            userExperimentSetupData.set(userId, setupData);

            console.log(`[ai_flow_choice SUCCESS ${interactionId}] Prompted user ${userId} for their wish. Style: ${choice}. State is now 'awaiting_wish'.`);

        } catch (error) {
            console.error(`[ai_flow_choice ERROR ${interactionId}] Error processing ${choice} choice for user ${userId}:`, error);
        }
    }

    else if (interaction.isButton() && interaction.customId === 'add_another_habit_yes_btn') {
      const yesAddHabitClickTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;

      console.log(`[add_another_habit_yes_btn START ${interactionId}] Clicked by ${userTagForLog}.`);
      try {
        await interaction.deferUpdate();

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || setupData.dmFlowState !== 'awaiting_add_another_habit_choice') {
          console.warn(`[add_another_habit_yes_btn WARN ${interactionId}] User in unexpected state: ${setupData?.dmFlowState || 'no setupData'}.`);
          await interaction.editReply({ content: "There was a mix-up with the steps. Please try restarting the experiment setup with `/go`.", components: [], embeds: [] });
          return;
        }

        const currentNumberOfInputs = setupData.inputs.filter(Boolean).length;
        if (currentNumberOfInputs >= 3) {
          console.log(`[add_another_habit_yes_btn MAX_INPUTS ${interactionId}] User tried to add more than 3 inputs.`);
          await interaction.editReply({
            content: "You've already defined the maximum of 3 daily habits. Please proceed using the 'No, Skip' button from the original message if it's still visible.",
            components: [],
            embeds: []
          });
          return;
        }
        
        await interaction.editReply({ content: "✅ Okay, let's add another habit. I'll send the next step in a new message below...", components: [], embeds: [] });
        
        setupData.currentInputIndex = currentNumberOfInputs + 1;
        const nextInputNumber = setupData.currentInputIndex;
        const ordinal = nextInputNumber === 2 ? "2nd" : "3rd";
        setupData.dmFlowState = `processing_input${nextInputNumber}_label_suggestions`;
        userExperimentSetupData.set(userId, setupData);

        const thinkingEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setDescription(`🧠 Let's define your **${ordinal} Daily Habit**. I'll brainstorm some ideas for you...`);
        const thinkingMessage = await interaction.user.send({ embeds: [thinkingEmbed] });
        
        setupData.lastPromptMessageId = thinkingMessage.id;
        userExperimentSetupData.set(userId, setupData);

        const definedInputsForAI = setupData.inputs.filter(Boolean).map(input => ({
            label: input.label, unit: input.unit, goal: input.goal
        }));
        try {
            const habitSuggestionsResult = await callFirebaseFunction(
              'generateInputLabelSuggestions',
              {
                userWish: setupData.deeperWish,
                userBlockers: setupData.userBlockers,
                userPositiveHabits: setupData.userPositiveHabits,
                userVision: setupData.userVision,
                outcomeMetric: setupData.outcome,
                definedInputs: definedInputsForAI
              },
              userId
            );
            if (habitSuggestionsResult && habitSuggestionsResult.success && habitSuggestionsResult.suggestions?.length > 0) {
              setupData.aiGeneratedInputSuggestions = habitSuggestionsResult.suggestions;
              setupData.dmFlowState = `awaiting_input${nextInputNumber}_label_dropdown_selection`;
              userExperimentSetupData.set(userId, setupData);
              
              const habitLabelSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`ai_input${nextInputNumber}_label_select`)
                .setPlaceholder(`Select a Habit or enter your own.`);
              habitLabelSelectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                  .setLabel(`✏️ Enter custom habit idea...`)
                  .setValue(`custom_input${nextInputNumber}_label`)
                  .setDescription("Choose this to write in your own.")
              );
              habitSuggestionsResult.suggestions.forEach((suggestion, index) => {
                const displayLabel = `${suggestion.label} (${suggestion.goal} ${suggestion.unit})`.substring(0, 100);
                habitLabelSelectMenu.addOptions(
                  new StringSelectMenuOptionBuilder()
                    .setLabel(displayLabel)
                    .setValue(`ai_input${nextInputNumber}_label_suggestion_${index}`)
                    .setDescription((suggestion.briefExplanation || 'AI Suggested Habit').substring(0, 100))
                );
              });
              const resultsEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle(`💡 Habit ${nextInputNumber} Ideas`)
                .setDescription(`Here are some ideas for your **${ordinal} Daily Habit**.\n\nChoose one, or enter your own.`);
              await thinkingMessage.edit({ embeds: [resultsEmbed], components: [new ActionRowBuilder().addComponents(habitLabelSelectMenu)] });
              console.log(`[add_another_habit_yes_btn INPUT${nextInputNumber}_LABEL_DROPDOWN_SENT ${interactionId}] Edited 'thinking' message to display suggestions.`);
            } else {
              throw new Error(habitSuggestionsResult?.error || 'AI returned no suggestions.');
            }
        } catch (error) {
            console.error(`[add_another_habit_yes_btn FIREBASE_FUNC_ERROR ${interactionId}] Error getting suggestions for Input ${nextInputNumber}:`, error);
            setupData.dmFlowState = `awaiting_input${nextInputNumber}_label_text`;
            userExperimentSetupData.set(userId, setupData);
            await thinkingMessage.edit({
                content: `I had a bit of trouble brainstorming right now. 😕\n\nNo worries! What **Label** would you like to give your ${ordinal} Daily Habit? (max 30 characters).`,
                embeds: []
            });
            console.log(`[add_another_habit_yes_btn FALLBACK_PROMPT_SENT ${interactionId}] Edited 'thinking' to prompt for text.`);
        }
      } catch (error) {
        console.error(`[add_another_habit_yes_btn ERROR ${interactionId}] Error processing button click:`, error);
        try {
            await interaction.editReply({ content: "An error occurred. Please try again.", components: [], embeds: [] });
        } catch (e) {
            console.error(`[add_another_habit_yes_btn FALLBACK_ERROR ${interactionId}]`, e);
        }
      }
      const processEndTime = performance.now();
      console.log(`[add_another_habit_yes_btn END ${interactionId}] Finished processing. Total time: ${(processEndTime - yesAddHabitClickTime).toFixed(2)}ms`);
    }

    else if (interaction.isButton() && interaction.customId === 'add_another_habit_no_btn') {
      const noAddHabitClickTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;
      
      console.log(`[add_another_habit_no_btn START ${interactionId}] Clicked by ${userTagForLog}.`);
      try {
        await interaction.deferUpdate();
        
        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || !setupData.deeperProblem || !setupData.outcomeLabel || !setupData.inputs || setupData.inputs.length === 0) {
          console.warn(`[add_another_habit_no_btn WARN ${interactionId}] User ${userTagForLog} had incomplete setupData.`);
          await interaction.editReply({ content: "It seems some experiment details are missing. Please restart the setup with `/go`.", components: [], embeds: [] });
          return;
        }

        // Transition state
        setupData.dmFlowState = 'awaiting_metrics_confirmation';
        userExperimentSetupData.set(userId, setupData);

        // Helper to format the goal for display (handles time)
        const formatGoalForDisplay = (goal, unit) => {
            const isTime = TIME_OF_DAY_KEYWORDS.includes(unit.toLowerCase().trim());
            return isTime ? formatDecimalAsTime(goal) : goal;
        };

        let summaryDescription = `**🌠 Deeper Wish:**\n${setupData.deeperProblem}\n\n` +
                                `**📊 Daily Outcome to Track:**\n\`${formatGoalForDisplay(setupData.outcomeGoal, setupData.outcomeUnit)}, ${setupData.outcomeUnit}, ${setupData.outcomeLabel}\`\n\n` +
                                `**🛠️ Daily Habits to Test:**\n`;
        setupData.inputs.forEach((input, index) => {
            if (input && input.label) {
                summaryDescription += `${index + 1}. \`${formatGoalForDisplay(input.goal, input.unit)}, ${input.unit}, ${input.label}\`\n`;
            }
        });

        const confirmEmbed = new EmbedBuilder()
            .setColor('#FFBF00') // Amber
            .setTitle('🔬 Review Your Experiment Metrics')
            .setDescription(summaryDescription + "\n\nDo these look correct? You can edit them now if needed.")
            .setFooter({ text: "Your settings are not saved until you select a duration."});

        const confirmButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_metrics_proceed_btn')
                    .setLabel('✅ Looks Good')
                    .setStyle(ButtonStyle.Success),
                 new ButtonBuilder()
                    .setCustomId('request_edit_metrics_modal_btn')
                    .setLabel('✏️ Edit Metrics')
                    .setStyle(ButtonStyle.Primary)
            );

        // This now correctly edits the message the button was on.
        await interaction.editReply({
            content: "All habits defined! Here's the full summary of your experiment's metrics:",
            embeds: [confirmEmbed],
            components: [confirmButtons]
        });
        
        console.log(`[add_another_habit_no_btn CONFIRM_EDIT_PROMPT_SENT ${interactionId}] Edited message to show confirm/edit prompt.`);

      } catch (error) {
        console.error(`[add_another_habit_no_btn ERROR ${interactionId}]`, error);
        // Attempt to edit the reply with an error message since it was deferred
        try {
            await interaction.editReply({ content: "An error occurred while finalizing your habits. Please try again.", components: [], embeds: [] });
        } catch (e) {
            console.error(`[add_another_habit_no_btn FALLBACK_ERROR ${interactionId}]`, e);
        }
      }
      const processEndTime = performance.now();
      console.log(`[add_another_habit_no_btn END ${interactionId}] Finished processing. Total time: ${(processEndTime - noAddHabitClickTime).toFixed(2)}ms`);
    }

    else if (interaction.isButton() && interaction.customId === 'confirm_metrics_proceed_btn') {
      const confirmProceedClickTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;

      console.log(`[confirm_metrics_proceed_btn START ${interactionId}] Clicked by ${userTagForLog}. Saving metrics and proceeding to duration.`);
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Acknowledge ephemerally
        const deferTime = performance.now();
        console.log(`[confirm_metrics_proceed_btn DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - confirmProceedClickTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || setupData.dmFlowState !== 'awaiting_metrics_confirmation' ||
            !setupData.deeperProblem || !setupData.outcomeLabel || !setupData.outcomeUnit || setupData.outcomeGoal === undefined ||
            !setupData.inputs || setupData.inputs.length === 0 || !setupData.inputs[0].label) {
          console.warn(`[confirm_metrics_proceed_btn WARN ${interactionId}] User ${userTagForLog} had incomplete setupData or wrong state. State: ${setupData?.dmFlowState}`);
          await interaction.editReply({ content: "⚠️ Error: Some core experiment details are missing or your session is in an unexpected state. Please restart the setup using `/go`.", components: [], embeds: [] });
          return;
        }

        // Helper to format settings for Firebase, similar to the one in 'awaiting_input3_target_number'
        const formatSettingToStringHelper = (label, unit, goal) => {
            if (label && typeof label === 'string' && label.trim() !== "" &&
                unit && typeof unit === 'string' &&
                goal !== undefined && goal !== null && !isNaN(parseFloat(goal))) {
                return `${parseFloat(goal)}, ${unit.trim()}, ${label.trim()}`;
            }
            console.warn(`[confirm_metrics_proceed_btn formatHelper] Invalid data for formatting: L='${label}', U='${unit}', G='${goal}'`);
            return "";
        };

        const outcomeSettingStrFirebase = formatSettingToStringHelper(setupData.outcomeLabel, setupData.outcomeUnit, setupData.outcomeGoal);
        const inputSettingsStringsFirebase = setupData.inputs.map(input => {
            return (input && input.label) ? formatSettingToStringHelper(input.label, input.unit, input.goal) : "";
        });

        if (!outcomeSettingStrFirebase || !inputSettingsStringsFirebase[0] || inputSettingsStringsFirebase[0].trim() === "") {
             console.error(`[confirm_metrics_proceed_btn FORMATTING_ERROR ${interactionId}] Failed to format Outcome or essential Input 1 for Firebase for ${userTagForLog}.`);
             await interaction.editReply({ content: "⚠️ Error: Could not prepare your Outcome or first Habit details correctly for saving. Please restart the setup with `/go`.", components: [], embeds: []});
             return;
        }

        const firebasePayload = {
          deeperProblem: setupData.deeperProblem,
          outputSetting: outcomeSettingStrFirebase,
          inputSettings: [
            inputSettingsStringsFirebase[0] || "",
            inputSettingsStringsFirebase[1] || "",
            inputSettingsStringsFirebase[2] || ""
          ],
          userTag: userTagForLog
        };
        console.log(`[confirm_metrics_proceed_btn FIREBASE_CALL ${interactionId}] Calling updateWeeklySettings for ${userTagForLog}. Payload:`, JSON.stringify(firebasePayload));

        const updateSettingsResultFirebase = await callFirebaseFunction('updateWeeklySettings', firebasePayload, userId);

        if (updateSettingsResultFirebase && updateSettingsResultFirebase.success === true && typeof updateSettingsResultFirebase.message === 'string') {
          console.log(`[confirm_metrics_proceed_btn FIREBASE_SUCCESS ${interactionId}] updateWeeklySettings successful for ${userTagForLog}.`);
          setupData.settingsMessage = updateSettingsResultFirebase.message; // Store for later

          setupData.rawPayload = { // firebasePayload contains the strings ready for posting
            deeperProblem: firebasePayload.deeperProblem,
            outputSetting: firebasePayload.outputSetting, // This is the "Goal #, Unit, Label" string
            inputSettings: firebasePayload.inputSettings // Array of "Goal #, Unit, Label" strings
            };

          setupData.dmFlowState = 'awaiting_duration_selection'; // Transition to duration
          userExperimentSetupData.set(userId, setupData);
          console.log(`[confirm_metrics_proceed_btn SETUP_DATA_UPDATED ${interactionId}] Updated setupData for user ${userId} in AI flow.`);

              // ===== START: CLEAR PRE-FETCHED SETTINGS AFTER SUCCESSFUL UPDATE (AI Flow) =====
                if (setupData) { // setupData was retrieved and updated just above
                    delete setupData.preFetchedWeeklySettings;
                    delete setupData.preFetchedWeeklySettingsTimestamp;
                    delete setupData.logFlowHasTimeMetrics;
                    userExperimentSetupData.set(userId, setupData); // Save the changes to setupData
                    console.log(`[confirm_metrics_proceed_btn CACHE_CLEARED ${interactionId}] Cleared pre-fetched weekly settings for user ${userTagForLog} after settings update (AI flow).`);
                }
                // ===== END: CLEAR PRE-FETCHED SETTINGS AFTER SUCCESSFUL UPDATE (AI Flow) =====

          const durationEmbed = new EmbedBuilder()
              .setColor('#47d264')
              .setTitle('🔬 Experiment Metrics Confirmed & Saved!')
              .setDescription("Your Deeper Wish and daily metrics have been saved.\n\nNow, when do you want your first comprehensive stats report?")
              .setTimestamp();

          const durationSelect = new StringSelectMenuBuilder()
              .setCustomId('experiment_duration_select') // Existing handler for this ID
              .setPlaceholder('Get your 1st stats report in...')
              .addOptions(
                  new StringSelectMenuOptionBuilder().setLabel('1 Week').setValue('1_week').setDescription('Report in 7 days.'),
                  new StringSelectMenuOptionBuilder().setLabel('2 Weeks').setValue('2_weeks').setDescription('Report in 14 days.'),
                  new StringSelectMenuOptionBuilder().setLabel('3 Weeks').setValue('3_weeks').setDescription('Report in 21 days.'),
                  new StringSelectMenuOptionBuilder().setLabel('4 Weeks').setValue('4_weeks').setDescription('Report in 28 days.')
              );
          const durationRow = new ActionRowBuilder().addComponents(durationSelect);

          await interaction.editReply({
              content: '', 
              embeds: [durationEmbed],
              components: [durationRow]
          });
          console.log(`[confirm_metrics_proceed_btn DURATION_PROMPT_SENT ${interactionId}] Metrics saved. Prompted ${userTagForLog} for experiment duration. State: '${setupData.dmFlowState}'.`);
        } else {
          console.error(`[confirm_metrics_proceed_btn FIREBASE_FAIL ${interactionId}] updateWeeklySettings failed for ${userTagForLog}. Result:`, updateSettingsResultFirebase);
          await interaction.editReply({ content: `❌ Error saving your experiment settings: ${updateSettingsResultFirebase?.error || 'Unknown server error.'}. Please try clicking 'Looks Good' again, or 'Edit' if you see issues.`, components: [], embeds: [] });
        }
      } catch (error) {
        const errorTime = performance.now();
        console.error(`[confirm_metrics_proceed_btn ERROR ${interactionId}] Error at ${errorTime.toFixed(2)}ms:`, error);
        if (interaction.deferred && !interaction.replied) {
          try {
            await interaction.editReply({ content: `❌ An unexpected error occurred: ${error.message || 'Please try again.'}`, components: [], embeds: [] });
          } catch (editError) {
            console.error(`[confirm_metrics_proceed_btn FALLBACK_ERROR ${interactionId}] Fallback error reply failed:`, editError);
          }
        } else if (!interaction.replied && !interaction.deferred) {
            try { await interaction.reply({ content: `❌ An unexpected error occurred: ${error.message || 'Please try again.'}`, flags: MessageFlags.Ephemeral }); }
            catch (e) { console.error(`[confirm_metrics_proceed_btn ERROR_REPLY_FAIL ${interactionId}]`, e); }
        }
      }
      const processEndTime = performance.now();
      console.log(`[confirm_metrics_proceed_btn END ${interactionId}] Finished processing. Total time: ${(processEndTime - confirmProceedClickTime).toFixed(2)}ms`);
    }

    else if (interaction.isButton() && interaction.customId === 'request_edit_metrics_modal_btn') {
      const requestEditClickTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;

      console.log(`[request_edit_metrics_modal_btn START ${interactionId}] Clicked by ${userTagForLog}. Preparing to show edit instructions and modal trigger button.`);
      try {
        // Since we are replying with new components, we should deferUpdate.
        await interaction.deferUpdate({ flags: MessageFlags.Ephemeral }); 
        const deferTime = performance.now();
        console.log(`[request_edit_metrics_modal_btn DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - requestEditClickTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        // Basic check to ensure setupData exists, more detailed checks happen before showing the actual modal.
        if (!setupData || setupData.dmFlowState !== 'awaiting_metrics_confirmation') {
          console.warn(`[request_edit_metrics_modal_btn WARN ${interactionId}] User ${userTagForLog} in unexpected state: ${setupData?.dmFlowState || 'no setupData'}.`);
          await interaction.editReply({ content: "⚠️ Error: Your session seems to be in an unexpected state to start editing. Please try the `/go` command to restart if needed.", components: [], embeds: [] });
          return;
        }
        
        const instructionEmbed = new EmbedBuilder()
            .setColor('#FFA500') // Orange for instruction/warning
            .setTitle('CRUCIAL FORMATTING NOTE:')
            .setDescription(
                "Each line should have this format:\nGoal # , Unit / Scale , Label\n\nE.g.\n7.5, hours, Sleep\nOR\n8, out of 10, Relationships)\n\nUse Commas! ↳  ,  ↲"
            )
            .setFooter({text: "Your current Duration and Reminder settings will remain unchanged by this edit."});

        const openEditFormButton = new ButtonBuilder()
            .setCustomId('show_edit_metrics_modal_btn') // New ID for the button that actually shows the modal
            .setLabel('📋 Open Edit Form')
            .setStyle(ButtonStyle.Success);

        const instructionRow = new ActionRowBuilder().addComponents(openEditFormButton);

        await interaction.editReply({
            content: "Ready to make some changes?",
            embeds: [instructionEmbed],
            components: [instructionRow] // Present the button to open the modal
        });
        console.log(`[request_edit_metrics_modal_btn EDIT_INSTRUCTIONS_SENT ${interactionId}] Showed edit instructions and 'Open Edit Form' button to ${userTagForLog}.`);

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[request_edit_metrics_modal_btn ERROR ${interactionId}] Error at ${errorTime.toFixed(2)}ms:`, error);
        if (interaction.deferred && !interaction.replied) {
          try {
            await interaction.editReply({ content: `❌ An error occurred while preparing the edit step: ${error.message || 'Please try again.'}`, components: [], embeds: [] });
          } catch (editError) {
            console.error(`[request_edit_metrics_modal_btn FALLBACK_ERROR ${interactionId}] Fallback error reply failed:`, editError);
          }
        } else if (!interaction.replied && !interaction.deferred) {
            try { await interaction.reply({ content: `❌ An unexpected error occurred: ${error.message || 'Please try again.'}`, ephemeral: true }); }
            catch (e) { console.error(`[request_edit_metrics_modal_btn ERROR_REPLY_FAIL ${interactionId}]`, e); }
        }
      }
      const processEndTime = performance.now();
      console.log(`[request_edit_metrics_modal_btn END ${interactionId}] Finished processing. Total time: ${(processEndTime - requestEditClickTime).toFixed(2)}ms`);
    }

    else if (interaction.isButton() && interaction.customId === 'show_edit_metrics_modal_btn') {
      const showModalClickTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;

      console.log(`[show_edit_metrics_modal_btn START ${interactionId}] Clicked by ${userTagForLog}. Preparing to show pre-filled edit modal.`);
      try {
        // interaction.showModal() must be the first reply to this specific interaction.
        // No deferUpdate() or editReply() before it for this interaction.

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || setupData.dmFlowState !== 'awaiting_metrics_confirmation' ||
            !setupData.deeperProblem || !setupData.outcomeLabel || !setupData.outcomeUnit || setupData.outcomeGoal === undefined ||
            !setupData.inputs || setupData.inputs.length === 0) {
          console.warn(`[show_edit_metrics_modal_btn WARN ${interactionId}] User ${userTagForLog} had incomplete setupData or wrong state for showing edit modal. State: ${setupData?.dmFlowState}`);
          // Since showModal must be the first reply, if we can't show it, we reply with an error.
          await interaction.reply({ content: "⚠️ Error: Could not retrieve your current experiment details to edit. Please try the 'Edit Metrics/Goal' button again, or restart the setup with `/go`.", ephemeral: true });
          return;
        }
        
        const formatSettingToString = (goal, unit, label) => {
            if (label && typeof label === 'string' && label.trim() !== "" && unit && typeof unit === 'string' && goal !== undefined && goal !== null && !isNaN(parseFloat(goal))) {
                return `${parseFloat(goal)}, ${unit.trim()}, ${label.trim()}`;
            }
            return "";
        };

        const deeperProblemValue = setupData.deeperProblem || "";
        const outputValue = formatSettingToString(setupData.outcomeGoal, setupData.outcomeUnit, setupData.outcomeLabel);
        
        const inputValuesFormatted = ["", "", ""]; // Max 3 inputs
        setupData.inputs.forEach((input, index) => {
            if (index < 3 && input && input.label) { // Ensure input exists and has a label
                inputValuesFormatted[index] = formatSettingToString(input.goal, input.unit, input.label);
            }
        });

        const modal = new ModalBuilder()
          .setCustomId('experiment_setup_modal') // Re-using the existing manual setup modal ID
          .setTitle('✏️ Edit Metrics & Goal');

        const deeperProblemInput = new TextInputBuilder()
          .setCustomId('deeper_problem')
          .setLabel("🧭 Deeper Wish?")
          .setPlaceholder("e.g. 'Reduce distractions'")
          .setStyle(TextInputStyle.Paragraph)
          .setValue(deeperProblemValue)
          .setRequired(true);

        const outputSettingInput = new TextInputBuilder()
          .setCustomId('output_setting')
          .setLabel("🎯 Outcome (Format: Goal #, Unit, Label)")
          .setPlaceholder("e.g. '7.5, hours, Sleep'")
          .setValue(outputValue)
          .setStyle(TextInputStyle.Short)
          .setRequired(true);
        
        const input1SettingInput = new TextInputBuilder()
          .setCustomId('input1_setting')
          .setLabel("🛠️ Habit 1 (Format: Goal #, Unit, Label)")
          .setPlaceholder("e.g. '15, minutes, Meditation'")
          .setValue(inputValuesFormatted[0])
          .setStyle(TextInputStyle.Short)
          .setRequired(true); // Input 1 is always required

        const input2SettingInput = new TextInputBuilder()
          .setCustomId('input2_setting')
          .setLabel("🛠️ Habit 2 (Optional: #, Unit, Label)")
          .setPlaceholder("Same format, or leave blank if not used.")
          .setValue(inputValuesFormatted[1])
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        const input3SettingInput = new TextInputBuilder()
          .setCustomId('input3_setting')
          .setLabel("🛠️ Habit 3 (Optional: #, Unit, Label)")
          .setPlaceholder("Same format, or leave blank if not used.")
          .setValue(inputValuesFormatted[2])
          .setStyle(TextInputStyle.Short)
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(deeperProblemInput),
          new ActionRowBuilder().addComponents(outputSettingInput),
          new ActionRowBuilder().addComponents(input1SettingInput),
          new ActionRowBuilder().addComponents(input2SettingInput),
          new ActionRowBuilder().addComponents(input3SettingInput)
        );
        
        await interaction.showModal(modal);
        const modalShownTime = performance.now();
        console.log(`[show_edit_metrics_modal_btn MODAL_SHOWN ${interactionId}] Edit modal (experiment_setup_modal) shown to ${userTagForLog}. Took: ${(modalShownTime - showModalClickTime).toFixed(2)}ms`);
        
        // The existing 'experiment_setup_modal' submission handler in InteractionCreate
        // will now be triggered when the user submits this modal.
        // That handler should call updateWeeklySettings and then proceed to duration selection.

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[show_edit_metrics_modal_btn ERROR ${interactionId}] Error at ${errorTime.toFixed(2)}ms:`, error);
        // Since interaction.showModal must be the first reply, if it fails,
        // we can't easily send an ephemeral message for *this* interaction.
        // The error will likely be logged, and the user might be stuck on the previous message.
        // This scenario is less common if the setupData check passes.
      }
      // No processEndTime log here as the interaction is completed by showModal.
    }

    // --- Handler for "Log Daily Data" Button (NEW, WITH CACHE-FIRST LOGIC) ---
    else if (interaction.customId === 'log_daily_progress_btn') {
        const logButtonStartTime = performance.now();
        const userId = interaction.user.id;
        const interactionId = interaction.id;
        console.log(`[log_daily_progress_btn START ${interactionId}] Button clicked by User: ${userId}`);

        try {
            const setupData = userExperimentSetupData.get(userId) || {};
            // Store guildId in case it's needed for a later part of the flow
            if (interaction.guildId) {
                setupData.guildId = interaction.guildId;
            }

            const hasTimeMetrics = setupData.logFlowHasTimeMetrics;
            const cachedSettings = setupData.preFetchedWeeklySettings;

            // Helper function to check for time metrics
            const isTimeMetric = (unit) => TIME_OF_DAY_KEYWORDS.includes(unit?.toLowerCase().trim());

            // Helper function to build the standard log modal
            const buildStandardLogModal = (settings) => {
                const modal = new ModalBuilder().setCustomId('dailyLogModal_firebase').setTitle(`📝 Fuel Your Experiment`);
                const components = [settings.output, settings.input1, settings.input2, settings.input3]
                    .filter(metric => metric && metric.label)
                    .map(metric => {
                        let customId;
                        if (metric.label === settings.output.label) customId = 'log_output_value';
                        else if (metric.label === settings.input1.label) customId = 'log_input1_value';
                        else if (metric.label === settings.input2.label) customId = 'log_input2_value';
                        else if (metric.label === settings.input3.label) customId = 'log_input3_value';

                        return new ActionRowBuilder().addComponents(
                            new TextInputBuilder().setCustomId(customId).setLabel(`${metric.label} ${metric.unit}`).setPlaceholder(`Goal: ${metric.goal}`).setStyle(TextInputStyle.Short).setRequired(true)
                        );
                    });
                const notesInput = new TextInputBuilder().setCustomId('log_notes').setLabel('💭 Experiment & Life Notes').setStyle(TextInputStyle.Paragraph).setRequired(true);
                let finalPlaceholder = 'What did you observe? Any questions or insights?';
                if (settings.deeperProblem) {
                    finalPlaceholder = `What affected your goal today?\n↳ "${settings.deeperProblem.substring(0, 60)}"`;
                }
                notesInput.setPlaceholder(finalPlaceholder);
                components.push(new ActionRowBuilder().addComponents(notesInput));
                modal.addComponents(components);
                return modal;
            };
            
            // ---- CACHED / FAST PATH ----
            if (cachedSettings) {
                console.log(`[log_daily_progress_btn CACHE_HIT ${interactionId}] Using cached settings.`);
                setupData.logFlowSettings = cachedSettings; // Ensure settings are available for the next step

                if (hasTimeMetrics) {
                    // Path A: Cached with time metrics -> edit message to start time prompts
                    console.log(`[log_daily_progress_btn CACHE_TIME_METRICS ${interactionId}] Path A: Cached settings have time metrics. Editing message.`);
                    await interaction.deferUpdate();
                    const metrics = [cachedSettings.output, cachedSettings.input1, cachedSettings.input2, cachedSettings.input3].filter(Boolean);
                    setupData.logFlowTimeMetrics = metrics.filter(metric => isTimeMetric(metric.unit));
                    setupData.logFlowOtherMetrics = metrics.filter(metric => !isTimeMetric(metric.unit));
                    setupData.timeLogIndex = 0;
                    setupData.loggedTimeValues = {};
                    userExperimentSetupData.set(userId, setupData);
                    await sendNextTimeLogPrompt(interaction, userId);
                } else {
                    // Path B: Cached without time metrics -> show modal directly
                    console.log(`[log_daily_progress_btn CACHE_NO_TIME_METRICS ${interactionId}] Path B: Cached settings have no time metrics. Showing modal directly.`);
                    const modal = buildStandardLogModal(cachedSettings);
                    await interaction.showModal(modal);
                }
            } 
            // ---- NOT CACHED / FALLBACK PATH ----
            else {
                console.log(`[log_daily_progress_btn FALLBACK_PATH ${interactionId}] Fallback: Settings not cached. Deferring reply and fetching.`);
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const settingsResult = await callFirebaseFunction('getWeeklySettings', {}, userId);
                if (!settingsResult || !settingsResult.settings) {
                    await interaction.editReply({ content: "🤔 You haven't set up your weekly experiment yet. Please use the 'Set Experiment' button first.", components: [] });
                    return;
                }

                const settings = settingsResult.settings;
                setupData.logFlowSettings = settings; // Store for next steps

                const metrics = [settings.output, settings.input1, settings.input2, settings.input3].filter(Boolean);
                const timeMetrics = metrics.filter(metric => isTimeMetric(metric.unit));

                if (timeMetrics.length > 0) {
                    // Path C: Fallback with time metrics -> edit deferred reply to start time prompts
                    console.log(`[log_daily_progress_btn FALLBACK_TIME_METRICS ${interactionId}] Path C: Fetched settings have time metrics. Editing message.`);
                    setupData.logFlowTimeMetrics = timeMetrics;
                    setupData.logFlowOtherMetrics = metrics.filter(metric => !isTimeMetric(metric.unit));
                    setupData.timeLogIndex = 0;
                    setupData.loggedTimeValues = {};
                    userExperimentSetupData.set(userId, setupData);
                    await sendNextTimeLogPrompt(interaction, userId);
                } else {
                    // Path D: Fallback without time metrics -> show intermediate button
                    console.log(`[log_daily_progress_btn FALLBACK_NO_TIME_METRICS ${interactionId}] Path D: Fetched settings have no time metrics. Showing intermediate button.`);
                    const openModalButton = new ButtonBuilder()
                        .setCustomId('show_standard_log_modal_btn')
                        .setLabel('✍️ Open Log Form')
                        .setStyle(ButtonStyle.Success);
                    await interaction.editReply({
                        content: "Ready to log your daily metrics? Click the button below to open the form.",
                        components: [new ActionRowBuilder().addComponents(openModalButton)]
                    });
                }
            }
        } catch (error) {
            console.error(`[log_daily_progress_btn ERROR ${interactionId}] Error for User ${userId}:`, error);
            const userErrorMessage = `❌ An error occurred while preparing your log form: ${error.message || 'Please try again.'}`;
            // Universal error handler that checks interaction state
            if (interaction.replied || interaction.deferred) {
                try { await interaction.editReply({ content: userErrorMessage, components: [], embeds: [] }); }
                catch (e) { console.error(`[log_daily_progress_btn] Fallback editReply failed:`, e); }
            } else {
                try { await interaction.reply({ content: userErrorMessage, ephemeral: true }); }
                catch (e) { console.error(`[log_daily_progress_btn] Fallback reply failed:`, e); }
            }
        }
        const logButtonEndTime = performance.now();
        console.log(`[log_daily_progress_btn END ${interactionId}] Finished processing. Total time: ${(logButtonEndTime - logButtonStartTime).toFixed(2)}ms`);
    }

    else if (interaction.customId === LOG_TIME_NEXT_BTN_ID) {
        const timeNextButtonStartTime = performance.now();
        const interactionId = interaction.id;
        const userId = interaction.user.id;
        console.log(`[${LOG_TIME_NEXT_BTN_ID} START ${interactionId}] Clicked by ${userId}.`);
        try {
            await interaction.deferUpdate();

            const setupData = userExperimentSetupData.get(userId);
            if (!setupData || !setupData.logTimeH || !setupData.logTimeM || !setupData.logTimeAP) {
                await interaction.editReply({ content: '⚠️ Please select an Hour, Minute, and AM/PM before clicking "Next".' });
                return;
            }

            // Get the current metric being logged
            const timeLogIndex = setupData.timeLogIndex || 0;
            const currentMetric = setupData.logFlowTimeMetrics[timeLogIndex];

            // Convert time to decimal
            let hour = parseInt(setupData.logTimeH, 10);
            const minute = parseInt(setupData.logTimeM, 10);
            if (setupData.logTimeAP === 'PM' && hour !== 12) hour += 12;
            if (setupData.logTimeAP === 'AM' && hour === 12) hour = 0;
            const decimalTime = hour + (minute / 60);

            // Store the result
            setupData.loggedTimeValues[currentMetric.label] = decimalTime;
            console.log(`[${LOG_TIME_NEXT_BTN_ID} INFO ${interactionId}] Stored time ${decimalTime} for metric "${currentMetric.label}".`);

            // Increment index and clean up selections for the next prompt
            setupData.timeLogIndex = timeLogIndex + 1;
            delete setupData.logTimeH;
            delete setupData.logTimeM;
            delete setupData.logTimeAP;
            userExperimentSetupData.set(userId, setupData);

            // Call the helper to show the next prompt or the final button
            await sendNextTimeLogPrompt(interaction, userId);

        } catch (error) {
            console.error(`[${LOG_TIME_NEXT_BTN_ID} ERROR ${interactionId}] Error processing "Next" button for ${userId}:`, error);
        }
    }

    else if (interaction.customId === 'continue_to_final_log_btn') {
        const finalLogButtonStartTime = performance.now();
        const interactionId = interaction.id;
        const userId = interaction.user.id;
        console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userId}. Building final modal for non-time metrics.`);
        try {
            const setupData = userExperimentSetupData.get(userId);
            const otherMetrics = setupData?.logFlowOtherMetrics || [];
            const settings = setupData?.logFlowSettings;

            if (!settings) {
                console.error(`[${interaction.customId} ERROR ${interactionId}] Missing logFlowSettings for ${userId}.`);
                await interaction.reply({ content: "Error: Your logging session has expired. Please try clicking 'Log Daily Data' again.", ephemeral: true });
                return;
            }

            const modal = new ModalBuilder().setCustomId('dailyLogModal_firebase').setTitle(`📝 Final Step: Notes & Other Metrics`);
            const components = [];

            // Add inputs ONLY for non-time metrics
            otherMetrics.forEach(metric => {
                let customId;
                if (metric.label === settings.output.label) customId = 'log_output_value';
                else if (metric.label === settings.input1.label) customId = 'log_input1_value';
                else if (metric.label === settings.input2.label) customId = 'log_input2_value';
                else if (metric.label === settings.input3.label) customId = 'log_input3_value';
                
                if (customId) {
                    components.push(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder().setCustomId(customId).setLabel(`${metric.label} ${metric.unit}`).setPlaceholder(`Goal: ${metric.goal}`).setStyle(TextInputStyle.Short).setRequired(true)
                        )
                    );
                }
            });

            // Always add the notes field
            const notesInput = new TextInputBuilder().setCustomId('log_notes').setLabel('💭 Experiment & Life Notes').setStyle(TextInputStyle.Paragraph).setRequired(true);
            let finalPlaceholder = 'What did you observe? Any questions or insights?';
            if (settings.deeperProblem) {
                finalPlaceholder = `What affected your goal today?\n\n ↳ "${settings.deeperProblem.substring(0, 60)}"`;
            }
            notesInput.setPlaceholder(finalPlaceholder);
            components.push(new ActionRowBuilder().addComponents(notesInput));

            modal.addComponents(components);
            await interaction.showModal(modal);
            console.log(`[${interaction.customId} SUCCESS ${interactionId}] Final modal shown to ${userId}.`);

        } catch (error) {
            console.error(`[${interaction.customId} ERROR ${interactionId}] Failed to show final modal for ${userId}:`, error);
        }
    }

    else if (interaction.isButton() && (interaction.customId === CONFIRM_OUTCOME_TARGET_TIME_BTN_ID || interaction.customId === CONFIRM_INPUT_TARGET_TIME_BTN_ID)) {
      const confirmTimeClickTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;
      console.log(`[ConfirmTargetTime START ${interactionId}] Clicked by ${userTagForLog}. CustomID: ${interaction.customId}`);
      
      try {
        await interaction.deferUpdate();
        const deferTime = performance.now();
        console.log(`[ConfirmTargetTime DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - confirmTimeClickTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData) {
          console.error(`[ConfirmTargetTime CRITICAL ${interactionId}] Missing setup data for user ${userId}.`);
          await interaction.editReply({ content: "⚠️ Error: Your setup session has expired. Please restart with `/go`.", components: [], embeds: [] });
          return;
        }

        if (!setupData.targetTimeH || !setupData.targetTimeM || !setupData.targetTimeAP) {
          await interaction.editReply({ content: '⚠️ Please select an Hour, Minute, and AM/PM from the dropdowns before clicking "Confirm".', components: interaction.message.components });
          return;
        }

        let hour = parseInt(setupData.targetTimeH, 10);
        const minute = parseInt(setupData.targetTimeM, 10);
        if (setupData.targetTimeAP === 'PM' && hour !== 12) hour += 12;
        if (setupData.targetTimeAP === 'AM' && hour === 12) hour = 0;
        const decimalTime = hour + (minute / 60);
        
        delete setupData.targetTimeH;
        delete setupData.targetTimeM;
        delete setupData.targetTimeAP;

        if (interaction.customId === CONFIRM_OUTCOME_TARGET_TIME_BTN_ID) {
            setupData.outcomeGoal = decimalTime;
            console.log(`[ConfirmTargetTime OUTCOME_DEFINED ${interactionId}] User ${userTagForLog} defined Outcome with time target ${decimalTime}.`);

            setupData.currentInputIndex = 1;
            setupData.inputs = setupData.inputs || [];
            setupData.dmFlowState = 'processing_input1_label_suggestions';
            userExperimentSetupData.set(userId, setupData);

            await interaction.editReply({ content: `---\n---\n✅ **Outcome Metric Confirmed!**\n> ${formatDecimalAsTime(decimalTime)} ${setupData.outcomeLabel} ${setupData.outcomeUnit}\n\n🧠 Now, let's define your first **Daily Habit**. I'll brainstorm some ideas...`, components: [], embeds: [] });
            
            try {
                const habitSuggestionsResult = await callFirebaseFunction('generateInputLabelSuggestions', { userWish: setupData.deeperWish, outcomeMetric: { label: setupData.outcomeLabel, unit: setupData.outcomeUnit, goal: setupData.outcomeGoal }, definedInputs: [] }, userId);

                if (habitSuggestionsResult && habitSuggestionsResult.success && habitSuggestionsResult.suggestions?.length > 0) {
                    setupData.aiGeneratedInputLabelSuggestions = habitSuggestionsResult.suggestions;
                    setupData.dmFlowState = 'awaiting_input1_label_dropdown_selection';
                    userExperimentSetupData.set(userId, setupData);
                    console.log(`[ConfirmTargetTime INPUT1_LABEL_SUGGESTIONS_SUCCESS ${interactionId}] Received ${habitSuggestionsResult.suggestions.length} habit label suggestions.`);

                    const step = dmFlowConfig[setupData.dmFlowState];
                    const { content, components } = step.prompt(setupData);

                    // Edit the "thinking" message to show the dropdown prompt
                    await interaction.editReply({ content, components, embeds: [] });
                    console.log(`[ConfirmTargetTime INPUT1_LABEL_DROPDOWN_SENT ${interactionId}] Displayed AI habit label suggestions dropdown to ${userTagForLog}.`);
                } else {
                    let failureMessage = "I had a bit of trouble brainstorming right now. 😕";
                    if (habitSuggestionsResult && habitSuggestionsResult.error) failureMessage += ` (Reason: ${habitSuggestionsResult.error})`;
                    
                    setupData.dmFlowState = 'awaiting_input1_label_text';
                    userExperimentSetupData.set(userId, setupData);
                    
                    await interaction.editReply({ content: `${failureMessage}\n\nNo worries! What **Label** would you like to give your first Daily Habit? (max 30 characters).`, components: [], embeds: [] });
                    console.warn(`[ConfirmTargetTime INPUT1_LABEL_SUGGESTIONS_FAIL ${interactionId}] AI call failed or returned no data. Prompting for text.`);
                }
            } catch (error) {
                console.error(`[ConfirmTargetTime FIREBASE_FUNC_ERROR ${interactionId}] Error calling 'generateInputLabelSuggestions':`, error);
                setupData.dmFlowState = 'awaiting_input1_label_text';
                userExperimentSetupData.set(userId, setupData);
                await interaction.editReply({ content: "I encountered an issue connecting to my AI brain for suggestions.\n\nLet's set it up manually: What **Label** would you give your first Daily Habit? (max 30 characters).", components: [], embeds: [] });
            }

        } else if (interaction.customId === CONFIRM_INPUT_TARGET_TIME_BTN_ID) {
          // This part of the logic is for a later step, we leave it as is for now.
          const inputIndex = setupData.currentInputIndex;
          setupData.currentInputDefinition.goal = decimalTime;
          if (!setupData.inputs) setupData.inputs = [];
          setupData.inputs[inputIndex - 1] = { ...setupData.currentInputDefinition };
          console.log(`[ConfirmTargetTime INPUT_DEFINED ${interactionId}] User ${userTagForLog} defined Input ${inputIndex} with time target ${decimalTime}.`);

          const definedHabit = setupData.inputs[inputIndex - 1];
          delete setupData.currentInputDefinition;
          if (inputIndex >= 3) {
            await interaction.editReply({ content: "✅ All three habits defined! Let's review...", components: [], embeds: [] });
          } else {
            setupData.dmFlowState = 'awaiting_add_another_habit_choice';
            userExperimentSetupData.set(userId, setupData);
            const confirmationAndNextPrompt = new EmbedBuilder().setColor('#57F287').setTitle(`Habit ${inputIndex} Confirmed!`).setDescription("**${formatDecimalAsTime(definedHabit.goal)} ${definedHabit.label} ${definedHabit.unit}**").addFields({ name: '\u200B', value: "Would you like to add another habit to test?"});
            const addHabitButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('add_another_habit_yes_btn').setLabel('➕ Yes, Add Another').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('add_another_habit_no_btn').setLabel('⏭️ No, Skip').setStyle(ButtonStyle.Primary));
            await interaction.editReply({ embeds: [confirmationAndNextPrompt], components: [addHabitButtons] });
          }
        }
      } catch (error) {
        const errorTime = performance.now();
        console.error(`[ConfirmTargetTime ERROR ${interactionId}] Error at ${errorTime.toFixed(2)}ms:`, error);
        if (interaction.deferred && !interaction.replied) {
          try { await interaction.editReply({ content: `❌ An unexpected error occurred while confirming the time: ${error.message || 'Please try again.'}`, components: [], embeds: [] });
          } catch (e) { console.error(`[ConfirmTargetTime FALLBACK_ERROR ${interactionId}]`, e); }
        }
      }
    }

    // --- Placeholder Handler for Streak Progress Button ---
    else if (interaction.customId === 'streak_center_btn') {
        try {
            // This button is disabled, but if it were enabled, an ephemeral update is good.
            await interaction.update({ // Using update to acknowledge the button click, ephemerally
                content: "📊 Streak Progress coming soon! This message will self-destruct (not really, but it's just for you).",
                embeds: [], // Clear embeds
                components: [], // Remove buttons after click
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error(`Error replying to disabled button ${interaction.customId}:`, error);
             // If update failed, try a followup
            try {
                await interaction.followUp({ content: "📊 Streak Progress coming soon!", flags: MessageFlags.Ephemeral });
            } catch (followUpError) {
                console.error(`Error sending followup for ${interaction.customId}:`, followUpError);
            }
        }
    }

        // --- Handler for "AI Insights" Button (from /go hub) ---
    else if (interaction.isButton() && interaction.customId === 'ai_insights_btn') {
      const goInsightsButtonStartTime = performance.now();
      const interactionId = interaction.id; // For logging
      const userId = interaction.user.id;

      console.log(`[ai_insights_btn /go START ${interactionId}] Clicked by ${userId}. Time: ${goInsightsButtonStartTime.toFixed(2)}ms`);

      if (!dbAdmin) {
        console.error(`[ai_insights_btn /go ERROR ${interactionId}] dbAdmin (Firebase Admin Firestore) is not initialized. Cannot fetch experiments.`);
        try {
          await interaction.reply({ content: "❌ Error: The bot cannot access experiment data at the moment. Please try again later.", flags: MessageFlags.Ephemeral });
        } catch (replyError) {
          console.error(`[ai_insights_btn /go ERROR ${interactionId}] Failed to send dbAdmin error reply:`, replyError);
        }
        return;
      }

      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const deferTime = performance.now();
        console.log(`[ai_insights_btn /go DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - goInsightsButtonStartTime).toFixed(2)}ms`);

        // Fetch the most recent experimentId for the user
        let targetExperimentId = null;
        try {
          console.log(`[ai_insights_btn /go FIRESTORE_QUERY ${interactionId}] Querying most recent experiment for user ${userId}.`);
          const experimentStatsQuery = dbAdmin.collection('users').doc(userId).collection('experimentStats')
            .orderBy('calculationTimestamp', 'desc') // Assuming calculationTimestamp is a reliable indicator of completion/recency
            .limit(1);
          const experimentStatsSnapshot = await experimentStatsQuery.get();

          if (!experimentStatsSnapshot.empty) {
            targetExperimentId = experimentStatsSnapshot.docs[0].id;
            console.log(`[ai_insights_btn /go FIRESTORE_SUCCESS ${interactionId}] Found most recent experimentId: ${targetExperimentId} for user ${userId}.`);
          } else {
            console.log(`[ai_insights_btn /go FIRESTORE_EMPTY ${interactionId}] No experiment stats found for user ${userId}.`);
          }
        } catch (dbError) {
          console.error(`[ai_insights_btn /go FIRESTORE_ERROR ${interactionId}] Error fetching most recent experiment for user ${userId}:`, dbError);
          await interaction.editReply({ content: "❌ Error: Could not retrieve your experiment data. Please try again.", components: [] });
          return;
        }

        if (!targetExperimentId) {
          await interaction.editReply({ content: "💡 Complete your first experiment to get deep insights about yourself!", components: [] });
          console.log(`[ai_insights_btn /go NO_EXPERIMENTS ${interactionId}] Informed user ${userId} to complete an experiment.`);
          return;
        }

        // Now call the Firebase function with the found targetExperimentId
        console.log(`[ai_insights_btn /go FIREBASE_CALL ${interactionId}] Calling 'fetchOrGenerateAiInsights' for experiment ${targetExperimentId}, user ${userId}.`);
        const result = await callFirebaseFunction(
            'fetchOrGenerateAiInsights',
            { targetExperimentId: targetExperimentId },
            userId
        );
        const firebaseCallEndTime = performance.now();
        console.log(`[ai_insights_btn /go FIREBASE_RETURN ${interactionId}] 'fetchOrGenerateAiInsights' returned for exp ${targetExperimentId}. Took: ${(firebaseCallEndTime - deferTime).toFixed(2)}ms. Result:`, result);

        if (result && result.success) {
            await interaction.user.send(`💡 **AI Insights**\n\n${result.insightsText}`);
            await interaction.editReply({ content: "✅ AI Insights for your latest experiment have been sent to your DMs!", components: [] });
            console.log(`[ai_insights_btn /go SUCCESS ${interactionId}] AI Insights sent to DMs for experiment ${targetExperimentId}, user ${userId}.`);
        } else {
            console.error(`[ai_insights_btn /go FIREBASE_FAIL ${interactionId}] 'fetchOrGenerateAiInsights' failed for exp ${targetExperimentId}. Result:`, result);
            await interaction.editReply({ content: `❌ Failed to get AI insights for your latest experiment: ${result ? result.message : 'Unknown error.'}`, components: [] });
        }

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[ai_insights_btn /go CATCH_ERROR ${interactionId}] Error processing AI insights for user ${userId} at ${errorTime.toFixed(2)}ms:`, error);
        if (interaction.deferred && !interaction.replied) {
            try {
                await interaction.editReply({ content: `❌ An error occurred while fetching AI insights: ${error.message || 'Please try again.'}`, components: [] });
            } catch (editError) {
                console.error(`[ai_insights_btn /go CATCH_ERROR_EDIT_REPLY_FAIL ${interactionId}] Failed to send error editReply:`, editError);
            }
        } else if (!interaction.replied) {
             try {
                await interaction.reply({ content: `❌ An error occurred while fetching AI insights: ${error.message || 'Please try again.'}`, flags: MessageFlags.Ephemeral });
            } catch (replyError) {
                console.error(`[ai_insights_btn /go CATCH_ERROR_REPLY_FAIL ${interactionId}] Failed to send error reply:`, replyError);
            }
        }
      }
      const processEndTime = performance.now();
      console.log(`[ai_insights_btn /go END ${interactionId}] Finished processing for user ${userId}. Total time: ${(processEndTime - goInsightsButtonStartTime).toFixed(2)}ms`);
    }
 
      // --- Handler for "Get AI Insights" Button (from Stats DM) ---
    else if (interaction.isButton() && interaction.customId.startsWith('get_ai_insights_btn_')) {
      const insightsButtonStartTime = performance.now();
      const interactionId = interaction.id; // For logging
      const userId = interaction.user.id;
      const experimentId = interaction.customId.split('get_ai_insights_btn_')[1];
      console.log(`[get_ai_insights_btn_ START ${interactionId}] Clicked by ${userId} for experiment ${experimentId}. Time: ${insightsButtonStartTime.toFixed(2)}ms`);
      
      if (!experimentId) {
        console.error(`[get_ai_insights_btn_ ERROR ${interactionId}] Could not parse experimentId from customId: ${interaction.customId}`);
        try {
          await interaction.reply({ content: "❌ Error: Could not identify the experiment for AI insights. Please try again.", flags: MessageFlags.Ephemeral });
        } catch (replyError) {
          console.error(`[get_ai_insights_btn_ ERROR ${interactionId}] Failed to send error reply for missing experimentId:`, replyError);
        }
        return;
      }

      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const deferTime = performance.now();
        console.log(`[get_ai_insights_btn_ DEFERRED ${interactionId}] Interaction deferred for experiment ${experimentId}. Took: ${(deferTime - insightsButtonStartTime).toFixed(2)}ms`);
        
        console.log(`[get_ai_insights_btn_ FIREBASE_CALL ${interactionId}] Calling 'fetchOrGenerateAiInsights' for experiment ${experimentId}, user ${userId}.`);
        const result = await callFirebaseFunction(
            'fetchOrGenerateAiInsights', // New Firebase Function name
            { targetExperimentId: experimentId }, // Pass targetExperimentId
            userId // Pass the interacting user's ID for authentication
        );
        const firebaseCallEndTime = performance.now();
        console.log(`[get_ai_insights_btn_ FIREBASE_RETURN ${interactionId}] 'fetchOrGenerateAiInsights' returned for exp ${experimentId}. Took: ${(firebaseCallEndTime - deferTime).toFixed(2)}ms.`);

        if (result && result.success) {
            
            // <<< START: FINAL COMBINED LOGIC >>>
            // 1. Create the "Start New Experiment" button
            const followUpActionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('start_new_experiment_prompt_btn') 
                        .setLabel('🚀 Start a New Experiment')
                        .setStyle(ButtonStyle.Success)
                );

            // 2. Define the complete message content, including the descriptive text
            const finalMessageContent = `💡 **AI Insights**\n\n${result.insightsText}` +
                `\n\n---\n\n` +
                `At this point, you have 2 options:\n\n` +
                `1. **Start a new experiment**\n(click the button below)\n\n` +
                `2. **Continue with the same experiment.**\nKeep logging as usual. You'll get a weekly stats update AND new weekly AI insights too!`;

            // 3. Send the insights, descriptive text, and button in a SINGLE DM
            await interaction.user.send({
                content: finalMessageContent,
                components: [followUpActionRow]
            });

            // 4. Update the ephemeral reply to the user
            await interaction.editReply({ content: "✅ AI Insights and your next step have been sent to your DMs!", components: [] });
            console.log(`[get_ai_insights_btn_ SUCCESS ${interactionId}] Combined AI Insights, description, and 'Start New' button sent to DMs for experiment ${experimentId}, user ${userId}.`);
            // <<< END: FINAL COMBINED LOGIC >>>

        } else {
            console.error(`[get_ai_insights_btn_ FIREBASE_FAIL ${interactionId}] 'fetchOrGenerateAiInsights' failed for exp ${experimentId}. Result:`, result);
            await interaction.editReply({ content: `❌ Failed to get AI insights: ${result ? result.message : 'Unknown error.'}`, components: [] });
        }

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[get_ai_insights_btn_ CATCH_ERROR ${interactionId}] Error processing AI insights for exp ${experimentId}, user ${userId} at ${errorTime.toFixed(2)}ms:`, error);
        
        if (interaction.deferred && !interaction.replied) {
            try {
                await interaction.editReply({ content: `❌ An error occurred while fetching AI insights: ${error.message || 'Please try again.'}`, components: [] });
            } catch (editError) {
                console.error(`[get_ai_insights_btn_ CATCH_ERROR_EDIT_REPLY_FAIL ${interactionId}] Failed to send error editReply:`, editError);
            }
        } else if (!interaction.replied) {
             try {
                await interaction.reply({ content: `❌ An error occurred while fetching AI insights: ${error.message || 'Please try again.'}`, flags: MessageFlags.Ephemeral });
            } catch (replyError) {
                console.error(`[get_ai_insights_btn_ CATCH_ERROR_REPLY_FAIL ${interactionId}] Failed to send error reply:`, replyError);
            }
        }
      }
      const processEndTime = performance.now();
      console.log(`[get_ai_insights_btn_ END ${interactionId}] Finished processing for experiment ${experimentId}. Total time: ${(processEndTime - insightsButtonStartTime).toFixed(2)}ms`);
    }

        // --- START: NEW Unified Handler for Reminder Select Menus ---
    // --- Handler for "Set Reminders" button (Now Step 1: Get Current Time) ---
   else if (interaction.isButton() && interaction.customId === 'show_reminders_setup_modal_btn') {
    const buttonClickTime = performance.now();
    const interactionId = interaction.id;
    const userId = interaction.user.id;
    console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userId}. Preparing reminder setup (Step 1: Get Current Time). Time: ${buttonClickTime.toFixed(2)}ms`);

    try {
      await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
      const deferTime = performance.now();
      console.log(`[${interaction.customId} DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - buttonClickTime).toFixed(2)}ms`);

      const setupData = userExperimentSetupData.get(userId);
      if (!setupData || !setupData.experimentDuration) { // Ensure experimentDuration is set from previous step
        console.error(`[${interaction.customId} CRITICAL ${interactionId}] Missing setupData or experimentDuration for user ${userId}.`);
        await interaction.editReply({
          content: "⚠️ Error: Couldn't retrieve your experiment duration. Please select the duration again or start over using `/go`.",
          embeds: [],
          components: []
        });
        return;
      }

      // --- Build Embed for Step 1 (Current Time Input) ---
      const timeEmbed = new EmbedBuilder()
        .setColor('#72418c') // Purple
        .setTitle('⏰ Reminder Setup - Step 1 of 2')
        .setDescription('Please set your **CURRENT LOCAL TIME** to tune the reminders.');

      // --- Build Step 1 Components (Time Selects + New "Next" Button) ---
      const timeHourSelect = new StringSelectMenuBuilder()
        .setCustomId(REMINDER_SELECT_TIME_H_ID)
        .setPlaceholder('Current time - HOUR (e.g., 2 PM)')
        .addOptions(
          Array.from({ length: 12 }, (_, i) => new StringSelectMenuOptionBuilder()
            .setLabel(String(i + 1))
            .setValue(String(i + 1)))
        );
      const rowTimeH = new ActionRowBuilder().addComponents(timeHourSelect);

      const timeMinuteSelect = new StringSelectMenuBuilder()
        .setCustomId(REMINDER_SELECT_TIME_M_ID)
        .setPlaceholder('Current time - MINUTE (e.g., :30)')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('00').setValue('00'),
          new StringSelectMenuOptionBuilder().setLabel('05').setValue('05'),
          new StringSelectMenuOptionBuilder().setLabel('10').setValue('10'),
          new StringSelectMenuOptionBuilder().setLabel('15').setValue('15'),
          new StringSelectMenuOptionBuilder().setLabel('20').setValue('20'),
          new StringSelectMenuOptionBuilder().setLabel('25').setValue('25'),
          new StringSelectMenuOptionBuilder().setLabel('30').setValue('30'),
          new StringSelectMenuOptionBuilder().setLabel('35').setValue('35'),
          new StringSelectMenuOptionBuilder().setLabel('40').setValue('40'),
          new StringSelectMenuOptionBuilder().setLabel('45').setValue('45'),
          new StringSelectMenuOptionBuilder().setLabel('50').setValue('50'),
          new StringSelectMenuOptionBuilder().setLabel('55').setValue('55')
        );
      const rowTimeM = new ActionRowBuilder().addComponents(timeMinuteSelect);

      const timeAmPmSelect = new StringSelectMenuBuilder()
        .setCustomId(REMINDER_SELECT_TIME_AP_ID)
        .setPlaceholder('Current time - AM or PM')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('AM').setValue('AM'),
          new StringSelectMenuOptionBuilder().setLabel('PM').setValue('PM')
        );
      const rowTimeAP = new ActionRowBuilder().addComponents(timeAmPmSelect);

      // New "Next" button for this step
      const nextButtonSetTime = new ButtonBuilder()
        .setCustomId(REMINDERS_SET_TIME_NEXT_BTN_ID)
        .setLabel('Next: Set Reminder Window & Frequency')
        .setStyle(ButtonStyle.Primary);
      const rowNextButton = new ActionRowBuilder().addComponents(nextButtonSetTime);

      console.log(`[${interaction.customId} EDIT_REPLY ${interactionId}] Editing reply to display reminder step 1 (current time selects) for ${userId}.`);
      await interaction.editReply({
        content: 'Please select your current local time using the dropdowns below, then click "Next".',
        embeds: [timeEmbed],
        components: [rowTimeH, rowTimeM, rowTimeAP, rowNextButton]
      });
      const editReplyTime = performance.now();
      console.log(`[${interaction.customId} EDIT_REPLY_SUCCESS ${interactionId}] Displayed reminder step 1 for ${userId}. Took: ${(editReplyTime - deferTime).toFixed(2)}ms.`);

    } catch (error) {
      const errorTime = performance.now();
      console.error(`[${interaction.customId} ERROR ${interactionId}] Error processing button for ${userId} at ${errorTime.toFixed(2)}ms:`, error);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: '❌ Error showing the first step of reminder setup (current time). Please try clicking "Set Reminders" again.',
            embeds: [],
            components: []
          });
        } else {
          console.warn(`[${interaction.customId} ERROR_NO_EDIT ${interactionId}] Interaction not editable for error message.`);
        }
      } catch (editError) {
        console.error(`[${interaction.customId} FALLBACK_ERROR ${interactionId}] Fallback error reply failed:`, editError);
      }
    }
    const processEndTime = performance.now();
    console.log(`[${interaction.customId} END ${interactionId}] Finished processing. Total time: ${(processEndTime - buttonClickTime).toFixed(2)}ms`);
   }

   // --- Handler for "Next: Set Reminder Window & Frequency" button (New Step 2) ---
   else if (interaction.isButton() && interaction.customId === REMINDERS_SET_TIME_NEXT_BTN_ID) {
      const nextStepClickTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userId}. Preparing reminder step 2 (window/frequency). Time: ${nextStepClickTime.toFixed(2)}ms`);

      try {
        await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
        const deferTime = performance.now();
        console.log(`[${interaction.customId} DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - nextStepClickTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData) {
          console.error(`[${interaction.customId} CRITICAL ${interactionId}] Missing setup data for user ${userId}.`);
          await interaction.editReply({
            content: "⚠️ Error: Couldn't retrieve your experiment setup data. Please start over using `/go`.",
            embeds: [],
            components: []
          });
          return;
        }

        // Validate that selections for step 1 (current time) have been made
        if (!setupData.reminderTimeH || !setupData.reminderTimeM || !setupData.reminderTimeAP) {
          console.error(`[${interaction.customId} VALIDATION_FAIL ${interactionId}] Missing current time selections for ${userId}. Data:`, setupData);
          await interaction.editReply({
            content: "⚠️ Please select your current Hour, Minute, and AM/PM from the dropdowns before proceeding.",
            embeds: [interaction.message.embeds[0]], // Keep the previous embed (current time embed)
            components: interaction.message.components // Keep the previous components for correction
          });
          return;
        }
        const reconstructedTime = `${setupData.reminderTimeH}:${setupData.reminderTimeM} ${setupData.reminderTimeAP}`;
        console.log(`[${interaction.customId} INFO ${interactionId}] User ${userId} current time set to: "${reconstructedTime}"`);


        // --- Build Embed for Step 2 (Reminder Window & Frequency) ---
        const reminderEmbedStep2 = new EmbedBuilder()
          .setColor('#47d264') // Greenish
          .setTitle('⏰ Reminder Setup - Step 2 of 2')
          .setDescription(`Current time approximately **${reconstructedTime}**.\n\nNow, set your **daily reminder window** and **frequency**.`)
          .addFields(
            { name: '**Reminder Window** (e.g., 9 AM - 5 PM)', value: 'Reminders will only be sent between these hours.', inline: false },
            { name: '**Frequency**', value: 'How often you receive reminders within that window.', inline: false }
          )
          .setFooter({ text: 'Make selections below, then click Confirm All.' });

        // --- Build Step 2 Components: Window (Start/End) & Frequency Selects + Final Confirm Button ---
        const startHourSelect = new StringSelectMenuBuilder()
          .setCustomId(REMINDER_SELECT_START_HOUR_ID)
          .setPlaceholder('Reminder window START hour')
          .addOptions(
            Array.from({ length: 24 }, (_, i) => {
              const hour12 = i % 12 === 0 ? 12 : i % 12;
              const period = i < 12 || i === 24 ? 'AM' : 'PM'; // Corrected for 24 = 12 AM next day
              if (i === 0) return new StringSelectMenuOptionBuilder().setLabel(`12 AM (Midnight Start)`).setValue(String(i).padStart(2, '0'));
              return new StringSelectMenuOptionBuilder()
                .setLabel(`${hour12} ${period} (${String(i).padStart(2, '0')}:00)`)
                .setValue(String(i).padStart(2, '0'));
            })
          );
        const rowStartHour = new ActionRowBuilder().addComponents(startHourSelect);

        const endHourSelect = new StringSelectMenuBuilder()
          .setCustomId(REMINDER_SELECT_END_HOUR_ID)
          .setPlaceholder('Reminder window END hour')
          .addOptions(
            Array.from({ length: 24 }, (_, i) => {
              const hour12 = i % 12 === 0 ? 12 : i % 12;
              const period = i < 12 || i === 24 ? 'AM' : 'PM';
              if (i === 0) return new StringSelectMenuOptionBuilder().setLabel(`12 AM (Midnight End)`).setValue(String(i).padStart(2, '0'));
              return new StringSelectMenuOptionBuilder()
                .setLabel(`${hour12} ${period} (${String(i).padStart(2, '0')}:00)`)
                .setValue(String(i).padStart(2, '0'));
            })
          );
        const rowEndHour = new ActionRowBuilder().addComponents(endHourSelect);

        const freqSelect = new StringSelectMenuBuilder()
          .setCustomId(REMINDER_SELECT_FREQUENCY_ID)
          .setPlaceholder('How often for reminders?')
          .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('No Reminders').setValue('none').setDescription("I'll log on my own. Skips next step."),
            new StringSelectMenuOptionBuilder().setLabel('Once a day').setValue('daily_1').setDescription('One random reminder per day within window.'),
            new StringSelectMenuOptionBuilder().setLabel('Twice a day').setValue('daily_2').setDescription('Two random reminders per day within window.'),
            new StringSelectMenuOptionBuilder().setLabel('Every other day').setValue('every_other_day').setDescription('One random reminder, every other day.')
          );
        const rowFreq = new ActionRowBuilder().addComponents(freqSelect);

        const confirmAllButton = new ButtonBuilder()
          .setCustomId(CONFIRM_REMINDER_BTN_ID) // This is the existing final confirm button
          .setLabel('Confirm All Reminder Settings')
          .setStyle(ButtonStyle.Success);
        const rowConfirm = new ActionRowBuilder().addComponents(confirmAllButton);

        console.log(`[${interaction.customId} EDIT_REPLY ${interactionId}] Editing reply to display reminder step 2 (window/frequency) for ${userId}.`);
        await interaction.editReply({
          content: 'Great! Now set your preferred reminder window and frequency.',
          embeds: [reminderEmbedStep2],
          components: [rowStartHour, rowEndHour, rowFreq, rowConfirm]
        });
        const editReplyTime = performance.now();
        console.log(`[${interaction.customId} EDIT_REPLY_SUCCESS ${interactionId}] Displayed reminder step 2 for ${userId}. Took: ${(editReplyTime - deferTime).toFixed(2)}ms`);

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[${interaction.customId} ERROR ${interactionId}] Error processing button for user ${userId} at ${errorTime.toFixed(2)}ms:`, error);
        try {
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
              content: '❌ Error preparing the reminder window setup. Please try clicking "Next" again from the previous step.',
              embeds: [],
              components: []
            });
          } else {
            console.warn(`[${interaction.customId} ERROR_NO_EDIT ${interactionId}] Interaction not editable for error message.`);
          }
        } catch (editError) {
          console.error(`[${interaction.customId} FALLBACK_ERROR ${interactionId}] Fallback error reply failed:`, editError);
        }
      }
      const processEndTime = performance.now();
      console.log(`[${interaction.customId} END ${interactionId}] Finished processing. Total time: ${(processEndTime - nextStepClickTime).toFixed(2)}ms`);
   }
    // --- END: Handler for "Next: Set Reminder Window & Frequency" button ---
    // --- END: Unified Handler for Reminder Select Menus ---

   // --- START: NEW Handler for Final Confirm Reminder Button (CONFIRM_REMINDER_BTN_ID) ---
   else if (interaction.isButton() && interaction.customId === CONFIRM_REMINDER_BTN_ID) {
    const confirmClickTime = performance.now();
    const interactionId = interaction.id;
    const userId = interaction.user.id;
    console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userId}. Finalizing reminder setup. Time: ${confirmClickTime.toFixed(2)}ms`);

    try {
        await interaction.deferUpdate({ flags: MessageFlags.Ephemeral }); // Acknowledge button click
        const deferTime = performance.now();
        console.log(`[${interaction.customId} DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - confirmClickTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);

        // --- Validation: Check if all required selections are made ---
        // Also need experimentDuration from the very first steps.
        const requiredKeys = [
            'experimentDuration', // From earlier step
            'reminderStartHour',
            'reminderEndHour',
            'reminderFrequency',
            'reminderTimeH',      // Current Time Hour
            'reminderTimeM',      // Current Time Minute
            'reminderTimeAP'      // Current Time AM/PM
        ];

        if (!setupData) {
            console.error(`[${interaction.customId} CRITICAL ${interactionId}] Missing setupData entirely for user ${userId}.`);
            await interaction.editReply({
                content: `⚠️ Error: Could not retrieve any of your experiment setup data. Please start over with \`/go\`.`,
                embeds: [],
                components: []
            });
            return;
        }

        const missingKeys = requiredKeys.filter(key => !setupData[key]); // Simpler check for undefined/null

        if (missingKeys.length > 0) {
            console.error(`[${interaction.customId} VALIDATION_FAIL ${interactionId}] Missing required selections for ${userId}. Missing: ${missingKeys.join(', ')}. Data:`, setupData);
            await interaction.editReply({
                content: `⚠️ Please ensure you have selected values for all reminder options, including your current time. Missing: \`${missingKeys.join(', ')}\`. Go back and make selections from the dropdowns.`,
                embeds: [interaction.message.embeds[0]], // Keep the current "Set Current Time" embed
                components: interaction.message.components // Keep existing selects/button for correction
            });
            return;
        }

        // --- Reconstruct Current Time String (e.g., "2:30 PM") ---
        // The backend 'setExperimentSchedule' expects a single string for userCurrentTime.
        const reconstructedTime = `${setupData.reminderTimeH}:${setupData.reminderTimeM} ${setupData.reminderTimeAP}`;
        console.log(`[${interaction.customId} INFO ${interactionId}] Reconstructed current time for ${userId}: "${reconstructedTime}"`);

        // --- Validation: Check Start/End Hour Logic ---
        const startHour24 = parseInt(setupData.reminderStartHour, 10); // Values are "00" - "23"
        const endHour24 = parseInt(setupData.reminderEndHour, 10);     // Values are "00" - "23"

        // Convert to 12-hour format with AM/PM for user-facing messages
            const formatHourForDisplay = (hour24) => {
            const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
            const period = hour24 < 12 || hour24 === 24 ? 'AM' : 'PM'; // 24 is midnight AM (next day start)
            if (hour24 === 0) return '12 AM (Midnight)'; // Special case for midnight display
            return `${hour12} ${period}`;
        };

        // If endHour is 0 (midnight), it's effectively the end of the day, so it's "greater" than any start hour for validation.
        // The check should be: if endHour is NOT midnight (0), then startHour must be less than endHour.
        if (endHour24 !== 0 && startHour24 >= endHour24) {
            console.warn(`[${interaction.customId} VALIDATION_FAIL ${interactionId}] Invalid time window for ${userId}: Start ${startHour24} >= End ${endHour24} (and End is not Midnight).`);
            await interaction.editReply({
                content: `⚠️ Reminder window end time (${formatHourForDisplay(endHour24)}) must be after the start time (${formatHourForDisplay(startHour24)}), unless the end time is midnight (12 AM). Please go back and correct your selections using the "Set Reminders" button again from the previous step (you might need to restart the /go flow if navigation is tricky).`,
                embeds: [interaction.message.embeds[0]], // Keep current embed
                components: interaction.message.components // Keep current components
            });
            return;
        }

        // --- Prepare Payload for Firebase 'setExperimentSchedule' ---
        const payload = {
            experimentDuration: setupData.experimentDuration,
            userCurrentTime: reconstructedTime,
            reminderWindowStartHour: setupData.reminderStartHour, // e.g., "09"
            reminderWindowEndHour: setupData.reminderEndHour,     // e.g., "17"
            reminderFrequency: setupData.reminderFrequency,       // e.g., "daily_1"
            customReminderMessage: null, // As decided, no custom message input in this flow
            skippedReminders: false     // Explicitly false as they went through setup
        };

        console.log(`[${interaction.customId} FIREBASE_CALL ${interactionId}] Calling setExperimentSchedule for ${userId}. Payload:`, payload);
        const scheduleResult = await callFirebaseFunction('setExperimentSchedule', payload, userId);

        // Proposed replacement for the success/else block for CONFIRM_REMINDER_BTN_ID
        if (scheduleResult && scheduleResult.success && scheduleResult.experimentId) {
          const experimentId = scheduleResult.experimentId;
          setupData.experimentId = experimentId;
          userExperimentSetupData.set(userId, setupData);

          console.log(`[${interaction.customId} FIREBASE_SUCCESS ${interactionId}] setExperimentSchedule successful for ${userId}. Experiment ID: ${experimentId}.`);
          const reminderSummary = `Reminders set for ${setupData.reminderFrequency.replace(/_/g, ' ')} between ${formatHourForDisplay(startHour24)} - ${formatHourForDisplay(endHour24)} (your local time approx, based on current time provided).`;
          
          // Store the summary in setupData for the DM later
          setupData.reminderSummary = reminderSummary;
          userExperimentSetupData.set(userId, setupData);

          await showPostToGroupPrompt(interaction, setupData); // Call the modified function
        } else {
          console.error(`[${interaction.customId} FIREBASE_FAIL ${interactionId}] setExperimentSchedule failed for ${userId} or experimentId missing. Result:`, scheduleResult);
          await interaction.editReply({
              content: `⚠️ Could not save your reminder settings: ${scheduleResult?.error || 'Unknown server error or missing experiment ID.'}. Your experiment settings and duration are saved. You may need to try setting reminders again via \`/go\`.`,
              embeds: [],
              components: []
          });
        }

    } catch (error) {
        const errorTime = performance.now();
        console.error(`[${interaction.customId} ERROR ${interactionId}] Error processing confirmation for ${userId} at ${errorTime.toFixed(2)}ms:`, error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ // Use editReply as it was deferred
                    content: `❌ An error occurred while saving your reminder settings: ${error.message || 'Unknown error'}. Please try again.`,
                    embeds: [],
                    components: []
                });
            } else {
                console.warn(`[${interaction.customId} ERROR_NO_EDIT ${interactionId}] Interaction not editable for error message.`);
            }
        } catch (editError) {
            console.error(`[${interaction.customId} FALLBACK_ERROR ${interactionId}] Fallback error reply failed for ${userId}:`, editError);
            try {
                await interaction.followUp({content: `❌ An error occurred while saving reminder settings: ${error.message || 'Unknown error'}.`, ephemeral: true });
            } catch (followUpErrorInner) {
                console.error(`[${interaction.customId} FALLBACK_ERROR_INNER ${interactionId}] Inner fallback error followup failed for ${userId}:`, followUpErrorInner);
            }
        }
    }
    const processEndTime = performance.now();
    console.log(`[${interaction.customId} END ${interactionId}] Finished processing confirmation. Total time: ${(processEndTime - confirmClickTime).toFixed(2)}ms`);
   }
   // --- END: NEW Handler for Final Confirm Reminder Button ---

   // Button handler for "Skip Reminders"
   else if (interaction.isButton() && interaction.customId === 'skip_reminders_btn') {
    console.log(`[skip_reminders_btn] Clicked by ${interaction.user.tag}`);
    await interaction.deferUpdate(); // Acknowledge the button click

    const userId = interaction.user.id;
    const setupData = userExperimentSetupData.get(userId);

    if (!setupData || !setupData.settingsMessage || !setupData.experimentDuration) {
      console.error(`[skip_reminders_btn] Critical: Missing setup data for ${userId}`);
      await interaction.editReply({ content: "⚠️ Error: Could not retrieve your experiment settings to finalize. Please start over with `/go`.", components: [] });
      return;
    }

    const payload = {
      experimentDuration: setupData.experimentDuration,
      userCurrentTime: null, // Explicitly null or omitted
      reminderWindowStartHour: null,
      reminderWindowEndHour: null,
      reminderFrequency: 'none', // Explicitly 'none'
      customReminderMessage: null,
      skippedReminders: true
    };

    console.log(`[skip_reminders_btn] Calling setExperimentSchedule for ${userId} with skipped reminders. Payload:`, payload);
    try {
      const scheduleResult = await callFirebaseFunction('setExperimentSchedule', payload, userId);
      if (scheduleResult && scheduleResult.success) {
        console.log(`[skip_reminders_btn] setExperimentSchedule successful for ${userId} (reminders skipped).`);
        
        // Store the reminder summary in setupData for the DM later
        setupData.reminderSummary = "Reminders skipped as per your choice.";
        userExperimentSetupData.set(userId, setupData);

        // Proceed to "Post to group?" prompt
        await showPostToGroupPrompt(interaction, setupData);
      } else {
        console.error(`[skip_reminders_btn] setExperimentSchedule failed for ${userId} (reminders skipped). Result:`, scheduleResult);
        await interaction.editReply({ content: `⚠️ Could not finalize experiment (reminders skipped): ${scheduleResult ? scheduleResult.error : 'Unknown server error.'}. Your experiment settings and duration are saved.`, components: [] });
      }
    } catch (error) {
      console.error(`[skip_reminders_btn] Error calling setExperimentSchedule for ${userId} (reminders skipped):`, error);
      await interaction.editReply({ content: `❌ An error occurred while finalizing your experiment (reminders skipped): ${error.message}. Your experiment settings and duration are saved.`, components: [] });
    }
   }

   // Button handlers for the FINAL "Post to group?"
   else if (interaction.isButton() && interaction.customId === 'post_exp_final_yes') {
      await interaction.deferUpdate();
      const userId = interaction.user.id;
      const setupData = userExperimentSetupData.get(userId);
      let dmFailed = false;

      if (!setupData || !setupData.rawPayload || !setupData.guildId || !setupData.experimentDuration) {
          await interaction.editReply({ content: "⚠️ Error: Could not retrieve complete experiment details or original server context to post. Your settings are saved.", components: [] });
          userExperimentSetupData.delete(userId);
          return;
      }

      // Send the summary DM first
      try {
          await sendFinalSummaryDM(interaction, setupData);
      } catch (dmError) {
          console.warn(`[post_exp_final_yes] Failed to send summary DM, but proceeding with public post.`);
          dmFailed = true;
      }

      const experimentsChannelId = '1364283719296483329';
      let targetGuild;
      try {
          targetGuild = await client.guilds.fetch(setupData.guildId);
      } catch (guildFetchError) {
          console.error(`[post_exp_final_yes] Error fetching guild ${setupData.guildId}:`, guildFetchError);
          await interaction.editReply({ content: "⚠️ Error: Could not find the original server to post to. Your settings are saved.", components: [] });
          userExperimentSetupData.delete(userId);
          return;
      }

      const channel = targetGuild.channels.cache.get(experimentsChannelId);
      if (channel && channel.isTextBased()) {
          try {
              const { deeperProblem, outputSetting, inputSettings } = setupData.rawPayload;

              // Helper function to format metric strings for display
              const formatMetricForDisplay = (metricString) => {
                  if (!metricString || typeof metricString !== 'string') return "Not specified";
                  const parts = metricString.split(',').map(p => p.trim());
                  if (parts.length !== 3) return metricString; // Return as is if format is wrong

                  const [goalStr, unit, label] = parts;

                  // Check if the unit indicates a time-based metric
                  const isTime = TIME_OF_DAY_KEYWORDS.includes(unit.toLowerCase().trim());

                  if (isTime) {
                      const goal = parseFloat(goalStr);
                      if (!isNaN(goal)) {
                          // Format the decimal goal as a time string and reconstruct
                          return `${formatDecimalAsTime(goal)}, ${unit}, ${label}`;
                      }
                  }
                  // If not a time metric or goal is not a number, return the original string
                  return metricString;
              };

              const postEmbed = new EmbedBuilder()
                  .setColor('#7289DA') // Blue
                  .setTitle(`🚀 ${interaction.user.username} is starting a new experiment!`)
                  .setDescription(`**🎯 Deeper Wish:**\n${deeperProblem}`)
                  .addFields(
                      { name: '📊 Daily Outcome to Track', value: formatMetricForDisplay(outputSetting) },
                      { name: '🛠️ Habit 1', value: formatMetricForDisplay(inputSettings[0]) }
                  )
                  .setFooter({ text: `Let's support them!` })
                  .setTimestamp();

              if (inputSettings[1]) {
                  postEmbed.addFields({ name: '🛠️ Habit 2', value: formatMetricForDisplay(inputSettings[1]), inline: true });
              }
              if (inputSettings[2]) {
                  postEmbed.addFields({ name: '🛠️ Habit 3', value: formatMetricForDisplay(inputSettings[2]), inline: true });
              }

              await channel.send({ embeds: [postEmbed] });

              const finalMessage = dmFailed
                ? `✅ Shared to the #experiments channel! (I couldn't DM you the summary, you may have DMs disabled).`
                : `✅ Shared to the #experiments channel in ${targetGuild.name}! I've also DMed you the summary.`;

              await interaction.editReply({ content: finalMessage, components: [] });
          } catch (postError) {
              console.error(`[post_exp_final_yes] Error posting to channel ${experimentsChannelId}:`, postError);
              await interaction.editReply({ content: "⚠️ Could not post to the #experiments channel. Please check my permissions there. Your settings are saved.", components: [] });
          }
      } else {
          await interaction.editReply({ content: `⚠️ Could not find the #experiments channel in ${targetGuild.name}. Your settings are saved.`, components: [] });
      }
      userExperimentSetupData.delete(userId);
   }
   
   else if (interaction.isButton() && interaction.customId === 'post_exp_final_no') {
      await interaction.deferUpdate();  
      const userId = interaction.user.id;
      const setupData = userExperimentSetupData.get(userId);
      let dmFailed = false;

      // Send the summary DM first
      if (setupData) {
          try {
              await sendFinalSummaryDM(interaction, setupData);
          } catch (dmError) {
              console.warn(`[post_exp_final_no] Failed to send summary DM.`);
              dmFailed = true;
          }
      } else {
          console.warn(`[post_exp_final_no] Could not send summary DM because setupData was missing.`);
          dmFailed = true; // Treat as a failure to DM
      }
      
      const finalMessage = dmFailed
          ? "👍 Got it! Your experiment is all set and kept private. (I couldn't DM you the summary, you may have DMs disabled)."
          : "👍 Got it! Your experiment is all set and kept private. I've DMed you a summary. Good luck!";
      
      await interaction.editReply({
          content: finalMessage,
          components: []
      });
      userExperimentSetupData.delete(interaction.user.id);
   }

    // --- Handler for "Start New Experiment?" button (from delayed DM) ---
    else if (interaction.customId === 'start_new_experiment_prompt_btn') {
      const buttonClickTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;

      console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userTagForLog}. Transitioning to AI/Manual setup choice. Time: ${buttonClickTime.toFixed(2)}ms`);

      try {
        // 1. Acknowledge the button click on the DM by removing the button.
        await interaction.update({ // This updates the DM message the button was on
          // content: "Taking you to experiment setup choices...", // Optional content update
          components: [] // Remove the button
        });
        const updateTime = performance.now();
        console.log(`[${interaction.customId} ACKNOWLEDGED ${interactionId}] DM Button acknowledged/updated. Took: ${(updateTime - buttonClickTime).toFixed(2)}ms`);

        // 2. Use the single GUILD_ID from environment variables
        const singleGuildId = process.env.GUILD_ID;
        if (!singleGuildId) {
          console.error(`[${interaction.customId} CRITICAL_ERROR ${interactionId}] GUILD_ID is not defined in environment variables.`);
          // Send a new DM because the original interaction was already updated.
          await interaction.user.send({ content: "Error: Bot configuration is missing critical information. Cannot proceed with experiment setup." });
          return;
        }

        // 3. Initialize/Update userExperimentSetupData (similar to 'set_update_experiment_btn')
        const existingData = userExperimentSetupData.get(userId) || {};
        userExperimentSetupData.set(userId, {
          ...existingData, // Preserve other data if any
          userId: userId,
          guildId: singleGuildId, // Use the single guild ID
          userTag: userTagForLog,
          // Clear any stale flow-specific data from a *previous* setup if this is a true restart point
          dmFlowState: 'choosing_setup_method', // A conceptual state, next message handles actual choice
          experimentDuration: null, // Reset duration from any previous flow
          settingsMessage: null,    // Reset settings message
          rawPayload: null,         // Reset raw payload
          // Any other fields that should be reset when starting a new setup choice
          interactionId: interactionId // Store current interaction ID for logging context
        });
        console.log(`[${interaction.customId} SETUP_DATA_INIT ${interactionId}] Initialized/Updated setupData for user ${userId} with hardcoded guildId: ${singleGuildId}.`);

        // 4. (Optional but recommended) Asynchronously Pre-fetch Weekly Settings
        (async () => {
          const prefetchAsyncStartTime = performance.now();
          try {
            console.log(`[${interaction.customId} ASYNC_PREFETCH_START ${interactionId}] Asynchronously pre-fetching weekly settings for ${userTagForLog}.`);
            const settingsResult = await callFirebaseFunction('getWeeklySettings', {}, userId);
            const currentSetupDataForPrefetch = userExperimentSetupData.get(userId) || {}; // Get latest

            if (settingsResult && settingsResult.settings) {
              userExperimentSetupData.set(userId, { ...currentSetupDataForPrefetch, preFetchedWeeklySettings: settingsResult.settings, preFetchedWeeklySettingsTimestamp: Date.now() });
              console.log(`[${interaction.customId} ASYNC_PREFETCH_SUCCESS ${interactionId}] Successfully pre-fetched and cached weekly settings for ${userTagForLog}.`);
            } else {
              const { preFetchedWeeklySettings, preFetchedWeeklySettingsTimestamp, ...restOfData } = currentSetupDataForPrefetch;
              userExperimentSetupData.set(userId, restOfData);
              console.log(`[${interaction.customId} ASYNC_PREFETCH_NO_DATA ${interactionId}] No weekly settings found for ${userTagForLog} during async pre-fetch. Cleared prefetch cache fields.`);
            }
          } catch (fetchError) {
            console.error(`[${interaction.customId} ASYNC_PREFETCH_ERROR ${interactionId}] Error pre-fetching weekly settings for ${userTagForLog}:`, fetchError.message);
            const currentSetupDataOnError = userExperimentSetupData.get(userId) || {};
            const { preFetchedWeeklySettings, preFetchedWeeklySettingsTimestamp, ...restOfDataOnError } = currentSetupDataOnError;
            userExperimentSetupData.set(userId, restOfDataOnError); // Clear prefetch on error
          } finally {
            console.log(`[${interaction.customId} ASYNC_PREFETCH_DURATION ${interactionId}] Async pre-fetching took: ${(performance.now() - prefetchAsyncStartTime).toFixed(2)}ms.`);
          }
        })();

        // 5. Build and send the AI/Manual choice embed as a NEW DM
        //    (Reusing the embed and buttons from 'set_update_experiment_btn' handler)
        const choiceEmbed = new EmbedBuilder()
          .setColor('#7F00FF')
          .setTitle('🔬 Want some AI help?')
         // .setDescription("Choose your preferred method:\n\n✨ **AI Assisted (Beginner):** I'll guide you step-by-step, starting with a wish and helping you define your experiment with AI examples.\n\n✍️ **Manual Setup (Advanced):** You'll fill out a form with all your experiment details directly.");

        const aiButton = new ButtonBuilder()
          .setCustomId(AI_ASSISTED_SETUP_BTN_ID) // Existing ID
          .setLabel('✨ AI Assisted (Beginner)')
          .setStyle(ButtonStyle.Primary);

        const manualButton = new ButtonBuilder()
          .setCustomId(MANUAL_SETUP_BTN_ID) // Existing ID
          .setLabel('✍️ Manual Setup (Advanced)')
          .setStyle(ButtonStyle.Secondary);

        const choiceRow = new ActionRowBuilder().addComponents(aiButton, manualButton);

        await interaction.user.send({ // Send as a new DM
          content: "Let's get your next experiment started!",
          embeds: [choiceEmbed],
          components: [choiceRow]
        });
        console.log(`[${interaction.customId} CHOICE_DM_SENT ${interactionId}] AI/Manual choice DM sent to ${userTagForLog}.`);

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[${interaction.customId} ERROR ${interactionId}] Error processing button for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error);
        // Attempt to send a new DM for the error, as the original interaction was already updated.
        try {
          await interaction.user.send({ content: "Sorry, there was an issue transitioning you to the experiment setup. Please try using the `/go` command in the server." });
        } catch (dmError) {
          console.error(`[${interaction.customId} FALLBACK_DM_ERROR ${interactionId}] Failed to send error DM to ${userTagForLog}:`, dmError);
        }
      }
      const processEndTime = performance.now();
      console.log(`[${interaction.customId} END ${interactionId}] Finished processing. Total time: ${(processEndTime - buttonClickTime).toFixed(2)}ms`);
    }
    // Make sure this is placed before the final 'else' for unrecognized interactions

// --- NEW ---
    else if (interaction.isButton() && interaction.customId === 'ai_show_share_prompt_btn') {
    const showSharePromptClickTime = performance.now();
    const interactionId = interaction.id;
    const userId = interaction.user.id;
    const userTagForLog = interaction.user.tag;
    console.log(`[ai_show_share_prompt_btn START ${interactionId}] Clicked by ${userTagForLog}. Preparing to show AI public post suggestion.`);
    try {
        await interaction.deferUpdate();
        const deferTime = performance.now();
        console.log(`[ai_show_share_prompt_btn DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - showSharePromptClickTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        const aiPublicPostSuggestion = setupData?.aiLogPublicPostSuggestion;
        if (!aiPublicPostSuggestion || typeof aiPublicPostSuggestion !== 'string' || aiPublicPostSuggestion.trim() === "") {
            console.warn(`[ai_show_share_prompt_btn WARN ${interactionId}] AI public post suggestion missing or invalid for user ${userId}.`);
            await interaction.editReply({
                content: "I'm sorry, I couldn't find the sharing suggestion right now. Please try logging again if you'd like to see it.",
                components: []
            });
            return;
        }

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ai_show_share_prompt_btn')
                .setLabel('📣 Yes, Show Me!')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('ai_no_share_prompt_btn')
                .setLabel('🤫 No, Thanks')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
        await interaction.editReply({ components: [disabledRow] });

        const publicPostMessage = `**Send some good vibes to the group?** ✨\n\nWould you like to share this message in the chat?\n\n> ${aiPublicPostSuggestion}\n\nOr, type your own message below.\n\nDo nothing, and this remains private.`;

        const postToGroupButton = new ButtonBuilder()
            .setCustomId('post_ai_log_summary_btn')
            .setLabel('🚀 Post to #main')
            .setStyle(ButtonStyle.Success);
        const newDmButtonRow = new ActionRowBuilder().addComponents(postToGroupButton);

        const ephemeralFollowUp = await interaction.followUp({
            content: publicPostMessage,
            components: [newDmButtonRow],
            ephemeral: true
        });
        console.log(`[ai_show_share_prompt_btn SENT_EPHEMERAL_FOLLOWUP ${interactionId}] Sent AI public post suggestion as ephemeral followup to ${userTagForLog}.`);

        const timeoutDuration = 60 * 1000;
        setTimeout(async () => {
            try {
                // Attempt to edit the ephemeral message to disable the button.
                // This might fail if the user has dismissed the message, which is acceptable.
                const fetchedMessage = await ephemeralFollowUp.fetch().catch(() => null);
                if (fetchedMessage && fetchedMessage.components.length > 0 && !fetchedMessage.components[0].components[0].disabled) {
                    const disabledPostRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('post_ai_log_summary_btn')
                            .setLabel('🚀 Post to #main')
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(true)
                    );
                    await fetchedMessage.edit({ components: [disabledPostRow] });
                    console.log(`[ai_show_share_prompt_btn DISABLED_POST_BUTTON ${interactionId}] Disabled 'Post to #main' button for ${userTagForLog} due to timeout.`);
                }
            } catch (timeoutError) {
                // It's common for this to fail if the ephemeral message is gone.
                // We only log errors that aren't the expected "Unknown Message" error.
                if (timeoutError.code !== 10008) { 
                    console.error(`[ai_show_share_prompt_btn ERROR_DISABLING_POST_BUTTON ${interactionId}] Error disabling 'Post to #main' button for ${userTagForLog}:`, timeoutError);
                }
            }
        }, timeoutDuration);
    } catch (error) {
        console.error(`[ai_show_share_prompt_btn ERROR ${interactionId}] Error processing button for ${userTagForLog}:`, error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "Sorry, I couldn't show the sharing suggestion. Please try again.", ephemeral: true });
            } else {
                await interaction.followUp({ content: "Sorry, I couldn't show the sharing suggestion. Please try again.", ephemeral: true });
            }
        } catch (fallbackError) {
            console.error(`[ai_show_share_prompt_btn FALLBACK_REPLY_ERROR ${interactionId}] Failed to send fallback error reply:`, fallbackError);
        }
    }
    console.log(`[ai_show_share_prompt_btn END ${interactionId}] Finished processing. Total time: ${(performance.now() - showSharePromptClickTime).toFixed(2)}ms`);
}

    else if (interaction.isButton() && interaction.customId === 'ai_no_share_prompt_btn') {
      const noSharePromptClickTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;
      console.log(`[ai_no_share_prompt_btn START ${interactionId}] Clicked by ${userTagForLog}. Declining AI public post suggestion.`);
      try {
        await interaction.deferUpdate();
        const deferTime = performance.now();
        console.log(`[ai_no_share_prompt_btn DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - noSharePromptClickTime).toFixed(2)}ms`);

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ai_show_share_prompt_btn')
                .setLabel('📣 Yes, Show Me!')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('ai_no_share_prompt_btn')
                .setLabel('🤫 No, Thanks')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
        await interaction.editReply({ components: [disabledRow] });

        await interaction.user.send("👍 Got it! Your log notes remain private. No one in the group will see them.");
        console.log(`[ai_no_share_prompt_btn CONFIRMED ${interactionId}] Confirmed decline to ${userTagForLog}.`);

        const setupData = userExperimentSetupData.get(userId);
        if (setupData) {
            delete setupData.aiLogPublicPostSuggestion;
            userExperimentSetupData.set(userId, setupData);
        }

      } catch (error) {
        console.error(`[ai_no_share_prompt_btn ERROR ${interactionId}] Error processing button for ${userTagForLog}:`, error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "Sorry, I couldn't process that. Please try again.", ephemeral: true });
            } else {
                await interaction.followUp({ content: "Sorry, I couldn't process that. Please try again.", ephemeral: true });
            }
        } catch (fallbackError) {
            console.error(`[ai_no_share_prompt_btn FALLBACK_REPLY_ERROR ${interactionId}] Failed to send fallback error reply:`, fallbackError);
        }
      }
      console.log(`[ai_no_share_prompt_btn END ${interactionId}] Finished processing. Total time: ${(performance.now() - noSharePromptClickTime).toFixed(2)}ms`);
    }

    else if (interaction.isButton() && interaction.customId === 'post_ai_log_summary_btn') {
      const postPublicClickTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;
      console.log(`[post_ai_log_summary_btn START ${interactionId}] Clicked by ${userTagForLog}. Attempting to post AI-suggested summary to group.`);
      try {
        await interaction.deferUpdate();
        const deferTime = performance.now();
        console.log(`[post_ai_log_summary_btn DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - postPublicClickTime).toFixed(2)}ms`);

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('post_ai_log_summary_btn')
                .setLabel('🚀 Post to group')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true)
        );
        await interaction.editReply({ components: [disabledRow] });

        const setupData = userExperimentSetupData.get(userId);
        const aiPublicPostSuggestion = setupData?.aiLogPublicPostSuggestion;

        if (!aiPublicPostSuggestion || typeof aiPublicPostSuggestion !== 'string' || aiPublicPostSuggestion.trim() === "") {
            console.warn(`[post_ai_log_summary_btn WARN ${interactionId}] AI public post suggestion missing or invalid for user ${userId}. Cannot post.`);
            await interaction.followUp({ content: "I'm sorry, I couldn't find the message to post. Please try logging again if you'd like to share.", ephemeral: true });
            return;
        }

        const EXPERIMENTS_CHANNEL_ID = '1363161131723526437';
        const targetGuildId = setupData?.guildId;

        if (!targetGuildId) {
            console.error(`[post_ai_log_summary_btn ERROR ${interactionId}] Guild ID not found in setupData for user ${userId}. Cannot post to public channel.`);
            await interaction.followUp({ content: "I couldn't identify which server to post to. Please try logging from the server you want to share in.", ephemeral: true });
            return;
        }

        const targetGuild = client.guilds.cache.get(targetGuildId);
        if (!targetGuild) {
            console.error(`[post_ai_log_summary_btn ERROR ${interactionId}] Target guild ${targetGuildId} not found in bot's cache for user ${userId}.`);
            await interaction.followUp({ content: "I couldn't find the server to post your message. Make sure I'm in the server you want to share in.", ephemeral: true });
            return;
        }

        const publicChannel = targetGuild.channels.cache.get(EXPERIMENTS_CHANNEL_ID);
        if (!publicChannel || !publicChannel.isTextBased()) {
            console.error(`[post_ai_log_summary_btn ERROR ${interactionId}] Public channel ${EXPERIMENTS_CHANNEL_ID} not found or is not a text channel in guild ${targetGuildId}.`);
            await interaction.followUp({ content: `I couldn't find the <#${EXPERIMENTS_CHANNEL_ID}> channel or it's not a text channel in this server. Please ensure it exists and I have permission to post there.`, ephemeral: true });
            return;
        }

        const messageToPost = `From <@${userId}>: ${aiPublicPostSuggestion}`;
        
        await publicChannel.send(messageToPost);
        console.log(`[post_ai_log_summary_btn PUBLIC_POST_SUCCESS ${interactionId}] Successfully posted AI-suggested message to <#${EXPERIMENTS_CHANNEL_ID}> for ${userTagForLog}.`);
        
        await interaction.followUp({ content: `✅ Your message has been posted`, ephemeral: true });
        
        if (setupData) {
            delete setupData.aiLogPublicPostSuggestion;
            userExperimentSetupData.set(userId, setupData);
        }

      } catch (error) {
        console.error(`[post_ai_log_summary_btn ERROR ${interactionId}] Error during public post for ${userTagForLog}:`, error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: "Sorry, I couldn't post your message to the group. Please check my permissions or try again.", ephemeral: true });
            } else {
                await interaction.followUp({ content: "Sorry, I couldn't post your message to the group. Please check my permissions or try again.", ephemeral: true });
            }
        } catch (fallbackError) {
            console.error(`[post_ai_log_summary_btn FALLBACK_REPLY_ERROR ${interactionId}] Failed to send fallback error reply:`, fallbackError);
        }
      }
      console.log(`[post_ai_log_summary_btn END ${interactionId}] Finished processing. Total time: ${(performance.now() - postPublicClickTime).toFixed(2)}ms`);
    }

    // In render/index.js, inside the `client.on(Events.InteractionCreate, ...)` handler

    // --- NEW: Handlers for Stats Report Navigation ---
    else if (interaction.isButton() && interaction.customId.startsWith('stats_nav_')) {
        const [,, action, experimentId, targetPageStr] = interaction.customId.split('_');
        const targetPage = parseInt(targetPageStr, 10);
        console.log(`[StatsNav] User ${interaction.user.tag} clicked '${action}' for experiment ${experimentId}. Target page: ${targetPage}.`);
        
        // The sendStatsPage function now handles deferring/updating the interaction
        await sendStatsPage(interaction, interaction.user.id, experimentId, targetPage);
    }

    else if (interaction.isButton() && interaction.customId.startsWith('stats_finish_')) {
        const experimentId = interaction.customId.split('stats_finish_')[1];
        const userId = interaction.user.id;
        console.log(`[StatsFinish] User ${userId} clicked 'Finish' for experiment ${experimentId}.`);

        await interaction.deferUpdate();

        const reportInfo = userStatsReportData.get(userId);
        if (!reportInfo || !reportInfo.statsReportData) {
            await interaction.editReply({ content: "Your stats report session has expired. Please request it again.", embeds: [], components: [] });
            return;
        }

        const { statsReportData } = reportInfo;

        // Rebuild the FULL embed, reusing logic from the original listener
        const fullEmbed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`Experiment Stats Summary`)
            .setDescription(`**Scroll to the bottom to get your AI Insights!**\n\nTotal Logs Processed: ${statsReportData.totalLogsInPeriodProcessed || 'N/A'}`)
            .setTimestamp()
            .setFooter({ text: `Experiment ID: ${statsReportData.experimentId || 'N/A'}` });
        
        // Call all page builders to add all sections to the single embed
        buildCoreStatsPage(fullEmbed, statsReportData);
        fullEmbed.addFields({ name: '\u200B', value: '\u200B' }); // Spacer
        buildCorrelationsPage(fullEmbed, statsReportData);
        fullEmbed.addFields({ name: '\u200B', value: '\u200B' }); // Spacer
        buildCombinedEffectsPage(fullEmbed, statsReportData);

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`get_ai_insights_btn_${statsReportData.experimentId}`)
                    .setLabel('💡 Get AI Insights')
                    .setStyle(ButtonStyle.Success)
            );
        
        await interaction.editReply({
            content: "Here is your complete experiment report:",
            embeds: [fullEmbed],
            components: [actionRow]
        });

        // Clean up the stored data after finishing
        userStatsReportData.delete(userId);
        console.log(`[StatsFinish] Sent full report and cleaned up session data for user ${userId}.`);
    }


  } // End of "if (interaction.isButton())" block

  else if (interaction.isStringSelectMenu()) {

    if (interaction.customId.startsWith('log_time_select_')) {
            const selectSubmitTime = performance.now();
            const interactionId = interaction.id; // For logging
            const userId = interaction.user.id;
            const menuId = interaction.customId;
            const selectedValue = interaction.values[0];

            console.log(`[TimeLogSelect START ${interactionId}] User: ${userId} selected "${selectedValue}" for menu: ${menuId}.`);
            try {
                // We only need to acknowledge this interaction. The UI doesn't need to change yet.
                await interaction.deferUpdate();

                const setupData = userExperimentSetupData.get(userId);
                if (!setupData) {
                    console.error(`[TimeLogSelect CRITICAL ${interactionId}] Missing setup data for ${userId} on select menu interaction.`);
                    // Cannot reply here as we just deferred. User will get an error on next button click.
                    return;
                }

                // Store the selected value based on the custom ID of the select menu
                switch (menuId) {
                    case LOG_TIME_SELECT_H_ID:
                        setupData.logTimeH = selectedValue;
                        break;
                    case LOG_TIME_SELECT_M_ID:
                        setupData.logTimeM = selectedValue;
                        break;
                    case LOG_TIME_SELECT_AP_ID:
                        setupData.logTimeAP = selectedValue;
                        break;
                    default:
                        console.warn(`[TimeLogSelect WARN ${interactionId}] Unrecognized log_time_select_ menu ID: ${menuId}`);
                        break;
                }

                userExperimentSetupData.set(userId, setupData);
                console.log(`[TimeLogSelect END ${interactionId}] Stored time selection for ${userId}. Total time: ${(performance.now() - selectSubmitTime).toFixed(2)}ms`);

            } catch (error) {
                console.error(`[TimeLogSelect ERROR ${interactionId}] Error processing selection for ${menuId} for user ${userId}:`, error);
            }
        }

    else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('exp_setup_')) {
      const selectSubmitTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const menuId = interaction.customId;
      const selectedValue = interaction.values[0];

      console.log(`[ExpSetupTimeSelect START ${interactionId}] User: ${userId} selected "${selectedValue}" for menu: ${menuId}.`);
      try {
          await interaction.deferUpdate(); // Just acknowledge, no UI change needed yet

          const setupData = userExperimentSetupData.get(userId);
          if (!setupData) {
              console.error(`[ExpSetupTimeSelect CRITICAL ${interactionId}] Missing setup data for ${userId} on select menu interaction.`);
              return;
          }

          // Store the selected value in a generic temporary property.
          // The confirm button handler will know whether to apply this to an outcome or an input.
          switch (menuId) {
              case EXP_SETUP_OUTCOME_H_ID:
              case EXP_SETUP_INPUT_H_ID:
                  setupData.targetTimeH = selectedValue;
                  break;
              case EXP_SETUP_OUTCOME_M_ID:
              case EXP_SETUP_INPUT_M_ID:
                  setupData.targetTimeM = selectedValue;
                  break;
              case EXP_SETUP_OUTCOME_AP_ID:
              case EXP_SETUP_INPUT_AP_ID:
                  setupData.targetTimeAP = selectedValue;
                  break;
              default:
                  console.warn(`[ExpSetupTimeSelect WARN ${interactionId}] Unrecognized exp_setup_ menu ID: ${menuId}`);
                  break;
          }

          userExperimentSetupData.set(userId, setupData);
          console.log(`[ExpSetupTimeSelect END ${interactionId}] Stored time selection for ${userId}. Total time: ${(performance.now() - selectSubmitTime).toFixed(2)}ms`);
      } catch (error) {
          console.error(`[ExpSetupTimeSelect ERROR ${interactionId}] Error processing selection for ${menuId} for user ${userId}:`, error);
      }
    }

    else if (interaction.customId === 'ai_outcome_select') {
        const selectMenuSubmitTime = performance.now();
        const interactionId = interaction.id;
        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        console.log(`[${interaction.customId} START ${interactionId}] Received selection from ${userTag}.`);

        try {
            const setupData = userExperimentSetupData.get(userId);
            if (!setupData || setupData.dmFlowState !== 'awaiting_outcome_suggestion_selection') {
                // This select menu should only be actionable in the correct state.
                // We reply directly because showModal must be the first response.
                await interaction.reply({ content: "This selection has expired or your session is out of sync. Please restart using `/go`.", ephemeral: true });
                console.warn(`[${interaction.customId} WARN ${interactionId}] User ${userTag} in wrong state: ${setupData?.dmFlowState}`);
                return;
            }

            const selectedValue = interaction.values[0];

            // PATH 1: User wants to write their own metric from scratch
            if (selectedValue === 'write_my_own_outcome') {
                console.log(`[${interaction.customId} CUSTOM_PATH ${interactionId}] User ${userTag} selected 'Write my own'.`);
                
                // Reuse the manual setup modal. The existing handler for 'manual_setup_outcome_modal' will take over upon submission.
                const manualOutcomeModal = new ModalBuilder()
                    .setCustomId('manual_setup_outcome_modal')
                    .setTitle('🧪 Custom Outcome Metric');
                
                // Pre-fill the deeper wish, but leave the rest empty for the user to define.
                const deeperProblemInput = new TextInputBuilder().setCustomId('deeper_problem_manual').setLabel("🧭 Deeper Wish / Problem To Solve").setStyle(TextInputStyle.Paragraph).setValue(setupData.deeperWish || "").setRequired(true);
                const outcomeLabelInput = new TextInputBuilder().setCustomId('outcome_label_manual').setLabel("📊 Measurable Outcome (The Label)").setPlaceholder("e.g., 'Sleep Quality' or 'Energy Level'").setStyle(TextInputStyle.Short).setRequired(true);
                const outcomeUnitInput = new TextInputBuilder().setCustomId('outcome_unit_manual').setLabel("📏 Unit / Scale").setPlaceholder("e.g., 'hours', 'out of 10', 'tasks done'").setStyle(TextInputStyle.Short).setRequired(true);
                const outcomeGoalInput = new TextInputBuilder().setCustomId('outcome_goal_manual').setLabel("🎯 Daily Target Number").setPlaceholder("e.g., '7.5', '8', '3'").setStyle(TextInputStyle.Short).setRequired(true);
                
                manualOutcomeModal.addComponents(
                    new ActionRowBuilder().addComponents(deeperProblemInput),
                    new ActionRowBuilder().addComponents(outcomeLabelInput),
                    new ActionRowBuilder().addComponents(outcomeGoalInput),
                    new ActionRowBuilder().addComponents(outcomeUnitInput)
                );
                
                await interaction.showModal(manualOutcomeModal);
                console.log(`[${interaction.customId} MODAL_SHOWN ${interactionId}] Showed manual_setup_outcome_modal for custom entry.`);
                return; 
            }

            // PATH 2: User selected an AI suggestion
            if (selectedValue.startsWith('ai_outcome_suggestion_')) {
                const suggestionIndex = parseInt(selectedValue.split('_').pop(), 10);
                const chosenSuggestion = setupData.aiGeneratedOutcomeSuggestions?.[suggestionIndex];

                if (!chosenSuggestion) {
                    console.error(`[${interaction.customId} ERROR ${interactionId}] Invalid AI suggestion index or suggestions not found for ${userTag}.`);
                    await interaction.reply({ content: "Sorry, I couldn't process that selection. Please try choosing again or restarting the setup.", ephemeral: true });
                    return;
                }

                console.log(`[${interaction.customId} AI_PATH ${interactionId}] User ${userTag} selected suggestion:`, chosenSuggestion);

                // Store the selection in the user's state so the modal handler knows which suggestion was chosen.
                setupData.tempSelectedOutcome = chosenSuggestion;
                userExperimentSetupData.set(userId, setupData);

                // Create and show a NEW modal, pre-populated with the AI's suggestion.
                const confirmOutcomeModal = new ModalBuilder()
                    .setCustomId('confirm_ai_outcome_modal') // This will require a NEW modal submission handler
                    .setTitle('Confirm Your Outcome');

                const deeperProblemInput = new TextInputBuilder().setCustomId('deeper_problem_manual').setLabel("🧭 Deeper Wish (Context)").setStyle(TextInputStyle.Paragraph).setValue(setupData.deeperWish || "").setRequired(true);
                const outcomeLabelInput = new TextInputBuilder().setCustomId('outcome_label_manual').setLabel("📊 Outcome Label").setStyle(TextInputStyle.Short).setValue(chosenSuggestion.label).setRequired(true);
                const outcomeGoalInput = new TextInputBuilder().setCustomId('outcome_goal_manual').setLabel("🎯 Daily Target").setStyle(TextInputStyle.Short).setValue(String(chosenSuggestion.goal)).setRequired(true);
                const outcomeUnitInput = new TextInputBuilder().setCustomId('outcome_unit_manual').setLabel("📏 Unit / Scale").setStyle(TextInputStyle.Short).setValue(chosenSuggestion.unit).setRequired(true);
                
                confirmOutcomeModal.addComponents(
                    new ActionRowBuilder().addComponents(deeperProblemInput),
                    new ActionRowBuilder().addComponents(outcomeLabelInput),
                    new ActionRowBuilder().addComponents(outcomeGoalInput),
                    new ActionRowBuilder().addComponents(outcomeUnitInput)
                );
                
                await interaction.showModal(confirmOutcomeModal);
                console.log(`[${interaction.customId} MODAL_SHOWN ${interactionId}] Showed confirm_ai_outcome_modal with pre-filled suggestion.`);
            }

        } catch (error) {
            console.error(`[${interaction.customId} ERROR ${interactionId}] Error processing select menu for ${userTag}:`, error);
        }
    }
    
    else if (interaction.customId === 'ai_input1_select') {
        const selectMenuSubmitTime = performance.now();
        const interactionId = interaction.id;
        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        console.log(`[${interaction.customId} START ${interactionId}] Received selection from ${userTag}.`);

        try {
            const setupData = userExperimentSetupData.get(userId);
            if (!setupData || setupData.dmFlowState !== 'awaiting_input1_suggestion_selection') {
                await interaction.reply({ content: "This selection has expired or your session is out of sync. Please restart using `/go`.", ephemeral: true });
                console.warn(`[${interaction.customId} WARN ${interactionId}] User ${userTag} in wrong state: ${setupData?.dmFlowState}`);
                return;
            }

            const selectedValue = interaction.values[0];

            // PATH 1: User wants to write their own habit from scratch
            if (selectedValue === 'write_my_own_input1') {
                console.log(`[${interaction.customId} CUSTOM_PATH ${interactionId}] User selected 'Write my own'.`);
                
                // Reuse the manual setup modal for Habit 1. The existing handler will take over.
                const manualHabit1Modal = new ModalBuilder()
                    .setCustomId('manual_setup_habit1_modal')
                    .setTitle('🧪 Custom Daily Habit 1');
                
                const habit1LabelInput = new TextInputBuilder().setCustomId('habit1_label_manual').setLabel("🛠️ Daily Habit 1 (The Label)").setPlaceholder("e.g., '15-Min Afternoon Walk'").setStyle(TextInputStyle.Short).setRequired(true);
                const habit1UnitInput = new TextInputBuilder().setCustomId('habit1_unit_manual').setLabel("📏 Unit / Scale").setPlaceholder("e.g., 'minutes', 'steps', 'yes/no'").setStyle(TextInputStyle.Short).setRequired(true);
                const habit1GoalInput = new TextInputBuilder().setCustomId('habit1_goal_manual').setLabel("🎯 Daily Target Number").setPlaceholder("e.g., '15', '2000', '1'").setStyle(TextInputStyle.Short).setRequired(true);
                
                manualHabit1Modal.addComponents(
                    new ActionRowBuilder().addComponents(habit1LabelInput),
                    new ActionRowBuilder().addComponents(habit1GoalInput),
                    new ActionRowBuilder().addComponents(habit1UnitInput)
                );
                
                await interaction.showModal(manualHabit1Modal);
                console.log(`[${interaction.customId} MODAL_SHOWN ${interactionId}] Showed manual_setup_habit1_modal for custom entry.`);
                return;
            }

            // PATH 2: User selected an AI suggestion for Habit 1
            if (selectedValue.startsWith('ai_input1_suggestion_')) {
                const suggestionIndex = parseInt(selectedValue.split('_').pop(), 10);
                const chosenSuggestion = setupData.aiGeneratedInputSuggestions?.[suggestionIndex];

                if (!chosenSuggestion) {
                    console.error(`[${interaction.customId} ERROR ${interactionId}] Invalid AI suggestion index or suggestions not found.`);
                    await interaction.reply({ content: "Sorry, I couldn't process that selection. Please try choosing again.", ephemeral: true });
                    return;
                }

                console.log(`[${interaction.customId} AI_PATH ${interactionId}] User selected suggestion for Habit 1:`, chosenSuggestion);
                
                // Store the selection in the user's state so the modal handler knows which suggestion was chosen.
                setupData.tempSelectedInput = chosenSuggestion;
                userExperimentSetupData.set(userId, setupData);

                // Create and show a NEW modal, pre-populated with the AI's suggestion.
                const confirmHabitModal = new ModalBuilder()
                    .setCustomId('confirm_ai_habit_modal_1') // ID specifies this is for Habit 1
                    .setTitle('Confirm Your 1st Habit');

                const habitLabelInput = new TextInputBuilder().setCustomId('habit_label_manual').setLabel("🛠️ Daily Habit Label").setStyle(TextInputStyle.Short).setValue(chosenSuggestion.label).setRequired(true);
                const habitGoalInput = new TextInputBuilder().setCustomId('habit_goal_manual').setLabel("🎯 Daily Target").setStyle(TextInputStyle.Short).setValue(String(chosenSuggestion.goal)).setRequired(true);
                const habitUnitInput = new TextInputBuilder().setCustomId('habit_unit_manual').setLabel("📏 Unit / Scale").setStyle(TextInputStyle.Short).setValue(chosenSuggestion.unit).setRequired(true);
                
                confirmHabitModal.addComponents(
                    new ActionRowBuilder().addComponents(habitLabelInput),
                    new ActionRowBuilder().addComponents(habitGoalInput),
                    new ActionRowBuilder().addComponents(habitUnitInput)
                );
                
                await interaction.showModal(confirmHabitModal);
                console.log(`[${interaction.customId} MODAL_SHOWN ${interactionId}] Showed confirm_ai_habit_modal_1 with pre-filled suggestion.`);
            }

        } catch (error) {
            console.error(`[${interaction.customId} ERROR ${interactionId}] Error processing select menu for ${userTag}:`, error);
        }
    }

    

    else if (interaction.isStringSelectMenu() && interaction.customId === 'ai_input2_label_select') {
      const input2LabelSelectSubmitTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;
      console.log(`[ai_input2_label_select START ${interactionId}] Received Input 2 HABIT LABEL selection from ${userTagForLog}.`);
      try {
        await interaction.deferUpdate();
        const deferTime = performance.now();
        console.log(`[ai_input2_label_select DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - input2LabelSelectSubmitTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || setupData.dmFlowState !== 'awaiting_input2_label_dropdown_selection' || setupData.currentInputIndex !== 2) {
          console.warn(`[ai_input2_label_select WARN ${interactionId}] User ${userTagForLog} in unexpected state: ${setupData?.dmFlowState || 'no setupData'}, Index: ${setupData?.currentInputIndex}.`);
          await interaction.followUp({ content: "It seems there was a mix-up with selecting your second habit. Please try restarting the experiment setup with `/go`.", ephemeral: true });
          return;
        }

        const selectedValue = interaction.values[0];
        if (selectedValue === 'custom_input2_label') {
          console.log(`[ai_input2_label_select CUSTOM_PATH ${interactionId}] User ${userTagForLog} selected 'custom habit label' for Input 2.`);
          setupData.dmFlowState = 'awaiting_input2_label_text';
          userExperimentSetupData.set(userId, setupData);

          const customLabelEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle("✏️ Custom Daily Habit 2")
            .setDescription("Please type your 2nd habit below.\n\n**Examples:**\n● \"Evening Review\"\n● \"Limit Screen Time\"\n\n(max 30 characters)");
          await interaction.editReply({
              embeds: [customLabelEmbed],
              components: []
          });
          console.log(`[ai_input2_label_select CUSTOM_LABEL_PROMPT_SENT ${interactionId}] Prompted for custom Input 2 label text.`);
          return;

        } else if (selectedValue.startsWith('ai_input2_label_suggestion_')) {
          const suggestionIndex = parseInt(selectedValue.split('_').pop(), 10);
          const chosenSuggestion = setupData.aiGeneratedInputSuggestions?.[suggestionIndex];

          if (!chosenSuggestion) {
            console.error(`[ai_input2_label_select ERROR ${interactionId}] Invalid AI suggestion index or suggestions not found for user ${userTagForLog}.`);
            await interaction.followUp({ content: "Sorry, I couldn't process that habit selection. Please try choosing again or restarting.", ephemeral: true });
            return;
          }

          console.log(`[ai_input2_label_select] User selected full habit 2:`, chosenSuggestion);
          if (!setupData.inputs) setupData.inputs = [];
          setupData.inputs[1] = { label: chosenSuggestion.label, unit: chosenSuggestion.unit, goal: chosenSuggestion.goal };
          
          // NOTE: The line `delete setupData.aiGeneratedInputSuggestions;` has been REMOVED.
          delete setupData.currentInputDefinition;
          setupData.dmFlowState = 'awaiting_add_another_habit_choice';
          userExperimentSetupData.set(userId, setupData);

          const confirmationEmbed = new EmbedBuilder()
            .setColor('#57F287')
            .setTitle('✅ Habit 2 Confirmed!')
            .setDescription(`**${chosenSuggestion.goal} ${chosenSuggestion.unit}, ${chosenSuggestion.label}**`)
            .addFields({ name: '\u200B', value: "Would you like to add a 3rd (and final) habit to test?" });

          const addHabitButtons = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder().setCustomId('add_another_habit_yes_btn').setLabel('➕ Yes, Add Habit 3').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId('add_another_habit_no_btn').setLabel('⏭️ No More Habits').setStyle(ButtonStyle.Primary)
            );
          
          await interaction.editReply({
            embeds: [confirmationEmbed],
            components: [addHabitButtons]
          });
          console.log(`[ai_input2_label_select] Confirmed full habit 2 and prompted for next step.`);
        }
      } catch (error) {
        const errorTime = performance.now();
        console.error(`[ai_input2_label_select ERROR ${interactionId}] Error processing select menu for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error);
        if (interaction.deferred || interaction.replied) {
            try { await interaction.editReply({ content: "Sorry, something went wrong processing your second habit choice. You might need to try selecting again or restart the setup.", components: [] }); }
            catch (e) { console.error(`[ai_input2_label_select ERROR_EDITREPLY_FAIL ${interactionId}]`, e); }
        }
      }
      const processEndTime = performance.now();
      console.log(`[ai_input2_label_select END ${interactionId}] Finished processing. Total time: ${(processEndTime - input2LabelSelectSubmitTime).toFixed(2)}ms`);
    }

    else if (interaction.isStringSelectMenu() && interaction.customId === 'ai_input3_label_select') {
      const input3LabelSelectSubmitTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;
      console.log(`[ai_input3_label_select START ${interactionId}] Received Input 3 HABIT LABEL selection from ${userTagForLog}.`);
      try {
        await interaction.deferUpdate();
        const deferTime = performance.now();
        console.log(`[ai_input3_label_select DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - input3LabelSelectSubmitTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || setupData.dmFlowState !== 'awaiting_input3_label_dropdown_selection' || setupData.currentInputIndex !== 3) {
          console.warn(`[ai_input3_label_select WARN ${interactionId}] User ${userTagForLog} in unexpected state: ${setupData?.dmFlowState || 'no setupData'}, Index: ${setupData?.currentInputIndex}.`);
          await interaction.followUp({ content: "It seems there was a mix-up with selecting your third habit's label. Please try restarting the experiment setup with `/go`.", ephemeral: true });
          return;
        }

        const selectedValue = interaction.values[0];
        if (selectedValue === 'custom_input3_label') {
          console.log(`[ai_input3_label_select CUSTOM_PATH ${interactionId}] User ${userTagForLog} selected 'custom habit label' for Input 3.`);
          setupData.dmFlowState = 'awaiting_input3_label_text';
          userExperimentSetupData.set(userId, setupData);

          const customLabelEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle("✏️ Custom Daily Habit 3")
            .setDescription("Please type your 3rd and final habit below.\n\n(max 30 characters)");
          await interaction.editReply({
              embeds: [customLabelEmbed],
              components: []
          });
          console.log(`[ai_input3_label_select CUSTOM_LABEL_PROMPT_SENT ${interactionId}] Prompted for custom Input 3 label text.`);
          return;

        } else if (selectedValue.startsWith('ai_input3_label_suggestion_')) {
          const suggestionIndex = parseInt(selectedValue.split('_').pop(), 10);
          const chosenSuggestion = setupData.aiGeneratedInputSuggestions?.[suggestionIndex];

          if (!chosenSuggestion) {
            console.error(`[ai_input3_label_select ERROR ${interactionId}] Invalid AI suggestion index or suggestions not found for user ${userTagForLog}.`);
            await interaction.followUp({ content: "Sorry, I couldn't process that habit selection. Please try choosing again or restarting.", ephemeral: true });
            return;
          }

          console.log(`[ai_input3_label_select] User selected full habit 3:`, chosenSuggestion);
          if (!setupData.inputs) setupData.inputs = [];
          setupData.inputs[2] = { label: chosenSuggestion.label, unit: chosenSuggestion.unit, goal: chosenSuggestion.goal };
          
          // NOTE: The line `delete setupData.aiGeneratedInputSuggestions;` has been REMOVED.
          delete setupData.currentInputDefinition;
          setupData.dmFlowState = 'awaiting_metrics_confirmation';
          userExperimentSetupData.set(userId, setupData);
          console.log(`[ai_input3_label_select HABIT3_CONFIRMED ${interactionId}] User ${userTagForLog} confirmed Habit 3. State is now '${setupData.dmFlowState}'.`);
          
          const formatGoalForDisplay = (goal, unit) => {
              const isTime = TIME_OF_DAY_KEYWORDS.includes(unit.toLowerCase().trim());
              return isTime ? formatDecimalAsTime(goal) : goal;
          };

          let summaryDescription = `**🌠 Deeper Wish:**\n${setupData.deeperProblem}\n\n` +
                                  `**📊 Daily Outcome to Track:**\n\`${formatGoalForDisplay(setupData.outcomeGoal, setupData.outcomeUnit)}, ${setupData.outcomeUnit}, ${setupData.outcomeLabel}\`\n\n` +
                                  `**🛠️ Daily Habits to Test:**\n`;
          setupData.inputs.forEach((input, index) => {
              if (input && input.label) {
                  summaryDescription += `${index + 1}. \`${formatGoalForDisplay(input.goal, input.unit)}, ${input.unit}, ${input.label}\`\n`;
              }
          });
          const confirmEmbed = new EmbedBuilder()
              .setColor('#FFBF00')
              .setTitle('🔬 Review Your Experiment Metrics')
              .setDescription(summaryDescription + "\n\nDo these look correct? You can edit them now if needed.")
              .setFooter({ text: "Your settings are not saved until you select a duration."});
          const confirmButtons = new ActionRowBuilder()
              .addComponents(
                  new ButtonBuilder().setCustomId('confirm_metrics_proceed_btn').setLabel('✅ Looks Good').setStyle(ButtonStyle.Success),
                  new ButtonBuilder().setCustomId('request_edit_metrics_modal_btn').setLabel('✏️ Edit Metrics').setStyle(ButtonStyle.Primary)
              );

          await interaction.editReply({
              content: "Amazing, all 3 daily habits are defined! Here's the full summary of your experiment's metrics:",
              embeds: [confirmEmbed],
              components: [confirmButtons]
          });
          console.log(`[ai_input3_label_select CONFIRM_EDIT_PROMPT_SENT ${interactionId}] Edited message to show confirm/edit prompt.`);
        }
      } catch (error) {
        const errorTime = performance.now();
        console.error(`[ai_input3_label_select ERROR ${interactionId}] Error processing select menu for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error);
        if (interaction.deferred || interaction.replied) {
            try { await interaction.editReply({ content: "Sorry, something went wrong processing your third habit choice. You might need to try selecting again or restart the setup.", components: [] }); }
            catch (e) { console.error(`[ai_input3_label_select ERROR_EDITREPLY_FAIL ${interactionId}]`, e); }
        }
      }
      const processEndTime = performance.now();
      console.log(`[ai_input3_label_select END ${interactionId}] Finished processing. Total time: ${(processEndTime - input3LabelSelectSubmitTime).toFixed(2)}ms`);
    }
    
    else if (interaction.customId === OUTCOME_UNIT_SELECT_ID) {
      const outcomeUnitSelectSubmitTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;

      console.log(`[${OUTCOME_UNIT_SELECT_ID} START ${interactionId}] Received selection from ${userTagForLog}.`);
      try {
        await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
        const deferTime = performance.now();
        console.log(`[${OUTCOME_UNIT_SELECT_ID} DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - outcomeUnitSelectSubmitTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || setupData.dmFlowState !== 'awaiting_outcome_unit_dropdown_selection') {
          console.warn(`[${OUTCOME_UNIT_SELECT_ID} WARN ${interactionId}] User ${userTagForLog} in unexpected state: ${setupData?.dmFlowState || 'no setupData'}. Custom ID: ${interaction.customId}`);
          await interaction.followUp({ content: "It seems there was a mix-up with our current step for selecting the outcome unit. Please try restarting the AI setup again with the `/go` command.", ephemeral: true });
          return;
        }

        const selectedValue = interaction.values[0];
        if (selectedValue === CUSTOM_UNIT_OPTION_VALUE) {
          console.log(`[${OUTCOME_UNIT_SELECT_ID} CUSTOM_PATH ${interactionId}] User ${userTagForLog} selected 'Enter my own custom unit' for Outcome.`);
          setupData.dmFlowState = 'awaiting_custom_outcome_unit_text';
          userExperimentSetupData.set(userId, setupData);

          const customUnitEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle("✏️ Custom Unit/Scale")
            .setDescription(`Okay, you want to enter a custom unit for your Outcome Metric: **"${setupData.outcomeLabel}"**.\n\nPlease type your custom Unit/Scale below (e.g., "0-10 rating", "USD", "Tasks").\n\n(Max 15 characters)`);

          const backButton = new ButtonBuilder()
            .setCustomId('back_to:awaiting_outcome_unit_dropdown_selection')
            .setLabel('⬅️ Back to Unit Selection')
            .setStyle(ButtonStyle.Secondary);

          const rowWithBack = new ActionRowBuilder().addComponents(backButton);

          try {
            await interaction.editReply({ embeds: [customUnitEmbed], components: [rowWithBack] });
          } catch (editError) {
            console.warn(`[${OUTCOME_UNIT_SELECT_ID} EDIT_REPLY_FAIL_CUSTOM ${interactionId}] Failed to edit message for custom unit path. Sending new DM. Error: ${editError.message}`);
            await interaction.user.send({ embeds: [customUnitEmbed], components: [rowWithBack] });
          }
          console.log(`[${OUTCOME_UNIT_SELECT_ID} CUSTOM_UNIT_PROMPT_SENT ${interactionId}] Prompted ${userTagForLog} for custom outcome unit text. State: ${setupData.dmFlowState}.`);
          return;
        }
        
        else {
          // A predefined unit was selected
          setupData.outcomeUnit = selectedValue;
          const isTimeMetric = TIME_OF_DAY_KEYWORDS.includes(selectedValue.toLowerCase().trim());
          const nextState = isTimeMetric ? 'awaiting_outcome_target_time' : 'awaiting_outcome_target_number';
          
          setupData.dmFlowState = nextState;
          userExperimentSetupData.set(userId, setupData);
          console.log(`[${OUTCOME_UNIT_SELECT_ID} PREDEFINED_UNIT_SELECTED ${interactionId}] User ${userTagForLog} selected unit "${selectedValue}". Transitioning to state '${nextState}'.`);
          // Get the next prompt from our central config
          const step = dmFlowConfig[nextState];
          const { content, embeds, components } = step.prompt(setupData);

          // Update the message with the new prompt, which now includes the back button
          await interaction.editReply({
              content,
              embeds: embeds || [],
              components: components || []
          });
          console.log(`[${OUTCOME_UNIT_SELECT_ID} PROMPT_SENT ${interactionId}] Sent prompt for '${nextState}' to ${userTagForLog}.`);
        }
      } catch (error) {
        const errorTime = performance.now();
        console.error(`[${OUTCOME_UNIT_SELECT_ID} ERROR ${interactionId}] Error processing select menu for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error);
        if (interaction.deferred && !interaction.replied) {
            try { await interaction.editReply({ content: "Sorry, something went wrong processing your outcome unit choice. You might need to try selecting again.", components: [] }); }
            catch (e) { console.error(`[${OUTCOME_UNIT_SELECT_ID} ERROR_EDITREPLY_FAIL ${interactionId}]`, e); }
        } else {
            try { await interaction.followUp({ content: "Sorry, an error occurred after your outcome unit selection. Please try again if needed.", ephemeral: true }); }
            catch (e) { console.error(`[${OUTCOME_UNIT_SELECT_ID} ERROR_FOLLOWUP_FAIL ${interactionId}]`, e); }
        }
      }
      const processEndTime = performance.now();
      console.log(`[${OUTCOME_UNIT_SELECT_ID} END ${interactionId}] Finished processing. Total time: ${(processEndTime - outcomeUnitSelectSubmitTime).toFixed(2)}ms`);
    }

    else if (interaction.customId.startsWith(INPUT_UNIT_SELECT_ID_PREFIX)) {
      const habitUnitSelectSubmitTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;
      
      const inputIndexStr = interaction.customId.substring(INPUT_UNIT_SELECT_ID_PREFIX.length);
      const inputIndex = parseInt(inputIndexStr, 10);
      console.log(`[${interaction.customId} START ${interactionId}] Received Input ${inputIndex} Unit selection from ${userTagForLog}.`);
      try {
        await interaction.deferUpdate();
        const deferTime = performance.now();
        console.log(`[${interaction.customId} DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - habitUnitSelectSubmitTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || setupData.dmFlowState !== `awaiting_input${inputIndex}_unit_dropdown_selection` || setupData.currentInputIndex !== inputIndex) {
          console.warn(`[${interaction.customId} WARN ${interactionId}] User ${userTagForLog} in unexpected state or mismatched input index. State: ${setupData?.dmFlowState}, Index: ${inputIndex}.`);
          await interaction.followUp({ content: "It seems there was a mix-up with selecting the unit for this habit. Please try restarting the AI setup with `/go`.", ephemeral: true });
          return;
        }
        
        if (!setupData.currentInputDefinition?.label) {
             console.error(`[${interaction.customId} CRITICAL ${interactionId}] Missing habit label for Input ${inputIndex}.`);
             await interaction.followUp({ content: "Error: I've lost track of the habit's label. Please try restarting the setup via `/go`.", ephemeral: true });
             return;
        }

        const selectedValue = interaction.values[0];
        const currentHabitLabel = setupData.currentInputDefinition.label;
        if (selectedValue === CUSTOM_UNIT_OPTION_VALUE) {
          console.log(`[${interaction.customId} CUSTOM_PATH ${interactionId}] User selected 'custom unit' for Input ${inputIndex}.`);
          setupData.dmFlowState = `awaiting_input${inputIndex}_custom_unit_text`;
          userExperimentSetupData.set(userId, setupData);
          
          const customUnitEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`✏️ Custom Unit for Habit ${inputIndex}`)
            .setDescription(`Okay, you want to enter a custom unit for: **"${currentHabitLabel}"**.\n\nPlease type your custom Unit/Scale below (e.g., "minutes", "reps", "0-5 scale").\n\n(Max 15 characters)`);

          await interaction.editReply({ embeds: [customUnitEmbed], components: [] });
          console.log(`[${interaction.customId} CUSTOM_UNIT_PROMPT_SENT ${interactionId}] Prompted for custom Input ${inputIndex} unit text.`);
          return;
        } else {
          // A predefined unit was selected
          setupData.currentInputDefinition.unit = selectedValue;
          // For now, we only have the back button fully configured for the first habit (inputIndex === 1)
          if (inputIndex === 1) {
              const isTimeMetric = TIME_OF_DAY_KEYWORDS.includes(selectedValue.toLowerCase().trim());
              const nextState = isTimeMetric ? 'awaiting_input1_target_time' : 'awaiting_input1_target_number';
              
              setupData.dmFlowState = nextState;
              userExperimentSetupData.set(userId, setupData);
              console.log(`[${interaction.customId} PREDEFINED_UNIT_SELECTED ${interactionId}] User selected unit "${selectedValue}". Transitioning to state '${nextState}'.`);

              const step = dmFlowConfig[nextState];
              const { content, embeds, components } = step.prompt(setupData);
              await interaction.editReply({ content, embeds: embeds || [], components: components || [] });
              console.log(`[${interaction.customId} PROMPT_SENT ${interactionId}] Sent prompt for '${nextState}'.`);

          } else {
              // Fallback to old logic for input 2 and 3 until we enhance the config for them
              const isTimeMetric = TIME_OF_DAY_KEYWORDS.includes(selectedValue.toLowerCase().trim());
              if (isTimeMetric) {
                  // This part for input 2/3 remains unchanged for now
                  setupData.dmFlowState = `awaiting_input${inputIndex}_target_time`;
                  userExperimentSetupData.set(userId, setupData);
                  const timeEmbed = new EmbedBuilder().setColor('#3498DB').setTitle(`🕰️ Set Target Time for: ${currentHabitLabel}`).setDescription(`Please select your daily target time for this habit.`);
                  const timeHourSelect = new StringSelectMenuBuilder().setCustomId(EXP_SETUP_INPUT_H_ID).setPlaceholder('Select the Target HOUR').addOptions(Array.from({ length: 12 }, (_, i) => new StringSelectMenuOptionBuilder().setLabel(String(i + 1)).setValue(String(i + 1))));
                  const timeMinuteSelect = new StringSelectMenuBuilder().setCustomId(EXP_SETUP_INPUT_M_ID).setPlaceholder('Select the Target MINUTE').addOptions(new StringSelectMenuOptionBuilder().setLabel(':00').setValue('00'), new StringSelectMenuOptionBuilder().setLabel(':15').setValue('15'), new StringSelectMenuOptionBuilder().setLabel(':30').setValue('30'), new StringSelectMenuOptionBuilder().setLabel(':45').setValue('45'));
                  const timeAmPmSelect = new StringSelectMenuBuilder().setCustomId(EXP_SETUP_INPUT_AP_ID).setPlaceholder('Select AM or PM').addOptions(new StringSelectMenuOptionBuilder().setLabel('AM').setValue('AM'), new StringSelectMenuOptionBuilder().setLabel('PM').setValue('PM'));
                  const confirmButton = new ButtonBuilder().setCustomId(CONFIRM_INPUT_TARGET_TIME_BTN_ID).setLabel('Confirm Target Time').setStyle(ButtonStyle.Success);
                  await interaction.editReply({ content: `**${currentHabitLabel}** **${selectedValue}**. Please set the target time below.`, embeds: [timeEmbed], components: [new ActionRowBuilder().addComponents(timeHourSelect), new ActionRowBuilder().addComponents(timeMinuteSelect), new ActionRowBuilder().addComponents(timeAmPmSelect), new ActionRowBuilder().addComponents(confirmButton)] });
              } else {
                  setupData.dmFlowState = `awaiting_input${inputIndex}_target_number`;
                  userExperimentSetupData.set(userId, setupData);
                  
                  const targetEmbed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle(`🎯 Daily Target for Habit ${inputIndex}`)
                    .setDescription(`Perfect!\nFor your habit **"${currentHabitLabel}"** (measured in **"${selectedValue}"**):\n\nWhat is your daily **Target Number**?\nPlease type the number below (e.g., 30, 1, 0, 5.5).`);

                  await interaction.editReply({ embeds: [targetEmbed], components: [] });
              }
              console.log(`[${interaction.customId} PREDEFINED_UNIT_SELECTED_FALLBACK ${interactionId}] Used old logic to send target prompt for Input ${inputIndex}.`);
          }
        }
      } catch (error) {
        const errorTime = performance.now();
        console.error(`[${interaction.customId} ERROR ${interactionId}] Error processing select menu for Input ${inputIndex} for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error);
        if (!interaction.replied) {
            try { await interaction.followUp({ content: `Sorry, an error occurred after your unit selection for Habit ${inputIndex}. Please try again if needed.`, ephemeral: true }); } 
            catch (e) { console.error(`[${interaction.customId} ERROR_FOLLOWUP_FAIL ${interactionId}]`, e); }
        }
      }
      const processEndTime = performance.now();
      console.log(`[${interaction.customId} END ${interactionId}] Finished processing Input ${inputIndex} Unit selection. Total time: ${(processEndTime - habitUnitSelectSubmitTime).toFixed(2)}ms`);
    }

       // --- START: NEW Handler for Duration Select Menu Interaction ---
    else if (interaction.isStringSelectMenu() && interaction.customId === 'experiment_duration_select') {
      const selectMenuSubmitTime = performance.now();
      const interactionId = interaction.id;
      console.log(`[experiment_duration_select START ${interactionId}] Received selection from ${interaction.user.tag}.`);

      try {
          // --- Habit 1: Defer Update ---
          await interaction.deferUpdate({ flags: MessageFlags.Ephemeral }); // Keep it ephemeral
          const deferTime = performance.now();
          console.log(`[experiment_duration_select DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - selectMenuSubmitTime).toFixed(2)}ms`);

          // --- Habit 2: Get Selected Value ---
          const selectedDuration = interaction.values[0];
          console.log(`[experiment_duration_select DATA ${interactionId}] Selected duration value: "${selectedDuration}"`);

          // --- ACTION 3: Retrieve Stored Setup Data ---
          const setupData = userExperimentSetupData.get(interaction.user.id);
          if (!setupData) {
              console.error(`[experiment_duration_select CRITICAL ${interactionId}] Missing setup data for user ${interaction.user.id}.`);
              await interaction.editReply({
                  content: "⚠️ Error: Could not retrieve your initial experiment settings. Please start over using `/go`.",
                  embeds: [],
                  components: []
              });
              return;
          }

          // --- ACTION 4: Store Duration and Update Map ---
          setupData.experimentDuration = selectedDuration;
          userExperimentSetupData.set(interaction.user.id, setupData);
          console.log(`[experiment_duration_select DATA_STORED ${interactionId}] Stored duration: ${selectedDuration}`);

          // ****** NEW MINIMAL CHANGE STARTS HERE ******
          console.log(`[experiment_duration_select PREEMPTIVE_SAVE ${interactionId}] Preemptively saving schedule with 'no reminders' for ${interaction.user.id}`);
          const preemptivePayload = {
              experimentDuration: setupData.experimentDuration,
              userCurrentTime: null, // Not needed for skipped reminders
              reminderWindowStartHour: null,
              reminderWindowEndHour: null,
              reminderFrequency: 'none',
              skippedReminders: true,
          };
          try {
              // IMPORTANT: Ensure `callFirebaseFunction` is defined and accessible here.
              const preemptiveResult = await callFirebaseFunction('setExperimentSchedule', preemptivePayload, interaction.user.id);
              if (preemptiveResult && preemptiveResult.success && preemptiveResult.experimentId) {
                  console.log(`[experiment_duration_select PREEMPTIVE_SAVE_SUCCESS ${interactionId}] Successfully saved default 'no reminder' schedule. Exp ID: ${preemptiveResult.experimentId}`);
                  if (setupData) { // Store experimentId if available, useful for later steps
                      setupData.experimentId = preemptiveResult.experimentId;
                      userExperimentSetupData.set(interaction.user.id, setupData);
                  }
              } else {
                  console.warn(`[experiment_duration_select PREEMPTIVE_SAVE_FAIL ${interactionId}] Failed to save default 'no reminder' schedule. Result:`, preemptiveResult);
                  // Non-critical failure, user can still proceed to set reminders explicitly or skip again.
                  // You might want to log this more formally or alert if it happens often.
              }
          } catch (preemptiveError) {
              console.error(`[experiment_duration_select PREEMPTIVE_SAVE_ERROR ${interactionId}] Error during preemptive save of schedule:`, preemptiveError);
              // Also non-critical for the flow to continue, but good to log.
          }

          // --- ACTION 5: Show Reminder Buttons (Edit the message again) ---
          // This part confirms your point 5: it leads to the reminder buttons.
          const reminderButtons = new ActionRowBuilder()
              .addComponents(
                  new ButtonBuilder().setCustomId('show_reminders_setup_modal_btn').setLabel('⏰ Set Reminders').setStyle(ButtonStyle.Primary),
                  new ButtonBuilder().setCustomId('skip_reminders_btn').setLabel('🔕 No Reminders').setStyle(ButtonStyle.Secondary)
              );

          console.log(`[experiment_duration_select EDIT_REPLY ${interactionId}] Editing reply to show reminder buttons.`);
          await interaction.editReply({
              content: `✅ Duration set to **${selectedDuration.replace('_', ' ')}**. Want to set up reminders?`,
              embeds: [],
              components: [reminderButtons]
          });
          console.log(`[experiment_duration_select EDIT_REPLY_SUCCESS ${interactionId}] Successfully showed reminder buttons.`);

      } catch (error) {
          const errorTime = performance.now();
          console.error(`[experiment_duration_select ERROR ${interactionId}] Error processing selection at ${errorTime.toFixed(2)}ms:`, error);
          try {
              await interaction.editReply({
                  content: '❌ An error occurred while processing your duration selection. Please try selecting again.',
                  embeds: [],
                  components: []
              });
          } catch (editError) {
              console.error(`[experiment_duration_select FALLBACK_ERROR ${interactionId}] Failed to send error editReply:`, editError);
          }
      }
      const selectMenuProcessEndTime = performance.now();
      console.log(`[experiment_duration_select END ${interactionId}] Processing finished. Total time: ${(selectMenuProcessEndTime - selectMenuSubmitTime).toFixed(2)}ms`);
    }
       // --- END: NEW Handler for Duration Select Menu Interaction ---

      else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('reminder_select_')) {
      const selectSubmitTime = performance.now();
      const interactionId = interaction.id; // For logging
      const userId = interaction.user.id;
      const menuId = interaction.customId;
      const selectedValue = interaction.values[0]; // Select menus (non-multi) always have one value

      console.log(`[ReminderSelect START ${interactionId}] User: ${userId} selected "${selectedValue}" for menu: ${menuId}. Time: ${selectSubmitTime.toFixed(2)}ms`);

      try {
          await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
          const deferTime = performance.now();
          console.log(`[ReminderSelect DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - selectSubmitTime).toFixed(2)}ms`);

          const setupData = userExperimentSetupData.get(userId);
          if (!setupData) {
              console.error(`[ReminderSelect CRITICAL ${interactionId}] Missing setup data for ${userId} on select menu interaction for ${menuId}.`);
              try {
                  await interaction.followUp({
                      content: "⚠️ Error: Couldn't retrieve your experiment setup data while saving reminder preference. Please start over using `/go`.",
                      ephemeral: true
                  });
              } catch (followUpError) {
                  console.error(`[ReminderSelect FALLBACK_ERROR ${interactionId}] Failed to send followUp error for missing setup data:`, followUpError);
              }
              return;
          }

          // Store the selected value based on the custom ID of the select menu
          switch (menuId) {
              case REMINDER_SELECT_START_HOUR_ID:
                  setupData.reminderStartHour = selectedValue;
                  console.log(`[ReminderSelect INFO ${interactionId}] Stored reminderStartHour: "${selectedValue}" for ${userId}.`);
                  break;
              case REMINDER_SELECT_END_HOUR_ID:
                  setupData.reminderEndHour = selectedValue;
                  console.log(`[ReminderSelect INFO ${interactionId}] Stored reminderEndHour: "${selectedValue}" for ${userId}.`);
                  break;
              case REMINDER_SELECT_FREQUENCY_ID:
                  setupData.reminderFrequency = selectedValue;
                  console.log(`[ReminderSelect INFO ${interactionId}] Stored reminderFrequency: "${selectedValue}" for ${userId}.`);
                  if (selectedValue === 'none') {
                      console.log(`[ReminderSelect INFO ${interactionId}] User ${userId} selected 'No Reminders'. Other reminder fields might be cleared or ignored later.`);
                  }
                  break;
              case REMINDER_SELECT_TIME_H_ID: // <<< ADDED CASE
                  setupData.reminderTimeH = selectedValue;
                  console.log(`[ReminderSelect INFO ${interactionId}] Stored reminderTimeH: "${selectedValue}" for ${userId}.`);
                  break;
              case REMINDER_SELECT_TIME_M_ID: // <<< ADDED CASE
                  setupData.reminderTimeM = selectedValue;
                  console.log(`[ReminderSelect INFO ${interactionId}] Stored reminderTimeM: "${selectedValue}" for ${userId}.`);
                  break;
              case REMINDER_SELECT_TIME_AP_ID: // <<< ADDED CASE
                  setupData.reminderTimeAP = selectedValue;
                  console.log(`[ReminderSelect INFO ${interactionId}] Stored reminderTimeAP: "${selectedValue}" for ${userId}.`);
                  break;
              default:
                  console.warn(`[ReminderSelect WARN ${interactionId}] Unrecognized reminder_select_ menu ID: ${menuId} for user ${userId}. Value: "${selectedValue}"`);
                  break;
          }

          userExperimentSetupData.set(userId, setupData);
          const loggedSetupData = JSON.parse(JSON.stringify(setupData)); // Deep clone for safe logging
          console.log(`[ReminderSelect DATA_UPDATED ${interactionId}] User: ${userId}. Current userExperimentSetupData state:`, loggedSetupData);

      } catch (error) {
          const errorTime = performance.now();
          console.error(`[ReminderSelect ERROR ${interactionId}] Error processing selection for ${menuId} for user ${userId} at ${errorTime.toFixed(2)}ms:`, error);
          try {
              await interaction.followUp({
                  content: `❌ An error occurred while saving your selection for ${menuId.replace('reminder_select_', '').replace(/_/g, ' ')}. Please try selecting again or restart with /go if issues persist.`,
                  ephemeral: true
              });
          } catch (followUpError) {
              console.error(`[ReminderSelect FALLBACK_ERROR ${interactionId}] Failed to send followUp error for select menu processing:`, followUpError);
          }
      }
      const processEndTime = performance.now();
      console.log(`[ReminderSelect END ${interactionId}] Finished processing ${menuId}. Total time: ${(processEndTime - selectSubmitTime).toFixed(2)}ms`);
    }
   }

   // Handle modal submission
  else if (interaction.isModalSubmit()) {
  // +++ COMPLETE MODAL SUBMISSION HANDLER FOR DAILY LOG (FIREBASE) +++
   // REPLACE THE EXISTING 'dailyLogModal_firebase' HANDLER
    if (interaction.isModalSubmit() && interaction.customId === 'dailyLogModal_firebase') {
        const modalSubmitStartTime = performance.now();
        console.log(`[dailyLogModal_firebase] Submission received by User: ${interaction.user.tag}, InteractionID: ${interaction.id}`);

        try {
            // 1. Defer Reply
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const deferTime = performance.now();
            console.log(`[dailyLogModal_firebase] Deferral took: ${(deferTime - modalSubmitStartTime).toFixed(2)}ms`);
            
            // 2. Get data from memory and modal
            const setupData = userExperimentSetupData.get(interaction.user.id);
            const settings = setupData?.logFlowSettings;
            const loggedTimeValues = setupData?.loggedTimeValues || {};
            if (!settings) {
                await interaction.editReply({ content: "❌ Error: Could not find the settings for this experiment log. Please try starting the log process again.", components: [] });
                return;
            }

            // 3. Consolidate and validate values from the modal
            const payload = {
                outputValue: null,
                inputValues: ["", "", ""],
                notes: interaction.fields.getTextInputValue('log_notes')?.trim(),
                userTag: interaction.user.tag,
                channelId: interaction.channel.id
            };

            if (settings.output && settings.output.label) {
                if (loggedTimeValues.hasOwnProperty(settings.output.label)) {
                    payload.outputValue = loggedTimeValues[settings.output.label];
                } else {
                    try { payload.outputValue = interaction.fields.getTextInputValue('log_output_value')?.trim(); } catch { /* was not in modal */ }
                }
            }
            for (let i = 0; i < 3; i++) {
                const inputConfig = settings[`input${i + 1}`];
                if (inputConfig && inputConfig.label) {
                    if (loggedTimeValues.hasOwnProperty(inputConfig.label)) {
                        payload.inputValues[i] = loggedTimeValues[inputConfig.label];
                    } else {
                        try { payload.inputValues[i] = interaction.fields.getTextInputValue(`log_input${i + 1}_value`)?.trim(); } catch { /* was not in modal */ }
                    }
                }
            }

            if (payload.outputValue === undefined || payload.outputValue === null || (payload.inputValues[0] === undefined || payload.inputValues[0] === null || payload.inputValues[0] === "") || !payload.notes) {
                await interaction.editReply({ content: "❌ Missing required fields (Outcome, Habit 1, or Notes)." });
                return;
            }

            // 4. Call the synchronous Firebase Function
            console.log(`[dailyLogModal_firebase] Calling submitAndAnalyzeLog for User: ${interaction.user.id}`);
            const result = await callFirebaseFunction('submitAndAnalyzeLog', payload, interaction.user.id);
            if (!result || !result.success) {
                throw new Error(result?.error || "Failed to submit log and get AI analysis.");
            }

            console.log(`[dailyLogModal_firebase] Log ${result.logId} saved. AI Response received.`);
            
            // 5. Construct and send the final ephemeral reply
            let finalEphemeralMessage = "";
            const components = [];

            if (result.aiResponse) {
                // When AI gives feedback, the message is direct and does NOT include an inspirational quote.
                finalEphemeralMessage = `✅ **Log Saved!**\n\n${result.aiResponse.acknowledgment}\n\n${result.aiResponse.comfortMessage}\n\nI've got a thought about sharing your journey. Would you like to see it?`;
                
                const currentSetupData = userExperimentSetupData.get(interaction.user.id) || {};
                userExperimentSetupData.set(interaction.user.id, {
                    ...currentSetupData,
                    aiLogPublicPostSuggestion: result.aiResponse.publicPostSuggestion,
                });
                const showShareButton = new ButtonBuilder()
                    .setCustomId('ai_show_share_prompt_btn')
                    .setLabel('📣 Yes, Show Me!')
                    .setStyle(ButtonStyle.Primary);
                components.push(new ActionRowBuilder().addComponents(showShareButton));

                // Send the appreciation DM asynchronously with the logged data
                sendAppreciationDM(interaction, result.aiResponse, settings, payload);

            } else {
                // When there is NO AI feedback, we include an inspirational quote.
                const randomMessage = inspirationalMessages[Math.floor(Math.random() * inspirationalMessages.length)];
                finalEphemeralMessage = `*${randomMessage}*\n\n---\n---\n✅ **Log Saved!**\n\nYour log and notes have been recorded successfully.`;
                
                // Send the appreciation DM asynchronously (no AI response) with the logged data
                sendAppreciationDM(interaction, null, settings, payload);
            }
            
            await interaction.editReply({ 
                content: finalEphemeralMessage, 
                components: components 
            });

            processPendingActions(interaction, interaction.user.id);

        } catch (error) {
            const errorTime = performance.now();
            console.error(`[dailyLogModal_firebase] MAIN CATCH BLOCK ERROR for User ${interaction.user.tag} at ${errorTime.toFixed(2)}ms:`, error);
            const userErrorMessage = `❌ An unexpected error occurred: ${error.message || 'Please try again.'}`;
            if (interaction.deferred || interaction.replied) {
                try { await interaction.editReply({ content: userErrorMessage, components: [] }); }
                catch (e) { console.error('[dailyLogModal_firebase] Failed to send error via editReply:', e); }
            }
        }
        const modalProcessEndTime = performance.now();
        console.log(`[dailyLogModal_firebase END ${interaction.id}] Processing finished. Total time: ${(modalProcessEndTime - modalSubmitStartTime).toFixed(2)}ms`);
    }
    
    else if (interaction.customId === 'confirm_ai_outcome_modal') {
        const modalSubmitStartTime = performance.now(); 
        const interactionId = interaction.id; 
        const userId = interaction.user.id; 
        const userTag = interaction.user.tag;
        console.log(`[${interaction.customId} START ${interactionId}] Modal submitted by ${userTag}.`);
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 
            const setupData = userExperimentSetupData.get(userId);
            if (!setupData || !setupData.tempSelectedOutcome) {
                console.error(`[${interaction.customId} CRITICAL ${interactionId}] State missing or tempSelectedOutcome not found for user ${userTag}.`); 
                await interaction.editReply({ content: '❌ Error: Your setup session has expired or is invalid. Please restart the setup.', components: [], embeds: [] }); 
                return;
            }

            // Get the user's confirmed (or edited) values from the modal
            const deeperProblem = interaction.fields.getTextInputValue('deeper_problem_manual')?.trim(); 
            const outcomeLabel = interaction.fields.getTextInputValue('outcome_label_manual')?.trim(); 
            const outcomeUnit = interaction.fields.getTextInputValue('outcome_unit_manual')?.trim();
            const outcomeGoalStr = interaction.fields.getTextInputValue('outcome_goal_manual')?.trim();
            // --- Validation of user's input ---
            const validationErrors = []; 
            if (!deeperProblem) validationErrors.push("The 'Deeper Wish' cannot be empty."); 
            if (!outcomeLabel) validationErrors.push("The 'Outcome Label' is required."); 
            if (!outcomeUnit) validationErrors.push("The 'Unit / Scale' is required."); 
            
            let outcomeGoal = null; 
            const isTimeMetric = TIME_OF_DAY_KEYWORDS.some(keyword => outcomeUnit.toLowerCase().includes(keyword)); 
            if (isTimeMetric) {
                outcomeGoal = parseTimeGoal(outcomeGoalStr); 
                if (outcomeGoal === null) { 
                    validationErrors.push(`The Target ("${outcomeGoalStr}") must be a valid time (e.g., '8am', '17:30').`); 
                }
            } else {
                const goalResult = parseGoalValue(outcomeGoalStr);
                if (goalResult.error) {
                    validationErrors.push(goalResult.error);
                } else {
                    outcomeGoal = goalResult.goal;
                }
            }
            
            if (validationErrors.length > 0) {
                console.warn(`[${interaction.customId} VALIDATION_FAIL ${interactionId}] User ${userTag} had validation errors.`); 
                const errorEmbed = new EmbedBuilder().setColor('#ED4245').setTitle('Validation Error').setDescription('Please correct the following issues and restart the setup:\n\n' + validationErrors.map(e => `• ${e}`).join('\n')); // [cite: 2033]
                await interaction.editReply({ embeds: [errorEmbed], components: [] }); // [cite: 2034]
                return; // [cite: 2034]
            }
            
            // --- Validation Passed: Update state and proceed ---
            setupData.deeperProblem = deeperProblem; // [cite: 2034]
            setupData.outcome = { label: outcomeLabel, unit: outcomeUnit, goal: outcomeGoal }; // [cite: 2035]
            delete setupData.tempSelectedOutcome; // [cite: 2035]
            
            // Transition state before the async call
            setupData.dmFlowState = 'processing_input1_label_suggestions'; // [cite: 2036]
            userExperimentSetupData.set(userId, setupData); // [cite: 2037]
            console.log(`[${interaction.customId} OUTCOME_CONFIRMED ${interactionId}] User ${userTag} confirmed outcome. State is now '${setupData.dmFlowState}'.`); // [cite: 2037]
            // Send a "thinking" message while we fetch the next set of suggestions
            await interaction.editReply({
                content: `✅ **Outcome Metric Confirmed!**\n\n> **${outcomeLabel}** (${outcomeGoalStr} ${outcomeUnit})\n\nGreat! Now, let's define your first **Daily Habit**.\n\n🧠 I'll brainstorm some ideas...`,
                embeds: [],
                components: []
            }); // [cite: 2038]

            // --- Call Firebase for Habit Suggestions ---
            try {
                console.log(`[${interaction.customId} LLM_CALL_START ${interactionId}] Calling 'generateInputLabelSuggestions' for ${userTag}.`); // [cite: 2039]
                const habitSuggestionsResult = await callFirebaseFunction(
                  'generateInputLabelSuggestions',
                  {
                    userWish: setupData.deeperWish,
                    userBlockers: setupData.userBlockers, 
                    userVision: setupData.userVision, 
                    outcomeMetric: setupData.outcome,
                    definedInputs: [] 
                  },
                  userId
                ); // [cite: 2040, 2041, 2042]

                if (habitSuggestionsResult && habitSuggestionsResult.success && habitSuggestionsResult.suggestions?.length > 0) {
                    setupData.aiGeneratedInputSuggestions = habitSuggestionsResult.suggestions; // [cite: 2042]
                    setupData.dmFlowState = 'awaiting_input1_suggestion_selection'; // [cite: 2043]
                    setupData.currentInputIndex = 1; // Starting with the first habit 
                    userExperimentSetupData.set(userId, setupData); // [cite: 2043]
                    // Use the prompt function from our config to build the next step's dropdown
                    const stepConfig = dmFlowConfig[setupData.dmFlowState]; // [cite: 2044]
                    const { content, components } = stepConfig.prompt(setupData); // [cite: 2045]

                    // Follow up with a new message containing the habit suggestions
                    await interaction.followUp({
                        content: content,
                        components: components,
                        ephemeral: true
                    }); // [cite: 2046]
                    console.log(`[${interaction.customId} HABIT_DROPDOWN_SENT ${interactionId}] Sent habit suggestions dropdown to ${userTag}.`); // [cite: 2047]
                } else {
                    throw new Error(habitSuggestionsResult?.message || 'AI failed to return valid habit suggestions.'); // [cite: 2047]
                }
            } catch (error) {
                console.error(`[${interaction.customId} FIREBASE_FUNC_ERROR ${interactionId}] Error calling generateInputLabelSuggestions for ${userTag}:`, error); // [cite: 2048]
                await interaction.followUp({ content: 'Sorry, I had trouble brainstorming habit ideas right now. Please type `cancel` and try again.', ephemeral: true }); // [cite: 2049]
            }

        } catch (error) {
            console.error(`[${interaction.customId} CATCH_BLOCK_ERROR ${interactionId}] Error processing modal for ${userTag}:`, error); // [cite: 2050]
        }
    }

    else if (interaction.customId === 'confirm_ai_habit_modal_1') {
        const modalSubmitStartTime = performance.now();
        const interactionId = interaction.id;
        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        console.log(`[${interaction.customId} START ${interactionId}] Modal for Habit 1 submitted by ${userTag}.`);
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const setupData = userExperimentSetupData.get(userId);
            // We check for `aiGeneratedInputSuggestions` because it confirms the user came from the AI path for habits.
            if (!setupData || !setupData.aiGeneratedInputSuggestions) {
                console.error(`[${interaction.customId} CRITICAL ${interactionId}] State missing or invalid for user ${userTag}.`);
                await interaction.editReply({ content: '❌ Error: Your setup session has expired or is invalid. Please restart the setup.', components: [], embeds: [] });
                return;
            }

            const habitLabel = interaction.fields.getTextInputValue('habit_label_manual')?.trim();
            const habitUnit = interaction.fields.getTextInputValue('habit_unit_manual')?.trim();
            const habitGoalStr = interaction.fields.getTextInputValue('habit_goal_manual')?.trim();

            // --- Validation of user's input ---
            const validationErrors = [];
            if (!habitLabel) validationErrors.push("The 'Habit Label' is required.");
            if (!habitUnit) validationErrors.push("The 'Unit / Scale' is required.");
            
            let habitGoal = null;
            const isTimeMetric = TIME_OF_DAY_KEYWORDS.some(keyword => habitUnit.toLowerCase().includes(keyword));
            if (isTimeMetric) {
                habitGoal = parseTimeGoal(habitGoalStr);
                if (habitGoal === null) {
                    validationErrors.push(`The Target ("${habitGoalStr}") must be a valid time (e.g., '8am', '17:30').`);
                }
            } else {
                const goalResult = parseGoalValue(habitGoalStr);
                if (goalResult.error) {
                    validationErrors.push(goalResult.error);
                } else {
                    habitGoal = goalResult.goal;
                }
            }
            
            if (validationErrors.length > 0) {
                await interaction.editReply({ content: 'There were issues with your input:\n- ' + validationErrors.join('\n- ') + '\n\nPlease restart the setup.', components: [], embeds: [] });
                return;
            }
            
            // --- Validation Passed: Update state and proceed ---
            if (!setupData.inputs) setupData.inputs = [];
            setupData.inputs[0] = { label: habitLabel, unit: habitUnit, goal: habitGoal };
            // Clean up temp state for this step
            delete setupData.tempSelectedInput;
            // Transition state
            setupData.dmFlowState = 'awaiting_add_another_habit_choice';
            userExperimentSetupData.set(userId, setupData);
            console.log(`[${interaction.customId} HABIT1_CONFIRMED ${interactionId}] User ${userTag} confirmed Habit 1. State is now '${setupData.dmFlowState}'.`);
            // --- Ask to add another habit or finish ---
            const confirmationEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('✅ Habit 1 Confirmed!')
                .setDescription(`**${habitGoalStr} ${habitUnit}, ${habitLabel}**`)
                .addFields({ name: '\u200B', value: "Would you like to add another daily habit to test (up to 3 total)?" });
            const addHabitButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('add_another_habit_yes_btn')
                        .setLabel('➕ Yes, Add Another')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('add_another_habit_no_btn')
                        .setLabel('⏭️ No More Habits')
                        .setStyle(ButtonStyle.Primary)
                );
            await interaction.editReply({
                embeds: [confirmationEmbed],
                components: [addHabitButtons]
            });
            console.log(`[${interaction.customId} PROMPT_ADD_ANOTHER_SENT ${interactionId}] Prompted user to add another habit or finish.`);
        } catch (error) {
            console.error(`[${interaction.customId} CATCH_BLOCK_ERROR ${interactionId}] Error processing modal for ${userTag}:`, error);
        }
    }
  
    else if (interaction.customId === 'manual_setup_outcome_modal') {
        const modalSubmitStartTime = performance.now();
        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        const interactionId = interaction.id;
        console.log(`[${interaction.customId} START ${interactionId}] Modal submitted by ${userTag}.`);

        if (!dbAdmin) {
            console.error(`[${interaction.customId} CRITICAL ${interactionId}] dbAdmin not initialized.`);
            try {
                await interaction.reply({ content: "Error: The bot cannot connect to the database. Please contact support.", ephemeral: true });
            } catch (e) { console.error(`[${interaction.customId} CRITICAL_REPLY_FAIL ${interactionId}]`, e); }
            return;
        }

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const deferTime = performance.now();
            console.log(`[${interaction.customId} DEFERRED ${interactionId}] Reply deferred. Took: ${(deferTime - modalSubmitStartTime).toFixed(2)}ms`);

            const setupData = userExperimentSetupData.get(userId);
            if (!setupData) {
                console.error(`[${interaction.customId} CRITICAL ${interactionId}] In-memory setup state not found for user ${userTag}.`);
                await interaction.editReply({ content: '❌ Error: Your setup session has expired or is invalid. Please restart the setup.', components: [], embeds: [] });
                return;
            }

            const deeperProblem = interaction.fields.getTextInputValue('deeper_problem_manual')?.trim();
            const outcomeLabel = interaction.fields.getTextInputValue('outcome_label_manual')?.trim();
            const outcomeUnit = interaction.fields.getTextInputValue('outcome_unit_manual')?.trim();
            const outcomeGoalStr = interaction.fields.getTextInputValue('outcome_goal_manual')?.trim();
            
            const validationErrors = [];
            if (!deeperProblem) validationErrors.push("The 'Deeper Wish' cannot be empty.");
            if (!outcomeLabel) validationErrors.push("The 'Measurable Outcome' label is required.");
            if (!outcomeUnit) validationErrors.push("The 'Unit / Scale' is required.");
            
            let outcomeGoal = null;
            if (!outcomeGoalStr) {
                validationErrors.push("The 'Target Number' is required.");
            } else {
                const goal = parseFloat(outcomeGoalStr);
                if (isNaN(goal)) {
                    validationErrors.push(`The Target Number ("${outcomeGoalStr}") must be a valid number.`);
                } else if (goal < 0) {
                    validationErrors.push("The Target Number must be 0 or a positive number.");
                } else {
                    outcomeGoal = goal;
                }
            }

            if (validationErrors.length > 0) {
                console.warn(`[${interaction.customId} VALIDATION_FAIL ${interactionId}] User ${userTag} had validation errors.`);
                const errorEmbed = new EmbedBuilder().setColor('#ED4245').setTitle('Validation Error').setDescription('Please correct the following issues and restart the setup:\n\n' + validationErrors.map(e => `• ${e}`).join('\n'));
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
                return;
            }
            
            // Update the in-memory map immediately
            setupData.deeperProblem = deeperProblem;
            setupData.outcome = { label: outcomeLabel, unit: outcomeUnit, goal: outcomeGoal };
            userExperimentSetupData.set(userId, setupData);
            console.log(`[${interaction.customId} IN_MEMORY_UPDATE ${interactionId}] Updated in-memory state with outcome data for ${userTag}.`);

            // Save the update to Firestore and AWAIT completion
            const setupStateRef = dbAdmin.collection('users').doc(userId).collection('inProgressFlows').doc('experimentSetup');
            const outcomeDataForFirestore = {
                deeperProblem: deeperProblem,
                outcome: { label: outcomeLabel, unit: outcomeUnit, goal: outcomeGoal },
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };
            await setupStateRef.set(outcomeDataForFirestore, { merge: true });
            console.log(`[${interaction.customId} FIRESTORE_UPDATE_SUCCESS ${interactionId}] Successfully saved outcome data to Firestore for ${userTag}.`);

            // Respond to the user with the next step button
            const continueToHabit1Button = new ButtonBuilder().setCustomId('manual_continue_to_habit1_btn').setLabel('➡️ Define Habit 1').setStyle(ButtonStyle.Success);
            const row = new ActionRowBuilder().addComponents(continueToHabit1Button);
            const outcomeEmbed = new EmbedBuilder().setColor('#57F287').setTitle('✅ Outcome Saved!').setDescription(`**Deeper Wish:**\n${deeperProblem}\n\n**Outcome:**\n**${outcomeGoalStr}** **${outcomeUnit}** for **${outcomeLabel}**.`);
            await interaction.editReply({
                embeds: [outcomeEmbed],
                components: [row]
            });
            console.log(`[${interaction.customId} SUCCESS_REPLY_SENT ${interactionId}] Confirmed outcome and sent button to define Habit 1.`);

        } catch (error) {
            const errorTime = performance.now();
            console.error(`[${interaction.customId} CATCH_BLOCK_ERROR ${interactionId}] Error processing outcome modal for ${userTag} at ${errorTime.toFixed(2)}ms:`, error);
            if (interaction.deferred || interaction.replied) {
                try {
                    await interaction.editReply({ content: '❌ An unexpected error occurred while saving your outcome. Please try again.', components: [], embeds: [] });
                } catch (editError) {
                    console.error(`[${interaction.customId} FALLBACK_ERROR ${interactionId}] Fallback editReply failed:`, editError);
                }
            }
        }
    }

    else if (interaction.customId === 'manual_setup_habit1_modal') {
        const modalSubmitStartTime = performance.now();
        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        const interactionId = interaction.id;
        console.log(`[${interaction.customId} START ${interactionId}] Modal for Habit 1 submitted by ${userTag}.`);

        if (!dbAdmin) {
            console.error(`[${interaction.customId} CRITICAL ${interactionId}] dbAdmin not initialized.`);
            try {
                await interaction.reply({ content: "Error: The bot cannot connect to the database. Please contact support.", ephemeral: true });
            } catch (e) { console.error(`[${interaction.customId} CRITICAL_REPLY_FAIL ${interactionId}]`, e); }
            return;
        }

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const deferTime = performance.now();
            console.log(`[${interaction.customId} DEFERRED ${interactionId}] Reply deferred. Took: ${(deferTime - modalSubmitStartTime).toFixed(2)}ms`);

            const setupData = userExperimentSetupData.get(userId);
            if (!setupData || !setupData.outcome) {
                console.error(`[${interaction.customId} CRITICAL ${interactionId}] In-memory state missing outcome data for ${userTag}.`);
                await interaction.editReply({ content: '❌ Error: Your session data is out of sync. Please restart the setup.', components: [], embeds: [] });
                return;
            }

            const habit1Label = interaction.fields.getTextInputValue('habit1_label_manual')?.trim();
            const habit1Unit = interaction.fields.getTextInputValue('habit1_unit_manual')?.trim();
            const habit1GoalStr = interaction.fields.getTextInputValue('habit1_goal_manual')?.trim();
            
            const validationErrors = [];
            if (!habit1Label) validationErrors.push("The 'Habit 1' label is required.");
            if (!habit1Unit) validationErrors.push("The 'Unit / Scale' for Habit 1 is required.");
            
            let habit1Goal = null;
            if (!habit1GoalStr) {
                validationErrors.push("The 'Target Number' for Habit 1 is required.");
            } else {
                const goal = parseFloat(habit1GoalStr);
                if (isNaN(goal)) {
                    validationErrors.push(`The Target Number for Habit 1 ("${habit1GoalStr}") must be a valid number.`);
                } else if (goal < 0) {
                    validationErrors.push("The Target Number for Habit 1 must be 0 or a positive number.");
                } else {
                    habit1Goal = goal;
                }
            }

            if (validationErrors.length > 0) {
                console.warn(`[${interaction.customId} VALIDATION_FAIL ${interactionId}] User ${userTag} had validation errors for Habit 1.`);
                const errorEmbed = new EmbedBuilder().setColor('#ED4245').setTitle('Validation Error for Habit 1').setDescription('Please correct the following issues and try again by clicking the "Define Habit 1" button:\n\n' + validationErrors.map(e => `• ${e}`).join('\n'));
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
                return;
            }

            // Update the in-memory map immediately
            if (!setupData.inputs) setupData.inputs = [];
            setupData.inputs[0] = { label: habit1Label, unit: habit1Unit, goal: habit1Goal };
            userExperimentSetupData.set(userId, setupData);
            console.log(`[${interaction.customId} IN_MEMORY_UPDATE ${interactionId}] Updated in-memory state with Habit 1 data for ${userTag}.`);

            // Await the Firestore save to guarantee data integrity
            const setupStateRef = dbAdmin.collection('users').doc(userId).collection('inProgressFlows').doc('experimentSetup');
            await setupStateRef.update({
                inputs: setupData.inputs,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[${interaction.customId} FIRESTORE_UPDATE_SUCCESS ${interactionId}] Successfully saved Habit 1 data to Firestore for ${userTag}.`);
            
            // Respond to the user with the next step choices
            const habit1Embed = new EmbedBuilder().setColor('#57F287').setTitle('✅ Habit 1 Saved!').setDescription(`**Habit 1:**\n**${habit1GoalStr}** **${habit1Unit}** for **${habit1Label}**.`);
            const addAnotherButton = new ButtonBuilder().setCustomId('manual_add_another_habit_btn').setLabel('➕ Add Another Habit').setStyle(ButtonStyle.Primary);
            const finishSetupButton = new ButtonBuilder().setCustomId('manual_finish_setup_btn').setLabel('✅ Finish Setup').setStyle(ButtonStyle.Success);
            const row = new ActionRowBuilder().addComponents(addAnotherButton, finishSetupButton);

            await interaction.editReply({
                embeds: [habit1Embed],
                components: [row]
            });
            console.log(`[${interaction.customId} SUCCESS_REPLY_SENT ${interactionId}] Confirmed Habit 1 and sent 'Add Another / Finish' buttons.`);

        } catch (error) {
            const errorTime = performance.now();
            console.error(`[${interaction.customId} CATCH_BLOCK_ERROR ${interactionId}] Error processing Habit 1 modal for ${userTag} at ${errorTime.toFixed(2)}ms:`, error);
            if (interaction.deferred || interaction.replied) {
                try {
                    await interaction.editReply({ content: '❌ An unexpected error occurred while saving Habit 1. Please try again.', components: [], embeds: [] });
                } catch (editError) {
                    console.error(`[${interaction.customId} FALLBACK_ERROR ${interactionId}] Fallback editReply failed:`, editError);
                }
            }
        }
    }

    else if (interaction.customId === 'manual_setup_habit2_modal') {
        const modalSubmitStartTime = performance.now();
        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        const interactionId = interaction.id;
        console.log(`[${interaction.customId} START ${interactionId}] Modal for Habit 2 submitted by ${userTag}.`);

        if (!dbAdmin) {
            console.error(`[${interaction.customId} CRITICAL ${interactionId}] dbAdmin not initialized.`);
            try {
                await interaction.reply({ content: "Error: The bot cannot connect to the database. Please contact support.", ephemeral: true });
            } catch (e) { console.error(`[${interaction.customId} CRITICAL_REPLY_FAIL ${interactionId}]`, e); }
            return;
        }

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const deferTime = performance.now();
            console.log(`[${interaction.customId} DEFERRED ${interactionId}] Reply deferred. Took: ${(deferTime - modalSubmitStartTime).toFixed(2)}ms`);

            const setupData = userExperimentSetupData.get(userId);
            if (!setupData || !setupData.inputs || setupData.inputs.filter(Boolean).length !== 1) {
                console.error(`[${interaction.customId} CRITICAL ${interactionId}] User ${userTag} is in an invalid state to submit Habit 2. Has ${setupData.inputs?.filter(Boolean).length || 0} habits.`);
                await interaction.editReply({ content: '❌ Error: Your session data is out of sync. Please restart the setup.', components: [], embeds: [] });
                return;
            }

            const habit2Label = interaction.fields.getTextInputValue('habit2_label_manual')?.trim();
            const habit2Unit = interaction.fields.getTextInputValue('habit2_unit_manual')?.trim();
            const habit2GoalStr = interaction.fields.getTextInputValue('habit2_goal_manual')?.trim();
            
            const validationErrors = [];
            if (!habit2Label) validationErrors.push("The 'Habit 2' label is required.");
            if (!habit2Unit) validationErrors.push("The 'Unit / Scale' for Habit 2 is required.");
            
            let habit2Goal = null;
            if (!habit2GoalStr) {
                validationErrors.push("The 'Target Number' for Habit 2 is required.");
            } else {
                const goal = parseFloat(habit2GoalStr);
                if (isNaN(goal)) {
                    validationErrors.push(`The Target Number for Habit 2 ("${habit2GoalStr}") must be a valid number.`);
                } else if (goal < 0) {
                    validationErrors.push("The Target Number for Habit 2 must be 0 or a positive number.");
                } else {
                    habit2Goal = goal;
                }
            }

            if (validationErrors.length > 0) {
                console.warn(`[${interaction.customId} VALIDATION_FAIL ${interactionId}] User ${userTag} had validation errors for Habit 2.`);
                const errorEmbed = new EmbedBuilder().setColor('#ED4245').setTitle('Validation Error for Habit 2').setDescription('Please correct the following issues and try defining Habit 2 again:\n\n' + validationErrors.map(e => `• ${e}`).join('\n'));
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
                return;
            }

            // Update in-memory map immediately
            setupData.inputs[1] = { label: habit2Label, unit: habit2Unit, goal: habit2Goal };
            userExperimentSetupData.set(userId, setupData);
            console.log(`[${interaction.customId} IN_MEMORY_UPDATE ${interactionId}] Updated in-memory state with Habit 2 data.`);
            
            // Await the Firestore save
            const setupStateRef = dbAdmin.collection('users').doc(userId).collection('inProgressFlows').doc('experimentSetup');
            await setupStateRef.update({
                inputs: setupData.inputs,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[${interaction.customId} FIRESTORE_UPDATE_SUCCESS ${interactionId}] Successfully saved Habit 2 data to Firestore.`);

            // Respond to user immediately
            const habit2Embed = new EmbedBuilder().setColor('#57F287').setTitle('✅ Habit 2 Saved!').setDescription(`**Habit 2:**\n**${habit2GoalStr}** **${habit2Unit}** for **${habit2Label}**.`);
            const addAnotherButton = new ButtonBuilder().setCustomId('manual_add_another_habit_btn').setLabel('➕ Add Habit 3').setStyle(ButtonStyle.Primary);
            const finishSetupButton = new ButtonBuilder().setCustomId('manual_finish_setup_btn').setLabel('✅ Finish Setup').setStyle(ButtonStyle.Success);
            const row = new ActionRowBuilder().addComponents(addAnotherButton, finishSetupButton);

            await interaction.editReply({
                embeds: [habit2Embed],
                components: [row]
            });
            console.log(`[${interaction.customId} SUCCESS_REPLY_SENT ${interactionId}] Confirmed Habit 2.`);

        } catch (error) {
            const errorTime = performance.now();
            console.error(`[${interaction.customId} CATCH_BLOCK_ERROR ${interactionId}] Error processing Habit 2 modal for ${userTag} at ${errorTime.toFixed(2)}ms:`, error);
            if (interaction.deferred || interaction.replied) {
                try {
                    await interaction.editReply({ content: '❌ An unexpected error occurred while saving Habit 2. Please try again.', components: [], embeds: [] });
                } catch (editError) {
                    console.error(`[${interaction.customId} FALLBACK_ERROR ${interactionId}] Fallback editReply failed:`, editError);
                }
            }
        }
    }

    else if (interaction.customId === 'manual_setup_habit3_modal') {
        const modalSubmitStartTime = performance.now();
        const userId = interaction.user.id;
        const userTag = interaction.user.tag;
        const interactionId = interaction.id;
        console.log(`[${interaction.customId} START ${interactionId}] Modal for Habit 3 submitted by ${userTag}.`);

        if (!dbAdmin) {
            console.error(`[${interaction.customId} CRITICAL ${interactionId}] dbAdmin not initialized.`);
            try {
                await interaction.reply({ content: "Error: The bot cannot connect to the database. Please contact support.", ephemeral: true });
            } catch (e) { console.error(`[${interaction.customId} CRITICAL_REPLY_FAIL ${interactionId}]`, e); }
            return;
        }

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const deferTime = performance.now();
            console.log(`[${interaction.customId} DEFERRED ${interactionId}] Reply deferred. Took: ${(deferTime - modalSubmitStartTime).toFixed(2)}ms`);

            const setupData = userExperimentSetupData.get(userId);
            if (!setupData || !setupData.inputs || setupData.inputs.filter(Boolean).length !== 2) {
                console.error(`[${interaction.customId} CRITICAL ${interactionId}] User ${userTag} is in an invalid state to submit Habit 3. Has ${setupData.inputs?.filter(Boolean).length || 0} habits.`);
                await interaction.editReply({ content: '❌ Error: Your session data is out of sync. Please restart the setup.', components: [], embeds: [] });
                return;
            }

            const habit3Label = interaction.fields.getTextInputValue('habit3_label_manual')?.trim();
            const habit3Unit = interaction.fields.getTextInputValue('habit3_unit_manual')?.trim();
            const habit3GoalStr = interaction.fields.getTextInputValue('habit3_goal_manual')?.trim();
            
            const validationErrors = [];
            if (!habit3Label) validationErrors.push("The 'Habit 3' label is required.");
            if (!habit3Unit) validationErrors.push("The 'Unit / Scale' for Habit 3 is required.");

            let habit3Goal = null;
            if (!habit3GoalStr) {
                validationErrors.push("The 'Target Number' for Habit 3 is required.");
            } else {
                const goal = parseFloat(habit3GoalStr);
                if (isNaN(goal)) {
                    validationErrors.push(`The Target Number for Habit 3 ("${habit3GoalStr}") must be a valid number.`);
                } else if (goal < 0) {
                    validationErrors.push("The Target Number for Habit 3 must be 0 or a positive number.");
                } else {
                    habit3Goal = goal;
                }
            }

            if (validationErrors.length > 0) {
                console.warn(`[${interaction.customId} VALIDATION_FAIL ${interactionId}] User ${userTag} had validation errors for Habit 3.`);
                const errorEmbed = new EmbedBuilder().setColor('#ED4245').setTitle('Validation Error for Habit 3').setDescription('Please correct the following issues and try defining Habit 3 again:\n\n' + validationErrors.map(e => `• ${e}`).join('\n'));
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
                return;
            }

            // Update in-memory map immediately
            setupData.inputs[2] = { label: habit3Label, unit: habit3Unit, goal: habit3Goal };
            userExperimentSetupData.set(userId, setupData);
            console.log(`[${interaction.customId} IN_MEMORY_UPDATE ${interactionId}] Updated in-memory state with Habit 3 data.`);
            
            // Await the Firestore save
            const setupStateRef = dbAdmin.collection('users').doc(userId).collection('inProgressFlows').doc('experimentSetup');
            await setupStateRef.update({
                inputs: setupData.inputs,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`[${interaction.customId} FIRESTORE_UPDATE_SUCCESS ${interactionId}] Successfully saved Habit 3 data to Firestore.`);

            // Respond to user with the final review and the Back/Finish buttons
            const finishSetupButton = new ButtonBuilder().setCustomId('manual_finish_setup_btn').setLabel('✅ Looks Good, Finish Setup').setStyle(ButtonStyle.Success);
            const backToStartButton = new ButtonBuilder().setCustomId('manual_back_to_outcome_modal_btn').setLabel('⬅️ Edit Outcome').setStyle(ButtonStyle.Secondary);
            const row = new ActionRowBuilder().addComponents(backToStartButton, finishSetupButton);
            
            const fullSummaryEmbed = new EmbedBuilder()
                .setColor('#57F287')
                .setTitle('✅ All Habits Saved!')
                .setDescription(`Here is the full summary of your experiment. If it looks correct, click "Finish Setup" to proceed. You can also go back to edit the Outcome.\n\n` +
                    `**Deeper Wish:**\n${setupData.deeperProblem}\n\n` +
                    `**Outcome:**\n**${setupData.outcome.goal}** **${setupData.outcome.unit}** for **${setupData.outcome.label}**\n\n` +
                    `**Habits:**\n` +
                    `1. Track **${setupData.inputs[0].goal}** **${setupData.inputs[0].unit}** for **${setupData.inputs[0].label}**.\n` +
                    `2. Track **${setupData.inputs[1].goal}** **${setupData.inputs[1].unit}** for **${setupData.inputs[1].label}**.\n` +
                    `3. Track **${setupData.inputs[2].goal}** **${setupData.inputs[2].unit}** for **${setupData.inputs[2].label}**.`
                );

            await interaction.editReply({
                embeds: [fullSummaryEmbed],
                components: [row]
            });
            console.log(`[${interaction.customId} SUCCESS_REPLY_SENT ${interactionId}] Confirmed Habit 3 and sent final review with Finish/Back buttons.`);

        } catch (error) {
            const errorTime = performance.now();
            console.error(`[${interaction.customId} CATCH_BLOCK_ERROR ${interactionId}] Error processing Habit 3 modal for ${userTag} at ${errorTime.toFixed(2)}ms:`, error);
            if (interaction.deferred || interaction.replied) {
                try {
                    await interaction.editReply({ content: '❌ An unexpected error occurred while saving Habit 3. Please try again.', components: [], embeds: [] });
                } catch (editError) {
                    console.error(`[${interaction.customId} FALLBACK_ERROR ${interactionId}] Fallback editReply failed:`, editError);
                }
            }
        }
    }

   }

      console.log(`--- InteractionCreate END [${interactionId}] ---\n`);
      const interactionListenerEndPerfNow = performance.now();
      console.log(`[InteractionListener END ${interaction.id}] Processing finished. TotalInListener: ${(interactionListenerEndPerfNow - interactionEntryPerfNow).toFixed(2)}ms.`);
 });  // end of client.on(Events.InteractionCreate)

/**
 * Ensures a role exists in the guild, creating it if necessary.
 * @param {Guild} guild - The guild object.
 * @param {string} roleName - The desired role name.
 * @param {import('discord.js').ColorResolvable} [color] - Optional color for the role.
 * @returns {Promise<import('discord.js').Role>} The found or created role.
 */
async function ensureRole(guild, roleName, color) {
  if (!guild) throw new Error("Guild is required for ensureRole.");
  if (!roleName) throw new Error("Role name is required for ensureRole.");

  try {
    // Attempt to find the role by name
    let role = guild.roles.cache.find(r => r.name === roleName);

    if (!role) {
      console.log(`Role "${roleName}" not found in cache, attempting to fetch...`);
      // If not in cache, fetch all roles and try again (more robust)
      await guild.roles.fetch();
      role = guild.roles.cache.find(r => r.name === roleName);
    }

    if (!role) {
      console.log(`Role "${roleName}" not found, creating...`);
      // If still not found, create it
      role = await guild.roles.create({
        name: roleName,
        color: color, // Use provided color or default
        permissions: [], // No permissions needed for cosmetic roles
        reason: `Creating role for bot feature (e.g., streaks, freezes).`,
      });
      console.log(`Role "${roleName}" created successfully.`);
    }
    return role;
  } catch (error) {
    console.error(`Error finding or creating role "${roleName}" in guild ${guild.id}:`, error);
    // Rethrow or handle as appropriate for your error strategy
    throw new Error(`Failed to ensure role "${roleName}": ${error.message}`);
  }
}

client.login(DISCORD_TOKEN).catch(err => {
  console.error('❌ Failed to login to Discord:', err);
  process.exit(1);
});

