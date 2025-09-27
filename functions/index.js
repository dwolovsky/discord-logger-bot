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
        SAME_DAY_HOURS: 10, // Less than 17 hours since last log = same log day (streak doesn't advance)
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
            { name: 'Level 1', days: 1, color: '#FFB3B3' },      // Light red
            { name: 'Level 15', days: 15, color: '#FF6666' },         // Medium red
            { name: 'Level 30', days: 30, color: '#FF0000' },          // Bright red
            { name: 'Level 60', days: 60, color: '#CC0000' },          // Deep red
            { name: 'Level 100', days: 100, color: '#990000' },         // Dark red
            { name: 'Level 150', days: 150, color: '#FFD1B3' },         // Light orange
            { name: 'Level 200', days: 200, color: '#FFA366' },           // Medium orange
            { name: 'Level 250', days: 250, color: '#FF8000' },   // Bright orange
            { name: 'Level 300', days: 300, color: '#CC6600' },    // Deep orange
            { name: 'Level Kronos', days: 365, color: '#FFF4B3' },   // Light yellow
            { name: 'Level 400', days: 400, color: '#FFE666' },     // Medium yellow
            { name: 'Level 450', days: 450, color: '#FFD700' },   // Bright yellow
            { name: 'Level 500', days: 500, color: '#B3FFB3' },     // Light green
            { name: 'Level 550', days: 550, color: '#66FF66' },       // Medium green
            { name: 'Level 600', days: 600, color: '#00FF00' },      // Bright green
            { name: 'Level 650', days: 650, color: '#009900' },           // Deep green
            { name: 'Level 700', days: 700, color: '#B3B3FF' },      // Light blue
            { name: 'Level Biennium', days: 730, color: '#00998b' },
            { name: 'Level 750', days: 750, color: '#6666FF' },    // Medium blue
            { name: 'Level 800', days: 800, color: '#0000FF' },          // Bright blue
            { name: 'Level 850', days: 850, color: '#000099' }, // Deep blue
            { name: 'Level 900', days: 900, color: '#D1B3FF' }, // Light purple
            { name: 'Level 950', days: 950, color: '#9933FF' }, // Medium purple
            { name: 'Level 1000', days: 1000, color: '#4B0082' } // Deep purple/indigo
        ]
    },
    MESSAGES: {
        DM: {
            FREEZE_AWARD: '❄️ STREAK FREEZE AWARDED for reaching ${streak} days!',
            ROLE_ACHIEVEMENT: '🏆 Congratulations! You\'ve earned the ${roleName} title!',
            STREAK_RESET: "Look at your grit!!!\nYou've just proven you care more about your personal transformation than the dopamine spike of +1 to your streak.\n\n"
        },
        PUBLIC: { // Bot replaces ${userTag} with the actual user tag for public announcements
            STREAK_RESET: '${userTag} has GRIT beyond streaks! They just broke their streak and restarted 🙌🏼. The hardest thing to do!'
            // Add other public message templates here if needed later
        }
    },
    FREEZES: {
      MAX: 5, // Max number of freezes a user can hold
      AUTO_APPLY: true // Assumes freezes are auto-applied if available and needed
    }
};

const MMW_TARGET_MINUTES = [5, 15, 25, 35, 50, 55]; // Your chosen MMWs
const MMW_FLEXIBILITY = 3; // +/- 3 minutes for hitting the target

// --- Default Reminder Messages (Editable Array) ---
const defaultReminderMessages = [
    "What if this ends up being your favorite part of today?",
    "There's a tiny reward hiding in this activity 💎. Can you find it?",
    "Do the thing. Not to be better, but because it might actually feel amazing ⚡.",
    "One moment of focus could change your whole day 💡.",
    "You're one step away from a little good luck today 🎲.",
    "There's something here that your brain loves 🧠💖. Hunt it down.",
    "Today's mission: enjoy it just enough that you'd do it again tomorrow.",
    "This isn't self-discipline. It's self-discovery 🐦‍🔥.",
    "You never know what kind of mood shift one tiny positive action can spark ❤️‍🔥.",
    "Don't chase progress. Chase the spark ⚡ hiding inside your routine.",
    "The goal isn't to finish. The goal is to find something good in the middle.",
    "You're not trying to fix yourself. You're tuning into what works for you today.",
    "The best part of your day might be waiting inside your experiment. Go look 🔎!",
    "This isn't about growth. It's about enjoying one smart choice, right now 🕦.",
    "Forget the big goals. Make this moment just a little more interesting 🪁",
    "It might surprise you 🎊. Especially if you go in with no expectations 🏄🏼‍♀️.",
    "Give it a try. Enjoy it or not, either way your life will get bigger.",
    "Think of this as a treasure hunt, not a to-do list.",
    "Doing experiments is like pressing a 'reset' button on the day.",
    "This one small thing may give you exactly what you didn't know you needed.",
    "What if the highlight of your day is hiding behind the first 30 seconds? ⏳",
    "There's a spark buried in this moment. Light it up 🔥.",
    "You don't need motivation. Just curiosity, and one small move 🧭.",
    "This might not change your life. But it might change your day ☀️.",
    "Let this be the part of your day that actually feels like yours 👑.",
    "There's a good feeling somewhere in this activity. Take your shot 🏹.",
    "One smart move right now could ripple through the next 8 hours 🌊.",
    "No pressure. Just play with what today could become 🛝.",
    "What if this isn't a routine, but an experiment in joy 🧪💫?",
    "Your brain craves novelty. Your experiment's got it right here.",
    "No need to push. Just dip a toe in and see what shows up 🦶🌈.",
    "You're not solving life. You're painting an interesting moment 🎨.",
    "The future's too far. Discover this moment's magic ✨.",
    "Run a tiny test. See if your mood shifts just a little 🎈.",
    "This moment is a blank slate. Want to write something good on it?",
    "Let this be your little act of rebellion against burnout 🛡️.",
    "You've got time for one tiny bet on yourself today 🎰.",
    "If your experiment had a soundtrack, what would it sound like?",
    "This might just reset your whole vibe today 🔄.",
    "Don't overthink it. Start. Then see what unfolds. Plot twist! 📖",
        ];
    // You can add/edit messages in this array later. The backend function
    // 'setExperimentSchedule' will need to be aware if it should use these
    // or if it has its own internal default logic when customReminderMessage is null.
    // ==================================

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

function isTimeMetric(unit) {
    if (!unit) return false;
    // This reuses the TIME_OF_DAY_KEYWORDS constant already defined in your code
    return TIME_OF_DAY_KEYWORDS.includes(unit.toLowerCase().trim());
}

// Gen 2 Imports
const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { jStat } = require("jstat");
const { onSchedule } = require("firebase-functions/v2/scheduler"); 
const { logger, config } = require("firebase-functions"); // MODIFIED: Added 'config'
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

// ============== AI INSIGHTS SETUP (VERTEX AI) ==================
const { VertexAI } = require('@google-cloud/vertexai');

// Initialize Vertex AI using the project's secure, built-in credentials
const vertex_ai = new VertexAI({
    project: process.env.GCLOUD_PROJECT,
    location: 'us-central1'
});

// This replaces the old GEMINI_CONFIG constant by centralizing it here
const generativeModel = vertex_ai.getGenerativeModel({
    // Using the most stable model to ensure it works after the API changes
    model: 'gemini-pro',
    generationConfig: {
        maxOutputTokens: 1500, // Your original value
        temperature: 0.8,      // Your original value
        topP: 0.95,            // Your original value
        topK: 50               // Your original value
    },
});

const MINIMUM_DATAPOINTS_FOR_METRIC_STATS = 5;

