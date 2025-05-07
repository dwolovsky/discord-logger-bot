// ==================================
//      STREAK CONFIGURATION
// ==================================
// ==================================
//      STREAK CONFIGURATION
// ==================================
const STREAK_CONFIG = {
    // Using field names from Firestore 'users' collection directly
    FIELDS: {
        CURRENT_STREAK: 'currentStreak',
        LONGEST_STREAK: 'longestStreak',
        LAST_LOG_TIMESTAMP: 'lastLogTimestamp',
        FREEZES_REMAINING: 'freezesRemaining',
        USER_TAG: 'userTag',
        PENDING_ROLE_UPDATE: 'pendingRoleUpdate',     // For regular streak roles
        PENDING_DM_MESSAGE: 'pendingDmMessage',       // For DMs (milestones, freeze awards, streak resets)
        PENDING_FREEZE_ROLE_UPDATE: 'pendingFreezeRoleUpdate', // For "❄️ Freezes: X" role name
        PENDING_ROLE_CLEANUP: 'pendingRoleCleanup',         // Boolean, true if non-Originator streak roles should be removed on reset
        PENDING_PUBLIC_MESSAGE: 'pendingPublicMessage'    // For specific public announcements like streak reset
        // LAST_FREEZE_DATE: 'lastFreezeDate', // Can be re-added if detailed freeze tracking is needed
        // FROZEN_DATES: 'frozenDates'       // Can be re-added if detailed freeze tracking is needed
    },
    TIMING_RULES: {
        SAME_DAY_HOURS: 17, // Less than 17 hours since last log = same log day (streak doesn't advance)
        MAX_CONSECUTIVE_HOURS: 30 // Less than or equal to 30 hours since last log = consecutive day (streak advances)
        // More than 30 hours = gap (check freezes)
    },
    MILESTONES: {
        // Days when a freeze stack is awarded
        FREEZE_AWARD_DAYS: [15, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 390, 420, 450, 480, 510, 540, 570, 600, 630, 660, 690, 720, 750, 780, 810, 840, 870, 900, 930, 960, 990, 1020],
        // Base name for freeze roles. The bot will create/manage roles like "❄️ Freezes: 0", "❄️ Freezes: 1", etc.
        FREEZE_ROLE_BASENAME: '❄️ Freezes',
        // Role definitions based on streak days reached
        ROLES: [
            // NOTE: Ensure these names match desired Discord role names if the bot is to create them.
            { name: 'Originator', days: 1, color: '#FFB3B3' },      // Light red
            { name: 'Mover', days: 15, color: '#FF6666' },         // Medium red
            { name: 'Navigator', days: 30, color: '#FF0000' },          // Bright red
            { name: 'Signal', days: 60, color: '#CC0000' },          // Deep red
            { name: 'Centurion', days: 100, color: '#990000' },         // Dark red
            { name: 'Vector', days: 150, color: '#FFD1B3' },         // Light orange
            { name: 'Blaster', days: 200, color: '#FFA366' },           // Medium orange
            { name: 'Corona', days: 250, color: '#FF8000' },   // Bright orange
            { name: 'Luminary', days: 300, color: '#CC6600' },    // Deep orange
            { name: 'Orbiter', days: 365, color: '#FFF4B3' },   // Light yellow
            { name: 'Radiance', days: 400, color: '#FFE666' },     // Medium yellow
            { name: 'Pulsar', days: 450, color: '#FFD700' },   // Bright yellow
            { name: 'Quantum', days: 500, color: '#B3FFB3' },     // Light green
            { name: 'Zenith', days: 550, color: '#66FF66' },       // Medium green
            { name: 'Nexus', days: 600, color: '#00FF00' },      // Bright green
            { name: 'Paragon', days: 650, color: '#009900' },           // Deep green
            { name: 'Supernova', days: 700, color: '#B3B3FF' },      // Light blue
            { name: 'Axiom', days: 750, color: '#6666FF' },    // Medium blue
            { name: 'Oracle', days: 800, color: '#0000FF' },          // Bright blue
            { name: 'Divinator', days: 850, color: '#000099' }, // Deep blue
            { name: 'Cosmic', days: 900, color: '#D1B3FF' }, // Light purple
            { name: 'Infinity', days: 950, color: '#9933FF' }, // Medium purple
            { name: 'Transcendent', days: 1000, color: '#4B0082' } // Deep purple/indigo
        ]
    },
    MESSAGES: {
        DM: {
            FREEZE_AWARD: '❄️ STREAK FREEZE AWARDED for reaching ${streak} days!',
            ROLE_ACHIEVEMENT: '🏆 Congratulations! You\'ve earned the ${roleName} title!',
            STREAK_RESET: "Look at your grit!!! You've just proven you care more about your personal transformation than the dopamine spike of +1 to your streak."
        },
        PUBLIC: { // Bot replaces ${userTag} with the actual user tag for public announcements
            STREAK_RESET: '${userTag} has Grit beyond streaks! 🙌🏼. Show them some love!'
            // Add other public message templates here if needed later
        }
    },
    FREEZES: {
      MAX: 5, // Max number of freezes a user can hold
      AUTO_APPLY: true // Assumes freezes are auto-applied if available and needed
    }
};
// ==================================

// Gen 2 Imports
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions"); // Use the shared v2 logger
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

// Initialize the Firebase Admin SDK
admin.initializeApp();

// --- Cloud Functions (Gen 2 Syntax) ---

/**
 * Creates a Firebase Custom Auth Token for the given Discord User ID.
 * Called by the Discord bot frontend.
 * Expects data payload: { userId: "DISCORD_USER_ID" }
 * Returns: { token: "FIREBASE_CUSTOM_TOKEN" } on success.
 */
exports.getFirebaseAuthToken = onCall(async (request) => {
  // Gen 2: Access data via request.data
  // Gen 2: Access auth context (if authenticated) via request.auth
  // --- IMPORTANT SECURITY NOTE --- Add verification later ---

  const userId = request.data.userId;
  if (!userId) {
    // Gen 2: Throw HttpsError directly
    throw new HttpsError(
      'invalid-argument',
      'The function must be called with a `userId` in the data payload.'
    );
  }

  // Gen 2: Use imported logger
  logger.log(`Attempting to create token for userId: ${userId}`);
  try {
    const customToken = await admin.auth().createCustomToken(userId);
    logger.log(`Successfully created token for userId: ${userId}`);
    return { token: customToken };
  } catch (error) {
    logger.error("Error creating custom token for userId:", userId, error);
    throw new HttpsError(
      'internal',
      'Could not create custom token.',
      error.message
    );
  }
});

