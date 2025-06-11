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

  // Helper function to check against the keyword list, defined once
  const isTimeMetric = (unit) => {
      if (!unit) return false;
      const lowerUnit = unit.toLowerCase().trim();
      return TIME_OF_DAY_KEYWORDS.includes(lowerUnit);
  };

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
                            statsEmbed.addFields({ name: '\u200B', value: '**📊 CORE STATISTICS**' });// Added icon for consistency
                            for (const metricKey in statsReportData.calculatedMetricStats) {
                            const metricDetails = statsReportData.calculatedMetricStats[metricKey];
                            let fieldValue = '';
                            if (metricDetails.status === 'skipped_insufficient_data') {
                                fieldValue = `Average: N/A (Needs ${metricDetails.dataPoints !== undefined ? 5 : 'more'} data points)\nMedian: N/A\nVariation %: N/A\nData Points: ${metricDetails.dataPoints !== undefined ? metricDetails.dataPoints : 'N/A'}`;
                            } else {
                                // Average
                                if (metricDetails.average !== undefined && !isNaN(metricDetails.average)) {
                                    if (isTimeMetric(metricDetails.unit)) {
                                        fieldValue += `Average: ${formatDecimalAsTime(metricDetails.average)}\n`;
                                    } else {
                                        fieldValue += `Average: ${parseFloat(metricDetails.average).toFixed(2)}\n`;
                                    }
                                } else {
                                    fieldValue += 'Average: N/A\n';
                                }
                                // Median
                                if (metricDetails.median !== undefined && !isNaN(metricDetails.median)) {
                                    if (isTimeMetric(metricDetails.unit)) {
                                        fieldValue += `Median: ${formatDecimalAsTime(metricDetails.median)}\n`;
                                    } else {
                                        fieldValue += `Median: ${parseFloat(metricDetails.median).toFixed(2)}\n`;
                                    }
                                } else {
                                    fieldValue += 'Median: N/A\n';
                                }

                                // Variation and Data Points
                                if (metricDetails.variationPercentage !== undefined && !isNaN(metricDetails.variationPercentage)) {
                                    fieldValue += `Variation: ${parseFloat(metricDetails.variationPercentage).toFixed(2)}%\n`;
                                } else {
                                    fieldValue += 'Variation: N/A\n';
                                }
                                if (metricDetails.dataPoints !== undefined) {
                                    fieldValue += `Data Points: ${metricDetails.dataPoints}`;
                                } else {
                                    fieldValue += 'Data Points: N/A';
                                }
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
                            statsEmbed.addFields({ name: '\u200B', value: '**Daily Habit → Outcome IMPACTS**\n\nSee how your habits correlated with your desired outcome' });
                            for (const inputMetricKey in statsReportData.correlations) {
                                if (Object.prototype.hasOwnProperty.call(statsReportData.correlations, inputMetricKey)) {
                                    const corr = statsReportData.correlations[inputMetricKey];
                                    let influenceFieldValue = `Influence: N/A\nPairs: ${corr.n_pairs || 'N/A'}\n*${(corr.interpretation || 'Not calculated')}*`;// Default text updated

                                    if (corr.status === 'calculated' && corr.coefficient !== undefined && !isNaN(corr.coefficient)) {
                                        const r = parseFloat(corr.coefficient);
                                        const rSquared = r * r; // Calculate R-squared
                                        // Display R-squared as a percentage with one decimal place
                                        influenceFieldValue = `**Influence %: ${(rSquared * 100).toFixed(1)}%**\n\n*${(corr.interpretation || 'N/A')}*`;
                                    } else if (corr.status && corr.status.startsWith('skipped_')) {
                                        influenceFieldValue = `Influence: N/A\nPairs: ${corr.n_pairs || '0'}\n*${(corr.interpretation || 'Insufficient data for calculation.')}*`;
                                    }

                                    statsEmbed.addFields({
                                        name: `${(corr.label || inputMetricKey)}\n→ ${(corr.vsOutputLabel || 'Desired Output')}`, // Field name shows which input influences the output
                                        value: influenceFieldValue,
                                        inline: true
                                    });
                                }
                            }
                        } else {
                            statsEmbed.addFields({ name: '🔗 Influence', value: 'No influence data (correlations) was found or calculated for this report.', inline: false }); // Updated fallback text
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
                                 /*
                                new ButtonBuilder()
                                    .setCustomId(`compare_exp_stats_btn_${statsReportData.experimentId}`) // Ensure experimentId is correctly used
                                    .setLabel('Compare with Recent Experiments')
                                    .setStyle(ButtonStyle.Primary),
                                */
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

                               // <<< START OF NEW MODIFICATION FOR DELAYED FOLLOW-UP >>>
                                const delayMinutes = 5; // Or up to 10, e.g., Math.floor(Math.random() * 6) + 5; for 5-10 mins
                                const delayMilliseconds = delayMinutes * 60 * 1000;
                                console.log(`[StatsListener] Scheduling follow-up DM for user ${userId} in ${delayMinutes} minutes regarding experiment ${statsReportData.experimentId} conclusion.`);
                                setTimeout(async () => {
                                    try {
                                        const followUpEmbed = new EmbedBuilder()
                                             .setColor(0x4A90E2) // A different color, perhaps blue
                                            .setTitle('Experiment Transition')
                                             .setDescription(`Check your stats above! ⬆️\n\nAt this point, you have 2 options:\n\n1. Start a new experiment\n(click the button below)\n\n2. Continue with the same experiment.\nKeep logging as usual.\nYou'll get a weekly stats update\nAND new weekly AI insights too!`)
                                            .setFooter({ text: `Experiment ID: ${statsReportData.experimentId || 'N/A'}` })
                                            .setTimestamp();

                                        const followUpActionRow = new ActionRowBuilder()
                                             .addComponents(
                                                new ButtonBuilder()
                                                      .setCustomId('start_new_experiment_prompt_btn') // Same new custom ID as before
                                                    .setLabel('🚀 Start New Experiment')
                                                    .setStyle(ButtonStyle.Success) // Changed to Success for more prominence
                                             );

                                        await discordUser.send({
                                            embeds: [followUpEmbed],
                                            components: [followUpActionRow]
                                         });
                                        console.log(`[StatsListener] Successfully sent DELAYED follow-up DM to user ${userId} for experiment ${statsReportData.experimentId}.`);
                                    } catch (followUpError) {
                                        console.error(`[StatsListener] Failed to send DELAYED follow-up DM to user ${userId} for experiment ${statsReportData.experimentId}:`, followUpError);
                                        // Not updating Firestore notification here as this is a best-effort follow-up
                                    }
                                }, delayMilliseconds);
                                // <<< END OF NEW MODIFICATION FOR DELAYED FOLLOW-UP >>>

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

// +++ PASTE THE NEW CODE BLOCK BELOW THIS LINE +++

/**
 * Configuration for the AI-assisted experiment setup DM flow.
 * Each key is a `dmFlowState`, and the value contains:
 * - prompt: A function that returns the { content, components } for that step.
 * - fieldsToClear: An array of keys in `setupData` to delete when going BACK from a future step TO this one.
 */
const dmFlowConfig = {
  'awaiting_outcome_label_dropdown_selection': {
    prompt: (setupData) => {
      const outcomeLabelSelectMenu = new StringSelectMenuBuilder()
        .setCustomId('ai_outcome_label_select')
        .setPlaceholder('Which of these would help?');
      outcomeLabelSelectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("✏️ Enter my own...")
          .setValue('custom_outcome_label')
          .setDescription("Choose this to type your own outcome metric label.")
      );
      if (setupData.aiGeneratedOutcomeLabelSuggestions) {
        setupData.aiGeneratedOutcomeLabelSuggestions.forEach((suggestion, index) => {
          outcomeLabelSelectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel(suggestion.label.substring(0, 100))
              .setValue(`ai_suggestion_${index}`)
              .setDescription((suggestion.briefExplanation || 'AI Suggested Label').substring(0, 100))
          );
        });
      }
      const content = `Okay, let's try that again. Here are some ideas for a **Measurable Outcome** to support your wish:\n\n**"${setupData.deeperWish}"**.`;
      const components = [new ActionRowBuilder().addComponents(outcomeLabelSelectMenu)];
      return { content, components };
    },
    fieldsToClear: ['outcomeLabel', 'outcomeUnit', 'outcomeGoal', 'inputs']
  },
  'awaiting_outcome_unit_dropdown_selection': {
    prompt: (setupData) => {
      const outcomeUnitSelectMenu = new StringSelectMenuBuilder()
        .setCustomId('outcome_unit_select')
        .setPlaceholder('How will you measure this outcome daily?');
      outcomeUnitSelectMenu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("✏️ Enter my own custom unit...")
          .setValue(CUSTOM_UNIT_OPTION_VALUE)
      );
      PREDEFINED_OUTCOME_UNIT_SUGGESTIONS.forEach(unitSuggestion => {
        outcomeUnitSelectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(unitSuggestion.label.substring(0, 100))
            .setValue(unitSuggestion.label)
            .setDescription((unitSuggestion.description || '').substring(0, 100))
        );
      });
      const backButton = new ButtonBuilder()
        .setCustomId('back_to:awaiting_outcome_label_dropdown_selection')
        .setLabel('⬅️ Back')
        .setStyle(ButtonStyle.Secondary);
      const content = `Great! The Outcome you're tracking is\n\n**"${setupData.outcomeLabel}"**.\n\nHow will you measure this daily?`;
      const components = [
        new ActionRowBuilder().addComponents(outcomeUnitSelectMenu),
        new ActionRowBuilder().addComponents(backButton)
      ];
      return { content, components };
    },
    fieldsToClear: ['outcomeUnit', 'outcomeGoal', 'inputs']
  },
  'awaiting_outcome_target_number': {
    prompt: (setupData) => {
        const backButton = new ButtonBuilder()
            .setCustomId('back_to:awaiting_outcome_unit_dropdown_selection')
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary);
        const content = `**↳ ${setupData.outcomeLabel},\n${setupData.outcomeUnit}**.\n\nNow what's your daily **Target Number/Amount** for this?\n\nPlease type the number below\n(0 and up, decimals work ✅)`;
        const components = [new ActionRowBuilder().addComponents(backButton)];
        return { content, components };
    },
    fieldsToClear: ['outcomeGoal', 'inputs']
  },
  'awaiting_outcome_target_time': {
      prompt: (setupData) => {
          const timeEmbed = new EmbedBuilder().setColor('#3498DB').setTitle(`🕰️ Set Target Time for: ${setupData.outcomeLabel}`).setDescription(`Please select your daily target time for this outcome.`);
          const timeHourSelect = new StringSelectMenuBuilder().setCustomId(EXP_SETUP_OUTCOME_H_ID).setPlaceholder('Select the Target HOUR').addOptions(Array.from({ length: 12 }, (_, i) => new StringSelectMenuOptionBuilder().setLabel(String(i + 1)).setValue(String(i + 1))));
          const timeMinuteSelect = new StringSelectMenuBuilder().setCustomId(EXP_SETUP_OUTCOME_M_ID).setPlaceholder('Select the Target MINUTE').addOptions(new StringSelectMenuOptionBuilder().setLabel(':00').setValue('00'), new StringSelectMenuOptionBuilder().setLabel(':15').setValue('15'), new StringSelectMenuOptionBuilder().setLabel(':30').setValue('30'), new StringSelectMenuOptionBuilder().setLabel(':45').setValue('45'));
          const timeAmPmSelect = new StringSelectMenuBuilder().setCustomId(EXP_SETUP_OUTCOME_AP_ID).setPlaceholder('Select AM or PM').addOptions(new StringSelectMenuOptionBuilder().setLabel('AM').setValue('AM'), new StringSelectMenuOptionBuilder().setLabel('PM').setValue('PM'));
          const confirmButton = new ButtonBuilder().setCustomId(CONFIRM_OUTCOME_TARGET_TIME_BTN_ID).setLabel('Confirm Target Time').setStyle(ButtonStyle.Success);
          const backButton = new ButtonBuilder()
            .setCustomId('back_to:awaiting_outcome_unit_dropdown_selection')
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary);

          const content = `**${setupData.outcomeLabel}** **${setupData.outcomeUnit}**. Please set the target time below.`;
          const components = [
              new ActionRowBuilder().addComponents(timeHourSelect),
              new ActionRowBuilder().addComponents(timeMinuteSelect),
              new ActionRowBuilder().addComponents(timeAmPmSelect),
              new ActionRowBuilder().addComponents(backButton, confirmButton)
          ];
          return { content, embeds: [timeEmbed], components };
      },
      fieldsToClear: ['outcomeGoal', 'inputs']
  },
  'awaiting_input1_label_dropdown_selection': {
    prompt: (setupData) => {
        const habitLabelSelectMenu = new StringSelectMenuBuilder()
            .setCustomId('ai_input1_label_select')
            .setPlaceholder('Select a Habit or enter your own.');
        habitLabelSelectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("✏️ Enter custom habit idea...")
            .setValue('custom_input1_label')
            .setDescription("Choose this to write in your own.")
        );
        setupData.aiGeneratedInputLabelSuggestions.forEach((suggestion, index) => {
        habitLabelSelectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(suggestion.label.substring(0, 100))
            .setValue(`ai_input1_label_suggestion_${index}`)
            .setDescription((suggestion.briefExplanation || 'AI Suggested Habit').substring(0, 100))
        );
      });
      const backButton = new ButtonBuilder()
        .setCustomId('back_to:awaiting_outcome_unit_dropdown_selection')
        .setLabel('⬅️ Back')
        .setStyle(ButtonStyle.Secondary);
      const rowWithHabitLabelSelect = new ActionRowBuilder().addComponents(habitLabelSelectMenu);
      const rowWithBack = new ActionRowBuilder().addComponents(backButton);
      
      const content = `Great! ⚡ Now here are some ideas\nfor your 1st daily habit\nto support your Outcome Metric:\n\n${setupData.outcomeLabel} ${setupData.outcomeUnit}`;
      const components = [rowWithHabitLabelSelect, rowWithBack];
      return { content, components };
    },
    fieldsToClear: ['inputs']
  },
  'awaiting_input1_unit_dropdown_selection': {
    prompt: (setupData) => {
        const habitUnitSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`${INPUT_UNIT_SELECT_ID_PREFIX}1`)
            .setPlaceholder('How will you measure this habit daily?');
        habitUnitSelectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("✏️ Enter my own custom unit...")
                .setValue(CUSTOM_UNIT_OPTION_VALUE)
        );
        PREDEFINED_HABIT_UNIT_SUGGESTIONS.forEach(unitSuggestion => {
            habitUnitSelectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(unitSuggestion.label.substring(0, 100))
                    .setValue(unitSuggestion.label)
                    .setDescription((unitSuggestion.description || '').substring(0, 100))
            );
        });
        const backButton = new ButtonBuilder()
            .setCustomId('back_to:awaiting_input1_label_dropdown_selection')
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary);
            
        const content = `**Habit 1 = ${setupData.currentInputDefinition.label}**.\n\nHow will you measure this?`;
        const components = [
            new ActionRowBuilder().addComponents(habitUnitSelectMenu),
            new ActionRowBuilder().addComponents(backButton)
        ];
        return { content, components };
    },
    fieldsToClear: []
  },
  'awaiting_input1_target_number': {
    prompt: (setupData) => {
        const backButton = new ButtonBuilder()
            .setCustomId('back_to:awaiting_input1_unit_dropdown_selection')
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary);
        const content = `Perfect!\nFor your habit **"${setupData.currentInputDefinition.label}"** (measured in **"${setupData.currentInputDefinition.unit}"**):\n\nWhat is your daily **Target Number**?\nPlease type the number below (e.g., 30, 1, 0, 5.5).`;
        const components = [new ActionRowBuilder().addComponents(backButton)];
        return { content, components };
    },
    fieldsToClear: []
  },
  'awaiting_input1_target_time': {
      prompt: (setupData) => {
          const timeEmbed = new EmbedBuilder().setColor('#3498DB').setTitle(`🕰️ Set Target Time for: ${setupData.currentInputDefinition.label}`).setDescription(`Please select your daily target time for this habit.`);
          const timeHourSelect = new StringSelectMenuBuilder().setCustomId(EXP_SETUP_INPUT_H_ID).setPlaceholder('Select the Target HOUR').addOptions(Array.from({ length: 12 }, (_, i) => new StringSelectMenuOptionBuilder().setLabel(String(i + 1)).setValue(String(i + 1))));
          const timeMinuteSelect = new StringSelectMenuBuilder().setCustomId(EXP_SETUP_INPUT_M_ID).setPlaceholder('Select the Target MINUTE').addOptions(new StringSelectMenuOptionBuilder().setLabel(':00').setValue('00'), new StringSelectMenuOptionBuilder().setLabel(':15').setValue('15'), new StringSelectMenuOptionBuilder().setLabel(':30').setValue('30'), new StringSelectMenuOptionBuilder().setLabel(':45').setValue('45'));
          const timeAmPmSelect = new StringSelectMenuBuilder().setCustomId(EXP_SETUP_INPUT_AP_ID).setPlaceholder('Select AM or PM').addOptions(new StringSelectMenuOptionBuilder().setLabel('AM').setValue('AM'), new StringSelectMenuOptionBuilder().setLabel('PM').setValue('PM'));
          const confirmButton = new ButtonBuilder().setCustomId(CONFIRM_INPUT_TARGET_TIME_BTN_ID).setLabel('Confirm Target Time').setStyle(ButtonStyle.Success);
          const backButton = new ButtonBuilder()
            .setCustomId('back_to:awaiting_input1_unit_dropdown_selection')
            .setLabel('⬅️ Back')
            .setStyle(ButtonStyle.Secondary);

          const content = `**${setupData.currentInputDefinition.label}** **${setupData.currentInputDefinition.unit}**. Please set the target time below.`;
          const components = [
              new ActionRowBuilder().addComponents(timeHourSelect),
              new ActionRowBuilder().addComponents(timeMinuteSelect),
              new ActionRowBuilder().addComponents(timeAmPmSelect),
              new ActionRowBuilder().addComponents(backButton, confirmButton)
          ];
          return { content, embeds: [timeEmbed], components };
      },
      fieldsToClear: []
  },
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
        content: "✅ All time-based metrics have been recorded. Click below to log your remaining metrics and notes.",
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

 // --- Stage 1: Handle "awaiting_wish" and transition to first question ---
  if (setupData.dmFlowState === 'awaiting_wish') {
    const interactionIdForLog = setupData.interactionId || 'DM_FLOW';

    if (!messageContent) {
      await message.author.send("It looks like your Deeper Wish was empty. Please tell me, what's one thing you wish was different or better in your daily life right now?");
      console.log(`[MessageCreate AWAITING_WISH_EMPTY ${interactionIdForLog}] User ${userTag} sent empty wish.`);
      return;
    }

    // Store the wish
    setupData.deeperWish = messageContent;
    setupData.deeperProblem = messageContent; // Store in both for compatibility 
    
    // Transition to the first new question state
    setupData.dmFlowState = 'awaiting_blockers';
    userExperimentSetupData.set(userId, setupData);

    console.log(`[MessageCreate AWAITING_WISH_RECEIVED ${interactionIdForLog}] User ${userTag} submitted Deeper Wish: "${messageContent}". State changed to '${setupData.dmFlowState}'.`);

    // Ask the first follow-up question
    await message.author.send("Now let's break it down into\n**1 measurable outcome.**\n\nTo do that, please answer 3 quick questions.\n\n1. What are the biggest blockers preventing progress on that wish?");
    console.log(`[MessageCreate ASK_BLOCKERS ${interactionIdForLog}] Prompted ${userTag} for blockers.`);
  }

    // --- Stage 2: Handle "awaiting_blockers" and transition to second question ---
    else if (setupData.dmFlowState === 'awaiting_blockers') {
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';

      if (!messageContent) {
        await message.author.send("It looks like your response was empty. Please tell me, what are the biggest blockers to your wish?");
        console.log(`[MessageCreate AWAITING_BLOCKERS_EMPTY ${interactionIdForLog}] User ${userTag} sent empty blockers response.`);
        return;
      }
      
      // Store the blockers
      setupData.userBlockers = messageContent;
      
      // Transition to the second new question state
      setupData.dmFlowState = 'awaiting_positive_habits';
      userExperimentSetupData.set(userId, setupData);
      
      console.log(`[MessageCreate AWAITING_BLOCKERS_RECEIVED ${interactionIdForLog}] User ${userTag} submitted blockers: "${messageContent}". State changed to '${setupData.dmFlowState}'.`);
      
      // Ask the second follow-up question
      await message.author.send("**Next Question:**What are 1 or more positive habits\nyou already do consistently?\n\nThey can be related to this wish or not, like *smiling every morning* or *walking the dog.*");
      console.log(`[MessageCreate ASK_POSITIVE_HABITS ${interactionIdForLog}] Prompted ${userTag} for positive habits.`);
    }

    // --- Stage 3: Handle "awaiting_positive_habits" and transition to final question ---
    else if (setupData.dmFlowState === 'awaiting_positive_habits') {
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';

      if (!messageContent) {
        await message.author.send("It looks like your response was empty. Please tell me one positive habit you have, even a small one.");
        console.log(`[MessageCreate AWAITING_POSITIVE_HABITS_EMPTY ${interactionIdForLog}] User ${userTag} sent empty positive habits response.`);
        return;
      }
      
      // Store the positive habits
      setupData.userPositiveHabits = messageContent;
      
      // Transition to the final new question state
      setupData.dmFlowState = 'awaiting_vision';
      userExperimentSetupData.set(userId, setupData);
      
      console.log(`[MessageCreate AWAITING_POSITIVE_HABITS_RECEIVED ${interactionIdForLog}] User ${userTag} submitted positive habits: "${messageContent}". State changed to '${setupData.dmFlowState}'.`);
      
      // Ask the final follow-up question
      await message.author.send("**Last one:** If your wish came true,\nwhat's the first small, positive change you'd notice in your daily life?\n\nBe specific now! For example:\n**Wish** = 'More energy'\n**Small Change** = 'Not needing naps'");
      console.log(`[MessageCreate ASK_VISION ${interactionIdForLog}] Prompted ${userTag} for their vision of success.`);
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
      userExperimentSetupData.set(userId, setupData);
      
      console.log(`[MessageCreate AWAITING_VISION_RECEIVED ${interactionIdForLog}] User ${userTag} submitted vision: "${messageContent}". State changed to '${setupData.dmFlowState}'.`);

      // Send the "thinking" message and store it
      const thinkingMessage = await message.author.send(`Excellent. Thank you for that information. I'm now analyzing your wish, blockers, habits, and vision to suggest a personalized experiment...\n\nBrainstorming... 1 sec`);

      // --- Call Firebase Function with the complete context ---
      try {
        console.log(`[MessageCreate LLM_CALL_START ${interactionIdForLog}] Calling 'generateOutcomeLabelSuggestions' Firebase function for ${userTag} with full context.`);
        
        if (!firebaseFunctions) {
            throw new Error("Firebase Functions client not initialized.");
        }

        const llmResult = await callFirebaseFunction(
          'generateOutcomeLabelSuggestions',
          { // NEW: Payload now includes all collected context
            userWish: setupData.deeperWish,
            userBlockers: setupData.userBlockers,
            userPositiveHabits: setupData.userPositiveHabits,
            userVision: setupData.userVision
          },
          userId
        );
        
        console.log(`[MessageCreate LLM_CALL_END ${interactionIdForLog}] Firebase function 'generateOutcomeLabelSuggestions' returned for ${userTag}.`);

        if (llmResult && llmResult.success && llmResult.suggestions && llmResult.suggestions.length === 5) {
            setupData.aiGeneratedOutcomeLabelSuggestions = llmResult.suggestions;
            setupData.dmFlowState = 'awaiting_outcome_label_dropdown_selection';
            userExperimentSetupData.set(userId, setupData);
            
            console.log(`[MessageCreate LLM_SUCCESS ${interactionIdForLog}] Successfully received ${llmResult.suggestions.length} outcome label suggestions from LLM for ${userTag}.`);
            
            const outcomeLabelSelectMenu = new StringSelectMenuBuilder()
              .setCustomId('ai_outcome_label_select')
              .setPlaceholder('Potential Outcomes to measure');
            
            outcomeLabelSelectMenu.addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel("✏️ Enter my own...")
                .setValue('custom_outcome_label')
                .setDescription("Type your own outcome metric.")
            );

            llmResult.suggestions.forEach((suggestion, index) => {
              outcomeLabelSelectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                  .setLabel(suggestion.label.substring(0, 100))
                  .setValue(`ai_suggestion_${index}`)
                  .setDescription((suggestion.briefExplanation || 'AI Suggested Label').substring(0, 100))
              );
            });
            
            const rowWithLabelSelect = new ActionRowBuilder().addComponents(outcomeLabelSelectMenu);
            let introMessage = `Here are some ideas for a **Measurable Outcome**\nto support your wish:\n\n**"${setupData.deeperWish}"**.\n\nSelect one from the dropdown\nor "✏️ Enter my own..."\n\n(It may take a moment to load after you choose...)`;

            // Edit the "thinking" message with the results
            await thinkingMessage.edit({
                content: introMessage,
                components: [rowWithLabelSelect]
            });
            
            console.log(`[MessageCreate LABEL_DROPDOWN_SENT ${interactionIdForLog}] Displayed AI outcome label suggestions dropdown to ${userTag}. State: ${setupData.dmFlowState}.`);
        
        } else {
            // This 'else' block handles cases where the LLM call failed or returned unexpected data.
            let failureReason = "AI failed to return valid suggestions";
            if (llmResult && llmResult.error) {
                failureReason = llmResult.error;
            } else if (llmResult && llmResult.suggestions) {
                failureReason = `AI returned ${llmResult.suggestions?.length || 0} suggestions instead of 5.`;
            }
            console.error(`[MessageCreate LLM_ERROR ${interactionIdForLog}] LLM call 'generateOutcomeLabelSuggestions' failed or returned invalid data for ${userTag}. Reason: ${failureReason}. Result:`, llmResult);
            
            // Edit the "thinking" message with the fallback prompt
            await thinkingMessage.edit("I had a bit of trouble brainstorming Outcome Metric suggestions right now. 😕\n\nWhat **Label** would you like to give your Key Outcome Metric? This is the main thing you'll track *daily* to see if you're making progress.\n\nE.g.\n● 'Energy Level'\n● 'Sleep Quality'\n● 'Tasks Completed'\n\nType just the label below (30 characters or less).");
            
            // Fallback to direct text input for the outcome label
            setupData.dmFlowState = 'awaiting_outcome_label';
            userExperimentSetupData.set(userId, setupData);
            console.log(`[MessageCreate LLM_FAIL_RECOVERY_LABEL ${interactionIdForLog}] LLM failed for outcome label suggestions, sent fallback 'Ask Outcome Label (text)' prompt to ${userTag}. State: ${setupData.dmFlowState}.`);
        }
      } catch (error) {
        console.error(`[MessageCreate FIREBASE_FUNC_ERROR ${interactionIdForLog}] Error calling Firebase function 'generateOutcomeLabelSuggestions' or processing its result for ${userTag}:`, error);
        
        // Try to edit the "thinking" message with an error message
        try {
          await thinkingMessage.edit("I encountered an issue trying to connect with my AI brain for suggestions. Please try again in a bit, or you can 'cancel' and use the manual setup for now.");
        } catch (editError) {
          console.error(`[MessageCreate EDIT_THINKING_MESSAGE_ON_ERROR_FAIL ${interactionIdForLog}] Could not edit thinkingMessage after catch. Sending new message. Error:`, editError);
          await message.author.send("I encountered an issue trying to connect with my AI brain for suggestions. Please try again in a bit, or you can 'cancel' and use the manual setup for now.");
        }
        
        // Revert state so they can try the flow again or cancel
        const existingData = userExperimentSetupData.get(userId) || {};
        userExperimentSetupData.set(userId, {
            ...existingData,
            dmFlowState: 'awaiting_wish', // Revert to start
        });
      }
    }

    else if (setupData.dmFlowState === 'processing_wish') {
      // User sent another message while wish was being processed.
      // Tell them to wait or handle appropriately.
      await message.author.send("I'm still thinking about your wish!\n\nI'll send the examples as soon as they're ready. 😊");
      console.log(`[MessageCreate PROCESSING_WISH_INTERRUPT ${interactionIdForLog}] User ${userTag} sent message while wish was processing.`);
    }

    else if (setupData.dmFlowState === 'awaiting_outcome_label') {
      const outcomeLabel = messageContent; // messageContent is from the top of MessageCreate
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW'; // Use stored interaction ID or a generic one

      if (!outcomeLabel) {
        await message.author.send("It looks like your response was empty. What **Label** would you give your Key Outcome Metric? (e.g., 'Energy Level', 'Sleep Quality')");
        console.log(`[MessageCreate AWAITING_OUTCOME_LABEL_EMPTY ${interactionIdForLog}] User ${userTag} sent empty outcome label.`);
        return;
      }

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
      // ***** START: MODIFIED SECTION - TRANSITION TO OUTCOME UNIT DROPDOWN *****
      setupData.dmFlowState = 'awaiting_outcome_unit_dropdown_selection'; // NEW STATE for dropdown
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate OUTCOME_LABEL_RECEIVED ${interactionIdForLog}] User ${userTag} submitted outcome label: "${outcomeLabel}". State changed to '${setupData.dmFlowState}'.`);
      
      const outcomeUnitSelectMenu = new StringSelectMenuBuilder()
          .setCustomId(OUTCOME_UNIT_SELECT_ID)
          .setPlaceholder('How will you measure this outcome daily?');
      outcomeUnitSelectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
              .setLabel("✏️ Enter custom unit/scale...")
              .setValue(CUSTOM_UNIT_OPTION_VALUE)
      );
      PREDEFINED_OUTCOME_UNIT_SUGGESTIONS.forEach(unitSuggestion => {
          outcomeUnitSelectMenu.addOptions(
              new StringSelectMenuOptionBuilder()
                  .setLabel(unitSuggestion.label.length > 100 ? unitSuggestion.label.substring(0,97) + '...' : unitSuggestion.label) // Use .label property
                  .setValue(unitSuggestion.label) // Use .label property as value, or a unique ID if you prefer
                  .setDescription(unitSuggestion.description.length > 100 ? unitSuggestion.description.substring(0,97) + '...' : unitSuggestion.description) // Use .description
          );
      });
      const rowWithOutcomeUnitSelect = new ActionRowBuilder().addComponents(outcomeUnitSelectMenu);
      const unitDropdownPromptMessage = `Outcome metric = **"${setupData.outcomeLabel}"**.\n\n` +
                                      `Now, how will you **Measure** this outcome daily? This is its **Unit/Scale**.\n` +
                                      `Choose from the list below, or enter your own.`;

      await message.author.send({
          content: unitDropdownPromptMessage,
          components: [rowWithOutcomeUnitSelect]
      });
      console.log(`[MessageCreate ASK_OUTCOME_UNIT_DROPDOWN ${interactionIdForLog}] DM sent to ${userTag} asking for Outcome Unit via dropdown.`);
      // ***** END: MODIFIED SECTION *****
    }

      // [render index with AI set exp.txt]
    else if (setupData.dmFlowState === 'awaiting_custom_outcome_label_text') { // [cite: 274]
      const customLabelText = messageContent.trim(); // [cite: 274]
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW'; // [cite: 275]
      const userId = message.author.id; // [cite: 276]
      const userTag = message.author.tag; // [cite: 277]

      if (!customLabelText) { // [cite: 278]
        await message.author.send( // [cite: 278]
          "It looks like your Outcome was empty. Please type your Outcome Metric\n\nE.g., \"Overall Well-being\"\n\n(max 30 characters)." // [cite: 278]
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
      

        setupData.dmFlowState = 'awaiting_outcome_unit_dropdown_selection'; // NEW STATE
        userExperimentSetupData.set(userId, setupData);

        const outcomeUnitSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(OUTCOME_UNIT_SELECT_ID) // Use your new constant
            .setPlaceholder('How can you measure this outcome daily?');
        
        // CORRECTED LOOP: Access .label and .description properties of the object
        outcomeUnitSelectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("✏️ Enter my own custom unit...")
                .setValue(CUSTOM_UNIT_OPTION_VALUE) // Use your new constant
        );
        PREDEFINED_OUTCOME_UNIT_SUGGESTIONS.forEach(unitSuggestion => {
            outcomeUnitSelectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel(unitSuggestion.label.substring(0, 100))
                    .setValue(unitSuggestion.label) // Use label as the value
                    .setDescription((unitSuggestion.description || '').substring(0, 100))
            );
        });

        const rowWithOutcomeUnitSelect = new ActionRowBuilder().addComponents(outcomeUnitSelectMenu);
        const unitDropdownPromptMessage = `Great! Your Outcome is:\n\n**"${setupData.outcomeLabel}"**.\n\nHow will you measure this daily? Choose a numerical scale/unit from the list, or enter your own.`;
        
        await message.author.send({
            content: unitDropdownPromptMessage,
            components: [rowWithOutcomeUnitSelect]
        });
        
        console.log(`[MessageCreate CUSTOM_LABEL_OUTCOME_UNIT_DROPDOWN_SENT ${interactionIdForLog}] Prompted ${userTag} with outcome unit dropdown. State: ${setupData.dmFlowState}.`);
        // ***** END: CORRECTED SECTION *****

    } // End of awaiting_custom_outcome_label_text

    else if (setupData.dmFlowState === 'awaiting_custom_outcome_unit_text') {
      const customOutcomeUnit = messageContent.trim(); // messageContent is from the top of MessageCreate
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW'; // Use stored interaction ID or a generic one
      const userId = message.author.id;
      const userTag = message.author.tag;

      console.log(`[MessageCreate AWAITING_CUSTOM_UNIT_TEXT ${interactionIdForLog}] User ${userTag} (ID: ${userId}) sent custom unit: "${customOutcomeUnit}". Label: "${setupData.outcomeLabel}"`);

      if (!customOutcomeUnit) {
        await message.author.send(
          `It looks like your custom unit was empty for **"${setupData.outcomeLabel}"**.\n\nPlease enter a concise scale or unit name\n\n(e.g., "out of 10", "Tasks"). Max 15 characters.`
        );
        console.log(`[MessageCreate CUSTOM_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom unit.`);
        return; // Keep state, wait for new message
      }

      // Validate the unit string itself for a reasonable length before checking combined
      const MAX_UNIT_ONLY_LENGTH = 15; // Max length for the unit string itself
      if (customOutcomeUnit.length > MAX_UNIT_ONLY_LENGTH) {
        await message.author.send(
          `That unit ("${customOutcomeUnit}") is a bit long (max ${MAX_UNIT_ONLY_LENGTH} characters).\n\nPlease enter a concise scale or unit name\n\n(e.g., "0-10", "Tasks"). Max 15 characters.`
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

      const targetPromptMessage = `Now, what is your daily **Target Number** for this?\n\n${setupData.outcomeLabel} ${setupData.outcomeUnit}\n\nPlease type the number below\n(0 and up, decimals ok ✅).`;

      await message.author.send(targetPromptMessage);
      console.log(`[MessageCreate CUSTOM_UNIT_TARGET_PROMPT_SENT ${interactionIdForLog}] Prompted ${userTag} for outcome target number.`);
    }

    else if (setupData.dmFlowState === 'awaiting_outcome_target_number') {
      const targetNumberStr = messageContent.trim();
      const interactionIdForLog = setupData.interactionId || 'DM_FLOW';
      const userId = message.author.id;
      const userTagForLog = message.author.tag;

      console.log(`[MessageCreate AWAITING_OUTCOME_TARGET ${interactionIdForLog}] User ${userTagForLog} (ID: ${userId}) sent target number: "${targetNumberStr}" for Outcome: "${setupData.outcomeLabel}" (${setupData.outcomeUnit}).`);
      
      const backButton = new ButtonBuilder()
          .setCustomId('back_to:awaiting_outcome_unit_dropdown_selection')
          .setLabel('⬅️ Back')
          .setStyle(ButtonStyle.Secondary);

      if (!targetNumberStr) {
        await message.author.send({
          content: `It looks like your response was empty. What is your daily **Target #** for **${setupData.outcomeLabel}** (${setupData.outcomeUnit})?\n\nPlease type just the number (e.g. 7,  7.5,  0,  1).`,
          components: [new ActionRowBuilder().addComponents(backButton)]
        });
        console.log(`[MessageCreate OUTCOME_TARGET_EMPTY ${interactionIdForLog}] User ${userTagForLog} sent empty target number.`);
        return;
      }

      const targetNumber = parseFloat(targetNumberStr);
      if (isNaN(targetNumber)) {
        await message.author.send({
          content: `Hmm, "${targetNumberStr}" doesn't seem to be a valid number. \n\nWhat is your daily **Target #** for **${setupData.outcomeLabel}** (${setupData.outcomeUnit})?\n\nPlease type just the number (e.g. 7,  7.5,  0,  1).`,
          components: [new ActionRowBuilder().addComponents(backButton)]
        });
        console.log(`[MessageCreate OUTCOME_TARGET_NAN ${interactionIdForLog}] User ${userTagForLog} sent non-numeric target: "${targetNumberStr}".`);
        return;
      }

      // Validation passed
      setupData.outcomeGoal = targetNumber;
      console.log(`[MessageCreate OUTCOME_METRIC_DEFINED ${interactionIdForLog}] User ${userTagForLog} fully defined Outcome Metric: Label="${setupData.outcomeLabel}", Unit="${setupData.outcomeUnit}", Goal=${setupData.outcomeGoal}.`);
      
      setupData.currentInputIndex = 1;
      setupData.inputs = setupData.inputs || [];
      setupData.dmFlowState = 'processing_input1_label_suggestions';
      userExperimentSetupData.set(userId, setupData);

      console.log(`[MessageCreate PROCESS_INPUT1_LABELS_START ${interactionIdForLog}] State changed to '${setupData.dmFlowState}'. Getting Input 1 label suggestions.`);
      
      const habitThinkingMessage = await message.author.send(
        `✅ **Outcome Metric Confirmed!**\n\n**${setupData.outcomeGoal} ${setupData.outcomeLabel} **${setupData.outcomeUnit}**\n\nGreat! Now, let's define your first **Daily Habit**.\n\n🧠 I'll brainstorm some potential Daily Habits for you. This might take a moment...\n\n...`
      );

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
            definedInputs: []
          },
          userId
        );
        
        if (habitSuggestionsResult && habitSuggestionsResult.success && habitSuggestionsResult.suggestions?.length > 0) {
          setupData.aiGeneratedInputLabelSuggestions = habitSuggestionsResult.suggestions;
          setupData.dmFlowState = 'awaiting_input1_label_dropdown_selection';
          userExperimentSetupData.set(userId, setupData);
          console.log(`[MessageCreate INPUT1_LABEL_SUGGESTIONS_SUCCESS ${interactionIdForLog}] Received ${habitSuggestionsResult.suggestions.length} habit label suggestions for Input 1.`);
          
          // Use the new dmFlowConfig to generate the prompt
          const step = dmFlowConfig[setupData.dmFlowState];
          const { content, components } = step.prompt(setupData);

          await habitThinkingMessage.edit({ content, components });
          console.log(`[MessageCreate INPUT1_LABEL_DROPDOWN_SENT ${interactionIdForLog}] Displayed AI habit label suggestions dropdown to ${userTagForLog}.`);

        } else {
          // AI call failed or returned no suggestions, fallback to manual input
          let failureMessage = "I had a bit of trouble brainstorming Habit suggestions right now. 😕";
          if (habitSuggestionsResult && habitSuggestionsResult.error) {
            failureMessage += ` (Reason: ${habitSuggestionsResult.error})`;
          }
          console.warn(`[MessageCreate INPUT1_LABEL_SUGGESTIONS_FAIL ${interactionIdForLog}] AI call failed or returned no data. Result:`, habitSuggestionsResult);
          
          setupData.dmFlowState = 'awaiting_input1_label_text';
          userExperimentSetupData.set(userId, setupData);
          
          await habitThinkingMessage.edit(
            `${failureMessage}\n\nNo worries! What **Label** would you like to give your first Daily Habit? ` +
            `E.g.\n● "Morning Meditation"\n● "Exercise"\n\n(max 30 characters).`
          );
          console.log(`[MessageCreate INPUT1_LABEL_FALLBACK_PROMPT_SENT ${interactionIdForLog}] Prompted for Input 1 Label text (AI fail).`);
        }
      } catch (error) {
        console.error(`[MessageCreate FIREBASE_FUNC_ERROR_INPUT_LABELS ${interactionIdForLog}] Error calling 'generateInputLabelSuggestions':`, error);
        
        setupData.dmFlowState = 'awaiting_input1_label_text';
        userExperimentSetupData.set(userId, setupData);
        
        try {
            await habitThinkingMessage.edit(
                "I encountered an issue connecting with my AI brain for habit suggestions. \n\nLet's set it up manually: " +
                "What **Label** would you like to give your first Daily Habit?\n\nE.g.\n● Morning Meditation\n\n(max 30 characters)."
            );
        } catch (editError) {
            console.error(`[MessageCreate EDIT_HABIT_THINKING_ON_ERROR_FAIL ${interactionIdForLog}] Could not edit thinkingMessage after catch. Sending new message. Error:`, editError);
            await message.author.send(
                "I encountered an issue connecting with my AI brain. \n\nLet's set it up manually: " +
                "What **Label** would you like to give your first Daily Habit?\n\nE.g.\n● Morning Meditation\n\n(max 30 characters)."
            );
        }
        console.log(`[MessageCreate INPUT1_LABEL_ERROR_FALLBACK_PROMPT_SENT ${interactionIdForLog}] Prompted for Input 1 Label text (Firebase error).`);
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
          `It looks like your label for the first Daily Habit was empty. What **Label** would you give this habit?\n\n` +
          `E.g.\n● Morning Meditation\n\n(max 30 characters)..`
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
      // ***** START: MODIFIED SECTION - TRANSITION TO INPUT 1 UNIT DROPDOWN *****
      setupData.dmFlowState = `awaiting_input${setupData.currentInputIndex}_unit_dropdown_selection`; // e.g., awaiting_input1_unit_dropdown_selection
      userExperimentSetupData.set(userId, setupData);
      console.log(`[MessageCreate INPUT1_LABEL_CONFIRMED ${interactionIdForLog}] User ${userTag} submitted Input 1 Label: "${input1Label}". State changed to '${setupData.dmFlowState}'.`);

      const habitUnitSelectMenu = new StringSelectMenuBuilder()
          .setCustomId(`${INPUT_UNIT_SELECT_ID_PREFIX}${setupData.currentInputIndex}`) // Dynamic ID e.g., input_unit_select_1
          .setPlaceholder('Daily measurement units/scales');
      
      habitUnitSelectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
              .setLabel("✏️ Enter custom unit...")
              .setValue(CUSTOM_UNIT_OPTION_VALUE)
      );
      PREDEFINED_HABIT_UNIT_SUGGESTIONS.forEach(unitSuggestion => {
          habitUnitSelectMenu.addOptions(
              new StringSelectMenuOptionBuilder()
                  .setLabel(unitSuggestion.label.length > 100 ? unitSuggestion.label.substring(0,97) + '...' : unitSuggestion.label)
                  .setValue(unitSuggestion.label) // Or a unique ID if you prefer
                  .setDescription(unitSuggestion.description.length > 100 ? unitSuggestion.description.substring(0,97) + '...' : unitSuggestion.description)
          );
      });
      
      const rowWithHabitUnitSelect = new ActionRowBuilder().addComponents(habitUnitSelectMenu);
      const unitDropdownPromptMessage = `Okay, your 1st Daily Habit is:\n**"${input1Label}"**.\n\n` +
                                      `How will you measure this daily?\nThis is its **Unit/Scale**.`;

      await message.author.send({
          content: unitDropdownPromptMessage,
          components: [rowWithHabitUnitSelect]
      });
      console.log(`[MessageCreate ASK_INPUT1_UNIT_DROPDOWN ${interactionIdForLog}] DM sent to ${userTag} asking for Input 1 Unit via dropdown.`);
      // ***** END: MODIFIED SECTION *****
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
          .setPlaceholder('How will you measure this habit daily?');
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
                                      `How will you measure this daily?\nThis is its **Unit/Scale**.`;

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
          .setPlaceholder('How will you measure this habit daily?');
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
          `Please type your custom Unit/Scale\n\nE.g.\n● "Minutes"\n● "Reps"\n● "0-10 effort"\n● "Pages"\n\n(Max 15 characters).`
        );
        console.log(`[MessageCreate INPUT1_CUSTOM_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom unit for Input 1.`);
        return; // Keep state, wait for new message
      }

      // Validate the unit string itself for a reasonable length
      const MAX_UNIT_ONLY_LENGTH = 15; // As per our discussion (Label 30, Unit 15)
      if (customInput1Unit.length > MAX_UNIT_ONLY_LENGTH) {
        await message.author.send(
          `That unit ("${customInput1Unit}") is a bit long (max ${MAX_UNIT_ONLY_LENGTH} characters for the unit itself).\n\n` +
          `Could you provide a more concise one for your habit\n**"${input1Label}"**?\n\nE.g.\n● "Minutes"\n● "Reps"\n● "0-10 effort"\n● "Pages"\n\n(Max 15 characters).`
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

      const targetPromptMessage = `Perfect! Your first daily habit is\n\n**${input1Label}** **${customInput1Unit}**.\n\nWhat is your daily **Target amount**?\n\nPlease type the number below\n(0 and up, decimals ok ✅).`;

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
          `Please type your custom Unit/Scale\n\nE.g.\n● "Minutes"\n● "Reps"\n● "0-10 effort"\n● "Pages"\n\n(Max 15 characters).`
        );
        console.log(`[MessageCreate INPUT2_CUSTOM_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom unit for Input 2.`);
        return; // Keep state, wait for new message
      }

      // Validate the unit string itself
      const MAX_UNIT_ONLY_LENGTH = 15; // Consistent
      if (customInput2Unit.length > MAX_UNIT_ONLY_LENGTH) {
        await message.author.send(
          `That unit ("${customInput2Unit}") is a bit long (max ${MAX_UNIT_ONLY_LENGTH} characters for the unit itself).\n\n` +
          `Could you provide a more concise scale/unit to measure for your habit\n**"${input2Label}"**?\n\nMax 15 characters.`
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

      const targetPromptMessage = `Great! Your second daily habit is\n\n**${input2Label}** **${customInput2Unit}**.\n\nWhat is your daily **Target amount**?\n\nPlease type the number below\n(0 and up, decimals ok ✅).`;

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
          `Please type your custom Unit/Scale\n\nE.g.\n● "Minutes"\n● "Reps"\n● "0-10 effort"\n● "Pages"\n\n(Max 15 characters).`
        );
        console.log(`[MessageCreate INPUT3_CUSTOM_UNIT_EMPTY ${interactionIdForLog}] User ${userTag} sent empty custom unit for Input 3.`);
        return; // Keep state, wait for new message
      }

      // Validate the unit string itself
      const MAX_UNIT_ONLY_LENGTH = 15; // Consistent
      if (customInput3Unit.length > MAX_UNIT_ONLY_LENGTH) {
        await message.author.send(
          `That unit ("${customInput3Unit}") is a bit long (max ${MAX_UNIT_ONLY_LENGTH} characters for the unit itself).\n` +
          `Could you provide a more concise scale/unit for your habit\n**"${input3Label}"**?\n\nE.g., "minutes", "reps", "0-10 effort", "pages"\n\nMax 15 characters.`
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

      const targetPromptMessage = `Great! For your 3rd daily habit:\n\n**${input3Label} ${customInput3Unit}**

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
          `Please type just the number (e.g. 3.5,  1,  0).`
        );
        console.log(`[MessageCreate INPUT1_TARGET_EMPTY ${interactionIdForLog}] User ${userTag} sent empty target number for Input 1.`);
        return; // Keep state, wait for new message
      }

      const targetNumber = parseFloat(targetNumberStr);
      if (isNaN(targetNumber)) {
        await message.author.send(
          `Hmm, "${targetNumberStr}" doesn't seem to be a valid number for your target.\n\nWhat is your daily **Target #** for **"${input1Label}"** (measured in ${input1Unit})?\n` +
          `Please type just the number (e.g. 19.5,  1,  0).`
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
        .setTitle(' Habit 1 Confirmed!')
        .setDescription(
            "**${setupData.inputs[0].goal} ${setupData.inputs[0].label} ${setupData.inputs[0].unit}"
        )
        .addFields({ name: '\u200B', value: "Would you like to add another daily habit to test (up to 3 total)?"});

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

              // First, conditionally format the outcome goal
        const isOutcomeTime = TIME_OF_DAY_KEYWORDS.includes(setupData.outcomeUnit.toLowerCase().trim());
        const formattedOutcomeGoal = isOutcomeTime ? formatDecimalAsTime(setupData.outcomeGoal) : setupData.outcomeGoal;

        let summaryDescription = `**🌠 Deeper Wish:**\n${setupData.deeperProblem}\n\n` +
                                "**📊 Daily Outcome to Track:**\n\"${formattedOutcomeGoal}, ${setupData.outcomeUnit}, ${setupData.outcomeLabel}\"\n\n" +
                                "**🛠️ Daily Habits to Test:**\n";

        // Then, conditionally format each input goal within the loop
        setupData.inputs.forEach((input, index) => {
            if (input && input.label && input.unit && input.goal !== undefined) {
                // Check if this specific input's unit is time-based
                const isInputTime = TIME_OF_DAY_KEYWORDS.includes(input.unit.toLowerCase().trim());
                const formattedInputGoal = isInputTime ? formatDecimalAsTime(input.goal) : input.goal;

                summaryDescription += "${index + 1}. \"${formattedInputGoal}, ${input.unit}, ${input.label}\"\n";
            }
        });

      const confirmEmbed = new EmbedBuilder()
          .setColor('#FFBF00') // Amber color
          .setTitle('🔬 Review Your Experiment Metrics')
          .setDescription(summaryDescription + "\n\nDo they look correct?")
          .setFooter({ text: "You can edit them now."});

      const confirmButtons = new ActionRowBuilder()
          .addComponents(
              new ButtonBuilder()
                  .setCustomId('confirm_metrics_proceed_btn') // Same ID as used in add_another_habit_no_btn
                  .setLabel('✅ Looks Good')
                  .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                  .setCustomId('request_edit_metrics_modal_btn') // Same ID
                  .setLabel('✏️ Edit Metrics/Goal')
                  .setStyle(ButtonStyle.Primary)
          );

      await message.author.send({
          content: "Amazing, all 3 daily habits are defined! Here's the full summary of your experiment's metrics:",
          embeds: [confirmEmbed],
          components: [confirmButtons]
      });
      console.log(`[MessageCreate INPUT3_DEFINED_PROMPT_CONFIRM_EDIT ${interactionIdForLog}] All metrics defined. Showed confirm/edit prompt to ${userTag}. State: ${setupData.dmFlowState}.`);
      // ***** MODIFICATION END *****
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
    const welcomePromptMessage = `🎉 Welcome to the Self Science Community, ${member}! 🎉\n\nTo get started, please type the command:\n\n➡️ **/hi**\n\n...and press Send (or enter).`;

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
              .setDescription('Welcome to your experiment control panel')
              .addFields(
                  { name: '🔬 Set Experiment', value: 'Define your goals & metrics.', inline: true },
                  { name: '✍️ Daily Log', value: 'Log your metrics & notes.', inline: true },
                  //{ name: '🔥 Streak Stats', value: 'View your streak and the leaderboard.', inline: true },
                  //{ name: '💡 AI Insights', value: 'Get AI-powered analysis of your data.', inline: true }
              )

            // --- Build the Go Hub buttons ---
            const setExperimentButton = new ButtonBuilder()
              .setCustomId('set_update_experiment_btn')
              .setLabel('🔬 Set Experiment')
              .setStyle(ButtonStyle.Primary);

            const logProgressButton = new ButtonBuilder()
              .setCustomId('log_daily_progress_btn')
              .setLabel('✍️ Daily Log')
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

        // +++ PASTE THIS NEW HANDLER INSIDE THE 'else if (interaction.isButton())' BLOCK +++

    else if (interaction.customId.startsWith('back_to:')) {
        const interactionId = interaction.id;
        const userId = interaction.user.id;
        
        try {
            await interaction.deferUpdate();
            const setupData = userExperimentSetupData.get(userId);

            if (!setupData) {
                await interaction.editReply({ content: "Your session has expired. Please start over.", components: [] });
                return;
            }

            // 1. Determine the destination state from the button's ID
            const destinationState = interaction.customId.split(':')[1];
            
            // 2. Identify the CURRENT state to know what data to clear
            const currentState = setupData.dmFlowState;
            
            // 3. Look up the fields to clear for the state we are LEAVING
            const fieldsToClear = dmFlowConfig[currentState]?.fieldsToClear || [];
            
            console.log(`[Dynamic Back Button ${interactionId}] User ${userId} going from ${currentState} to ${destinationState}. Clearing fields: ${fieldsToClear.join(', ')}`);

            for (const field of fieldsToClear) {
                delete setupData[field];
            }

            // 4. Update to the new (previous) state
            setupData.dmFlowState = destinationState;
            userExperimentSetupData.set(userId, setupData);

            // 5. Get the prompt for the destination state from our config
            const step = dmFlowConfig[destinationState];
            if (!step || typeof step.prompt !== 'function') {
                await interaction.editReply({ content: "Error: Cannot find the previous step in the flow configuration. Please restart the setup.", components: [] });
                return;
            }

            // 6. Generate the content and components for the previous step
            const { content, components } = step.prompt(setupData);

            // 7. Update the message to show the previous step's prompt
            await interaction.editReply({ content, components });

        } catch (error) {
            console.error(`[Dynamic Back Button ERROR ${interactionId}]`, error);
            // Attempt to notify user of error without crashing
            if (!interaction.replied && !interaction.deferred) {
                try { await interaction.reply({ content: "An error occurred while going back. Please try again.", ephemeral: true }); } catch (e) { /* ignore */ }
            } else {
                try { await interaction.followUp({ content: "An error occurred while going back. Please try again.", ephemeral: true }); } catch (e) { /* ignore */ }
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
                .setTitle('REMINDER: Use Commas! ↳ , ↲')
                .setDescription("Each line should have this format:\nGoal # , Unit / Scale , Label\n\nE.g.\n7.5, hours, Sleep\nOR\n8, out of 10, Relationships)\n\n" +
                "Click the button below when you're ready to open the edit form."
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
        const dmChannel = await interaction.user.createDM();

        const goToDmsButton = new ButtonBuilder()
          .setLabel('➡️ Continue in DMs')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.com/channels/@me/${dmChannel.id}`);

        const actionRow = new ActionRowBuilder().addComponents(goToDmsButton);

        await interaction.update({
            content: "🤖 Click the button below\nto continue in the DMs!",
            embeds: [],
            components: [actionRow]
        });

        const updateTime = performance.now();
        console.log(`[${interaction.customId} UPDATED_REPLY ${interaction.id}] Acknowledged button for ${userTag}. Took: ${(updateTime - aiSetupStartTime).toFixed(2)}ms`);
        // New logic to correctly determine guildId and initialize/reset state
        const currentSetupData = userExperimentSetupData.get(userId) || {};
        const guildIdToUse = currentSetupData.guildId || process.env.GUILD_ID; // Prioritize already stored guildId (from DM flow), fallback to ENV

        if (!guildIdToUse) {
            console.error(`[${AI_ASSISTED_SETUP_BTN_ID} CRITICAL ${interaction.id}] guildId could not be determined for user ${userTag}. currentSetupData.guildId was ${currentSetupData.guildId}, process.env.GUILD_ID was ${process.env.GUILD_ID}`);
            await interaction.editReply({ content: "Critical error: Server context is missing for AI setup. Please try starting from `/go` in the server.", components: [], embeds: [] });
            return; // Stop further execution in this handler
        }

        userExperimentSetupData.set(userId, {
            userId: userId,
            userTag: userTag,
            guildId: guildIdToUse,
            interactionId: interaction.id,
            dmFlowState: 'awaiting_wish',
            deeperWish: null,
            deeperProblem: null,
            aiGeneratedOutcomeLabelSuggestions: null,
            outcomeLabel: null,
            outcomeUnit: null,
            outcomeGoal: null,
            currentInputIndex: 1,
            inputs: [],
            aiGeneratedInputLabelSuggestions: null,
            currentInputDefinition: null,
            aiGeneratedUnitSuggestionsForCurrentItem: null,
        });
        console.log(`[${interaction.customId} STATE_INIT ${interaction.id}] Initialized DM flow state for ${userTag}: awaiting_wish.`);

        await dmChannel.send({
            content: "The biggest changes start with a simple wish ✨\n\nWhat's **1 thing** you wish was different in your daily life right now?\n\n**Examples:**\n● 'To have more energy'\n● 'To be less stressed'\n● 'To have better relationships'\n\nTap 💬 (bottom right) and type your wish!"
          //REMOVED \n\n(You'll be able to review and edit everything at the end. Type 'cancel' any time to stop this setup).
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
        const ordinal = nextInputNumber === 2 ? "2nd" : "3rd";

        setupData.dmFlowState = `processing_input${nextInputNumber}_label_suggestions`;
        userExperimentSetupData.set(userId, setupData); // Save state before async

        await interaction.editReply({ // Edit the reply from the "Add another habit?" Yes/No buttons
            content: `Great! Let's define your **${ordinal} Daily Habit**.\n\n🧠 I'll brainstorm some potential Daily Habits for you.\n\nThis might take a moment...`,
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
              habitLabelSelectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                  .setLabel(`✏️ Enter my own custom label for Habit ${nextInputNumber}...`)
                  .setValue(`custom_input${nextInputNumber}_label`) // Dynamic value
                  .setDescription("Choose this to type your own habit label.")
              );
              habitSuggestionsResult.suggestions.forEach((suggestion, index) => {
                habitLabelSelectMenu.addOptions(
                  new StringSelectMenuOptionBuilder()
                    .setLabel(suggestion.label.substring(0, 100))
                    .setValue(`ai_input${nextInputNumber}_label_suggestion_${index}`) // Dynamic value
                    .setDescription((suggestion.briefExplanation || 'AI Suggested Habit').substring(0, 100))
                );
              });
              
              const rowWithHabitLabelSelect = new ActionRowBuilder().addComponents(habitLabelSelectMenu);
              
              // Send a new message in DM for the dropdown
              await interaction.user.send({
                content: `Okay, here are some ideas for your **${ordinal} Daily Habit**.\n\nChoose from the list or tap "✏️ Enter my own..."`,
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

                // First, conditionally format the outcome goal
        const isOutcomeTime = TIME_OF_DAY_KEYWORDS.includes(setupData.outcomeUnit.toLowerCase().trim());
        const formattedOutcomeGoal = isOutcomeTime ? formatDecimalAsTime(setupData.outcomeGoal) : setupData.outcomeGoal;

        let summaryDescription = `**🌠 Deeper Wish:**\n${setupData.deeperProblem}\n\n` +
                                `**📊 Daily Outcome to Track:**\n\`${formattedOutcomeGoal}, ${setupData.outcomeUnit}, ${setupData.outcomeLabel}\`\n\n` +
                                `**🛠️ Daily Habits to Test:**\n`;

        // Then, conditionally format each input goal within the loop
        setupData.inputs.forEach((input, index) => {
            if (input && input.label && input.unit && input.goal !== undefined) {
                // Check if this specific input's unit is time-based
                const isInputTime = TIME_OF_DAY_KEYWORDS.includes(input.unit.toLowerCase().trim());
                const formattedInputGoal = isInputTime ? formatDecimalAsTime(input.goal) : input.goal;

                summaryDescription += `${index + 1}. \`${formattedInputGoal}, ${input.unit}, ${input.label}\`\n`;
            }
        });

        const confirmEmbed = new EmbedBuilder()
            .setColor('#FFBF00') // Amber color
            .setTitle('🔬 Review Your Experiment Metrics')
            .setDescription(summaryDescription + "\n\nDo they look correct?")
            .setFooter({ text: "You can edit them now."});

        const confirmButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('confirm_metrics_proceed_btn')
                    .setLabel('✅ Looks Good')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('request_edit_metrics_modal_btn')
                    .setLabel('✏️ Edit Experiment')
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
            .setTitle('✏️ Edit Your Experiment Metrics')
            .setDescription(
                "**CRUCIAL FORMATTING NOTE:**\n" +
                "Use Commas!!! ↳ , ↲ \n\nEach line should have this format:\nGoal # , Unit / Scale , Label\n\nE.g.\n7.5, hours, Sleep\nOR\n8, out of 10, Relationships)\n\n" +
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

    // --- Handler for "Log Daily Data" Button (NEW, WITH CACHE-FIRST LOGIC) ---
    else if (interaction.customId === 'log_daily_progress_btn') {
      const logButtonStartTime = performance.now();
      const userId = interaction.user.id;
      const interactionId = interaction.id;
      console.log(`[log_daily_progress_btn START ${interactionId}] Button clicked by User: ${userId}`);

      const setupData = userExperimentSetupData.get(userId) || {};
      const hasTimeMetrics = setupData.logFlowHasTimeMetrics; // Check for the cached flag from /go
      const cachedSettings = setupData.preFetchedWeeklySettings;

      try {
        // FAST PATH 1: Cache exists and says NO time metrics. Show modal directly.
        if (hasTimeMetrics === false && cachedSettings) {
            console.log(`[log_daily_progress_btn CACHE_HIT_NO_TIME ${interactionId}] Fast path: Cache indicates no time metrics. Showing modal directly.`);

            // This logic is moved from the old 'show_standard_log_modal_btn' handler
            const modal = new ModalBuilder().setCustomId('dailyLogModal_firebase').setTitle(`📝 Fuel Your Experiment`);
            const components = [cachedSettings.output, cachedSettings.input1, cachedSettings.input2, cachedSettings.input3]
                .filter(metric => metric && metric.label)
                .map(metric => {
                    let customId;
                    if (metric.label === cachedSettings.output.label) customId = 'log_output_value';
                    else if (metric.label === cachedSettings.input1.label) customId = 'log_input1_value';
                    else if (metric.label === cachedSettings.input2.label) customId = 'log_input2_value';
                    else if (metric.label === cachedSettings.input3.label) customId = 'log_input3_value';

                    return new ActionRowBuilder().addComponents(
                        new TextInputBuilder().setCustomId(customId).setLabel(`${metric.label} ${metric.unit}`).setPlaceholder(`Goal: ${metric.goal}`).setStyle(TextInputStyle.Short).setRequired(true)
                    );
                });
            const notesInput = new TextInputBuilder().setCustomId('log_notes').setLabel('💭 Experiment & Life Notes').setStyle(TextInputStyle.Paragraph).setRequired(true);
            let finalPlaceholder = 'What did you observe? Any questions or insights?';
            if (cachedSettings.deeperProblem) {
                finalPlaceholder = `What affected your goal today?\n→ ${cachedSettings.deeperProblem.substring(0, 60)}`;
            }
            notesInput.setPlaceholder(finalPlaceholder);
            components.push(new ActionRowBuilder().addComponents(notesInput));
            modal.addComponents(components);

            // Store settings in logFlowSettings for the modal submission handler to use
            setupData.logFlowSettings = cachedSettings;
            userExperimentSetupData.set(userId, setupData);

            await interaction.showModal(modal);
            console.log(`[log_daily_progress_btn SUCCESS_FAST_PATH ${interactionId}] Standard modal shown directly to ${userId}.`);

        } 
        // FAST PATH 2: Cache exists and says YES there are time metrics. Defer and start sequence.
        else if (hasTimeMetrics === true && cachedSettings) {
            console.log(`[log_daily_progress_btn CACHE_HIT_TIME ${interactionId}] Fast path: Cache indicates time metrics. Deferring and starting sequence.`);
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const metrics = [cachedSettings.output, cachedSettings.input1, cachedSettings.input2, cachedSettings.input3].filter(Boolean);
            const isTimeMetric = (unit) => TIME_OF_DAY_KEYWORDS.includes(unit?.toLowerCase().trim());

            setupData.logFlowSettings = cachedSettings;
            setupData.logFlowTimeMetrics = metrics.filter(metric => isTimeMetric(metric.unit));
            setupData.logFlowOtherMetrics = metrics.filter(metric => !isTimeMetric(metric.unit));
            setupData.timeLogIndex = 0;
            setupData.loggedTimeValues = {};
            userExperimentSetupData.set(userId, setupData);

            await sendNextTimeLogPrompt(interaction, userId);

        }
        // FALLBACK PATH: Cache is missing/stale. Revert to old robust behavior.
        else {
            console.log(`[log_daily_progress_btn FALLBACK_PATH ${interactionId}] Fallback: Cache is missing or stale. Deferring and fetching.`);
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const settingsResult = await callFirebaseFunction('getWeeklySettings', {}, userId);
            if (!settingsResult || !settingsResult.settings) {
                await interaction.editReply({ content: "🤔 You haven't set up your weekly experiment yet. Please use the 'Set Experiment' button first.", components: [] });
                return;
            }

            const settings = settingsResult.settings;
            const metrics = [settings.output, settings.input1, settings.input2, settings.input3].filter(Boolean);
            const isTimeMetric = (unit) => TIME_OF_DAY_KEYWORDS.includes(unit?.toLowerCase().trim());
            const timeMetrics = metrics.filter(metric => isTimeMetric(metric.unit));

            // Store settings in the cache for the next steps
            setupData.logFlowSettings = settings;
            setupData.logFlowTimeMetrics = timeMetrics;
            setupData.logFlowOtherMetrics = metrics.filter(metric => !isTimeMetric(metric.unit));
            setupData.timeLogIndex = 0;
            setupData.loggedTimeValues = {};
            userExperimentSetupData.set(userId, setupData);

            if (timeMetrics.length > 0) {
                // Fetch revealed time metrics, start the sequence
                await sendNextTimeLogPrompt(interaction, userId);
            } else {
                // Fetch revealed NO time metrics, show the intermediate button
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
        if (interaction.replied || interaction.deferred) {
          try { await interaction.editReply({ content: userErrorMessage, components: [], embeds: [] }); }
          catch (e) { console.error(`[log_daily_progress_btn] Fallback editReply failed:`, e); }
        } else if (!interaction.responded) {
          try { await interaction.reply({ content: userErrorMessage, flags: MessageFlags.Ephemeral }); }
          catch (e) { console.error(`[log_daily_progress_btn] Fallback reply failed:`, e); }
        }
      }
    }

    else if (interaction.customId === 'show_standard_log_modal_btn') {
        const showModalButtonStartTime = performance.now();
        const interactionId = interaction.id;
        const userId = interaction.user.id;
        console.log(`[${interaction.customId} START ${interactionId}] Clicked by ${userId}. Building standard modal.`);
        try {
            const setupData = userExperimentSetupData.get(userId);
            const settings = setupData?.logFlowSettings;

            if (!settings) {
                console.error(`[${interaction.customId} ERROR ${interactionId}] Missing logFlowSettings for ${userId}.`);
                await interaction.reply({ content: "Error: Your logging session has expired. Please try clicking 'Log Daily Data' again.", ephemeral: true });
                return;
            }

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
                finalPlaceholder = `What affected your goal today? → ${settings.deeperProblem.substring(0, 60)}`;
            }
            notesInput.setPlaceholder(finalPlaceholder);
            components.push(new ActionRowBuilder().addComponents(notesInput));

            modal.addComponents(components);
            await interaction.showModal(modal);
            console.log(`[${interaction.customId} SUCCESS ${interactionId}] Standard modal shown to ${userId}.`);

        } catch(error) {
            console.error(`[${interaction.customId} ERROR ${interactionId}] Failed to show standard modal for ${userId}:`, error);
        }
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
                finalPlaceholder = `What affected your goal today? → ${settings.deeperProblem.substring(0, 60)}`;
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

            await interaction.editReply({ content: `✅ **Outcome Metric Confirmed!**\n> ${formatDecimalAsTime(decimalTime)} ${setupData.outcomeLabel} ${setupData.outcomeUnit}\n\n🧠 Now, let's define your first **Daily Habit**. I'll brainstorm some ideas...`, components: [], embeds: [] });
            
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
            const addHabitButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('add_another_habit_yes_btn').setLabel('➕ Yes, Add Another').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('add_another_habit_no_btn').setLabel('✅ No, Finish Setup').setStyle(ButtonStyle.Primary));
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
                  .setFooter({ text: `Let's support them! Duration: ${setupData.experimentDuration.replace('_', ' ')}` })
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

    else if (interaction.isStringSelectMenu() && interaction.customId === 'ai_outcome_label_select') {
      const selectMenuSubmitTime = performance.now();
      const interactionId = interaction.id; 
      const userId = interaction.user.id; 
      const userTagForLog = interaction.user.tag; 

      console.log(`[ai_outcome_label_select START ${interactionId}] Received selection from ${userTagForLog}.`); // [cite: 1337]
      try { 
        await interaction.deferUpdate(); 
        const deferTime = performance.now();
        console.log(`[ai_outcome_label_select DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - selectMenuSubmitTime).toFixed(2)}ms`); //[cite: 1338]

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || setupData.dmFlowState !== 'awaiting_outcome_label_dropdown_selection') { 
          console.warn(`[ai_outcome_label_select WARN ${interactionId}] User ${userTagForLog} in unexpected state: ${setupData?.dmFlowState || 'no setupData'}. Current interaction customId: ${interaction.customId}`); //[cite: 1339]
          await interaction.followUp({ content: "It seems there was a mix-up with our current step, or your session expired. Please try starting the AI setup again with the `/go` command if you see this message repeatedly.", ephemeral: true }); // [cite: 1340]
          return; 
        }

        const selectedValue = interaction.values[0]; 
        let outcomeLabel = "";

        if (selectedValue === 'custom_outcome_label') { 
          console.log(`[ai_outcome_label_select CUSTOM_PATH ${interactionId}] User ${userTagForLog} selected 'Enter my own custom label'.`); // [cite: 1343]
          setupData.dmFlowState = 'awaiting_custom_outcome_label_text'; // New state 
          userExperimentSetupData.set(userId, setupData); // [cite: 1344]
        
          await interaction.editReply({
              content: `Ok, please type your custom label below\n\nE.g.\n● "Optimism Score"\n● "Faith in myself"\n● "Productivity Level"`,
              components: [] // This removes the select menu from the message
          });
          console.log(`[ai_outcome_label_select CUSTOM_PROMPT_SENT ${interactionId}] Prompted ${userTagForLog} for custom label text. State: ${setupData.dmFlowState}.`); // [cite: 1348]
          return; // Wait for user's text message 

        } else if (selectedValue.startsWith('ai_suggestion_')) { 
          const suggestionIndex = parseInt(selectedValue.split('ai_suggestion_')[1], 10);
          if (setupData.aiGeneratedOutcomeLabelSuggestions && suggestionIndex >= 0 && suggestionIndex < setupData.aiGeneratedOutcomeLabelSuggestions.length) { 
            const chosenSuggestion = setupData.aiGeneratedOutcomeLabelSuggestions[suggestionIndex];
            outcomeLabel = chosenSuggestion.label; // [cite: 1350]
            // outcomeLabelSuggestedUnitType = chosenSuggestion.suggestedUnitType; // We don't need to store or use this anymore for AI unit gen
          } else { 
            console.error(`[ai_outcome_label_select ERROR ${interactionId}] Invalid AI suggestion index or suggestions not found for ${userTagForLog}. Selected value: ${selectedValue}`); //[cite: 1351]
            await interaction.followUp({ content: "Sorry, I couldn't process that selection. Please try choosing again or restarting the setup.", ephemeral: true }); //[cite: 1352]
            return; 
          }
          // If an AI suggestion was chosen and processed:
          setupData.outcomeLabel = outcomeLabel; //[cite: 1353]
          // delete setupData.outcomeLabelSuggestedUnitType; // Clean up if it was previously set [cite: 1354]
          userExperimentSetupData.set(userId, setupData);
          console.log(`[ai_outcome_label_select AI_SUGGESTION_CONFIRMED ${interactionId}] User ${userTagForLog} selected Outcome Label: "${outcomeLabel}". Proceeding to ask for custom unit.`); // [cite: 1355]
          
          // ***** CORRECTED SECTION FOR OUTCOME UNIT DROPDOWN *****
          setupData.dmFlowState = 'awaiting_outcome_unit_dropdown_selection'; // [cite: 1356]
          userExperimentSetupData.set(userId, setupData); // [cite: 1357]
          
          const outcomeUnitSelectMenu = new StringSelectMenuBuilder()
              .setCustomId(OUTCOME_UNIT_SELECT_ID) 
              .setPlaceholder('Best measure for this outcome?'); // [cite: 1358]
          
              outcomeUnitSelectMenu.addOptions(
              new StringSelectMenuOptionBuilder()
                  .setLabel("✏️ Custom unit/scale...")
                  .setValue(CUSTOM_UNIT_OPTION_VALUE) 
                  .setDescription("Write your own or tweak one of these.")
          ); // [cite: 1360]

          PREDEFINED_OUTCOME_UNIT_SUGGESTIONS.forEach(unitSuggestion => {
              outcomeUnitSelectMenu.addOptions(
                  new StringSelectMenuOptionBuilder()
                      .setLabel(unitSuggestion.label.substring(0, 100)) // CORRECTED
                      .setValue(unitSuggestion.label) // CORRECTED - using label as value
                      .setDescription((unitSuggestion.description || '').substring(0, 100)) // CORRECTED & Added description
              );
          }); 
          
          const rowWithOutcomeUnitSelect = new ActionRowBuilder().addComponents(outcomeUnitSelectMenu); // [cite: 1361]
          const unitDropdownPromptMessage = `**"${setupData.outcomeLabel}"**\n\nWhat's a good daily measure for it?\n\nChoose a numerical scale/unit from the list, or enter your own.`; // [cite: 1362]
          // ***** END: CORRECTED SECTION *****
          
          try {
            // Edit the DM message that had the label dropdown
            await interaction.editReply({ 
              content: unitDropdownPromptMessage,
              components: [rowWithOutcomeUnitSelect] 
            }); // [cite: 1364]
          } catch (editError) {
            console.warn(`[ai_outcome_label_select EDIT_REPLY_FAIL_UNIT_DROPDOWN ${interactionId}] Failed to edit message for outcome unit dropdown. Sending new DM. Error: ${editError.message}`); // [cite: 1365]
            await interaction.user.send({
                content: unitDropdownPromptMessage,
                components: [rowWithOutcomeUnitSelect]
            }); // [cite: 1366]
          }
          console.log(`[ai_outcome_label_select OUTCOME_UNIT_DROPDOWN_SENT ${interactionId}] Prompted ${userTagForLog} with outcome unit dropdown. State: ${setupData.dmFlowState}.`); // [cite: 1367]
          
        } else { 
          console.error(`[ai_outcome_label_select ERROR ${interactionId}] Unknown selection value: ${selectedValue} for user ${userTagForLog}.`); // [cite: 1368]
          await interaction.followUp({ content: "Sorry, an unexpected error occurred with your selection. Please try again.", ephemeral: true }); 
          return; 
        }
      } catch (error) { 
        const errorTime = performance.now();
        console.error(`[ai_outcome_label_select ERROR ${interactionId}] Error processing select menu for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error); // [cite: 1370]
        if (!interaction.replied && !interaction.deferred) { 
            try { await interaction.reply({ content: "Sorry, something went wrong with that selection. Please try again.", ephemeral: true }); // [cite: 1372] } 
         } catch (e) { console.error(`[ai_outcome_label_select ERROR_REPLY_FAIL ${interactionId}]`, e); // [cite: 1373] } 
        }
       } else if (!interaction.replied) { 
            try { await interaction.editReply({ content: "Sorry, something went wrong processing your choice. You might need to try selecting again.", components: [] });//  [cite: 1374] } 
         } catch (e) { console.error(`[ai_outcome_label_select ERROR_EDITREPLY_FAIL ${interactionId}]`, e); // [cite: 1375] } 
        }
       } else { 
            // If an error occurs after a followUp, further followUps might be complex.
        } 
      } 
      const processEndTime = performance.now();
      console.log(`[ai_outcome_label_select END ${interactionId}] Finished processing. Total time: ${(processEndTime - selectMenuSubmitTime).toFixed(2)}ms`); // [cite: 1378]
    }
    
    else if (interaction.isStringSelectMenu() && interaction.customId === 'ai_input1_label_select') {
      const input1LabelSelectSubmitTime = performance.now();
      const interactionId = interaction.id;
      const userId = interaction.user.id;
      const userTagForLog = interaction.user.tag;
      console.log(`[ai_input1_label_select START ${interactionId}] Received Input 1 HABIT LABEL selection from ${userTagForLog}.`);
      
      try {
        await interaction.deferUpdate();
        const deferTime = performance.now();
        console.log(`[ai_input1_label_select DEFERRED ${interactionId}] Interaction deferred. Took: ${(deferTime - input1LabelSelectSubmitTime).toFixed(2)}ms`);

        const setupData = userExperimentSetupData.get(userId);
        if (!setupData || setupData.dmFlowState !== 'awaiting_input1_label_dropdown_selection') {
          console.warn(`[ai_input1_label_select WARN ${interactionId}] User ${userTagForLog} in unexpected state: ${setupData?.dmFlowState || 'no setupData'}.`);
          await interaction.followUp({ content: "It seems there was a mix-up with selecting your first habit's label. Please try restarting the experiment setup with `/go`.", ephemeral: true });
          return;
        }

        const selectedValue = interaction.values[0];
        let chosenHabitLabel = "";
        
        if (selectedValue === 'custom_input1_label') {
          console.log(`[ai_input1_label_select CUSTOM_PATH ${interactionId}] User ${userTagForLog} selected 'Enter my own custom habit label' for Input 1.`);
          setupData.dmFlowState = 'awaiting_input1_label_text';
          userExperimentSetupData.set(userId, setupData);
          const customLabelPrompt = `Please type your habit (or life priority) below\n\nE.g.\n● "Journaling"\n● "Mindful Walk"\n● "Exercise".\n\n(max 30 characters)`;
          await interaction.editReply({ content: customLabelPrompt, components: [] });
          console.log(`[ai_input1_label_select CUSTOM_LABEL_PROMPT_SENT ${interactionId}] Prompted ${userTagForLog} for custom Input 1 label text.`);
          return;

        } else if (selectedValue.startsWith('ai_input1_label_suggestion_')) {
          const suggestionIndex = parseInt(selectedValue.split('ai_input1_label_suggestion_')[1], 10);
          if (setupData.aiGeneratedInputLabelSuggestions?.[suggestionIndex]) {
            chosenHabitLabel = setupData.aiGeneratedInputLabelSuggestions[suggestionIndex].label;
            console.log(`[ai_input1_label_select AI_LABEL_CHOSEN ${interactionId}] User ${userTagForLog} selected AI habit label for Input 1: "${chosenHabitLabel}".`);
          } else {
            console.error(`[ai_input1_label_select ERROR ${interactionId}] Invalid AI habit label suggestion index or suggestions not found.`);
            await interaction.followUp({ content: "Sorry, I couldn't process that habit label selection. Please try choosing again or restarting.", ephemeral: true });
            return;
          }
        } else {
          console.error(`[ai_input1_label_select ERROR ${interactionId}] Unknown habit label selection value: ${selectedValue}.`);
          await interaction.followUp({ content: "Sorry, an unexpected error occurred with your habit label selection. Please try again.", ephemeral: true });
          return;
        }

        // AI-suggested habit label was chosen and is valid
        setupData.currentInputDefinition = { label: chosenHabitLabel };
        delete setupData.aiGeneratedInputLabelSuggestions;
        
        // Transition to the next state using our config
        setupData.dmFlowState = 'awaiting_input1_unit_dropdown_selection';
        userExperimentSetupData.set(userId, setupData);
        
        const step = dmFlowConfig[setupData.dmFlowState];
        const { content, components } = step.prompt(setupData);
        
        await interaction.editReply({ content, components });
        console.log(`[ai_input1_label_select UNIT_DROPDOWN_SENT ${interactionId}] Prompted ${userTagForLog} with habit unit dropdown for Input 1.`);

      } catch (error) {
        const errorTime = performance.now();
        console.error(`[ai_input1_label_select ERROR ${interactionId}] Error processing Input 1 HABIT LABEL select menu for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error);
        if (!interaction.replied) {
            try { await interaction.followUp({ content: "Sorry, an error occurred after your selection. Please try again if needed.", ephemeral: true });
            } catch (e) { console.error(`[ai_input1_label_select ERROR_FOLLOWUP_FAIL ${interactionId}]`, e); }
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
          setupData.dmFlowState = 'awaiting_input2_label_text'; // Set the next state
          userExperimentSetupData.set(userId, setupData);

          const customLabelPrompt = `Please type your habit below\n\nE.g.\n\n● "Journaling"\n● "Mindful Walk"\n● "Exercise"\n\n(max 30 characters)`;

          // This single call correctly updates the DM, replacing the dropdown with the new prompt.
          await interaction.editReply({
              content: customLabelPrompt,
              components: [] // This removes the select menu from the message
          });

          console.log(`[ai_input2_label_select CUSTOM_LABEL_PROMPT_SENT ${interactionId}] Prompted ${userTagForLog} for custom Input 2 label text. State: ${setupData.dmFlowState}.`);
          return; // Wait for the user's text message
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
        
        // ***** CORRECTED SECTION FOR INPUT 2 UNIT DROPDOWN *****
        setupData.dmFlowState = `awaiting_input${setupData.currentInputIndex}_unit_dropdown_selection`; // Will be 'awaiting_input2_unit_dropdown_selection'
        userExperimentSetupData.set(userId, setupData);
        
        const habitUnitSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`${INPUT_UNIT_SELECT_ID_PREFIX}${setupData.currentInputIndex}`) // Will be 'input_unit_select_2'
            .setPlaceholder('How will you measure this habit daily?');
        

        habitUnitSelectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("✏️ Enter my own custom unit...")
                .setValue(CUSTOM_UNIT_OPTION_VALUE)
        );
        PREDEFINED_HABIT_UNIT_SUGGESTIONS.forEach(unitObj => { // unitObj is an OBJECT here
            const option = new StringSelectMenuOptionBuilder()
                .setLabel(unitObj.label.substring(0, 100)) // CORRECTED
                .setValue(unitObj.label); // CORRECTED - using label as value
            if (unitObj.description) {
                option.setDescription((unitObj.description).substring(0, 100)); // CORRECTED & Added description
            }
            habitUnitSelectMenu.addOptions(option);
        });
                
        const rowWithHabitUnitSelect = new ActionRowBuilder().addComponents(habitUnitSelectMenu);
        const unitDropdownPromptMessage = `**Habit ${setupData.currentInputIndex} = ${chosenHabitLabel}**.\n\nHow will you measure this?`;
        // ***** END: CORRECTED SECTION *****
        
        // Edit the ephemeral reply first
        await interaction.editReply({ 
            content: `**Habit ${setupData.currentInputIndex} = ${chosenHabitLabel}**.\n\nHow will you measure this?`,
            components: [] 
        });
        // Send the actual dropdown as a new DM
        await interaction.user.send({
            content: unitDropdownPromptMessage,
            components: [rowWithHabitUnitSelect]
        });
        console.log(`[ai_input${setupData.currentInputIndex}_label_select INPUT_UNIT_DROPDOWN_SENT ${interactionId}] Prompted ${userTagForLog} with habit unit dropdown for Input ${setupData.currentInputIndex}. State: ${setupData.dmFlowState}.`);

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
          setupData.dmFlowState = 'awaiting_input3_label_text';
          userExperimentSetupData.set(userId, setupData);

          const customLabelPrompt = `You chose to enter your own custom label for your 3rd Daily Habit.\n\nPlease type your custom label in a new message below\n(max 30 characters).`;

          // This single call correctly updates the DM, replacing the dropdown with the new prompt.
          await interaction.editReply({
              content: customLabelPrompt,
              components: [] // Removes the select menu
          });

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
        
        // ***** CORRECTED SECTION FOR INPUT 3 UNIT DROPDOWN *****
        setupData.dmFlowState = `awaiting_input${setupData.currentInputIndex}_unit_dropdown_selection`; // Will be 'awaiting_input3_unit_dropdown_selection'
        userExperimentSetupData.set(userId, setupData);
        
        const habitUnitSelectMenu = new StringSelectMenuBuilder()
            .setCustomId(`${INPUT_UNIT_SELECT_ID_PREFIX}${setupData.currentInputIndex}`) // Will be 'input_unit_select_3'
            .setPlaceholder('How will you measure this habit daily?');
        

        habitUnitSelectMenu.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("✏️ Enter my own custom unit...")
                .setValue(CUSTOM_UNIT_OPTION_VALUE)
        );
        PREDEFINED_HABIT_UNIT_SUGGESTIONS.forEach(unitObj => { // unitObj is an OBJECT here
            const option = new StringSelectMenuOptionBuilder()
                .setLabel(unitObj.label.substring(0, 100)) // CORRECTED
                .setValue(unitObj.label); // CORRECTED - using label as value
            if (unitObj.description) {
                option.setDescription((unitObj.description).substring(0, 100)); // CORRECTED & Added description
            }
            habitUnitSelectMenu.addOptions(option);
        });
                      
        const rowWithHabitUnitSelect = new ActionRowBuilder().addComponents(habitUnitSelectMenu);
        const unitDropdownPromptMessage = `**Habit ${setupData.currentInputIndex} = ${chosenHabitLabel}**.\n\nHow will you measure this?`;
        // ***** END: CORRECTED SECTION *****
        
        // Edit the ephemeral reply that confirmed the label choice
        await interaction.editReply({ 
            content: `**Habit ${setupData.currentInputIndex} = ${chosenHabitLabel}**.\n\nHow will you measure this?`,
            components: [] 
        });
        // Send the actual dropdown as a new DM
        await interaction.user.send({
            content: unitDropdownPromptMessage,
            components: [rowWithHabitUnitSelect]
        });
        console.log(`[ai_input${setupData.currentInputIndex}_label_select INPUT_UNIT_DROPDOWN_SENT ${interactionId}] Prompted ${userTagForLog} with habit unit dropdown for Input ${setupData.currentInputIndex}. State: ${setupData.dmFlowState}.`);

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
          const customUnitPrompt = `Okay, you want to enter a custom unit for your Outcome Metric: **"${setupData.outcomeLabel}"**.\n\nPlease type your custom Unit/Scale below (e.g., "0-10 rating", "USD", "Tasks").\nMax 15 characters.`;
          try {
            await interaction.editReply({ content: customUnitPrompt, components: [] });
          } catch (editError) {
            console.warn(`[${OUTCOME_UNIT_SELECT_ID} EDIT_REPLY_FAIL_CUSTOM ${interactionId}] Failed to edit message for custom unit path. Sending new DM. Error: ${editError.message}`);
            await interaction.user.send(customUnitPrompt);
          }
          console.log(`[${OUTCOME_UNIT_SELECT_ID} CUSTOM_UNIT_PROMPT_SENT ${interactionId}] Prompted ${userTagForLog} for custom outcome unit text. State: ${setupData.dmFlowState}.`);
          return;
        } else {
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
            try { await interaction.editReply({ content: "Sorry, something went wrong processing your outcome unit choice. You might need to try selecting again.", components: [] });
            }
            catch (e) { console.error(`[${OUTCOME_UNIT_SELECT_ID} ERROR_EDITREPLY_FAIL ${interactionId}]`, e);
            }
        } else {
            try { await interaction.followUp({ content: "Sorry, an error occurred after your outcome unit selection. Please try again if needed.", ephemeral: true });
            }
            catch (e) { console.error(`[${OUTCOME_UNIT_SELECT_ID} ERROR_FOLLOWUP_FAIL ${interactionId}]`, e);
            }
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
          const customUnitPrompt = `Okay, you want to enter a custom unit for your Habit ${inputIndex}: **"${currentHabitLabel}"**.\n\nPlease type your custom Unit/Scale below (e.g., "minutes", "reps", "0-5 scale").\nMax 15 characters.`;
          await interaction.editReply({ content: customUnitPrompt, components: [] });
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
                  const targetPromptMessage = `Perfect!\nFor your habit **"${currentHabitLabel}"** (measured in **"${selectedValue}"**):\n\nWhat is your daily **Target Number**?\nPlease type the number below (e.g., 30, 1, 0, 5.5).`;
                  await interaction.editReply({ content: targetPromptMessage, components: [] });
              }
              console.log(`[${interaction.customId} PREDEFINED_UNIT_SELECTED_FALLBACK ${interactionId}] Used old logic to send target prompt for Input ${inputIndex}.`);
          }
        }
      } catch (error) {
        const errorTime = performance.now();
        console.error(`[${interaction.customId} ERROR ${interactionId}] Error processing select menu for Input ${inputIndex} for ${userTagForLog} at ${errorTime.toFixed(2)}ms:`, error);
        if (!interaction.replied) {
            try { await interaction.followUp({ content: `Sorry, an error occurred after your unit selection for Habit ${inputIndex}. Please try again if needed.`, ephemeral: true });
            } catch (e) { console.error(`[${interaction.customId} ERROR_FOLLOWUP_FAIL ${interactionId}]`, e); }
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

        // 2. Get data from memory
        const setupData = userExperimentSetupData.get(interaction.user.id);
        const settings = setupData?.logFlowSettings;
        const loggedTimeValues = setupData?.loggedTimeValues || {};

        if (!settings) {
            await interaction.editReply({ content: "❌ Error: Could not find the settings for this experiment log. Please try starting the log process again.", components: [] });
            return;
        }

        // 3. Initialize payload variables
        let payloadOutputValue;
        const payloadInputValues = ["", "", ""];
        const notes = interaction.fields.getTextInputValue('log_notes')?.trim();

        // 4. Consolidate values from modal fields and saved time values
        // Process Output
        if (settings.output && settings.output.label) {
            if (loggedTimeValues.hasOwnProperty(settings.output.label)) {
                payloadOutputValue = loggedTimeValues[settings.output.label];
            } else {
                try { payloadOutputValue = interaction.fields.getTextInputValue('log_output_value')?.trim(); } catch { /* was not in modal */ }
            }
        }

        // Process Inputs
        for (let i = 0; i < 3; i++) {
            const inputConfig = settings[`input${i + 1}`];
            if (inputConfig && inputConfig.label) {
                if (loggedTimeValues.hasOwnProperty(inputConfig.label)) {
                    payloadInputValues[i] = loggedTimeValues[inputConfig.label];
                } else {
                    try { payloadInputValues[i] = interaction.fields.getTextInputValue(`log_input${i + 1}_value`)?.trim(); } catch { /* was not in modal */ }
                }
            }
        }

        // 5. Basic Validation
        // This check is now more specific to allow the number 0 as a valid input.
        if (payloadOutputValue === undefined || payloadOutputValue === null || 
           (payloadInputValues[0] === undefined || payloadInputValues[0] === null || payloadInputValues[0] === "") || 
           !notes) {
            await interaction.editReply({ content: "❌ Missing required fields (Outcome, Habit 1, or Notes)." });
            return;
        }
        if (isNaN(parseFloat(payloadOutputValue)) || (payloadInputValues[0] && isNaN(parseFloat(payloadInputValues[0])))) {
            await interaction.editReply({ content: `❌ Values for Outcome and required Habits must be numbers.` });
            return;
        }

        // 6. Structure final payload
        const payload = {
            outputValue: payloadOutputValue,
            inputValues: payloadInputValues,
            notes,
            userTag: interaction.user.tag
        };
        
        // 7. Clean up temporary log flow data from memory
        if (setupData) {
            delete setupData.logFlowSettings;
            delete setupData.logFlowTimeMetrics;
            delete setupData.logFlowOtherMetrics;
            delete setupData.loggedTimeValues;
            delete setupData.timeLogIndex;
            delete setupData.logTimeH;
            delete setupData.logTimeM;
            delete setupData.logTimeAP;
            userExperimentSetupData.set(interaction.user.id, setupData);
        }

        console.log('[dailyLogModal_firebase] Payload for submitLog (HTTP):', payload); // This log will now show the userTag
        

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
                  const targetRole = await ensureRole(guild, targetFreezeRoleName, null);
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
    // --- START: REPLACE THIS SECTION in render index.txt (The 'experiment_setup_modal' handler) ---
    else if (interaction.isModalSubmit() && interaction.customId === 'experiment_setup_modal') {
        const modalSubmitStartTime = performance.now();
        const interactionIdForLog = interaction.id; 
        const currentInteractionUser = interaction.user;

        const setupData = userExperimentSetupData.get(currentInteractionUser.id);
        if (!setupData || !setupData.userId || !setupData.guildId || !setupData.userTag) {
            console.error(`[experiment_setup_modal CRITICAL_ERROR ${interactionIdForLog}] Core userId, guildId, or userTag missing from setupData for user ${currentInteractionUser.tag}. Flow likely started incorrectly or data lost.`);
            try {
                 if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: "Error: Your setup session data is missing or incomplete. Please restart the setup process using the `/go` command, then click 'Set Experiment'.", ephemeral: true });
                 } else {
                    await interaction.editReply({ content: "Error: Your setup session data is missing or incomplete. Please restart the setup process using the `/go` command, then click 'Set Experiment'.", components: [], embeds: [] });
                 }
            } catch (replyError) {
                 console.error(`[experiment_setup_modal CRITICAL_ERROR_REPLY_FAIL ${interactionIdForLog}] Failed to send session data error reply:`, replyError);
            }
            return; 
        }

        const flowUserId = setupData.userId;
        const flowGuildId = setupData.guildId;
        const flowUserTag = setupData.userTag;
        console.log(`[experiment_setup_modal START ${interactionIdForLog}] Modal submitted by ${currentInteractionUser.tag} (Flow User: ${flowUserTag}, Flow UID: ${flowUserId}, Flow GuildID: ${flowGuildId})`);

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const deferTime = performance.now();
            console.log(`[experiment_setup_modal DEFERRED ${interactionIdForLog}] Reply deferred. Took: ${(deferTime - modalSubmitStartTime).toFixed(2)}ms`);
            
            const deeperProblem = interaction.fields.getTextInputValue('deeper_problem')?.trim();
            const metricStrings = [
                { raw: interaction.fields.getTextInputValue('output_setting')?.trim(), name: "Outcome", isOptional: false },
                { raw: interaction.fields.getTextInputValue('input1_setting')?.trim(), name: "Habit 1", isOptional: false },
                { raw: interaction.fields.getTextInputValue('input2_setting')?.trim(), name: "Habit 2", isOptional: true },
                { raw: interaction.fields.getTextInputValue('input3_setting')?.trim(), name: "Habit 3", isOptional: true },
            ];

            const validationErrors = [];
            const validatedMetrics = [];
            const MAX_LABEL_LENGTH = 45;

            for (const metric of metricStrings) {
                const { raw, name, isOptional } = metric;

                if (!raw && isOptional) {
                    validatedMetrics.push({ name, raw: "" });
                    continue;
                }

                if (!raw && !isOptional) {
                    validationErrors.push(`**${name}:** This field is required.`);
                    continue;
                }

                const parts = raw.split(',').map(p => p.trim());
                if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
                    validationErrors.push(`**${name}:** Must be in "Goal, Unit, Label" format. You entered: "${raw}"`);
                    continue;
                }

                let [goalStr, unit, label] = parts;
                let goalValue = null;

                if (label.length > MAX_LABEL_LENGTH) {
                    validationErrors.push(`**${name} Label:** "${label}" is too long (max ${MAX_LABEL_LENGTH} chars).`);
                }

                const isTimeBased = TIME_OF_DAY_KEYWORDS.includes(unit.toLowerCase().trim());

                if (isTimeBased) {
                    goalValue = parseTimeGoal(goalStr);
                    if (goalValue === null) {
                        validationErrors.push(`**${name} Goal:** "${goalStr}" is not a valid time format (e.g., "8pm", "20:30").`);
                    }
                } else {
                    goalValue = parseFloat(goalStr);
                    if (isNaN(goalValue)) {
                        validationErrors.push(`**${name} Goal:** "${goalStr}" must be a number.`);
                    } else if (goalValue < 0) {
                        validationErrors.push(`**${name} Goal:** Must be 0 or a positive number.`);
                    }
                }
                
                if (validationErrors.length === 0) { // Only add if no errors for this metric so far
                     validatedMetrics.push({ name, goal: goalValue, unit, label });
                }
            }

            if (validationErrors.length > 0) {
                console.warn(`[experiment_setup_modal VALIDATION_FAIL ${interactionIdForLog}] User ${flowUserTag} had validation errors.`);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#ED4245') // Red
                    .setTitle('Validation Error')
                    .setDescription('Please correct the following issues and resubmit the form:\n\n' + validationErrors.map(e => `• ${e}`).join('\n'));
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
                return;
            }

            // If validation passed, reconstruct strings with parsed goals and call Firebase
            const reconstructString = (metric) => {
                if (!metric || metric.raw === "") return "";
                return `${metric.goal}, ${metric.unit}, ${metric.label}`;
            };
            
            const payload = {
                deeperProblem,
                outputSetting: reconstructString(validatedMetrics.find(m => m.name === "Outcome")),
                inputSettings: [
                    reconstructString(validatedMetrics.find(m => m.name === "Habit 1")),
                    reconstructString(validatedMetrics.find(m => m.name === "Habit 2")),
                    reconstructString(validatedMetrics.find(m => m.name === "Habit 3"))
                ],
                userTag: flowUserTag 
            };
            
            console.log(`[experiment_setup_modal FIREBASE_CALL ${interactionIdForLog}] Calling updateWeeklySettings for user ID: ${flowUserId}...`);
            const result = await callFirebaseFunction('updateWeeklySettings', payload, flowUserId);

            if (result && result.success === true && typeof result.message === 'string') {
                console.log(`[experiment_setup_modal FIREBASE_SUCCESS ${interactionIdForLog}] updateWeeklySettings successful for ${flowUserTag}.`);
                setupData.settingsMessage = result.message;
                setupData.rawPayload = payload;
                userExperimentSetupData.set(flowUserId, setupData);

                if (setupData) { 
                    delete setupData.preFetchedWeeklySettings;
                    delete setupData.preFetchedWeeklySettingsTimestamp;
                    delete setupData.logFlowHasTimeMetrics;
                    userExperimentSetupData.set(flowUserId, setupData);
                    console.log(`[experiment_setup_modal CACHE_CLEARED ${interactionIdForLog}] Cleared full pre-fetch cache for user ${flowUserId} after settings update.`);
                }

                const durationEmbed = new EmbedBuilder()
                    .setColor('#47d264')
                    .setTitle('Experiment Duration')
                    .setDescription('When do you want your stats delivered?')
                    .setTimestamp();
                const durationSelect = new StringSelectMenuBuilder()
                    .setCustomId('experiment_duration_select')
                    .setPlaceholder('See your stats in...')
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
                console.log(`[experiment_setup_modal EDIT_REPLY_SUCCESS ${interactionIdForLog}] Edited reply with duration selection.`);
            } else {
                console.error(`[experiment_setup_modal FIREBASE_FAIL ${interactionIdForLog}] updateWeeklySettings failed for ${flowUserTag}. Result:`, result);
                await interaction.editReply({ content: `❌ Error saving your experiment settings: ${result?.error || 'Unknown server error.'}. Please review your inputs for formatting errors and try again.`, components: [], embeds: [] });
            }

        } catch (error) {
            const errorTime = performance.now();
            console.error(`[experiment_setup_modal CATCH_BLOCK_ERROR ${interactionIdForLog}] Error at ${errorTime.toFixed(2)}ms:`, error);
            let userErrorMessage = '❌ An unexpected error occurred. Please try again.';
            if (error.message?.includes('Firebase Error')) {
                userErrorMessage = `❌ ${error.message}`;
            }
            if (interaction.deferred || interaction.replied) {
                try {
                    await interaction.editReply({ content: userErrorMessage, components: [], embeds: [] });
                } catch (editError) {
                    console.error(`[experiment_setup_modal CATCH_BLOCK_ERROR_EDIT_REPLY_FAIL ${interactionIdForLog}] Failed to send error editReply:`, editError);
                }
            }
        }
        const modalProcessEndTime = performance.now();
        console.log(`[experiment_setup_modal END ${interactionIdForLog}] Processing finished for User: ${flowUserTag}. Total time: ${(modalProcessEndTime - modalSubmitStartTime).toFixed(2)}ms`);
    } // --- END: REPLACE THIS SECTION ---

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