const AI_STATS_ANALYSIS_PROMPT_TEMPLATE = (data) => {
  // Helper to format metric stats for the prompt
  const formatMetricStat = (metric) => {
    if (!metric) return "N/A";
    let statString = `${metric.label} (${metric.unit || 'N/A'}): `;
    if (metric.status === 'skipped_insufficient_data') {
      statString += `Not enough data (had ${metric.dataPoints}, needed 5).`;
    } else {
      statString += `Avg: ${metric.average?.toFixed(2) ?? 'N/A'}, Median: ${metric.median?.toFixed(2) ?? 'N/A'}, Variation: ${metric.variationPercentage?.toFixed(2) ?? 'N/A'}% (DP: ${metric.dataPoints ?? 'N/A'})`;
    }
    return statString;
  };

  // Helper to format correlations for the prompt
  const formatCorrelation = (corr) => {
    if (!corr || corr.status !== 'calculated' || corr.coefficient === undefined) return null;
    const rSquared = corr.coefficient * corr.coefficient;
    if (rSquared < 0.0225) return null; // Filter out weak correlations
    return `${corr.label} -> ${corr.vsOutputLabel}: Coeff=${corr.coefficient.toFixed(3)}, PVal=${corr.pValue?.toFixed(3) ?? 'N/A'}, N=${corr.n_pairs ?? 'N/A'}`;
  };

  // Helper to format lag time correlations for the prompt
  const formatLagCorrelation = (lag) => {
      if (!lag || lag.coefficient === undefined) return null;
      const rSquared = lag.coefficient * lag.coefficient;
      if (rSquared < 0.0225) return null;
      return `Yesterday's ${lag.yesterdayMetricLabel} -> Today's ${lag.todayMetricLabel}: Coeff=${lag.coefficient.toFixed(3)}, PVal=${lag.pValue?.toFixed(3) ?? 'N/A'}, N=${lag.n_pairs ?? 'N/A'}`;
  };

  // Helper to format pairwise interactions for the prompt
  const formatPairwiseInteraction = (interaction) => {
    if (!interaction || !interaction.summary || interaction.summary.toLowerCase().includes("skipped") || interaction.summary.toLowerCase().includes("no meaningful conclusion") || interaction.summary.toLowerCase().includes("not enough days")) return null;
    return `When combining ${interaction.input1Label} & ${interaction.input2Label}: ${interaction.summary}`;
  };

  return `
You are a "Self Science" assistant. Your goal is to analyze a user's habit experiment data and present it as a supportive, insightful, and actionable story. Your tone is empowering and non-judgmental, but realistic, focusing on curiosity and small, sustainable changes.

**USER'S DATA SUMMARY:**
- Deeper Wish: "${data.deeperProblem || "Not specified"}"
- Current Logging Streak: ${data.userOverallStreak || 0} days

**METRIC STATISTICS:**
${Object.values(data.calculatedMetrics || {}).map(formatMetricStat).join("\n")}

**RELATIONSHIPS & INTERACTIONS:**
- Direct Correlations:
${Object.values(data.correlationsData || {}).map(formatCorrelation).filter(Boolean).join("\n") || "  No significant direct correlations found."}
- Day-After Effects (Lag Time):
${Object.values(data.lagTimeCorrelations || {}).map(formatLagCorrelation).filter(Boolean).join("\n") || "  No significant day-after effects found."}
- Combined Habit Effects (Pairwise):
${Object.values(data.pairwiseInteractions || {}).map(formatPairwiseInteraction).filter(Boolean).join("\n") || "  No significant combined habit effects found."}

**USER'S NOTES SUMMARY:**
${data.experimentNotesSummary && data.experimentNotesSummary.trim() !== "" ? data.experimentNotesSummary : "  No notes were provided for this experiment period."}

---
**YOUR TASK:**
Generate a single, valid JSON object with three keys: "strikingInsight", "experimentStory", and "nextExperimentSuggestions".

**1. "strikingInsight":**
This key's value must be a JSON object with two keys: "label" (string) and "insight" (string).
Identify the single most striking (and actionable) insight from the data. Use this hierarchy to decide:
  a. Combined Correlation + Lag Time Correlation: A habit that has a different effect today vs. tomorrow.
  b. Pairwise Interactions: Two habits together having a significant effect.
  c. Strong Lag Time Correlations: A habit today clearly influencing an outcome tomorrow.
  d. Strong Direct Correlations: A single habit strongly impacting the outcome on the same day.
  e. Significant Deviation/Consistency: A metric dramatically differing from its goal or showing surprising consistency.
  f. Fallback: If none of the above are strong, find where the user was closest to their goal and frame it as a win.
Your insight must be a single, impactful sentence framed in a supportive, empowering tone.

**2. "experimentStory":**
This key's value must be a JSON object with three keys: "biggestStruggle", "hiddenGrowth", and "aQuestionToPonder".
Write a summary of the user's experiment, broken into 3 distinct sections, each 1-2 sentences long. Weave in themes or a short quote from their notes. Use cautious, observational language ("It seems like...").
- **biggestStruggle:** Acknowledge struggles mentioned in the notes with compassion.
- **hiddenGrowth:** Look for "hidden wins" like maintaining effort or mindset shifts.
- **aQuestionToPonder:** Pose a single, thoughtful coaching question based on a surprising pattern to inspire curiosity.

**3. "nextExperimentSuggestions":**
This key's value must be an array of exactly 3 JSON objects. Each object must have a "framework" (string) and a "suggestion" (string).
Provide actionable, concise experiment ideas based on the data. Choose 3 distinct frameworks from the list below, ensuring variety and relevance.
- **Framework "Seek More Evidence":** A small tweak to an existing habit to confirm or disprove a potential pattern. (Suggestion format: "To gain more clarity: Try [tweak] to observe if [specific effect].")
- **Framework "Minimum Effective Dose":** Find an easier version of a habit that is still effective. (Suggestion format: "To find the easiest effective version: Try reducing [Habit Y] to [smaller amount] and see if you still notice a benefit in your [Outcome].")
- **Framework "What if Not?":** Intentionally remove a habit to see its true impact. (Suggestion format: "To see what happens without it: For one or two days, try *skipping* [Habit X] and notice how it affects your [Outcome].")
- **Framework "Context Swap":** Test if the timing or trigger of a habit is key. (Suggestion format: "To test a different trigger: Try doing [Habit Z] at [different time or location] and see how it impacts your [Outcome].")
- **Framework "Flavor Swap":** Try a slight variation of a habit to find a more enjoyable version. (Suggestion format: "To try a different flavor: Instead of [Habit A], try [a similar but different Habit B] and see if it affects your [Outcome] differently.")
- **Framework "Upstream Intervention":** Based on the "Chain of Behavior" concept, suggest a small, indirect habit that addresses a root cause. (Suggestion format: "An upstream lever: Your notes mention [problem X]. What if you try [small, indirect habit Y] to address that?")

CRITICAL: If you include a quote from the user's notes that contains double quotes, you MUST escape them with a backslash (e.g., "He said \\"hello\\"").
Return ONLY the raw JSON object. Do not include markdown or any other text.
`;
};
// ============== END OF AI INSIGHTS SETUP ==================

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
    // This variable is no longer used for public messages but is kept for other logic.
    const channelId = logData.channelId;

    let displayNameForMessage;
    const storedUserTag = logData.userTag;

    if (storedUserTag && storedUserTag.includes('#')) {
        const usernamePart = storedUserTag.substring(0, storedUserTag.lastIndexOf('#'));
        displayNameForMessage = (usernamePart && usernamePart.trim() !== "") ? usernamePart : storedUserTag;
    } else {
        displayNameForMessage = storedUserTag || `User_${userId}`;
    }

    const logTimestamp = (logData.timestamp && typeof logData.timestamp.toDate === 'function')
                        ? logData.timestamp.toDate() : null;

    if (!userId || !logTimestamp) {
        logger.error("Log document missing valid userId or timestamp.", { logId });
        return;
    }

    logger.log(`Streak trigger started for user ${userId} (tag: ${displayNameForMessage}) due to log ${logId}`);
    const userRef = admin.firestore().collection('users').doc(userId);
    const db = admin.firestore(); // For writing to the new collection

    try {
        await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            let currentData = { streak: 0, longest: 0, freezes: 0, lastLog: null, userTag: displayNameForMessage, totalLogs: 0 };
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
                    userTag: userData[STREAK_CONFIG.FIELDS.USER_TAG] || displayNameForMessage,
                    totalLogs: userData.totalLogs || 0
                };
            }

            let newState = { newStreak: 1, freezesRemaining: currentData.freezes, usedFreeze: false, streakBroken: false, streakContinued: false };
            if (currentData.lastLog instanceof Date && !isNaN(currentData.lastLog)) {
                const hoursSinceLastLog = Math.abs(logTimestamp.getTime() - currentData.lastLog.getTime()) / 3600000;
                logger.log(`Hours since last log for ${userId}: ${hoursSinceLastLog.toFixed(2)}`);

                if (hoursSinceLastLog < STREAK_CONFIG.TIMING_RULES.SAME_DAY_HOURS) {
                    newState.newStreak = currentData.streak;
                    newState.streakContinued = false;
                } else if (hoursSinceLastLog <= STREAK_CONFIG.TIMING_RULES.MAX_CONSECUTIVE_HOURS) {
                    newState.newStreak = currentData.streak + 1;
                    newState.streakContinued = true;
                } else {
                    const daysToFreeze = Math.max(0, Math.ceil((hoursSinceLastLog - STREAK_CONFIG.TIMING_RULES.MAX_CONSECUTIVE_HOURS) / 24));
                    if (STREAK_CONFIG.FREEZES.AUTO_APPLY && daysToFreeze > 0 && currentData.freezes >= daysToFreeze) {
                        newState.newStreak = currentData.streak + 1;
                        newState.freezesRemaining = currentData.freezes - daysToFreeze;
                        newState.usedFreeze = true;
                        newState.streakContinued = true;
                    } else {
                        newState.newStreak = 1;
                        newState.streakBroken = true;
                        newState.streakContinued = true;
                    }
                }
            } else {
                newState.newStreak = 1;
                newState.streakContinued = true;
            }

            const newTotalLogs = currentData.totalLogs + 1;

            const updateData = {
                [STREAK_CONFIG.FIELDS.CURRENT_STREAK]: newState.newStreak,
                [STREAK_CONFIG.FIELDS.LONGEST_STREAK]: Math.max(currentData.longest, newState.newStreak),
                [STREAK_CONFIG.FIELDS.LAST_LOG_TIMESTAMP]: logData.timestamp,
                [STREAK_CONFIG.FIELDS.FREEZES_REMAINING]: newState.freezesRemaining,
                [STREAK_CONFIG.FIELDS.USER_TAG]: logData.userTag || currentData.userTag,
                [STREAK_CONFIG.FIELDS.PENDING_FREEZE_ROLE_UPDATE]: `${STREAK_CONFIG.MILESTONES.FREEZE_ROLE_BASENAME}: ${newState.freezesRemaining}`,
                'totalLogs': newTotalLogs
            };
            let roleInfo = null;
            let dmMessageText = null;
            let tempPublicMessage = null;
            const isTrueFirstDay = (!userDoc.exists || previousStreak === 0) && newState.newStreak === 1 && !newState.streakBroken;
            if (isTrueFirstDay) {
                dmMessageText = `🎉 Welcome to your Self Science journey, ${displayNameForMessage}! You've just logged Day 1. Keep it up! You've also earned the 'Level 1' role. 🔥`;
                tempPublicMessage = `🎉 Please welcome <@${userId}> to their Self Science journey! They've just logged Day 1! Show some support! 👏👏👏`;
                roleInfo = STREAK_CONFIG.MILESTONES.ROLES.find(role => role.days === 1);
                updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_CLEANUP] = FieldValue.delete();
            } else if (newState.streakBroken) {
                dmMessageText = STREAK_CONFIG.MESSAGES.DM.STREAK_RESET;
                tempPublicMessage = `<@${userId}> just broke their streak and restarted it! The hardest thing to do! 🙌🏼 They've logged a total of ${newTotalLogs} days of data so far. That's grit, baby!`;
                roleInfo = STREAK_CONFIG.MILESTONES.ROLES.find(role => role.days === 1);
                updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_CLEANUP] = true;
            } else if (newState.newStreak > previousStreak) {
                const milestoneRole = STREAK_CONFIG.MILESTONES.ROLES.find(role => role.days === newState.newStreak);
                if (milestoneRole) {
                    roleInfo = milestoneRole;
                    dmMessageText = STREAK_CONFIG.MESSAGES.DM.ROLE_ACHIEVEMENT.replace('${roleName}', roleInfo.name);
                    if (roleInfo.days > 1) {
                         tempPublicMessage = `🎉 Big congrats to <@${userId}> for achieving the '${roleInfo.name}' title with a ${newState.newStreak}-day streak!`;
                    }
                } else {
                    tempPublicMessage = `🥳 <@${userId}> just extended their daily logging streak to **${newState.newStreak} days**! (Freezes: ${newState.freezesRemaining} 🧊)`;
                }
            }

            if ((newState.newStreak > previousStreak || (previousStreak === 0 && newState.newStreak > 0)) && STREAK_CONFIG.MILESTONES.FREEZE_AWARD_DAYS.includes(newState.newStreak) && !newState.usedFreeze) {
                if (updateData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING] < (STREAK_CONFIG.FREEZES.MAX || 5)) {
                    updateData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING]++;
                    updateData[STREAK_CONFIG.FIELDS.PENDING_FREEZE_ROLE_UPDATE] = `${STREAK_CONFIG.MILESTONES.FREEZE_ROLE_BASENAME}: ${updateData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING]}`;
                    const freezeAwardMsg = STREAK_CONFIG.MESSAGES.DM.FREEZE_AWARD.replace('${streak}', newState.newStreak);
                    dmMessageText = dmMessageText ? `${dmMessageText}\n\n${freezeAwardMsg}` : freezeAwardMsg;
                }
            }
            
            const MAIN_CHANNEL_ID = '1363161131723526437';

            if (tempPublicMessage) {
                const publicMessageRef = db.collection('pendingPublicMessages').doc();
                transaction.set(publicMessageRef, {
                    message: tempPublicMessage,
                    channelId: MAIN_CHANNEL_ID,
                    userId: userId,
                    createdAt: FieldValue.serverTimestamp(),
                    status: 'pending'
                });
                logger.log(`Queued public message for user ${userId} in main channel ${MAIN_CHANNEL_ID}.`);
            }

            updateData[STREAK_CONFIG.FIELDS.PENDING_DM_MESSAGE] = dmMessageText ? dmMessageText : FieldValue.delete();
            updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_UPDATE] = roleInfo ? roleInfo : FieldValue.delete();
            if (newState.streakBroken) {
                 updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_CLEANUP] = true;
            } else if (isTrueFirstDay) {
                 updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_CLEANUP] = FieldValue.delete();
            }

            transaction.set(userRef, updateData, { merge: true });
        });
        logger.log(`Successfully processed streak & milestone update for user ${userId}.`);
    } catch (error) {
        logger.error(`Error running transaction for user ${userId} streak/milestone update:`, error);
    }
    return null;
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
            return { isEmpty: true };
        } else {
            throw new HttpsError('invalid-argument', `Setting for ${fieldName} cannot be empty.`);
        }
    }

    const priorityPattern = /^(.*?)\s*,\s*(.*?)\s*,\s*(.+)$/;
    const match = trimmedStr.match(priorityPattern);
    if (!match) {
        throw new HttpsError('invalid-argument', `${fieldName} ("${trimmedStr}") must be in "Goal #, Unit, Label" format.`);
    }

    const goalStr = match[1].trim();
    const unit = match[2].trim();
    const label = match[3].trim();

    if (!goalStr || !unit || !label) {
        throw new HttpsError('invalid-argument', `${fieldName} ("${trimmedStr}") is missing a Goal, Unit, or Label.`);
    }

    let goal;
    const lowerUnit = unit.toLowerCase();
    const lowerGoalStr = goalStr.toLowerCase();

    // --- NEW TIME-HANDLING LOGIC ---
    if (lowerUnit === 'am' || lowerUnit === 'pm') {
        let hour = parseInt(goalStr, 10);
        if (isNaN(hour) || hour < 1 || hour > 12) {
            throw new HttpsError('invalid-argument', `For a unit of '${unit}', the Goal for ${fieldName} must be a number from 1 to 12.`);
        }
        if (lowerUnit === 'pm' && hour < 12) hour += 12;
        if (lowerUnit === 'am' && hour === 12) hour = 0; // Midnight case
        goal = hour;
    } else if (lowerGoalStr === 'yes') {
        goal = 1;
    } else if (lowerGoalStr === 'no') {
        goal = 0;
    } else {
        goal = parseFloat(goalStr);
        if (isNaN(goal)) {
            throw new HttpsError('invalid-argument', `Goal for ${fieldName} ("${goalStr}") must be a valid number, 'yes', or 'no'.`);
        }
        if (goal < 0) {
            throw new HttpsError('invalid-argument', `Goal for ${fieldName} must be 0 or a positive number.`);
        }
    }
    // --- END NEW LOGIC ---

    const MAX_LABEL_LENGTH = 45;
    if (label.length > MAX_LABEL_LENGTH) {
        throw new HttpsError('invalid-argument', `Label for ${fieldName} ("${label}") must be ${MAX_LABEL_LENGTH} characters or less.`);
    }

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
exports.updateWeeklySettings = onCall({ minInstances: 1 }, async (request) => {
    if (!request.auth) {
      logger.warn("updateWeeklySettings called without authentication.");
      throw new HttpsError('unauthenticated', 'You must be logged in to update your weekly settings.');
    }
  
    const userId = request.auth.uid;
    const { deeperProblem, inputSettings, outputSetting, userTag: receivedUserTag } = request.data; // Expect 'deeperProblem'
    logger.log(`updateWeeklySettings called by user: ${userId} for problem: "${deeperProblem}"`);
  
    // Validate 'deeperProblem'
    if (typeof deeperProblem !== 'string' || deeperProblem.trim() === '') {
      throw new HttpsError('invalid-argument', 'The "Deeper Goal / Problem / Theme" statement cannot be empty.');
    }
    // Optional: Add length check for deeperProblem
    const MAX_PROBLEM_LENGTH = 500; // Example
    if (deeperProblem.trim().length > MAX_PROBLEM_LENGTH) {
      throw new HttpsError('invalid-argument', `The "Deeper Goal" statement is too long (max ${MAX_PROBLEM_LENGTH} chars).`);
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

     // +++ INSERT THIS NEW VALIDATION BLOCK HERE +++
    const allLabels = [
      parsedOutput.label,
      parsedInput1.label,
      parsedInput2.label,
      parsedInput3.label
    ].filter(label => label && label.trim() !== ""); // Get all non-empty labels

    const uniqueLabels = new Set(allLabels);

    if (uniqueLabels.size < allLabels.length) {
      throw new HttpsError(
        'invalid-argument',
        'Duplicate metric labels are not allowed. Please ensure each tracked habit and outcome has a unique name.'
      );
    }
    // +++ END OF NEW VALIDATION BLOCK +++
  
    const weeklySettingsData = {
      deeperProblem: deeperProblem.trim(), // Store the deeper problem
      output: parsedOutput,
      input1: parsedInput1,
      input2: parsedInput2,
      input3: parsedInput3,
      lastUpdated: FieldValue.serverTimestamp()
    };
  
    try {
      const db = admin.firestore();
      const userDocRef = db.collection('users').doc(userId);
      await userDocRef.set({ weeklySettings: weeklySettingsData, userTag: receivedUserTag }, { merge: true });
      logger.log(`Successfully updated weekly settings for user ${userId}:`, weeklySettingsData);
  
      const formatSettingForMessage = (setting, name) => {
        if (setting.label) { // Check if it's a configured setting (not an EMPTY_SETTING's label)
          return `${name}: "${setting.label}" (Goal: ${setting.goal} ${setting.unit})`;
        }
        return `${name}: Not set`;
      };
      
      const message = `✅ Experiment settings saved!\n\n🎯 Deeper Goal / Problem / Theme: "${weeklySettingsData.deeperProblem}"\n📊 Key Result: "${parsedOutput.label}" (Goal: ${parsedOutput.goal} ${parsedOutput.unit})\n\n${formatSettingForMessage(parsedInput1, "Action 1")}\n${formatSettingForMessage(parsedInput2, "Action 2")}\n${formatSettingForMessage(parsedInput3, "Action 3")}.`;
      
      return { success: true, message: message };
  
    } catch (error) {
      logger.error("Error writing weekly settings to Firestore for user:", userId, error);
      throw new HttpsError('internal', 'Could not save experiment settings due to a server error.', error.message);
    }
  });

  // Add this below the updateWeeklySettings function in functions/index.js
/*
 * Retrieves the weekly experiment settings for the authenticated user from Firestore.
 * Includes detailed logging for performance analysis.
 */
exports.getWeeklySettings = onCall({ minInstances: 1 }, async (request) => {
  const functionStartTime = Date.now();
  // Use request.auth.uid if available, otherwise provide a placeholder for logging if auth is not present
  const loggingUserId = request.auth ? request.auth.uid : "UNKNOWN_USER_NO_AUTH";
  logger.log(`[getWeeklySettings] Invoked by User: ${loggingUserId}. Start Time: ${functionStartTime}`);

  if (!request.auth) {
    logger.warn(`[getWeeklySettings] User: ${loggingUserId} - Called without authentication.`);
    throw new HttpsError(
      'unauthenticated',
      'You must be logged in to get your weekly settings.'
    );
  }

  const userId = request.auth.uid; // Now we know request.auth exists
  logger.log(`[getWeeklySettings] User: ${userId} - Authenticated. Proceeding to fetch settings.`);

  try {
    const db = admin.firestore();
    const userDocRef = db.collection('users').doc(userId);

    const firestoreReadStartTime = Date.now();
    logger.log(`[getWeeklySettings] User: ${userId} - Attempting Firestore read for 'users/${userId}'. Read Start Time: ${firestoreReadStartTime} (Delta from function start: ${firestoreReadStartTime - functionStartTime}ms)`);

    const userDocSnap = await userDocRef.get();

    const firestoreReadEndTime = Date.now();
    logger.log(`[getWeeklySettings] User: ${userId} - Firestore read for 'users/${userId}' completed. Exists: ${userDocSnap.exists}. Duration: ${firestoreReadEndTime - firestoreReadStartTime}ms. Read End Time: ${firestoreReadEndTime} (Delta from function start: ${firestoreReadEndTime - functionStartTime}ms)`);

    let settingsToReturn = null;
    if (!userDocSnap.exists) {
      logger.log(`[getWeeklySettings] User: ${userId} - User document 'users/${userId}' not found.`);
    } else {
      const userData = userDocSnap.data();
      if (userData && userData.weeklySettings && typeof userData.weeklySettings === 'object') {
        logger.log(`[getWeeklySettings] User: ${userId} - Found weeklySettings in document.`);
        settingsToReturn = userData.weeklySettings;
      } else {
        logger.log(`[getWeeklySettings] User: ${userId} - User document 'users/${userId}' exists but has no 'weeklySettings' field or it's not an object.`);
      }
    }

    const functionEndTime = Date.now();
    logger.log(`[getWeeklySettings] User: ${userId} - Successfully completed. Total Duration: ${functionEndTime - functionStartTime}ms. End Time: ${functionEndTime}`);
    return { settings: settingsToReturn };

  } catch (error) {
    const errorTime = Date.now();
    // Log the error with more details including the stack trace
    logger.error(`[getWeeklySettings] User: ${userId} - Error: ${error.message}. Error Occurred At: ${errorTime} (Delta from function start: ${errorTime - functionStartTime}ms)`, {
        errorMessage: error.message,
        errorStack: error.stack, // Important for debugging
        userId: userId
    });
    // Re-throw as HttpsError for the client
    throw new HttpsError(
      'internal', // Or a more specific error code if applicable
      'Could not retrieve weekly settings due to a server error.',
      error.message // Pass the original error message for context if needed by client
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
      // This list should match all "pending" fields set by onLogCreatedUpdateStreak AND analyzeAndSummarizeLogNotes.
      const updatesToClear = {
        [STREAK_CONFIG.FIELDS.PENDING_ROLE_UPDATE]: FieldValue.delete(),
        [STREAK_CONFIG.FIELDS.PENDING_DM_MESSAGE]: FieldValue.delete(),
        [STREAK_CONFIG.FIELDS.PENDING_FREEZE_ROLE_UPDATE]: FieldValue.delete(),
        [STREAK_CONFIG.FIELDS.PENDING_ROLE_CLEANUP]: FieldValue.delete(),
        [STREAK_CONFIG.FIELDS.PENDING_PUBLIC_MESSAGE]: FieldValue.delete(),
        // NEW: AI-specific pending flags
        aiLogAcknowledgment: FieldValue.delete(),
        aiLogComfortMessage: FieldValue.delete(),
        aiLogPublicPostSuggestion: FieldValue.delete(),
        pendingLogAIResponseForDM: FieldValue.delete(),
      };
      // 5. Update the user document
      await userRef.update(updatesToClear);
      logger.log(`Successfully cleared pending actions (including AI-related) for user ${userId}.`);
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


// REPLACE THE PREVIOUS VERSION OF THIS HELPER FUNCTION

/**
 * Parses a value that could be a number, or a 'yes'/'no' string for binary metrics.
 * @param {string} valueStr The raw string value from the user's log.
 * @param {object} metricSetting The experiment setting object for this metric (containing the unit).
 * @param {string} metricName The display name of the metric for error messages (e.g., "Input 1").
 * @returns {{value: number | null, error: string | null}} An object with the parsed numeric value or an error message.
 */
function parseYesNoOrNumber(valueStr, metricSetting, metricName) {

    const trimmedValue = String(valueStr).trim().toLowerCase();

    const skipKeywords = ['n/a', '-', 'na', 'skip'];
    if (skipKeywords.includes(trimmedValue)) {
        return { value: null, error: null }; // Return null to indicate a skipped value
    }

    if (valueStr === null || String(valueStr).trim() === '') {
        return { value: null, error: `Value for ${metricName} (${metricSetting.label}) is required.` };
    }

    // Use the new comprehensive list of keywords to identify a yes/no type metric
    const yesNoKeywords = [
        'yes/no',
        'yes / no',
        'y/n',
        'completion',
        'complete',
        'completed',
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

    const unit = metricSetting.unit?.toLowerCase().trim();

    if (yesNoKeywords.includes(unit)) {
        // If the unit indicates a binary metric, parse specific affirmative/negative inputs
        const affirmativeInputs = ['yes', 'y', '1', 'true', 'complete', 'done', 'did', 'pass', 'check'];
        const negativeInputs = ['no', 'n', '0', 'false', 'incomplete', 'not done', "didn't", 'fail', 'not'];
        
        const lowerVal = String(valueStr).toLowerCase().trim();

        if (affirmativeInputs.includes(lowerVal)) {
            return { value: 1, error: null };
        }
        if (negativeInputs.includes(lowerVal)) {
            return { value: 0, error: null };
        }
        // If the input is not in either list, it's invalid for this type of unit
        return { value: null, error: `For ${metricName} (${metricSetting.label}), please enter a valid yes/no value (e.g., 'yes', 'no', '1', or '0'). You entered: "${valueStr}"` };
    } else {
        // Original logic for purely numeric metrics
        const num = parseFloat(valueStr);
        if (isNaN(num)) {
            return { value: null, error: `Value for ${metricName} (${metricSetting.label}) must be a number. You entered: "${valueStr}"` };
        }
        return { value: num, error: null };
    }
}
/**
 * Saves a user's log and immediately triggers AI analysis, returning the result synchronously.
 * This is an onCall function.
 * Expected request.data: { inputValues, outputValue, notes, userTag, channelId }
 */
exports.submitAndAnalyzeLog = onCall(async (request) => {
    // 1. Authentication
    if (!request.auth) {
        logger.warn("submitAndAnalyzeLog called without authentication.");
        throw new HttpsError('unauthenticated', 'You must be logged in to submit a log.');
    }
    const userId = request.auth.uid;
    const userTagFromAuth = request.auth.token?.name || `User_${userId}`;
    
    // Destructure all expected data, including the new channelId
    const { inputValues, outputValue, notes, userTag: receivedUserTag, channelId } = request.data;
    const userTagForLog = receivedUserTag || userTagFromAuth;

    logger.info(`submitAndAnalyzeLog: Processing request for user: ${userId} (${userTagForLog})`);

    // 2. Core Logic (Adapted from the old `submitLog` HTTP function)
    const db = admin.firestore();
    try {
        // --- Basic Payload Validation ---
        if (!channelId) {
            throw new HttpsError('invalid-argument', 'Missing required channelId.');
        }
        if (!Array.isArray(inputValues) || inputValues.length !== 3 || outputValue == null || notes == null) {
            throw new HttpsError('invalid-argument', 'Missing required log data fields (inputValues[3], outputValue, notes).');
        }
        if (typeof notes !== 'string' || notes.trim() === '') {
            throw new HttpsError('invalid-argument', 'Notes cannot be empty.');
        }

        // --- Fetch User's Weekly Settings ---
        const userSettingsRef = db.collection('users').doc(userId);
        const userSettingsSnap = await userSettingsRef.get();

        if (!userSettingsSnap.exists || !userSettingsSnap.data()?.weeklySettings) {
            throw new HttpsError('failed-precondition', 'Please set your weekly goals using /go before logging.');
        }
        const settings = userSettingsSnap.data().weeklySettings;

        // --- Helper for validation ---
        const isConfigured = (setting) => setting && typeof setting.label === 'string' && setting.label.trim() !== "" && typeof setting.unit === 'string' && setting.goal !== null && !isNaN(parseFloat(setting.goal));
        
        if (!isConfigured(settings.input1) || !isConfigured(settings.output)) {
            logger.error(`submitLog (HTTP): User ${userId} has invalid/incomplete required weeklySettings (Input 1 or Output):`, settings);
            throw new HttpsError('internal', 'Your core weekly settings (Input 1 or Output) appear corrupted or incomplete. Please run /exp again.');
        }

        // --- Validate and Parse Logged Values ---
        const parsedAndLoggedInputs = [];
        let parsedOutputValue;

        // Process Output
        const outputResult = parseYesNoOrNumber(outputValue, settings.output, 'Outcome');
        if (outputResult.error) {
            throw new HttpsError('invalid-argument', outputResult.error);
        }
        parsedOutputValue = outputResult.value;

        // Process Input 1 (always required)
        const input1Result = parseYesNoOrNumber(inputValues[0], settings.input1, 'Input 1');
        if (input1Result.error) {
            throw new HttpsError('invalid-argument', input1Result.error);
        }
        parsedAndLoggedInputs.push({ label: settings.input1.label, unit: settings.input1.unit, value: input1Result.value, goal: settings.input1.goal });

        // Process Input 2 (if configured)
        if (isConfigured(settings.input2)) {
            const input2Result = parseYesNoOrNumber(inputValues[1], settings.input2, 'Input 2');
            if (input2Result.error) {
                throw new HttpsError('invalid-argument', input2Result.error);
            }
            parsedAndLoggedInputs.push({ label: settings.input2.label, unit: settings.input2.unit, value: input2Result.value, goal: settings.input2.goal });
        }
  
        // Process Input 3 (if configured)
        if (isConfigured(settings.input3)) {
            const input3Result = parseYesNoOrNumber(inputValues[2], settings.input3, 'Input 3');
            if (input3Result.error) {
                throw new HttpsError('invalid-argument', input3Result.error);
            }
            parsedAndLoggedInputs.push({ label: settings.input3.label, unit: settings.input3.unit, value: input3Result.value, goal: settings.input3.goal });
        }
        // --- Prepare Firestore Log Document Data ---
        const logEntry = {
          userId: userId,
          userTag: userTagForLog,
          channelId: channelId, // <-- The only new line in this object
          timestamp: FieldValue.serverTimestamp(),
          logDate: new Date().toISOString().split('T')[0],
          inputs: parsedAndLoggedInputs,
          output: {
            label: settings.output.label,
            unit: settings.output.unit,
            value: parsedOutputValue,
            goal: settings.output.goal
          },
          notes: notes.trim(),
          deeperProblem: settings.deeperProblem || "Not set at time of logging",
        };

        // --- Write Log Entry to Firestore ---
        const writeResult = await db.collection('logs').add(logEntry);
        const logId = writeResult.id;
        logger.info(`submitAndAnalyzeLog: Successfully submitted log ${logId} for user ${userId}.`);

        // 3. Immediately Trigger AI Analysis
        let aiResponse = null;
        if (notes.trim()) {
            try {
                aiResponse = await _analyzeAndSummarizeNotesLogic(logId, userId, userTagForLog);
            } catch (aiError) {
                logger.error(`submitAndAnalyzeLog: _analyzeAndSummarizeNotesLogic failed for log ${logId}. Error:`, aiError);
                aiResponse = null; 
            }
        }

        // 4. Return the combined result to the bot
        return {
            success: true,
            logId: logId,
            aiResponse: aiResponse
        };

    } catch (error) {
        logger.error("submitAndAnalyzeLog: Error during log submission for user:", userId, error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError('internal', 'Failed to save log entry due to an internal server error.', error.message);
    }
});

/**
 * Retrieves necessary user data fields for the bot after a log submission.
 * Used to check for pending actions (DMs, roles) set by triggers.
 * Expects no data payload, uses authentication context.
 */
exports.getUserDataForBot = onCall(async (request) => {
    // 1. Check Authentication
    if (!request.auth) {
      logger.warn("getUserDataForBot called without authentication.");
      throw new HttpsError('unauthenticated', 'Authentication required.');
    }
    const userId = request.auth.uid;
    logger.log(`getUserDataForBot called by authenticated user: ${userId}`);
  
    // 2. Access Firestore
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
  
    try {
      const userDoc = await userRef.get();
  
      if (!userDoc.exists) {
        logger.log(`[getUserDataForBot] User document ${userId} not found. Returning default data.`);
        // Return default structure if user doc doesn't exist (shouldn't happen if log was just submitted)
        return { success: true, userData: { userId: userId, currentStreak: 0, longestStreak: 0, freezesRemaining: 0 } };
      }
  
      const firestoreData = userDoc.data();
      // 3. Selectively return only the fields the bot needs
      // This prevents sending unnecessary sensitive data if the user doc grows.
      const userDataForBot = {
        userId: userId,
        userTag: firestoreData[STREAK_CONFIG.FIELDS.USER_TAG] || null,
        currentStreak: firestoreData[STREAK_CONFIG.FIELDS.CURRENT_STREAK] || 0,
        longestStreak: firestoreData[STREAK_CONFIG.FIELDS.LONGEST_STREAK] || 0,
        freezesRemaining: firestoreData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING] || 0,
        // Include all potential pending fields
        pendingDmMessage: firestoreData[STREAK_CONFIG.FIELDS.PENDING_DM_MESSAGE] || null,
        pendingRoleUpdate: firestoreData[STREAK_CONFIG.FIELDS.PENDING_ROLE_UPDATE] || null, // This holds { name, color, days } or null
        pendingFreezeRoleUpdate: firestoreData[STREAK_CONFIG.FIELDS.PENDING_FREEZE_ROLE_UPDATE] || null, // This holds role name e.g., "❄️ Freezes: 2" or null
        pendingRoleCleanup: firestoreData[STREAK_CONFIG.FIELDS.PENDING_ROLE_CLEANUP] || false, // Boolean
        pendingPublicMessage: firestoreData[STREAK_CONFIG.FIELDS.PENDING_PUBLIC_MESSAGE] || null,
      };
  
      logger.log(`[getUserDataForBot] Returning data for ${userId}:`, userDataForBot);
      return { success: true, userData: userDataForBot };
  
    } catch (error) {
      logger.error(`[getUserDataForBot] Error fetching data for user ${userId}:`, error);
      throw new HttpsError('internal', 'Could not retrieve user data.', error.message);
    }
  });

  // Add this new function in functions/index.js

/**
 * Retrieves the current and longest streak for the authenticated user.
 */
// In functions/index.js, modify getStreakData

exports.getStreakData = onCall(async (request) => {
    // 1. Check Authentication
    if (!request.auth) {
      logger.warn("getStreakData called without authentication.");
      throw new HttpsError(
        'unauthenticated',
        'You must be logged in to view your streak.'
      );
    }
    const userId = request.auth.uid;
    logger.log(`getStreakData called by authenticated user: ${userId}`);
  
    // 2. Access Firestore
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
  
    try {
      const userDoc = await userRef.get();
  
      if (!userDoc.exists) {
        logger.log(`[getStreakData] User document ${userId} not found. Returning 0 streaks/freezes.`);
        return {
          success: true,
          currentStreak: 0,
          longestStreak: 0,
          freezesRemaining: 0, // Add this
          message: "You haven't started your streak yet. Use the /log command to begin!"
        };
      }
  
      const userData = userDoc.data();
      const currentStreak = userData[STREAK_CONFIG.FIELDS.CURRENT_STREAK] || 0;
      const longestStreak = userData[STREAK_CONFIG.FIELDS.LONGEST_STREAK] || 0;
      const freezesRemaining = userData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING] || 0; // Get freezes
  
      let message = `🔥Your current streak: ${currentStreak} days\n🧨Your longest streak: ${longestStreak} days\n🧊Streak Freezes: ${freezesRemaining} available`; // Add freezes to message
  
      if (currentStreak === 0 && longestStreak === 0) {
          message = `You haven't started your streak yet. Use the /log command to begin!\nStreak Freezes: ${freezesRemaining} available`;
      } else if (currentStreak === 0 && longestStreak > 0) {
          message = `You currently don't have an active streak. Your longest streak was ${longestStreak} days.\nUse the /log command to start a new one!\nStreak Freezes: ${freezesRemaining} available`;
      }
  
  
      logger.log(`[getStreakData] Returning streak data for ${userId}: Current: ${currentStreak}, Longest: ${longestStreak}, Freezes: ${freezesRemaining}`);
      return {
        success: true,
        currentStreak: currentStreak,
        longestStreak: longestStreak,
        freezesRemaining: freezesRemaining, // Add this to the return object
        message: message
      };
  
    } catch (error) {
      logger.error(`[getStreakData] Error fetching streak data for user ${userId}:`, error);
      throw new HttpsError('internal', 'Could not retrieve streak data.', error.message);
    }
  });

// Add this new function in functions/index.js

/**
 * Scans all of a user's logs to find every unique metric they have ever tracked.
 * Returns an array of metric objects.
 */
exports.getAllUserMetrics = onCall(async (request) => {
    // 1. Authentication Check
    if (!request.auth) {
        logger.warn("getAllUserMetrics called without authentication.");
        throw new HttpsError('unauthenticated', 'You must be logged in to view your metrics.');
    }
    const userId = request.auth.uid;
    logger.log(`getAllUserMetrics called by authenticated user: ${userId}`);

    const db = admin.firestore();
    try {
        const logsSnapshot = await db.collection('logs').where('userId', '==', userId).get();
        
        // Use a Map to store unique metrics, preventing duplicates based on a normalized key.
        const uniqueMetricsMap = new Map();

        const addMetricToMap = (metric) => {
            if (metric && metric.label && metric.unit) {
                const normalizedLabel = metric.label.toLowerCase().trim();
                const normalizedUnit = metric.unit.toLowerCase().trim();
                const key = `${normalizedLabel}|${normalizedUnit}`;
                
                // Only add the metric if we haven't seen this normalized version before.
                // This ensures "Meditation" and "meditation" are treated as the same.
                if (!uniqueMetricsMap.has(key)) {
                    uniqueMetricsMap.set(key, {
                        label: metric.label, // Keep the original casing for display
                        unit: metric.unit
                    });
                }
            }
        };

        logsSnapshot.forEach(doc => {
            const log = doc.data();
            // Process the output metric
            addMetricToMap(log.output);
            // Process all input metrics
            if (log.inputs && Array.isArray(log.inputs)) {
                log.inputs.forEach(addMetricToMap);
            }
        });

        // Convert the Map values back into an array
        const uniqueMetricsArray = Array.from(uniqueMetricsMap.values());
        // Sort the array alphabetically by label for a consistent order
        uniqueMetricsArray.sort((a, b) => a.label.localeCompare(b.label));

        logger.log(`[getAllUserMetrics] Found ${uniqueMetricsArray.length} unique historical metrics for user ${userId}.`);
        return { success: true, metrics: uniqueMetricsArray };

    } catch (error) {
        logger.error(`[getAllUserMetrics] Error fetching metrics for user ${userId}:`, error);
        throw new HttpsError('internal', 'Could not retrieve your historical metrics due to a server error.', error.message);
    }
});

    /**
     * Saves the experiment duration, reminder schedule, generates an experimentId,
     * calculates the end timestamp, and snapshots active settings.
     * Expects data payload: {
     * experimentDuration: string (e.g., "1_week", "4_weeks"),
     * userCurrentTime: string | null (e.g., "2:30 PM" or "14:30", or null if skipped),
     * reminderWindowStartHour: string | null (e.g., "09" for 9 AM, "17" for 5 PM, or null),
     * reminderWindowEndHour: string | null (e.g., "17" for 5 PM, "00" for midnight, or null),
     * reminderFrequency: string (e.g., "7", "14", "0"),
     * customReminderMessage: string | null (currently expected to be null from bot),
     * skippedReminders: boolean (true if user explicitly skipped reminder setup)
     * }
     * Returns: { success: true, message: string, experimentId: string }
     */
exports.setExperimentSchedule = onCall(async (request) => {
    if (!request.auth) {
        logger.warn("setExperimentSchedule called without authentication.");
        throw new HttpsError('unauthenticated', 'You must be logged in to set an experiment schedule.');
    }

    const userId = request.auth.uid;
    const data = request.data;
    const db = admin.firestore();
    const userDocRef = db.collection('users').doc(userId);

    logger.log(`setExperimentSchedule called by user: ${userId} with data:`, data);

    // --- Validate Input Data ---
    if (!data.experimentDuration || typeof data.experimentDuration !== 'string') {
        throw new HttpsError('invalid-argument', 'Experiment duration is required and must be a string.');
    }
    const validDurations = ["1_week", "2_weeks", "3_weeks", "4_weeks"];
    if (!validDurations.includes(data.experimentDuration)) {
        throw new HttpsError('invalid-argument', `Invalid experiment duration: ${data.experimentDuration}.`);
    }
    if (typeof data.skippedReminders !== 'boolean') {
        throw new HttpsError('invalid-argument', 'skippedReminders flag is required and must be a boolean.');
    }
    const totalWeeklyReminders = parseInt(data.reminderFrequency, 10);
    if (isNaN(totalWeeklyReminders)) {
        throw new HttpsError('invalid-argument', 'Invalid reminder total. Must be a number.');
    }


    // --- Transaction to generate ExperimentId and save settings ---
    try {
        const experimentId = await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userDocRef);
            if (!userDoc.exists) {
                throw new Error("User document not found. Cannot create experiment.");
            }

            const userData = userDoc.data();
            const userTag = userData.userTag || `user${userId.substring(0, 4)}`;
            const username = userTag.split('#')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'user';
            
            const currentCounter = userData.experimentCounter || 0;
            const newCounter = currentCounter + 1;
            const newExperimentId = `${username}${String(newCounter).padStart(6, '0')}`;

            // --- Fetch current weeklySettings to snapshot ---
            const scheduledExperimentSettings = userData.weeklySettings || null;
            if (!scheduledExperimentSettings) {
                logger.warn(`[setExperimentSchedule] User ${userId}: weeklySettings not found for snapshotting.`);
            }
            
            // --- Calculate experimentEndTimestamp ---
            const now = new Date();
            const experimentSetAtTimestamp = admin.firestore.Timestamp.fromDate(now);

            let daysToAdd = 0;
            switch (data.experimentDuration) {
                case "1_week": daysToAdd = 7; break;
                case "2_weeks": daysToAdd = 14; break;
                case "3_weeks": daysToAdd = 21; break;
                case "4_weeks": daysToAdd = 28; break;
            }

            const experimentEndDate = new Date(now.getTime() + (daysToAdd * 24 * 60 * 60 * 1000));
            experimentEndDate.setHours(experimentEndDate.getHours() - 8); // Adjust for earlier processing
            const experimentEndTimestamp = admin.firestore.Timestamp.fromDate(experimentEndDate);
            // --- Calculate UTC reminder window if reminders are active ---
            let reminderWindowStartUTC = null;
            let reminderWindowEndUTC = null;
            let initialUTCOffsetHours = null;

            if (!data.skippedReminders && totalWeeklyReminders > 0 && data.userCurrentTime) {
                try {
                    const nowUtcDate = new Date();
                    const serverCurrentUTCHour = nowUtcDate.getUTCHours();
                    const [timePart, ampmPart] = data.userCurrentTime.split(' ');
                    let [userReportedLocalHour, userReportedLocalMinute] = timePart.split(':').map(Number);
                    if (ampmPart.toUpperCase() === 'PM' && userReportedLocalHour !== 12) userReportedLocalHour += 12;
                    if (ampmPart.toUpperCase() === 'AM' && userReportedLocalHour === 12) userReportedLocalHour = 0;
                    
                    initialUTCOffsetHours = serverCurrentUTCHour - userReportedLocalHour;
                    const localStartHourInt = parseInt(data.reminderWindowStartHour, 10);
                    const localEndHourInt = parseInt(data.reminderWindowEndHour, 10);
                    reminderWindowStartUTC = (localStartHourInt + initialUTCOffsetHours + 24) % 24;
                    reminderWindowEndUTC = (localEndHourInt + initialUTCOffsetHours + 24) % 24;
                } catch (e) {
                    logger.error(`[setExperimentSchedule] User ${userId}: Error calculating UTC reminder window. Reminders might not work. Error:`, e);
                }
            }

            const experimentScheduleData = {
                experimentId: newExperimentId,
                experimentDuration: data.experimentDuration,
                experimentSetAt: experimentSetAtTimestamp,
                experimentEndTimestamp: experimentEndTimestamp,
                statsProcessed: false,
                scheduledExperimentSettings: scheduledExperimentSettings,
                userCurrentTimeAtSetup: data.skippedReminders ? null : data.userCurrentTime,
                reminderWindowStartLocal: data.skippedReminders || totalWeeklyReminders === 0 ? null : data.reminderWindowStartHour,
                reminderWindowEndLocal: data.skippedReminders || totalWeeklyReminders === 0 ? null : data.reminderWindowEndHour,
                reminderFrequency: data.reminderFrequency, // Keep original value for potential display
                remindersSkipped: data.skippedReminders,
                reminderWindowStartUTC: reminderWindowStartUTC,
                reminderWindowEndUTC: reminderWindowEndUTC,
                initialUTCOffsetHours: initialUTCOffsetHours,

                // --- NEW FIELDS FOR RANDOM REMINDER SYSTEM ---
                totalWeeklyReminders: totalWeeklyReminders,
                remindersLeftToSend: totalWeeklyReminders,
                weeklyReminderPeriodStart: experimentSetAtTimestamp // The 7-day period starts now
            };
            // Update user document with new counter and experiment schedule
            transaction.update(userDocRef, {
                experimentCounter: newCounter,
                experimentCurrentSchedule: experimentScheduleData
            });
            return newExperimentId; // Return the new ID from the transaction
        });
        logger.log(`Successfully saved experiment schedule for user ${userId}. New experiment ID: ${experimentId}.`);
        let message = `✅ Experiment (ID: ${experimentId}) duration set to ${data.experimentDuration.replace('_', ' ')}.`;
        
        if (data.skippedReminders) {
            message += " Reminders were skipped.";
        } else if (totalWeeklyReminders === 0) {
            message += " No reminders will be sent.";
        } else {
            message += ` ${totalWeeklyReminders} random reminders scheduled for the week within your chosen window.`;
        }
        return { success: true, message: message, experimentId: experimentId };
    } catch (error) {
        logger.error("Error running setExperimentSchedule transaction for user:", userId, error);
        throw new HttpsError('internal', 'Could not save experiment schedule due to a server error.', error.message);
    }
});

// ============== STATS HELPER FUNCTIONS ==============
function calculateMean(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((acc, val) => acc + val, 0) / arr.length;
}

function calculateMedian(arr) {
    if (!arr || arr.length === 0) return 0;
    const sortedArr = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sortedArr.length / 2);
    return sortedArr.length % 2 !== 0 ? sortedArr[mid] : (sortedArr[mid - 1] + sortedArr[mid]) / 2;
}

function calculateStdDev(arr, mean) {
    if (!arr || arr.length === 0) return 0;
    const n = arr.length;
    return Math.sqrt(arr.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
}

function calculateVariationPercentage(stdDev, mean) {
    if (mean === 0) return 0; // Avoid division by zero; or could return Infinity or a specific marker
    return (stdDev / mean) * 100;
}

function calculateQuartiles(arr) {
    if (!arr || arr.length < 4) return { q1: null, q3: null, iqr: null }; // Need at least 4 points for meaningful quartiles this way
    const sortedArr = [...arr].sort((a, b) => a - b);
    const n = sortedArr.length;

    // Calculate Q1 (25th percentile)
    const q1Index = (n + 1) / 4;
    let q1;
    if (Number.isInteger(q1Index)) {
        q1 = sortedArr[q1Index - 1];
    } else {
        const lower = sortedArr[Math.floor(q1Index) - 1];
        const upper = sortedArr[Math.ceil(q1Index) - 1];
        q1 = lower + (upper - lower) * (q1Index - Math.floor(q1Index));
    }

    // Calculate Q3 (75th percentile)
    const q3Index = (3 * (n + 1)) / 4;
    let q3;
    if (Number.isInteger(q3Index)) {
        q3 = sortedArr[q3Index - 1];
    } else {
        const lower = sortedArr[Math.floor(q3Index) - 1];
        const upper = sortedArr[Math.ceil(q3Index) - 1];
        q3 = lower + (upper - lower) * (q3Index - Math.floor(q3Index));
    }

    const iqr = (q1 !== null && q3 !== null) ? q3 - q1 : null;

    return { 
        q1: q1 !== null ? parseFloat(q1.toFixed(2)) : null, 
        q3: q3 !== null ? parseFloat(q3.toFixed(2)) : null, 
        iqr: iqr !== null ? parseFloat(iqr.toFixed(2)) : null
    };
}

function getHighLowGroup(value, median) {
    if (value === null || median === null) return 'N/A';
    if (value > median) return 'High';
    if (value < median) return 'Low';
    return 'Median'; // Value is equal to median
}

function normalizeLabel(str) {
    if (typeof str !== 'string') {
      return ""; // Handle non-string inputs gracefully
    }
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s_/-]+/g, '') // Allow alphanumeric, space, underscore, slash, hyphen
      .replace(/\s+/g, ' ') // Consolidate multiple spaces
      .trim();
  }

  const normalizeUnit = normalizeLabel;