exports.submitLog = onCall(async (request) => {
    // 1. Check Authentication
    if (!request.auth) {
      logger.warn("submitLog called without authentication.");
      throw new HttpsError('unauthenticated', 'You must be logged in to submit a log.');
    }
  
    // 2. Extract User ID and Input Data
    const userId = request.auth.uid;
    const userTag = request.auth.token?.name || `User_${userId}`;
    // inputValues from bot should be an array of 3 strings (some can be empty if not logged)
    // outputValue is a single string. notes is a string.
    const { inputValues, outputValue, notes } = request.data; 
    logger.log(`submitLog called by user: ${userId} (${userTag}) with inputValues:`, inputValues);
  
    // 3. Basic Payload Validation
    // Bot should always send 3 elements in inputValues, even if some are empty for non-logged optional inputs
    if (!Array.isArray(inputValues) || inputValues.length !== 3 || outputValue == null || notes == null) { 
      throw new HttpsError('invalid-argument', 'Missing required log data fields (inputValues[3], outputValue, notes).');
    }
    if (typeof notes !== 'string' || notes.trim() === '') {
      throw new HttpsError('invalid-argument', 'Notes cannot be empty.');
    }
  
    const db = admin.firestore();
  
    try {
      // 4. Fetch User's Weekly Settings
      const userSettingsRef = db.collection('users').doc(userId);
      const userSettingsSnap = await userSettingsRef.get();
  
      if (!userSettingsSnap.exists || !userSettingsSnap.data()?.weeklySettings) {
        logger.warn(`User ${userId} submitted log but weeklySettings not found.`);
        throw new HttpsError('failed-precondition', 'Please set your weekly goals using /setweek before logging.');
      }
      const settings = userSettingsSnap.data().weeklySettings;
  
      // Helper to check if a setting is configured (i.e., not an EMPTY_SETTING)
      const isConfigured = (setting) => setting && setting.label !== "" && setting.unit !== "" && setting.goal !== null;
      
      // Validate overall settings structure (especially required ones)
      if (!isConfigured(settings.input1) || !isConfigured(settings.output)) {
          logger.error(`User ${userId} has invalid required weeklySettings (Input 1 or Output missing/corrupted):`, settings);
          throw new HttpsError('internal', 'Your core weekly settings (Input 1 or Output) appear corrupted. Please run /setweek again.');
      }
  
      // 5. Validate and Parse Logged Values
      const parsedAndLoggedInputs = [];
  
      // Process Input 1 (Required)
      if (isConfigured(settings.input1)) {
        if (inputValues[0] === null || inputValues[0].trim() === '') {
          throw new HttpsError('invalid-argument', `Value for Input 1 (${settings.input1.label}) is required and cannot be empty.`);
        }
        const parsedVal1 = parseFloat(inputValues[0]);
        if (isNaN(parsedVal1)) {
          throw new HttpsError('invalid-argument', `Value for Input 1 (${settings.input1.label}) must be a number. You entered: "${inputValues[0]}"`);
        }
        parsedAndLoggedInputs.push({ label: settings.input1.label, unit: settings.input1.unit, value: parsedVal1 });
      } // This should always be true due to check above, but good practice
  
      // Process Input 2 (Optional)
      if (isConfigured(settings.input2)) {
        if (inputValues[1] !== null && inputValues[1].trim() !== '') { // If a value was provided
          const parsedVal2 = parseFloat(inputValues[1]);
          if (isNaN(parsedVal2)) {
            throw new HttpsError('invalid-argument', `Value for Input 2 (${settings.input2.label}) must be a number if provided. You entered: "${inputValues[1]}"`);
          }
          parsedAndLoggedInputs.push({ label: settings.input2.label, unit: settings.input2.unit, value: parsedVal2 });
        }
        // If inputValues[1] is empty/null and setting is configured, it means user skipped logging it - which is fine.
      }
      
      // Process Input 3 (Optional)
      if (isConfigured(settings.input3)) {
        if (inputValues[2] !== null && inputValues[2].trim() !== '') { // If a value was provided
          const parsedVal3 = parseFloat(inputValues[2]);
          if (isNaN(parsedVal3)) {
            throw new HttpsError('invalid-argument', `Value for Input 3 (${settings.input3.label}) must be a number if provided. You entered: "${inputValues[2]}"`);
          }
          parsedAndLoggedInputs.push({ label: settings.input3.label, unit: settings.input3.unit, value: parsedVal3 });
        }
      }
  
      // Validate and Parse Output Value (Required)
      if (outputValue === null || outputValue.trim() === '') {
          throw new HttpsError('invalid-argument', `Value for Output (${settings.output.label}) is required and cannot be empty.`);
      }
      const parsedOutputValue = parseFloat(outputValue);
      if (isNaN(parsedOutputValue)) {
        throw new HttpsError('invalid-argument', `Value for Output (${settings.output.label}) must be a number. You entered: "${outputValue}"`);
      }
      // Example: Allowing 0 for satisfaction, but not negative. Adjust if your output can be negative.
      if (parsedOutputValue < 0 && settings.output.label.toLowerCase() === 'satisfaction') { 
        throw new HttpsError('invalid-argument', `Value for Satisfaction must be 0 or greater. You entered: "${parsedOutputValue}"`);
      }
  
  
      // 6. Prepare Firestore Log Document Data
      const logEntry = {
        userId: userId,
        userTag: userTag,
        timestamp: FieldValue.serverTimestamp(),
        logDate: new Date().toISOString().split('T')[0],
        inputs: parsedAndLoggedInputs, // This now only contains successfully parsed AND logged inputs
        output: {
          label: settings.output.label,
          unit: settings.output.unit,
          value: parsedOutputValue
        },
        notes: notes.trim(),
      };
  
      // 7. Write Log Entry to Firestore
      const writeResult = await db.collection('logs').add(logEntry);
      logger.log(`Successfully submitted log ${writeResult.id} for user ${userId}. Logged inputs count: ${parsedAndLoggedInputs.length}`);
  
      // 8. Return simple Success Response
      return {
        success: true,
        logId: writeResult.id
      };
  
    } catch (error) {
      logger.error("Error processing submitLog for user:", userId, error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', 'Failed to save log entry due to a server error.', error.message);
    }
});

/**
 * Calculates and updates the user's streak data.
 */
exports.onLogCreatedUpdateStreak = onDocumentCreated("logs/{logId}", async (event) => {
    const snap = event.data;
    if (!snap) {
        logger.error("No data associated with the event for onLogCreatedUpdateStreak", event);
        return;
    }
    const logData = snap.data();
    const logId = event.params.logId;
    const userId = logData.userId;
    const userTagForMessage = logData.userTag || `User_${userId}`; // For public message

    const logTimestamp = (logData.timestamp && typeof logData.timestamp.toDate === 'function')
                         ? logData.timestamp.toDate() : null;

    if (!userId || !logTimestamp) {
        logger.error("Log document missing valid userId or timestamp for onLogCreatedUpdateStreak.", {
            logId: logId,
            userIdReceived: userId,
            logTimestampValid: !!logTimestamp,
            logData: JSON.stringify(logData)
          });
        return;
    }

    logger.log(`Streak trigger started for user ${userId} (tag: ${userTagForMessage}) due to log ${logId}`);
    const userRef = admin.firestore().collection('users').doc(userId);

    try {
        await admin.firestore().runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            let currentData = { streak: 0, longest: 0, freezes: 0, lastLog: null, userTag: userTagForMessage };
            let previousStreak = 0;

            if (userDoc.exists) {
                const userData = userDoc.data();
                previousStreak = userData[STREAK_CONFIG.FIELDS.CURRENT_STREAK] || 0;
                currentData = {
                    streak: previousStreak,
                    longest: userData[STREAK_CONFIG.FIELDS.LONGEST_STREAK] || 0,
                    freezes: Math.min(userData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING] || 0, STREAK_CONFIG.FREEZES.MAX || 5),
                    lastLog: (userData[STREAK_CONFIG.FIELDS.LAST_LOG_TIMESTAMP] && typeof userData[STREAK_CONFIG.FIELDS.LAST_LOG_TIMESTAMP].toDate === 'function')
                             ? userData[STREAK_CONFIG.FIELDS.LAST_LOG_TIMESTAMP].toDate() : null,
                    userTag: userData[STREAK_CONFIG.FIELDS.USER_TAG] || userTagForMessage
                };
                logger.log(`User ${userId} found. Current streak data:`, currentData);
            } else {
                logger.log(`User document ${userId} not found. Initializing streak data.`);
            }

            let newState = {
                newStreak: 1,
                freezesRemaining: currentData.freezes,
                usedFreeze: false,
                streakBroken: false,
                streakContinued: false // True if streak advanced (new day 1, or incremented)
            };

            if (currentData.lastLog instanceof Date && !isNaN(currentData.lastLog)) {
                const hoursSinceLastLog = Math.abs(logTimestamp.getTime() - currentData.lastLog.getTime()) / (1000 * 60 * 60);
                logger.log(`Hours since last log for ${userId}: ${hoursSinceLastLog.toFixed(2)}`);

                if (hoursSinceLastLog < STREAK_CONFIG.TIMING_RULES.SAME_DAY_HOURS) {
                    newState.newStreak = currentData.streak;
                    newState.streakContinued = false; // Not a new streak day
                    logger.log(`Log within ${STREAK_CONFIG.TIMING_RULES.SAME_DAY_HOURS} hours for ${userId}, keeping streak at ${newState.newStreak}.`);
                } else if (hoursSinceLastLog <= STREAK_CONFIG.TIMING_RULES.MAX_CONSECUTIVE_HOURS) {
                    newState.newStreak = currentData.streak + 1;
                    newState.streakContinued = true;
                    logger.log(`Consecutive log for ${userId} (${hoursSinceLastLog.toFixed(2)} hrs), new streak: ${newState.newStreak}`);
                } else {
                   const daysToFreeze = Math.max(0, Math.ceil((hoursSinceLastLog - STREAK_CONFIG.TIMING_RULES.MAX_CONSECUTIVE_HOURS) / 24) + (hoursSinceLastLog > STREAK_CONFIG.TIMING_RULES.MAX_CONSECUTIVE_HOURS ? 0 : -1) );
                   logger.log(`Gap detected for ${userId} (${hoursSinceLastLog.toFixed(2)} hrs). Days needing freeze: ${daysToFreeze}, Freezes available: ${currentData.freezes}`);

                   if (STREAK_CONFIG.FREEZES.AUTO_APPLY && daysToFreeze > 0 && currentData.freezes >= daysToFreeze) {
                       newState.newStreak = currentData.streak + 1;
                       newState.freezesRemaining = currentData.freezes - daysToFreeze;
                       newState.usedFreeze = true;
                       newState.streakContinued = true;
                       logger.log(`Used ${daysToFreeze} freeze(s) for ${userId}. Remaining: ${newState.freezesRemaining}. New streak: ${newState.newStreak}`);
                   } else {
                       newState.newStreak = 1;
                       newState.streakBroken = true; // Explicitly mark as broken
                       newState.streakContinued = true; // Started a new streak day 1
                       logger.log(`Streak reset for ${userId}. New streak: ${newState.newStreak}. Freezes remaining: ${newState.freezesRemaining}`);
                   }
                }
            } else { // First log ever
                newState.newStreak = 1;
                newState.streakContinued = true;
                logger.log(`First log for user ${userId}. New streak: ${newState.newStreak}`);
            }

            // --- Prepare data for Firestore update ---
            const updateData = {
                [STREAK_CONFIG.FIELDS.CURRENT_STREAK]: newState.newStreak,
                [STREAK_CONFIG.FIELDS.LONGEST_STREAK]: Math.max(currentData.longest, newState.newStreak),
                [STREAK_CONFIG.FIELDS.LAST_LOG_TIMESTAMP]: logData.timestamp,
                [STREAK_CONFIG.FIELDS.FREEZES_REMAINING]: newState.freezesRemaining,
                [STREAK_CONFIG.FIELDS.USER_TAG]: logData.userTag || currentData.userTag, // Persist userTag
                // Always update the freeze role based on the new count
                [STREAK_CONFIG.FIELDS.PENDING_FREEZE_ROLE_UPDATE]: `${STREAK_CONFIG.MILESTONES.FREEZE_ROLE_BASENAME}: ${newState.freezesRemaining}`
            };

            // --- Milestone, DM, Public Message, and Role Cleanup Logic ---
            let roleInfo = null;
            let dmMessageText = null;
            let publicMessageText = null;
            let needsRoleCleanup = false;

            if (newState.streakBroken) {
                // Specific actions for streak reset
                dmMessageText = STREAK_CONFIG.MESSAGES.DM.STREAK_RESET;
                publicMessageText = STREAK_CONFIG.MESSAGES.PUBLIC.STREAK_RESET.replace('${userTag}', userTagForMessage);
                needsRoleCleanup = true; // Flag to remove other streak roles

                const firstRole = STREAK_CONFIG.MILESTONES.ROLES.find(role => role.days === 1);
                if (firstRole) {
                    roleInfo = { name: firstRole.name, color: firstRole.color, days: firstRole.days };
                    logger.log(`Streak reset: Assigning default role ${firstRole.name} and flagging role cleanup.`);
                }
            } else if (newState.streakContinued) { // Streak continued or advanced (but not broken)
                // Check for Role Milestones (only if streak advanced to a new day number)
                if (newState.newStreak > previousStreak || (previousStreak === 0 && newState.newStreak === 1)) {
                    const milestoneRole = STREAK_CONFIG.MILESTONES.ROLES.find(role => role.days === newState.newStreak);
                    if (milestoneRole) {
                        roleInfo = { name: milestoneRole.name, color: milestoneRole.color, days: milestoneRole.days };
                        dmMessageText = STREAK_CONFIG.MESSAGES.DM.ROLE_ACHIEVEMENT.replace('${roleName}', roleInfo.name);
                        logger.log(`User ${userId} hit role milestone: ${roleInfo.name} at ${newState.newStreak} days.`);
                    } else if (newState.newStreak === 1 && !roleInfo) { // Handles first log if not explicitly broken
                        const firstRole = STREAK_CONFIG.MILESTONES.ROLES.find(role => role.days === 1);
                        if (firstRole) {
                           roleInfo = { name: firstRole.name, color: firstRole.color, days: firstRole.days };
                           logger.log(`Assigning default role ${firstRole.name} on first log.`);
                           // Optionally, add a welcome DM here if not already covered by role achievement
                           // if (!dmMessageText) dmMessageText = "Welcome to your streak journey!";
                        }
                    }
                }

                // Check for Freeze Awards (only if streak increased and freeze wasn't just used for continuation)
                if ((newState.newStreak > previousStreak || (previousStreak === 0 && newState.newStreak > 0)) &&
                    STREAK_CONFIG.MILESTONES.FREEZE_AWARD_DAYS.includes(newState.newStreak) &&
                    !newState.usedFreeze) {
                    const maxFreezes = STREAK_CONFIG.FREEZES.MAX || 5;
                    if (updateData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING] < maxFreezes) {
                        updateData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING]++; // Award freeze
                        // Update the PENDING_FREEZE_ROLE_UPDATE again with the new count
                        updateData[STREAK_CONFIG.FIELDS.PENDING_FREEZE_ROLE_UPDATE] = `${STREAK_CONFIG.MILESTONES.FREEZE_ROLE_BASENAME}: ${updateData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING]}`;
                        logger.log(`Awarded freeze to ${userId} at streak ${newState.newStreak}. New total: ${updateData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING]}`);

                        const freezeAwardMsg = STREAK_CONFIG.MESSAGES.DM.FREEZE_AWARD.replace('${streak}', newState.newStreak);
                        dmMessageText = dmMessageText ? `${dmMessageText}\n\n${freezeAwardMsg}` : freezeAwardMsg;
                    } else {
                        logger.log(`User ${userId} hit freeze award day ${newState.newStreak}, but already has max freezes (${maxFreezes}).`);
                    }
                }
            } // else (if streak did not advance, e.g. same day log), no new milestones or messages are generated here.

            // --- Assign pending actions to updateData ---
            if (roleInfo) {
                updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_UPDATE] = roleInfo;
            } else {
                // If no specific role is being set now (e.g. same day log and not a reset)
                // ensure PENDING_ROLE_UPDATE is cleared if it's not a reset where Originator would be set.
                // This handles cases where a user might have had a pending update that wasn't cleared.
                // However, if needsRoleCleanup is true, Originator will be set above.
                if (!needsRoleCleanup) { // Only delete if not part of a reset
                    updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_UPDATE] = FieldValue.delete();
                }
            }

            if (dmMessageText) {
                updateData[STREAK_CONFIG.FIELDS.PENDING_DM_MESSAGE] = dmMessageText;
            } else {
                updateData[STREAK_CONFIG.FIELDS.PENDING_DM_MESSAGE] = FieldValue.delete();
            }

            if (publicMessageText) {
                updateData[STREAK_CONFIG.FIELDS.PENDING_PUBLIC_MESSAGE] = publicMessageText;
            } else {
                updateData[STREAK_CONFIG.FIELDS.PENDING_PUBLIC_MESSAGE] = FieldValue.delete();
            }

            if (needsRoleCleanup) {
                updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_CLEANUP] = true;
            } else {
                updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_CLEANUP] = FieldValue.delete();
            }

            // Filter out undefined values (FieldValue.delete() handles actual removal)
            Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

            logger.log(`Updating user ${userId} Firestore doc with:`, JSON.parse(JSON.stringify(updateData))); // Log a clean version
            transaction.set(userRef, updateData, { merge: true });
        }); // Transaction complete

        logger.log(`Successfully processed streak & milestone update for user ${userId}.`);

    } catch (error) {
        logger.error(`Error running transaction for user ${userId} streak/milestone update:`, error);
        // Consider more robust error handling for triggers if needed.
    }
    return null; // Firestore triggers don't need to return data to the client
});

