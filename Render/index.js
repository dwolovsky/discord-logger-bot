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

function setupStatsNotificationListener(client) {
  console.log("<<<<< SETUP STATS LISTENER FUNCTION ENTERED - NEW CODE RUNNING >>>>>");
  if (!admin.apps.length || !dbAdmin) { // Check if dbAdmin is initialized
      console.warn("Firebase Admin SDK not initialized. Stats notification listener will NOT run.");
      return;
  }

  console.log("Setting up Firestore listener for 'pendingStatsNotifications'...");

  const notificationsRef = dbAdmin.collection('pendingStatsNotifications');

  notificationsRef.where('status', '==', 'ready').onSnapshot(snapshot => {
      console.log(`[StatsListener DEBUG] Snapshot received. Empty: ${snapshot.empty}. Size: ${snapshot.size}. Timestamp: ${new Date().toISOString()}`);
          if (!snapshot.empty) {
              console.log(`[StatsListener DEBUG] Iterating ${snapshot.docChanges().length} document changes in this snapshot:`);
              snapshot.docChanges().forEach(change => { // Log docChanges to see what's happening
                  console.log(`[StatsListener DEBUG]   Doc ID in snapshot: ${change.doc.id}, Change Type: ${change.type}, Status: ${change.doc.data().status}`);
              });
          }

          if (snapshot.empty) {
              // console.log("No pending 'ready' stats notifications found."); // Can be noisy, enable if debugging
              return;
          }

      snapshot.docChanges().forEach(async (change) => {
        console.log("<<<<< SETUP STATS LISTENER FUNCTION ENTERED - NEW CODE RUNNING >>>>>");
          if (change.type === 'added' || change.type === 'modified') { // Process new and re-processed notifications
              const notification = change.doc.data();
              const docId = change.doc.id; // Firestore document ID (e.g., userId_experimentId)
              const { userId, experimentId, userTag, statsDocumentId } = notification;

              console.log(`[StatsListener] Detected 'ready' notification for user ${userId}, experiment ${experimentId}. Doc ID: ${docId}`);

              let discordUser = null; 
                try {
                    discordUser = await client.users.fetch(userId); 
                    if (!discordUser) { // Defensive check, fetch usually throws on major errors but good to be safe
                        console.error(`[StatsListener] Fetched Discord user is null or undefined for userId: ${userId}. Doc ID: ${docId}`);
                        await change.doc.ref.update({ 
                            status: 'error_user_not_found', 
                            processedAt: admin.firestore.FieldValue.serverTimestamp(), 
                            errorMessage: 'Fetched Discord user object was null or undefined for stats.' 
                        });
                        return; // Stop processing THIS notification
                    }
                    // Use discordUser.tag if available, otherwise fall back to userTag from notificationData
                    const effectiveUserTag = discordUser.tag || userTag || 'Unknown User';
                    console.log(`[StatsListener] Successfully fetched Discord user ${effectiveUserTag} (${userId}) for stats.`);
                } catch (userFetchError) {
                    console.error(`[StatsListener] Failed to fetch Discord user ${userId} for stats. Doc ID: ${docId}:`, userFetchError);
                    await change.doc.ref.update({ 
                        status: 'error_user_not_found', 
                        processedAt: admin.firestore.FieldValue.serverTimestamp(), 
                        errorMessage: `Failed to fetch Discord user for stats: ${userFetchError.message}`.substring(0, 499) 
                    });
                    return; // Stop processing THIS notification
                }

               try {
                  // 1. Fetch the full stats report from users/{userId}/experimentStats/{experimentId}
                  //    (using statsDocumentId which should be the same as experimentId in this flow)
                  const statsReportRef = dbAdmin.collection('users').doc(userId)
                                           .collection('experimentStats').doc(statsDocumentId || experimentId);
                  const statsReportSnap = await statsReportRef.get();

                    if (statsReportSnap.exists) {
                        const statsReportData = statsReportSnap.data();

                        // This log was very helpful, let's keep it for now or you can remove it later
                        console.log("<<<<< !!! STATS REPORT DATA OBJECT IS !!! >>>>>", JSON.stringify(statsReportData, null, 2));

                        // The DEBUG logs for individual parts (optional, you can remove if the one above is sufficient)
                        console.log(`[StatsListener] DEBUG: statsReportData.calculatedMetricStats RAW:`, statsReportData.calculatedMetricStats);
                        console.log(`[StatsListener] DEBUG: Type of statsReportData.calculatedMetricStats: ${typeof statsReportData.calculatedMetricStats}`);
                        console.log(`[StatsListener] DEBUG: statsReportData.correlations RAW:`, statsReportData.correlations);
                        console.log(`[StatsListener] DEBUG: Type of statsReportData.correlations: ${typeof statsReportData.correlations}`);
                        if (statsReportData && statsReportData.calculatedMetricStats) {
                            console.log(`[StatsListener] DEBUG: Keys in statsReportData.calculatedMetricStats: ${Object.keys(statsReportData.calculatedMetricStats).join(', ')}`);
                        }

                        const statsEmbed = new EmbedBuilder()
                            .setColor(0x0099FF)
                            .setTitle(`Experiment Stats Ready`)
                            .setDescription(`Estimated Read Time: 90 seconds`)
                            .addFields(
                                { 
                                    name: 'Total Logs Processed', 
                                    value: statsReportData.totalLogsInPeriodProcessed !== undefined 
                                        ? statsReportData.totalLogsInPeriodProcessed.toString() 
                                        : (statsReportData.totalLogsProcessed !== undefined ? statsReportData.totalLogsProcessed.toString() : 'N/A'), // Fallback to totalLogsProcessed if new one isn't there
                                    inline: true 
                                }
                            )
                            .setTimestamp()
                            .setFooter({ text: `Experiment ID: ${statsReportData.experimentId || 'N/A'}` });

                        // Add detailed STATISTICS fields dynamically
                        if (statsReportData.calculatedMetricStats && typeof statsReportData.calculatedMetricStats === 'object' && Object.keys(statsReportData.calculatedMetricStats).length > 0) {
                            statsEmbed.addFields({ name: '\u200B', value: '**📊 CORE STATISTICS**' }); // Added icon for consistency
                            for (const metricKey in statsReportData.calculatedMetricStats) {
                                const metricDetails = statsReportData.calculatedMetricStats[metricKey];
                                let fieldValue = '';
                                if (metricDetails.status === 'skipped_insufficient_data') {
                                    fieldValue = `Average: N/A (Needs ${metricDetails.dataPoints !== undefined ? 5 : 'more'} data points)\nVaration %: N/A\nData Points: ${metricDetails.dataPoints !== undefined ? metricDetails.dataPoints : 'N/A'}`;
                                } else {
                                    if (metricDetails.average !== undefined && !isNaN(metricDetails.average)) fieldValue += `Average: ${parseFloat(metricDetails.average).toFixed(2)}\n`;
                                    else fieldValue += `Average: N/A\n`;
                                    if (metricDetails.variationPercentage !== undefined && !isNaN(metricDetails.variationPercentage)) fieldValue += `Var: ${parseFloat(metricDetails.variationPercentage).toFixed(2)}%\n`;
                                    else fieldValue += `Varation: N/A\n`;
                                    if (metricDetails.dataPoints !== undefined) fieldValue += `Data Points: ${metricDetails.dataPoints}\n`;
                                    else fieldValue += `Data Points: N/A\n`;
                                }
                                
                                if (fieldValue.trim() !== '') {
                                    const fieldName = (metricDetails.label ? metricDetails.label.charAt(0).toUpperCase() + metricDetails.label.slice(1) : metricKey.charAt(0).toUpperCase() + metricKey.slice(1));
                                    statsEmbed.addFields({ name: fieldName, value: fieldValue.trim(), inline: true });
                                }
                            }
                        } else {
                            statsEmbed.addFields({ name: '📊 Core Statistics', value: 'No detailed core statistics were found in this report.', inline: false });
                        }

                        // Add CORRELATION fields dynamically (now showing Influence as R-squared)
                        if (statsReportData.correlations && typeof statsReportData.correlations === 'object' && Object.keys(statsReportData.correlations).length > 0) {
                            statsEmbed.addFields({ name: '\u200B', value: '**Daily Habit → Outcome IMPACTS**' });
                            for (const inputMetricKey in statsReportData.correlations) {
                                if (Object.prototype.hasOwnProperty.call(statsReportData.correlations, inputMetricKey)) {
                                    const corr = statsReportData.correlations[inputMetricKey];
                                    let influenceFieldValue = `Influence: N/A\nPairs: ${corr.n_pairs || 'N/A'}\n*${(corr.interpretation || 'Not calculated')}*`; // Default text updated

                                    if (corr.status === 'calculated' && corr.coefficient !== undefined && !isNaN(corr.coefficient)) {
                                        const r = parseFloat(corr.coefficient);
                                        const rSquared = r * r; // Calculate R-squared
                                        // Display R-squared as a percentage with one decimal place
                                        influenceFieldValue = `Influence %: **${(rSquared * 100).toFixed(1)}%**\nPairs: ${corr.n_pairs || 'N/A'}\n*${(corr.interpretation || 'N/A')}*`;
                                    } else if (corr.status && corr.status.startsWith('skipped_')) {
                                        influenceFieldValue = `Influence (R²): N/A\nPairs: ${corr.n_pairs || '0'}\n*${(corr.interpretation || 'Insufficient data for calculation.')}*`;
                                    }

                                    statsEmbed.addFields({
                                        name: `${(corr.label || inputMetricKey)}\n→ ${(corr.vsOutputLabel || 'Desired Output')}`, // Field name shows which input influences the output
                                        value: influenceFieldValue,
                                        inline: true
                                    });
                                }
                            }
                        } else {
                            statsEmbed.addFields({ name: '🔗 Influence (R²)', value: 'No influence data (correlations) was found or calculated for this report.', inline: false }); // Updated fallback text
                        }

              // ============== REPLACED SECTION: PAIRWISE INTERACTION ANALYSIS ==============
              // This replaces the old "STRATIFIED ANALYSIS (MIXED EFFECTS) - Analysis Prep Data"
              if (statsReportData.pairwiseInteractionResults && typeof statsReportData.pairwiseInteractionResults === 'object' && Object.keys(statsReportData.pairwiseInteractionResults).length > 0) {
                  statsEmbed.addFields({ name: '\u200B', value: '**🤝COMBINED EFFECT ANALYSIS**' });
                  statsEmbed.addFields({
                    name: '\u200B',
                    value: "Some actions can have a stronger effect on your outcome when combined with other actions. Check if that's happening here.",
                    inline: false
                }); 

                    for (const pairKey in statsReportData.pairwiseInteractionResults) {
                        if (Object.prototype.hasOwnProperty.call(statsReportData.pairwiseInteractionResults, pairKey)) {
                            const pairData = statsReportData.pairwiseInteractionResults[pairKey];

                            // Only add a field if there's a meaningful summary to show
                            // And it's not one of the default "skipped" messages (or filter as you see fit)
                            if (pairData && pairData.summary && pairData.summary.trim() !== "" && 
                                !pairData.summary.toLowerCase().includes("skipped") && 
                                !pairData.summary.toLowerCase().includes("no meaningful conclusion") &&
                                !pairData.summary.toLowerCase().includes("thresholds for output") &&
                                !pairData.summary.toLowerCase().includes("not enough days")) {

                                const pairName = `${pairData.input1Label} & ${pairData.input2Label}`;
                                statsEmbed.addFields({
                                    name: `\n${pairName} Combined Effects?`, // Added icon and clearer title
                                    value: pairData.summary, // Just the summary generated by Firebase
                                    inline: false
                                });
                            } else if (pairData && pairData.summary && pairData.summary.toLowerCase().includes("did not show any group with an average")) {
                                // Optionally, explicitly state no significant interaction if you want to show something for every pair
                                // that *was* analyzed but had no standout groups.
                                // Otherwise, the `if` condition above will skip it.
                                const pairName = `${pairData.input1Label} & ${pairData.input2Label}`;
                                statsEmbed.addFields({
                                    name: `\n${pairName} Combined Effects?`,
                                    value: "No combined effects were found for this pair with current data.", // A generic message from bot
                                    inline: false
                                });
                            }
                            // If the summary contains "skipped" or other non-result messages, it won't add a field,
                            // making the DM cleaner. You can adjust the filter conditions as needed.
                        }
                    }
              } else if (statsReportData.hasOwnProperty('pairwiseInteractionResults')) { 
                  statsEmbed.addFields({
                      name: '🤝 COMBINED EFFECT ANALYSIS',
                      value: 'No input pairs were configured or had sufficient data for this analysis.',
                      inline: false
                  });
              }
              // ============== END: PAIRWISE INTERACTION ANALYSIS SECTION ==============
                        const actionRow = new ActionRowBuilder()
                            .addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`compare_exp_stats_btn_${statsReportData.experimentId}`) // Ensure experimentId is correctly used
                                    .setLabel('Compare with Recent Experiments')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder() // New button for AI Insights
                                    .setCustomId(`get_ai_insights_btn_${statsReportData.experimentId}`)
                                    .setLabel('💡 Get AI Insights')
                                    .setStyle(ButtonStyle.Success) // Or ButtonStyle.Primary as per your preference
                            );
                        
                        // DM Sending Logic (ensure this part is outside the block you are replacing if it was separate,
                        // or ensure it's correctly placed relative to the new code if it was part of the old block)
                        if (discordUser) {
                            await discordUser.send({
                                embeds: [statsEmbed],
                                components: [actionRow]
                            }).then(async () => {
                                console.log(`[StatsListener] Successfully sent stats DM (with compare button) to user ${userId} for experiment ${statsReportData.experimentId}.`);
                                await change.doc.ref.update({
                                    status: 'processed_by_bot',
                                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                                    botProcessingNode: process.env.RENDER_INSTANCE_ID || 'local_dev_stats'
                                });
                                console.log(`[StatsListener] Updated notification ${docId} to 'processed_by_bot'.`);
                            }).catch(async (dmError) => {
                                console.error(`[StatsListener] Failed to send stats DM to user ${userId} for experiment ${statsReportData.experimentId}:`, dmError);
                                await change.doc.ref.update({ status: 'error_dm_failed', processedAt: admin.firestore.FieldValue.serverTimestamp(), errorMessage: dmError.message });
                            });
                        } else {
                            // This 'else' corresponds to 'if (discordUser)'
                            // The status update for 'error_user_not_found' should have happened earlier
                            // if discordUser was null. We just log here that DM wasn't sent.
                            console.log(`[StatsListener] Discord user ${userId} not found. Cannot send stats DM for experiment ${statsReportData.experimentId}. Notification status should already be 'error_user_not_found'.`);
                        }
                    // ================================================================================
                    // END OF CODE BLOCK TO REPLACE
                    // ================================================================================
                    } else {
                        // This 'else' corresponds to 'if (statsReportSnap.exists)'
                        console.error(`[StatsListener] Stats report document not found for user ${userId}, experiment ${statsDocumentId || experimentId}. Doc ID: ${docId}`);
                        await change.doc.ref.update({ status: 'error_report_not_found', processedAt: admin.firestore.FieldValue.serverTimestamp(), errorMessage: 'Stats report document could not be found in Firestore.' });
                    }

              } catch (error) {
                  console.error(`[StatsListener] Error processing notification ${docId} for user ${userId}, experiment ${experimentId}:`, error);
                  try {
                      await change.doc.ref.update({
                          status: 'error_processing_in_bot',
                          processedAt: admin.firestore.FieldValue.serverTimestamp(),
                          errorMessage: error.message,
                          errorStack: error.stack // Optional: for more detailed debugging in Firestore
                      });
                  } catch (updateError) {
                      console.error(`[StatsListener] CRITICAL: Failed to update error status for notification ${docId}:`, updateError);
                  }
              }
          }
      });
  }, err => {
      console.error("Error in 'pendingStatsNotifications' listener:", err);
      // Consider re-initializing the listener or alerting.
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


const { performance } = require('node:perf_hooks'); // Add this line
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const fs = require('fs').promises;
const path = require('path');

// Near the top of render index.txt
const { getAuth, signInWithCustomToken, getIdToken } = require("firebase/auth");

const userExperimentSetupData = new Map(); // To temporarily store data between modals

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
  'Originator', 'Mover', 'Navigator', 'Signal', 'Centurion',
  'Vector', 'Blaster', 'Corona', 'Luminary', 'Orbiter',
  'Radiance', 'Pulsar', 'Quantum', 'Zenith', 'Nexus',
  'Paragon', 'Supernova', 'Axiom', 'Oracle', 'Divinator',
  'Cosmic', 'Infinity', 'Transcendent'
];

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
 * Sends a final summary DM and prompts the user to post publicly.
 * @param {import('discord.js').Interaction} interaction - The interaction to reply to (usually Button or ModalSubmit)
 * @param {object} setupData - The data stored in userExperimentSetupData
 * @param {string} reminderSummary - Text describing the reminder setup ("Reminders skipped", "Reminders set for...")
 * @param {string[]} motivationalMessagesArray - Array of motivational messages
 */