// Helper function to interpret group keys for summary messages
function interpretFirebaseGroupKey(groupKeyString, input1Label, input2Label) {
  // groupKeyString is like 'input1High_input2Low', 'input1Low_input2High', etc.
  // These keys are hardcoded in the groupsData structure in _calculateAndStorePeriodStatsLogic
  let condition1 = '';
  let condition2 = '';

  if (groupKeyString.startsWith('input1High')) {
    condition1 = `${input1Label} was High`;
  } else if (groupKeyString.startsWith('input1Low')) {
    condition1 = `${input1Label} was Low`;
  }

  if (groupKeyString.endsWith('input2High')) {
    condition2 = `${input2Label} was High`;
  } else if (groupKeyString.endsWith('input2Low')) {
    condition2 = `${input2Label} was Low`;
  }

  if (condition1 && condition2) {
    return `${condition1} & ${condition2}`;
  } else if (condition1) {
    return condition1; // Should not happen with current keys
  } else if (condition2) {
    return condition2; // Should not happen with current keys
  }
  return "unknown condition";
}

// ============== END OF STATS HELPER FUNCTIONS ==============

// ============== INTERNAL HELPER FUNCTION for Stats Calculation ==============

/**
 * Core logic for calculating and storing period statistics.
 * This function is NOT directly callable via HTTPS, it's an internal helper.
 *
 * @param {string} userId - The user whose stats are being calculated.
 * @param {string} userTag - The user's tag.
 * @param {string} experimentId - The ID of the experiment.
 * @param {admin.firestore.Timestamp | object} experimentSettingsTimestampInput - Firestore Timestamp or object with _seconds, _nanoseconds, or .toDate() representing when settings were snapshotted.
 * @param {string} experimentEndDateISOInput - ISO string for the experiment end date.
 * @param {object} activeExperimentSettings - The snapshot of experiment settings.
 * @param {string} callingFunction - Identifier for the calling function (e.g., 'onCall', 'scheduledTask') for logging.
 * @returns {Promise<object>} A promise that resolves to an object with success status, message, etc.
 */