// Place this revised helper function above updateWeeklySettings in functions/index.js
/**
 * Parses a single priority string "Goal,Unit,Label" into an object.
 * Goal must be a positive rational number. Label length max 45.
 * Throws an HttpsError if validation fails for a non-empty string.
 * @param {string} priorityStr The raw string from the input array.
 * @param {string} fieldName A descriptive name for the field (e.g., "Input 1", "Output") for error messages.
 * @param {boolean} isOptional Indicates if this field can be legitimately empty.
 * @returns {{goal: number, unit: string, label: string} | {isEmpty: true} | null}
 * Object with parsed data if valid and non-empty.
 * {isEmpty: true} if isOptional and priorityStr is empty.
 * Throws HttpsError otherwise.
 */
function parseAndValidatePriority(priorityStr, fieldName, isOptional = false) {
    const trimmedStr = (priorityStr && typeof priorityStr === 'string') ? priorityStr.trim() : "";

    if (!trimmedStr) {
      if (isOptional) {
        return { isEmpty: true }; // Valid empty state for optional fields
      } else {
        throw new HttpsError('invalid-argument', `Setting for ${fieldName} cannot be empty.`);
      }
    }

    // Regex updated to only use comma as a separator:
    // ^(.*?)      - Capture Group 1 (Goal): Non-greedy, any characters up to the first comma.
    // \s*,\s* - Separator 1: A comma, with optional whitespace.
    // (.*?)      - Capture Group 2 (Unit): Non-greedy, any characters up to the second comma.
    // \s*,\s* - Separator 2: A comma, with optional whitespace.
    // (.+)$       - Capture Group 3 (Label): Any characters until the end.
    const priorityPattern = /^(.*?)\s*,\s*(.*?)\s*,\s*(.+)$/; // MODIFIED REGEX
    const match = trimmedStr.match(priorityPattern);

    if (!match) {
      throw new HttpsError(
        'invalid-argument',
        `${fieldName} ("${trimmedStr}") must be in "Goal,Unit,Label" format. Use a comma as separator (e.g., "15.5,minutes,meditation" or "10,pages,Reading"). Note: Decimals in goals are fine.`
      );
    }

    const goalStr = match[1].trim();
    const unit = match[2].trim();
    const label = match[3].trim();

    if (!goalStr || !unit || !label) {
      // This case should ideally be caught by the main regex, but as a fallback:
      throw new HttpsError(
        'invalid-argument',
        `${fieldName} ("${trimmedStr}") must be in "Goal,Unit,Label" format. Use a comma as separator (e.g., "15.5,minutes,meditation" or "10,pages,Reading").`
      );
    }

    // Validate Goal Number (allows decimals)
    const goal = parseFloat(goalStr);
    if (isNaN(goal)) {
      throw new HttpsError(
        'invalid-argument',
        `Goal for ${fieldName} ("${goalStr}") must be a number (e.g., 15 or 8.5).`
      );
    }
    if (goal <= 0) {
      throw new HttpsError(
        'invalid-argument',
        `Goal for ${fieldName} ("${goalStr}") must be a positive number.`
      );
    }

    // Validate Label Length
    const MAX_LABEL_LENGTH = 45; // As per previous discussions
    if (label.length > MAX_LABEL_LENGTH) {
      throw new HttpsError(
        'invalid-argument',
        `Label for ${fieldName} ("${label}") must be ${MAX_LABEL_LENGTH} characters or less.`
      );
    }
    // Unit length validation can be added if needed.

    return { goal: goal, unit: unit, label: label };
}
  