async function showPostToGroupPrompt(interaction, setupData, reminderSummary, motivationalMessagesArray) {
  const userId = interaction.user.id; // Get userId for cleanup
  const randomMotivationalMessage = motivationalMessagesArray[Math.floor(Math.random() * motivationalMessagesArray.length)];

  // --- Build the Comprehensive DM Embed ---
  const dmEmbed = new EmbedBuilder()
      .setColor('#57F287') // Green for success
      .setTitle('🎉 Experiment Setup Complete! 🎉')
      .setDescription(`${randomMotivationalMessage}\n\nHere's the final summary of your new experiment. Good luck!`)
      .addFields(
          // Field 1: Deeper Problem (from setupData)
          { name: '🎯 Deeper Goal / Problem / Theme', value: setupData.deeperProblem || 'Not specified' },
          // Field 2: Initial Settings Summary (use the message from Firebase stored earlier)
          // We need to extract the *core* settings part from the result message stored previously
          // Or reconstruct it from rawPayload if simpler
           { name: '📋 Initial Settings', value: `Outcome: "${setupData.outputLabel}"\nHabit 1: "${setupData.input1Label}"${setupData.input2Label ? `\nHabit 2: "${setupData.input2Label}"`:''}${setupData.input3Label ? `\nHabit 3: "${setupData.input3Label}"`:''}` },
         // { name: '📋 Initial Settings', value: setupData.settingsMessage.split('\n\n')[1] || 'Could not parse settings summary.' }, // Example parsing, adjust as needed based on Firebase message format
          // Field 3: Duration (from setupData)
          { name: '🗓️ Experiment Duration', value: `${setupData.experimentDuration.replace('_', ' ')} (Stats report interval)` },
          // Field 4: Reminders (passed as argument)
          { name: '⏰ Reminders', value: reminderSummary }
      )
      .setFooter({ text: `User: ${interaction.user.tag}`})
      .setTimestamp();
  // --- End Embed Build ---

  try {
      // Send the DM
      await interaction.user.send({ embeds: [dmEmbed] });
      console.log(`[showPostToGroupPrompt ${interaction.id}] Sent final summary DM to ${interaction.user.tag}`);
  } catch (dmError) {
      console.error(`[showPostToGroupPrompt ${interaction.id}] Failed to send DM confirmation to ${interaction.user.tag}:`, dmError);
      // Optionally try to inform user in the ephemeral message if DM fails
      // Non-critical, proceed with ephemeral prompt
  }

  // --- Show Ephemeral "Post to group?" Buttons ---
  const postToGroupButtons = new ActionRowBuilder()
      .addComponents(
          new ButtonBuilder().setCustomId('post_exp_final_yes').setLabel('📣 Yes, Post It!').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('post_exp_final_no').setLabel('🤫 No, Keep Private').setStyle(ButtonStyle.Secondary)
      );

  // Edit the reply from the previous step (reminder modal submit or skip button)
  try {
       // Check if we can editReply (it should be possible as the interaction was deferred/updated)
       if (interaction.replied || interaction.deferred) {
            await interaction.editReply({
               content: `✨ Your experiment is fully configured! I've just DMed you the final summary.\n\n**Share your commitment with the #experiments channel?**`,
               components: [postToGroupButtons],
               embeds: [] // Clear any previous ephemeral embeds
           });
           console.log(`[showPostToGroupPrompt ${interaction.id}] Edited reply with post-to-group prompt.`);
       } else {
            // Fallback if somehow the interaction wasn't replied/deferred (less likely)
            await interaction.reply({
                content: `✨ Your experiment is fully configured! I've just DMed you the final summary.\n\n**Share your commitment with the #experiments channel?**`,
                components: [postToGroupButtons],
                flags: MessageFlags.Ephemeral
            });
            console.log(`[showPostToGroupPrompt ${interaction.id}] Replied with post-to-group prompt (fallback).`);
       }
  } catch (promptError) {
       console.error(`[showPostToGroupPrompt ${interaction.id}] Error showing post-to-group prompt:`, promptError);
       // Attempt a followup if editReply failed
       try {
           await interaction.followUp({
               content: `✨ Experiment configured & summary DMed! Failed to show post prompt buttons.`,
               flags: MessageFlags.Ephemeral
           });
       } catch (followUpError) {
           console.error(`[showPostToGroupPrompt ${interaction.id}] Error sending follow-up error message:`, followUpError);
       }
  }
  // Note: userExperimentSetupData cleanup happens *after* the Yes/No buttons are handled.
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
    GatewayIntentBits.MessageContent  // Add this (needed to read message content in DMs)
  ]
});

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);

  if (admin.apps.length && typeof dbAdmin !== 'undefined' && dbAdmin !== null) {
    setupStatsNotificationListener(client);
    setupReminderDMsListener(client); // <<< ADD THIS LINE TO CALL THE NEW LISTENER
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

// --- Stage 1: Handle "awaiting_wish" ---
  if (setupData.dmFlowState === 'awaiting_wish') {
    const interactionIdForLog = setupData.interactionId || 'DM_FLOW'; //

    if (!messageContent) {
      await message.author.send("It looks like your Deeper Wish was empty. Please tell me, what's one thing you wish was different or better in your daily life right now?"); //
      console.log(`[MessageCreate AWAITING_WISH_EMPTY ${interactionIdForLog}] User ${userTag} sent empty wish.`); //
      return;
    }

    // Store the wish
    setupData.deeperWish = messageContent;
    setupData.deeperProblem = messageContent; // [cite: 1395]
    setupData.dmFlowState = 'processing_wish'; // [cite: 1396]
    userExperimentSetupData.set(userId, setupData);
    console.log(`[MessageCreate AWAITING_WISH_RECEIVED ${interactionIdForLog}] User ${userTag} submitted Deeper Wish: "${messageContent}". State changed to 'processing_wish'.`); //

    // ---- MODIFICATION: Send the "thinking" message and store it ----
    const thinkingMessage = await message.author.send(`Thanks for sharing your Wish:\n"${setupData.deeperWish}"\n\n🧠 Now, let's transform that wish into a measurable outcome.\n\nI'll brainstorm some potential outcomes you could track.\n\nThis might take a moment...`); //
    // ---- END MODIFICATION ----

    // --- Prepare to call Firebase Function for LLM Task (Outcome Label Suggestions) ---
    try {
      console.log(`[MessageCreate LLM_CALL_START ${interactionIdForLog}] Calling 'generateOutcomeLabelSuggestions' Firebase function for ${userTag} with Deeper Wish: "${setupData.deeperWish}"`); //
      if (!firebaseFunctions) {
          throw new Error("Firebase Functions client not initialized."); // [cite: 1400]
      }

      const llmResult = await callFirebaseFunction(
        'generateOutcomeLabelSuggestions', // [cite: 1401]
        { userWish: setupData.deeperWish },
        userId
      ); //
      console.log(`[MessageCreate LLM_CALL_END ${interactionIdForLog}] Firebase function 'generateOutcomeLabelSuggestions' returned for ${userTag}.`); //

      if (llmResult && llmResult.success && llmResult.suggestions && llmResult.suggestions.length === 5) { // [cite: 1402]
        setupData.aiGeneratedOutcomeLabelSuggestions = llmResult.suggestions; // [cite: 1402]
        setupData.dmFlowState = 'awaiting_outcome_label_dropdown_selection'; // [cite: 1403]
        userExperimentSetupData.set(userId, setupData); // [cite: 1404]
        console.log(`[MessageCreate LLM_SUCCESS ${interactionIdForLog}] Successfully received ${llmResult.suggestions.length} outcome label suggestions from LLM for ${userTag}.`); // [cite: 1405]
        
        const outcomeLabelSelectMenu = new StringSelectMenuBuilder()
          .setCustomId('ai_outcome_label_select') // [cite: 1406]
          .setPlaceholder('Select an Outcome or choose to enter your own.'); // [cite: 1406]
        llmResult.suggestions.forEach((suggestion, index) => {
          outcomeLabelSelectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(suggestion.label.substring(0, 100)) // [cite: 1407]
              .setValue(`ai_suggestion_${index}`) // [cite: 1407]
              .setDescription((suggestion.briefExplanation || 'AI Suggested Label').substring(0, 100)) // [cite: 1407, 1408]
          );
        });
        outcomeLabelSelectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("✏️ Enter my own custom label...") // [cite: 1409]
            .setValue('custom_outcome_label') // [cite: 1409]
            .setDescription("Choose this to type your own outcome metric label.") // [cite: 1409]
        );
        const rowWithLabelSelect = new ActionRowBuilder().addComponents(outcomeLabelSelectMenu); // [cite: 1410]
        let introMessage = `Okay, here are some ideas for a **Measurable Outcome** to support your wish:\n\n**"${setupData.deeperWish}"**.\n\nSelect one from the dropdown,\n\nOr choose "✏️ Enter my own..." to tweak any of them\n\n(It may take a moment to load after you choose...)\n\n\n`; // [cite: 1410]

        // ---- MODIFICATION: Edit the "thinking" message ----
        await thinkingMessage.edit({ //
            content: introMessage,
            components: [rowWithLabelSelect]
        });
        // ---- END MODIFICATION ----
        console.log(`[MessageCreate LABEL_DROPDOWN_SENT ${interactionIdForLog}] Displayed AI outcome label suggestions dropdown to ${userTag}. State: ${setupData.dmFlowState}.`); // [cite: 1415]
      } else {
        // LLM call failed or returned unexpected data
        let failureReason = "AI failed to return valid suggestions"; // [cite: 1416]
        if (llmResult && llmResult.error) {
            failureReason = llmResult.error; // [cite: 1417]
        } else if (llmResult && llmResult.suggestions && llmResult.suggestions.length !== 5) { // [cite: 1418]
            failureReason = `AI returned ${llmResult.suggestions?.length || 0} suggestions instead of 5.`; // [cite: 1418, 1419]
        }
        console.error(`[MessageCreate LLM_ERROR ${interactionIdForLog}] LLM call 'generateOutcomeLabelSuggestions' failed or returned invalid data for ${userTag}. Reason: ${failureReason}. Result:`, llmResult); // [cite: 1419]
        
        // ---- MODIFICATION: Edit the "thinking" message with the fallback ----
        await thinkingMessage.edit("I had a bit of trouble brainstorming Outcome Metric suggestions right now. 😕\n\nWhat **Label** would you like to give your Key Outcome Metric? This is the main thing you'll track *daily* to see if you're making progress on your Deeper Wish.\n\n(e.g., 'Energy Level', 'Sleep Quality', 'Tasks Completed', 'Stress Score')\n\nType just the label below (30 characters or less)."); //
        // ---- END MODIFICATION ----
        
        setupData.dmFlowState = 'awaiting_outcome_label'; // Fallback to direct label input (text-based) // [cite: 1421]
        userExperimentSetupData.set(userId, setupData); // [cite: 1421]
        console.log(`[MessageCreate LLM_FAIL_RECOVERY_LABEL ${interactionIdForLog}] LLM failed for outcome label suggestions, sent fallback 'Ask Outcome Label (text)' prompt to ${userTag}. State: ${setupData.dmFlowState}.`); // [cite: 1422]
      }
    } catch (error) {
      console.error(`[MessageCreate FIREBASE_FUNC_ERROR ${interactionIdForLog}] Error calling Firebase function 'generateOutcomeLabelSuggestions' or processing its result for ${userTag}:`, error); // [cite: 1423]
      
      // ---- MODIFICATION: Try to edit the "thinking" message with an error message ----
      try {
        await thinkingMessage.edit("I encountered an issue trying to connect with my AI brain for suggestions. Please try again in a bit, or you can 'cancel' and use the manual setup for now."); //
      } catch (editError) {
        console.error(`[MessageCreate EDIT_THINKING_MESSAGE_ON_ERROR_FAIL ${interactionIdForLog}] Could not edit thinkingMessage after catch. Sending new message. Error:`, editError);
        await message.author.send("I encountered an issue trying to connect with my AI brain for suggestions. Please try again in a bit, or you can 'cancel' and use the manual setup for now."); // Fallback to sending a new message if editing fails // [cite: 1424]
      }
      // ---- END MODIFICATION ----

      setupData.dmFlowState = 'awaiting_wish'; // Revert state so they can try sending wish again or cancel // [cite: 1425]
      userExperimentSetupData.set(userId, setupData); // [cite: 1425]
    }
  }

    // ... other dmFlowState handlers will go here as 'else if' ...
    else if (setupData.dmFlowState === 'processing_wish') {
      // User sent another message while wish was being processed.
      // Tell them to wait or handle appropriately.
      await message.author.send("I'm still thinking about your wish! I'll send the examples as soon as they're ready. 😊");
      console.log(`[MessageCreate PROCESSING_WISH_INTERRUPT ${interactionIdForLog}] User ${userTag} sent message while wish was processing.`);
    }

    else if (setupData.dmFlowState === 'awaiting_outcome_label') {
      const outcomeLabel = messageContent; // messageContent is from the top of MessageCreate

      if (!outcomeLabel) {
        await message.author.send("It looks like your response was empty. What **Label** would you give your Key Outcome Metric? (e.g., 'Energy Level', 'Sleep Quality')");
        console.log(`[MessageCreate AWAITING_OUTCOME_LABEL_EMPTY ${interactionIdForLog}] User ${userTag} sent empty outcome label.`);
        return;
      }

      // Optional: Add length validation for outcomeLabel if desired here.
      const MAX_LABEL_LENGTH = 30; // Example
      if (outcomeLabel.length > MAX_LABEL_LENGTH) {
        await message.author.send(
          `That label is a bit long! Please keep it under **${MAX_LABEL_LENGTH} characters**.\n\n` +
          `Your label for the Outcome Metric was: "${outcomeLabel}" (${outcomeLabel.length} chars).\n\n` +
          `Could you provide a shorter one?`
        );
        console.log(`[MessageCreate OUTCOME_LABEL_TOO_LONG ${interactionIdForLog}] User ${userTag} sent outcome label over ${MAX_LABEL_LENGTH} chars: "${outcomeLabel}" (${outcomeLabel.length} chars).`);
        return; // Keep user in 'awaiting_outcome_label' state to try again
      }

      setupData.outcomeLabel = outcomeLabel;
      setupData.dmFlowState = 'awaiting_outcome_unit'; // Transition to the next part
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate OUTCOME_LABEL_RECEIVED ${interactionIdForLog}] User ${userTag} submitted outcome label: "${outcomeLabel}". State changed to '${setupData.dmFlowState}'.`);

      // Now ask for the Outcome Metric Unit
      await message.author.send(
        `Got it. Your outcome metric is labeled: **"${setupData.outcomeLabel}"**.\n\n` +
        `Now, how will you **Measure** this outcome daily? This is its **Unit**.\n` +
        `Examples: '1-10 scale', 'hours slept', 'minutes focused', 'yes/no', 'tasks completed', 'pages read'.\n\nType the unit of measurement below.`
      );
      console.log(`[MessageCreate ASK_OUTCOME_UNIT ${interactionIdForLog}] DM sent to ${userTag} asking for Outcome Unit.`);
    }

    else if (setupData.dmFlowState === 'awaiting_outcome_unit') {
      const outcomeUnit = messageContent.trim(); // messageContent from the top of MessageCreate

      if (!outcomeUnit) {
        await message.author.send(
          `It looks like your response was empty. How will you **Measure** your outcome metric **"${setupData.outcomeLabel}"** daily? This is its **Unit**.\n` +
          `(e.g., '1-10 scale', 'hours slept', 'tasks completed')`
        );
        console.log(`[MessageCreate AWAITING_OUTCOME_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty outcome unit for label: ${setupData.outcomeLabel}.`);
        return;
      }

      // Optional: Add length validation for outcomeUnit if desired here.
      // const MAX_UNIT_LENGTH = 30;
      // if (outcomeUnit.length > MAX_UNIT_LENGTH) {
      //   await message.author.send(`That unit is a bit long (max ${MAX_UNIT_LENGTH} chars). Can you provide a shorter one for measuring **"${setupData.outcomeLabel}"**?`);
      //   console.log(`[MessageCreate OUTCOME_UNIT_TOO_LONG ${interactionIdForLog}] User ${userTag} sent outcome unit over ${MAX_UNIT_LENGTH} chars: "${outcomeUnit}"`);
      //   return; // Keep user in 'awaiting_outcome_unit' state
      // }

      setupData.outcomeUnit = outcomeUnit;
      setupData.dmFlowState = 'awaiting_outcome_target_number';
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate OUTCOME_UNIT_RECEIVED ${interactionIdForLog}] User ${userTag} submitted outcome unit: "${outcomeUnit}" for label "${setupData.outcomeLabel}". State changed to '${setupData.dmFlowState}'.`);

      // Now ask for the Outcome Metric Goal (Target #)
      await message.author.send(
        `Unit for **"${setupData.outcomeLabel}"** set to: **"${setupData.outcomeUnit}"**.\n\n` +
        `What's your daily **Target #** for **"${setupData.outcomeLabel}"** (measured in ${setupData.outcomeUnit})?\n` +
        `For example, if it's a 1-10 scale, your target might be '7'. If it's hours slept, maybe '7.5'. If it's tasks, maybe '3'.\n\nType just the number below.`
      );
      console.log(`[MessageCreate ASK_OUTCOME_GOAL ${interactionIdForLog}] DM sent to ${userTag} asking for Outcome Goal.`);
    }

      // [render index with AI set exp.txt]
    else if (setupData.dmFlowState === 'awaiting_custom_outcome_label_text') { // [cite: 274]
      const customLabelText = messageContent.trim(); // [cite: 274]
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW'; // [cite: 275]
      const userId = message.author.id; // [cite: 276]
      const userTag = message.author.tag; // [cite: 277]

      if (!customLabelText) { // [cite: 278]
        await message.author.send( // [cite: 278]
          "It looks like your custom label was empty. Please type the label you'd like to use for your Outcome Metric\n\nE.g., \"Overall Well-being\"\n\n(max 30 characters)." // [cite: 278]
        ); // [cite: 278]
        console.log(`[MessageCreate CUSTOM_OUTCOME_LABEL_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom outcome label.`); // [cite: 279]
        return; // [cite: 280]
      }

      const MAX_LABEL_LENGTH = 30; // [cite: 280]
      if (customLabelText.length > MAX_LABEL_LENGTH) { // [cite: 281]
        await message.author.send( // [cite: 281]
          `That custom label is a bit long! Please keep it under **${MAX_LABEL_LENGTH} characters**.\n\n` + // [cite: 281]
          `Your label was: "${customLabelText}" (${customLabelText.length} chars).\n\n` + // [cite: 281]
          `Could you provide a shorter one for your Outcome Metric?` // [cite: 281]
        ); // [cite: 281]
        console.log(`[MessageCreate CUSTOM_OUTCOME_LABEL_TOO_LONG ${interactionIdForLog}] User ${userTag} sent custom outcome label over ${MAX_LABEL_LENGTH} chars: "${customLabelText}" (${customLabelText.length} chars).`); // [cite: 282]
        return; // [cite: 283]
      }

      setupData.outcomeLabel = customLabelText; // [cite: 283]
      delete setupData.outcomeLabelSuggestedUnitType; // Clear any previous AI suggestion for unit type // [cite: 284]
      userExperimentSetupData.set(userId, setupData); // [cite: 284]

      console.log(`[MessageCreate CUSTOM_OUTCOME_LABEL_RECEIVED ${interactionIdForLog}] User ${userTag} submitted custom outcome label: "${customLabelText}". Proceeding to ask for custom unit.`); // [cite: 285]
      
      // ***** START: MODIFIED SECTION - ASK FOR CUSTOM UNIT TEXT *****
      setupData.dmFlowState = 'awaiting_custom_outcome_unit_text'; // Transition to the state for typing the unit
      userExperimentSetupData.set(userId, setupData);

      const unitPromptMessage = `Great! Your **Outcome Label** = "${setupData.outcomeLabel}".\n\nNow we need the "scale" or "units" to measure it by.\n\nHere are some ideas to get you started.\n\nFeel free to use these for inspiration, and type in your answer below!\n● 0-10 rating\n● % progress\n● # of occurrences`;
      
      await message.author.send(unitPromptMessage);
      console.log(`[MessageCreate CUSTOM_LABEL_UNIT_PROMPT_SENT ${interactionIdForLog}] Prompted ${userTag} for custom outcome unit text (after custom label). State: ${setupData.dmFlowState}.`);
      // ***** END: MODIFIED SECTION *****

    } // End of awaiting_custom_outcome_label_text

    else if (setupData.dmFlowState === 'awaiting_custom_outcome_unit_text') {
      const customOutcomeUnit = messageContent.trim(); // messageContent is from the top of MessageCreate
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW'; // Use stored interaction ID or a generic one
      const userId = message.author.id;
      const userTag = message.author.tag;

      console.log(`[MessageCreate AWAITING_CUSTOM_UNIT_TEXT ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent custom unit: "${customOutcomeUnit}". Label: "${setupData.outcomeLabel}"`);

      if (!customOutcomeUnit) {
        await message.author.send(
          `It looks like your custom unit was empty. How would you like to measure **"${setupData.outcomeLabel}"** daily?\n` +
          `Please type the Unit/Scale for your outcome\n\nE.g., "0-10 rating", "% progress".\n\nAim for a concise unit.`
        );
        console.log(`[MessageCreate CUSTOM_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom unit.`);
        return; // Keep state, wait for new message
      }

      // Validate the unit string itself for a reasonable length before checking combined
      const MAX_UNIT_ONLY_LENGTH = 30; // Max length for the unit string itself
      if (customOutcomeUnit.length > MAX_UNIT_ONLY_LENGTH) {
        await message.author.send(
          `That unit ("${customOutcomeUnit}") is a bit long for just the unit part (max ${MAX_UNIT_ONLY_LENGTH} characters).\n` +
          `Could you provide a more concise one for **"${setupData.outcomeLabel}"**?`
        );
        console.log(`[MessageCreate CUSTOM_UNIT_TOO_LONG ${interactionIdForLog}] User ${userTag} sent unit over ${MAX_UNIT_ONLY_LENGTH} chars: "${customOutcomeUnit}".`);
        return; // Keep state
      }

      // --- Combined Length Check ---
      const combinedLength = (setupData.outcomeLabel + " " + customOutcomeUnit).length;
      const MAX_COMBINED_LENGTH = 45; // For modal text input labels in the daily log form

      if (combinedLength > MAX_COMBINED_LENGTH) {
        await message.author.send(
            `The combination of your label ("${setupData.outcomeLabel}") and your unit ("${customOutcomeUnit}") is ${combinedLength} characters, which is a bit too long for the daily log form (max ~${MAX_COMBINED_LENGTH} for "Label Unit" display).\n\n` +
            `Could you please provide a shorter Unit/Scale for **"${setupData.outcomeLabel}"**? Or, you could type 'cancel' and restart the experiment setup with a shorter label if needed.`
        );
        console.warn(`[MessageCreate CUSTOM_UNIT_COMBO_TOO_LONG ${interactionIdForLog}] Combined length for "${setupData.outcomeLabel} / ${customOutcomeUnit}" is ${combinedLength} (max ${MAX_COMBINED_LENGTH}).`);
        return; // Keep state, user needs to provide a shorter unit
      }
      // --- End Combined Length Check ---

      // Validation passed
      setupData.outcomeUnit = customOutcomeUnit;
      delete setupData.outcomeUnitCategory; // Clear any AI category if it existed
      delete setupData.aiGeneratedOutcomeUnitSuggestions; // Clear previous AI suggestions
      setupData.dmFlowState = 'awaiting_outcome_target_number'; // Next state
      userExperimentSetupData.set(userId, setupData);

      console.log(`[MessageCreate CUSTOM_UNIT_VALID ${interactionIdForLog}] User ${userTag} confirmed custom unit: "${customOutcomeUnit}" for label "${setupData.outcomeLabel}". Combo length: ${combinedLength}. State changed to '${setupData.dmFlowState}'.`);

      const targetPromptMessage = `Perfect!
    **Outcome Label:** "${setupData.outcomeLabel}"
    Unit/Scale: "${setupData.outcomeUnit}"

    What is your daily **Target #** for ${setupData.outcomeLabel} ${setupData.outcomeUnit}?\n\nPlease type the number below (e.g., 4, 7.5, 0, 1).`;

      await message.author.send(targetPromptMessage);
      console.log(`[MessageCreate CUSTOM_UNIT_TARGET_PROMPT_SENT ${interactionIdForLog}] Prompted ${userTag} for outcome target number.`);
    }

    else if (setupData.dmFlowState === 'awaiting_outcome_target_number') {
      const targetNumberStr = messageContent.trim(); //
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW'; //
      const userId = message.author.id; //
      const userTagForLog = message.author.tag; //

      console.log(`[MessageCreate AWAITING_OUTCOME_TARGET ${interactionIdForLog}] User ${userTagForLog} (ID: ${userId}) sent target number: "${targetNumberStr}" for Outcome: "${setupData.outcomeLabel}" (${setupData.outcomeUnit}).`); //
      if (!targetNumberStr) {
        await message.author.send(
          `It looks like your response was empty. What is your daily **Target #** for **"${setupData.outcomeLabel}"** (measured in ${setupData.outcomeUnit})?\n` +
          `Please type just the number (e.g., 7, 7.5, 0, 1).`
        ); //
        console.log(`[MessageCreate OUTCOME_TARGET_EMPTY ${interactionIdForLog}] User ${userTagForLog} sent empty target number.`); //
        return; //
      }

      const targetNumber = parseFloat(targetNumberStr); //
      if (isNaN(targetNumber)) {
        await message.author.send(
          `Hmm, "${targetNumberStr}" doesn't seem to be a valid number. \n\nWhat is your daily **Target #** for **"${setupData.outcomeLabel}"** (measured in ${setupData.outcomeUnit})?\n` +
          `Please type just the number (e.g., 7, 7.5, 0, 1).`
        ); //
        console.log(`[MessageCreate OUTCOME_TARGET_NAN ${interactionIdForLog}] User ${userTagForLog} sent non-numeric target: "${targetNumberStr}".`); //
        return; //
      }

      // Validation passed
      setupData.outcomeGoal = targetNumber; //

      console.log(`[MessageCreate OUTCOME_METRIC_DEFINED ${interactionIdForLog}] User ${userTagForLog} fully defined Outcome Metric: Label="${setupData.outcomeLabel}", Unit="${setupData.outcomeUnit}", Goal=${setupData.outcomeGoal}.`); //
      setupData.currentInputIndex = 1; //
      setupData.inputs = setupData.inputs || []; //
      setupData.dmFlowState = 'processing_input1_label_suggestions'; //
      userExperimentSetupData.set(userId, setupData); //

      console.log(`[MessageCreate PROCESS_INPUT1_LABELS_START ${interactionIdForLog}] State changed to '${setupData.dmFlowState}'. Attempting to get Input 1 label suggestions for ${userTagForLog}.`); //
      
      // ---- MODIFICATION: Send the "thinking about habits" message and store it ----
      const habitThinkingMessage = await message.author.send( //
        `✅ **Outcome Metric Confirmed!**
        📍 Label: **${setupData.outcomeLabel}**
        📏 Unit/Scale: **${setupData.outcomeUnit}**
        🔢 Daily Target: **${setupData.outcomeGoal}**

        Great! Now, let's define your first **Daily Habit / Input**.
        This is an action you plan to take each day that you believe will influence your Outcome Metric.
        
        🧠 I'll brainstorm some potential Daily Habit Labels for you. This might take a moment...`
      );
      // ---- END MODIFICATION ----

      try {
        const habitSuggestionsResult = await callFirebaseFunction(
          'generateInputLabelSuggestions',
          {
            userWish: setupData.deeperWish, //
            outcomeMetric: {
              label: setupData.outcomeLabel,
              unit: setupData.outcomeUnit,
              goal: setupData.outcomeGoal //
            },
            definedInputs: [] // No inputs defined yet for the first habit //
          },
          userId
        ); //
        if (habitSuggestionsResult && habitSuggestionsResult.success && habitSuggestionsResult.suggestions && habitSuggestionsResult.suggestions.length > 0) { //
          setupData.aiGeneratedInputLabelSuggestions = habitSuggestionsResult.suggestions; //
          setupData.dmFlowState = 'awaiting_input1_label_dropdown_selection'; //
          userExperimentSetupData.set(userId, setupData); //
          console.log(`[MessageCreate INPUT1_LABEL_SUGGESTIONS_SUCCESS ${interactionIdForLog}] Received ${habitSuggestionsResult.suggestions.length} habit label suggestions for Input 1 for ${userTagForLog}.`); //
          const habitLabelSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('ai_input1_label_select') //
            .setPlaceholder('Select a Habit or enter your own.'); //
          habitSuggestionsResult.suggestions.forEach((suggestion, index) => {
            habitLabelSelectMenu.addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel(suggestion.label.substring(0, 100)) //
                .setValue(`ai_input1_label_suggestion_${index}`) //
                .setDescription((suggestion.briefExplanation || 'AI Suggested Habit').substring(0, 100)) //
            );
          });
          habitLabelSelectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("✏️ Enter my own custom habit label...") //
              .setValue('custom_input1_label') //
              .setDescription("Choose this to type your own habit label.") //
          );
          const rowWithHabitLabelSelect = new ActionRowBuilder().addComponents(habitLabelSelectMenu); //

          // ---- MODIFICATION: Edit the "thinking about habits" message ----
          await habitThinkingMessage.edit({ //
            content: `Okay, based on your Deeper Wish ("${setupData.deeperWish}") and Outcome Metric ("${setupData.outcomeLabel}"), here are some ideas for your **1st Daily Habit Label**.\n\nSelect one from the dropdown\n\nOr choose "✏️ Enter my own..." to tweak anything.`,
            components: [rowWithHabitLabelSelect]
          });
          // ---- END MODIFICATION ----
          console.log(`[MessageCreate INPUT1_LABEL_DROPDOWN_SENT ${interactionIdForLog}] Displayed AI habit label suggestions dropdown to ${userTagForLog}. State: ${setupData.dmFlowState}.`); //
        } else {
          // AI call failed or returned no suggestions, fallback to manual input for label
          let failureMessage = "I had a bit of trouble brainstorming Habit Label suggestions right now. 😕"; //
          if (habitSuggestionsResult && habitSuggestionsResult.error) {
            failureMessage += ` (Reason: ${habitSuggestionsResult.error})`; //
          }
          console.warn(`[MessageCreate INPUT1_LABEL_SUGGESTIONS_FAIL ${interactionIdForLog}] AI call failed or returned no data for Input 1 habit labels for ${userTagForLog}. Result:`, habitSuggestionsResult); //
          setupData.dmFlowState = 'awaiting_input1_label_text'; //
          userExperimentSetupData.set(userId, setupData); //
          
          // ---- MODIFICATION: Edit the "thinking about habits" message with fallback ----
          await habitThinkingMessage.edit( //
            `${failureMessage}\n\nNo worries! What **Label** would you like to give your first Daily Habit / Input? ` +
            `(e.g., "Morning Meditation", "Exercise", "No Social Media After 9 PM", max 30 characters).`
          );
          // ---- END MODIFICATION ----
          console.log(`[MessageCreate INPUT1_LABEL_FALLBACK_PROMPT_SENT ${interactionIdForLog}] Prompted ${userTagForLog} for Input 1 Label text (AI fail). State: ${setupData.dmFlowState}.`); //
        }
      } catch (error) {
        console.error(`[MessageCreate FIREBASE_FUNC_ERROR_INPUT_LABELS ${interactionIdForLog}] Error calling 'generateInputLabelSuggestions' for Input 1 for ${userTagForLog}:`, error); //
        setupData.dmFlowState = 'awaiting_input1_label_text'; //
        userExperimentSetupData.set(userId, setupData); //

        // ---- MODIFICATION: Try to edit the "thinking about habits" message with error ----
        try {
            await habitThinkingMessage.edit( //
                "I encountered an issue trying to connect with my AI brain for habit suggestions. \n\nLet's set it up manually: " +
                "What **Label** would you like to give your first Daily Habit / Input? (e.g., \"Morning Meditation\", max 30 characters)."
            );
        } catch (editError) {
            console.error(`[MessageCreate EDIT_HABIT_THINKING_ON_ERROR_FAIL ${interactionIdForLog}] Could not edit habitThinkingMessage after catch. Sending new message. Error:`, editError);
            await message.author.send( // Fallback to sending a new message
                "I encountered an issue trying to connect with my AI brain for habit suggestions. \n\nLet's set it up manually: " +
                "What **Label** would you like to give your first Daily Habit / Input? (e.g., \"Morning Meditation\", max 30 characters)."
            );
        }
        // ---- END MODIFICATION ----
        console.log(`[MessageCreate INPUT1_LABEL_ERROR_FALLBACK_PROMPT_SENT ${interactionIdForLog}] Prompted ${userTagForLog} for Input 1 Label text (Firebase error). State: ${setupData.dmFlowState}.`); //
      }
    }

    else if (setupData.dmFlowState === 'awaiting_input1_label_text') {
      const input1Label = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW_INPUT1_LABEL_TEXT'; // More specific log ID
      const userId = message.author.id;
      const userTag = message.author.tag;

      console.log(`[MessageCreate AWAITING_INPUT1_LABEL_TEXT ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent Input 1 Label: "${input1Label}".`);
      if (!input1Label) {
        await message.author.send(
          `It looks like your label for the first Daily Habit was empty. What **Label** would you give this habit?\n` +
          `(e.g., "Morning Meditation", "Exercise", max 30 characters).`
        );
        console.log(`[MessageCreate INPUT1_LABEL_EMPTY ${interactionIdForLog}] User ${userTag} sent empty Input 1 label.`);
        return; 
      }

      const MAX_LABEL_LENGTH = 30; 
      if (input1Label.length > MAX_LABEL_LENGTH) {
        await message.author.send(
          `That label for your habit is a bit long! Please keep it under **${MAX_LABEL_LENGTH} characters**.\n\n` +
          `Your label was: "${input1Label}" (${input1Label.length} chars).\n\n` +
          `Could you provide a shorter one for your first Daily Habit?`
        );
        console.log(`[MessageCreate INPUT1_LABEL_TOO_LONG ${interactionIdForLog}] User ${userTag} sent Input 1 label over ${MAX_LABEL_LENGTH} chars: "${input1Label}".`);
        return; 
      }

      // Custom label is valid
      setupData.currentInputDefinition = { label: input1Label };
      // ***** MODIFICATION START: Skip AI unit suggestions, go directly to custom unit text prompt *****
      setupData.dmFlowState = 'awaiting_input1_custom_unit_text'; 
      userExperimentSetupData.set(userId, setupData);

      const unitPromptMessage = `Okay, your first Daily Habit is: **"${input1Label}"**.\n\nHow do you want to measure this?\n\nWhat scale or units?\n\nExamples:\n●"minutes"\n●"reps"\n●"0-10 effort"\n●"yes/no"\n\n(max length is 15 characters for the unit itself)`;

      await message.author.send(unitPromptMessage);
      console.log(`[MessageCreate INPUT1_LABEL_CONFIRMED_PROMPT_UNIT_TEXT ${interactionIdForLog}] Confirmed custom Input 1 Label. Prompted ${userTag} for custom unit text. State: ${setupData.dmFlowState}.`);
      // ***** MODIFICATION END *****
    }

    else if (setupData.dmFlowState === 'awaiting_input2_label_text') {
      const input2Label = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW_INPUT2_LABEL_TEXT';
      const userId = message.author.id;
      const userTag = message.author.tag;

      console.log(`[MessageCreate AWAITING_INPUT2_LABEL_TEXT ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent Input 2 Label: "${input2Label}".`);
      if (!input2Label) {
        await message.author.send(
          `It looks like your label for the second Daily Habit was empty. What **Label** would you give this habit?\n` +
          `(e.g., "Evening Review", "Limit Screen Time", max 30 characters).`
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
      
      // ***** MODIFICATION START: Skip AI unit suggestions, go directly to custom unit text prompt for Input 2 *****
      setupData.dmFlowState = 'awaiting_input2_custom_unit_text'; 
      userExperimentSetupData.set(userId, setupData);

      const unitPromptMessage = `Okay, your second Daily Habit is: **"${input2Label}"**.\n\nWhat scale or units will you use to measure it?\n\nExamples:\n●"sessions"\n● "yes/no"\n● "pages read"\n\n(max length = 15 characters)`;

      await message.author.send(unitPromptMessage);
      console.log(`[MessageCreate INPUT2_LABEL_CONFIRMED_PROMPT_UNIT_TEXT ${interactionIdForLog}] Confirmed custom Input 2 Label. Prompted ${userTag} for custom unit text. State: ${setupData.dmFlowState}.`);
      // ***** MODIFICATION END *****
    }
    
    else if (setupData.dmFlowState === 'awaiting_input3_label_text') {
      const input3Label = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW_INPUT3_LABEL_TEXT';
      const userId = message.author.id;
      const userTag = message.author.tag;

      console.log(`[MessageCreate AWAITING_INPUT3_LABEL_TEXT ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent Input 3 Label: "${input3Label}".`);
      if (!input3Label) {
        await message.author.send(
          `It looks like your label for the third Daily Habit was empty. What **Label** would you give this habit?\n` +
          `(e.g., "Journaling", "Practice Instrument", max 30 characters).`
        );
        console.log(`[MessageCreate INPUT3_LABEL_EMPTY ${interactionIdForLog}] User ${userTag} sent empty Input 3 label.`);
        return;
      }

      const MAX_LABEL_LENGTH = 30;
      if (input3Label.length > MAX_LABEL_LENGTH) {
        await message.author.send(
          `That label for your third habit is a bit long! Please keep it under **${MAX_LABEL_LENGTH} characters**.\n\n` +
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

      // ***** MODIFICATION START: Skip AI unit suggestions, go directly to custom unit text prompt for Input 3 *****
      setupData.dmFlowState = 'awaiting_input3_custom_unit_text'; 
      userExperimentSetupData.set(userId, setupData);

      const unitPromptMessage = `Okay, your third Daily Habit is: **"${input3Label}"**.\n\nWhat scale or units will you use to measure it?\n\nExamples:\n●"sessions"\n● "yes/no"\n● "pages read"\n\n(max length = 15 characters)`;

      await message.author.send(unitPromptMessage);
      console.log(`[MessageCreate INPUT3_LABEL_CONFIRMED_PROMPT_UNIT_TEXT ${interactionIdForLog}] Confirmed custom Input 3 Label. Prompted ${userTag} for custom unit text. State: ${setupData.dmFlowState}.`);
      // ***** MODIFICATION END *****
    }

    else if (setupData.dmFlowState === 'awaiting_input1_custom_unit_text') {
      const customInput1Unit = messageContent.trim(); // messageContent is from the top of MessageCreate
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      const userId = message.author.id;
      const userTag = message.author.tag;
      const input1Label = setupData.currentInputDefinition?.label;

      if (!input1Label) {
        console.error(`[MessageCreate AWAITING_INPUT1_CUSTOM_UNIT_TEXT_ERROR ${interactionIdForLog}] Missing Input 1 label in setupData for user ${userTag}. State: ${setupData.dmFlowState}. Aborting this path.`);
        await message.author.send("I seem to have lost track of your habit's label. Let's try defining this habit again. What Label would you give your first daily habit? (max 30 characters)");
        setupData.dmFlowState = 'awaiting_input1_label_text'; // Revert to asking for label
        userExperimentSetupData.set(userId, setupData);
        return;
      }

      console.log(`[MessageCreate AWAITING_INPUT1_CUSTOM_UNIT_TEXT ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent custom unit: "${customInput1Unit}" for Input 1 Label: "${input1Label}".`);

      if (!customInput1Unit) {
        await message.author.send(
          `It looks like your custom unit for **"${input1Label}"** was empty. How would you like to measure this habit daily?\n` +
          `Please type your custom Unit/Scale\n\nE.g., "minutes", "reps", "0-10 effort", "pages"\n\nAim for a concise unit.`
        );
        console.log(`[MessageCreate INPUT1_CUSTOM_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom unit for Input 1.`);
        return; // Keep state, wait for new message
      }

      // Validate the unit string itself for a reasonable length
      const MAX_UNIT_ONLY_LENGTH = 15; // As per our discussion (Label 30, Unit 15)
      if (customInput1Unit.length > MAX_UNIT_ONLY_LENGTH) {
        await message.author.send(
          `That unit ("${customInput1Unit}") is a bit long for just the unit part (max ${MAX_UNIT_ONLY_LENGTH} characters for the unit itself).\n` +
          `Could you provide a more concise one for your habit **"${input1Label}"**?`
        );
        console.log(`[MessageCreate INPUT1_CUSTOM_UNIT_TOO_LONG ${interactionIdForLog}] User ${userTag} sent unit for Input 1 over ${MAX_UNIT_ONLY_LENGTH} chars: "${customInput1Unit}".`);
        return; // Keep state
      }

      // --- Combined Length Check ---
      const combinedLength = (input1Label + " " + customInput1Unit).length;
      const MAX_COMBINED_LENGTH = 45; // For modal text input labels in the daily log form

      if (combinedLength > MAX_COMBINED_LENGTH) {
        await message.author.send(
            `The combination of your habit label ("${input1Label}") and your unit ("${customInput1Unit}") is ${combinedLength} characters. This is a bit too long for the daily log form (max ~${MAX_COMBINED_LENGTH} for "Label Unit" display).\n\n` +
            `Could you please provide a shorter Unit/Scale for **"${input1Label}"**? Or, you could type 'cancel' and restart the experiment setup with a shorter label if needed.`
        );
        console.warn(`[MessageCreate INPUT1_CUSTOM_UNIT_COMBO_TOO_LONG ${interactionIdForLog}] Combined length for Input 1 ("${input1Label} / ${customInput1Unit}") is ${combinedLength} (max ${MAX_COMBINED_LENGTH}).`);
        return; // Keep state, user needs to provide a shorter unit
      }
      // --- End Combined Length Check ---

      // Validation passed
      if (!setupData.currentInputDefinition) setupData.currentInputDefinition = {}; // Ensure object exists
      setupData.currentInputDefinition.unit = customInput1Unit;
      // No unitCategory for custom units, or clear if one was somehow set before
      delete setupData.currentInputDefinition.unitCategory;
      // Clear AI suggestions for units as we're using a custom one now
      delete setupData.aiGeneratedUnitSuggestionsForCurrentItem;

      setupData.dmFlowState = 'awaiting_input1_target_number'; // Next state
      userExperimentSetupData.set(userId, setupData);

      console.log(`[MessageCreate INPUT1_CUSTOM_UNIT_VALID ${interactionIdForLog}] User ${userTag} confirmed custom unit for Input 1: "${customInput1Unit}" for label "${input1Label}". Combo length: ${combinedLength}. State changed to '${setupData.dmFlowState}'.`);

      const targetPromptMessage = `Perfect! For your first daily habit:
      📍 Label: **${input1Label}**
      📏 Unit/Scale: **${customInput1Unit}**

      What is your daily **Target #** for ${input1Label} ${customInput1Unit}? Please type the number below (e.g., 8.5, 90, 1, 0).`;

      await message.author.send(targetPromptMessage);
      console.log(`[MessageCreate INPUT1_CUSTOM_UNIT_TARGET_PROMPT_SENT ${interactionIdForLog}] Prompted ${userTag} for Input 1 target number.`);
    }

    else if (setupData.dmFlowState === 'awaiting_input2_custom_unit_text') {
      const customInput2Unit = messageContent.trim(); // messageContent is from the top of MessageCreate
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      const userId = message.author.id;
      const userTag = message.author.tag;
      const input2Label = setupData.currentInputDefinition?.label;

      // Ensure Input 2 label is still in context
      if (!input2Label || setupData.currentInputIndex !== 2) {
        console.error(`[MessageCreate AWAITING_INPUT2_CUSTOM_UNIT_TEXT_ERROR ${interactionIdForLog}] Missing Input 2 label or incorrect index in setupData for user ${userTag}. State: ${setupData.dmFlowState}, Index: ${setupData.currentInputIndex}. Aborting.`);
        await message.author.send("I seem to have lost track of your second habit's label. Let's try defining this habit again. What Label would you give your second daily habit? (max 30 characters)");
        setupData.dmFlowState = 'awaiting_input2_label_text'; // Revert to asking for label for Input 2
        delete setupData.currentInputDefinition;
        userExperimentSetupData.set(userId, setupData);
        return;
      }

      console.log(`[MessageCreate AWAITING_INPUT2_CUSTOM_UNIT_TEXT ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent custom unit: "${customInput2Unit}" for Input 2 Label: "${input2Label}".`);

      if (!customInput2Unit) {
        await message.author.send(
          `It looks like your custom unit for your second habit **"${input2Label}"** was empty. How would you like to measure this habit daily?\n` +
          `Please type your custom Unit/Scale\n\nE.g., "minutes", "reps", "0-10 effort", "pages"\n\nAim for a concise unit.`
        );
        console.log(`[MessageCreate INPUT2_CUSTOM_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom unit for Input 2.`);
        return; // Keep state, wait for new message
      }

      // Validate the unit string itself
      const MAX_UNIT_ONLY_LENGTH = 15; // Consistent
      if (customInput2Unit.length > MAX_UNIT_ONLY_LENGTH) {
        await message.author.send(
          `That unit ("${customInput2Unit}") is a bit long (max ${MAX_UNIT_ONLY_LENGTH} characters for the unit itself).\n` +
          `Could you provide a more concise one for your habit **"${input2Label}"**?`
        );
        console.log(`[MessageCreate INPUT2_CUSTOM_UNIT_TOO_LONG ${interactionIdForLog}] User ${userTag} sent unit for Input 2 over ${MAX_UNIT_ONLY_LENGTH} chars: "${customInput2Unit}".`);
        return; // Keep state
      }

      // --- Combined Length Check ---
      const combinedLength = (input2Label + " " + customInput2Unit).length;
      const MAX_COMBINED_LENGTH = 45;

      if (combinedLength > MAX_COMBINED_LENGTH) {
        await message.author.send(
            `The combination of your second habit label ("${input2Label}") and your unit ("${customInput2Unit}") is ${combinedLength} characters. This is a bit too long for the daily log form (max ~${MAX_COMBINED_LENGTH} for "Label Unit" display).\n\n` +
            `Could you please provide a shorter Unit/Scale for **"${input2Label}"**?`
        );
        console.warn(`[MessageCreate INPUT2_CUSTOM_UNIT_COMBO_TOO_LONG ${interactionIdForLog}] Combined length for Input 2 ("${input2Label} / ${customInput2Unit}") is ${combinedLength} (max ${MAX_COMBINED_LENGTH}).`);
        return; // Keep state, user needs to provide a shorter unit
      }
      // --- End Combined Length Check ---

      // Validation passed
      setupData.currentInputDefinition.unit = customInput2Unit;
      delete setupData.currentInputDefinition.unitCategory;
      delete setupData.aiGeneratedUnitSuggestionsForCurrentItem;

      setupData.dmFlowState = 'awaiting_input2_target_number'; // Next state for Input 2
      userExperimentSetupData.set(userId, setupData);

      console.log(`[MessageCreate INPUT2_CUSTOM_UNIT_VALID ${interactionIdForLog}] User ${userTag} confirmed custom unit for Input 2: "${customInput2Unit}" for label "${input2Label}". Combo length: ${combinedLength}. State changed to '${setupData.dmFlowState}'.`);

      const targetPromptMessage = `Great! For your second daily habit:
      📍 Label: **${input2Label}**
      📏 Unit/Scale: **${customInput2Unit}**

      What is your daily **Target #** for ${input2Label} ${customInput2Unit}?\n\nPlease type the number below.`;

      await message.author.send(targetPromptMessage);
      console.log(`[MessageCreate INPUT2_CUSTOM_UNIT_TARGET_PROMPT_SENT ${interactionIdForLog}] Prompted ${userTag} for Input 2 target number.`);
    }

    else if (setupData.dmFlowState === 'awaiting_input3_custom_unit_text') {
      const customInput3Unit = messageContent.trim(); // messageContent is from the top of MessageCreate
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      const userId = message.author.id;
      const userTag = message.author.tag;
      const input3Label = setupData.currentInputDefinition?.label;

      // Ensure Input 3 label is still in context
      if (!input3Label || setupData.currentInputIndex !== 3) {
        console.error(`[MessageCreate AWAITING_INPUT3_CUSTOM_UNIT_TEXT_ERROR ${interactionIdForLog}] Missing Input 3 label or incorrect index in setupData for user ${userTag}. State: ${setupData.dmFlowState}, Index: ${setupData.currentInputIndex}. Aborting.`);
        await message.author.send("I seem to have lost track of your third habit's label. Let's try defining this habit again. What Label would you give your third daily habit? (max 30 characters)");
        setupData.dmFlowState = 'awaiting_input3_label_text'; // Revert to asking for label for Input 3
        delete setupData.currentInputDefinition;
        userExperimentSetupData.set(userId, setupData);
        return;
      }

      console.log(`[MessageCreate AWAITING_INPUT3_CUSTOM_UNIT_TEXT ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent custom unit: "${customInput3Unit}" for Input 3 Label: "${input3Label}".`);

      if (!customInput3Unit) {
        await message.author.send(
          `It looks like your custom unit for your third habit **"${input3Label}"** was empty. How would you like to measure this habit daily?\n` +
          `Please type your custom Unit/Scale\n\nE.g., "minutes", "reps", "0-10 effort", "pages"\n\nAim for a concise unit.`
        );
        console.log(`[MessageCreate INPUT3_CUSTOM_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom unit for Input 3.`);
        return; // Keep state, wait for new message
      }

      // Validate the unit string itself
      const MAX_UNIT_ONLY_LENGTH = 15; // Consistent
      if (customInput3Unit.length > MAX_UNIT_ONLY_LENGTH) {
        await message.author.send(
          `That unit ("${customInput3Unit}") is a bit long (max ${MAX_UNIT_ONLY_LENGTH} characters for the unit itself).\n` +
          `Could you provide a more concise one for your habit **"${input3Label}"**?`
        );
        console.log(`[MessageCreate INPUT3_CUSTOM_UNIT_TOO_LONG ${interactionIdForLog}] User ${userTag} sent unit for Input 3 over ${MAX_UNIT_ONLY_LENGTH} chars: "${customInput3Unit}".`);
        return; // Keep state
      }

      // --- Combined Length Check ---
      const combinedLength = (input3Label + " " + customInput3Unit).length;
      const MAX_COMBINED_LENGTH = 45;

      if (combinedLength > MAX_COMBINED_LENGTH) {
        await message.author.send(
            `The combination of your third habit label ("${input3Label}") and your unit ("${customInput3Unit}") is ${combinedLength} characters. This is a bit too long for the daily log form (max ~${MAX_COMBINED_LENGTH} for "Label Unit" display).\n\n` +
            `Could you please provide a shorter Unit/Scale for **"${input3Label}"**?`
        );
        console.warn(`[MessageCreate INPUT3_CUSTOM_UNIT_COMBO_TOO_LONG ${interactionIdForLog}] Combined length for Input 3 ("${input3Label} / ${customInput3Unit}") is ${combinedLength} (max ${MAX_COMBINED_LENGTH}).`);
        return; // Keep state, user needs to provide a shorter unit
      }
      // --- End Combined Length Check ---

      // Validation passed
      setupData.currentInputDefinition.unit = customInput3Unit;
      delete setupData.currentInputDefinition.unitCategory;
      delete setupData.aiGeneratedUnitSuggestionsForCurrentItem;

      setupData.dmFlowState = 'awaiting_input3_target_number'; // Next state for Input 3
      userExperimentSetupData.set(userId, setupData);

      console.log(`[MessageCreate INPUT3_CUSTOM_UNIT_VALID ${interactionIdForLog}] User ${userTag} confirmed custom unit for Input 3: "${customInput3Unit}" for label "${input3Label}". Combo length: ${combinedLength}. State changed to '${setupData.dmFlowState}'.`);

      const targetPromptMessage = `Great! For your third daily habit:
      🏷️ Label: **${input3Label}**
      📏 Unit/Scale: **${customInput3Unit}**

      What is your daily **Target #** for ${input3Label} ${customInput3Unit}?
      Please type the number below.`;

      await message.author.send(targetPromptMessage);
      console.log(`[MessageCreate INPUT3_CUSTOM_UNIT_TARGET_PROMPT_SENT ${interactionIdForLog}] Prompted ${userTag} for Input 3 target number.`);
    }

    else if (setupData.dmFlowState === 'awaiting_input1_target_number') {
      const targetNumberStr = messageContent.trim(); // messageContent is from the top of MessageCreate
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      const userId = message.author.id;
      const userTag = message.author.tag;
      const input1Label = setupData.currentInputDefinition?.label;
      const input1Unit = setupData.currentInputDefinition?.unit;

      if (!input1Label || !input1Unit) {
        console.error(`[MessageCreate AWAITING_INPUT1_TARGET_ERROR ${interactionIdForLog}] Missing Input 1 label or unit in setupData for user ${userTag}. State: ${setupData.dmFlowState}. Aborting.`);
        await message.author.send("I seem to have lost track of your habit's details. Let's try defining this habit again. What Label would you give your first daily habit? (max 30 characters)");
        setupData.dmFlowState = 'awaiting_input1_label_text'; // Revert to asking for label for Input 1
        delete setupData.currentInputDefinition; // Clear incomplete definition
        userExperimentSetupData.set(userId, setupData);
        return;
      }

      console.log(`[MessageCreate AWAITING_INPUT1_TARGET ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent target number: "${targetNumberStr}" for Input 1: "${input1Label}" (${input1Unit}).`);

      if (!targetNumberStr) {
        await message.author.send(
          `It looks like your response was empty. What is your daily **Target #** for your habit **"${input1Label}"** (measured in ${input1Unit})?\n` +
          `Please type just the number (e.g., 30, 1, 0).`
        );
        console.log(`[MessageCreate INPUT1_TARGET_EMPTY ${interactionIdForLog}] User ${userTag} sent empty target number for Input 1.`);
        return; // Keep state, wait for new message
      }

      const targetNumber = parseFloat(targetNumberStr);
      if (isNaN(targetNumber)) {
        await message.author.send(
          `Hmm, "${targetNumberStr}" doesn't seem to be a valid number for your target.\n\nWhat is your daily **Target #** for **"${input1Label}"** (measured in ${input1Unit})?\n` +
          `Please type just the number (e.g., 15, 1, 0).`
        );
        console.log(`[MessageCreate INPUT1_TARGET_NAN ${interactionIdForLog}] User ${userTag} sent non-numeric target for Input 1: "${targetNumberStr}".`);
        return; // Keep state
      }

      // Validation passed
      setupData.currentInputDefinition.goal = targetNumber;

      // Add the fully defined Input 1 to the inputs array
      if (!setupData.inputs) {
        setupData.inputs = [];
      }
      // Check if we are updating Input 1 or adding it fresh
      // For this AI flow, currentInputIndex should be 1 and we are defining it for the first time.
      if (setupData.currentInputIndex === 1) {
          setupData.inputs[0] = { ...setupData.currentInputDefinition }; // Store a copy
      } else {
          // This case should ideally not be hit if currentInputIndex is managed correctly for this flow
          console.warn(`[MessageCreate INPUT1_TARGET_UNEXPECTED_INDEX ${interactionIdForLog}] Unexpected currentInputIndex: ${setupData.currentInputIndex} when finalizing Input 1. Overwriting/adding to inputs[0].`);
          setupData.inputs[0] = { ...setupData.currentInputDefinition };
      }

      console.log(`[MessageCreate INPUT1_DEFINED ${interactionIdForLog}] User ${userTag} fully defined Input 1: Label="${setupData.inputs[0].label}", Unit="${setupData.inputs[0].unit}", Goal=${setupData.inputs[0].goal}.`);

      // Clean up temporary holders for the current input being defined
      delete setupData.currentInputDefinition;
      delete setupData.aiGeneratedUnitSuggestionsForCurrentItem;

      // --- Ask if user wants to add another habit or finish ---
      setupData.dmFlowState = 'awaiting_add_another_habit_choice'; // New state
      userExperimentSetupData.set(userId, setupData);

      const confirmationAndNextPrompt = new EmbedBuilder()
        .setColor('#57F287') // Green
        .setTitle('Daily Habit 1 Confirmed!')
        .setDescription(
            `**🏷️ Label:** ${setupData.inputs[0].label}\n` +
            `**📏 Unit/Scale:** ${setupData.inputs[0].unit}\n` +
            `**🔢 Daily Target:** ${setupData.inputs[0].goal}`
        )
        .addFields({ name: '\u200B', value: "Would you like to add another daily habit/input to track (up to 3 total)?"});

      const addHabitButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('add_another_habit_yes_btn')
            .setLabel('➕ Yes, Add Another Habit')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('add_another_habit_no_btn')
            .setLabel('✅ No, Finish Setup')
            .setStyle(ButtonStyle.Primary)
        );

      await message.author.send({
        embeds: [confirmationAndNextPrompt],
        components: [addHabitButtons]
      });
      console.log(`[MessageCreate PROMPT_ADD_ANOTHER_HABIT ${interactionIdForLog}] Input 1 defined. Prompted ${userTag} to add another habit or finish. State: '${setupData.dmFlowState}'.`);
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
          `Hmm, "${targetNumberStr}" doesn't seem to be a valid number for your target.\n\nWhat is your daily **Target #** for **"${input2Label}"** (measured in ${input2Unit})?\n` +
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
            `**🏷️ Label:** ${setupData.inputs[1].label}\n` +
            `**📏 Unit/Scale:** ${setupData.inputs[1].unit}\n` +
            `**🔢 Daily Target:** ${setupData.inputs[1].goal}`
        )
        .addFields({ name: '\u200B', value: "Would you like to add a third (and final) daily habit/input, or are you done with habits?"});

      const addHabitButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('add_another_habit_yes_btn') // Same button ID, will be handled by existing InteractionCreate handler
            .setLabel('➕ Yes, Add Habit 3')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('add_another_habit_no_btn') // Same button ID
            .setLabel('✅ No More Habits, Finish Setup')
            .setStyle(ButtonStyle.Primary)
        );

      await message.author.send({
        embeds: [confirmationAndNextPrompt],
        components: [addHabitButtons]
      });
      console.log(`[MessageCreate PROMPT_ADD_ANOTHER_HABIT ${interactionIdForLog}] Input 2 defined. Prompted ${userTag} to add Input 3 or finish. State: '${setupData.dmFlowState}'.`);
    }

    else if (setupData.dmFlowState === 'awaiting_input3_target_number') {
      const targetNumberStr = messageContent.trim(); // messageContent is from the top of MessageCreate
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      const userId = message.author.id;
      const userTag = message.author.tag;
      const input3Label = setupData.currentInputDefinition?.label;
      const input3Unit = setupData.currentInputDefinition?.unit;
      // Ensure Input 3 label and unit are still in context
      if (!input3Label || !input3Unit || setupData.currentInputIndex !== 3) {
        console.error(`[MessageCreate AWAITING_INPUT3_TARGET_ERROR ${interactionIdForLog}] Missing Input 3 label/unit or incorrect index in setupData for user ${userTag}. State: ${setupData.dmFlowState}, Index: ${setupData.currentInputIndex}. Aborting.`);
        await message.author.send("I seem to have lost track of your third habit's details. Let's try defining this habit again. What Label would you give your third daily habit? (max 30 characters)");
        setupData.dmFlowState = 'awaiting_input3_label_text'; // Revert to asking for label for Input 3
        delete setupData.currentInputDefinition;
        userExperimentSetupData.set(userId, setupData);
        return;
      }

      console.log(`[MessageCreate AWAITING_INPUT3_TARGET ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent target number: "${targetNumberStr}" for Input 3: "${input3Label}" (${input3Unit}).`);
      if (!targetNumberStr) {
        await message.author.send(
          `It looks like your response was empty. What is your daily **Target #** for your third habit **"${input3Label}"** (measured in ${input3Unit})?\n` +
          `Please type just the number.`
        );
        console.log(`[MessageCreate INPUT3_TARGET_EMPTY ${interactionIdForLog}] User ${userTag} sent empty target number for Input 3.`);
        return; // Keep state, wait for new message
      }

      const targetNumber = parseFloat(targetNumberStr);
      if (isNaN(targetNumber)) {
        await message.author.send(
          `Hmm, "${targetNumberStr}" doesn't seem to be a valid number for your target.\n\nWhat is your daily **Target #** for **"${input3Label}"** (measured in ${input3Unit})?\n` +
          `Please type just the number.`
        );
        console.log(`[MessageCreate INPUT3_TARGET_NAN ${interactionIdForLog}] User ${userTag} sent non-numeric target for Input 3: "${targetNumberStr}".`);
        return; // Keep state
      }

      // Validation passed
      setupData.currentInputDefinition.goal = targetNumber;
      // Add the fully defined Input 3 to the inputs array
      if (!setupData.inputs) { // Should exist from Input 1 & 2
        setupData.inputs = [];
      }
      if (setupData.currentInputIndex === 3) {
          setupData.inputs[2] = { ...setupData.currentInputDefinition }; // Store a copy at index 2
      } else {
          console.warn(`[MessageCreate INPUT3_TARGET_UNEXPECTED_INDEX ${interactionIdForLog}] Unexpected currentInputIndex: ${setupData.currentInputIndex} when finalizing Input 3. Storing at inputs[2].`);
          setupData.inputs[2] = { ...setupData.currentInputDefinition };
      }

      console.log(`[MessageCreate INPUT3_DEFINED ${interactionIdForLog}] User ${userTag} fully defined Input 3: Label="${setupData.inputs[2].label}", Unit="${setupData.inputs[2].unit}", Goal=${setupData.inputs[2].goal}. All inputs defined.`);
      // Clean up temporary holders
      delete setupData.currentInputDefinition;
      delete setupData.aiGeneratedUnitSuggestionsForCurrentItem;
      
      // ***** MODIFICATION START: Transition to Confirm/Edit step *****
      setupData.dmFlowState = 'awaiting_metrics_confirmation'; 
      userExperimentSetupData.set(userId, setupData);

      let summaryDescription = `**🎯 Deeper Goal / Problem / Theme:**\n${setupData.deeperProblem}\n\n` +
                               `**📊 Daily Outcome to Track:**\n\`${setupData.outcomeGoal}, ${setupData.outcomeUnit}, ${setupData.outcomeLabel}\`\n\n` +
                               `**🛠️ Daily Habits to Track:**\n`;
      
      setupData.inputs.forEach((input, index) => {
          if (input && input.label && input.unit && input.goal !== undefined) {
              summaryDescription += `${index + 1}. \`${input.goal}, ${input.unit}, ${input.label}\`\n`;
          }
      });

      const confirmEmbed = new EmbedBuilder()
          .setColor('#FFBF00') // Amber color
          .setTitle('🔬 Review Your Full Experiment Metrics')
          .setDescription(summaryDescription + "\n\nThis is your complete setup. Please review your settings. Do they look correct?")
          .setFooter({ text: "You can edit these before setting duration."});

      const confirmButtons = new ActionRowBuilder()
          .addComponents(
              new ButtonBuilder()
                  .setCustomId('confirm_metrics_proceed_btn') // Same ID as used in add_another_habit_no_btn
                  .setLabel('✅ Looks Good, Set Duration')
                  .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                  .setCustomId('request_edit_metrics_modal_btn') // Same ID
                  .setLabel('✏️ Edit Metrics/Goal')
                  .setStyle(ButtonStyle.Primary)
          );

      await message.author.send({
          content: "Amazing, all three daily habits are defined! Here's the full summary of your experiment's metrics:",
          embeds: [confirmEmbed],
          components: [confirmButtons]
      });
      console.log(`[MessageCreate INPUT3_DEFINED_PROMPT_CONFIRM_EDIT ${interactionIdForLog}] All metrics defined. Showed confirm/edit prompt to ${userTag}. State: ${setupData.dmFlowState}.`);
      // ***** MODIFICATION END *****
    }


  console.log(`[MessageCreate DM_HANDLER END ${interactionIdForLog}] Finished DM processing for ${userTag}.`);
});

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

            // --- Create an Embed for the Go Hub message ---
            const goHubEmbed = new EmbedBuilder()
              .setColor('#7F00FF') // A nice vibrant purple, change as you like
              .setTitle('🚀 Your Go Hub 🚀')
              .setDescription('Welcome to your experiment control panel')
              .addFields(
                  { name: '🔬 Set Experiment', value: 'Define your goals and metrics.', inline: true },
                  { name: '✍️ Log Daily Data', value: 'Record your metrics and notes.', inline: true },
                  { name: '🔥 Streak Stats', value: 'View your streak and the leaderboard.', inline: true },
                  { name: '💡 AI Insights', value: 'Get AI-powered analysis of your data.', inline: true }
              )

            // --- Build the Go Hub buttons ---
            const setExperimentButton = new ButtonBuilder()
              .setCustomId('set_update_experiment_btn')
              .setLabel('🔬 Set Experiment')
              .setStyle(ButtonStyle.Primary);

            const logProgressButton = new ButtonBuilder()
              .setCustomId('log_daily_progress_btn')
              .setLabel('✍️ Log Daily Data')
              .setStyle(ButtonStyle.Success);

            const streakCenterButton = new ButtonBuilder()
              .setCustomId('streak_center_btn')
              .setLabel('🔥 Streak Progress')
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true); // Disabled for now

            const insightsButton = new ButtonBuilder()
              .setCustomId('ai_insights_btn')
              .setLabel('💡 AI Insights')
              .setStyle(ButtonStyle.Secondary);

            const row1 = new ActionRowBuilder().addComponents(setExperimentButton, logProgressButton);
            const row2 = new ActionRowBuilder().addComponents(streakCenterButton, insightsButton);

            await interaction.editReply({
              embeds: [goHubEmbed], // Send the embed
              components: [row1, row2],
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
      const handlerEntryPerfNow = performance.now(); // For delta calculation if needed from main listener entry
      const userIdForChoice = interaction.user.id;
      const userTagForChoice = interaction.user.tag;
      const interactionIdForChoice = interaction.id; // Use this for consistency in logs

      // NEW LOGGING: Handler Entry
      console.log(`[${interaction.customId} HANDLER_ENTRY ${interactionIdForChoice}] User: ${userTagForChoice}. PerfTime: ${handlerEntryPerfNow.toFixed(2)}ms.`);

      try {
        // NEW LOGGING: Before Defer
        const beforeDeferPerfNow = performance.now();
        console.log(`[${interaction.customId} PRE_DEFER ${interactionIdForChoice}] About to call deferUpdate. PerfTime: ${beforeDeferPerfNow.toFixed(2)}ms. DeltaFromHandlerEntry: ${(beforeDeferPerfNow - handlerEntryPerfNow).toFixed(2)}ms.`);

        await interaction.deferUpdate();

        // NEW LOGGING: After Defer Success
        const afterDeferPerfNow = performance.now();
        console.log(`[${interaction.customId} POST_DEfer_SUCCESS ${interactionIdForChoice}] deferUpdate successful. PerfTime: ${afterDeferPerfNow.toFixed(2)}ms. DeferCallDuration: ${(afterDeferPerfNow - beforeDeferPerfNow).toFixed(2)}ms.`);

        const choiceEmbed = new EmbedBuilder()
            .setColor('#7F00FF')
            .setTitle('🔬 How would you like to set up your experiment?')
            .setDescription("Choose your preferred method:\n\n✨ **AI Assisted (Beginner):** I'll guide you step-by-step, starting with a wish and helping you define your experiment with AI examples.\n\n✍️ **Manual Setup (Advanced):** You'll fill out a form with all your experiment details directly.");

        const aiButton = new ButtonBuilder()
            .setCustomId(AI_ASSISTED_SETUP_BTN_ID) // Ensure this const is defined globally
            .setLabel('✨ AI Assisted (Beginner)')
            .setStyle(ButtonStyle.Primary);

        const manualButton = new ButtonBuilder()
            .setCustomId(MANUAL_SETUP_BTN_ID) // Ensure this const is defined globally
            .setLabel('✍️ Manual Setup (Advanced)')
            .setStyle(ButtonStyle.Secondary);

        const choiceRow = new ActionRowBuilder().addComponents(aiButton, manualButton);

        // NEW LOGGING: Before EditReply
        const beforeEditReplyPerfNow = performance.now();
        console.log(`[${interaction.customId} PRE_EDIT_REPLY ${interactionIdForChoice}] About to call editReply. PerfTime: ${beforeEditReplyPerfNow.toFixed(2)}ms. DeltaFromDeferSuccess: ${(beforeEditReplyPerfNow - afterDeferPerfNow).toFixed(2)}ms.`);

        await interaction.editReply({
            content: '',
            embeds: [choiceEmbed],
            components: [choiceRow]
        });

        // NEW LOGGING: After EditReply Success
        const afterEditReplyPerfNow = performance.now();
        console.log(`[${interaction.customId} POST_EDIT_REPLY_SUCCESS ${interactionIdForChoice}] editReply successful. PerfTime: ${afterEditReplyPerfNow.toFixed(2)}ms. EditReplyCallDuration: ${(afterEditReplyPerfNow - beforeEditReplyPerfNow).toFixed(2)}ms.`);

        // Async pre-fetch logic (keep your existing logging within this async block)
        (async () => {
          const prefetchAsyncStartTime = performance.now(); // Use a distinct variable for async block start
          try {
            // Your existing console.log for ASYNC_PREFETCH_START
            console.log(`[${interaction.customId} ASYNC_PREFETCH_START ${interactionIdForChoice}] Asynchronously pre-fetching weekly settings for ${userTagForChoice}. PerfTime: ${prefetchAsyncStartTime.toFixed(2)}ms.`);
            const settingsResult = await callFirebaseFunction('getWeeklySettings', {}, userIdForChoice);
            if (settingsResult && settingsResult.settings) {
              const existingData = userExperimentSetupData.get(userIdForChoice) || {};
              userExperimentSetupData.set(userIdForChoice, { ...existingData, weeklySettings: settingsResult.settings });
              console.log(`[${interaction.customId} ASYNC_PREFETCH_SUCCESS ${interactionIdForChoice}] Successfully pre-fetched and cached weekly settings for ${userTagForChoice}.`);
            } else {
              console.log(`[${interaction.customId} ASYNC_PREFETCH_NO_DATA ${interactionIdForChoice}] No weekly settings found or returned for ${userTagForChoice} during async pre-fetch.`);
              const existingData = userExperimentSetupData.get(userIdForChoice) || {};
              delete existingData.weeklySettings;
              userExperimentSetupData.set(userIdForChoice, existingData);
            }
          } catch (fetchError) {
            console.error(`[${interaction.customId} ASYNC_PREFETCH_ERROR ${interactionIdForChoice}] Error pre-fetching weekly settings asynchronously for ${userTagForChoice}:`, fetchError.message);
            const existingData = userExperimentSetupData.get(userIdForChoice) || {};
            delete existingData.weeklySettings;
            userExperimentSetupData.set(userIdForChoice, existingData);
          } finally {
            const prefetchAsyncEndTime = performance.now();
            console.log(`[${interaction.customId} ASYNC_PREFETCH_DURATION ${interactionIdForChoice}] Async pre-fetching settings took: ${(prefetchAsyncEndTime - prefetchAsyncStartTime).toFixed(2)}ms for ${userTagForChoice}.`);
          }
        })();

      } catch (error) { // This catches errors from deferUpdate or the first editReply
        const handlerErrorPerfNow = performance.now();
        // MODIFIED/ENHANCED ERROR LOG
        console.error(`[${interaction.customId} HANDLER_ERROR ${interactionIdForChoice}] Error in main try block for ${userTagForChoice}. PerfTime: ${handlerErrorPerfNow.toFixed(2)}ms. DeltaFromHandlerEntry: ${(handlerErrorPerfNow - handlerEntryPerfNow).toFixed(2)}ms. Error:`, error);
        try {
            // Check if we can still attempt to edit the reply (e.g. if defer succeeded but initial edit failed)
            // or if we need to use followup (if defer failed, we generally can't recover the original interaction response)
            if (interaction.deferred && !interaction.replied) { // deferred should be true if deferUpdate succeeded
                 await interaction.editReply({
                    content: `❌ Oops! Something went wrong when trying to show setup options. (Error Code: ${error.code || 'N/A'}) Please try clicking "🔬 Set/Update Experiment" again.`,
                    embeds: [],
                    components: []
                });
            } else if (!interaction.replied && !interaction.deferred) { // Fallback if not even deferred
                 await interaction.reply({ // This will likely fail too if the token is truly gone for 3s+
                    content: `❌ Oops! A problem occurred very early processing this action. Please try again. (Code: ${error.code || 'N/A'})`,
                    flags: MessageFlags.Ephemeral
                 });
            }
            // If interaction.replied is true, we can't do much more here.
        } catch (fallbackError) {
            console.error(`[${interaction.customId} FALLBACK_REPLY_ERROR ${interactionIdForChoice}] Fallback error reply failed for ${userTagForChoice}:`, fallbackError);
        }
      }
      const handlerEndPerfNow = performance.now();
      // NEW LOGGING: Handler End
      console.log(`[${interaction.customId} HANDLER_END ${interactionIdForChoice}] User: ${userTagForChoice}. PerfTime: ${handlerEndPerfNow.toFixed(2)}ms. TotalInHandler: ${(handlerEndPerfNow - handlerEntryPerfNow).toFixed(2)}ms.`);
    }

    else if (interaction.customId === MANUAL_SETUP_BTN_ID) {
          const manualSetupStartTime = performance.now();
          const userIdForManual = interaction.user.id;
          const userTagForManual = interaction.user.tag;
          const interactionId = interaction.id; // Use interaction.id for logging consistency
          console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userTagForManual}. Attempting to show comma format info. Time: ${manualSetupStartTime.toFixed(2)}ms`);

          try {
            // Defer the update to acknowledge the button click quickly
            await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
            const deferTime = performance.now();
            console.log(`[${interaction.customId} DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - manualSetupStartTime).toFixed(2)}ms`);

            // --- Build the Informational Embed ---
            const commaFormatEmbed = new EmbedBuilder()
                .setColor('#FFD700') // Gold color for information
                .setTitle('Reminder: Use Commas ( , )')
                .setDescription(
                    "**🎯 Daily Outcome Format:**\n" +
                    "`Goal #, Unit, Label`\n" +
                    "Write all 3, separated by **commas.**\n\n" +
                    "**🛠️ Daily Habits Format:**\n" +
                    "`Goal #, Unit, Label`\n" +
                    "Write all 3, separated by **commas.**\n\n" +
                    "**Goal #** must be a number (decimals are okay, e.g., 7.5).\n" +
                    "**Label** is your descriptive name for the metric/habit.\n" +
                    "**Unit** is the thing you're counting or measuring."
                );

            // --- Create a "Continue to Form" button ---
            const continueToManualFormButton = new ButtonBuilder()
                .setCustomId('continue_to_manual_form_btn') // NEW Custom ID for the next step
                .setLabel('✍️ Continue to Setup Form')
                .setStyle(ButtonStyle.Success);

            const rowForContinue = new ActionRowBuilder().addComponents(continueToManualFormButton);

            // --- Edit the reply to show the embed and the new button ---
            await interaction.editReply({
                content: "Please review these formatting guidelines for the setup form.",
                embeds: [commaFormatEmbed],
                components: [rowForContinue]
            });
            const editReplyTime = performance.now();
            console.log(`[${interaction.customId} INFO_EMBED_SHOWN ${interactionId}] Comma format info embed shown to ${userTagForManual}. Took: ${(editReplyTime - deferTime).toFixed(2)}ms`);

            // --- Asynchronously Pre-fetch Weekly Settings --- [cite: 1478]
            (async () => {
              const prefetchAsyncStartTime = performance.now();
              try {
                console.log(`[${interaction.customId} ASYNC_PREFETCH_START ${interactionId}] Asynchronously pre-fetching weekly settings for ${userTagForManual}. PerfTime: ${prefetchAsyncStartTime.toFixed(2)}ms.`);
                // Ensure callFirebaseFunction is accessible here
                const settingsResult = await callFirebaseFunction('getWeeklySettings', {}, userIdForManual); // [cite: 1479]
                const existingData = userExperimentSetupData.get(userIdForManual) || {}; // Get existing data or initialize if not present

                if (settingsResult && settingsResult.settings) { // [cite: 1479]
                  userExperimentSetupData.set(userIdForManual, { ...existingData, weeklySettings: settingsResult.settings, interactionId: interactionId }); // Store settings and interactionId
                  console.log(`[${interaction.customId} ASYNC_PREFETCH_SUCCESS ${interactionId}] Successfully pre-fetched and cached weekly settings for ${userTagForManual}.`);
                } else {
                  console.log(`[${interaction.customId} ASYNC_PREFETCH_NO_DATA ${interactionId}] No weekly settings found or returned for ${userTagForManual} during async pre-fetch.`);
                  // If no settings, ensure weeklySettings is not present or is null in the map for this user
                  delete existingData.weeklySettings;
                  userExperimentSetupData.set(userIdForManual, { ...existingData, interactionId: interactionId }); // Still store interactionId
                }
              } catch (fetchError) {
                console.error(`[${interaction.customId} ASYNC_PREFETCH_ERROR ${interactionId}] Error pre-fetching weekly settings asynchronously for ${userTagForManual}:`, fetchError.message);
                const existingData = userExperimentSetupData.get(userIdForManual) || {};
                delete existingData.weeklySettings; // Remove potentially stale/incomplete data on error
                userExperimentSetupData.set(userIdForManual, { ...existingData, interactionId: interactionId }); // Store interactionId even on error
              } finally {
                const prefetchAsyncEndTime = performance.now();
                console.log(`[${interaction.customId} ASYNC_PREFETCH_DURATION ${interactionId}] Async pre-fetching settings took: ${(prefetchAsyncEndTime - prefetchAsyncStartTime).toFixed(2)}ms for ${userTagForManual}.`);
              }
            })();
            // --- End Asynchronous Pre-fetch ---

          } catch (error) {
            const errorTime = performance.now();
            console.error(`[${interaction.customId} ERROR ${interactionId}] Error showing comma format info for ${userTagForManual} at ${errorTime.toFixed(2)}ms:`, error);
            if (interaction.deferred || interaction.replied) {
                try {
                    await interaction.editReply({ content: "Sorry, I couldn't display the formatting guide. Please try clicking 'Manual Setup' again.", embeds: [], components: [] });
                } catch (replyError) {
                    console.error(`[${interaction.customId} FALLBACK_REPLY_ERROR ${interactionId}] Fallback error reply failed:`, replyError);
                }
            }
          }
          const handlerEndPerfNow = performance.now();
          console.log(`[${interaction.customId} END ${interactionId}] User: ${userTagForManual}. TotalInHandler: ${(handlerEndPerfNow - manualSetupStartTime).toFixed(2)}ms.`);
        } // End of MANUAL_SETUP_BTN_ID handler

        // --- Handler for "Continue to Setup Form" Button ---
    else if (interaction.customId === 'continue_to_manual_form_btn') {
      const continueButtonStartTime = performance.now();
      const userId = interaction.user.id;
      const userTag = interaction.user.tag;
      const interactionId = interaction.id;
      console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userTag}. Attempting to show manual experiment setup modal. Time: ${continueButtonStartTime.toFixed(2)}ms`);

      // Retrieve pre-fetched data
      const setupData = userExperimentSetupData.get(userId);
      const cachedSettings = setupData?.weeklySettings;
      const originalInteractionId = setupData?.interactionId; // Get the ID of the interaction that initiated this flow

      console.log(`[${interaction.customId} CACHE_CHECK ${interactionId}] Checking for cached settings for ${userTag}. Original Interaction ID for this flow: ${originalInteractionId}`);

      let deeperProblemValue = "";
      let outputValue = "";
      let input1Value = "";
      let input2Value = "";
      let input3Value = "";

      if (cachedSettings) {
        console.log(`[${interaction.customId} CACHE_HIT ${interactionId}] Found cached settings for ${userTag}. Populating modal fields.`);
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
        console.log(`[${interaction.customId} CACHE_MISS ${interactionId}] No cached settings found for ${userTag}. Modal will use placeholders.`);
      }

      try {
        const modal = new ModalBuilder()
          .setCustomId('experiment_setup_modal') // This is your EXISTING modal ID
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
        console.log(`[${interaction.customId} MODAL_SHOWN ${interactionId}] Manual setup modal shown to ${userTag}. Pre-population with cached data (if any) complete. Took: ${(showModalTime - continueButtonStartTime).toFixed(2)}ms`);

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[${interaction.customId} ERROR ${interactionId}] Error showing manual setup modal for ${userTag} at ${errorTime.toFixed(2)}ms:`, error);
        // Log detailed error information as you did in the original MANUAL_SETUP_BTN_ID handler's error block
        console.error(`[${interaction.customId} ERROR_DETAILS ${interactionId}] Error Name: ${error.name}, Message: ${error.message}, Code: ${error.code}`);
        if (error.stack) {
          console.error(`[${interaction.customId} ERROR_STACK ${interactionId}] Error Stack: ${error.stack}`);
        }
        // Attempt an ephemeral reply if possible.
        // Since `showModal` is the first reply attempt in this handler, if it fails,
        // we can try a direct `reply` (though it might also fail if the interaction token is too old).
        // `deferUpdate` is not typically used before `showModal` in a button handler that directly shows a modal.
        if (!interaction.replied && !interaction.deferred) { // Check if we haven't replied or deferred
            try {
                await interaction.reply({content: "Sorry, I couldn't open the manual setup form at this moment. Please try clicking 'Continue to Setup Form' again.", flags: MessageFlags.Ephemeral});
            } catch (replyError) {
                 console.error(`[${interaction.customId} FALLBACK_REPLY_ERROR ${interactionId}] Fallback error reply failed:`, replyError);
            }
        } else {
             // If somehow already replied/deferred (less likely for a direct modal display from button)
             try {
                await interaction.followUp({content: "Sorry, I couldn't open the manual setup form. Please try clicking 'Continue to Setup Form' again.", flags: MessageFlags.Ephemeral});
            } catch (followUpError) {
                 console.error(`[${interaction.customId} FALLBACK_FOLLOWUP_ERROR ${interactionId}] Fallback error followup failed:`, followUpError);
            }
        }
      }
      const handlerEndPerfNow = performance.now();
      console.log(`[${interaction.customId} END ${interactionId}] User: ${userTag}. TotalInHandler: ${(handlerEndPerfNow - continueButtonStartTime).toFixed(2)}ms.`);
    } // End of 'continue_to_manual_form_btn' handler

    // --- (render/index.js) ---
    // Inside the 'if (interaction.isButton())' block, after the MANUAL_SETUP_BTN_ID handler:

    else if (interaction.customId === AI_ASSISTED_SETUP_BTN_ID) {
      // DIAGNOSTIC LOG - VERY FIRST LINE in this handler
      console.log(`[${AI_ASSISTED_SETUP_BTN_ID} ENTERED_HANDLER ${interaction.id}] Handler entered for user ${interaction.user.tag}.`);

      const aiSetupStartTime = performance.now();
      const userId = interaction.user.id;
      const userTag = interaction.user.tag;
      console.log(`[${interaction.customId} START ${interaction.id}] Clicked by ${userTag}. Initiating AI Assisted setup. Time: ${aiSetupStartTime.toFixed(2)}ms`);

      try {
        await interaction.update({
            content: "🤖 Roger that! I'll slide into your DMs to start the AI Wish-to-Experiment Guide. Check your messages!",
            embeds: [],
            components: []
        });
        const updateTime = performance.now();
        console.log(`[${interaction.customId} UPDATED_REPLY ${interaction.id}] Acknowledged button for ${userTag}. Took: ${(updateTime - aiSetupStartTime).toFixed(2)}ms`);

        userExperimentSetupData.set(userId, {
            dmFlowState: 'awaiting_wish',
            wish: null,
            aiGeneratedExamples: null,
            deeperProblem: null,
            outcomeLabel: null,
            outcomeUnit: null,
            outcomeGoal: null,
            currentActionIndex: 0,
            actions: [],
            guildId: interaction.guild.id,
            interactionId: interaction.id
        });
        console.log(`[${interaction.customId} STATE_INIT ${interaction.id}] Initialized DM flow state for ${userTag}: awaiting_wish.`);

        const dmChannel = await interaction.user.createDM();
        await dmChannel.send({
            content: "Welcome to the Wish-to-Experiment Guide! ✨\n\nThe biggest changes start with a simple wish.\n\nWhat's **1 thing** you wish was different in your daily life right now?\n\n**Examples:**\n● 'I wish I had more energy'\n● 'I wish I was less stressed'\n● 'I wish I has better relationships'\n\nType your wish below!\n\n(You'll be able to review and edit everything at the end. Type 'cancel' any time to stop this setup)."
        });
        const dmSentTime = performance.now();
        console.log(`[${interaction.customId} DM_SENT ${interaction.id}] Sent 'awaiting_wish' DM to ${userTag}. Took: ${(dmSentTime - updateTime).toFixed(2)}ms`);

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[${interaction.customId} ERROR ${interaction.id}] Error initiating AI assisted setup for ${userTag} at ${errorTime.toFixed(2)}ms:`, error);
        if (error.code === 50007) {
             console.error(`[${interaction.customId} DM_FAIL ${interaction.id}] Cannot send DMs to ${userTag}. They may have DMs disabled.`);
             try {
                await interaction.followUp({ // followUp as update() might have succeeded but DM failed
                    content: "⚠️ I couldn't send you a DM. Please ensure your DMs are enabled for this server if you'd like to use the AI Assisted setup.",
                    flags: MessageFlags.Ephemeral
                });
             } catch (followUpError) {
                console.error(`[${interaction.customId} FOLLOWUP_FAIL ${interaction.id}] Failed to send DM failure followup:`, followUpError);
             }
        } else if (interaction.replied || interaction.deferred) { // If update failed
            try {
                await interaction.editReply({
                    content: "❌ An error occurred trying to start the AI assisted setup. Please try again.",
                    embeds: [], components: []
                });
            } catch (editErr) { console.error(`[${interaction.customId} EDIT_REPLY_ERROR_FALLBACK ${interaction.id}]`, editErr); }
        }
        userExperimentSetupData.delete(userId);
      }
      // No processEndTime log here as main interaction ends with DM, further steps are new interactions/messages.
    } 
    

    else if (interaction.isButton() && interaction.customId === 'add_another_habit_yes_btn') {
      const yesAddHabitClickTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;

      console.log(`[add_another_habit_yes_btn START ${interactionId}] Clicked by ${userTagForLog}.`);
      try {
        await interaction.deferUpdate({ flags: MessageFlags.Ephemeral }); // Keep ephemeral if original was
        const deferTime = performance.now();
        console.log(`[add_another_habit_yes_btn DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - yesAddHabitClickTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || setupData.dmFlowState !== 'awaiting_add_another_habit_choice') {
          console.warn(`[add_another_habit_yes_btn WARN ${interactionId}] User ${userTagForLog} in unexpected state: ${setupData?.dmFlowState || 'no setupData'}.`);
          await interaction.editReply({ content: "There was a mix-up with the steps. Please try restarting the experiment setup with `/go`.", components: [], embeds: [] });
          return;
        }

        if (!setupData.inputs) setupData.inputs = []; // Should exist from Input 1 definition
        const currentNumberOfInputs = setupData.inputs.filter(Boolean).length; // Count actual defined inputs

        if (currentNumberOfInputs >= 3) {
          console.log(`[add_another_habit_yes_btn MAX_INPUTS ${interactionId}] User ${userTagForLog} tried to add more than 3 inputs.`);
          await interaction.editReply({
            content: "You've already defined the maximum of 3 daily habits. Let's proceed to finalize your experiment setup by clicking '✅ No More Habits, Finish Setup' if it was previously shown, or I'll guide you next to save.",
            components: [] // Remove Yes/No buttons
          });
          // This scenario should ideally be handled by the 'No' button or a direct finalization step.
          // For now, the user is informed. If they were previously shown "No, Finish Setup", they should click that.
          // Otherwise, the flow might get stuck here if 'No' button isn't clicked.
          // A robust solution would transition them to the saving step programmatically.
          // For now, this message guides them if the 'No' button is present from a previous message.
          return;
        }

        setupData.currentInputIndex = currentNumberOfInputs + 1;
        const nextInputNumber = setupData.currentInputIndex;
        const ordinal = nextInputNumber === 2 ? "second" : "third";

        setupData.dmFlowState = `processing_input${nextInputNumber}_label_suggestions`;
        userExperimentSetupData.set(userId, setupData); // Save state before async

        await interaction.editReply({ // Edit the reply from the "Add another habit?" Yes/No buttons
            content: `Great! Let's define your **${ordinal} Daily Habit / Input**.\n\n🧠 I'll brainstorm some potential Daily Habit Labels for you.\n\nThis might take a moment...`,
            components: [], // Remove the Yes/No buttons
            embeds: []
        });
        console.log(`[add_another_habit_yes_btn PROCESS_INPUT${nextInputNumber}_LABELS_START ${interactionId}] State changed to '${setupData.dmFlowState}'. Attempting to get Input ${nextInputNumber} label suggestions for ${userTagForLog}.`);

        // Prepare context for AI: previously defined inputs
        const definedInputsForAI = setupData.inputs.filter(Boolean).map(input => ({ // Filter out potential null/undefined slots
            label: input.label,
            unit: input.unit,
            goal: input.goal
        }));

        try {
            const habitSuggestionsResult = await callFirebaseFunction(
              'generateInputLabelSuggestions',
              {
                userWish: setupData.deeperWish,
                outcomeMetric: {
                  label: setupData.outcomeLabel,
                  unit: setupData.outcomeUnit,
                  goal: setupData.outcomeGoal
                },
                definedInputs: definedInputsForAI // Pass previously defined habits
              },
              userId
            );

            if (habitSuggestionsResult && habitSuggestionsResult.success && habitSuggestionsResult.suggestions && habitSuggestionsResult.suggestions.length > 0) {
              setupData.aiGeneratedInputLabelSuggestions = habitSuggestionsResult.suggestions;
              setupData.dmFlowState = `awaiting_input${nextInputNumber}_label_dropdown_selection`;
              userExperimentSetupData.set(userId, setupData);
              console.log(`[add_another_habit_yes_btn INPUT${nextInputNumber}_LABEL_SUGGESTIONS_SUCCESS ${interactionId}] Received ${habitSuggestionsResult.suggestions.length} habit label suggestions for Input ${nextInputNumber}.`);

              const habitLabelSelectMenu = new StringSelectMenuBuilder()
                .setCustomId(`ai_input${nextInputNumber}_label_select`) // Dynamic Custom ID
                .setPlaceholder(`Select a Label for Habit ${nextInputNumber} or enter your own.`);

              habitSuggestionsResult.suggestions.forEach((suggestion, index) => {
                habitLabelSelectMenu.addOptions(
                  new StringSelectMenuOptionBuilder()
                    .setLabel(suggestion.label.substring(0, 100))
                    .setValue(`ai_input${nextInputNumber}_label_suggestion_${index}`) // Dynamic value
                    .setDescription((suggestion.briefExplanation || 'AI Suggested Habit').substring(0, 100))
                );
              });
              habitLabelSelectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                  .setLabel(`✏️ Enter my own custom label for Habit ${nextInputNumber}...`)
                  .setValue(`custom_input${nextInputNumber}_label`) // Dynamic value
                  .setDescription("Choose this to type your own habit label.")
              );
              const rowWithHabitLabelSelect = new ActionRowBuilder().addComponents(habitLabelSelectMenu);
              
              // Send a new message in DM for the dropdown
              await interaction.user.send({
                content: `Okay, here are some ideas for your **${ordinal} Daily Habit Label**.\n\nChoose "✏️ Enter my own..." to tweak anything or type a different one.`,
                components: [rowWithHabitLabelSelect]
              });
              console.log(`[add_another_habit_yes_btn INPUT${nextInputNumber}_LABEL_DROPDOWN_SENT ${interactionId}] Displayed AI habit label suggestions dropdown to ${userTagForLog} for Input ${nextInputNumber} via new DM. State: ${setupData.dmFlowState}.`);

            } else {
              let failureMessage = `I had a bit of trouble brainstorming suggestions for your ${ordinal} Habit Label. 😕`;
              if (habitSuggestionsResult && habitSuggestionsResult.error) {
                failureMessage += ` (Reason: ${habitSuggestionsResult.error})`;
              }
              console.warn(`[add_another_habit_yes_btn INPUT${nextInputNumber}_LABEL_SUGGESTIONS_FAIL ${interactionId}] AI call failed for Input ${nextInputNumber} labels. Result:`, habitSuggestionsResult);
              
              setupData.dmFlowState = `awaiting_input${nextInputNumber}_label_text`; // Fallback
              userExperimentSetupData.set(userId, setupData);
              
              await interaction.user.send( // Send new message for fallback
                `${failureMessage}\n\nNo worries! What **Label** would you like to give your ${ordinal} Daily Habit? (max 30 characters).`
              );
              console.log(`[add_another_habit_yes_btn INPUT${nextInputNumber}_LABEL_FALLBACK_PROMPT_SENT ${interactionId}] Prompted ${userTagForLog} for Input ${nextInputNumber} Label text (AI fail). State: ${setupData.dmFlowState}.`);
            }
        } catch (error) {
            console.error(`[add_another_habit_yes_btn FIREBASE_FUNC_ERROR_INPUT_LABELS ${interactionId}] Error calling 'generateInputLabelSuggestions' for Input ${nextInputNumber} for ${userTagForLog}:`, error);
            setupData.dmFlowState = `awaiting_input${nextInputNumber}_label_text`; // Fallback
            userExperimentSetupData.set(userId, setupData);
            await interaction.user.send( // Send new message for error
                `I encountered an issue connecting with my AI brain for habit suggestions for your ${ordinal} habit. \n\nLet's set it up manually: ` +
                `What **Label** would you like to give it? (max 30 characters).`
            );
            console.log(`[add_another_habit_yes_btn INPUT${nextInputNumber}_LABEL_ERROR_FALLBACK_PROMPT_SENT ${interactionId}] Prompted ${userTagForLog} for Input ${nextInputNumber} Label text (Firebase error). State: ${setupData.dmFlowState}.`);
        }

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[add_another_habit_yes_btn ERROR ${interactionId}] Error processing button for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error);
        if (interaction.deferred || interaction.replied) {
          try {
            // Since we've already replied/updated, a followup is safer if an error occurs later.
            await interaction.followUp({ content: `❌ An error occurred. Please try clicking the button again or restart with \`/go\`.`, ephemeral: true });
          } catch (followUpError) {
            console.error(`[add_another_habit_yes_btn FALLBACK_ERROR ${interactionId}] Fallback error reply failed for ${userTagForLog}:`, followUpError);
          }
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

      console.log(`[add_another_habit_no_btn START ${interactionId}] Clicked by ${userTagForLog}. Preparing to show confirm/edit options.`);
      try {
        await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
        const deferTime = performance.now();
        console.log(`[add_another_habit_no_btn DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - noAddHabitClickTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || !setupData.deeperProblem || !setupData.outcomeLabel || !setupData.inputs || setupData.inputs.length === 0) {
          console.warn(`[add_another_habit_no_btn WARN ${interactionId}] User ${userTagForLog} had incomplete setupData to confirm. State: ${setupData?.dmFlowState}`);
          await interaction.editReply({ content: "It seems some core experiment details are missing. Please try restarting the setup with `/go`.", components: [], embeds: [] });
          return;
        }

        // Transition to a new state indicating we're ready for confirmation or edit
        setupData.dmFlowState = 'awaiting_metrics_confirmation';
        userExperimentSetupData.set(userId, setupData);

        // --- Build the summary embed ---
        let summaryDescription = `**🎯 Deeper Goal / Problem / Theme:**\n${setupData.deeperProblem}\n\n` +
                                 `**📊 Daily Outcome to Track:**\n\`${setupData.outcomeGoal}, ${setupData.outcomeUnit}, ${setupData.outcomeLabel}\`\n\n` +
                                 `**🛠️ Daily Habits to Track:**\n`;
        
        setupData.inputs.forEach((input, index) => {
            if (input && input.label && input.unit && input.goal !== undefined) {
                summaryDescription += `${index + 1}. \`${input.goal}, ${input.unit}, ${input.label}\`\n`;
            }
        });

        const confirmEmbed = new EmbedBuilder()
            .setColor('#FFBF00') // Amber color
            .setTitle('🔬 Review Your Experiment Metrics')
            .setDescription(summaryDescription + "\n\nPlease review your settings. Do they look correct?")
            .setFooter({ text: "You can edit these before setting duration."});

        const confirmButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_metrics_proceed_btn')
                    .setLabel('✅ Looks Good, Set Duration')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('request_edit_metrics_modal_btn')
                    .setLabel('✏️ Edit Metrics/Goal')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.editReply({
            content: "Here's a summary of your experiment's Deeper Goal and daily metrics:",
            embeds: [confirmEmbed],
            components: [confirmButtons]
        });
        console.log(`[add_another_habit_no_btn CONFIRM_EDIT_PROMPT_SENT ${interactionId}] Showed confirm/edit prompt to ${userTagForLog}. State: ${setupData.dmFlowState}.`);

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[add_another_habit_no_btn ERROR ${interactionId}] Error at ${errorTime.toFixed(2)}ms:`, error);
        if (interaction.deferred && !interaction.replied) {
          try {
            await interaction.editReply({ content: `❌ An error occurred while preparing the review step: ${error.message || 'Please try again.'}`, components: [], embeds: [] });
          } catch (editError) {
            console.error(`[add_another_habit_no_btn FALLBACK_ERROR ${interactionId}] Fallback error reply failed:`, editError);
          }
        } else if (!interaction.replied && !interaction.deferred) { // Should not happen if deferUpdate succeeded
            try { await interaction.reply({ content: `❌ An unexpected error occurred: ${error.message || 'Please try again.'}`, flags: MessageFlags.Ephemeral }); }
            catch (e) { console.error(`[add_another_habit_no_btn ERROR_REPLY_FAIL ${interactionId}]`, e); }
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

          const durationEmbed = new EmbedBuilder()
              .setColor('#47d264')
              .setTitle('🔬 Experiment Metrics Confirmed & Saved!')
              .setDescription(`Your Deeper Goal and daily metrics have been saved.\n\nNext, let's set your **experiment duration**. This determines when your first comprehensive stats report will be delivered.`)
              .setFooter({text: "Select how long this experiment phase should last."})
              .setTimestamp();

          const durationSelect = new StringSelectMenuBuilder()
              .setCustomId('experiment_duration_select') // Existing handler for this ID
              .setPlaceholder('See your first big stats report in...')
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
            .setTitle('✏️ Editing Your Experiment Metrics')
            .setDescription(
                "You're about to edit your Deeper Goal and daily metrics.\n\n" +
                "**IMPORTANT FORMATTING:**\n" +
                "The form will load with your current settings. If you make changes, please ensure each **Outcome** and **Habit** follows this exact format:\n" +
                "`Goal #, Unit, Label` (e.g., `7.5, hours, Sleep Quality` or `1, yes/no, Meditate`)\n\n" +
                "Use **commas** to separate the Goal, Unit, and Label. Leave optional habits blank if you don't want to use them.\n\n" +
                "Click the button below when you're ready to open the edit form."
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

    else if (interaction.customId === 'log_daily_progress_btn') {
      const logButtonStartTime = performance.now();
      console.log(`[log_daily_progress_btn] Button clicked by User: ${interaction.user.tag}, InteractionID: ${interaction.id}`);
      try {
          // Logic copied from the old /log command handler

          const fetchSettingsStartTime = performance.now();
          console.log(`[log_daily_progress_btn] Fetching weekly settings for User: ${interaction.user.id}`);
          const settingsResult = await callFirebaseFunction('getWeeklySettings', {}, interaction.user.id);
          const fetchSettingsTime = performance.now();
          console.log(`[log_daily_progress_btn] getWeeklySettings call took: ${(fetchSettingsTime - fetchSettingsStartTime).toFixed(2)}ms.`);

          if ((fetchSettingsTime - logButtonStartTime) > 2800) {
              console.warn(`[log_daily_progress_btn] Fetching settings took >2.8s for User ${interaction.user.tag}. Interaction likely expired.`);
              try {
                   await interaction.followUp({ content: "🚦 Sorry, we tripped while getting your settings. Please click 'Log Daily Data' again.", flags: MessageFlags.Ephemeral });
              } catch (followUpError) {
                 console.error('[log_daily_progress_btn] Failed to send timeout follow-up message:', followUpError);
              }
              return;
          }

          if (!settingsResult || !settingsResult.settings) {
            await interaction.update({
              content: "🤔 You haven't set up your weekly experiment yet. Please use the 'Set Experiment' button first from the `/go` hub.",
              embeds: [], // Clear any previous embed
              components: []
            });
            return;
          }
          const settings = settingsResult.settings;
          const outputConfigured = settings.output && settings.output.label && settings.output.label.trim() !== "";
          const input1Configured = settings.input1 && settings.input1.label && settings.input1.label.trim() !== "";
          if (!outputConfigured || !input1Configured) {
            await interaction.update({
              content: "📝 Your experiment setup is incomplete (Daily Outcome & Habit 1 required). Please use 'Set Experiment' from the `/go` hub to set them.",
              embeds: [], // Clear any previous embed
              components: []
            });
            return;
          }

          console.log(`[log_daily_progress_btn] Building modal for user ${interaction.user.id}.`);
          const modal = new ModalBuilder()
            .setCustomId('dailyLogModal_firebase')
            .setTitle(`📝 Fuel Your Experiment`);
          const components = [];

          components.push(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('log_output_value')
                .setLabel(`${settings.output.label} ${settings.output.unit}`)
                .setPlaceholder(`Goal: ${settings.output.goal}`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );
          components.push(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('log_input1_value')
                .setLabel(`${settings.input1.label} ${settings.input1.unit}`)
                .setPlaceholder(`Goal: ${settings.input1.goal}`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );
          if (settings.input2 && settings.input2.label && settings.input2.label.trim() !== "") {
            components.push(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('log_input2_value')
                  .setLabel(`${settings.input2.label} ${settings.input2.unit}`)
                  .setPlaceholder(`Goal: ${settings.input2.goal}`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
              )
             );
          }
          if (settings.input3 && settings.input3.label && settings.input3.label.trim() !== "") {
            components.push(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('log_input3_value')
                  .setLabel(`${settings.input3.label} ${settings.input3.unit}`)
                  .setPlaceholder(`Goal: ${settings.input3.goal}`)
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
               )
            );
          }
 
        // 1. Define the notesInput TextInputBuilder *without* the placeholder initially
        const notesInput = new TextInputBuilder()
          .setCustomId('log_notes')
          .setLabel('💭 Experiment / Life) Notes')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        // 2. Logic to define the finalPlaceholder string
        const userDeeperWish = settings.deeperProblem; // Get the user's deeper wish from settings
        let finalPlaceholder;

        if (userDeeperWish) {
          const questionPrefix = "What happened that affected your goal? → ";
          // Calculate remaining length for the wish.
          // Aim for a total placeholder length of ~90-95 characters.
          // The prefix "What happened that affected your goal? → " is 39 characters.
          // So, let's allocate about 55 characters for the truncated wish.
          const maxWishDisplayLength = 55; 

          const truncatedWish = userDeeperWish.length > maxWishDisplayLength
            ? userDeeperWish.substring(0, maxWishDisplayLength) + "..." // Add ellipsis if truncated
            : userDeeperWish;
          finalPlaceholder = questionPrefix + truncatedWish;
        } else {
          // Fallback if settings.deeperProblem is somehow not set or empty
          finalPlaceholder = 'What did you observe? Any questions or insights?'; 
        }

        // 3. Set the dynamically created placeholder on notesInput
        notesInput.setPlaceholder(finalPlaceholder);

        // 4. Add the configured notesInput (now with the placeholder) to an ActionRowBuilder 
        //    and then push it to your components array
        components.push(
          new ActionRowBuilder().addComponents(notesInput)
        );

          modal.addComponents(components.slice(0, 5));
          await interaction.showModal(modal);
          const showModalTime = performance.now();
          console.log(`[log_daily_progress_btn] showModal called successfully at ${showModalTime.toFixed(2)}ms. Total time: ${(showModalTime - logButtonStartTime).toFixed(2)}ms`);

      } catch (error) {
          console.error(`[log_daily_progress_btn] Error for User ${interaction.user.tag}, InteractionID: ${interaction.id}:`, error);
           if (!interaction.replied && !interaction.deferred && !interaction.responded) {
                let userErrorMessage = '❌ An error occurred while preparing your log form. Please try again.';
                if (error.message && (error.message.includes('Firebase Error') || error.message.includes('authentication failed'))) {
                      userErrorMessage = `❌ Error fetching settings: ${error.message}`;
                }
                try {
                    await interaction.reply({ content: userErrorMessage, flags: MessageFlags.Ephemeral });
                } catch (replyError) { console.error('[log_daily_progress_btn] Failed to send error reply:', replyError); }
           } else {
                try {
                     await interaction.followUp({ content: '❌ An error occurred after initiating the log process. Please try clicking the button again.', flags: MessageFlags.Ephemeral });
                 } catch (followUpError) { console.error('[log_daily_progress_btn] Failed to send error follow-up:', followUpError); }
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

        // (MVP Focus): Insights for "This Experiment" (the parsed experimentId).
        // (Future Enhancement Placeholder: This is where logic for a dropdown would go,
        // allowing users to select "This Experiment," "Past 2 Experiments," etc. For MVP, proceed directly.)

        console.log(`[get_ai_insights_btn_ FIREBASE_CALL ${interactionId}] Calling 'fetchOrGenerateAiInsights' for experiment ${experimentId}, user ${userId}.`);
        const result = await callFirebaseFunction(
            'fetchOrGenerateAiInsights', // New Firebase Function name
            { targetExperimentId: experimentId }, // Pass targetExperimentId
            userId // Pass the interacting user's ID for authentication
        );
        const firebaseCallEndTime = performance.now();
        console.log(`[get_ai_insights_btn_ FIREBASE_RETURN ${interactionId}] 'fetchOrGenerateAiInsights' returned for exp ${experimentId}. Took: ${(firebaseCallEndTime - deferTime).toFixed(2)}ms. Result:`, result);

        if (result && result.success) {
            // Display insight (simple text DM and edit ephemeral reply)
            // The message includes a placeholder for the source (cached/generated)
            // Note: Discord does not render <span class="math-inline"> in DMs. Markdown is preferred.
            // Using a simpler source indication.
            await interaction.user.send(`💡 **AI Insights**\n\n${result.insightsText}`);
            await interaction.editReply({ content: "✅ AI Insights have been sent to your DMs!", components: [] });
            console.log(`[get_ai_insights_btn_ SUCCESS ${interactionId}] AI Insights sent to DMs for experiment ${experimentId}, user ${userId}.`);
        } else {
            console.error(`[get_ai_insights_btn_ FIREBASE_FAIL ${interactionId}] 'fetchOrGenerateAiInsights' failed for exp ${experimentId}. Result:`, result);
            await interaction.editReply({ content: `❌ Failed to get AI insights: ${result ? result.message : 'Unknown error.'}`, components: [] });
        }

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[get_ai_insights_btn_ CATCH_ERROR ${interactionId}] Error processing AI insights for exp ${experimentId}, user ${userId} at ${errorTime.toFixed(2)}ms:`, error);
        // Ensure a reply if not already done
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
    // Make sure to add this 'else if' block before any final 'else' or default catch-all for unrecognized interactions.

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
        .setDescription('Please select your **current local time** to get reminders accurately.')
        .setFooter({ text: 'Make selections for your current time below, then click Next.' });

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
          .setDescription(`Your current time is noted as approximately **${reconstructedTime}**. Now, set your **daily reminder window** (when reminders are allowed) and their **frequency**.\nThen click "Confirm All".`)
          .addFields(
            { name: 'Reminder Window (e.g., 9 AM - 5 PM)', value: 'Reminders will only be sent between these hours in your local time.', inline: false },
            { name: 'Frequency', value: 'How often you receive reminders within that window.', inline: false }
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
        if (scheduleResult && scheduleResult.success && scheduleResult.experimentId) { // Check for experimentId
          const experimentId = scheduleResult.experimentId; // Capture experimentId
          setupData.experimentId = experimentId; // Store it in setupData if needed by showPostToGroupPrompt
          userExperimentSetupData.set(userId, setupData); // Update map

          console.log(`[${interaction.customId} FIREBASE_SUCCESS ${interactionId}] setExperimentSchedule successful for ${userId}. Experiment ID: ${experimentId}.`);
          const reminderSummary = setupData.reminderFrequency === 'none'
              ? "No reminders set (this is unexpected here)."
              // Make sure formatHourForDisplay, startHour24, and endHour24 are defined in this scope
              // or passed appropriately if this specific snippet is taken verbatim.
              // For context, in my previous full response, formatHourForDisplay was defined
              // within the CONFIRM_REMINDER_BTN_ID handler before this block.
              // If they are not, this line will cause an error.
              : `Reminders set for ${setupData.reminderFrequency.replace(/_/g, ' ')} between ${formatHourForDisplay(startHour24)} - ${formatHourForDisplay(endHour24)} (your local time approx, based on current time provided).`;

          await showPostToGroupPrompt(interaction, setupData, reminderSummary, experimentSetupMotivationalMessages);
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
        // Proceed to "Post to group?" prompt
        await showPostToGroupPrompt(interaction, setupData, "Reminders skipped as per your choice.", experimentSetupMotivationalMessages);
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
      await interaction.deferUpdate(); // Acknowledge button
      const userId = interaction.user.id;
      const setupData = userExperimentSetupData.get(userId);

      // Add guildId to the condition check
      if (!setupData || !setupData.settingsMessage || !setupData.rawPayload || !setupData.guildId || !setupData.experimentDuration) {
          await interaction.editReply({ content: "⚠️ Error: Could not retrieve complete experiment details or original server context to post. Your settings are saved.", components: [] });
          userExperimentSetupData.delete(userId); // Cleanup
          return;
      }

      const experimentsChannelId = '1364283719296483329'; // Your hardcoded channel ID
      let targetGuild;

      try {
          targetGuild = await client.guilds.fetch(setupData.guildId); // Fetch guild using stored ID
      } catch (guildFetchError) {
          console.error(`[post_exp_final_yes] Error fetching guild ${setupData.guildId}:`, guildFetchError);
          await interaction.editReply({ content: "⚠️ Error: Could not find the original server to post to. Your settings are saved.", components: [] });
          userExperimentSetupData.delete(userId); // Cleanup
          return;
      }

      const channel = targetGuild.channels.cache.get(experimentsChannelId);
      // For more robustness, consider: const channel = await targetGuild.channels.fetch(experimentsChannelId).catch(() => null);


      if (channel && channel.isTextBased()) {
          try {
              const { deeperProblem, outputSetting, inputSettings } = setupData.rawPayload; // [cite: 2262]
              const postEmbed = new EmbedBuilder()
                  .setColor('#7289DA') // Blue
                  .setTitle(`🚀 ${interaction.user.username} is starting a new experiment!`) // interaction.user.username is fine from DM
                  .setDescription(`**🎯 Deeper Goal / Problem / Theme:**\n${deeperProblem}`)
                  .addFields(
                      { name: '📊 Daily Outcome to Track', value: outputSetting || "Not specified" },
                      { name: '🛠️ Habit 1', value: inputSettings[0] || "Not specified" }
                  )
                  .setFooter({ text: `Let's support them! Duration: ${setupData.experimentDuration.replace('_', ' ')}` })
                  .setTimestamp();

              if (inputSettings[1]) { // [cite: 2266]
                  postEmbed.addFields({ name: '🛠️ Habit 2', value: inputSettings[1], inline: true });
              }
              if (inputSettings[2]) { // [cite: 2267]
                  postEmbed.addFields({ name: '🛠️ Habit 3', value: inputSettings[2], inline: true });
              }

              await channel.send({ embeds: [postEmbed] });
              await interaction.editReply({ content: `✅ Shared to the #experiments channel in ${targetGuild.name}!`, components: [] }); // [cite: 2269]
          } catch (postError) {
              console.error(`[post_exp_final_yes] Error posting to channel ${experimentsChannelId}:`, postError); // [cite: 2270]
              await interaction.editReply({ content: "⚠️ Could not post to the #experiments channel. Please check my permissions there. Your settings are saved.", components: [] }); // [cite: 2271]
          }
      } else {
          await interaction.editReply({ content: `⚠️ Could not find the #experiments channel in ${targetGuild.name}. Your settings are saved.`, components: [] }); // [cite: 2272]
      }
      userExperimentSetupData.delete(userId); // Clean up [cite: 2273]
  }
   
   else if (interaction.isButton() && interaction.customId === 'post_exp_final_no') {
      await interaction.update({
          content: "👍 Got it! Your experiment is all set and kept private. Good luck!",
          components: []
      });
      userExperimentSetupData.delete(interaction.user.id); // Clean up
  }


  } // End of "if (interaction.isButton())" block

  else if (interaction.isStringSelectMenu()) {

    // [render index with AI set exp.txt]
    if (interaction.isStringSelectMenu() && interaction.customId === 'ai_outcome_label_select') {
      const selectMenuSubmitTime = performance.now(); 
      const interactionId = interaction.id; 
      const userId = interaction.user.id; 
      const userTagForLog = interaction.user.tag; 

      console.log(`[ai_outcome_label_select START ${interactionId}] Received selection from ${userTagForLog}.`); 
      try { 
        await interaction.deferUpdate(); 
        const deferTime = performance.now(); 
        console.log(`[ai_outcome_label_select DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - selectMenuSubmitTime).toFixed(2)}ms`); 

        const setupData = userExperimentSetupData.get(userId); 
        if (!setupData || setupData.dmFlowState !== 'awaiting_outcome_label_dropdown_selection') { 
          console.warn(`[ai_outcome_label_select WARN ${interactionId}] User ${userTagForLog} in unexpected state: ${setupData?.dmFlowState || 'no setupData'}. Current interaction customId: ${interaction.customId}`); 
          await interaction.followUp({ content: "It seems there was a mix-up with our current step, or your session expired. Please try starting the AI setup again with the `/go` command if you see this message repeatedly.", ephemeral: true }); 
          return; 
        }

        const selectedValue = interaction.values[0]; 
        let outcomeLabel = ""; 
        // let outcomeLabelSuggestedUnitType = ""; // No longer needed to be passed to AI for units

        if (selectedValue === 'custom_outcome_label') { 
          console.log(`[ai_outcome_label_select CUSTOM_PATH ${interactionId}] User ${userTagForLog} selected 'Enter my own custom label'.`); 
          setupData.dmFlowState = 'awaiting_custom_outcome_label_text'; // New state 
          userExperimentSetupData.set(userId, setupData); 
          try { 
            await interaction.editReply({ 
              content: `Ok, please type your custom label below (max 30 characters, e.g., "Optimism Score", "Faith in myself," "Productivity Level").`, 
              components: [] // Remove the select menu 
            }); 
          } catch (editError) { 
            console.warn(`[ai_outcome_label_select EDIT_REPLY_FAIL ${interactionId}] Failed to edit original message for custom path. Sending new DM. Error: ${editError.message}`); 
            await interaction.user.send("Okay, please type your custom Outcome Metric Label below\n\nExamples:\n● \"Optimism Score\"\n● \"Faith in myself\"\n● \"Productivity Level\"\n\n(max length = 30 characters)."); 
          } 
          console.log(`[ai_outcome_label_select CUSTOM_PROMPT_SENT ${interactionId}] Prompted ${userTagForLog} for custom label text. State: ${setupData.dmFlowState}.`); 
          return; // Wait for user's text message 

        } else if (selectedValue.startsWith('ai_suggestion_')) { 
          const suggestionIndex = parseInt(selectedValue.split('ai_suggestion_')[1], 10); 
          if (setupData.aiGeneratedOutcomeLabelSuggestions && suggestionIndex >= 0 && suggestionIndex < setupData.aiGeneratedOutcomeLabelSuggestions.length) { 
            const chosenSuggestion = setupData.aiGeneratedOutcomeLabelSuggestions[suggestionIndex]; 
            outcomeLabel = chosenSuggestion.label; 
            // outcomeLabelSuggestedUnitType = chosenSuggestion.suggestedUnitType; // We don't need to store or use this anymore for AI unit gen
          } else { 
            console.error(`[ai_outcome_label_select ERROR ${interactionId}] Invalid AI suggestion index or suggestions not found for ${userTagForLog}. Selected value: ${selectedValue}`); 
            await interaction.followUp({ content: "Sorry, I couldn't process that selection. Please try choosing again or restarting the setup.", ephemeral: true }); 
            return; 
          }
          // If an AI suggestion was chosen and processed:
          setupData.outcomeLabel = outcomeLabel; 
          // delete setupData.outcomeLabelSuggestedUnitType; // Clean up if it was previously set
          userExperimentSetupData.set(userId, setupData); 

          console.log(`[ai_outcome_label_select AI_SUGGESTION_CONFIRMED ${interactionId}] User ${userTagForLog} selected Outcome Label: "${outcomeLabel}". Proceeding to ask for custom unit.`); 
          
          // ***** START: MODIFIED SECTION - ASK FOR CUSTOM UNIT TEXT DIRECTLY *****
          setupData.dmFlowState = 'awaiting_custom_outcome_unit_text'; // Transition to the state for typing the unit
          userExperimentSetupData.set(userId, setupData);

          const unitPromptMessage = `Great! Your **Outcome Label** = "${setupData.outcomeLabel}".\n\nNow we need the "scale" or "units" to measure it by\n\nHere are some ideas to get you started.\n\nFeel free to use these for inspiration, and type in your answer below!\n\n● 0-10 rating\n● % progress\n● # of occurrences`;
          
          try {
            await interaction.editReply({ // Edit the DM message that had the label dropdown
              content: unitPromptMessage,
              components: [] // Remove the label select menu
            });
          } catch (editError) {
            console.warn(`[ai_outcome_label_select EDIT_REPLY_FAIL_ASK_UNIT ${interactionId}] Failed to edit original message to ask for unit. Sending new DM. Error: ${editError.message}`);
            await interaction.user.send(unitPromptMessage);
          }
          console.log(`[ai_outcome_label_select CUSTOM_UNIT_PROMPT_SENT ${interactionId}] Prompted ${userTagForLog} for custom outcome unit text. State: ${setupData.dmFlowState}.`);
          // ***** END: MODIFIED SECTION *****
          
        } else { 
          console.error(`[ai_outcome_label_select ERROR ${interactionId}] Unknown selection value: ${selectedValue} for user ${userTagForLog}.`); 
          await interaction.followUp({ content: "Sorry, an unexpected error occurred with your selection. Please try again.", ephemeral: true }); 
          return; 
        }
      } catch (error) { 
        const errorTime = performance.now(); 
        console.error(`[ai_outcome_label_select ERROR ${interactionId}] Error processing select menu for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error); 
        if (!interaction.replied && !interaction.deferred) { 
            try { await interaction.reply({ content: "Sorry, something went wrong with that selection. Please try again.", ephemeral: true }); 
            } 
            catch (e) { console.error(`[ai_outcome_label_select ERROR_REPLY_FAIL ${interactionId}]`, e); 
            } 
        } else if (!interaction.replied) { 
            try { await interaction.editReply({ content: "Sorry, something went wrong processing your choice. You might need to try selecting again.", components: [] }); 
            } 
            catch (e) { console.error(`[ai_outcome_label_select ERROR_EDITREPLY_FAIL ${interactionId}]`, e); 
            } 
        } else { 
            // If an error occurs after a followUp, further followUps might be complex. 
        } 
      } 
      const processEndTime = performance.now(); 
      console.log(`[ai_outcome_label_select END ${interactionId}] Finished processing. Total time: ${(processEndTime - selectMenuSubmitTime).toFixed(2)}ms`); 
    }

    else if (interaction.isStringSelectMenu() && interaction.customId === 'ai_input1_label_select') {
      const input1LabelSelectSubmitTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;

      console.log(`[ai_input1_label_select START ${interactionId}] Received Input 1 HABIT LABEL selection from ${userTagForLog}.`);
      try {
        await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
        const deferTime = performance.now();
        console.log(`[ai_input1_label_select DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - input1LabelSelectSubmitTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || setupData.dmFlowState !== 'awaiting_input1_label_dropdown_selection') {
          console.warn(`[ai_input1_label_select WARN ${interactionId}] User ${userTagForLog} in unexpected state: ${setupData?.dmFlowState || 'no setupData'}. Current customId: ${interaction.customId}`);
          await interaction.followUp({ content: "It seems there was a mix-up with selecting your first habit's label. Please try restarting the experiment setup with `/go`.", ephemeral: true });
          return;
        }

        const selectedValue = interaction.values[0];
        let chosenHabitLabel = "";

        if (selectedValue === 'custom_input1_label') {
          console.log(`[ai_input1_label_select CUSTOM_PATH ${interactionId}] User ${userTagForLog} selected 'Enter my own custom habit label' for Input 1.`);
          setupData.dmFlowState = 'awaiting_input1_label_text'; // Fallback to existing state for manual text input
          userExperimentSetupData.set(userId, setupData);

          const customLabelPrompt = `Please type the label for your habit (or life priority) below (max 30 characters, e.g., " Journaling", "Mindful Walk", "Exercise").`;
          try {
            await interaction.editReply({
              content: customLabelPrompt,
              components: [] // Remove the select menu
            });
          } catch (editError) {
            console.warn(`[ai_input1_label_select EDIT_REPLY_FAIL_CUSTOM ${interactionId}] Failed to edit message for custom label path. Sending new DM. Error: ${editError.message}`);
            await interaction.user.send(customLabelPrompt);
          }
          console.log(`[ai_input1_label_select CUSTOM_LABEL_PROMPT_SENT ${interactionId}] Prompted ${userTagForLog} for custom Input 1 label text. State: ${setupData.dmFlowState}.`);
          return; // Wait for user's text message, which will be handled by MessageCreate

        } else if (selectedValue.startsWith('ai_input1_label_suggestion_')) {
          const suggestionIndex = parseInt(selectedValue.split('ai_input1_label_suggestion_')[1], 10);
          if (setupData.aiGeneratedInputLabelSuggestions && suggestionIndex >= 0 && suggestionIndex < setupData.aiGeneratedInputLabelSuggestions.length) {
            chosenHabitLabel = setupData.aiGeneratedInputLabelSuggestions[suggestionIndex].label;
            console.log(`[ai_input1_label_select AI_LABEL_CHOSEN ${interactionId}] User ${userTagForLog} selected AI habit label for Input 1: "${chosenHabitLabel}".`);
          } else {
            console.error(`[ai_input1_label_select ERROR ${interactionId}] Invalid AI habit label suggestion index or suggestions not found for ${userTagForLog}. Selected value: ${selectedValue}`);
            await interaction.followUp({ content: "Sorry, I couldn't process that habit label selection. Please try choosing again or restarting.", ephemeral: true });
            return;
          }
        } else {
          console.error(`[ai_input1_label_select ERROR ${interactionId}] Unknown habit label selection value: ${selectedValue} for ${userTagForLog}.`);
          await interaction.followUp({ content: "Sorry, an unexpected error occurred with your habit label selection. Please try again.", ephemeral: true });
          return;
        }

        // AI-suggested habit label was chosen and is valid
        setupData.currentInputDefinition = { label: chosenHabitLabel };
        delete setupData.aiGeneratedInputLabelSuggestions; // Clean up suggestions for labels as it's now chosen
        // ***** MODIFICATION START: Directly ask for unit text, no AI for unit *****
        setupData.dmFlowState = 'awaiting_input1_custom_unit_text'; // State for user to type the unit
        userExperimentSetupData.set(userId, setupData);

        const unitPromptMessage = `Chosen habit: "**${chosenHabitLabel}**".\n\nHow are you measuring this? What scale, or what units?\n(e.g., "minutes", "reps", "1-5 satisfaction", "yes/no", max 15 chars for the unit itself)`;
        
        // Edit the interaction reply first (ephemeral confirmation)
        await interaction.editReply({ 
            content: `Okay, habit 1 is "**${chosenHabitLabel}**". Check your DMs to specify how you'll measure it.`,
            components: [] // Remove the label select menu
        });
        // Send the actual prompt as a new DM
        await interaction.user.send(unitPromptMessage);
        console.log(`[ai_input1_label_select CUSTOM_UNIT_PROMPT_SENT ${interactionId}] Confirmed Input 1 Label for ${userTagForLog}. Prompted for custom unit text via DM. State: ${setupData.dmFlowState}.`);
        // ***** MODIFICATION END *****

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[ai_input1_label_select ERROR ${interactionId}] Error processing Input 1 HABIT LABEL select menu for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error);
        if (interaction.deferred && !interaction.replied) { 
            try { await interaction.editReply({ content: "Sorry, something went wrong processing your habit label choice. You might need to try selecting again.", components: [] }); }
            catch (e) { console.error(`[ai_input1_label_select ERROR_EDITREPLY_FAIL ${interactionId}]`, e); }
        } else { 
            try { await interaction.followUp({ content: "Sorry, an error occurred after your selection. Please try again if needed.", ephemeral: true }); }
            catch (e) { console.error(`[ai_input1_label_select ERROR_FOLLOWUP_FAIL ${interactionId}]`, e); }
        }
      }
      const processEndTime = performance.now();
      console.log(`[ai_input1_label_select END ${interactionId}] Finished processing. Total time: ${(processEndTime - input1LabelSelectSubmitTime).toFixed(2)}ms`);
    }

    else if (interaction.isStringSelectMenu() && interaction.customId === 'ai_input2_label_select') {
      const input2LabelSelectSubmitTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;

      console.log(`[ai_input2_label_select START ${interactionId}] Received Input 2 HABIT LABEL selection from ${userTagForLog}.`);
      try {
        await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
        const deferTime = performance.now();
        console.log(`[ai_input2_label_select DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - input2LabelSelectSubmitTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        // Ensure correct state for Input 2 label selection
        if (!setupData || setupData.dmFlowState !== 'awaiting_input2_label_dropdown_selection' || setupData.currentInputIndex !== 2) {
          console.warn(`[ai_input2_label_select WARN ${interactionId}] User ${userTagForLog} in unexpected state: ${setupData?.dmFlowState || 'no setupData'}, Index: ${setupData?.currentInputIndex}. Current customId: ${interaction.customId}`);
          await interaction.followUp({ content: "It seems there was a mix-up with selecting your second habit's label. Please try restarting the experiment setup with `/go`.", ephemeral: true });
          return;
        }

        const selectedValue = interaction.values[0];
        let chosenHabitLabel = "";

        if (selectedValue === 'custom_input2_label') {
          console.log(`[ai_input2_label_select CUSTOM_PATH ${interactionId}] User ${userTagForLog} selected 'Enter my own custom habit label' for Input 2.`);
          setupData.dmFlowState = 'awaiting_input2_label_text'; // Fallback to existing state for manual text input
          userExperimentSetupData.set(userId, setupData);

          const customLabelPrompt = `Please type the label for your habit (or life priority) below\n\n(e.g., " Journaling", "Mindful Walk", "Exercise").\n\nMax 30 characters`;
          try {
            // Since this interaction is from a DM, editReply might fail if the original message is too old or not the last one.
            // Sending a new message is safer.
            await interaction.user.send(customLabelPrompt);
            await interaction.editReply({ content: "Okay, please type your custom label for the second habit in our DM.", components: []}); // Ephemeral confirmation
          } catch (sendError) {
            console.warn(`[ai_input2_label_select SEND_FAIL_CUSTOM ${interactionId}] Failed to send DM for custom label path. Error: ${sendError.message}`);
             // Try to update the interaction if possible
            await interaction.editReply({ content: "Okay, please type your custom label for the second habit in our DM. (If you don't see the prompt, check our DMs).", components: []}).catch(e => console.error("EditReply also failed", e));
          }
          console.log(`[ai_input2_label_select CUSTOM_LABEL_PROMPT_SENT ${interactionId}] Prompted ${userTagForLog} for custom Input 2 label text. State: ${setupData.dmFlowState}.`);
          return; // Wait for user's text message

        } else if (selectedValue.startsWith('ai_input2_label_suggestion_')) {
          const suggestionIndex = parseInt(selectedValue.split('ai_input2_label_suggestion_')[1], 10);
          if (setupData.aiGeneratedInputLabelSuggestions && suggestionIndex >= 0 && suggestionIndex < setupData.aiGeneratedInputLabelSuggestions.length) {
            chosenHabitLabel = setupData.aiGeneratedInputLabelSuggestions[suggestionIndex].label;
            console.log(`[ai_input2_label_select AI_LABEL_CHOSEN ${interactionId}] User ${userTagForLog} selected AI habit label for Input 2: "${chosenHabitLabel}".`);
          } else {
            console.error(`[ai_input2_label_select ERROR ${interactionId}] Invalid AI habit label suggestion index or suggestions not found for ${userTagForLog} (Input 2). Selected value: ${selectedValue}`);
            await interaction.followUp({ content: "Sorry, I couldn't process that habit label selection for your second habit. Please try choosing again or restarting.", ephemeral: true });
            return;
          }
        } else {
          console.error(`[ai_input2_label_select ERROR ${interactionId}] Unknown habit label selection value for Input 2: ${selectedValue} for ${userTagForLog}.`);
          await interaction.followUp({ content: "Sorry, an unexpected error occurred with your second habit label selection. Please try again.", ephemeral: true });
          return;
        }

        // AI-suggested habit label was chosen and is valid
        setupData.currentInputDefinition = { label: chosenHabitLabel }; // currentInputDefinition now holds Input 2's label
        delete setupData.aiGeneratedInputLabelSuggestions; 
        // ***** MODIFICATION START: Directly ask for unit text for Input 2 *****
        setupData.dmFlowState = 'awaiting_input2_custom_unit_text'; // State for user to type the unit for Input 2
        userExperimentSetupData.set(userId, setupData);

        const unitPromptMessage = `Chosen habit 2: "**${chosenHabitLabel}**".\n\nHow are you measuring this? What scale, or what units?\n(e.g., "sessions", "yes/no", "pages read", max 15 chars for the unit itself)`;
        
        await interaction.editReply({ 
            content: `Okay, habit 2 is "**${chosenHabitLabel}**". Check your DMs to specify how you'll measure it.`,
            components: [] 
        });
        await interaction.user.send(unitPromptMessage); // Send the actual prompt as a new DM
        console.log(`[ai_input2_label_select CUSTOM_UNIT_PROMPT_SENT ${interactionId}] Confirmed Input 2 Label for ${userTagForLog}. Prompted for custom unit text via DM. State: ${setupData.dmFlowState}.`);
        // ***** MODIFICATION END *****

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[ai_input2_label_select ERROR ${interactionId}] Error processing Input 2 HABIT LABEL select menu for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error);
        if (interaction.deferred && !interaction.replied) {
            try { await interaction.editReply({ content: "Sorry, something went wrong processing your second habit label choice. You might need to try selecting again or restart the setup.", components: [] }); }
            catch (e) { console.error(`[ai_input2_label_select ERROR_EDITREPLY_FAIL ${interactionId}]`, e); }
        } else {
             try { await interaction.followUp({ content: "Sorry, an error occurred after your selection for the second habit. Please try again if needed.", ephemeral: true }); }
            catch (e) { console.error(`[ai_input2_label_select ERROR_FOLLOWUP_FAIL ${interactionId}]`, e); }
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
        await interaction.deferUpdate({ flags: MessageFlags.Ephemeral });
        const deferTime = performance.now();
        console.log(`[ai_input3_label_select DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - input3LabelSelectSubmitTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        // Ensure correct state for Input 3 label selection
        if (!setupData || setupData.dmFlowState !== 'awaiting_input3_label_dropdown_selection' || setupData.currentInputIndex !== 3) {
          console.warn(`[ai_input3_label_select WARN ${interactionId}] User ${userTagForLog} in unexpected state: ${setupData?.dmFlowState || 'no setupData'}, Index: ${setupData?.currentInputIndex}. Current customId: ${interaction.customId}`);
          await interaction.followUp({ content: "It seems there was a mix-up with selecting your third habit's label. Please try restarting the experiment setup with `/go`.", ephemeral: true });
          return;
        }

        const selectedValue = interaction.values[0];
        let chosenHabitLabel = "";

        if (selectedValue === 'custom_input3_label') {
          console.log(`[ai_input3_label_select CUSTOM_PATH ${interactionId}] User ${userTagForLog} selected 'Enter my own custom habit label' for Input 3.`);
          setupData.dmFlowState = 'awaiting_input3_label_text'; // Fallback to existing state for manual text input
          userExperimentSetupData.set(userId, setupData);

          const customLabelPrompt = `You chose to enter your own custom label for your third Daily Habit.\n\nPlease type your custom label in a new message below (max 30 characters).`;
          try {
            await interaction.user.send(customLabelPrompt); // Send new DM
            await interaction.editReply({ content: "Okay, please type your custom label for the third habit in our DM.", components: []}); // Ephemeral confirmation
          } catch (sendError) {
            console.warn(`[ai_input3_label_select SEND_FAIL_CUSTOM ${interactionId}] Failed to send DM for custom label path. Error: ${sendError.message}`);
            await interaction.editReply({ content: "Okay, please type your custom label for the third habit in our DM. (If you don't see the prompt, check our DMs).", components: []}).catch(e => console.error("EditReply also failed for Input 3 custom", e));
          }
          console.log(`[ai_input3_label_select CUSTOM_LABEL_PROMPT_SENT ${interactionId}] Prompted ${userTagForLog} for custom Input 3 label text. State: ${setupData.dmFlowState}.`);
          return; // Wait for user's text message

        } else if (selectedValue.startsWith('ai_input3_label_suggestion_')) {
          const suggestionIndex = parseInt(selectedValue.split('ai_input3_label_suggestion_')[1], 10);
          if (setupData.aiGeneratedInputLabelSuggestions && suggestionIndex >= 0 && suggestionIndex < setupData.aiGeneratedInputLabelSuggestions.length) {
            chosenHabitLabel = setupData.aiGeneratedInputLabelSuggestions[suggestionIndex].label;
            console.log(`[ai_input3_label_select AI_LABEL_CHOSEN ${interactionId}] User ${userTagForLog} selected AI habit label for Input 3: "${chosenHabitLabel}".`);
          } else {
            console.error(`[ai_input3_label_select ERROR ${interactionId}] Invalid AI habit label suggestion index or suggestions not found for ${userTagForLog} (Input 3). Selected value: ${selectedValue}`);
            await interaction.followUp({ content: "Sorry, I couldn't process that habit label selection for your third habit. Please try choosing again or restarting.", ephemeral: true });
            return;
          }
        } else {
          console.error(`[ai_input3_label_select ERROR ${interactionId}] Unknown habit label selection value for Input 3: ${selectedValue} for ${userTagForLog}.`);
          await interaction.followUp({ content: "Sorry, an unexpected error occurred with your third habit label selection. Please try again.", ephemeral: true });
          return;
        }

        // AI-suggested habit label was chosen and is valid
        setupData.currentInputDefinition = { label: chosenHabitLabel }; // currentInputDefinition now holds Input 3's label
        delete setupData.aiGeneratedInputLabelSuggestions;
        // ***** MODIFICATION START: Directly ask for unit text for Input 3 *****
        setupData.dmFlowState = 'awaiting_input3_custom_unit_text'; // State for user to type the unit for Input 3
        userExperimentSetupData.set(userId, setupData);

        const unitPromptMessage = `Chosen habit 3: "**${chosenHabitLabel}**".\n\nHow are you measuring this? What scale, or what units?\n(e.g., "completed", "rating 1-5", "checkmarks", max 15 chars for the unit itself)`;
        
        await interaction.editReply({ 
            content: `Okay, habit 3 is "**${chosenHabitLabel}**". Check your DMs to specify how you'll measure it.`,
            components: [] 
        });
        await interaction.user.send(unitPromptMessage); // Send the actual prompt as a new DM
        console.log(`[ai_input3_label_select CUSTOM_UNIT_PROMPT_SENT ${interactionId}] Confirmed Input 3 Label for ${userTagForLog}. Prompted for custom unit text via DM. State: ${setupData.dmFlowState}.`);
        // ***** MODIFICATION END *****

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[ai_input3_label_select ERROR ${interactionId}] Error processing Input 3 HABIT LABEL select menu for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error);
        if (interaction.deferred && !interaction.replied) {
            try { await interaction.editReply({ content: "Sorry, something went wrong processing your third habit label choice. You might need to try selecting again or restart the setup.", components: [] }); }
            catch (e) { console.error(`[ai_input3_label_select ERROR_EDITREPLY_FAIL ${interactionId}]`, e); }
        } else {
             try { await interaction.followUp({ content: "Sorry, an error occurred after your selection for the third habit. Please try again if needed.", ephemeral: true }); }
            catch (e) { console.error(`[ai_input3_label_select ERROR_FOLLOWUP_FAIL ${interactionId}]`, e); }
        }
      }
      const processEndTime = performance.now();
      console.log(`[ai_input3_label_select END ${interactionId}] Finished processing. Total time: ${(processEndTime - input3LabelSelectSubmitTime).toFixed(2)}ms`);
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
    if (interaction.isModalSubmit() && interaction.customId === 'dailyLogModal_firebase') {

      const modalSubmitStartTime = performance.now();
      console.log(`[dailyLogModal_firebase] Submission received by User: ${interaction.user.tag}, InteractionID: ${interaction.id}`);
      let userData = null; // To store fetched user data for final message/actions
      let actionErrors = []; // Keep track of errors during actions

      try {
        // 1. Defer Reply
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const deferTime = performance.now();
        console.log(`[dailyLogModal_firebase] Deferral took: ${(deferTime - modalSubmitStartTime).toFixed(2)}ms`);

        // 2. Extract Submitted Values
        const outputValue = interaction.fields.getTextInputValue('log_output_value')?.trim();
        const input1Value = interaction.fields.getTextInputValue('log_input1_value')?.trim();
        let input2Value = "";
        try { input2Value = interaction.fields.getTextInputValue('log_input2_value')?.trim(); } catch { /* Field likely didn't exist */ }
        let input3Value = "";
        try { input3Value = interaction.fields.getTextInputValue('log_input3_value')?.trim(); } catch { /* Field likely didn't exist */ }
        const notes = interaction.fields.getTextInputValue('log_notes')?.trim();

        // 3. Basic Validation (Client-side check)
        if (!outputValue || !input1Value || !notes) {
            await interaction.editReply({ content: "❌ Missing required fields (Outcome, Habit 1, or Notes)." });
            return;
        }
        // Add specific validation for numeric inputs if desired, though Firebase function also validates
        if (isNaN(parseFloat(outputValue))) {
            await interaction.editReply({ content: `❌ Value for Outcome must be a number. You entered: "${outputValue}"` });
            return;
        }
        if (isNaN(parseFloat(input1Value))) {
            await interaction.editReply({ content: `❌ Value for Input 1 must be a number. You entered: "${input1Value}"` });
            return;
        }
        if (input2Value && isNaN(parseFloat(input2Value))) {
            await interaction.editReply({ content: `❌ Value for Input 2 must be a number if provided. You entered: "${input2Value}"` });
            return;
        }
        if (input3Value && isNaN(parseFloat(input3Value))) {
            await interaction.editReply({ content: `❌ Value for Input 3 must be a number if provided. You entered: "${input3Value}"` });
            return;
        }


        // 4. Structure Payload for Firebase 'submitLog' (HTTP) Function
        const payload = {
        outputValue,
        inputValues: [input1Value, input2Value || "", input3Value || ""],
        notes,
        userTag: interaction.user.tag // <<< Add this line
        };
        console.log('[dailyLogModal_firebase] Payload for submitLog (HTTP):', payload); // This log will now show the userTag
        
        console.log('[dailyLogModal_firebase] Payload for submitLog (HTTP):', payload);

        const fbCallStartTime = performance.now();
        console.log(`[dailyLogModal_firebase] Calling submitLog (HTTP) for User: ${interaction.user.id}...`);

        let submitResult;
        let httpResponseOk = false;
        try {
            await authenticateFirebaseUser(interaction.user.id);
            const currentUser = firebaseAuth.currentUser;
            if (!currentUser) {
                throw new Error("Bot client could not get current Firebase user after auth. Cannot get ID token.");
            }
            const idToken = await getIdToken(currentUser);
            const submitLogHttpUrl = "https://us-central1-self-science-bot.cloudfunctions.net/submitLog"; // Ensure this is your correct URL

            const apiResponse = await fetch(submitLogHttpUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify(payload)
            });
            httpResponseOk = apiResponse.ok;
            submitResult = await apiResponse.json();
        } catch (fetchError) {
            console.error('[dailyLogModal_firebase] Fetch error calling submitLog (HTTP):', fetchError);
            submitResult = { success: false, error: `Network or parsing error calling log service: ${fetchError.message}`, code: 'fetch-error' };
            httpResponseOk = false;
        }

        const fbCallEndTime = performance.now();
        console.log(`[dailyLogModal_firebase] submitLog (HTTP) call took: ${(fbCallEndTime - fbCallStartTime).toFixed(2)}ms. Ok: ${httpResponseOk}, Result:`, submitResult);

        if (!httpResponseOk || !submitResult || submitResult.success !== true) {
            const errorMessage = submitResult?.error || (httpResponseOk ? 'Log service returned failure.' : `Failed to reach log service (Status: ${submitResult?.status || 'N/A'}).`); // submitResult might not have status
            const errorCode = submitResult?.code || (httpResponseOk ? 'service-failure' : 'network-failure');
            console.error(`[dailyLogModal_firebase] submitLog (HTTP) indicated failure. Code: ${errorCode}, Message: ${errorMessage}`, submitResult);
            await interaction.editReply({ content: `❌ Error saving log: ${errorMessage}` });
            return;
        }

        // Log successfully saved, now fetch updated user data
        console.log(`[dailyLogModal_firebase] Log ${submitResult.logId} saved. Fetching user data for bot...`);

        // >>>>> START: TEMPORARY DELAY FOR TESTING PUBLIC MESSAGE TIMING <<<<<
        console.log('[dailyLogModal_firebase] Introducing TEMPORARY 3-second delay before fetching user data...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait for 3 seconds
        console.log('[dailyLogModal_firebase] TEMPORARY delay finished.');
        // >>>>> END: TEMPORARY DELAY FOR TESTING PUBLIC MESSAGE TIMING <<<<<

        const fetchUserDataStartTime = performance.now();
        const userDataResult = await callFirebaseFunction('getUserDataForBot', {}, interaction.user.id);
        const fetchUserDataEndTime = performance.now();
        console.log(`[dailyLogModal_firebase] getUserDataForBot call took: ${(fetchUserDataEndTime - fetchUserDataStartTime).toFixed(2)}ms.`);

        if (!userDataResult || userDataResult.success !== true || !userDataResult.userData) {
          console.error('[dailyLogModal_firebase] Failed to fetch user data after log submission:', userDataResult);
          await interaction.editReply({ content: `✅ Log saved (ID: ${submitResult.logId})! However, there was an issue fetching updated streak/role info. It should update shortly.` });
          return;
        }
        userData = userDataResult.userData;
        console.log('[dailyLogModal_firebase] Fetched User Data:', JSON.stringify(userData, null, 2));

        const guild = interaction.guild;
        const member = interaction.member || await guild?.members.fetch(interaction.user.id).catch(err => {
            console.error(`[dailyLogModal_firebase] Failed to fetch member ${interaction.user.id}:`, err);
            return null;
        });

        // --- Process Pending Actions ---
        // This section is where all pending actions (DMs, Roles, Public Messages) are handled.

        // 7a. Pending DM Message
        if (userData.pendingDmMessage && typeof userData.pendingDmMessage === 'string' && userData.pendingDmMessage.trim() !== "") {
          console.log(`[dailyLogModal_firebase] Sending pending DM to ${interaction.user.tag}: "${userData.pendingDmMessage}"`);
          try {
            await interaction.user.send(userData.pendingDmMessage);
          } catch (dmError) {
            console.error(`[dailyLogModal_firebase] Failed to send pending DM to ${interaction.user.tag}:`, dmError);
            actionErrors.push("Failed to send DM with streak/milestone updates.");
            if (dmError.code === 50007) {
              actionErrors.push("Note: I couldn't DM you. Please check server privacy settings if you want DMs.");
            }
          }
        }

        // Only proceed with role/public channel messages if guild and member objects are available
        if (guild && member) {
            // 7b. Pending Freeze Role Update
            if (userData.pendingFreezeRoleUpdate && typeof userData.pendingFreezeRoleUpdate === 'string' && userData.pendingFreezeRoleUpdate.trim() !== "") {
              const targetFreezeRoleName = userData.pendingFreezeRoleUpdate;
              console.log(`[dailyLogModal_firebase] Processing freeze role update for ${member.user.tag} to: ${targetFreezeRoleName}`);
              try {
                  const targetRole = await ensureRole(guild, targetFreezeRoleName, '#ADD8E6'); // Light blue
                  const currentFreezeRoles = member.roles.cache.filter(role => role.name.startsWith(FREEZE_ROLE_BASENAME) && role.name !== targetFreezeRoleName);
                  if (currentFreezeRoles.size > 0) {
                      await member.roles.remove(currentFreezeRoles);
                      console.log(`[dailyLogModal_firebase] Removed ${currentFreezeRoles.size} old freeze roles from ${member.user.tag}.`);
                  }
                  if (!member.roles.cache.has(targetRole.id)) {
                      await member.roles.add(targetRole);
                      console.log(`[dailyLogModal_firebase] Added freeze role "${targetFreezeRoleName}" to ${member.user.tag}.`);
                  }
              } catch (freezeRoleError) {
                  console.error(`[dailyLogModal_firebase] Error updating freeze role for ${member.user.tag}:`, freezeRoleError);
                  actionErrors.push(`Failed to update freeze role to ${targetFreezeRoleName}.`);
              }
            }

            // 7c. Pending Role Cleanup / Regular Role Update
            if (userData.pendingRoleCleanup === true || (userData.pendingRoleUpdate && userData.pendingRoleUpdate.name)) {
                console.log(`[dailyLogModal_firebase] Processing role cleanup/update for ${member.user.tag}. Cleanup: ${userData.pendingRoleCleanup}, NewRole: ${userData.pendingRoleUpdate ? userData.pendingRoleUpdate.name : 'None'}`);
                try {
                    let rolesToRemove = [];
                    if (userData.pendingRoleCleanup === true) {
                        member.roles.cache.forEach(role => {
                            if (STREAK_MILESTONE_ROLE_NAMES.includes(role.name) && role.name !== 'Originator') { // Do not remove Originator during cleanup
                                rolesToRemove.push(role);
                            }
                        });
                        if (rolesToRemove.length > 0) {
                          console.log(`[dailyLogModal_firebase] Identified roles to remove for cleanup:`, rolesToRemove.map(r => r.name));
                          await member.roles.remove(rolesToRemove);
                          console.log(`[dailyLogModal_firebase] Performed role cleanup for ${member.user.tag}.`);
                        }
                    }

                    if (userData.pendingRoleUpdate && userData.pendingRoleUpdate.name) {
                        const newRoleInfo = userData.pendingRoleUpdate; // { name, color, days }
                        console.log(`[dailyLogModal_firebase] Assigning new role: ${newRoleInfo.name}`);
                        const newRole = await ensureRole(guild, newRoleInfo.name, newRoleInfo.color);
                        if (!member.roles.cache.has(newRole.id)) {
                          await member.roles.add(newRole);
                          console.log(`[dailyLogModal_firebase] Added role "${newRole.name}" to ${member.user.tag}.`);
                        }
                    }
                } catch (roleError) {
                    console.error(`[dailyLogModal_firebase] Error during role cleanup/update for ${member.user.tag}:`, roleError);
                    actionErrors.push("Failed to update your streak role.");
                }
            }

            // This replaces any old, direct channel.send messages for milestones/extensions.
            if (userData.pendingPublicMessage && typeof userData.pendingPublicMessage === 'string' && userData.pendingPublicMessage.trim() !== "") {
                console.log(`[dailyLogModal_firebase] Attempting to send public message to channel ${interaction.channelId}: "${userData.pendingPublicMessage}"`);
                try {
                    // Send to the channel where the /log command was initiated
                    await interaction.channel.send(userData.pendingPublicMessage);
                    console.log(`[dailyLogModal_firebase] Successfully sent public message for user ${interaction.user.tag}.`);
                } catch (publicMsgError) {
                    console.error(`[dailyLogModal_firebase] Failed to send pending public message for user ${interaction.user.tag}:`, publicMsgError);
                    actionErrors.push("Failed to post public announcement to the channel.");
                }
            } else if (userData.pendingPublicMessage) {
                // Log if we have a message but it's not a sendable string (e.g. null, empty after trim)
                console.log(`[dailyLogModal_firebase] Had a pendingPublicMessage but it was not a valid string to send. Content: "${userData.pendingPublicMessage}"`);
            }

        } else { // End of if (guild && member)
            console.warn(`[dailyLogModal_firebase] Guild or Member object not available for user ${interaction.user.id}. Skipping public messages and role updates.`);
            if (userData.pendingPublicMessage || userData.pendingFreezeRoleUpdate || userData.pendingRoleCleanup || userData.pendingRoleUpdate) {
                actionErrors.push("Could not perform role updates or public announcements (guild/member data unavailable).");
            }
        }

        // 8. Clear Pending Actions in Firebase (CRITICAL: Call this LAST)
        console.log(`[dailyLogModal_firebase] Calling clearPendingUserActions for ${interaction.user.id}...`);
        try {
          await callFirebaseFunction('clearPendingUserActions', {}, interaction.user.id);
          console.log(`[dailyLogModal_firebase] Successfully cleared pending actions for ${interaction.user.id}.`);
        } catch (clearError) {
          console.error(`[dailyLogModal_firebase] FAILED to clear pending actions for ${interaction.user.id}:`, clearError);
          actionErrors.push("Critical: Failed to clear pending server actions (may retry on next log).");
        }

        // 9. Construct Final Ephemeral Confirmation Message
        const randomMessage = inspirationalMessages[Math.floor(Math.random() * inspirationalMessages.length)];
        // Include streak info in the ephemeral confirmation for immediate feedback
        let finalMessage = `✅ Log saved!\n\n${randomMessage}\n\n🔥 Current Streak: ${userData.currentStreak || 0} days\n🧊 Freezes: ${userData.freezesRemaining || 0}`;

        if (actionErrors.length > 0) {
          finalMessage += `\n\n⚠️ **Note:**\n- ${actionErrors.join('\n- ')}`;
        }

        // 10. Edit the Original Deferred Reply with the final ephemeral message
        await interaction.editReply({ content: finalMessage });

        // 11. Send Non-Ephemeral DM with Log Summary (as before)
        let logSummarySettings = null;
        try {
            const settingsResultForDM = await callFirebaseFunction('getWeeklySettings', {}, interaction.user.id);
            if (settingsResultForDM && settingsResultForDM.settings) {
                logSummarySettings = settingsResultForDM.settings;
            }
        } catch (settingsError) {
            console.error('[dailyLogModal_firebase] Error fetching settings for DM summary:', settingsError);
        }
        
        const now = new Date();
        const unixTimestamp = Math.floor(now.getTime() / 1000);
        let dmContent = `**✅ Your Log Summary** (<t:${unixTimestamp}:F>)\n\n`;
        if (logSummarySettings && typeof logSummarySettings === 'object') {
            if (logSummarySettings.deeperProblem) {
                dmContent += `🎯 **Deeper Goal / Problem / Theme:** ${logSummarySettings.deeperProblem}\n\n`;
            }
            const outputLabel = logSummarySettings.output?.label || 'Output';
            const outputUnit = logSummarySettings.output?.unit || '';
            dmContent += `📊 **${outputLabel}**: ${payload.outputValue} ${outputUnit}\n`.trimEnd() + '\n';
            
            const inputSettingsArray = [logSummarySettings.input1, logSummarySettings.input2, logSummarySettings.input3];
            for (let i = 0; i < payload.inputValues.length; i++) {
                const currentInputSetting = inputSettingsArray[i];
                const inputValue = payload.inputValues[i];
                if ((currentInputSetting && currentInputSetting.label && currentInputSetting.label.trim() !== "") || (inputValue && inputValue.trim() !== "")) {
                    const label = currentInputSetting?.label || `Input ${i + 1}`;
                    const unit = currentInputSetting?.unit || '';
                    dmContent += `🛠️ **${label}**: ${inputValue || "*Not logged*"} ${unit}`.trimEnd() + '\n';
                }
            }
        } else {
            dmContent += `Outcome: ${payload.outputValue || '*Not logged*'}\n`;
            dmContent += `Habit 1: ${payload.inputValues[0] || '*Not logged*'}\n`;
            if (payload.inputValues[1]) dmContent += `Habit 2: ${payload.inputValues[1]}\n`;
            if (payload.inputValues[2]) dmContent += `Habit 3: ${payload.inputValues[2]}\n`;
        }
        dmContent += `\n💭 **Notes:**\n${payload.notes || '*No notes*'}`;
        try {
            await interaction.user.send({ content: dmContent });
            console.log(`[dailyLogModal_firebase] Sent log summary DM to ${interaction.user.tag}`);
        } catch (dmError) {
            console.error(`[dailyLogModal_firebase] Failed to send log summary DM to ${interaction.user.tag}:`, dmError);
            if (interaction.channel && dmError.code === 50007) {
                try {
                    await interaction.followUp({ content: "I tried to DM you a copy of your log, but your DMs are closed for this server or with me.", flags: MessageFlags.Ephemeral });
                } catch (followUpError) {
                    console.error('[dailyLogModal_firebase] Failed to send DM failure follow-up:', followUpError);
                }
            }
        }

      } catch (error) { // Catch for the main try block
        const errorTime = performance.now();
        console.error(`[dailyLogModal_firebase] MAIN CATCH BLOCK ERROR for User ${interaction.user.tag} at ${errorTime.toFixed(2)}ms:`, error);
        let userErrorMessage = '❌ An unexpected error occurred while saving or processing your log. Please try again.';
        if (error.message) {
          if (error.message.includes('Firebase Error') || error.message.includes('authentication failed') || error.message.includes('connection not ready')) {
              userErrorMessage = `❌ ${error.message}`;
          } else if (error.message.includes('Please set your weekly goals')) { // This might be from an old error path, Firebase function handles it now
              userErrorMessage = `❌ ${error.message} Use /exp first.`;
          }
        }
        if (interaction.deferred || interaction.replied) { // Check if deferred or already replied (e.g. initial defer was successful)
          try {
            await interaction.editReply({ content: userErrorMessage });
          } catch (editError) { console.error('[dailyLogModal_firebase] Failed to send main error via editReply:', editError); }
        } else { // If not even deferred (e.g. defer failed)
          try { await interaction.reply({ content: userErrorMessage, flags: MessageFlags.Ephemeral }); }
          catch (replyError) { console.error('[dailyLogModal_firebase] Failed to send main error via reply:', replyError); }
        }
      } // End main try-catch block

      const modalProcessEndTime = performance.now();
      console.log(`[experiment_setup_modal END ${interactionId}] Processing finished for User: ${interaction.user.tag}. Total time: ${(modalProcessEndTime - modalSubmitStartTime).toFixed(2)}ms`);
    }
    // --- END OF COMPLETE DAILY LOG MODAL SUBMISSION HANDLER ---

    // +++ NEW MODAL SUBMISSION HANDLER FOR EXPERIMENT SETUP +++
    // --- START: REPLACE THIS SECTION in render index testing1.txt (The 'experiment_setup_modal' handler) ---
    else if (interaction.isModalSubmit() && interaction.customId === 'experiment_setup_modal') {
      const modalSubmitStartTime = performance.now();
      const interactionId = interaction.id; // Keep using interactionId for logs
      console.log(`[experiment_setup_modal START ${interactionId}] Received by User: ${interaction.user.tag}`);
      try {
          // --- Habit 1: Add deferReply ---
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const deferTime = performance.now();
          console.log(`[experiment_setup_modal DEFERRED ${interactionId}] Reply deferred. Took: ${(deferTime - modalSubmitStartTime).toFixed(2)}ms`);
          // --- End Habit 1 ---

          const deeperProblem = interaction.fields.getTextInputValue('deeper_problem')?.trim();
          const outputSettingStr = interaction.fields.getTextInputValue('output_setting')?.trim();
          const input1SettingStr = interaction.fields.getTextInputValue('input1_setting')?.trim();
          const input2SettingStr = interaction.fields.getTextInputValue('input2_setting')?.trim();
          const input3SettingStr = interaction.fields.getTextInputValue('input3_setting')?.trim();
          const getLabel = (settingStr, defaultLabel) => { if (!settingStr) return defaultLabel; const parts = settingStr.split(','); return parts.length > 2 ? parts[2].trim() : defaultLabel; };
          console.log(`[experiment_setup_modal DATA ${interactionId}] Extracted values:`, { deeperProblem, outputSettingStr, input1SettingStr, input2SettingStr, input3SettingStr });

          const payload = { deeperProblem, outputSetting: outputSettingStr, inputSettings: [input1SettingStr, input2SettingStr || "", input3SettingStr || ""], userTag: interaction.user.tag };

          const fbCallStartTime = performance.now();
          console.log(`[experiment_setup_modal FIREBASE_CALL ${interactionId}] Calling updateWeeklySettings...`);
          const result = await callFirebaseFunction('updateWeeklySettings', payload, interaction.user.id);
          const fbCallEndTime = performance.now();
          console.log(`[experiment_setup_modal FIREBASE_RETURN ${interactionId}] updateWeeklySettings call took: ${(fbCallEndTime - fbCallStartTime).toFixed(2)}ms.`);

          if (result && result.success === true && typeof result.message === 'string') {
              // Store data needed for subsequent steps (like reminder setup)
            userExperimentSetupData.set(interaction.user.id, {
              settingsMessage: result.message,
              deeperProblem: payload.deeperProblem, // Use payload from earlier in this handler
              input1Label: getLabel(payload.inputSettings[0], "Input 1"),
              input2Label: getLabel(payload.inputSettings[1], null),
              input3Label: getLabel(payload.inputSettings[2], null),
              outputLabel: getLabel(payload.outputSetting, "Output"),
              rawPayload: payload,
              guildId: interaction.guild.id
          });

          // --- Build the Duration Embed (Using User Preferences from previous step) ---
          const durationEmbed = new EmbedBuilder()
              .setColor('#47d264') // Your Color
              .setTitle('Experiment Duration') // Your Title
              .setDescription('When do you want your stats delivered?') // Your Description
              .setTimestamp();

          // --- Build the Duration Select Menu ---
          const durationSelect = new StringSelectMenuBuilder()
              .setCustomId('experiment_duration_select') // This ID triggers the handler added in the previous step
              .setPlaceholder('See your stats in...') // Your Placeholder
              .addOptions(
                  new StringSelectMenuOptionBuilder().setLabel('1 Week').setValue('1_week').setDescription('Report in 7 days.'),
                  new StringSelectMenuOptionBuilder().setLabel('2 Weeks').setValue('2_weeks').setDescription('Report in 14 days.'),
                  new StringSelectMenuOptionBuilder().setLabel('3 Weeks').setValue('3_weeks').setDescription('Report in 21 days.'),
                  new StringSelectMenuOptionBuilder().setLabel('4 Weeks').setValue('4_weeks').setDescription('Report in 28 days.')
              );

          const durationRow = new ActionRowBuilder().addComponents(durationSelect);

          console.log(`[experiment_setup_modal EDIT_REPLY ${interactionId}] Attempting editReply with duration embed/select...`);
          // --- Edit the Reply Directly with Duration Selection ---
          await interaction.editReply({
              content: '', // Clear the "settings saved" text
              embeds: [durationEmbed],
              components: [durationRow]
              // Ephemeral status is inherited
          });
          console.log(`[experiment_setup_modal EDIT_REPLY_SUCCESS ${interactionId}] Edited reply with duration selection.`);
          }

      } catch (error) {
          const errorTime = performance.now();
          console.error(`[experiment_setup_modal CRITICAL_ERROR ${interactionId}] Error at ${errorTime.toFixed(2)}ms:`, error);
          let userErrorMessage = '❌ An unexpected error occurred. Please try again.';
          if (error.message?.includes('Firebase Error') || error.message?.includes('authentication failed')) userErrorMessage = `❌ ${error.message}`;

          console.log(`[experiment_setup_modal CRITICAL_ERROR_EDIT_REPLY ${interactionId}] Attempting critical error editReply...`); // Log change
          try {
              // Check if interaction is deferred/replied before editing
              if (interaction.deferred || interaction.replied) {
                  // --- Habit 1: Change to editReply ---
                  await interaction.editReply({ content: userErrorMessage, components: [] });
                  // --- End Habit 1 ---
                  console.log(`[experiment_setup_modal CRITICAL_ERROR_EDIT_REPLY_SUCCESS ${interactionId}] Sent critical error editReply.`); // Log change
              } else {
                  // Should not happen if defer succeeds, but log if it does
                  console.warn(`[experiment_setup_modal CRITICAL_ERROR_EDIT_REPLY_SKIP ${interactionId}] Interaction not deferred/replied. Cannot edit reply.`);
              }
          } catch (editError) {
            console.error(`[experiment_setup_modal CRITICAL_ERROR_EDIT_REPLY_FAIL ${interactionId}] Failed to send critical error editReply:`, editError); // Log change
          }
      }
      const modalProcessEndTime = performance.now();
      console.log(`[experiment_setup_modal END ${interactionId}] Processing finished. Total time: ${(modalProcessEndTime - modalSubmitStartTime).toFixed(2)}ms`);
    }
}

      console.log(`--- InteractionCreate END [${interactionId}] ---\n`);
      const interactionListenerEndPerfNow = performance.now();
      console.log(`[InteractionListener END ${interaction.id}] Processing finished. TotalInListener: ${(interactionListenerEndPerfNow - interactionEntryPerfNow).toFixed(2)}ms.`);

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

// In Render/index.js (Place these outside the InteractionCreate handler)

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