async function _calculateAndStorePeriodStatsLogic(
    userId,
    userTag,
    experimentId,
    experimentSettingsTimestampInput,
    experimentEndDateISOInput,
    activeExperimentSettings,
    callingFunction = "unknown"
) {
    const db = admin.firestore(); // Ensure db is initialized from admin
    logger.log(`[${callingFunction}] _calculateAndStorePeriodStatsLogic started for user: ${userId}, experiment ID: ${experimentId}`);
    // Step 1: Basic Input Validation (already somewhat done by callers, but good to have sanity checks)
    if (!userId || !userTag || !experimentId || !experimentSettingsTimestampInput || !experimentEndDateISOInput || !activeExperimentSettings) {
      logger.error(`[${callingFunction}] _calculateAndStorePeriodStatsLogic: Missing required parameters.`, {
          userIdProvided: !!userId,
          userTagProvided: !!userTag,
          experimentIdProvided: !!experimentId,
          experimentSettingsTimestampInputProvided: !!experimentSettingsTimestampInput,
          experimentEndDateISOInputProvided: !!experimentEndDateISOInput,
          activeExperimentSettingsProvided: !!activeExperimentSettings,
      });
      // For an internal function, we might throw an error or return a specific failure object.
      // Since the original onCall threw HttpsError, we'll return a similar structure.
      return {
        success: false,
        status: 'error_internal_missing_params',
        message: 'Internal Error: Missing required parameters for stats calculation logic.',
        experimentId: experimentId,
      };
    }

    if (typeof activeExperimentSettings !== 'object' ||
        !activeExperimentSettings.output || typeof activeExperimentSettings.output.label !== 'string' ||
        !activeExperimentSettings.input1 || typeof activeExperimentSettings.input1.label !== 'string'
       ) {
      logger.error(`[${callingFunction}] _calculateAndStorePeriodStatsLogic: Invalid activeExperimentSettings structure. Minimum output and input1 must be defined with labels.`, { activeExperimentSettings });
      return {
        success: false,
        status: 'error_internal_invalid_settings_structure',
        message: 'Internal Error: Invalid activeExperimentSettings structure for stats calculation logic.',
        experimentId: experimentId,
      };
    }
    // Minor validation for input2/input3 structure can remain if desired, but less critical for internal calls if callers ensure valid settings.
    let settingsTimestampDate;
    let endDate;
    try {
      if (typeof experimentSettingsTimestampInput === 'string') {
        settingsTimestampDate = new Date(experimentSettingsTimestampInput);
      } else if (experimentSettingsTimestampInput && typeof experimentSettingsTimestampInput.toDate === 'function') {
        settingsTimestampDate = experimentSettingsTimestampInput.toDate();
      } else if (experimentSettingsTimestampInput && typeof experimentSettingsTimestampInput === 'object' && '_seconds' in experimentSettingsTimestampInput && '_nanoseconds' in experimentSettingsTimestampInput) {
        settingsTimestampDate = new Date(experimentSettingsTimestampInput._seconds * 1000 + (experimentSettingsTimestampInput._nanoseconds / 1000000));
      } else {
          throw new Error('Invalid experimentSettingsTimestampInput format. Expected ISO string or Firestore Timestamp-like object.');
      }

      endDate = new Date(experimentEndDateISOInput);
      if (isNaN(settingsTimestampDate.getTime())) {
          logger.error(`[${callingFunction}] Invalid date generated for experimentSettingsTimestampInput.`, { input: JSON.stringify(experimentSettingsTimestampInput) });
          throw new Error(`Invalid date for experimentSettingsTimestampInput.`);
      }
      if (isNaN(endDate.getTime())) {
          logger.error(`[${callingFunction}] Invalid date generated for experimentEndDateISOInput.`, { input: experimentEndDateISOInput });
          throw new Error(`Invalid date for experimentEndDateISOInput.`);
      }
      logger.log(`[${callingFunction}] Converted Timestamps for user ${userId}, experiment ${experimentId}: Start - ${settingsTimestampDate.toISOString()}, End - ${endDate.toISOString()}`);
    } catch (error) {
      logger.error(`[${callingFunction}] _calculateAndStorePeriodStatsLogic: Error converting timestamp strings/objects to Date objects.`, {
          userId: userId, experimentId: experimentId, error: error.message
      });
      return {
        success: false,
        status: 'error_internal_timestamp_conversion',
        message: `Internal Error: Invalid timestamp format: ${error.message}`,
        experimentId: experimentId,
      };
    }

    logger.info(`[${callingFunction}] [calculateAndStorePeriodStats] Initial validation and setup complete for user ${userId}, experiment ${experimentId}. Fetching logs...`);
    // Step 2: Fetching Raw Logs (Code from original function, lines 384-390)
    let fetchedLogs = [];
    try {
      const logsQuery = db.collection('logs')
        .where('userId', '==', userId)
        .where('timestamp', '>=', settingsTimestampDate)
        .where('timestamp', '<=', endDate)
        .orderBy('timestamp', 'asc');
      const snapshot = await logsQuery.get();
      if (snapshot.empty) {
        logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] No logs found for user ${userId} in the period for experiment ${experimentId}.`);
      } else {
        snapshot.forEach(doc => {
          const logData = doc.data();
          if (logData.timestamp && typeof logData.timestamp.toDate === 'function') {
              logData.timestamp = logData.timestamp.toDate();
          }
          fetchedLogs.push({ id: doc.id, ...logData });
        });
        logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Fetched ${fetchedLogs.length} logs for user ${userId}, experiment ${experimentId}.`);
      }
    } catch (error) {
      logger.error(`[${callingFunction}] [calculateAndStorePeriodStats] Error fetching logs for user ${userId}, experiment ${experimentId}:`, error);
      return { // Consistent error return
        success: false,
        status: 'error_internal_log_fetch_failed',
        message: `Internal Error: Failed to fetch logs: ${error.message}`,
        experimentId: experimentId,
        errorDetails: error.toString()
      };
    }

    // Step 3: Initial Log Count Check (Code from original function, lines 391-400)
    const MINIMUM_OVERALL_LOGS = 5;
    const totalLogsInPeriodProcessed = fetchedLogs.length;

    if (totalLogsInPeriodProcessed < MINIMUM_OVERALL_LOGS) {
      const message = `We don't have enough data to give you meaningful stats yet (found ${totalLogsInPeriodProcessed} logs, minimum ${MINIMUM_OVERALL_LOGS} required). Keep logging to fuel your experiment!`;
      logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Insufficient overall data for user ${userId}, experiment ${experimentId}. ${message}`);
      const finalStatsObject = {
          experimentId: experimentId,
          userId: userId,
          userTag: userTag,
          experimentSettingsTimestamp: settingsTimestampDate.toISOString(),
          experimentEndDateISO: endDate.toISOString(),
          activeExperimentSettings: activeExperimentSettings,
          calculationTimestamp: FieldValue.serverTimestamp(),
          totalLogsInPeriodProcessed: totalLogsInPeriodProcessed,
          status: 'insufficient_overall_data',
          message: message,
          calculatedMetricStats: {},
          correlations: {},
          stratifiedAnalysisPrep: {}
      };
      try {
          await db.collection('users').doc(userId).collection('experimentStats').doc(experimentId).set(finalStatsObject);
          logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Stored 'insufficient_overall_data' record for user ${userId}, experiment ${experimentId}.`);
      } catch (storeError) {
          logger.error(`[${callingFunction}] [calculateAndStorePeriodStats] Failed to store 'insufficient_overall_data' record for user ${userId}, experiment ${experimentId}:`, storeError);
          // Don't throw an error that would overwrite the primary reason, but the outer call might catch this if it's a throw
      }
      return {
        success: true, // The function itself completed its intended path for this case
        status: 'insufficient_overall_data',
        message: message,
        experimentId: experimentId,
        totalLogsInPeriodProcessed: totalLogsInPeriodProcessed
      };
    }

    logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Logs fetched (${totalLogsInPeriodProcessed}) and count is sufficient for user ${userId}, experiment ${experimentId}. Starting data extraction...`);
    // Step 3 (Continued): Data Extraction (Code from original function, lines 403-426)
    const metricValues = {};
    const metricLabels = {};
    const pMetrics = [
        activeExperimentSettings.output,
        activeExperimentSettings.input1,
        activeExperimentSettings.input2,
        activeExperimentSettings.input3
    ];
    for (const metricSetting of pMetrics) {
        if (metricSetting && typeof metricSetting.label === 'string' && metricSetting.label.trim() !== "") {
            metricValues[metricSetting.label] = [];
            metricLabels[metricSetting.label] = { label: metricSetting.label, unit: metricSetting.unit || "" };
        }
    }
    logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Initialized metricValues for labels: ${Object.keys(metricValues).join(', ')} for user ${userId}, experiment ${experimentId}`);
    let nonNumericEntriesCount = 0;
    let missingMetricInLogCount = 0;

    fetchedLogs.forEach(log => {
        // --- Output Metric Matching ---
        if (log.output && typeof log.output.label === 'string' && typeof log.output.unit === 'string' &&
            activeExperimentSettings.output && typeof activeExperimentSettings.output.label === 'string' && typeof activeExperimentSettings.output.unit === 'string') {

            const normalizedLogOutputLabel = normalizeLabel(log.output.label);
            const normalizedLogOutputUnit = normalizeUnit(log.output.unit);
            const normalizedSettingsOutputLabel = normalizeLabel(activeExperimentSettings.output.label);
            const normalizedSettingsOutputUnit = normalizeUnit(activeExperimentSettings.output.unit);

            if (normalizedLogOutputLabel === normalizedSettingsOutputLabel &&
                normalizedLogOutputUnit === normalizedSettingsOutputUnit) {
                const value = parseFloat(log.output.value);
                if (!isNaN(value)) {
                    const settingsOutputOriginalLabel = activeExperimentSettings.output.label;
                    if (metricValues[settingsOutputOriginalLabel]) {
                        metricValues[settingsOutputOriginalLabel].push(value);
                    } else {
                        logger.warn(`[${callingFunction}] metricValues key '${settingsOutputOriginalLabel}' for output not pre-initialized. Log ID: ${log.id}`);
                    }
                } else {
                    nonNumericEntriesCount++;
                    logger.warn(`[${callingFunction}] Non-numeric output value found in log ${log.id} for metric ${activeExperimentSettings.output.label}. Value: ${log.output.value}`);
                }
            } else if (normalizedLogOutputLabel === normalizedSettingsOutputLabel && normalizedLogOutputUnit !== normalizedSettingsOutputUnit) {
                logger.info(`[${callingFunction}] Output label "${normalizedLogOutputLabel}" matched settings, but units differ. Log: "${log.output.unit}", Settings: "${activeExperimentSettings.output.unit}". Log ID: ${log.id}`);
            }
        } else {
            missingMetricInLogCount++;
            logger.warn(`[${callingFunction}] [calculateAndStorePeriodStats] Output metric in log ${log.id} or in settings was missing label/unit fields, or expected activeExperimentSettings.output was not found. Log output: ${JSON.stringify(log.output)}`);
        }


        // --- Input Metrics Matching ---
        const inputSettingsToCheck = [
            activeExperimentSettings.input1,
            activeExperimentSettings.input2,
            activeExperimentSettings.input3
        ];
        inputSettingsToCheck.forEach(inputSetting => {
            if (inputSetting && typeof inputSetting.label === 'string' && inputSetting.label.trim() !== "" && typeof inputSetting.unit === 'string') {
                const settingsOriginalLabel = inputSetting.label;
                const normalizedSettingsLabel = normalizeLabel(settingsOriginalLabel);
                const normalizedSettingsUnit = normalizeUnit(inputSetting.unit);

                 const foundInput = log.inputs && Array.isArray(log.inputs) ?
                    log.inputs.find(inp =>
                        inp && typeof inp.label === 'string' && typeof inp.unit === 'string' &&
                        normalizeLabel(inp.label) === normalizedSettingsLabel &&
                         normalizeUnit(inp.unit) === normalizedSettingsUnit
                    )
                    : undefined;

                if (foundInput) {
                     const value = parseFloat(foundInput.value);
                     if (!isNaN(value)) {
                        if (metricValues[settingsOriginalLabel]) {
                            metricValues[settingsOriginalLabel].push(value);
                        } else {
                            logger.warn(`[${callingFunction}] metricValues key '${settingsOriginalLabel}' for input not pre-initialized. Log ID: ${log.id}`);
                        }
                    } else {
                        nonNumericEntriesCount++;
                        logger.warn(`[${callingFunction}] Non-numeric input value found in log ${log.id} for metric ${settingsOriginalLabel}. Value: ${foundInput.value}`);
                    }
                } else {
                    let labelMatchedWithDifferentUnit = false;
                    if (log.inputs && Array.isArray(log.inputs)) {
                        const labelMatchDifferentUnitCheck = log.inputs.find(inp =>
                            inp && typeof inp.label === 'string' && typeof inp.unit === 'string' &&
                            normalizeLabel(inp.label) === normalizedSettingsLabel &&
                            normalizeUnit(inp.unit) !== normalizedSettingsUnit
                        );
                        if (labelMatchDifferentUnitCheck) {
                            logger.info(`[${callingFunction}] Input label "${normalizedSettingsLabel}" matched settings, but units differ. Log: "${labelMatchDifferentUnitCheck.unit}", Settings: "${inputSetting.unit}". Log ID: ${log.id}`);
                            labelMatchedWithDifferentUnit = true;
                        }
                    }
                    if (!labelMatchedWithDifferentUnit) {
                        missingMetricInLogCount++;
                    }
                }
            }
        });
    });

    // ============== START: "Anchor & Shift" Transformation for Time-of-Day Metrics ==============
    logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Starting "Anchor & Shift" check for time-of-day metrics. User: ${userId}, Exp: ${experimentId}`);
    const transformedMetricValues = JSON.parse(JSON.stringify(metricValues)); // Deep clone to avoid modifying original

    // A list of keywords to identify time-of-day units, case-insensitive.
    const TIME_OF_DAY_KEYWORDS = ['time of day', 'clock time', 'specific time', 'exact time', "o'clock", 'oclock', 'o clock', 'am/pm', 'a.m./p.m.', 'am', 'pm', 'a.m.', 'p.m.', 'am.', 'pm.'];

    for (const labelKey in transformedMetricValues) {
        // Check if this metric is a time-of-day metric by looking at the original settings
        const metricSetting = pMetrics.find(m => m && m.label === labelKey);
        const isTimeMetric = metricSetting && TIME_OF_DAY_KEYWORDS.includes(metricSetting.unit?.toLowerCase().trim());

        if (isTimeMetric) {
            const values = transformedMetricValues[labelKey];
            if (values.length < 2) continue; // Not enough data to determine a range

            const maxVal = Math.max(...values);
            const minVal = Math.min(...values);

            // The refined three-part heuristic
            const isWideRange = (maxVal - minVal) > 12;
            const hasEarlyVals = values.some(v => v < 6); // Check for values before 6 AM
            const hasLateVals = values.some(v => v > 18); // Check for values after 6 PM

            if (isWideRange && hasEarlyVals && hasLateVals) {
                logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Midnight crossover DETECTED for metric "${labelKey}". Applying shift. Max: ${maxVal}, Min: ${minVal}.`);
                // Apply the shift: add 24 to values that are likely from the morning after a midnight crossover.
                // A simple threshold like 12 (noon) can be used as the split point.
                const shiftedValues = values.map(v => (v < 12 ? v + 24 : v));
                transformedMetricValues[labelKey] = shiftedValues;
                logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Metric "${labelKey}" values transformed. Original: [${values.join(', ')}], Shifted: [${shiftedValues.join(', ')}]`);
            }
        }
    }
    // ============== END: "Anchor & Shift" Transformation ==============

    // Step 4: Calculate Core Statistics
    logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Starting core statistics calculation for user ${userId}, experiment ${experimentId}.`);
    const calculatedMetricStats = {};
    const skippedMetrics = [];
    const MINIMUM_DATAPOINTS_FOR_METRIC_STATS = 5;
    for (const labelKey in transformedMetricValues) {
        if (Object.prototype.hasOwnProperty.call(transformedMetricValues, labelKey)) {
            const values = transformedMetricValues[labelKey];
            const dataPoints = values.length;
            const metricDetail = metricLabels[labelKey] || { label: labelKey, unit: "" };
            if (dataPoints < MINIMUM_DATAPOINTS_FOR_METRIC_STATS) {
                logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Skipping stats for metric "${labelKey}" due to insufficient data points (${dataPoints} < ${MINIMUM_DATAPOINTS_FOR_METRIC_STATS}). User: ${userId}, Exp: ${experimentId}`);
                skippedMetrics.push({
                    label: metricDetail.label,
                    unit: metricDetail.unit,
                    dataPoints: dataPoints,
                    reason: `Insufficient data points (minimum ${MINIMUM_DATAPOINTS_FOR_METRIC_STATS} required).`
                 });
                calculatedMetricStats[labelKey] = {
                    label: metricDetail.label,
                    unit: metricDetail.unit,
                    dataPoints: dataPoints,
                    average: null,
                    median: null,
                    variationPercentage: null,
                    status: 'skipped_insufficient_data'
                };
            } else {
                const mean = calculateMean(values);
                const median = calculateMedian(values);
                const stdDev = calculateStdDev(values, mean);
                const variation = calculateVariationPercentage(stdDev, mean);
                // --- NEW: Min/Max Calculation ---
                const min = Math.min(...values);
                const max = Math.max(...values);
                // --- END NEW ---

                calculatedMetricStats[labelKey] = {
                    label: metricDetail.label,
                    unit: metricDetail.unit,
                    dataPoints: dataPoints,
                    average: parseFloat(mean.toFixed(2)),
                    median: parseFloat(median.toFixed(2)),
                    // --- NEW: Add min/max to the stored object ---
                    min: parseFloat(min.toFixed(2)),
                    max: parseFloat(max.toFixed(2)),
                    // --- END NEW ---
                    variationPercentage: parseFloat(variation.toFixed(2))
                };
                
                logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Calculated stats for metric "${labelKey}": Avg=${mean.toFixed(2)}, Med=${median.toFixed(2)}, Var%=${variation.toFixed(2)}, DP=${dataPoints}. User: ${userId}, Exp: ${experimentId}`);
            }
        }
    }

    // Step 5: Calculate Correlations
    logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Starting correlation calculations for user ${userId}, experiment ${experimentId}.`);
    const correlations = {};
    const MINIMUM_PAIRS_FOR_CORRELATION = 5;
    const outputMetricLabel = activeExperimentSettings.output.label;
    const outputValues = transformedMetricValues[outputMetricLabel];
    const outputStats = calculatedMetricStats[outputMetricLabel];
    if (!outputStats || outputStats.dataPoints < MINIMUM_PAIRS_FOR_CORRELATION) {
        logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Output metric "${outputMetricLabel}" has insufficient data (${outputStats ? outputStats.dataPoints : 0} points) for correlation. Skipping all correlations. User: ${userId}, Exp: ${experimentId}`);
    } else {
        const inputMetricSettings = [
            activeExperimentSettings.input1,
            activeExperimentSettings.input2,
            activeExperimentSettings.input3
        ];
        for (const inputSetting of inputMetricSettings) {
            if (inputSetting && typeof inputSetting.label === 'string' && inputSetting.label.trim() !== "") {
                const inputLabel = inputSetting.label;
                const inputStats = calculatedMetricStats[inputLabel];
                const inputValues = transformedMetricValues[inputLabel];

                if (!inputStats || inputStats.dataPoints < MINIMUM_PAIRS_FOR_CORRELATION) {
                    correlations[inputLabel] = {
                        label: inputLabel,
                        vsOutputLabel: outputMetricLabel,
                        coefficient: null,
                        pValue: null,
                        interpretation: "Insufficient data for this input metric.",
                        n_pairs: inputStats ? inputStats.dataPoints : 0,
                        status: "skipped_insufficient_input_data"
                    };
                    continue;
                }
                const n_pairs = Math.min(inputValues.length, outputValues.length);
                if (n_pairs < MINIMUM_PAIRS_FOR_CORRELATION) {
                    correlations[inputLabel] = {
                        label: inputLabel,
                        vsOutputLabel: outputMetricLabel,
                        coefficient: null,
                        pValue: null,
                        interpretation: `Insufficient aligned data pairs (${n_pairs}) for correlation.`,
                        n_pairs: n_pairs,
                        status: "skipped_insufficient_aligned_pairs"
                    };
                    continue;
                }
                const pairedInputValues = inputValues.slice(0, n_pairs);
                const pairedOutputValues = outputValues.slice(0, n_pairs);
                try {
                    const coefficient = jStat.corrcoeff(pairedInputValues, pairedOutputValues);
                    const rSquared = coefficient * coefficient; // Calculate R-squared

                    let pValue = null;

                    if (n_pairs > 2 && Math.abs(coefficient) < 1 && Math.abs(coefficient) > 1e-9) {
                        const tStat = coefficient * Math.sqrt((n_pairs - 2) / (1 - (coefficient * coefficient)));
                        if (isFinite(tStat)) {
                            pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), n_pairs - 2));
                        } else {
                            pValue = 1.0;
                            logger.warn(`[${callingFunction}] [Correlation] tStat was not finite for "${inputLabel}" vs "${outputMetricLabel}". Coeff: ${coefficient}, N: ${n_pairs}. Setting pValue to 1.0.`);
                        }
                    } else if (Math.abs(coefficient) >= 1) {
                        pValue = 0.0;
                    } else {
                        pValue = 1.0;
                    }


                    let interpretation = "";
                    const absCoeff = Math.abs(coefficient);
                    let strength = "";

                    if (absCoeff >= 0.7) strength = "🟥 very strong";
                    else if (absCoeff >= 0.45) strength = "🟧 strong";
                    else if (absCoeff >= 0.3) strength = "🟨 moderate";
                    else if (absCoeff >= 0.15) strength = "🟩 weak";
                    else strength = "🟦 no detectable"; // This case should now be filtered out by rSquared check
                    const direction = coefficient >= 0 ? "positive" : "negative";

                    const isSignificant = pValue !== null && pValue < 0.05;
                    // The "no detectable" case is now handled by the rSquared filter above
                    if (isSignificant) {
                        interpretation = `You can be 95% confident that there is a\n${strength} ${direction} correlation between ${inputLabel} and ${outputMetricLabel}.`;
                    } else {
                        interpretation = `It appears there may be a\n${strength} ${direction} correlation between ${inputLabel} and ${outputMetricLabel}.\nWorth getting more data?`;
                    }

                    correlations[inputLabel] = {
                        label: inputLabel,
                        vsOutputLabel: outputMetricLabel,
                        coefficient: parseFloat(coefficient.toFixed(3)),
                        pValue: pValue !== null && isFinite(pValue) ? parseFloat(pValue.toFixed(3)) : null,
                        interpretation: interpretation,
                        n_pairs: n_pairs,
                        status: "calculated"
                    };
                    logger.log(`[${callingFunction}] [Correlation] For "${inputLabel}" vs "${outputMetricLabel}": Coeff=${coefficient.toFixed(3)}, PVal=${pValue !== null && isFinite(pValue) ? pValue.toFixed(3) : 'N/A'}, N=${n_pairs}. User: ${userId}, Exp: ${experimentId}`);
                } catch (corrError) {
                    logger.error(`[${callingFunction}] [calculateAndStorePeriodStats] Error calculating correlation for "${inputLabel}" vs "${outputMetricLabel}". User: ${userId}, Exp: ${experimentId}`, corrError);
                    correlations[inputLabel] = {
                        label: inputLabel,
                        vsOutputLabel: outputMetricLabel,
                        coefficient: null,
                        pValue: null,
                        interpretation: "Error during calculation.",
                        n_pairs: n_pairs,
                        status: "error_during_calculation",
                        error_message: corrError.message
                    };
                }
            }
        }
    }

    // Step 6: Prepare Data Structures for Stratified Analysis
    logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Preparing data for stratified analysis. User: ${userId}, Exp: ${experimentId}`);
    const stratifiedAnalysisPrep = {
        outputMetricLabel: activeExperimentSettings.output.label,
        outputValues: transformedMetricValues[activeExperimentSettings.output.label] || [],
        outputStats: {},
        inputMedians: {}
    };
    const outputMetricValuesForStrat = transformedMetricValues[activeExperimentSettings.output.label];
    if (outputMetricValuesForStrat && outputMetricValuesForStrat.length >= MINIMUM_DATAPOINTS_FOR_METRIC_STATS) {
        const outputQuartiles = calculateQuartiles(outputMetricValuesForStrat);
        stratifiedAnalysisPrep.outputStats = {
            q1: outputQuartiles.q1,
            median: calculatedMetricStats[activeExperimentSettings.output.label]?.median,
            q3: outputQuartiles.q3,
            iqr: outputQuartiles.iqr
            };
        logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Output quartiles for "${activeExperimentSettings.output.label}": Q1=${outputQuartiles.q1}, Q3=${outputQuartiles.q3}, IQR=${outputQuartiles.iqr}. User: ${userId}, Exp: ${experimentId}`);
    } else {
        logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Insufficient data for output metric "${activeExperimentSettings.output.label}" to calculate quartiles. User: ${userId}, Exp: ${experimentId}`);
        stratifiedAnalysisPrep.outputStats = { q1: null, median: null, q3: null, iqr: null, status: "insufficient_data_for_quartiles" };
    }
    const inputSettingsForStrat = [
        activeExperimentSettings.input1,
        activeExperimentSettings.input2,
        activeExperimentSettings.input3
    ];
    for (const inputSetting of inputSettingsForStrat) {
        if (inputSetting && typeof inputSetting.label === 'string' && inputSetting.label.trim() !== "") {
            const inputLabel = inputSetting.label;
            if (calculatedMetricStats[inputLabel] && calculatedMetricStats[inputLabel].median !== null) {
                stratifiedAnalysisPrep.inputMedians[inputLabel] = calculatedMetricStats[inputLabel].median;
            } else {
                stratifiedAnalysisPrep.inputMedians[inputLabel] = null;
            }
        }
    }
            logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Input medians for stratified prep: ${JSON.stringify(stratifiedAnalysisPrep.inputMedians)}. User: ${userId}, Exp: ${experimentId}`);
    // ============== START: Pairwise Interaction Analysis Logic ==============
            const MIN_DATAPOINTS_FOR_GROUP_ANALYSIS = 3;
            const IQR_MULTIPLIER = 1.25;
            const pairwiseInteractionResults = {};
            const overallOutputLabel = stratifiedAnalysisPrep.outputMetricLabel;
            const overallOutputStats = stratifiedAnalysisPrep.outputStats;
            let upperThreshold = null;
            let lowerThreshold = null;
            let thresholdsCalculated = false;
            if (overallOutputStats && typeof overallOutputStats.median === 'number' && typeof overallOutputStats.iqr === 'number' && overallOutputStats.iqr > 0) { // Added iqr > 0 check
                upperThreshold = overallOutputStats.median + (IQR_MULTIPLIER * overallOutputStats.iqr);
                lowerThreshold = overallOutputStats.median - (IQR_MULTIPLIER * overallOutputStats.iqr);
                thresholdsCalculated = true;
                logger.log(`[${callingFunction}] [PairwiseInteraction] Overall output ("${overallOutputLabel}") thresholds calculated: Upper=${upperThreshold.toFixed(2)}, Lower=${lowerThreshold.toFixed(2)} (Median=${overallOutputStats.median.toFixed(2)}, IQR=${overallOutputStats.iqr.toFixed(2)})`);
            } else {
                logger.warn(`[${callingFunction}] [PairwiseInteraction] Could not calculate significance thresholds for output "${overallOutputLabel}" due to missing/invalid median or IQR. Median: ${overallOutputStats?.median}, IQR: ${overallOutputStats?.iqr}`);
            }

            // Identify configured input metrics
            const configuredInputSettings = [];
            if (activeExperimentSettings.input1 && activeExperimentSettings.input1.label && activeExperimentSettings.input1.label.trim() !== "") {
                configuredInputSettings.push(activeExperimentSettings.input1);
            }
            if (activeExperimentSettings.input2 && activeExperimentSettings.input2.label && activeExperimentSettings.input2.label.trim() !== "") {
                configuredInputSettings.push(activeExperimentSettings.input2);
            }
            if (activeExperimentSettings.input3 && activeExperimentSettings.input3.label && activeExperimentSettings.input3.label.trim() !== "") {
                configuredInputSettings.push(activeExperimentSettings.input3);
            }

            logger.log(`[${callingFunction}] [PairwiseInteraction] Found ${configuredInputSettings.length} configured input metrics for analysis.`);
            if (configuredInputSettings.length >= 2) {
                for (let i = 0; i < configuredInputSettings.length; i++) {
                    for (let j = i + 1; j < configuredInputSettings.length; j++) {
                        const inputASetting = configuredInputSettings[i];
                        const inputBSetting = configuredInputSettings[j];

                        const labelA = inputASetting.label;
                        const labelB = inputBSetting.label;
                        
                        const pairKey = `${labelA.replace(/\s+/g, '_')}_vs_${labelB.replace(/\s+/g, '_')}`;
                        logger.log(`[${callingFunction}] [PairwiseInteraction] Starting analysis for pair: "${labelA}" vs "${labelB}" against output "${overallOutputLabel}". PairKey: ${pairKey}`);
                        
                        const medianA = stratifiedAnalysisPrep.inputMedians[labelA];
                        const medianB = stratifiedAnalysisPrep.inputMedians[labelB];

                        pairwiseInteractionResults[pairKey] = {
                            input1Label: labelA,
                            input2Label: labelB,
                            outputMetricLabel: overallOutputLabel,
                                     groups: {
                                'input1High_input2High': { outputAverage: null, count: 0 },
                                'input1High_input2Low':  { outputAverage: null, count: 0 },
                                 'input1Low_input2High':  { outputAverage: null, count: 0 },
                                'input1Low_input2Low':   { outputAverage: null, count: 0 }
                             },
                            summary: "Combined analysis skipped. Insufficient data or configuration for this pair."
                        };
                        if (typeof medianA !== 'number' || typeof medianB !== 'number') {
                            logger.warn(`[${callingFunction}] [PairwiseInteraction] Skipping pair "${labelA}" vs "${labelB}" due to missing median(s). Median A: ${medianA}, Median B: ${medianB}`);
                            pairwiseInteractionResults[pairKey].summary = `Combined analysis for ${labelA} & ${labelB} skipped: One or both input metrics lacked enough data to determine a median.`;
                            continue;
                        }

                        const valuesA = transformedMetricValues[labelA] || [];
                        const valuesB = transformedMetricValues[labelB] || [];
                        const outputValuesArray = transformedMetricValues[overallOutputLabel] || [];
                        
                        const numCommonDataPoints = Math.min(valuesA.length, valuesB.length, outputValuesArray.length);
                        logger.log(`[${callingFunction}] [PairwiseInteraction] Pair "${labelA}" vs "${labelB}": MedianA=${medianA}, MedianB=${medianB}. Common data points for A, B, Output: ${numCommonDataPoints}.`);
                        if (numCommonDataPoints < MIN_DATAPOINTS_FOR_GROUP_ANALYSIS) {
                            logger.warn(`[${callingFunction}] [PairwiseInteraction] Skipping pair "${labelA}" vs "${labelB}" due to insufficient common data points (${numCommonDataPoints}).`);
                            pairwiseInteractionResults[pairKey].summary = `Combined analysis for ${labelA} & ${labelB} skipped: Not enough days where ${labelA}, ${labelB}, and ${overallOutputLabel} were all logged (found ${numCommonDataPoints}, need ${MIN_DATAPOINTS_FOR_GROUP_ANALYSIS}).`;
                            continue;
                        }

                        const groupsData = { // Temporary structure to hold output values before averaging
                            'input1High_input2High': { outputs: [], outputAverage: null, count: 0 },
                             'input1High_input2Low':  { outputs: [], outputAverage: null, count: 0 },
                            'input1Low_input2High':  { outputs: [], outputAverage: null, count: 0 },
                            'input1Low_input2Low':   { outputs: [], outputAverage: null, count: 0 }
                         };
                        for (let k_idx = 0; k_idx < numCommonDataPoints; k_idx++) {
                            const valA = valuesA[k_idx];
                            const valB = valuesB[k_idx];
                            const outVal = outputValuesArray[k_idx];

                            if (typeof valA !== 'number' || typeof valB !== 'number' || typeof outVal !== 'number') {
                                logger.warn(`[${callingFunction}] [PairwiseInteraction] Encountered non-numeric value at index ${k_idx} for pair "${labelA}" vs "${labelB}". Skipping data point.`);
                                continue;
                            }

                            const groupKeyA = valA > medianA ? 'High' : 'Low';
                            const groupKeyB = valB > medianB ? 'High' : 'Low';
                            
                            const finalGroupKey = `input1${groupKeyA}_input2${groupKeyB}`;
                            groupsData[finalGroupKey].outputs.push(outVal);
                        }

                        let bestSignificantGroup = null;
                        let worstSignificantGroup = null;
                        let maxSigAvg = -Infinity;
                        let minSigAvg = Infinity;
                        for (const groupKey in groupsData) {
                            if (Object.prototype.hasOwnProperty.call(groupsData, groupKey)) {
                                const group = groupsData[groupKey];
                                group.count = group.outputs.length;
                                if (group.count >= MIN_DATAPOINTS_FOR_GROUP_ANALYSIS) {
                                    const meanResult = calculateMean(group.outputs);
                                    group.outputAverage = parseFloat(meanResult.toFixed(1));

                                    pairwiseInteractionResults[pairKey].groups[groupKey] = { 
                                        outputAverage: group.outputAverage, 
                                        count: group.count 
                                     };
                                     if (thresholdsCalculated) { // Only check significance if thresholds are valid
                                        if (group.outputAverage > upperThreshold && group.outputAverage > maxSigAvg) {
                                             maxSigAvg = group.outputAverage;
                                            bestSignificantGroup = { key: groupKey, avg: group.outputAverage, count: group.count };
                                        }
                                        if (group.outputAverage < lowerThreshold && group.outputAverage < minSigAvg) {
                                            minSigAvg = group.outputAverage;
                                            worstSignificantGroup = { key: groupKey, avg: group.outputAverage, count: group.count };
                                        }
                                    }
                                } else {
                                      pairwiseInteractionResults[pairKey].groups[groupKey] = { 
                                        outputAverage: null, 
                                        count: group.count 
                                     };
                                }
                            }
                        }
                        
                         let summaryMsg = "";
                         if (!thresholdsCalculated) {
                            summaryMsg = `Combined analysis for ${labelA} & ${labelB}: Significance thresholds for Output (${overallOutputLabel}) could not be determined (e.g. output metric had too little variation or data). Basic group averages shown if data allows.`;
                        } else {
                            const foundSignificantInteractions = [];
                            if (bestSignificantGroup) {
                                const condition = interpretFirebaseGroupKey(bestSignificantGroup.key, inputASetting.label, inputBSetting.label);
                                foundSignificantInteractions.push(`Avg ${overallOutputLabel} was significantly higher (${bestSignificantGroup.avg}) when ${condition} (n=${bestSignificantGroup.count}).`);
                            }
                            if (worstSignificantGroup) {
                                const condition = interpretFirebaseGroupKey(worstSignificantGroup.key, inputASetting.label, inputBSetting.label);
                                foundSignificantInteractions.push(`Avg ${overallOutputLabel} was significantly lower (${worstSignificantGroup.avg}) when ${condition} (n=${worstSignificantGroup.count}).`);
                            }

                            if (foundSignificantInteractions.length > 0) {
                                summaryMsg = foundSignificantInteractions.join(" \n");
                            } else {
                                summaryMsg = `Combined analysis for ${labelA} & ${labelB} did not show any group with an average ${overallOutputLabel} significantly different from the overall typical range. More data might reveal clearer patterns.`;
                            }
                        }
                        pairwiseInteractionResults[pairKey].summary = summaryMsg;
                        logger.log(`[${callingFunction}] [PairwiseInteraction] Processed pair "${labelA}" vs "${labelB}". Summary: "${summaryMsg}"`);
                    }
                }
            } else {
                logger.log(`[${callingFunction}] [PairwiseInteraction] Not enough configured input metrics (found ${configuredInputSettings.length}) to perform pairwise analysis. Minimum 2 required.`);
            }
            // ============== END: Pairwise Interaction Analysis Logic ==============

            // ============== START: Lag Time Correlation Analysis Logic ==============
            logger.log(`[${callingFunction}] [LagTimeCorrelation] Starting lag time analysis for user ${userId}, experiment ${experimentId}.`);
            const lagTimeCorrelations = {};
            const MIN_PAIRS_FOR_LAG_CORRELATION = 5; // Use the same minimum as regular correlations

            if (totalLogsInPeriodProcessed >= MIN_PAIRS_FOR_LAG_CORRELATION + 1) { // Need at least 6 logs for 5 pairs
                // Create a map of logDate -> logData for easy lookup
                const logsByDate = new Map();
                fetchedLogs.forEach(log => {
                    const logDate = new Date(log.timestamp).toISOString().split('T')[0];
                    logsByDate.set(logDate, log);
                });
                // Get a sorted list of unique dates
                const sortedDates = Array.from(logsByDate.keys()).sort();
                const lagDataPairs = [];

                // Create pairs of data from consecutive days
                for (let i = 0; i < sortedDates.length - 1; i++) {
                    const dayT_str = sortedDates[i];
                    const dayT_plus_1_str = sortedDates[i + 1];

                    // Check if days are truly consecutive
                    const dayT_date = new Date(dayT_str);
                    const dayT_plus_1_date = new Date(dayT_plus_1_str);
                    const diffTime = Math.abs(dayT_plus_1_date - dayT_date);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays === 1) {
                        const logT = logsByDate.get(dayT_str);
                        const logT_plus_1 = logsByDate.get(dayT_plus_1_str);
                        lagDataPairs.push({ dayT: logT, dayT_plus_1: logT_plus_1 });
                    }
                }
                logger.log(`[${callingFunction}] [LagTimeCorrelation] Created ${lagDataPairs.length} consecutive day data pairs.`);
                if (lagDataPairs.length >= MIN_PAIRS_FOR_LAG_CORRELATION) {
                    const allMetrics = [
                        { ...activeExperimentSettings.output, type: 'output' },
                        ...[activeExperimentSettings.input1, activeExperimentSettings.input2, activeExperimentSettings.input3]
                            .filter(m => m && m.label)
                            .map(m => ({ ...m, type: 'input' }))
                    ];
                    // Loop through every metric vs every other metric
                    for (const metricYesterday of allMetrics) {
                        for (const metricToday of allMetrics) {
                            const pairedValues = { yesterday: [], today: [] };
                            // Gather the paired data for this specific metric combination
                            lagDataPairs.forEach(pair => {
                                const yesterdayValue = getMetricValueFromLog(pair.dayT, metricYesterday.label, metricYesterday.unit);
                                const todayValue = getMetricValueFromLog(pair.dayT_plus_1, metricToday.label, metricToday.unit);

                                if (yesterdayValue !== null && todayValue !== null) {
                                    pairedValues.yesterday.push(yesterdayValue);
                                    pairedValues.today.push(todayValue);
                                }
                            });
                            if (pairedValues.yesterday.length >= MIN_PAIRS_FOR_LAG_CORRELATION) {
                                const coefficient = jStat.corrcoeff(pairedValues.yesterday, pairedValues.today);
                                const rSquared = coefficient * coefficient;

                                // Only store if the relationship is moderate or stronger (r-squared >= 9%)
                                if (rSquared >= 0.04) {
                                    const tStat = coefficient * Math.sqrt((pairedValues.yesterday.length - 2) / (1 - rSquared));
                                    const pValue = isFinite(tStat) ? 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), pairedValues.yesterday.length - 2)) : 1.0;
                                    const lagKey = `yesterday_${metricYesterday.label}_vs_today_${metricToday.label}`.replace(/\s+/g, '_');
                                    
                                    lagTimeCorrelations[lagKey] = {
                                        yesterdayMetricLabel: metricYesterday.label,
                                        todayMetricLabel: metricToday.label,
                                        coefficient: parseFloat(coefficient.toFixed(3)),
                                        pValue: parseFloat(pValue.toFixed(3)),
                                        n_pairs: pairedValues.yesterday.length
                                    };
                                    logger.log(`[${callingFunction}] [LagTimeCorrelation] Found significant lag correlation for key ${lagKey}: r=${coefficient.toFixed(3)}`);
                                }
                            }
                        }
                    }
                }
            } else {
                 logger.log(`[${callingFunction}] [LagTimeCorrelation] Skipped analysis due to insufficient total logs (${totalLogsInPeriodProcessed}).`);
            }
            // Helper function to extract a metric's value from a raw log object
            function getMetricValueFromLog(log, label, unit) {
                if (!log) return null;
                const normLabel = normalizeLabel(label);
                const normUnit = normalizeUnit(unit);

                // Check output metric
                if (log.output && normalizeLabel(log.output.label) === normLabel && normalizeUnit(log.output.unit) === normUnit) {
                    const val = parseFloat(log.output.value);
                    return isNaN(val) ? null : val;
                }
                // Check input metrics
                if (log.inputs && Array.isArray(log.inputs)) {
                    const foundInput = log.inputs.find(inp => inp && normalizeLabel(inp.label) === normLabel && normalizeUnit(inp.unit) === normUnit);
                    if (foundInput) {
                        const val = parseFloat(foundInput.value);
                        return isNaN(val) ? null : val;
                    }
                }
                return null;
            }
            // ============== END: Lag Time Correlation Analysis Logic ==============

    // Step 7: Assemble, Store, and Return Results
    logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Assembling final stats object for user ${userId}, experiment ${experimentId}.`);
    const finalStatsObject = {
        experimentId: experimentId,
        userId: userId,
        userTag: userTag,
        experimentSettingsTimestamp: settingsTimestampDate.toISOString(), // Use the Date object we derived
        experimentEndDateISO: endDate.toISOString(), // Use the Date object we derived
        activeExperimentSettings: activeExperimentSettings,
        calculationTimestamp: FieldValue.serverTimestamp(),
        totalLogsInPeriodProcessed: totalLogsInPeriodProcessed,
        calculatedMetricStats: calculatedMetricStats,
         skippedMetrics: skippedMetrics,
        correlations: correlations,
        stratifiedAnalysisPrep: stratifiedAnalysisPrep,
        pairwiseInteractionResults: pairwiseInteractionResults,
        lagTimeCorrelations: lagTimeCorrelations,
        status: 'stats_calculated_and_stored'
    };
    try {
        const statsDocRef = db.collection('users').doc(userId).collection('experimentStats').doc(experimentId);
        await statsDocRef.set(finalStatsObject);
        logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Successfully stored calculated stats for user ${userId}, experiment ${experimentId} to Firestore.`);
        return {
            success: true,
            status: 'stats_calculated_and_stored',
            message: "Experiment statistics calculated and stored successfully.",
            experimentId: experimentId, // This is the document ID
            totalLogsProcessed: totalLogsInPeriodProcessed
        };
    } catch (error) {
        logger.error(`[${callingFunction}] [calculateAndStorePeriodStats] CRITICAL: Failed to store calculated stats to Firestore for user ${userId}, experiment ${experimentId}. Data: ${JSON.stringify(finalStatsObject)}`, error);
        return { // Consistent error return
            success: false,
            status: 'error_internal_firestore_store_failed',
            message: `Internal Error: Failed to store calculated statistics: ${error.message}`,
            experimentId: experimentId,
            errorDetails: error.toString()
        };
    }
}
// ============== END OF INTERNAL HELPER FUNCTION ==============