/**
 * Updates the weekly experiment settings for the authenticated user in Firestore.
 * Input 1 and Output are required. Inputs 2 and 3 are optional.
 * Expects data payload: {
 * inputSettings: ["Goal1.Unit1.Label1", "OptGoal2.OptUnit2.OptLabel2", "OptGoal3.OptUnit3.OptLabel3"], // Optional ones can be empty strings
 * outputSetting: "Goal_out.Unit_out.Label_out"
 * }
 */
exports.updateWeeklySettings = onCall(async (request) => {
    if (!request.auth) {
      logger.warn("updateWeeklySettings called without authentication.");
      throw new HttpsError('unauthenticated', 'You must be logged in to update your weekly settings.');
    }
  
    const userId = request.auth.uid;
    const { deeperProblem, inputSettings, outputSetting } = request.data; // Expect 'deeperProblem'
    logger.log(`updateWeeklySettings called by user: ${userId} for problem: "${deeperProblem}"`);
  
    // Validate 'deeperProblem'
    if (typeof deeperProblem !== 'string' || deeperProblem.trim() === '') {
      throw new HttpsError('invalid-argument', 'The "Deeper Problem" statement cannot be empty.');
    }
    // Optional: Add length check for deeperProblem
    const MAX_PROBLEM_LENGTH = 500; // Example
    if (deeperProblem.trim().length > MAX_PROBLEM_LENGTH) {
      throw new HttpsError('invalid-argument', `The "Deeper Problem" statement is too long (max ${MAX_PROBLEM_LENGTH} chars).`);
    }
  
    if (!Array.isArray(inputSettings) || inputSettings.length !== 3) {
      throw new HttpsError('invalid-argument', 'Invalid input: `inputSettings` must be an array of 3 strings.');
    }
    if (!outputSetting || typeof outputSetting !== 'string' || outputSetting.trim() === '') {
      throw new HttpsError('invalid-argument', 'Invalid input: The `outputSetting` string is required and cannot be empty.');
    }
  
    const EMPTY_SETTING = { goal: null, unit: "", label: "" };
    let parsedInput1, parsedInput2, parsedInput3, parsedOutput;
  
    try {
      parsedOutput = parseAndValidatePriority(outputSetting, "Output Metric", false);
      parsedInput1 = parseAndValidatePriority(inputSettings[0], "Input 1", false);
      const tempInput2 = parseAndValidatePriority(inputSettings[1], "Input 2", true);
      parsedInput2 = tempInput2.isEmpty ? EMPTY_SETTING : tempInput2;
      const tempInput3 = parseAndValidatePriority(inputSettings[2], "Input 3", true);
      parsedInput3 = tempInput3.isEmpty ? EMPTY_SETTING : tempInput3;
    } catch (error) {
      logger.warn(`Validation failed for user ${userId} during /experiment settings: ${error.message}`);
      throw error;
    }
  
    const weeklySettingsData = {
      deeperProblem: deeperProblem.trim(), // Store the deeper problem
      output: parsedOutput,
      input1: parsedInput1,
      input2: parsedInput2,
      input3: parsedInput3,
      lastUpdated: FieldValue.serverTimestamp()
      // No experimentStartDate/EndDate yet in this phase
    };
  
    try {
      const db = admin.firestore();
      const userDocRef = db.collection('users').doc(userId);
      await userDocRef.set({ weeklySettings: weeklySettingsData }, { merge: true });
      logger.log(`Successfully updated weekly settings for user ${userId}:`, weeklySettingsData);
  
      const formatSettingForMessage = (setting, name) => {
        if (setting.label) { // Check if it's a configured setting (not an EMPTY_SETTING's label)
          return `${name}: "${setting.label}" (Goal: ${setting.goal} ${setting.unit})`;
        }
        return `${name}: Not set`;
      };
      
      const message = `✅ Experiment settings saved!\n\n🎯 Deeper Problem: "${weeklySettingsData.deeperProblem}"\n📊 Output: "${parsedOutput.label}" (Goal: ${parsedOutput.goal} ${parsedOutput.unit})\n\n${formatSettingForMessage(parsedInput1, "Input 1")}\n${formatSettingForMessage(parsedInput2, "Input 2")}\n${formatSettingForMessage(parsedInput3, "Input 3")}\n\nThese will now appear in your /log form.`;
      
      return { success: true, message: message };
  
    } catch (error) {
      logger.error("Error writing weekly settings to Firestore for user:", userId, error);
      throw new HttpsError('internal', 'Could not save experiment settings due to a server error.', error.message);
    }
  });

  // Add this below the updateWeeklySettings function in functions/index.js