// ============== NEW onCall WRAPPER for calculateAndStorePeriodStats ==============
exports.calculateAndStorePeriodStats = onCall(async (request) => {
    // Step 1: Authentication
    if (!request.auth) {
      logger.warn("calculateAndStorePeriodStats (onCall) called without authentication.");
      throw new HttpsError('unauthenticated', 'You must be logged in to calculate stats.');
    }
    const callingUserId = request.auth.uid; // User who initiated the call (for logging or if needed)
    const data = request.data;

    logger.log(`calculateAndStorePeriodStats (onCall) invoked by user: ${callingUserId} for target user: ${data.userId}, experiment ID: ${data.experimentId}`);

    // Step 2: Extract and Validate Parameters from request.data
    const {
      userId, // The user whose stats are being calculated
      userTag,
      experimentId,
      experimentSettingsTimestamp, // Expecting ISO string or Firestore Timestamp like object from client
      experimentEndDateISO,        // Expecting ISO string from client
      activeExperimentSettings
    } = data;

    if (!userId || !userTag || !experimentId || !experimentSettingsTimestamp || !experimentEndDateISO || !activeExperimentSettings) {
      logger.error("calculateAndStorePeriodStats (onCall): Missing required parameters from client.", {
          userIdProvided: !!userId,
          userTagProvided: !!userTag,
          experimentIdProvided: !!experimentId,
          experimentSettingsTimestampProvided: !!experimentSettingsTimestamp,
          experimentEndDateISOProvided: !!experimentEndDateISO,
          activeExperimentSettingsProvided: !!activeExperimentSettings,
      });
      throw new HttpsError('invalid-argument', 'Missing required parameters. Ensure userId, userTag, experimentId, experimentSettingsTimestamp, experimentEndDateISO, and activeExperimentSettings are all provided.');
    }

    // Step 3: Call the Internal Logic Function
    try {
        const result = await _calculateAndStorePeriodStatsLogic(
            userId,
            userTag,
            experimentId,
            experimentSettingsTimestamp, // Pass directly as received
            experimentEndDateISO,        // Pass directly as received
            activeExperimentSettings,
            "onCall" // Indicate the calling context
        );

        // Step 4: Process Result and Return to Client
        if (result.success) {
            // For 'insufficient_overall_data', it's still a "successful" execution of the intended path
            if (result.status === 'insufficient_overall_data') {
                 logger.log(`calculateAndStorePeriodStats (onCall) completed with status: ${result.status} for experiment ${experimentId}`);
                 return { // This structure is what the original onCall would have effectively returned in this case
                     success: true,
                     status: result.status,
                     message: result.message,
                     experimentId: result.experimentId,
                     totalLogsInPeriodProcessed: result.totalLogsInPeriodProcessed
                 };
            }
            // For 'stats_calculated_and_stored'
            logger.log(`calculateAndStorePeriodStats (onCall) successfully calculated and stored stats for experiment ${experimentId}.`);
            return {
                success: true,
                status: result.status || 'stats_calculated_and_stored',
                message: result.message || "Experiment statistics calculated and stored successfully.",
                experimentId: result.experimentId,
                totalLogsProcessed: result.totalLogsProcessed // ensure consistency if client uses this
            };
        } else {
            // Handle failures from _calculateAndStorePeriodStatsLogic
            logger.error(`calculateAndStorePeriodStats (onCall): _calculateAndStorePeriodStatsLogic returned failure for experiment ${experimentId}. Status: ${result.status}, Message: ${result.message}`);
            // Convert internal error status/message to an HttpsError for the client
            // Common statuses that might come from the internal helper if it fails early:
            // 'error_internal_missing_params', 'error_internal_invalid_settings_structure',
            // 'error_internal_timestamp_conversion', 'error_internal_log_fetch_failed', 'error_internal_firestore_store_failed'
            let errorCode = 'internal'; // default
            if (result.status && result.status.includes('param') || result.status.includes('settings_structure') || result.status.includes('timestamp_conversion')) {
                errorCode = 'invalid-argument';
            }
            throw new HttpsError(errorCode, result.message || 'Failed to process statistics due to an internal error.');
        }
    } catch (error) {
        // Catch any unexpected errors during the call to the internal logic or if HttpsError was re-thrown
        logger.error(`calculateAndStorePeriodStats (onCall): Critical error for experiment ${experimentId}. User ${callingUserId}. Error:`, error);
        if (error instanceof HttpsError) {
            throw error; // Re-throw HttpsError instances
        }
        throw new HttpsError('internal', `An unexpected server error occurred while calculating statistics for experiment ${experimentId}. Details: ${error.message}`, {
            errorDetails: error.toString(),
            userId: userId,
            experimentId: experimentId
        });
    }
});
// ============== END OF onCall WRAPPER ==============

// Scheduled function to check for ended experiments and trigger statistics calculation.
// Runs periodically (e.g., every hour).
// NOW HANDLES BOTH ended experiments and recurring weekly stats for users without an active experiment.

exports.checkForEndedExperimentsAndTriggerStats = onSchedule("every 1 hours", async (event) => {
    logger.log("checkForEndedExperimentsAndTriggerStats: Scheduled function triggered.", event.scheduleTime);
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now(); // Current Firestore Timestamp
    const nowJs = now.toDate(); // JavaScript Date object for calculations

    try {
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) {
            logger.log("checkForEndedExperimentsAndTriggerStats: No users found.");
            return null;
        }

        let processedCount = 0;
        const promises = [];

        usersSnapshot.forEach(userDoc => {
            const userId = userDoc.id;
            const userData = userDoc.data();
            const schedule = userData.experimentCurrentSchedule;

            if (!schedule) return; // Skip user if they have no schedule

            const userTag = userData.userTag || `User_${userId}`;

            // BRANCH 1: A defined experiment has just ended.
            if (schedule.statsMode !== 'continuous' && schedule.experimentEndTimestamp && schedule.experimentEndTimestamp.toDate() <= nowJs && (schedule.statsProcessed === undefined || schedule.statsProcessed === false)) {
                logger.log(`checkForEndedExperimentsAndTriggerStats: Found ended DEFINED experiment for user ${userId}, experimentId: ${schedule.experimentId}`);
                
                const processingPromise = _calculateAndStorePeriodStatsLogic(
                    userId,
                    userTag,
                    schedule.experimentId,
                    schedule.experimentSetAt,
                    schedule.experimentEndTimestamp.toDate().toISOString(),
                    schedule.scheduledExperimentSettings,
                    "checkForEndedExperimentsAndTriggerStats_Defined"
                )
                .then(async (statsResult) => {
                    // --- START of CHANGE ---
                    // First, check if the result indicates insufficient data and stop the workflow if so.
                    if (statsResult && statsResult.status === 'insufficient_overall_data') {
                        logger.log(`Skipping notification for user ${userId}, experiment ${statsResult.experimentId} due to insufficient data.`);
                        // Mark as processed to prevent retries, but do not send a notification.
                        await userDoc.ref.update({
                            'experimentCurrentSchedule.statsProcessed': true,
                            'experimentCurrentSchedule.statsProcessingError': 'insufficient_data'
                        });
                        return; // Stop execution for this user
                    }
                    // --- END of CHANGE ---
                    if (statsResult && statsResult.success) {
                        logger.log(`checkForEndedExperimentsAndTriggerStats: Successfully processed defined experiment for user ${userId}. Stored Doc ID: ${statsResult.experimentId}. Setting up for continuous mode.`);
                        
                        // Set the next weekly stats timestamp for 7 days from now
                        const nextWeeklyTimestamp = new Date(nowJs.getTime() + 7 * 24 * 60 * 60 * 1000);

                        // Update schedule to mark as processed and set up continuous mode
                        await userDoc.ref.update({
                            'experimentCurrentSchedule.statsProcessed': true,
                            'experimentCurrentSchedule.statsDocumentId': statsResult.experimentId,
                            'experimentCurrentSchedule.statsCalculationTimestamp': FieldValue.serverTimestamp(),
                            // --- SETUP FOR CONTINUOUS MODE ---
                            'experimentCurrentSchedule.statsMode': 'continuous',
                            'experimentCurrentSchedule.continuousStatsStartDate': schedule.experimentSetAt, // Keep original start date
                            'experimentCurrentSchedule.nextWeeklyStatsTimestamp': admin.firestore.Timestamp.fromDate(nextWeeklyTimestamp)
                        });

                        // Create notification for the user
                        const notificationRef = db.collection('pendingStatsNotifications').doc(`${userId}_${statsResult.experimentId}`);
                        await notificationRef.set({
                            userId: userId,
                            userTag: userTag,
                            experimentId: statsResult.experimentId,
                            statsDocumentId: statsResult.experimentId,
                            status: 'ready',
                            generatedAt: FieldValue.serverTimestamp(),
                            message: statsResult.message || `Stats report for experiment ${statsResult.experimentId} is ready.`
                        });

                        logger.log(`checkForEndedExperimentsAndTriggerStats: Notification created for user ${userId}, experiment ${statsResult.experimentId}.`);
                        processedCount++;
                    } else {
                        logger.error(`checkForEndedExperimentsAndTriggerStats: Failed to calculate stats for defined experiment for user ${userId}. Result:`, statsResult);
                        await userDoc.ref.update({
                            'experimentCurrentSchedule.statsProcessed': 'failed',
                            'experimentCurrentSchedule.statsProcessingError': statsResult?.message || 'Unknown error during stats calculation.'
                        });
                    }
                })
                .catch(async (error) => {
                    logger.error(`checkForEndedExperimentsAndTriggerStats: Critical error processing defined experiment for user ${userId}:`, error);
                    try {
                        await userDoc.ref.update({ 'experimentCurrentSchedule.statsProcessed': 'critical_error', 'experimentCurrentSchedule.statsProcessingError': error.message });
                    } catch (updateError) {
                        logger.error(`checkForEndedExperimentsAndTriggerStats: Failed to update status to critical_error for ${userId}`, updateError);
                    }
                });
                promises.push(processingPromise);

            // BRANCH 2: User is in continuous mode and their next weekly report is due.
            } else if (schedule.statsMode === 'continuous' && schedule.nextWeeklyStatsTimestamp && schedule.nextWeeklyStatsTimestamp.toDate() <= nowJs) {

                // REUSE the ID from the last defined experiment
                const experimentIdToReuse = schedule.statsDocumentId;
                if (!experimentIdToReuse) {
                    logger.error(`checkForEndedExperimentsAndTriggerStats: User ${userId} is in continuous mode but has no statsDocumentId to reuse. Skipping.`);
                    return; // Skip this user until the state is corrected
                }

                logger.log(`checkForEndedExperimentsAndTriggerStats: Found user ${userId} due for CONTINUOUS weekly stats. Reusing experiment ID: ${experimentIdToReuse}`);

                const processingPromise = _calculateAndStorePeriodStatsLogic(
                    userId,
                    userTag,
                    experimentIdToReuse, // The reused ID for this specific report
                    schedule.continuousStatsStartDate,
                    nowJs.toISOString(),
                    schedule.scheduledExperimentSettings,
                    "checkForEndedExperimentsAndTriggerStats_Continuous"
                )
                .then(async (statsResult) => {
                    if (statsResult && statsResult.status === 'insufficient_overall_data') {
                        logger.log(`Skipping continuous notification for user ${userId} due to insufficient data for this period.`);
                        const nextWeeklyTimestamp = new Date(nowJs.getTime() + 7 * 24 * 60 * 60 * 1000);
                        await userDoc.ref.update({
                            'experimentCurrentSchedule.nextWeeklyStatsTimestamp': admin.firestore.Timestamp.fromDate(nextWeeklyTimestamp)
                        });
                        return; 
                    }
                    if (statsResult && statsResult.success) {
                        logger.log(`Successfully processed continuous stats for user ${userId}. Overwrote Doc ID: ${statsResult.experimentId}.`);

                        const nextWeeklyTimestamp = new Date(nowJs.getTime() + 7 * 24 * 60 * 60 * 1000);
                        await userDoc.ref.update({
                            'experimentCurrentSchedule.nextWeeklyStatsTimestamp': admin.firestore.Timestamp.fromDate(nextWeeklyTimestamp),
                            'experimentCurrentSchedule.statsProcessingError': FieldValue.delete()
                        });

                        const notificationRef = db.collection('pendingStatsNotifications').doc(`${userId}_${statsResult.experimentId}`);
                        await notificationRef.set({
                            userId: userId,
                            userTag: userTag,
                            experimentId: statsResult.experimentId,
                            statsDocumentId: statsResult.experimentId,
                            status: 'ready',
                            generatedAt: FieldValue.serverTimestamp(),
                            message: `Your weekly stats report is ready!`
                        });
                        logger.log(`Continuous notification created for user ${userId}, experiment ${statsResult.experimentId}.`);
                        processedCount++;
                    } else {
                        logger.error(`Failed to calculate continuous stats for user ${userId}. Result:`, statsResult);
                        await userDoc.ref.update({ 'experimentCurrentSchedule.statsProcessingError': statsResult?.message || 'Unknown error during continuous stats calculation.' });
                    }
                })
                .catch(async (error) => {
                    logger.error(`Critical error processing continuous stats for user ${userId}:`, error);
                    await userDoc.ref.update({ 'experimentCurrentSchedule.statsProcessingError': `Critical error during continuous processing: ${error.message}` });
                });
                promises.push(processingPromise);
            }
        });

        await Promise.all(promises);
        logger.log(`checkForEndedExperimentsAndTriggerStats: Processing complete. ${processedCount} experiments/reports processed.`);
        return null;
    } catch (error) {
        logger.error("checkForEndedExperimentsAndTriggerStats: Overall error in scheduled function:", error);
        return null;
    }
});

exports.getComparativeExperimentStats = onCall(async (request) => {
    // 1. Authentication Check
    if (!request.auth) {
        logger.warn("getComparativeExperimentStats called without authentication.");
        throw new HttpsError('unauthenticated', 'You must be logged in to compare experiment stats.');
    }
    const callingUserId = request.auth.uid; // The user who is authenticated and making the call

    // 2. Input Extraction and Validation
    const { userId, currentExperimentId, numPastExperimentsToCompare } = request.data;
    const numToCompare = numPastExperimentsToCompare || 3; // Default to 3 past experiments

    logger.log(`getComparativeExperimentStats called by authenticated user: ${callingUserId} for target user: ${userId}, currentExperimentId: ${currentExperimentId}, numPastExperimentsToCompare: ${numToCompare}`);

    // Ensure the authenticated user is requesting their own data
    if (callingUserId !== userId) {
        logger.error(`[getComparativeExperimentStats] Security Alert: Authenticated user ${callingUserId} attempted to fetch data for user ${userId}.`);
        throw new HttpsError('permission-denied', 'You are not authorized to request this data.');
    }

    if (!userId || !currentExperimentId) {
        logger.error("getComparativeExperimentStats: Missing required parameters userId or currentExperimentId.", request.data);
        throw new HttpsError('invalid-argument', 'Missing required parameters: userId and currentExperimentId must be provided.');
    }

    // Inside exports.getComparativeExperimentStats = onCall(async (request) => { ... });
    // After input validation:

    const db = admin.firestore(); // Ensure db is initialized

    try {
        // Step 2: Fetch Past Experiment Statistics Documents
        logger.log(`[getComparativeExperimentStats] Fetching past experiment stats for user ${userId}, excluding ${currentExperimentId}, limit to ${numToCompare} past experiments.`);

        const experimentStatsRef = db.collection('users').doc(userId).collection('experimentStats');
        
        // Fetch one more than needed to handle potential inclusion of the current experiment
        // and to ensure we have enough *other* experiments.
        const querySnapshot = await experimentStatsRef
            .orderBy('calculationTimestamp', 'desc') // Assuming 'calculationTimestamp' is a server timestamp
            .limit(numToCompare + 1) // Fetch one extra to help exclude currentExperimentId
            .get();

        if (querySnapshot.empty) {
            logger.log(`[getComparativeExperimentStats] No experiment stats found for user ${userId}.`);
            return { success: true, message: "No past experiment statistics found to compare against.", comparativeData: {} };
        }

        const pastExperimentStats = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            // IMPORTANT: Ensure that the document ID (experimentId) is part of the data we process.
            // The `experimentId` is stored as a field in the document by `calculateAndStorePeriodStats`.
            if (data.experimentId !== currentExperimentId) { // Exclude the current experiment
                pastExperimentStats.push({ id: doc.id, ...data }); // doc.id is the Firestore document ID
                                                                  // data.experimentId is the field stored within the document
            }
        });

        // Ensure we only take up to numToCompare of the *past* experiments
        const finalPastExperiments = pastExperimentStats.slice(0, numToCompare);

        if (finalPastExperiments.length === 0) {
            logger.log(`[getComparativeExperimentStats] No *past* experiment stats found for user ${userId} after excluding the current one or if none exist.`);
            return { success: true, message: "No past experiment statistics found to compare against (excluding the current one).", comparativeData: {} };
        }
        
        logger.log(`[getComparativeExperimentStats] Successfully fetched ${finalPastExperiments.length} past experiment stat(s) for user ${userId}.`);


        // Step 3.1: Fetch the current experiment's data
        const currentExperimentDocRef = db.collection('users').doc(userId).collection('experimentStats').doc(currentExperimentId);
        const currentExperimentSnapshot = await currentExperimentDocRef.get();

        if (!currentExperimentSnapshot.exists) {
            logger.error(`[getComparativeExperimentStats] Current experiment document ${currentExperimentId} not found for user ${userId}.`);
            throw new HttpsError('not-found', `Current experiment data for ${currentExperimentId} not found.`);
        }
        const currentExperimentData = currentExperimentSnapshot.data();
        logger.log(`[getComparativeExperimentStats] Successfully fetched current experiment data (${currentExperimentId}) for user ${userId}.`);

        // Step 3.2: Identify metrics from the current experiment's active settings
        const currentTrackedMetrics = [];
        if (currentExperimentData.activeExperimentSettings) {
            const settings = currentExperimentData.activeExperimentSettings;
            if (settings.output && settings.output.label) {
                currentTrackedMetrics.push({
                    originalLabel: settings.output.label,
                    normalizedLabel: normalizeLabel(settings.output.label),
                    unit: settings.output.unit || "",
                    type: 'output'
                });
            }
            for (let i = 1; i <= 3; i++) {
                const inputSetting = settings[`input${i}`];
                if (inputSetting && inputSetting.label) {
                    currentTrackedMetrics.push({
                        originalLabel: inputSetting.label,
                        normalizedLabel: normalizeLabel(inputSetting.label),
                        unit: inputSetting.unit || "",
                        type: 'input'
                    });
                }
            }
        }

        if (currentTrackedMetrics.length === 0) {
            logger.log(`[getComparativeExperimentStats] No active metrics configured in the current experiment ${currentExperimentId} for user ${userId}.`);
            return { success: true, message: "No metrics configured in the current experiment to compare.", comparativeData: {}, currentExperimentStats: currentExperimentData.calculatedMetricStats || {} };
        }
        logger.log(`[getComparativeExperimentStats] Current tracked metrics for normalization for user ${userId}:`, currentTrackedMetrics.map(m => m.originalLabel));
        
        // Step 3.3: Prepare to collect historical data for matched metrics
        // The keys will be the *original labels* of the current experiment's metrics
        const matchedHistoricalData = {};
        currentTrackedMetrics.forEach(metric => {
            matchedHistoricalData[metric.originalLabel] = {
                label: metric.originalLabel,
                unit: metric.unit,
                type: metric.type,
                pastStats: [], // To store { average, median, variationPercentage, dataPoints, experimentId, experimentEndDateISO }
                pastCorrelations: [] // For input metrics: { coefficient, n_pairs, experimentId, experimentEndDateISO }
            };
        });

        // Step 3.4: Iterate through past experiments and match metrics
        finalPastExperiments.forEach(pastExp => {
            // Match calculatedMetricStats
            if (pastExp.calculatedMetricStats) {
                for (const pastMetricOriginalLabel in pastExp.calculatedMetricStats) {
                    const normalizedPastLabel = normalizeLabel(pastMetricOriginalLabel);
                    const pastMetricData = pastExp.calculatedMetricStats[pastMetricOriginalLabel];

                    const matchedCurrentMetric = currentTrackedMetrics.find(
                        currentMetric => currentMetric.normalizedLabel === normalizedPastLabel && currentMetric.unit === pastMetricData.unit
                    );

                    if (matchedCurrentMetric) {
                        if (pastMetricData.status !== 'skipped_insufficient_data' && pastMetricData.average !== null) {
                            matchedHistoricalData[matchedCurrentMetric.originalLabel].pastStats.push({
                                average: pastMetricData.average,
                                median: pastMetricData.median,
                                variationPercentage: pastMetricData.variationPercentage,
                                dataPoints: pastMetricData.dataPoints,
                                experimentId: pastExp.experimentId, // or pastExp.id if doc ID is experiment ID
                                experimentEndDateISO: pastExp.experimentEndDateISO 
                            });
                        }
                    }
                }
            }

            // Match correlations (only for input metrics)
            if (pastExp.correlations) {
                for (const pastCorrelationInputLabel in pastExp.correlations) {
                    const normalizedPastCorrelationLabel = normalizeLabel(pastCorrelationInputLabel);
                    const pastCorrelationData = pastExp.correlations[pastCorrelationInputLabel];

                    //const matchedCurrentInputMetric = currentTrackedMetrics.find(
                    //    currentMetric => currentMetric.type === 'input' && 
                    //                    currentMetric.normalizedLabel === normalizedPastCorrelationLabel &&
                    //                     currentMetric.unit === (pastExp.activeExperimentSettings?.[`input${Object.keys(pastExp.activeExperimentSettings).find(k => pastExp.activeExperimentSettings[k]?.label === pastCorrelationInputLabel)}`]?.unit) // Attempt to get unit from past experiment's settings for better matching
                    //);
                    
                    //A simpler match if unit for input correlation isn't easily available or critical for matching correlations:
                    const matchedCurrentInputMetric = currentTrackedMetrics.find(
                         currentMetric => currentMetric.type === 'input' && 
                                          currentMetric.normalizedLabel === normalizedPastCorrelationLabel
                     );


                    if (matchedCurrentInputMetric) {
                         if (pastCorrelationData.status === 'calculated' && pastCorrelationData.coefficient !== null) {
                            if (!matchedHistoricalData[matchedCurrentInputMetric.originalLabel].pastCorrelations) {
                                matchedHistoricalData[matchedCurrentInputMetric.originalLabel].pastCorrelations = [];
                            }
                            matchedHistoricalData[matchedCurrentInputMetric.originalLabel].pastCorrelations.push({
                                coefficient: pastCorrelationData.coefficient,
                                n_pairs: pastCorrelationData.n_pairs,
                                experimentId: pastExp.experimentId,
                                experimentEndDateISO: pastExp.experimentEndDateISO
                            });
                        }
                    }
                }
            }
        });
        
        logger.log(`[getComparativeExperimentStats] Finished matching historical data for user ${userId}.`);

       // Inside the try block of getComparativeExperimentStats, after populating matchedHistoricalData

        // Step 5: Calculate Aggregate Statistics for Past Periods
        logger.log(`[getComparativeExperimentStats] Starting aggregation for user ${userId}.`);

        const aggregatedResults = {};

        for (const originalLabel in matchedHistoricalData) {
            if (Object.prototype.hasOwnProperty.call(matchedHistoricalData, originalLabel)) {
                const metricHistory = matchedHistoricalData[originalLabel];
                const aggregatedMetric = {
                    label: metricHistory.label,
                    unit: metricHistory.unit,
                    type: metricHistory.type,
                    numPastPeriodsWithData: 0,
                    weightedAverageOfPastAverages: null,
                    averageOfPastMedians: null, // Medians are tricky to average; simple average for now
                    weightedAverageOfPastVariationPercentages: null,
                    averagePastCorrelationCoefficient: null, // For input metrics
                    totalPastDataPoints: 0,
                    totalPastCorrelationPairs: 0
                };

                // Aggregate pastStats (average, median, variationPercentage)
                if (metricHistory.pastStats && metricHistory.pastStats.length > 0) {
                    aggregatedMetric.numPastPeriodsWithData = metricHistory.pastStats.length;
                    let totalWeightedSumOfAverages = 0;
                    let totalWeightForAverages = 0;
                    let sumOfMedians = 0;
                    let totalWeightedSumOfVariationPercentages = 0;
                    let totalWeightForVariationPercentages = 0;

                    metricHistory.pastStats.forEach(stat => {
                        if (typeof stat.average === 'number' && typeof stat.dataPoints === 'number' && stat.dataPoints > 0) {
                            totalWeightedSumOfAverages += stat.average * stat.dataPoints;
                            totalWeightForAverages += stat.dataPoints;
                        }
                        if (typeof stat.median === 'number') {
                            sumOfMedians += stat.median;
                        }
                        if (typeof stat.variationPercentage === 'number' && typeof stat.dataPoints === 'number' && stat.dataPoints > 0) {
                            totalWeightedSumOfVariationPercentages += stat.variationPercentage * stat.dataPoints;
                            totalWeightForVariationPercentages += stat.dataPoints;
                        }
                        aggregatedMetric.totalPastDataPoints += (stat.dataPoints || 0);
                    });

                    if (totalWeightForAverages > 0) {
                        aggregatedMetric.weightedAverageOfPastAverages = parseFloat((totalWeightedSumOfAverages / totalWeightForAverages).toFixed(2));
                    }
                    if (metricHistory.pastStats.length > 0 && sumOfMedians > 0) { // check if any medians were summed
                        aggregatedMetric.averageOfPastMedians = parseFloat((sumOfMedians / metricHistory.pastStats.length).toFixed(2));
                    }
                    if (totalWeightForVariationPercentages > 0) {
                        aggregatedMetric.weightedAverageOfPastVariationPercentages = parseFloat((totalWeightedSumOfVariationPercentages / totalWeightForVariationPercentages).toFixed(2));
                    }
                }

                // Aggregate pastCorrelations (coefficient)
                if (metricHistory.type === 'input' && metricHistory.pastCorrelations && metricHistory.pastCorrelations.length > 0) {
                    let sumOfCoefficients = 0;
                    metricHistory.pastCorrelations.forEach(corr => {
                        if (typeof corr.coefficient === 'number') {
                            sumOfCoefficients += corr.coefficient;
                        }
                        aggregatedMetric.totalPastCorrelationPairs += (corr.n_pairs || 0);
                    });
                    if (metricHistory.pastCorrelations.length > 0) {
                       aggregatedMetric.averagePastCorrelationCoefficient = parseFloat((sumOfCoefficients / metricHistory.pastCorrelations.length).toFixed(3));
                    }
                }
                aggregatedResults[originalLabel] = aggregatedMetric;
            }
        }
        
        logger.log(`[getComparativeExperimentStats] Finished aggregation for user ${userId}.`);

        // Inside the try block of getComparativeExperimentStats, after calculating aggregatedResults

        // Step 6: Structure and Return the Comparison Data
        logger.log(`[getComparativeExperimentStats] Structuring final response for user ${userId}.`);

        const comparisonResponse = {};
        const currentStatsOfCurrentExperiment = currentExperimentData.calculatedMetricStats || {};

        // currentTrackedMetrics was defined in Step 3 and contains { originalLabel, unit, type, normalizedLabel }
        // for all metrics active in the current experiment.
        currentTrackedMetrics.forEach(metricConfig => {
            const originalLabel = metricConfig.originalLabel;
            const currentMetricStat = currentStatsOfCurrentExperiment[originalLabel];
            const historicalAggregates = aggregatedResults[originalLabel];

            comparisonResponse[originalLabel] = {
                label: originalLabel,
                unit: metricConfig.unit,
                type: metricConfig.type,
                currentStats: { // Stats from the current experiment period
                    average: currentMetricStat?.average ?? null,
                    median: currentMetricStat?.median ?? null,
                    variationPercentage: currentMetricStat?.variationPercentage ?? null,
                    dataPoints: currentMetricStat?.dataPoints ?? 0,
                    status: currentMetricStat && currentMetricStat.average !== null ? 'data_available' : 'not_available_in_current'
                },
                historicalComparison: { // Aggregated stats from past experiment periods
                    status: 'no_comparable_data', // Default status
                    weightedAverageOfPastAverages: null,
                    averageOfPastMedians: null,
                    weightedAverageOfPastVariationPercentages: null,
                    averagePastCorrelationCoefficient: null, // Only for input types
                    numPastPeriodsWithData: 0,
                    totalPastDataPoints: 0,
                    totalPastCorrelationPairs: 0      // Only for input types
                }
            };

            if (historicalAggregates && historicalAggregates.numPastPeriodsWithData > 0) {
                comparisonResponse[originalLabel].historicalComparison = {
                    status: 'data_available',
                    weightedAverageOfPastAverages: historicalAggregates.weightedAverageOfPastAverages,
                    averageOfPastMedians: historicalAggregates.averageOfPastMedians,
                    weightedAverageOfPastVariationPercentages: historicalAggregates.weightedAverageOfPastVariationPercentages,
                    averagePastCorrelationCoefficient: metricConfig.type === 'input' ? historicalAggregates.averagePastCorrelationCoefficient : null,
                    numPastPeriodsWithData: historicalAggregates.numPastPeriodsWithData,
                    totalPastDataPoints: historicalAggregates.totalPastDataPoints,
                    totalPastCorrelationPairs: metricConfig.type === 'input' ? historicalAggregates.totalPastCorrelationPairs : 0
                };
            }
        });

        logger.log(`[getComparativeExperimentStats] Successfully structured comparison response for user ${userId}.`);
        
        // Final return from the function
        return { 
            success: true, 
            message: "Comparative statistics generated successfully.",
            currentExperimentId: currentExperimentId,
            comparisonResults: comparisonResponse, // This is the main data for the bot
            numPastExperimentsConsidered: numToCompare // From input or default
        };

    } catch (error) {
        logger.error(`[getComparativeExperimentStats] Error fetching past experiment stats for user ${userId}:`, error);
        throw new HttpsError('internal', 'Failed to fetch past experiment statistics.', error.message);
    }

});


function getDayOfYear(date) { // [cite: 819, 820]
    const start = new Date(date.getUTCFullYear(), 0, 0);
    const diff = (date - start) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay);
}


/**
 * Calculates the duration of a time window in hours.
 * Handles windows that span midnight.
 * @param {number} startHourUTC Start hour (0-23).
 * @param {number} endHourUTC End hour (0-23).
 * @returns {number} Duration in hours.
 */
function calculateWindowDuration(startHourUTC, endHourUTC) {
    if (startHourUTC === endHourUTC) return 24; // Full day window
    if (endHourUTC > startHourUTC) {
        return endHourUTC - startHourUTC;
    } else { // Spans midnight
        return (24 - startHourUTC) + endHourUTC;
    }
}

/**
 * Defines the first and second halves of a reminder window.
 * @param {number} startHourUTC Reminder window start hour (0-23).
 * @param {number} endHourUTC Reminder window end hour (0-23).
 * @returns {{firstHalf: {start: number, end: number}, secondHalf: {start: number, end: number}, midPointHourFloored: number } | null}
 * Object with start/end hours for each half, or null if invalid input.
 * Hours are UTC, 0-23. 'end' is exclusive for checking.
 */
function getReminderWindowHalves(startHourUTC, endHourUTC) {
    if (typeof startHourUTC !== 'number' || typeof endHourUTC !== 'number' ||
        startHourUTC < 0 || startHourUTC > 23 || endHourUTC < 0 || endHourUTC > 23) {
        logger.warn(`[getReminderWindowHalves] Invalid start/end hours: ${startHourUTC}-${endHourUTC}`);
        return null;
    }

    const duration = calculateWindowDuration(startHourUTC, endHourUTC);
    if (duration <= 0) {
        logger.warn(`[getReminderWindowHalves] Invalid duration ${duration} for window ${startHourUTC}-${endHourUTC}`);
        return null;
    }

    const halfDuration = duration / 2;
    let midPointHour = (startHourUTC + halfDuration) % 24;

    let firstHalf = { start: startHourUTC, end: midPointHour };
    let secondHalf = { start: midPointHour, end: endHourUTC };

    // Adjust for clarity: midPointHourFloored is the hour where the second half begins.
    // 'end' hours in the returned objects will be exclusive for checks like currentHour < half.end
    
    // If midpoint isn't an integer, the first half effectively ends at floor(midPointHour),
    // and second half starts at floor(midPointHour).
    // For checks like currentHour >= start && currentHour < end
    // If duration is odd, one half will be slightly longer.
    // Example: 9 to 18 (9 hours). Half duration 4.5. Midpoint 13.5.
    // First half: 9, 10, 11, 12 (4 hours if midPointHour is floored for end)
    // Second half: 13, 14, 15, 16, 17 (5 hours)
    // Let's make the split as even as possible for hour-based checks.
    // The midPointHour will be the start of the second half.
    // The end of the first half will be midPointHour.

    //logger.info(`[getReminderWindowHalves] Window ${startHourUTC}-${endHourUTC}. Duration: ${duration}. HalfDuration: ${halfDuration}. MidPointHourRaw: ${startHourUTC + halfDuration}. MidPointHourMod24: ${midPointHour}`);
    
    return {
        firstHalf: { start: startHourUTC, end: midPointHour }, // firstHalf.end is exclusive
        secondHalf: { start: midPointHour, end: endHourUTC },   // secondHalf.end is exclusive
        midPointHourFloored: Math.floor(midPointHour) // Integer hour for easier understanding if needed
    };
}

/**
 * Determines which half of the window the current UTC hour falls into.
 * @param {number} currentUTCHour The current UTC hour (0-23).
 * @param {object} windowHalves The object returned by getReminderWindowHalves.
 * @returns {'first_half' | 'second_half' | 'outside'} String indicating the half.
 */
function getCurrentWindowHalf(currentUTCHour, windowHalves) {
    if (!windowHalves) return 'outside';

    const { firstHalf, secondHalf } = windowHalves;

    // Check first half
    // Handles wrap-around for firstHalf.start > firstHalf.end (e.g. window 22:00 - 02:00, first half 22:00 - 00:00)
    if (firstHalf.start <= firstHalf.end) { // Normal window part
        if (currentUTCHour >= firstHalf.start && currentUTCHour < firstHalf.end) {
            return 'first_half';
        }
    } else { // Window part wraps around midnight
        if (currentUTCHour >= firstHalf.start || currentUTCHour < firstHalf.end) {
            return 'first_half';
        }
    }

    // Check second half
    // Handles wrap-around for secondHalf.start > secondHalf.end (e.g. window 22:00 - 04:00, second half 01:00 - 04:00)
    if (secondHalf.start <= secondHalf.end) { // Normal window part
        if (currentUTCHour >= secondHalf.start && currentUTCHour < secondHalf.end) {
            return 'second_half';
        }
    } else { // Window part wraps around midnight
        if (currentUTCHour >= secondHalf.start || currentUTCHour < secondHalf.end) {
            return 'second_half';
        }
    }
    
    // Special case: If window is 24 hours (start === end for both halves after calculation)
    // and duration was 24, then midPointHour would be startHourUTC + 12.
    // e.g. Window 9-9. Duration 24. Midpoint 21.
    // First half: 9 - 21. Second half: 21 - 9.
    // If currentUTCHour is exactly on the midPointHour, it's considered start of second_half by convention here.
    // If currentUTCHour is exactly on startHourUTC (and it's a 24h window), it's start of first_half.

    return 'outside';
}


/**
 * Scheduled function to check for and trigger user reminders using a probabilistic model.
 * Now includes AI-personalization based on the user's most recent log.
 * Runs periodically (e.g., every 55 minutes).
 */