/**
 * Retrieves the weekly experiment settings (3 inputs, 1 output) for the
 * authenticated user from Firestore.
 * Called by the Discord bot frontend (e.g., by the /log command handler).
 * Expects no specific data payload, uses authentication context.
 * Returns: { settings: { input1: { label, unit }, ..., output: { label, unit } } | null } on success.
 */
exports.getWeeklySettings = onCall(async (request) => { // Renamed function
    // 1. Check Authentication
    if (!request.auth) {
      logger.warn("getWeeklySettings called without authentication."); // Updated name
      throw new HttpsError(
        'unauthenticated',
        'You must be logged in to get your weekly settings.' // Updated message
      );
    }
  
    // 2. Get User ID
    const userId = request.auth.uid;
    logger.log(`getWeeklySettings called by authenticated user: ${userId}`);
  
    // 3. Access Firestore
    try {
      const db = admin.firestore();
      const userDocRef = db.collection('users').doc(userId);
  
      // 4. Read the User Document
      const userDocSnap = await userDocRef.get();
  
      // 5. Check if User Document Exists and Has Settings
      if (!userDocSnap.exists) {
        logger.log(`User document ${userId} not found.`);
        // Return null for settings if user doc doesn't exist
        return { settings: null };
      } else {
        const userData = userDocSnap.data();
        // Check specifically for the 'weeklySettings' field.
        if (userData && userData.weeklySettings && typeof userData.weeklySettings === 'object') {
          logger.log(`Found weekly settings for user ${userId}.`);
          // Return the settings map.
          return { settings: userData.weeklySettings };
        } else {
          logger.log(`User document ${userId} exists but has no 'weeklySettings' field.`);
          // Return null for settings if the field is missing.
          return { settings: null };
        }
      }
    } catch (error) {
      // Log any unexpected errors during Firestore access.
      logger.error("Error reading user document or weekly settings for user:", userId, error);
      throw new HttpsError(
        'internal',
        'Could not retrieve weekly settings due to a server error.', // Updated message
        error.message
      );
    }
  });

 /**
 * Clears pending action flags from a user's Firestore document.
 * Called by the Discord bot after it has processed role updates, DMs, etc.
 * Expects no specific data payload, uses authentication context.
 */