exports.sendScheduledReminders = onSchedule("every 55 minutes", async (event) => {
    logger.log("sendScheduledReminders: Scheduled function triggered.", event.scheduleTime);
    const db = admin.firestore();
    const now = new Date();
    const currentUTCHour = now.getUTCHours();

    try {
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) {
            logger.log("sendScheduledReminders: No users found.");
            return null;
        }

        const reminderPromises = [];
        for (const userDoc of usersSnapshot.docs) { // Use for...of for async operations inside loop
            const userId = userDoc.id;
            const userData = userDoc.data();
            const schedule = userData.experimentCurrentSchedule;

            // 1. PRELIMINARY CHECKS
            if (!schedule || typeof schedule !== 'object' || schedule.remindersSkipped === true || !schedule.totalWeeklyReminders || schedule.totalWeeklyReminders <= 0 || !schedule.weeklyReminderPeriodStart) {
                continue;
            }

            const {
                remindersLeftToSend,
                totalWeeklyReminders,
                weeklyReminderPeriodStart,
                reminderWindowStartUTC,
                reminderWindowEndUTC
            } = schedule;

            let remindersLeft = remindersLeftToSend; // Use a mutable variable for this iteration

            const weeklyStartDate = weeklyReminderPeriodStart.toDate();
            const weeklyEndDate = new Date(weeklyStartDate.getTime() + 7 * 24 * 60 * 60 * 1000);

            // --- CORRECTED LOGIC: RESET FIRST ---
            if (now > weeklyEndDate) {
                logger.log(`[sendScheduledReminders] Weekly reminder period ended for user ${userId}. Resetting reminders for the new week.`);
                const resetPromise = userDoc.ref.update({
                    'experimentCurrentSchedule.remindersLeftToSend': totalWeeklyReminders,
                    'experimentCurrentSchedule.weeklyReminderPeriodStart': admin.firestore.FieldValue.serverTimestamp()
                }).catch(err => {
                    logger.error(`[sendScheduledReminders] Failed to reset weekly reminder schedule for user ${userId}:`, err);
                });
                reminderPromises.push(resetPromise);
                remindersLeft = totalWeeklyReminders; // Update the mutable variable
            }
            
            // --- NOW CHECK IF THERE ARE REMINDERS LEFT ---
            if (remindersLeft <= 0) {
                continue;
            }

            // 2. CHECK IF IN WINDOW
            const windowDuration = calculateWindowDuration(reminderWindowStartUTC, reminderWindowEndUTC);
            let isInWindow = false;
            if (reminderWindowStartUTC < reminderWindowEndUTC) {
                if (currentUTCHour >= reminderWindowStartUTC && currentUTCHour < reminderWindowEndUTC) isInWindow = true;
            } else {
                if (currentUTCHour >= reminderWindowStartUTC || currentUTCHour < reminderWindowEndUTC) isInWindow = true;
            }
            if (!isInWindow) {
                continue;
            }

            // 3. CALCULATE PROBABILITY
            const hoursRemainingInToday = Math.max(0, (reminderWindowEndUTC > currentUTCHour ? reminderWindowEndUTC : (reminderWindowEndUTC + 24)) - currentUTCHour);
            const msUntilTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
            const fullDaysLeft = Math.floor((weeklyEndDate.getTime() - (now.getTime() + msUntilTomorrow)) / (1000 * 60 * 60 * 24));
            const hoursInFutureFullDays = Math.max(0, fullDaysLeft) * windowDuration;
            const timeSlotsLeftInWeek = hoursRemainingInToday + hoursInFutureFullDays;
            if (timeSlotsLeftInWeek <= 0) {
                continue;
            }

            let probability = remindersLeft / timeSlotsLeftInWeek;
            if (remindersLeft >= timeSlotsLeftInWeek) {
                probability = 1.0;
            }

            // 4. ROLL THE DICE & GENERATE MESSAGE
            if (Math.random() < probability) {
                logger.log(`sendScheduledReminders: User ${userId} PASSED check. Probability: ${probability.toFixed(3)}. Preparing reminder message.`);

                let finalReminderMessage = "";
                let usedAiMessage = false;

                // --- AI Personalization Logic ---
                if (genAI && schedule.scheduledExperimentSettings) {
                    try {
                        // A. Fetch last 3 logs for context
                const logsQuery = db.collection('logs').where('userId', '==', userId).orderBy('timestamp', 'desc').limit(3);
                const logsSnapshot = await logsQuery.get();
                let recentNotes = "No recent notes available.";
                let habitToMention = null;

                if (!logsSnapshot.empty) {
                    // Get all notes from the fetched logs, newest first
                    const notesEntries = logsSnapshot.docs
                        .map(doc => doc.data().notes?.trim())
                        .filter(Boolean); // Filter out any empty or null notes

                    if (notesEntries.length > 0) {
                        // Join notes with a separator to provide them all to the AI
                        recentNotes = notesEntries.join("\n---\n");
                    }
                    
                    // Still identify the single most recent log for the habit-to-mention logic
                    const lastLogData = logsSnapshot.docs[0].data();

                    // Find a habit that was below its goal from the most recent log
                    if (Array.isArray(lastLogData.inputs)) {
                        for (const loggedInput of lastLogData.inputs) {
                            const settingKey = Object.keys(schedule.scheduledExperimentSettings).find(k => schedule.scheduledExperimentSettings[k]?.label === loggedInput.label);
                            if (settingKey) {
                                const habitSetting = schedule.scheduledExperimentSettings[settingKey];
                                if (loggedInput.value < habitSetting.goal) {
                                    habitToMention = loggedInput.label;
                                    break; // Found one, stop looking
                                }
                            }
                        }
                    }
                }

                                    // B. Construct Prompt
                    const randomSeedMessage = defaultReminderMessages[Math.floor(Math.random() * defaultReminderMessages.length)];
                    const userHabits = [
                        schedule.scheduledExperimentSettings?.input1?.label,
                        schedule.scheduledExperimentSettings?.input2?.label,
                        schedule.scheduledExperimentSettings?.input3?.label
                    ].filter(Boolean).join(', ');

                    const aiPromptText = `
                        You are a witty, empathetic accountability partner and habit coach. Your goal is to reframe a reminder from a "to-do" into a creative, gentle invitation to find an intrinsic reward, using a specific theme (1-3 sentences, under 150 characters).

                        CONTEXT:
                        - Creative Theme: Your reminder MUST be inspired by the theme of this message: "${randomSeedMessage}"
                        - User's Deeper Wish: "${schedule.scheduledExperimentSettings?.deeperProblem || 'Not specified'}"
                        - User's Habits: ${userHabits}
                        - User's Recent Notes (Newest First): "${recentNotes}"
                        - Habit to Focus On (if any): "${habitToMention || 'None specified'}"

                        YOUR TASK:
                        1.  Read all the context, especially the "Creative Theme".
                        2.  Analyze the "Recent Notes" to find a potential "intrinsic reward" for one of the user's habits. An intrinsic reward is a small, positive sensory detail or feeling experienced *during* the activity (e.g., the warmth of a mug, the feeling of fresh air, a moment of mental quiet), or immediately afterward (accomplishment, resilience, etc.).
                        3.  Craft a short, gentle reminder (1-3 sentences, under 150 characters) that invites the user to notice this potential reward.
                        4.  CRITICAL: You MUST frame your reminder through the lens of the "Creative Theme". For example, if the theme is 'painting a moment', your reminder about a coffee habit might be, "What tiny detail could you 'paint' into your memory from your coffee break today? Maybe the swirl of the cream or the warmth of the mug."
                        5.  If a specific "Habit to Focus On" is provided, tailor the message to that habit. Otherwise, choose the most relevant habit based on their notes.
                        
                        Generate ONLY the reminder message text. Be conversational and avoid greetings.`;

                        // C. Call AI
                        const request = {
                            contents: [{ role: "user", parts: [{ text: aiPromptText }] }],
                        };
                        const result = await generativeModel.generateContent(request);
                        const response = result.response;
                        const candidateText = response.text().trim();

                        if (candidateText && candidateText.length > 0 && candidateText.length <= 200) {
                            finalReminderMessage = candidateText;
                            usedAiMessage = true;
                            logger.info(`[sendScheduledReminders] AI message GENERATED for ${userId}: "${finalReminderMessage}"`);
                        }
                    } catch (aiError) {
                        logger.error(`[sendScheduledReminders] AI message generation FAILED for ${userId}. Error:`, aiError.message);
                    }
                }

                // D. Fallback Logic
                if (!usedAiMessage) {
                    finalReminderMessage = defaultReminderMessages[Math.floor(Math.random() * defaultReminderMessages.length)];
                    logger.info(`[sendScheduledReminders] Using FALLBACK message for ${userId}: "${finalReminderMessage}"`);
                }

                // E. Queue the DM
                const reminderPromise = db.runTransaction(async (transaction) => {
                    const userDocForTransaction = await transaction.get(userDoc.ref);
                    const currentSchedule = userDocForTransaction.data().experimentCurrentSchedule;

                    if (currentSchedule.remindersLeftToSend > 0) {
                        const newReminderRef = db.collection('pendingReminderDMs').doc();
                        transaction.set(newReminderRef, {
                            userId: userId,
                            userTag: userData.userTag || `User_${userId}`,
                            messageToSend: finalReminderMessage,
                            experimentId: schedule.experimentId || null,
                            status: 'pending',
                            createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        transaction.update(userDoc.ref, {
                            'experimentCurrentSchedule.remindersLeftToSend': admin.firestore.FieldValue.increment(-1)
                        });
                    }
                });
                reminderPromises.push(reminderPromise);
            }
        }

        await Promise.all(reminderPromises);
        logger.log(`sendScheduledReminders: Processing complete. Dispatched ${reminderPromises.length} reminders this run.`);
        return null;
    } catch (error) {
        logger.error("sendScheduledReminders: Overall error in scheduled function:", error);
        return null;
    }
});
  
// Add this new Firebase Callable Function to your functions index with stats.txt

/**
 * Fetches a cached AI insight or generates a new one for a specific experiment.
 * Triggered by the "Get AI Insights" button in the Discord bot.
 *
 * Expected request.data: { targetExperimentId: string }
 * Expects request.auth.uid to be present for authenticated user.
 */
exports.fetchOrGenerateAiInsights = onCall(async (request) => {
  logger.log("[fetchOrGenerateAiInsights] V2 Function called. Request data:", request.data);

  // 1. Authentication & Validation
  if (!request.auth) {
    logger.warn("[fetchOrGenerateAiInsights] Unauthenticated access attempt.");
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  const userId = request.auth.uid;
  const { targetExperimentId } = request.data;
  if (!targetExperimentId) {
    logger.warn(`[fetchOrGenerateAiInsights] Invalid argument: targetExperimentId missing for user ${userId}.`);
    throw new HttpsError('invalid-argument', 'The function must be called with a "targetExperimentId".');
  }
  logger.info(`[fetchOrGenerateAiInsights] Processing request for user: ${userId}, targetExperimentId: ${targetExperimentId}`);

  const db = admin.firestore();
  try {
    // 2. Data Fetching
    const targetExperimentStatsDocRef = db.collection('users').doc(userId).collection('experimentStats').doc(targetExperimentId);
    const targetExperimentStatsSnap = await targetExperimentStatsDocRef.get();

    if (!targetExperimentStatsSnap.exists) {
      logger.warn(`[fetchOrGenerateAiInsights] Target experiment stats document not found for user ${userId}, experiment ${targetExperimentId}.`);
      throw new HttpsError('not-found', 'Target experiment statistics not found.');
    }
    const targetExperimentStatsData = targetExperimentStatsSnap.data();

    // 3. Caching Logic (Checking for the new object)
    const cachedInsights = targetExperimentStatsData.aiEnhancedInsights;
    if (cachedInsights && cachedInsights.strikingInsight) {
        logger.log(`[fetchOrGenerateAiInsights] Serving cached enhanced insight for experiment ${targetExperimentId}.`);
        return { success: true, insights: cachedInsights, source: "cached" };
    }

    // 4. If Generating New Insights (Cache Miss)
    logger.log(`[fetchOrGenerateAiInsights] Generating new enhanced insights for experiment ${targetExperimentId}.`);
    if (!genAI) {
        logger.error("[fetchOrGenerateAiInsights] Gemini AI client (genAI) is not initialized.");
        throw new HttpsError('internal', "The AI insights service is currently unavailable.");
    }

    // 4a. Data Preparation for Prompt
    const activeSettings = targetExperimentStatsData.activeExperimentSettings;
    const deeperProblem = activeSettings?.deeperProblem || "Not specified";
    const totalLogsProcessed = targetExperimentStatsData.totalLogsInPeriodProcessed || 0;
    const calculatedMetrics = targetExperimentStatsData.calculatedMetricStats || {};
    const correlationsData = targetExperimentStatsData.correlations || {};
    const pairwiseInteractions = targetExperimentStatsData.pairwiseInteractionResults || {};
    const lagTimeCorrelations = targetExperimentStatsData.lagTimeCorrelations || {};

    const userMainDocSnap = await db.collection('users').doc(userId).get();
    const userMainData = userMainDocSnap.data() || {};
    const userOverallStreak = userMainData.currentStreak || 0;

    let experimentNotesSummary = "No notes were found for this experiment period.";
    const experimentStartDateForNotes = targetExperimentStatsData.experimentSettingsTimestamp ? new Date(targetExperimentStatsData.experimentSettingsTimestamp) : null;
    const experimentEndDateForNotes = targetExperimentStatsData.experimentEndDateISO ? new Date(targetExperimentStatsData.experimentEndDateISO) : null;

    if (experimentStartDateForNotes && experimentEndDateForNotes) {
        const logsQuery = db.collection('logs')
            .where('userId', '==', userId)
            .where('timestamp', '>=', experimentStartDateForNotes)
            .where('timestamp', '<=', experimentEndDateForNotes)
            .orderBy('timestamp', 'asc');
        const logsSnapshot = await logsQuery.get();
        if (!logsSnapshot.empty) {
            const notesEntries = logsSnapshot.docs.map(doc => {
                const log = doc.data();
                const logDate = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString() : 'Unknown Date';
                return (log.notes && log.notes.trim()) ? `- On ${logDate}: ${log.notes.trim()}` : null;
            }).filter(Boolean);
            if (notesEntries.length > 0) {
                experimentNotesSummary = "Key notes from this period:\n" + notesEntries.join("\n");
            }
        }
    }

    const promptData = {
      deeperProblem,
      totalLogsProcessed,
      calculatedMetrics,
      correlationsData,
      pairwiseInteractions,
      lagTimeCorrelations,
      userOverallStreak,
      experimentNotesSummary,
    };

    // 4b. Populate and Call Gemini
    const request = {
        contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
    };
    const result = await generativeModel.generateContent(request);
    const response = result.response;

    // First, check if the response was blocked by safety filters.
    if (response.promptFeedback && response.promptFeedback.blockReason) {
        const blockReason = response.promptFeedback.blockReason;
        logger.error(`[fetchOrGenerateAiInsights] AI response was blocked for experiment ${targetExperimentId}. Reason: ${blockReason}`);
        throw new HttpsError('resource-exhausted', `The AI couldn't generate insights due to content restrictions (${blockReason}).`);
    }

    const responseText = response.text().trim();

    if (!responseText) {
        throw new HttpsError('internal', 'AI generated an empty response.');
    }

    let newEnhancedInsights;
    try {
        // First, try to parse the response directly
        newEnhancedInsights = JSON.parse(responseText);
    } catch (initialParseError) {
        // If the first parse fails, attempt to clean the string and retry
        logger.warn(`[fetchOrGenerateAiInsights] Initial JSON parse failed for log ${targetExperimentId}. Attempting to clean the response. Error:`, initialParseError.message);
        
        // This removes common markdown code fences that the AI sometimes adds
        const cleanText = responseText.replace(/```json\n/g, '').replace(/\n```/g, '').trim();

        try {
            newEnhancedInsights = JSON.parse(cleanText);
            logger.log(`[fetchOrGenerateAiInsights] Successfully parsed AI response after cleaning markdown fences.`);
        } catch (finalParseError) {
            // If it still fails after cleaning, then we log the error and throw
            logger.error(`[fetchOrGenerateAiInsights] Failed to parse Gemini JSON response even after cleaning for log ${targetExperimentId}. Raw: "${responseText}". Error:`, finalParseError);
            throw new HttpsError('internal', `AI returned an invalid format that could not be automatically corrected: ${finalParseError.message}`);
        }
    }

    if (!newEnhancedInsights.strikingInsight || !newEnhancedInsights.experimentStory || !newEnhancedInsights.nextExperimentSuggestions) {
        throw new HttpsError('internal', 'AI response was missing one or more required fields.');
    }

    // 4c. Store New Insight Object in Firestore
    await targetExperimentStatsDocRef.update({
      aiEnhancedInsights: newEnhancedInsights,
      aiInsightGeneratedAt: FieldValue.serverTimestamp()
    });
    logger.log(`[fetchOrGenerateAiInsights] Successfully stored new enhanced insights for experiment ${targetExperimentId}.`);

    // 4d. Return New Insight Object
    return { success: true, insights: newEnhancedInsights, source: "generated" };

  } catch (error) {
    logger.error(`[fetchOrGenerateAiInsights] Critical error for user ${userId}, experiment ${targetExperimentId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `An unexpected error occurred while processing AI insights: ${error.message}`);
  }
});


/**
 * INTERNAL LOGIC for analyzing log notes. This is not a public-facing function.
 * @param {string} logId The ID of the log document.
 * @param {string} userId The ID of the user.
 * @param {string} userTag The tag of the user.
 * @returns {Promise<{success: boolean, message: string}>} A promise that resolves with the operation result.
 */
async function _analyzeAndSummarizeNotesLogic(logId, userId, userTag) {
    const db = admin.firestore();

    try {
        // 1. Fetch the full log document including notes
        const logDocRef = db.collection('logs').doc(logId);
        const logSnap = await logDocRef.get();

        if (!logSnap.exists) {
            logger.warn(`[_analyzeNotesLogic] Log document ${logId} not found for analysis.`);
            // Throw a regular error, not HttpsError, as this is an internal function
            throw new Error(`Log document ${logId} not found.`);
        }

        const logData = logSnap.data();
        const notes = logData.notes?.trim() || "";
        const deeperProblem = logData.deeperProblem?.trim() || "Not specified.";
        const outputMetric = logData.output || {};
        const inputs = logData.inputs || [];

        // (NEW CODE) Fetch the PREVIOUS log for additional context
        const previousLogsQuery = db.collection('logs')
            .where('userId', '==', userId)
            .orderBy('timestamp', 'desc')
            .limit(2);
        const previousLogsSnapshot = await previousLogsQuery.get();

        let previousLogNote = "No previous notes found.";
        if (previousLogsSnapshot.docs.length > 1) {
            // The 2nd document is the one before the current log
            const previousLogData = previousLogsSnapshot.docs[1].data();
            previousLogNote = previousLogData.notes?.trim() || "No previous notes found.";
        }
        logger.log(`[_analyzeNotesLogic] Found previous log note for context: "${previousLogNote}"`);
        // If notes are empty, we don't need AI analysis

        if (!notes) {
            logger.log(`[_analyzeNotesLogic] Log ${logId} has no notes. Skipping AI analysis.`);
            return null; // Return null if there are no notes to analyze
        }

        // 2. Check if Gemini AI client is available
        if (!genAI) {
            logger.error("[_analyzeNotesLogic] Gemini AI client not initialized. Cannot analyze notes.");
            throw new Error("AI service is unavailable. (AI client not ready)");
        }

        // 3. Construct the AI prompt
        const inputLabels = inputs.filter(i => i.label).map(i => `'${i.label}'`).join(', ') || 'no specific habits';

        const prompt = `
            You are a witty, supportive friend. Your tone is conversational, informal, and always encouraging a growth mindset. Use everyday language and humor. Analyze the user's log notes and provide feedback that sounds like it's from a real person who cares.
            **User's Context:**
            - Deeper Wish: "${deeperProblem}"
            - Main Outcome Metric: "${outputMetric.label || 'N/A'}" (Goal: ${outputMetric.goal || 'N/A'} ${outputMetric.unit || 'N/A'})
            - Daily Habits: ${inputLabels}

            **User's Daily Log Notes:**
            "${notes}"
            **User's Previous Day's Note:**
            "${previousLogNote}"

            **Your Task:**
            Use the Daily Log Notes and "Previous Day's Note", as well as their metrics for context on their journey.
            1.  **Acknowledge Experience (25-50 characters):** Based on the notes, formulate a *single, concise sentence* that genuinely acknowledges the user's overall experience or key theme.
            It should sound like: "It sounds like you [acknowledgment]." or "It seems you [acknowledgment]." Be specific about emotion or effort.
            2.  **Comfort/Support Message (50-100 characters):** Provide a short, uplifting, and mindfulness inspiring message that normalizes their experience or guides them to pay attention to how they feel without judgment even just for a moment.
            Try to encourage mindfulness, a growth mindset, or realistic optimism.
            3.  **Public Post Suggestion (80-130 characters):** Create a *single, engaging sentence* that the user *could* post to a chat group.
            This should be from *their perspective* (first-person), positive, and encourage connection or shared experience.
            It should highlight a key win, an interesting insight, or a gentle question/struggle. Avoid jargon.
            Examples:
                * "Today was a tough one for me with [Habit or Outcome]. Anyone have tips for staying consistent on low-energy days [or more specific problem from notes]?"
                * "Interesting pattern from my experiment today: I did [describe the way they did a habit], and I noticed [something interesting happened]. Just a small thing I'm now paying attention to."
                * "Felt great after hitting my goal for [Habit] today! It really seemed to help with [positive effect mentioned in notes]. Small wins!"
                * "I've been wanting [Deeper Wish], and today felt a step in that direction because [reason from notes]. It's cool to see new connections."
                * "My main takeaway from today: [brief, insightful summary of a learning]. Curious if that resonates with anyone."
            
            DO NOT say "Anyone else..." at the end of the message.
            DO NOT use cliches like "small wins add up." The language of the message should be in the style of the notes.

            Return your response ONLY as a JSON object with the following structure:
            {
                "acknowledgment": "A concise, empathetic sentence acknowledging the user's experience from their notes.",
                "comfortMessage": "A short, uplifting, and supportive message for the user.",
                "publicPostSuggestion": "An engaging, first-person sentence (as the user) that could be posted publicly. This should be a varied output that can be a question, a celebration, or an insight based on their notes. Refer to examples above."
            }
            Do not include any other text, instructions, or markdown outside the JSON object.
        `;

        logger.info(`[_analyzeNotesLogic] Sending prompt to Gemini for log ${logId}.`);

        // 4. Call Gemini
        const request = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        };
        const result = await generativeModel.generateContent(request);
        const response = result.response;
        const responseText = response.text().trim();

        if (!responseText) {
            logger.warn(`[_analyzeNotesLogic] Gemini returned an empty response for log ${logId}.`);
            throw new Error('AI generated an empty response.');
        }

        let aiResult;
        try {
            aiResult = JSON.parse(responseText);
        } catch (parseError) {
            logger.error(`[_analyzeNotesLogic] Failed to parse Gemini JSON response for log ${logId}. Raw: "${responseText}". Error:`, parseError);
            throw new Error(`AI returned an invalid format: ${parseError.message}`);
        }

        if (!aiResult.acknowledgment || !aiResult.comfortMessage || !aiResult.publicPostSuggestion) {
            logger.error(`[_analyzeNotesLogic] AI response missing required fields for log ${logId}. Result:`, aiResult);
            throw new Error('AI response missing required fields.');
        }

        // 5. Return the AI-generated result object directly
        logger.log(`[_analyzeNotesLogic] Successfully generated AI response for log ${logId}.`);
        return aiResult;
            } catch (error) {
                logger.error(`[_analyzeNotesLogic] Error processing log ${logId} for user ${userId}:`, error);
                // Re-throw the error so the calling function (onCall or onUpdate) can handle it.
                throw error;
            }
        }


/**
 * Analyzes a user's log notes using Gemini and creates a document in a 
 * dedicated collection for the bot to pick up and send as a DM.
 * This is the onCall wrapper for the internal logic.
 *
 * Expected request.data: { logId: string, userId: string, userTag: string }

exports.analyzeAndSummarizeLogNotes = onCall(async (request) => {
    logger.log("[analyzeAndSummarizeLogNotes] Function triggered. Request data:", request.data);

    // 1. Authentication & Validation
    if (!request.auth) {
        logger.warn("[analyzeAndSummarizeLogNotes] Unauthenticated access attempt.");
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const { logId, userId, userTag } = request.data;
    if (!logId || !userId || !userTag) {
        logger.warn("[analyzeAndSummarizeLogNotes] Invalid arguments: logId, userId, or userTag missing.");
        throw new HttpsError('invalid-argument', 'Missing required parameters: logId, userId, userTag.');
    }

    // 2. Call the internal logic function
    try {
        // This now calls the helper function with the core logic.
        const result = await _analyzeAndSummarizeNotesLogic(logId, userId, userTag);
        return result; // Forward the result to the client
    } catch (error) {
        logger.error(`[analyzeAndSummarizeLogNotes] Error processing log ${logId} for user ${userId}:`, error);
        // Convert internal errors to HttpsError for the client
        if (error.message && error.message.toLowerCase().includes('safety')) {
            throw new HttpsError('resource-exhausted', "AI couldn't analyze notes due to content restrictions. Please try rephrasing.");
        }
        throw new HttpsError('internal', `Failed to analyze log notes: ${error.message}`);
    }
});
*/

/**
 * Scans a user's entire log history and uses AI to find historical metrics that
 * are semantically similar to a newly selected metric.
 *
 * Expected request.data: { selectedMetric: { label: string, unit: string } }
 * Returns: { success: true, matches: [{label: string, unit: string}, ...] }
 */
exports.getHistoricalMetricMatches = onCall(async (request) => {
  logger.log("[getHistoricalMetricMatches] V2 Function called. Data:", request.data);

  // 1. Authentication & Validation
  if (!request.auth) {
    logger.warn("[getHistoricalMetricMatches] Unauthenticated access attempt.");
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  const userId = request.auth.uid;
  const { selectedMetric } = request.data;
  if (!selectedMetric || !selectedMetric.label || !selectedMetric.unit) {
    throw new HttpsError('invalid-argument', 'A valid "selectedMetric" object with label and unit must be provided.');
  }
  if (!genAI) {
    logger.error("[getHistoricalMetricMatches] Gemini AI client (genAI) is not initialized.");
    throw new HttpsError('internal', "The AI analysis service is currently unavailable.");
  }

  const db = admin.firestore();
  try {
    // 2. Fetch all unique historical metrics
    const logsSnapshot = await db.collection('logs').where('userId', '==', userId).get();
    const historicalMetrics = new Set();
    logsSnapshot.forEach(doc => {
      const log = doc.data();
      if (log.output?.label && log.output?.unit) {
        historicalMetrics.add(JSON.stringify({ label: log.output.label, unit: log.output.unit }));
      }
      if (log.inputs && Array.isArray(log.inputs)) {
        log.inputs.forEach(input => {
          if (input?.label && input?.unit) {
            historicalMetrics.add(JSON.stringify({ label: input.label, unit: input.unit }));
          }
        });
      }
    });
    const uniqueHistoricalMetrics = Array.from(historicalMetrics).map(item => JSON.parse(item));
    logger.log(`[getHistoricalMetricMatches] Found ${uniqueHistoricalMetrics.length} unique historical metrics for user ${userId}.`);
    
    if (uniqueHistoricalMetrics.length === 0) {
        return { success: true, matches: [] };
    }

    // 3. Construct a simpler, more robust AI Prompt
    const prompt = `
      You are a data analyst. A user selected the metric "${selectedMetric.label}" (unit: ${selectedMetric.unit}).
      From the following JSON list of historical metrics, find up to 5 that track the same underlying concept, even with different wording.
      Examples: "Jogging" is similar to "Running". "Clarity of Mind" is similar to "Focus Level".

      HISTORICAL METRICS LIST:
      ${JSON.stringify(uniqueHistoricalMetrics, null, 2)}

      Return ONLY a valid JSON array of the matching metric objects from the list. If no good matches are found, return an empty array [].
    `;

    // 4. Call Gemini
    const request = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
    };
    const result = await generativeModel.generateContent(request);
    const response = result.response;
    const responseText = response.text().trim();

    let aiMatches = [];
    if (responseText) {
        try {
            aiMatches = JSON.parse(responseText);
        } catch (parseError) {
            logger.error(`[getHistoricalMetricMatches] Failed to parse Gemini JSON response for user ${userId}. Raw: "${responseText}". Error:`, parseError);
            throw new HttpsError('internal', `AI returned an invalid format: ${parseError.message}`);
        }
    } else {
        logger.warn(`[getHistoricalMetricMatches] Gemini returned an empty response string for user ${userId}. Treating as "no matches found".`);
    }

    // 5. Filter out any exact matches the AI might have included
    const normalizedSelectedLabel = normalizeLabel(selectedMetric.label);
    const normalizedSelectedUnit = normalizeUnit(selectedMetric.unit);
    
    const fuzzyMatches = Array.isArray(aiMatches) ? aiMatches.filter(match => 
        normalizeLabel(match.label) !== normalizedSelectedLabel || normalizeUnit(match.unit) !== normalizedSelectedUnit
    ) : [];

    logger.log(`[getHistoricalMetricMatches] AI found ${fuzzyMatches.length} potential fuzzy matches for "${selectedMetric.label}".`);
    return { success: true, matches: fuzzyMatches };

  } catch (error) {
    logger.error(`[getHistoricalMetricMatches] Critical error for user ${userId}:`, error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError('internal', `An unexpected error occurred while finding historical matches: ${error.message}`);
  }
});
/**
 * Retrieves a list of all of a user's completed experiment statistics documents.
 */
exports.listUserExperiments = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in to list your experiments.');
    }
    const userId = request.auth.uid;
    logger.log(`[listUserExperiments] Function called by user: ${userId}`);

    const db = admin.firestore();
    try {
        const statsSnapshot = await db.collection('users').doc(userId).collection('experimentStats')
            .orderBy('calculationTimestamp', 'desc')
            .get();

        if (statsSnapshot.empty) {
            return { success: true, experiments: [] };
        }

        const experiments = statsSnapshot.docs.map(doc => {
            const data = doc.data();
            const settings = data.activeExperimentSettings;
            const startDate = new Date(data.experimentSettingsTimestamp).toLocaleDateString();
            // Provide a descriptive label for each experiment
            const label = settings?.deeperProblem 
                ? `${startDate}: "${settings.deeperProblem.substring(0, 50)}..."` 
                : `${startDate}: Experiment`;

            return {
                id: doc.id, // The document ID is the experimentId
                label: label
            };
        });

        return { success: true, experiments: experiments };

    } catch (error) {
        logger.error(`[listUserExperiments] Error fetching experiments for user ${userId}:`, error);
        throw new HttpsError('internal', 'Could not retrieve your list of experiments.', error.message);
    }
});

exports.runHistoricalAnalysis = onCall(async (request) => {
    logger.log("[runHistoricalAnalysis V6] Function called. Data:", request.data);

    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'You must be logged in to run an analysis.');
    }
    const userId = request.auth.uid;
    const { includedMetrics, primaryMetric, numExperimentsToAnalyze } = request.data;

    if (!Array.isArray(includedMetrics) || !primaryMetric || !numExperimentsToAnalyze) {
        throw new HttpsError('invalid-argument', 'Missing required parameters for analysis.');
    }
    if (!genAI) {
        logger.error("[runHistoricalAnalysis V6] Gemini AI client is not initialized.");
        // Throw an error here to prevent sending a report without AI insights
        throw new HttpsError('internal', "The AI analysis service is currently unavailable.");
    }

    const db = admin.firestore();
    try {
         // ADD THIS BLOCK TO GET THE USERNAME
        const userDocRef = db.collection('users').doc(userId);
        const userDocSnap = await userDocRef.get();
        // Get the userTag (e.g., "davewolo#1234") and split off the number part.
        const userTag = userDocSnap.exists ? userDocSnap.data().userTag : `User`;
        const username = userTag.split('#')[0];
        // Phase 1: Data Gathering & Filtering
        const statsSnapshot = await db.collection('users').doc(userId).collection('experimentStats')
            .orderBy('calculationTimestamp', 'desc').get();

        if (statsSnapshot.empty) {
            return { success: true, report: null, message: "No past experiment stats found to analyze." };
        }

        const includedLabels = new Set(includedMetrics.map(m => normalizeLabel(m.label)));
        const relevantStatsDocs = [];
        const seenContinuousExperiments = new Set();

        for (const doc of statsSnapshot.docs) {
            const statsData = doc.data();
            const settings = statsData.activeExperimentSettings;
            if (!settings) continue;

            if (settings.statsMode === 'continuous' && settings.experimentId) {
                if (seenContinuousExperiments.has(settings.experimentId)) {
                    continue;
                }
                seenContinuousExperiments.add(settings.experimentId);
            }
            
            const metricsInExperiment = [settings.output, settings.input1, settings.input2, settings.input3]
                .filter(m => m && m.label)
                .map(m => normalizeLabel(m.label));

            // Create a set of normalized labels from the includedMetrics for efficient lookup.
            const normalizedIncludedLabels = new Set(includedMetrics.map(m => normalizeLabel(m.label)));

            for (const metricLabel of metricsInExperiment) {
                if (normalizedIncludedLabels.has(metricLabel)) {
                    relevantStatsDocs.push(statsData);
                    break; // Add the document once and move to the next one
                }
            }
        }

        let chaptersToAnalyze = [];
        if (numExperimentsToAnalyze === 'all_time') {
            chaptersToAnalyze = relevantStatsDocs.reverse(); // Reverse the whole list to be oldest to newest
        } else {
            const num = parseInt(numExperimentsToAnalyze, 10);
            // First, slice the most recent 'num' experiments, then reverse that smaller list.
            chaptersToAnalyze = relevantStatsDocs.slice(0, num).reverse();
        }
        
        if (chaptersToAnalyze.length === 0) {
            return { success: true, report: null, message: "Could not find enough completed experiments containing the selected metric(s)." };
        }

        // Phase 3 & 4: Assemble Final Report
        const extractedChapters = chaptersToAnalyze.map(chapter => {
            const primaryInChapter = [
                chapter.activeExperimentSettings.output, 
                chapter.activeExperimentSettings.input1, 
                chapter.activeExperimentSettings.input2, 
                chapter.activeExperimentSettings.input3
            ]
                .find(m => m && includedLabels.has(normalizeLabel(m.label)));
            
            if (!primaryInChapter || !chapter.calculatedMetricStats[primaryInChapter.label]) return null;

            const finalCorrelationsForThisChapter = [];
            const chapterOutputLabel = chapter.activeExperimentSettings?.output?.label;
            if (chapter.correlations && chapterOutputLabel) {
                for (const inputLabel in chapter.correlations) {
                    const corrData = chapter.correlations[inputLabel];
                    const normalizedInput = normalizeLabel(inputLabel);
                    const normalizedOutput = normalizeLabel(chapterOutputLabel);
                    
                    let withMetric = null;

                    if (includedLabels.has(normalizedOutput)) {
                        if (!includedLabels.has(normalizedInput)) {
                            withMetric = inputLabel;
                        }
                    }
                    else if (includedLabels.has(normalizedInput)) {
                        if (!includedLabels.has(normalizedOutput)) {
                            withMetric = chapterOutputLabel;
                        }
                    }

                    if (withMetric && Math.abs(corrData.coefficient) >= 0.15) {
                        finalCorrelationsForThisChapter.push({
                            withMetric: withMetric,
                            coefficient: corrData.coefficient,
                            isCombined: false,
                            dataPoints: corrData.n_pairs
                        });
                    }
                }
            }
                // Start: NEW filtering logic
                const filteredPairwiseForThisChapter = {};
                if (chapter.pairwiseInteractionResults) {
                    for (const pairKey in chapter.pairwiseInteractionResults) {
                        const interaction = chapter.pairwiseInteractionResults[pairKey];
                        if (interaction && interaction.outputMetricLabel && includedLabels.has(normalizeLabel(interaction.outputMetricLabel))) {
                            filteredPairwiseForThisChapter[pairKey] = interaction;
                        }
                    }
                }

                const filteredLagTimeForThisChapter = {};
                if (chapter.lagTimeCorrelations) {
                    for (const lagKey in chapter.lagTimeCorrelations) {
                        const lag = chapter.lagTimeCorrelations[lagKey];
                        if (lag && lag.todayMetricLabel && includedLabels.has(normalizeLabel(lag.todayMetricLabel))) {
                            filteredLagTimeForThisChapter[lagKey] = lag;
                        }
                    }
                }
                // End: NEW filtering logic
            return {
            startDate: chapter.experimentSettingsTimestamp,
            endDate: chapter.experimentEndDateISO,
            primaryMetricStats: chapter.calculatedMetricStats[primaryInChapter.label],
            correlations: { influencedBy: finalCorrelationsForThisChapter },
            lagTimeCorrelations: filteredLagTimeForThisChapter,         // Use the filtered object
            pairwiseInteractionResults: filteredPairwiseForThisChapter // Use the filtered object
        };
        }).filter(Boolean);
        if (extractedChapters.length === 0) {
            return { success: true, report: null, message: "Not enough data within the selected experiments to generate a report." };
        }

       // *** NEW AI-Powered Narrative Generation ***
        const trend = _calculateTrend(extractedChapters);
        const metricUnitMap = {};

        // Initialize with the selected primary metric's data first to ensure it's prioritized.
        metricUnitMap[primaryMetric.label] = primaryMetric.unit;

        chaptersToAnalyze.forEach(chapter => {
            if (chapter.calculatedMetricStats) {
                Object.values(chapter.calculatedMetricStats).forEach(metric => {
                    if (metric.label && metric.unit) {
                        // Find if a case-insensitive match already exists.
                        const existingKey = Object.keys(metricUnitMap).find(key => key.toLowerCase() === metric.label.toLowerCase());
                        // Only add the unit if we haven't already recorded one for this metric label.
                        if (!existingKey) {
                            metricUnitMap[metric.label] = metric.unit;
                        }
                    }
                });
            }
        });
        const ahaMoment = _determineAhaMoment(extractedChapters, primaryMetric, primaryMetricType, metricUnitMap);
        const ahaMomentText = ahaMoment ? ahaMoment.text : "No single strong correlation was found in this period.";
        // --- NEW LOGIC TO DETERMINE METRIC TYPE ---
        let primaryMetricType = 'unknown';
        const latestChapterSettings = chaptersToAnalyze.length > 0 ? chaptersToAnalyze[chaptersToAnalyze.length - 1].activeExperimentSettings : null;
        if (latestChapterSettings) {
            const normalizedPrimaryLabel = normalizeLabel(primaryMetric.label);
            if (normalizeLabel(latestChapterSettings.output?.label) === normalizedPrimaryLabel) {
                primaryMetricType = 'outcome';
            } else {
                for (let i = 1; i <= 3; i++) {
                    if (normalizeLabel(latestChapterSettings[`input${i}`]?.label) === normalizedPrimaryLabel) {
                        primaryMetricType = 'habit';
                        break;
                    }
                }
            }
        }
        // --- END NEW LOGIC ---
        let finalReport = {
            primaryMetricLabel: primaryMetric.label,
            primaryMetricType: primaryMetricType,
            ahaMoment: ahaMoment,
            hiddenGrowth: "Could not generate a summary from your notes for this period.",
            holisticInsight: "AI analysis of combined correlations could not be generated.",
            shareablePost: "A shareable post could not be generated at this time.",
            analyzedChapters: extractedChapters,
            trend: trend,
            metricUnitMap: metricUnitMap
        
 };

        if (genAI) {
            try {
                const allNotes = [];
                const noteRanges = extractedChapters.map(c => ({start: new Date(c.startDate), end: new Date(c.endDate)}));
                for(const range of noteRanges){
                     const logsSnapshot = await db.collection('logs').where('userId', '==', userId).where('timestamp', '>=', range.start).where('timestamp', '<=', range.end).get();
                     logsSnapshot.forEach(doc => {
                         const log = doc.data();
                         if(log.notes && log.notes.trim()) allNotes.push(`- ${log.notes.trim()}`);
                     });
                }

                if (allNotes.length > 0) {
                    const allCorrelations = [];
                    extractedChapters.forEach(chapter => {
                        allCorrelations.push(...chapter.correlations.influencedBy);
                    });
                    const narrativePrompt = `
You are an expert habit-science coach. Your task is to analyze a user's habit experiment data and generate a supportive, insightful narrative.
CONTEXT:
- User's Primary Metric: "${primaryMetric.label}"
- All Included Metric Aliases: ${JSON.stringify(includedMetrics.map(m => m.label))}
- The Strongest Single Correlation Found: "${ahaMomentText}"
- The Overall Trend: The user's recent average for '${primaryMetric.label}' has ${trend ? (trend.recentAverage > trend.priorAverage ? 'increased' : 'decreased') : 'stayed consistent'}.
- All Significant Correlations Found During Analysis: ${JSON.stringify(allCorrelations)}
- User's Raw Notes From The Period:
${allNotes.slice(-15).join("\n")}
CRITICAL: If you include a quote from the user's notes that contains double quotes, you MUST escape them with a backslash (e.g., "He said \\"hello\\"").
YOUR TASK:
Return a single, valid JSON object with three keys: "holisticInsight", "hiddenGrowth", and "shareablePost".
1.  "holisticInsight":
    - Your goal is to help the user see the story in their data and suggest possible real-life interpretations, not to tell them what their data means.
    - Use the notes for context, but **NEVER state your inferences as facts**. It should sound natural (e.g., instead of "It seems that Jennifer is your wife...", say things like "It seems your connection with Jennifer is...").
    - Write a 1-2 paragraph narrative (max 60 words total) that synthesizes the correlation data into a tentative story.
    - **Address the user directly using "you" and "your".**
    - Use bold headers to label the point of each paragraph.
    - Explain how the different habits and outcomes seem to influence each other based on your inferred meaning. Your goal is to brainstorm possible real-life interpretations of the user's data.
    - Use tentative, observational language like "It appears...", "The data might suggest...", "It's interesting how...".
    - CRITICAL: Do not show your inference process (e.g., "Infer Meaning:"). Only return the final, user-facing text in the JSON values.

2.  "hiddenGrowth":
    - This key's value MUST be a JSON object with two keys: "quote" and "paragraph".
    - "quote": Find the most relevant quote from the notes that encapsulates the user's relationship and journey with the Primary Metric. 1-2 sentences. If no single quote works, create a short (3-5 word) thematic title for your paragraph instead (e.g., "On the theme of consistency").
    - "paragraph": Write a compassionate, 2-3 sentence paragraph in the second person ("You...") that reflects on the significance of the quote or theme. Frame it as a supportive observation.

3.  "shareablePost":
    - Write a short, celebratory post (2-3 sentences) celebrating the user's journey.
    - The post MUST be from the perspective of a supportive friend or coach, written in the third person. **Refer to the user as "@${username}"**.
    - It must be inspiring and highlight their strongest correlation or a key insight from their journey.
    - Do not use exclamation points.
    - Do not use any cliche language.

    YOUR ENTIRE RESPONSE MUST BE ONLY a raw JSON object matching this structure exactly:
{
  "holisticInsight": "A 1-2 paragraph synthesis of all data, using bold headers.",
  "hiddenGrowth": {
    "quote": "A direct quote from the notes or a thematic title.",
    "paragraph": "A 2-3 sentence compassionate reflection on the quote/theme."
  },
  "shareablePost": "A short, celebratory post written in the third person about '@${username}."
}
Your entire response must be ONLY the raw JSON object, starting with { and ending with }.
`;
                    const request = {
                        contents: [{ role: "user", parts: [{ text: narrativePrompt }] }],
                    };
                    const result = await generativeModel.generateContent(request);
                    const response = result.response;
                    if (!response) {
                    logger.error(`[runHistoricalAnalysis V6] AI generation resulted in a null response object for user ${userId}. This could be due to safety filters or an API issue.`);
                    throw new HttpsError('internal', 'The AI service returned a null response, possibly due to content safety filters.');
                }

                    if (response.promptFeedback && response.promptFeedback.blockReason) {
                        const blockReason = response.promptFeedback.blockReason;
                        logger.error(`[runHistoricalAnalysis V6] AI response was blocked for user ${userId}. Reason: ${blockReason}`);
                        throw new HttpsError('resource-exhausted', `The AI couldn't generate a narrative due to content restrictions (${blockReason}).`);
                    }

                    const responseText = response.text().trim();
                    let aiNarrative = null;

                    if (responseText) {
                        try {
                            const startIndex = responseText.indexOf('{');
                            const endIndex = responseText.lastIndexOf('}');
                            if (startIndex !== -1 && endIndex > startIndex) {
                                const jsonString = responseText.substring(startIndex, endIndex + 1);
                                aiNarrative = JSON.parse(jsonString);
                                logger.log(`[runHistoricalAnalysis V6] Successfully parsed AI response after cleaning and extracting the JSON object.`);
                            } else {
                                throw new Error("Could not find a valid JSON object structure in the AI's response.");
                            }
                        } catch (parseError) {
                            logger.error(`[runHistoricalAnalysis V6] Failed to parse Gemini JSON response even after cleaning. Raw: "${responseText}". Error:`, parseError);
                            throw new HttpsError('internal', `The AI failed to generate a valid report. Details: ${parseError.message}`);
                        }
                    } else {
                        logger.warn(`[runHistoricalAnalysis V6] AI returned an empty response for user ${userId}. This will result in a data-only report.`);
                    }

                    if (aiNarrative) {
                        if (typeof aiNarrative.holisticInsight === 'string') {
                            let insightText = aiNarrative.holisticInsight.trim();
                            // Check if the string is wrapped in braces and remove them
                            if (insightText.startsWith('{') && insightText.endsWith('}')) {
                                insightText = insightText.substring(1, insightText.length - 1).trim();
                            }
                            finalReport.holisticInsight = insightText;
                        } else {
                            logger.warn('AI returned non-string for holisticInsight, using fallback.', aiNarrative.holisticInsight);
                        }
                        finalReport.hiddenGrowth = aiNarrative.hiddenGrowth || finalReport.hiddenGrowth;
                        finalReport.shareablePost = aiNarrative.shareablePost || finalReport.shareablePost;
                    }
                }
            } catch (aiError) {
                logger.error(`[runHistoricalAnalysis V6] AI narrative generation failed for user ${userId}:`, aiError);
                throw new HttpsError('internal', `The AI failed to generate a narrative for your report. Details: ${aiError.message}`);
            }
        }
        
        return { success: true, report: finalReport };
    } catch (error) {
        logger.error(`[runHistoricalAnalysis V6] Critical error for user ${userId}:`, error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('internal', `An unexpected error occurred during analysis: ${error.message}`);
    }
});