exports.clearPendingUserActions = onCall(async (request) => {
    // 1. Check Authentication
    if (!request.auth) {
      logger.warn("clearPendingUserActions called without authentication.");
      throw new HttpsError(
        'unauthenticated',
        'You must be logged in to clear pending actions.'
      );
    }
  
    // 2. Get User ID
    const userId = request.auth.uid;
    logger.log(`clearPendingUserActions called by authenticated user: ${userId}`);
  
    // 3. Access Firestore
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
  
    try {
      // 4. Prepare data to remove pending fields
      // We use FieldValue.delete() to remove the fields from the document.
      // This list should match all "pending" fields set by onLogCreatedUpdateStreak.
      const updatesToClear = {
        [STREAK_CONFIG.FIELDS.PENDING_ROLE_UPDATE]: FieldValue.delete(),
        [STREAK_CONFIG.FIELDS.PENDING_DM_MESSAGE]: FieldValue.delete(),
        [STREAK_CONFIG.FIELDS.PENDING_FREEZE_ROLE_UPDATE]: FieldValue.delete(),
        [STREAK_CONFIG.FIELDS.PENDING_ROLE_CLEANUP]: FieldValue.delete(),
        [STREAK_CONFIG.FIELDS.PENDING_PUBLIC_MESSAGE]: FieldValue.delete()
      };
  
      // 5. Update the user document
      await userRef.update(updatesToClear);
      logger.log(`Successfully cleared pending actions for user ${userId}.`);
  
      return { success: true, message: "Pending actions cleared." };
  
    } catch (error) {
      logger.error("Error clearing pending actions for user:", userId, error);
      // Check if the error is because the document or fields don't exist,
      // which might be okay (e.g., if called twice or if no actions were pending).
      if (error.code === 5) { // Firestore 'NOT_FOUND' error code for .update() on non-existent doc
        logger.warn(`User document ${userId} not found while trying to clear pending actions. Assuming no actions to clear or document was deleted.`);
        return { success: true, message: "No actions to clear or user document not found." };
      }
      throw new HttpsError(
        'internal',
        'Could not clear pending actions due to a server error.',
        error.message
      );
    }
  });

  // Add this function for the /leaderboard command

/**
 * Retrieves leaderboard data (top 10 users by current streak) and
 * the requesting user's rank if they are not in the top 10.
 * Expects no specific data payload, uses authentication context.
 */
exports.getLeaderboard = onCall(async (request) => {
    // 1. Check Authentication
    if (!request.auth) {
      logger.warn("getLeaderboard called without authentication.");
      throw new HttpsError(
        'unauthenticated',
        'You must be logged in to view the leaderboard.'
      );
    }
    const requestingUserId = request.auth.uid;
    logger.log(`getLeaderboard called by authenticated user: ${requestingUserId}`);
  
    // 2. Access Firestore
    const db = admin.firestore();
    const usersCollection = db.collection('users');
  
    try {
      // 3. Fetch Top 10 Users by Current Streak
        const leaderboardQuery = usersCollection
      .orderBy(STREAK_CONFIG.FIELDS.CURRENT_STREAK, 'desc') // Primary sort: highest streak first
      .orderBy(STREAK_CONFIG.FIELDS.LAST_LOG_TIMESTAMP, 'asc') // Secondary sort: earliest timestamp first for ties
      .where(STREAK_CONFIG.FIELDS.CURRENT_STREAK, '>', 0) // Only users with active streaks
      .limit(10);
  
      const leaderboardSnapshot = await leaderboardQuery.get();
      const top10Users = [];
      leaderboardSnapshot.forEach(doc => {
        const userData = doc.data();
        top10Users.push({
          userId: doc.id,
          userTag: userData[STREAK_CONFIG.FIELDS.USER_TAG] || `User_${doc.id}`,
          currentStreak: userData[STREAK_CONFIG.FIELDS.CURRENT_STREAK]
        });
      });
  
      // 4. Fetch All Users' Streaks to Determine Ranks (if necessary)
      //    and the requesting user's data if not in top 10.
      let requestingUserInfo = null;
      let userIsInTop10 = top10Users.some(user => user.userId === requestingUserId);
  
      if (!userIsInTop10 || top10Users.length === 0) { // Fetch all if user not in top 10 or if top 10 is empty (to get user's rank)
        const allActiveUsersQuery = usersCollection
        .where(STREAK_CONFIG.FIELDS.CURRENT_STREAK, '>', 0)
        .orderBy(STREAK_CONFIG.FIELDS.CURRENT_STREAK, 'desc') // Primary sort
        .orderBy(STREAK_CONFIG.FIELDS.LAST_LOG_TIMESTAMP, 'asc'); // Secondary sort for accurate ranking

        const allActiveUsersSnapshot = await allActiveUsersQuery.get();
          
          let rank = 0;
          let foundUser = false;
          allActiveUsersSnapshot.forEach(doc => {
              rank++;
              if (doc.id === requestingUserId) {
                  const userData = doc.data();
                  requestingUserInfo = {
                      userId: doc.id,
                      userTag: userData[STREAK_CONFIG.FIELDS.USER_TAG] || `User_${doc.id}`,
                      currentStreak: userData[STREAK_CONFIG.FIELDS.CURRENT_STREAK],
                      rank: rank,
                      totalActive: allActiveUsersSnapshot.size
                  };
                  foundUser = true;
              }
          });
          // If user has 0 streak, they won't be in allActiveUsersSnapshot
          if (!foundUser) {
              const userDoc = await usersCollection.doc(requestingUserId).get();
              if (userDoc.exists) {
                   const userData = userDoc.data();
                   requestingUserInfo = {
                       userId: requestingUserId,
                       userTag: userData[STREAK_CONFIG.FIELDS.USER_TAG] || `User_${requestingUserId}`,
                       currentStreak: userData[STREAK_CONFIG.FIELDS.CURRENT_STREAK] || 0,
                       rank: userData[STREAK_CONFIG.FIELDS.CURRENT_STREAK] > 0 ? allActiveUsersSnapshot.size + 1 : 0, // Rank 0 or N/A if no streak
                       totalActive: allActiveUsersSnapshot.size
                   };
              } else { // User document doesn't exist
                   requestingUserInfo = {
                       userId: requestingUserId,
                       userTag: request.auth.token?.name || `User_${requestingUserId}`, // Fallback userTag
                       currentStreak: 0,
                       rank: 0,
                       totalActive: allActiveUsersSnapshot.size
                   };
              }
          }
      }
  
  
      // 5. Format the response for the bot
      let messageLines = ["🏆 **Streak Leaderboard** 🏆\n"];
      if (top10Users.length === 0) {
        messageLines.push("No active streaks on the leaderboard yet. Be the first!");
      } else {
        top10Users.forEach((user, index) => {
          messageLines.push(`${index + 1}. ${user.userTag} - ${user.currentStreak} days`);
        });
      }
  
      // Add requesting user's info if not in top 10 and has a streak or if leaderboard is empty
      if (requestingUserInfo && !userIsInTop10 && requestingUserInfo.currentStreak > 0) {
          if (top10Users.length > 0) { // Add separator only if there are top 10 entries
              messageLines.push("--------------------");
          }
          messageLines.push(`Your Rank: #${requestingUserInfo.rank} - ${requestingUserInfo.userTag} - ${requestingUserInfo.currentStreak} days`);
      } else if (requestingUserInfo && requestingUserInfo.currentStreak === 0) {
          if (top10Users.length > 0) {
              messageLines.push("--------------------");
          }
          messageLines.push(`You currently have no active streak, ${requestingUserInfo.userTag}. Start one with /log!`);
      }
  
  
      return {
        success: true,
        message: messageLines.join('\n'),
        leaderboardData: top10Users, // optional: raw data for bot if it wants to format differently
        userData: requestingUserInfo // optional: raw data for requesting user
      };
  
    } catch (error) {
      logger.error("Error fetching leaderboard for user:", requestingUserId, error);
      throw new HttpsError(
        'internal',
        'Could not retrieve leaderboard due to a server error.',
        error.message
      );
    }
  });
  
// ======================================================================
// REMINDERS FOR DISCORD BOT CODE (Render - bot code index js file.txt)
//
// This section outlines the necessary changes and logic for your
// Discord bot to integrate with the updated Firebase Cloud Functions.
// Review this carefully when implementing bot-side changes.
//
// Current Date: May 7, 2025 // Adjust as needed
// Firebase Functions Updated: Yes (Includes experiment settings, logging,
// streaks, pending actions, leaderboard w/ tie-breaking)
// ======================================================================