// Helper for combined correlation data alignment
function alignDataForCombination(logs, primaryLabel, otherLabel) {
    const arrA = [], arrB = [];
    logs.forEach(log => {
        let valA = null, valB = null;
        const metricsInLog = [log.output, ...(log.inputs || [])].filter(Boolean);

        const primaryMetricInLog = metricsInLog.find(m => normalizeLabel(m.label) === normalizeLabel(primaryLabel));
        const otherMetricInLog = metricsInLog.find(m => normalizeLabel(m.label) === normalizeLabel(otherLabel));

        if (primaryMetricInLog) valA = parseFloat(primaryMetricInLog.value);
        if (otherMetricInLog) valB = parseFloat(otherMetricInLog.value);

        if (valA !== null && !isNaN(valA) && valB !== null && !isNaN(valB)) {
            arrA.push(valA);
            arrB.push(valB);
        }
    });
    return { arrA, arrB };
}

/**
 * INTERNAL HELPER to calculate the trend between the most recent chapter and prior ones.
 */
function _calculateTrend(analyzedChapters) {
    if (analyzedChapters.length < 2) return null; // Need at least two chapters to compare

    const latestChapter = analyzedChapters[analyzedChapters.length - 1];
    const priorChapters = analyzedChapters.slice(0, -1);

    const latestAvg = latestChapter.primaryMetricStats.average;
    // FIX: Calculate consistency here and cap it at 0.
    const latestConsistency = Math.max(0, 100 - latestChapter.primaryMetricStats.variationPercentage);
    const recentDataPoints = latestChapter.primaryMetricStats.dataPoints;

    // Calculate weighted average of prior chapters
    let totalWeightedSum = 0;
    let totalWeightedConsistency = 0;
    let totalDataPoints = 0;
    priorChapters.forEach(chapter => {
    if (chapter.primaryMetricStats) {
        totalWeightedSum += chapter.primaryMetricStats.average * chapter.primaryMetricStats.dataPoints;
        // FIX: Calculate consistency here for each prior chapter.
        totalWeightedConsistency += Math.max(0, 100 - chapter.primaryMetricStats.variationPercentage) * chapter.primaryMetricStats.dataPoints;
        totalDataPoints += chapter.primaryMetricStats.dataPoints;
        }
    });

    if (totalDataPoints === 0) return null;
    const priorAvg = totalWeightedSum / totalDataPoints;
    const priorConsistency = totalWeightedConsistency / totalDataPoints;

    return {
        recentAverage: parseFloat(latestAvg.toFixed(2)),
        priorAverage: parseFloat(priorAvg.toFixed(2)),
        recentConsistency: parseFloat(latestConsistency.toFixed(1)),
        priorConsistency: parseFloat(priorConsistency.toFixed(1)),
        recentDataPoints: recentDataPoints,
        priorDataPoints: totalDataPoints
    };
}

function _determineAhaMoment(analyzedChapters, primaryMetric, primaryMetricType, metricUnitMap) {
    if (!analyzedChapters || analyzedChapters.length === 0) return null;

    let strongestCorrelationOverall = { coefficient: 0, withMetric: null, chapterDate: '' };

    analyzedChapters.forEach(chapter => {
        if (chapter.correlations && chapter.correlations.influencedBy && chapter.correlations.influencedBy.length > 0) {
            const strongestInChapter = chapter.correlations.influencedBy.reduce(
                (max, corr) => (Math.abs(corr.coefficient) > Math.abs(max.coefficient) ? corr : max),
                { coefficient: 0 }
            );

            if (Math.abs(strongestInChapter.coefficient) > Math.abs(strongestCorrelationOverall.coefficient)) {
                strongestCorrelationOverall = {
                    ...strongestInChapter,
                    chapterDate: new Date(chapter.startDate).toLocaleDateString()
                };
            }
        }
    });

    if (Math.abs(strongestCorrelationOverall.coefficient) < 0.20) {
        return null;
    }

    // --- NEW LOGIC TO CORRECTLY IDENTIFY HABIT AND OUTCOME ---
    const otherMetricLabel = strongestCorrelationOverall.withMetric;
    let habitLabel, outcomeLabel;

    if (primaryMetricType === 'habit') {
        habitLabel = primaryMetric.label;
        outcomeLabel = otherMetricLabel;
    } else { // 'outcome' or 'unknown'
        habitLabel = otherMetricLabel;
        outcomeLabel = primaryMetric.label;
    }

    const habitUnit = metricUnitMap[habitLabel];
    const outcomeUnit = metricUnitMap[outcomeLabel];
    const isHabitTime = isTimeMetric(habitUnit);
    const isOutcomeTime = isTimeMetric(outcomeUnit);

    const habitDisplay = isHabitTime ? 'was later' : 'was higher';
    const outcomeDisplay = isOutcomeTime
        ? (strongestCorrelationOverall.coefficient >= 0 ? 'was later' : 'was earlier')
        : (strongestCorrelationOverall.coefficient >= 0 ? 'was higher' : 'was lower');

    const strength = Math.abs(strongestCorrelationOverall.coefficient) >= 0.45 ? "strong" : "moderate";
    const direction = strongestCorrelationOverall.coefficient > 0 ? "positive" : "negative";

    return {
        type: 'Most Striking Correlation',
        text: `Looking back at your experiment from **${strongestCorrelationOverall.chapterDate}**, the most striking pattern was a 🟨 ${strength} ${direction} correlation: when **'${habitLabel}'** ${habitDisplay}, your **'${outcomeLabel}'** tended to be ${outcomeDisplay}.`
    };
}

/**
 * Generates five potential complete outcome metrics (label, unit, goal)
 * based on a user's context, supporting both a simple 'wish' and a more thorough context.
 *
 * Expected request.data: { 
 * userWish: string, 
 * userBlockers?: string, 
 * userPositiveHabits?: string, 
 * userVision?: string 
 * }
 * Returns: { success: true, suggestions: [{label: string, unit: string, goal: number | string, briefExplanation: string}, ...] }
 */
exports.generateOutcomeLabelSuggestions = onCall(async (request) => {
  logger.log("[generateOutcomeLabelSuggestions] Function called. Request data:", request.data);

  // 1. Authentication & Validation
  if (!request.auth) {
    logger.warn("[generateOutcomeLabelSuggestions] Unauthenticated access attempt.");
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  const userId = request.auth.uid;

  const { userWish, userBlockers, userPositiveHabits, userVision } = request.data;
  if (!userWish) {
    logger.warn(`[generateOutcomeLabelSuggestions] Invalid argument: Missing userWish for user ${userId}.`);
    throw new HttpsError('invalid-argument', 'The function must be called with a "userWish".');
  }
  
  const isThoroughPath = userBlockers && userPositiveHabits && userVision;
  logger.info(`[generateOutcomeLabelSuggestions] Processing request for user: ${userId}. Path: ${isThoroughPath ? 'Thorough' : 'Express'}.`);
  
  // 2. Check if Gemini Client is available
  if (!genAI) {
    logger.error("[generateOutcomeLabelSuggestions] Gemini AI client (genAI) is not initialized. Cannot generate suggestions.");
    throw new HttpsError('internal', "The AI suggestion service is currently unavailable. (AI client not ready)");
  }

  // 3. Conditionally construct the USER CONTEXT block for the prompt
  let userContextPromptBlock = `- Deeper Wish: "${userWish}"`;
  if (isThoroughPath) {
    userContextPromptBlock += `
    - Biggest Blockers: "${userBlockers}"
    - Existing Positive Habit: "${userPositiveHabits}"
    - Vision of Success (first noticeable change): "${userVision}"`;
  }

  // 4. Construct the new, detailed prompt for the LLM
const promptText = `
    You are an expert at Objectives and Key Results framework, as well as Key Performance Indicators. Your task is to generate 5 distinct and relevant "Outcome Metrics" for a user's "habit experiment" to improve their daily life through self experimentation.
    
    **CONCEPT DEFINITION: An Outcome Metric is a measure of a *state*, *feeling*, or *condition*. It is something the user *experiences* or *observes*, but does not directly control. It is a *result*.**

    CRITICAL REQUIREMENTS:
        1.  Each metric must be a **leading indicator** for the user's 'Deeper Wish'—a daily measure that predicts future success. **DO NOT suggest direct actions, tasks, or to-do list items.** For example, "Meditate for 10 minutes" is a habit, not an outcome. "Clarity of Mind" or "Faith in myself" is an outcome.
        2.  For each of the 5 suggestions, you MUST provide a JSON object with a "label" (string), "unit" (string), and a "goal" (non-negative rational number or time of day, e.g. 7:30).
        3.  The COMBINED display string from your output, formatted as "label (goal unit)", MUST be less than 44 characters. This is a strict constraint.
        4.  The "unit" MUST be logically paired with the "label" by following these principles:
            - **First, identify the *category* of the metric:**
             - **For Subjective Qualities or Levels** (e.g., 'Energy Level', 'Mood', 'Focus'), use a scale unit like: 'out of 10'.
             - **For Durations** (e.g., 'Screen Time', 'Sleep'), use a time unit like: 'hours', 'minutes'.
             - **For Frequencies of internal states or observed events** (how often something happens *to the user*), use a frequency unit like: 'times per day', 'occurrences'.
             - **For a Specific Moment in Time** (e.g., 'Eating Breakfast', 'Bedtime'), use the timestamp unit: 'Time of Day'.
             - **For Proportions of a Whole** (e.g., 'Healthy Food Ratio', 'Workday Deep Focus Ratio') use the percentage unit: '%'.

           - **Second, avoid incorrect pairings by distinguishing between Outcomes and Inputs.**
            - **The key distinction is direct user control.** If the user can *directly cause* an action (e.g., 'start a conversation'), its frequency is an Input/Habit. If an event happens *to* the user as a result of other factors (e.g., 'receive a compliment'), its frequency is a valid Outcome.
            - **Example:** Measuring the *quality* of an event is a great Outcome (e.g., "Conversation Quality", unit: 'out of 10'). Measuring the *frequency* of an event you do not control is also a great Outcome (e.g., "Spontaneous Insights", unit: 'occurrences').
                
        5.  The "goal" should be a sensible number or time string (e.g., "7:30 AM") that fits with the label and unit.
        6.  Also provide a "briefExplanation" (10 words) of its relevance to the user's context.

    USER CONTEXT:
    ${userContextPromptBlock}

     Your suggestions should be directly inspired by the user's context. For example:
    - One suggested metric could directly measure the "Vision of Success".
    - One could be the inverse of a "Blocker" (e.g., if blocker is 'procrastination', a metric could be 'Sense of Accomplishment').
    - 1 or 2 suggestions should be more creative interpretations of the user's context. Start their "briefExplanation" with "A different angle:".

    Return ONLY a valid JSON array of 5 objects. Each object must strictly follow this structure:
    { "label": "Example Label", "unit": "out of 10", "goal": 7, "briefExplanation": "Example explanation." }

    Do not include any other text or markdown outside of the JSON array.
  `;



  logger.info(`[generateOutcomeLabelSuggestions] Sending new, context-rich prompt to Gemini for user ${userId}.`);
  
  try {
        const request = {
        contents: [{ role: "user", parts: [{ text: promptText }] }],
    };
    const result = await generativeModel.generateContent(request);
    const response = result.response;
    const responseText = response.text().trim();

    if (!responseText) {
        logger.warn(`[generateOutcomeLabelSuggestions] Gemini returned an empty response for user ${userId}.`);
        throw new HttpsError('internal', 'AI failed to generate suggestions (empty response).');
    }

    let suggestions;
    try {
        suggestions = JSON.parse(responseText);
    } catch (parseError) {
        logger.error(`[generateOutcomeLabelSuggestions] Failed to parse Gemini JSON response for user ${userId}. Error: ${parseError.message}. Raw response: "${responseText}"`);
        throw new HttpsError('internal', `AI returned an invalid format. Details: ${parseError.message}`);
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) { // Check for empty array too
        logger.error(`[generateOutcomeLabelSuggestions] Parsed response is not a non-empty array for user ${userId}. Parsed:`, suggestions);
        throw new HttpsError('internal', 'AI did not return any outcome suggestions.');
    }

    // Basic validation of the array contents
    for (const suggestion of suggestions) {
        if (!suggestion.label || !suggestion.unit || suggestion.goal === undefined || !suggestion.briefExplanation) {
            logger.error(`[generateOutcomeLabelSuggestions] One or more suggestions have an invalid structure for user ${userId}. Suggestion:`, suggestion);
            throw new HttpsError('internal', 'AI returned suggestions with an invalid or incomplete structure.');
        }
    }

    logger.info(`[generateOutcomeLabelSuggestions] Successfully generated and parsed ${suggestions.length} outcome suggestions for user ${userId}.`);
    return { success: true, suggestions: suggestions };

  } catch (error) {
    logger.error(`[generateOutcomeLabelSuggestions] Error during Gemini API call or processing for user ${userId}:`, error);
    if (error instanceof HttpsError) {
        throw error;
    }
    if (error.message && error.message.toLowerCase().includes('safety')) {
        logger.warn(`[generateOutcomeLabelSuggestions] Gemini content generation blocked due to safety settings for user ${userId}.`);
        throw new HttpsError('resource-exhausted', "The AI couldn't generate suggestions due to content restrictions. Please try rephrasing your answers.");
    }
    throw new HttpsError('internal', `Failed to generate AI suggestions due to a server error. Details: ${error.message}`);
  }
});


exports.generateInputLabelSuggestions = onCall(async (request) => {
  logger.log("[generateInputLabelSuggestions] Function called. Request data:", request.data);

  // 1. Authentication & Validation
  if (!request.auth) {
    logger.warn("[generateInputLabelSuggestions] Unauthenticated access attempt.");
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  const userId = request.auth.uid;

  // Validation now includes checking the format of definedInputs
  const { userWish, outcomeMetric, definedInputs = [], userBlockers, userVision } = request.data;
  if (!userWish || !outcomeMetric?.label) {
    logger.warn(`[generateInputLabelSuggestions] Invalid argument for user ${userId}. Wish or outcomeMetric is missing.`);
    throw new HttpsError('invalid-argument', 'The function must be called with a valid "userWish" and "outcomeMetric".');
  }
  
  logger.info(`[generateInputLabelSuggestions] Processing for user: ${userId}, wish: "${userWish}", outcome: "${outcomeMetric.label}", defined inputs: ${definedInputs.length}`);
  
  // 2. Check if Gemini Client is available
  if (!genAI) {
    logger.error("[generateInputLabelSuggestions] Gemini AI client (genAI) is not initialized.");
    throw new HttpsError('internal', "The AI suggestion service is currently unavailable. (AI client not ready)");
  }

  // 3. Construct context for the prompt
  let definedInputsContext = "The user has not defined any habits yet.";
  if (definedInputs.length > 0) {
    definedInputsContext = "The user has already chosen the following daily habit(s):\n";
    definedInputs.forEach((input, index) => {
      if (input.label && input.unit && input.goal !== undefined) {
        definedInputsContext += `${index + 1}. "${input.label}" (Goal: ${input.goal} ${input.unit})\n`;
      }
    });
    definedInputsContext += "\nYour suggestions MUST be different from and complementary to these.";
  }
  const isThoroughPath = userBlockers && userVision;

  // 4. Construct the new, detailed prompt
  const promptText = `
    You are a behavioral analyst helping a user design a self-experiment. Your goal is to suggest insightful "Daily Habits" based on their context.
    
    **CONCEPT DEFINITION: A Daily Habit is a specific, controllable *action* or *decision* the user can make. It is a *lever* they can pull to influence their outcome.**

    Your core principle is the "Chain of Behavior": an unwanted outcome is often a link in a long chain of preceding behaviors. Real change comes from finding and modifying weaker links earlier in the chain, not just attacking the final symptom. Think backwards from the user's wish and blockers. What could be the "link before the link"? For example, if a blocker is "afternoon energy slump," the link before that might be "a heavy lunch" or "poor sleep." The link before "poor sleep" might be "too much screen time at night."

    CRITICAL REQUIREMENTS:
        1.  Generate 5 distinct, actionable "Daily Habits". **DO NOT suggest feelings, states, or general outcomes.** For example, "Feel more rested" is an outcome, not a habit. "Go for a 10-minute walk after lunch" is a habit.
        2.  For each suggestion, you MUST provide a JSON object with a "label" (string), "unit" (string), "goal" (non-negative number or time string), and "briefExplanation" (string).
        3.  The COMBINED display string from your output, formatted as "label (goal unit)", MUST be less than 44 characters.
        4.  The "unit" MUST be logically paired with the "label" based on the type of action:
            - **For Durations of an Action** (e.g., 'Meditation', 'Deep Work'), use a time unit like: 'minutes', 'hours'.
            - **For Binary Completion of a Task** (it's either done or not), use a completion unit like: 'yes/no'.
            - **For Counting Repetitions or Items** (e.g., 'Pushups', 'Pages Read', 'Connecting with people'), use a relevant count-based unit like: 'reps', 'pages', 'words', 'items', 'steps', 'conversations'.
            - **For Frequency of a Controllable Action**, use: 'times per day'.
            - **For Rating Effort or Quality of an Action**, use a scale like: 'out of 10'.
            - **For Timing a Specific Action**, use a timestamp like: 'Time of Day'.
        5.  The "goal" MUST be a sensible number, time string, 'yes', or 'no' that fits the label and unit (e.g., '15' for unit=minutes, 'yes' for unit="completed", '7:30 AM' for unit=Time of Day).
        6.  Do not suggest "reminders" (e.g. "hydration reminders") or anything that is not something the user would do themselves daily.
        7.  The "briefExplanation" MUST be a concise explanation (max 15 words) of the habit's relevance. For "Upstream Habits," briefly state the chain of logic (e.g., "To boost afternoon energy by improving sleep quality.").
        8.  The 5 suggestions MUST include a mix of:
            - 2 Habits that directly support the chosen outcome.
            - 3 creative "Upstream Habits" that intervene earlier in the behavioral chain.
            - AVOID suggesting habits similar to any the user has already defined in their context.

    USER CONTEXT:
        - Deeper Wish: "${userWish}"
        - Stated Outcome Metric: They are tracking "${outcomeMetric.label}" to measure progress.
        ${isThoroughPath ? `- Vision of Success: "${userVision}"` : ''}
        ${isThoroughPath ? `- Biggest Blockers: "${userBlockers}"` : ''}
        - ${definedInputsContext}

    Return ONLY a valid JSON array of 5 objects. Do not include any other text or markdown outside of the JSON array.
    Example Response Object:
    { "label": "Plan Tomorrow Before Laptop Closes", "unit": "yes/no", "goal": 1, "briefExplanation": "Reduces decision fatigue for a more focused morning." }
  `;

  logger.info(`[generateInputLabelSuggestions] Sending advanced, context-rich prompt to Gemini for user ${userId}.`);
  
  try {
    const request = {
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    };
    const result = await generativeModel.generateContent(request);
    const response = result.response;
    const responseText = response.text().trim();

    if (!responseText) {
        logger.warn(`[generateInputLabelSuggestions] Gemini returned an empty response for user ${userId}.`);
        throw new HttpsError('internal', 'AI failed to generate habit suggestions (empty response).');
    }

    let suggestions;
    try {
        suggestions = JSON.parse(responseText);
    } catch (parseError) {
        logger.error(`[generateInputLabelSuggestions] Failed to parse Gemini JSON response. Error: ${parseError.message}. Raw: "${responseText}"`);
        throw new HttpsError('internal', `AI returned an invalid format. Details: ${parseError.message}`);
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
        logger.error(`[generateInputLabelSuggestions] Parsed response is not a non-empty array. Found ${suggestions.length}.`);
        throw new HttpsError('internal', 'AI did not return any habit suggestions.');
    }

    // Final validation of suggestion structure
    for (const suggestion of suggestions) {
        if (!suggestion.label || !suggestion.unit || suggestion.goal === undefined || !suggestion.briefExplanation) {
            logger.error(`[generateInputLabelSuggestions] A suggestion has an invalid structure.`, suggestion);
            throw new HttpsError('internal', 'AI returned habit suggestions with an invalid structure.');
        }
    }

    logger.info(`[generateInputLabelSuggestions] Successfully generated and parsed ${suggestions.length} advanced habit suggestions for user ${userId}.`);
    return { success: true, suggestions: suggestions };

  } catch (error) {
    logger.error(`[generateInputLabelSuggestions] Error during Gemini API call for user ${userId}:`, error);
    if (error instanceof HttpsError) {
        throw error;
    }
    if (error.message && error.message.toLowerCase().includes('safety')) {
        logger.warn(`[generateInputLabelSuggestions] Gemini content generation blocked due to safety settings for user ${userId}.`);
        throw new HttpsError('resource-exhausted', "The AI couldn't generate suggestions due to content restrictions. Please try rephrasing your answers.");
    }
    throw new HttpsError('internal', `Failed to generate AI habit suggestions. Details: ${error.message}`);
  }
});


// Final blank line below this comment