// --- Core Setup & Firebase Integration ---
// 1. Firebase Admin SDK (Optional but Recommended for Post-Log Checks):
//    - To reliably fetch `pending...` fields after a log, the bot should ideally use the
//      Firebase Admin SDK (requires service account key securely stored on Render).
//    - ALTERNATIVE: Create a simple Firebase callable function `getUserData()` that fetches
//      and returns the necessary fields from the user's document (`currentStreak`, `longestStreak`,
//      `freezesRemaining`, and all `pending...` fields). The bot calls this after `submitLog` succeeds.
//
// 2. Firebase Callable Function Invocation:
//    - Implement robust calling logic (including error handling) for:
//      - `getFirebaseAuthToken({ userId })`
//      - `updateWeeklySettings({ deeperProblem, outputSetting, inputSettings })`
//      - `getWeeklySettings()`
//      - `submitLog({ inputValues, outputValue, notes })`
//      - `clearPendingUserActions()` // <<< Call this LAST, after processing ALL pending actions.
//      - `getLeaderboard()` // <<< New function for the /leaderboard command.
//    - Manage Firebase authentication state within the bot.

// --- Command Changes & Implementation ---
// 3. Rename /setweek to /experiment:
//    - Update SlashCommandBuilder name and description. Re-register commands.
//
// 4. Implement /experiment Button Hub:
//    - On /experiment command: Send ephemeral message with buttons:
//      - [Review Latest Experiment] (ID: `review_latest_experiment_btn`)
//      - [Set/Update Experiment] (ID: `set_update_experiment_btn`)
//      - [Set Reminders & Duration] (ID: `set_experiment_reminders_btn`)
//
// 5. Implement `set_update_experiment_btn` Handler:
//    - Show Modal (`experiment_setup_modal`).
//    - Fields: `deeper_problem`, `output_setting`, `input1_setting`, `input2_setting`, `input3_setting`.
//    - **Emphasize COMMA as the separator** in field labels/placeholders (e.g., "Output Metric (Goal,Unit,Label):").
//    - On submit, call `updateWeeklySettings` Firebase function. Display result ephemerally.
//
// 6. Implement `review_latest_experiment_btn` Handler (Initial):
//    - Call `getWeeklySettings`. Display results ephemerally. Add "Stats coming soon" text.
//
// 7. Implement `set_experiment_reminders_btn` Handler (Initial):
//    - Reply ephemerally: "Coming soon!".
//
// 8. Update /log Command:
//    - On command run: Call `getWeeklySettings`.
//    - Dynamically build Modal based on *configured* settings (check `settings.inputX.label !== ""`).
//      - Use setting labels/placeholders (`Goal: X Unit`). Mark optional TextInputs as `setRequired(false)`.
//    - If no settings, prompt user to run `/experiment`.
//    - On submit: Call `submitLog` Firebase function with `{ inputValues: [val1, val2_or_"", val3_or_""], outputValue, notes }`.
//
// 9. Implement /leaderboard Command:
//    - On command run: Call `getLeaderboard` Firebase function.
//    - Display the `message` string from the function's response ephemerally.

// --- Post-Log Action Processing (CRITICAL BOT LOGIC) ---
// 10. After `submitLog` Success:
//     - The bot MUST fetch the user's latest data from Firestore (via Admin SDK or a `getUserData` function).
//     - Let the fetched data be `userData`. Check for the existence of the following fields:
//
// 11. Process `pendingDmMessage`:
//     - If `userData.pendingDmMessage` exists: Send it as a DM to the user. Handle DM errors.
//
// 12. Process `pendingFreezeRoleUpdate`:
//     - If `userData.pendingFreezeRoleUpdate` exists (e.g., "❄️ Freezes: 3"):
//       - Get the target role name (e.g., "❄️ Freezes: 3").
//       - Find/Create the target role on the Discord server (`ensureRole`).
//       - Get the user's member object (`interaction.member` or fetch if needed).
//       - Remove any OTHER role on the user starting with "❄️ Freezes:".
//       - Add the target role to the user.
//
// 13. Process `pendingRoleCleanup` and `pendingRoleUpdate`:
//     - Get the user's member object.
//     - If `userData.pendingRoleCleanup === true`:
//       - Get a list of all streak milestone role names (from Originator to Transcendent).
//       - Iterate through the user's current roles. Remove any role whose name matches one in the milestone list *EXCEPT* 'Originator'.
//     - If `userData.pendingRoleUpdate` exists:
//       - Let `newRoleInfo = userData.pendingRoleUpdate`.
//       - Find/Create the role (`ensureRole(guild, newRoleInfo.name, newRoleInfo.color)`).
//       - Add this role to the user.
//       - **Public Message (New Role):** If `userData.pendingRoleCleanup` is NOT true AND `newRoleInfo` is for a milestone beyond day 1, post to channel: `🎊 @user has achieved the ${newRoleInfo.name} title! Show some love!`
//
// 14. Process `pendingPublicMessage`:
//     - If `userData.pendingPublicMessage` exists (this is for the streak reset):
//       - Post this message content to the interaction channel.
//
// 15. *** Call `clearPendingUserActions()` ***:
//     - AFTER attempting all actions in steps 11-14, the bot MUST call the `clearPendingUserActions()` Firebase function to prevent reprocessing.
//
// --- Bot-Side Message Construction ---
// 16. `/log` Confirmation Message:
//     - Define an array `INSPIRATIONAL_MESSAGES` in the bot code.
//     - After `submitLog` success AND fetching `userData` (step 10):
//       - Construct the ephemeral reply/DM including:
//         - Basic confirmation text (e.g., "✅ Log saved!").
//         - A random message from `INSPIRATIONAL_MESSAGES`.
//         - Current Streak: `userData.currentStreak`.
//         - Longest Streak: `userData.longestStreak`.
//         - Freezes Remaining: `userData.freezesRemaining`.
//
// --- Utility Functions Needed in Bot ---
// 17. `ensureRole(guild, roleName, color)`: Handles finding or creating Discord roles.
// 18. List/Mechanism for Streak Milestone Roles: Needed for the role cleanup logic.
//
// --- Dependencies ---
// 19. `discord.js`, `dotenv`, `node-fetch` (already installed).
// 20. `firebase-admin` (if using Admin SDK in bot).
// 21. `date-fns` (optional, for advanced date formatting).
//
// ======================================================================

// Final blank line below this comment
