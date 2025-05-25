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
            STREAK_RESET: "Look at your grit!!!\nYou've just proven you care more about your personal transformation than the dopamine spike of +1 to your streak.\n\n"
        },
        PUBLIC: { // Bot replaces ${userTag} with the actual user tag for public announcements
            STREAK_RESET: '${userTag} has GRIT beyond streaks! They just broke their streak and restarted 🙌🏼. We\'re not worthy!'
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

// Gen 2 Imports
const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { jStat } = require("jstat");
const { onSchedule } = require("firebase-functions/v2/scheduler"); 
const { logger, config } = require("firebase-functions"); // MODIFIED: Added 'config'
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

// ============== AI INSIGHTS SETUP ==================
const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI;
// Check for the environment variable that your deployment logs show is being set.
const apiKeyToUse = process.env.GEMINI_API_KEY; // Using GEMINI_API_KEY with underscore

if (apiKeyToUse) {
  try {
    genAI = new GoogleGenerativeAI(apiKeyToUse);
    logger.info(`GoogleGenerativeAI initialized successfully using API key from process.env.GEMINI_API_KEY.`);
  } catch (error) {
    logger.error("Failed to initialize GoogleGenerativeAI with process.env.GEMINI_API_KEY:", error);
    genAI = null; 
  }
} else {
  // This warning means the specific variable process.env.GEMINI_API_KEY was not found.
  logger.warn("process.env.GEMINI_API_KEY was NOT found. AI-dependent features will be unavailable.");
  genAI = null; 
}

const GEMINI_CONFIG = {
  temperature: 0.8,
  topK: 50,
  topP: 0.95,
  maxOutputTokens: 1500,
};

const MINIMUM_DATAPOINTS_FOR_METRIC_STATS = 5;

// INSIGHTS_PROMPT_TEMPLATE for "This Experiment" MVP
const INSIGHTS_PROMPT_TEMPLATE = (data) => {
  // Helper to format metric stats
  const formatMetricStat = (metric) => {
    if (!metric) return "N/A";
    let statString = `${metric.label} (${metric.unit || 'N/A'}): `;
    if (metric.status === 'skipped_insufficient_data') {
      statString += `Not enough data (had ${metric.dataPoints}, needed ${MINIMUM_DATAPOINTS_FOR_METRIC_STATS}).`;
    } else {
      statString += `Avg: ${metric.average?.toFixed(2) ?? 'N/A'}, Median: ${metric.median?.toFixed(2) ?? 'N/A'}, Variation: ${metric.variationPercentage?.toFixed(2) ?? 'N/A'}% (DP: ${metric.dataPoints ?? 'N/A'})`;
    }
    return statString;
  };

  // Helper to format correlations
  const formatCorrelation = (corr) => {
    if (!corr) return "N/A";
    let corrString = `${corr.label} → ${corr.vsOutputLabel}: `;
    if (corr.status === 'calculated' && corr.coefficient !== undefined && !isNaN(corr.coefficient)) {
      const rSquared = corr.coefficient * corr.coefficient;
      corrString += `Influence (R²): ${(rSquared * 100).toFixed(1)}%, P-Value: ${corr.pValue?.toFixed(3) ?? 'N/A'} (Pairs: ${corr.n_pairs ?? 'N/A'}). Interpretation: ${corr.interpretation || 'N/A'}`;
    } else {
      corrString += `Not calculated. Status: ${corr.status || 'Unknown'}, Reason: ${corr.interpretation || 'N/A'} (Pairs: ${corr.n_pairs ?? 'N/A'})`;
    }
    return corrString;
  };

  // Helper to format pairwise interactions
  const formatPairwiseInteraction = (interaction) => {
    if (!interaction || !interaction.summary || interaction.summary.toLowerCase().includes("skipped") || interaction.summary.toLowerCase().includes("no meaningful conclusion") || interaction.summary.toLowerCase().includes("not enough days")) return null;
    return `When combining ${interaction.input1Label} & ${interaction.input2Label}:\n    Summary: ${interaction.summary}`;
  };

  // Constructing the prompt
  let prompt = `
You are an AI assistant providing insights on a user's self-experimentation data. Your tone should be supportive, analytical, and encouraging, focusing on actionable advice and learning. The goal is to provide insights that inspire the user to continue their journey of consistent small actions and encourage thoughtful experimentation with tweaks to make these actions easier and more impactful. Keep the total response concise (under 1890 characters).

**Experiment Context:**
- User's Deeper Problem/Goal/Theme: ${data.deeperProblem || "Not specified"}
- Total Logs Processed in this Period: ${data.totalLogsProcessed || 0}

**User's Overall Consistency (Outside this specific experiment):**
- Current Overall Log Streak: ${data.userOverallStreak || 0} days
- Longest Overall Log Streak: ${data.userOverallLongestStreak || 0} days

**Data for "This Experiment" (ID: ${data.experimentIdForPrompt}):**

**1. Core Metric Statistics:**
${data.calculatedMetrics && Object.keys(data.calculatedMetrics).length > 0
  ? Object.values(data.calculatedMetrics).map(formatMetricStat).join("\n")
  : "  No core metric statistics were calculated for this experiment."}
${data.skippedMetricsData && data.skippedMetricsData.length > 0
  ? "\n  Metrics Skipped Due to Insufficient Data:\n  " + data.skippedMetricsData.map(m => `${m.label} (had ${m.dataPoints} data points, needed ${MINIMUM_DATAPOINTS_FOR_METRIC_STATS})`).join("\n  ")
  : ""}

**2. Daily Habit → Daily Outcome Impacts (Correlations):**
${data.correlationsData && Object.keys(data.correlationsData).length > 0
  ? Object.values(data.correlationsData).map(formatCorrelation).join("\n")
  : "  No correlation data was calculated for this experiment."}

**3. Combined Effects Analysis (Pairwise Interactions):**
${data.pairwiseInteractions && Object.keys(data.pairwiseInteractions).length > 0
  ? Object.values(data.pairwiseInteractions).map(formatPairwiseInteraction).filter(Boolean).join("\n\n")
  : "  No pairwise interaction analysis was performed or yielded results for this experiment."}

**4. User's Notes Summary (from logs during this experiment period):**
${data.experimentNotesSummary && data.experimentNotesSummary.trim() !== ""
  ? data.experimentNotesSummary
  : "  No notes were found or summarized for this experiment period."}

---
**Analysis Task:**
Based *only* on the data provided above for This Experiment, provide succinct analysis (total length under 1890 characters) in three sections:

### 🫂 Challenges & Consistency
Review the user's journey *within this experiment period*, focusing on friction points and consistency patterns evident in *this experiment's data (metric stats, correlations, combined effects)* and the provided *notes summary for this period*.
- Pinpoint recurring friction points or areas where consistency fluctuates, using *this experiment's data* and *notes for this period*.
- **If possible, connect these friction points directly to specific phrases or feelings the user expressed in their *notes from this experiment period* around that time.** (e.g., 'The lower consistency for [Metric X] during this experiment might relate to when you mentioned feeling "[Quote from note]"').
- Notice patterns in their consistency *within this experiment*: *When* do they seem most consistent or inconsistent according to *this period's data and notes*?
- Where does their effort seem persistent *in this experiment*, even if results vary? Validate this effort clearly.
- Acknowledge any struggles mentioned *in the notes for this period* with compassion and normalize them as part of being human, and reiterate the value of doing the self science experiments they're doing.

### 🌱 Growth Highlights
Highlight evidence of growth, adaptation, and the impact of sustained effort by analyzing patterns *within this experiment's data and notes*. Start by celebrating their consistency *during this experiment* (mention current overall streak if relevant as context) and the most significant positive trend or achievement observed *in this experiment's data*.
- Are *this experiment's* metrics (average, variation, correlations) showing particular strengths or weaknesses?
- Point out any potentially interesting (even if subtle) connections observed between *this experiment's metric trends* and themes found in the *notes from this period*.
- Look for subtle shifts in language in *this period's notes*, "hidden wins" (e.g., maintaining effort despite challenges), or emerging positive patterns that signal progress *within this experiment*.
- **Also, select 1-2 particularly insightful or representative short quotes directly from the provided 'Notes Summary' (from *this experiment*) that capture a key moment of learning, challenge, or success, and weave them into your analysis where relevant (citing the date if possible from the notes summary).**
- How are their consistent small actions leading to evolution, as seen in *this experiment's data and reflections*?

### 🧪 Experiments & Takeaway
Remember, small, sustainable adjustments often lead to the biggest long-term shifts. Suggest 4 small, actionable experiments (tweaks) for their *next experiment*, designed to make their current positive actions easier, more consistent, or slightly more impactful, based on the analysis of *this experiment's data*. Frame these as curious explorations, not fixes. Experiments should aim to:
1. Build on momentum from positive trends or consistent efforts identified in the 'Growth Highlights' section for *this experiment*.
2. Directly address the friction points or consistency challenges identified in the 'Challenges' section from *this experiment's data and notes*.
3. **Prioritize suggesting experiments that directly explore questions, ideas, or 'what ifs' explicitly mentioned in the user's *notes from this experiment period*.** (Quote the relevant part of the note briefly if it helps frame the experiment).
4. Make 3 suggestions focus on *adjustments* to existing routines/habits rather than introducing entirely new, large habits. The last one should explicitly be mentioned as "something a bit different." It should give them an idea that's highly relevant but which they may not have thought of before.

Again, keep the total response under 1890 characters.
---
`;
  return prompt;
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

exports.submitLog = onRequest( // Renaming back to submitLog for simplicity, ensure URL is updated later
    { cors: true }, // Allows requests from any origin. Required for web clients, good for bot too.
    async (request, response) => {
      // 1. Check Method
      if (request.method !== 'POST') {
        logger.warn(`submitLog (HTTP): Method ${request.method} not allowed.`);
        response.status(405).json({ success: false, error: 'Method Not Allowed', code: 'method-not-allowed' });
        return;
      }
  
      // 2. Check Authorization Header and Verify Firebase ID Token
      const authorizationHeader = request.headers.authorization;
      if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
        logger.warn("submitLog (HTTP): Called without or with malformed Bearer token.");
        response.status(401).json({ success: false, error: 'Unauthorized - No token provided or malformed.', code: 'no-bearer-token' });
        return;
      }
  
      const idToken = authorizationHeader.split('Bearer ')[1];
      let decodedToken;
      try {
        decodedToken = await admin.auth().verifyIdToken(idToken);
        // logger.info("submitLog (HTTP): Successfully verified ID token for UID:", decodedToken.uid); // Optional: log on success
      } catch (error) {
        logger.error("submitLog (HTTP): Error verifying Firebase ID token:", {
          errorMessage: error.message,
          errorCode: error.code,
          tokenPresent: !!idToken,
        });
        // Provide a generic error message but log specifics
        response.status(401).json({ success: false, error: 'Unauthorized - Invalid or expired token.', code: 'invalid-token' });
        return;
      }
  
      // 3. Extract User Info and Payload
      const userId = decodedToken.uid;
      const userTag = decodedToken.name || `User_${userId}`; // Use 'name' claim if available in token
      const { inputValues, outputValue, notes, userTag: receivedUserTag } = request.body; // Data from request.body
  
      logger.info(`submitLog (HTTP): Processing request for user: ${userId} (${userTag})`);
      logger.debug("submitLog (HTTP): Received payload:", request.body);
  
      // 4. Your Adapted Core Logic (from original onCall function)
      const db = admin.firestore();
      try {
        // --- Basic Payload Validation ---
        if (!Array.isArray(inputValues) || inputValues.length !== 3 || outputValue == null || notes == null) {
          logger.warn("submitLog (HTTP): Invalid payload structure.", { userId });
          // Send 400 Bad Request
          response.status(400).json({ success: false, error: 'Missing required log data fields (inputValues[3], outputValue, notes).', code: 'invalid-payload-structure'});
          return;
        }
        if (typeof notes !== 'string' || notes.trim() === '') {
          logger.warn("submitLog (HTTP): Notes cannot be empty.", { userId });
          // Send 400 Bad Request
          response.status(400).json({ success: false, error: 'Notes cannot be empty.', code: 'empty-notes' });
          return;
        }
  
        // --- Fetch User's Weekly Settings ---
        const userSettingsRef = db.collection('users').doc(userId);
        const userSettingsSnap = await userSettingsRef.get();
  
        if (!userSettingsSnap.exists || !userSettingsSnap.data()?.weeklySettings) {
          logger.warn(`submitLog (HTTP): User ${userId} submitted log, but weeklySettings not found.`);
          // Send 412 Precondition Failed (or 400 Bad Request)
          response.status(412).json({ success: false, error: 'Please set your weekly goals using /exp before logging.', code: 'no-weekly-settings' });
          return;
        }
        const settings = userSettingsSnap.data().weeklySettings;
  
        // Helper to check if a setting object is validly configured
        const isConfigured = (setting) => setting && typeof setting.label === 'string' && setting.label.trim() !== "" && typeof setting.unit === 'string' && setting.goal !== null && !isNaN(parseFloat(setting.goal));
  
        // --- Validate Overall Settings Structure ---
        if (!isConfigured(settings.input1) || !isConfigured(settings.output)) {
          logger.error(`submitLog (HTTP): User ${userId} has invalid/incomplete required weeklySettings (Input 1 or Output):`, settings);
          // Send 500 Internal Server Error (as settings seem corrupted server-side)
          response.status(500).json({ success: false, error: 'Your core weekly settings (Input 1 or Output) appear corrupted or incomplete. Please run /exp again.', code: 'corrupted-settings' });
          return;
        }
  
        // --- Validate and Parse Logged Values ---
        const parsedAndLoggedInputs = [];
  
        // Process Input 1 (Required)
        if (inputValues[0] === null || String(inputValues[0]).trim() === '') {
          response.status(400).json({ success: false, error: `Value for Input 1 (${settings.input1.label}) is required.`, code: 'missing-input1'}); return;
        }
        const parsedVal1 = parseFloat(inputValues[0]);
        if (isNaN(parsedVal1)) {
          response.status(400).json({ success: false, error: `Value for Input 1 (${settings.input1.label}) must be a number. You entered: "${inputValues[0]}"`, code: 'nan-input1'}); return;
        }
        // Include goal for potential analysis later
        parsedAndLoggedInputs.push({ label: settings.input1.label, unit: settings.input1.unit, value: parsedVal1, goal: settings.input1.goal });
  
        // Process Input 2 (Required if configured)
        if (isConfigured(settings.input2)) { // Check if setting exists
            if (inputValues[1] === null || String(inputValues[1]).trim() === '') {
            // This error should ideally be caught by Discord's modal validation due to the frontend change.
            // However, having a server-side check is good practice.
            response.status(400).json({ success: false, error: `Value for Input 2 (${settings.input2.label}) is required because it was configured in /exp. You cannot leave it blank.`, code: 'missing-configured-input2'}); return;
            }
            const parsedVal2 = parseFloat(inputValues[1]);
            if (isNaN(parsedVal2)) {
            response.status(400).json({ success: false, error: `Value for Input 2 (${settings.input2.label}) must be a number. You entered: "${inputValues[1]}"`, code: 'nan-input2'}); return;
            }
            parsedAndLoggedInputs.push({ label: settings.input2.label, unit: settings.input2.unit, value: parsedVal2, goal: settings.input2.goal });
        }

  
        // Process Input 3 (Required if configured)
        if (isConfigured(settings.input3)) { // Check if setting exists
            if (inputValues[2] === null || String(inputValues[2]).trim() === '') {
            // This error should ideally be caught by Discord's modal validation.
            response.status(400).json({ success: false, error: `Value for Input 3 (${settings.input3.label}) is required because it was configured in /exp. You cannot leave it blank.`, code: 'missing-configured-input3'}); return;
            }
            const parsedVal3 = parseFloat(inputValues[2]);
            if (isNaN(parsedVal3)) {
            response.status(400).json({ success: false, error: `Value for Input 3 (${settings.input3.label}) must be a number. You entered: "${inputValues[2]}"`, code: 'nan-input3'}); return;
            }
            parsedAndLoggedInputs.push({ label: settings.input3.label, unit: settings.input3.unit, value: parsedVal3, goal: settings.input3.goal });
        }
        // If not configured, this block is skipped.
  
        // Validate and Parse Outcome Value (Required)
        if (outputValue === null || String(outputValue).trim() === '') {
            response.status(400).json({ success: false, error: `Value for Outcome (${settings.output.label}) is required and cannot be empty.`, code: 'missing-output'}); return;
        }
        const parsedOutputValue = parseFloat(outputValue);
        if (isNaN(parsedOutputValue)) {
          response.status(400).json({ success: false, error: `Value for Outcome (${settings.output.label}) must be a number. You entered: "${outputValue}"`, code: 'nan-output'}); return;
        }
        // Add specific outcome validation if needed (e.g., must be >= 0)
        // Example: if (parsedOutputValue < 0 && settings.output.label.toLowerCase() === 'satisfaction') {
        //   response.status(400).json({ success: false, error: `Value for Satisfaction must be 0 or greater.`, code: 'invalid-satisfaction'}); return;
        // }
  
  
        // --- Prepare Firestore Log Document Data ---
        const logEntry = {
          userId: userId,
          userTag: receivedUserTag || userTag, // Use tag derived from token
          timestamp: FieldValue.serverTimestamp(), // Ensure FieldValue is imported
          logDate: new Date().toISOString().split('T')[0],
          inputs: parsedAndLoggedInputs, // Contains successfully parsed AND logged inputs including goals
          output: {
            label: settings.output.label,
            unit: settings.output.unit,
            value: parsedOutputValue,
            goal: settings.output.goal // Include goal
          },
          notes: notes.trim(),
          deeperProblem: settings.deeperProblem || "Not set at time of logging" // Include context
        };
  
        // --- Write Log Entry to Firestore ---
        const writeResult = await db.collection('logs').add(logEntry);
        logger.info(`submitLog (HTTP): Successfully submitted log ${writeResult.id} for user ${userId}.`);
  
        // --- Send Success Response ---
        response.status(200).json({ success: true, logId: writeResult.id });
  
      } catch (error) {
        logger.error("submitLog (HTTP): Error during internal logic/Firestore operation for user:", userId, error);
        // Ensure a response is sent for internal errors during logic processing
        if (!response.headersSent) {
          response.status(500).json({ success: false, error: 'Failed to save log entry due to an internal server error.', code: 'internal-server-error-logic' });
        }
      }
    }
  );

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
    //const userTagForMessage = logData.userTag || `User_${userId}`; // For public message
    // NEW LOGIC for displayNameForMessage:
    let displayNameForMessage;
    const storedUserTag = logData.userTag; // This should be "username#discriminator" or similar

    if (storedUserTag && storedUserTag.includes('#')) {
        const usernamePart = storedUserTag.substring(0, storedUserTag.lastIndexOf('#'));
        if (usernamePart && usernamePart.trim() !== "") { // Ensure username part is not empty or just whitespace
            displayNameForMessage = usernamePart; // Primary: username
        } else {
            displayNameForMessage = storedUserTag; // Fallback: full tag if username part is empty (e.g., tag was just "#1234")
        }
    } else if (storedUserTag && storedUserTag.trim() !== "") {
        // If no '#', it might be a new unique username or just a name stored previously. Use it as is.
        displayNameForMessage = storedUserTag;
    } else {
        displayNameForMessage = `User_${userId}`; // Deepest fallback: User_USERID
    }
    // END NEW LOGIC


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

    logger.log(`Streak trigger started for user ${userId} (tag: ${displayNameForMessage}) due to log ${logId}`);
    const userRef = admin.firestore().collection('users').doc(userId);

    try {
        await admin.firestore().runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            const isNewUser = !userDoc.exists;
            let currentData = { streak: 0, longest: 0, freezes: 0, lastLog: null, userTag: displayNameForMessage };
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
                    userTag: userData[STREAK_CONFIG.FIELDS.USER_TAG] || displayNameForMessage
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
        let tempPublicMessage = null;
        let needsRoleCleanupForPublicMessage = false;

        // ***** START OF MODIFIED LOGIC FOR DAY 1 WELCOME *****
        const isTrueFirstDay = (isNewUser || previousStreak === 0) && newState.newStreak === 1 && !newState.streakBroken;

        if (isTrueFirstDay) {
            logger.log(`[onLogCreatedUpdateStreak] User ${userId} is on their TRUE Day 1. Preparing welcome messages.`);
            dmMessageText = `🎉 Welcome to your habit tracking journey, ${displayNameForMessage}! ` +
                            `You've just logged Day 1 of your streak for the first time (or first time in a while). That's awesome! ` +
                            `Keep it up! You've also earned the 'Originator' role. 🔥`;

            tempPublicMessage = `🎉 Please welcome @${displayNameForMessage} to their habit tracking journey! ` +
                                `They've just logged Day 1! Show some support! 🚀`;

            // Assign 'Originator' role
            const firstRole = STREAK_CONFIG.MILESTONES.ROLES.find(role => role.days === 1);
            if (firstRole) {
                roleInfo = { name: firstRole.name, color: firstRole.color, days: firstRole.days };
            }
            // No role cleanup needed for a true first day, as they have no prior streak roles.
            needsRoleCleanupForPublicMessage = false;

        } else if (newState.streakBroken && newState.newStreak === 1) {
            // This is the existing streak reset logic
            dmMessageText = STREAK_CONFIG.MESSAGES.DM.STREAK_RESET;
            tempPublicMessage = STREAK_CONFIG.MESSAGES.PUBLIC.STREAK_RESET.replace('${userTag}', displayNameForMessage);
            needsRoleCleanupForPublicMessage = true;
            const firstRole = STREAK_CONFIG.MILESTONES.ROLES.find(role => role.days === 1);
            if (firstRole) {
                roleInfo = { name: firstRole.name, color: firstRole.color, days: firstRole.days };
                logger.log(`Streak reset: Assigning default role ${firstRole.name} and flagging role cleanup.`);
            }
        } else {
            // Existing logic for continued streaks, milestone roles, and streak extensions
            if ((newState.newStreak > previousStreak) || (previousStreak === 0 && newState.newStreak === 1)) { // Catches regular first day if not caught by isTrueFirstDay
                const milestoneRole = STREAK_CONFIG.MILESTONES.ROLES.find(role => role.days === newState.newStreak);
                if (milestoneRole) {
                    roleInfo = { name: milestoneRole.name, color: milestoneRole.color, days: milestoneRole.days };
                    if (!dmMessageText) { // Avoid overwriting Day 1 welcome or reset DM
                       dmMessageText = STREAK_CONFIG.MESSAGES.DM.ROLE_ACHIEVEMENT.replace('${roleName}', roleInfo.name);
                    }
                    logger.log(`User ${userId} hit role milestone: ${roleInfo.name} at ${newState.newStreak} days.`);
                    // Public message for role achievement (if not a streak break and not Day 1 welcome)
                    if (roleInfo.days > 1 && !newState.streakBroken && !isTrueFirstDay) {
                         tempPublicMessage = `🎉 Big congrats to ${displayNameForMessage} for achieving the '${roleInfo.name}' title with a ${newState.newStreak}-day streak!`;
                    }
                }
            }
            // Streak extension public message (if no specific role milestone and not Day 1 welcome)
            if (!tempPublicMessage && newState.streakContinued && newState.newStreak > previousStreak && !newState.streakBroken && !roleInfo && !isTrueFirstDay) {
                tempPublicMessage = `🥳 ${displayNameForMessage} just extended their daily logging streak to ${newState.newStreak} days! Keep it up!`;
            }
        }
        // ***** END OF MODIFIED LOGIC FOR DAY 1 WELCOME *****

        // --- Freeze Award Logic ---
        // This should trigger if the streak has increased or just started, and it's a freeze award day,
        // and a freeze wasn't just used to save the streak.
        if ((newState.newStreak > previousStreak || (previousStreak === 0 && newState.newStreak > 0)) &&
            STREAK_CONFIG.MILESTONES.FREEZE_AWARD_DAYS.includes(newState.newStreak) &&
            !newState.usedFreeze) {
            const maxFreezes = STREAK_CONFIG.FREEZES.MAX || 5;
            // Check current freezes BEFORE awarding a new one.
            // newState.freezesRemaining at this point reflects freezes *after* any potential use to save the streak.
            // We need to compare based on the count *before* awarding this new one.
            // The updateData for FREEZES_REMAINING will directly use the final newState.freezesRemaining.

            if (updateData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING] < maxFreezes) { // Check against the already prepared updateData
                updateData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING]++; // Award freeze directly in updateData
                
                // Update the PENDING_FREEZE_ROLE_UPDATE again with the new count
                updateData[STREAK_CONFIG.FIELDS.PENDING_FREEZE_ROLE_UPDATE] = `${STREAK_CONFIG.MILESTONES.FREEZE_ROLE_BASENAME}: ${updateData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING]}`;
                logger.log(`Awarded freeze to ${userId} at streak ${newState.newStreak}. New total: ${updateData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING]}`);

                const freezeAwardMsg = STREAK_CONFIG.MESSAGES.DM.FREEZE_AWARD.replace('${streak}', newState.newStreak);
                dmMessageText = dmMessageText ? `${dmMessageText}\n\n${freezeAwardMsg}` : freezeAwardMsg;
            } else {
                logger.log(`User ${userId} hit freeze award day ${newState.newStreak}, but already has max freezes (${maxFreezes}). Current in updateData: ${updateData[STREAK_CONFIG.FIELDS.FREEZES_REMAINING]}`);
            }
        }

        // --- Your DEBUG LOGS (keep them here) ---
        logger.log(`[onLogCreatedUpdateStreak DEBUG] For User: ${userId} - previousStreak: ${previousStreak}, newState.newStreak: ${newState.newStreak}, streakContinued (calc'd in func): ${newState.streakContinued}, streakBroken: ${newState.streakBroken}`);
        const debugMilestoneRole = STREAK_CONFIG.MILESTONES.ROLES.find(role => role.days === newState.newStreak);
        logger.log("[onLogCreatedUpdateStreak DEBUG] debugMilestoneRole found (based on newState.newStreak):", debugMilestoneRole);
        logger.log("[onLogCreatedUpdateStreak DEBUG] roleInfo before final assignment logic:", roleInfo);
        // --- End DEBUG LOGS ---

        // --- Determine PENDING_PUBLIC_MESSAGE ---
        if (newState.streakBroken && newState.newStreak === 1) {
            tempPublicMessage = STREAK_CONFIG.MESSAGES.PUBLIC.STREAK_RESET.replace('${userTag}', displayNameForMessage);
            needsRoleCleanupForPublicMessage = true; // A streak reset to 1 always implies role cleanup for public view
            logger.log(`[onLogCreatedUpdateStreak] Condition for Public Message: Streak Reset. Message: "${tempPublicMessage}"`);
        } else if (roleInfo && roleInfo.days > 0 && !newState.streakBroken) {
            // This is a role milestone achievement (and not part of a streak break scenario)
            tempPublicMessage = `🎉 Big congrats to ${displayNameForMessage} for achieving the '${roleInfo.name}' title with a ${newState.newStreak}-day streak!`;
            logger.log(`[onLogCreatedUpdateStreak] Condition for Public Message: Role Milestone. Message: "${tempPublicMessage}"`);
        } else if (newState.streakContinued && newState.newStreak > previousStreak && !newState.streakBroken && !roleInfo) {
            tempPublicMessage = `🥳 ${displayNameForMessage} just extended their daily logging streak to ${newState.newStreak} days! Keep it up!`;
            logger.log(`[onLogCreatedUpdateStreak] Condition for Public Message: Streak Extension. Message: "${tempPublicMessage}"`);
        } else {
            logger.log(`[onLogCreatedUpdateStreak] No specific public message condition met. Streak: ${newState.newStreak}, Broken: ${newState.streakBroken}, Continued: ${newState.streakContinued}, RoleInfo: ${roleInfo ? roleInfo.name : 'None'}`);
        }

        // --- Prepare data for Firestore update (add/modify these in your existing updateData object) ---

        // PENDING_DM_MESSAGE (Your existing logic for this should be fine, typically set based on dmMessageText)
        if (dmMessageText) { // dmMessageText is from your earlier logic for DMs
            updateData[STREAK_CONFIG.FIELDS.PENDING_DM_MESSAGE] = dmMessageText;
        } else {
            updateData[STREAK_CONFIG.FIELDS.PENDING_DM_MESSAGE] = FieldValue.delete();
        }

        // PENDING_ROLE_UPDATE (This needs to carefully consider streak breaks vs. regular milestones)
        if (newState.streakBroken && newState.newStreak === 1) {
            const firstRole = STREAK_CONFIG.MILESTONES.ROLES.find(role => role.days === 1);
            if (firstRole) {
                updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_UPDATE] = { name: firstRole.name, color: firstRole.color, days: firstRole.days };
                logger.log(`[onLogCreatedUpdateStreak] Streak broken to 1 day. Ensuring PENDING_ROLE_UPDATE is set for ${firstRole.name}.`);
            } else {
                updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_UPDATE] = FieldValue.delete(); // Should not happen if Originator exists
            }
        } else if (roleInfo) { // A non-break role milestone was hit
            updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_UPDATE] = roleInfo;
        } else { // No specific role change for this event (e.g., simple streak extension without milestone)
            updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_UPDATE] = FieldValue.delete();
        }

        // PENDING_PUBLIC_MESSAGE (Using the tempPublicMessage determined above)
        if (tempPublicMessage) {
            updateData[STREAK_CONFIG.FIELDS.PENDING_PUBLIC_MESSAGE] = tempPublicMessage;
        } else {
            updateData[STREAK_CONFIG.FIELDS.PENDING_PUBLIC_MESSAGE] = FieldValue.delete();
        }

        // PENDING_ROLE_CLEANUP (Using needsRoleCleanupForPublicMessage determined above)
        if (needsRoleCleanupForPublicMessage) {
            updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_CLEANUP] = true;
        } else {
            updateData[STREAK_CONFIG.FIELDS.PENDING_ROLE_CLEANUP] = FieldValue.delete();
        }

        // PENDING_FREEZE_ROLE_UPDATE (This should already be in your updateData from earlier logic, based on final newState.freezesRemaining)
        // Example: updateData[STREAK_CONFIG.FIELDS.PENDING_FREEZE_ROLE_UPDATE] = `${STREAK_CONFIG.MILESTONES.FREEZE_ROLE_BASENAME}: ${newState.freezesRemaining}`;
        // Ensure this line exists and is correct based on the final freeze count.

        // <<<< END OF THE NEW LOGIC BLOCK >>>>
        

        // Filter out undefined values (FieldValue.delete() handles actual removal)
        // Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]); // Not strictly needed if using FieldValue.delete()

        logger.log(`Updating user ${userId} Firestore doc with:`, JSON.parse(JSON.stringify(updateData)));
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
        `${fieldName} ("${trimmedStr}") must be in "Goal #, Unit, Label" format. Use a comma as separator (e.g., "15.5, minutes, meditation" or "10, pages, Reading"). Note: Decimals in goals are fine.`
      );
    }

    const goalStr = match[1].trim();
    const unit = match[2].trim();
    const label = match[3].trim();

    if (!goalStr || !unit || !label) {
      // This case should ideally be caught by the main regex, but as a fallback:
      throw new HttpsError(
        'invalid-argument',
        `${fieldName} ("${trimmedStr}") must be in "Goal #, Unit, Label" format. Use a comma as separator (e.g., "15.5, minutes, meditation" or "10, pages, Reading").`
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
    if (goal < 0) {
      throw new HttpsError(
        'invalid-argument',
        `Goal for ${fieldName} ("${goalStr}") must be 0 or a positive number.`
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

  // In functions/index.js

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


    /**
     * Saves the experiment duration, reminder schedule, generates an experimentId,
     * calculates the end timestamp, and snapshots active settings.
     * Expects data payload: {
     * experimentDuration: string (e.g., "1_week", "4_weeks"),
     * userCurrentTime: string | null (e.g., "2:30 PM" or "14:30", or null if skipped),
     * reminderWindowStartHour: string | null (e.g., "09" for 9 AM, "17" for 5 PM, or null),
     * reminderWindowEndHour: string | null (e.g., "17" for 5 PM, "00" for midnight, or null),
     * reminderFrequency: string (e.g., "daily_1", "none"),
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
    const db = admin.firestore(); // Ensure db is initialized

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

    if (data.skippedReminders === false) {
        if (data.reminderFrequency === 'none') {
            if (data.userCurrentTime !== null || data.reminderWindowStartHour !== null || data.reminderWindowEndHour !== null) {
                logger.warn(`[setExperimentSchedule] User ${userId} has reminderFrequency 'none' but also provided some time details. Frequency 'none' will take precedence.`, data);
            }
        } else {
            if (typeof data.userCurrentTime !== 'string' || data.userCurrentTime.trim() === '') {
                throw new HttpsError('invalid-argument', 'User current time is required when setting active reminders.');
            }
            if (typeof data.reminderWindowStartHour !== 'string' || data.reminderWindowStartHour.trim() === '') {
                throw new HttpsError('invalid-argument', 'Reminder window start hour is required when setting active reminders.');
            }
            if (typeof data.reminderWindowEndHour !== 'string' || data.reminderWindowEndHour.trim() === '') {
                throw new HttpsError('invalid-argument', 'Reminder window end hour is required when setting active reminders.');
            }
        }
    }

    // --- Generate unique experimentId ---
    // Using Firestore's auto-ID for a new document in a temporary path to get an ID,
    // then we'll use this ID. This is a robust way to get a unique ID.
    const tempExperimentDocRef = db.collection('users').doc(userId).collection('_tempExperimentIds').doc();
    const experimentId = tempExperimentDocRef.id; // This is the unique ID

    // --- Fetch current weeklySettings to snapshot ---
    const userDocRef = db.collection('users').doc(userId);
    let scheduledExperimentSettings = null;
    try {
        const userDocSnap = await userDocRef.get();
        if (userDocSnap.exists && userDocSnap.data().weeklySettings) {
            scheduledExperimentSettings = userDocSnap.data().weeklySettings;
            logger.log(`[setExperimentSchedule] User ${userId}: Found weeklySettings to snapshot.`);
        } else {
            logger.warn(`[setExperimentSchedule] User ${userId}: weeklySettings not found. Cannot snapshot settings for the experiment.`);
            // Depending on strictness, you might throw an error or allow proceeding without settings snapshot
            // For now, we'll allow it, but stats calculation might need to handle missing settings.
            // throw new HttpsError('not-found', 'Weekly settings not found. Please set up your experiment metrics first using /go -> Set Experiment.');
        }
    } catch (error) {
        logger.error(`[setExperimentSchedule] User ${userId}: Error fetching weeklySettings:`, error);
        throw new HttpsError('internal', 'Failed to retrieve existing experiment settings.');
    }


    // --- Calculate experimentEndTimestamp ---
    const now = new Date(); // Current server time
    const experimentSetAtTimestamp = admin.firestore.Timestamp.fromDate(now); // Convert to Firestore Timestamp

    let daysToAdd = 0;
    switch (data.experimentDuration) {
        case "1_week": daysToAdd = 7; break;
        case "2_weeks": daysToAdd = 14; break;
        case "3_weeks": daysToAdd = 21; break;
        case "4_weeks": daysToAdd = 28; break;
        default: throw new HttpsError('invalid-argument', `Invalid experiment duration: ${data.experimentDuration}`); // Should be caught by validation above
    }

    const experimentEndDate = new Date(now.getTime());
    experimentEndDate.setDate(now.getDate() + daysToAdd);
    // To ensure the report happens *after* the full last day, set time to end of that day or start of next.
    // For simplicity in query later, let's aim for the same time of day, `daysToAdd` later.
    // Or, to be more precise for "end of experiment", consider setting it to the end of the chosen day.
    // For now, same time of day `daysToAdd` later is fine.
    const experimentEndTimestamp = admin.firestore.Timestamp.fromDate(experimentEndDate);

    // --- Calculate UTC reminder window if reminders are active ---
    let reminderWindowStartUTC = null;
    let reminderWindowEndUTC = null;
    let initialUTCOffsetHours = null; // For potential future reference or debugging

    if (!data.skippedReminders && data.reminderFrequency !== 'none' && data.userCurrentTime) {
        try {
            const nowUtcDate = new Date(); // Server's current UTC time
            const serverCurrentUTCHour = nowUtcDate.getUTCHours();

            const [timePart, ampmPart] = data.userCurrentTime.split(' '); // e.g., "2:30", "PM"
            let [userReportedLocalHour, userReportedLocalMinute] = timePart.split(':').map(Number);

            if (ampmPart.toUpperCase() === 'PM' && userReportedLocalHour !== 12) {
                userReportedLocalHour += 12;
            } else if (ampmPart.toUpperCase() === 'AM' && userReportedLocalHour === 12) { // 12 AM is hour 0
                userReportedLocalHour = 0;
            }
            // userReportedLocalHour is now 0-23

            // Offset = UTC_Hour - Local_Hour_Normalized_To_Same_Day_As_UTC_For_Calc
            // This offset, when added to a local hour, gives the UTC hour.
            initialUTCOffsetHours = serverCurrentUTCHour - userReportedLocalHour;
            // Note: This offset can be > +12 or < -12 if there's a date boundary,
            // but for converting window hours, we primarily care about the hour shift.
            // The (hour + offset + 24) % 24 handles this correctly for hours.

            const localStartHourInt = parseInt(data.reminderWindowStartHour, 10); // "00" - "23"
            const localEndHourInt = parseInt(data.reminderWindowEndHour, 10);   // "00" - "23"

            reminderWindowStartUTC = (localStartHourInt + initialUTCOffsetHours + 24) % 24;
            reminderWindowEndUTC = (localEndHourInt + initialUTCOffsetHours + 24) % 24;

            logger.log(`[setExperimentSchedule] User: ${userId}. Local time provided: ${data.userCurrentTime} (parsed as hour ${userReportedLocalHour}). Server UTC hour: ${serverCurrentUTCHour}. Calculated initial offset to get UTC: ${initialUTCOffsetHours} hours. Local window ${data.reminderWindowStartHour}-${data.reminderWindowEndHour} maps to UTC window: ${reminderWindowStartUTC}-${reminderWindowEndUTC}.`);

        } catch (e) {
            logger.error(`[setExperimentSchedule] User ${userId}: Error calculating UTC reminder window details. Reminders might not work correctly. Error:`, e);
            // Keep UTC fields null if calculation fails
            reminderWindowStartUTC = null;
            reminderWindowEndUTC = null;
            initialUTCOffsetHours = null;
        }
    }

    const experimentScheduleData = {
        experimentId: experimentId,
        experimentDuration: data.experimentDuration,
        experimentSetAt: experimentSetAtTimestamp,
        experimentEndTimestamp: experimentEndTimestamp,
        statsProcessed: false,
        scheduledExperimentSettings: scheduledExperimentSettings,

        // Original reminder fields (can be kept for reference or if bot UX uses them)
        userCurrentTimeAtSetup: data.skippedReminders ? null : data.userCurrentTime,
        reminderWindowStartLocal: data.skippedReminders || data.reminderFrequency === 'none' ? null : data.reminderWindowStartHour,
        reminderWindowEndLocal: data.skippedReminders || data.reminderFrequency === 'none' ? null : data.reminderWindowEndHour,
        reminderFrequency: data.reminderFrequency,
        remindersSkipped: data.skippedReminders,

        // NEW/MODIFIED fields for reminder processing
        reminderWindowStartUTC: reminderWindowStartUTC,       // Integer hour (0-23) in UTC
        reminderWindowEndUTC: reminderWindowEndUTC,         // Integer hour (0-23) in UTC
        initialUTCOffsetHours: initialUTCOffsetHours,       // The calculated offset at setup (for debugging/info)
        lastReminderSentDayOfYearUTC: null,                 // e.g., 135 (for the 135th day of the year in UTC)
        remindersSentOnLastDay: 0                         // Counter for how many sent on that UTC day
    };

    try {
        await userDocRef.set({
            experimentCurrentSchedule: experimentScheduleData
        }, { merge: true });
        logger.log(`Successfully saved experiment schedule for user ${userId}:`, experimentScheduleData);

        let message = `✅ Experiment (ID: ${experimentId}) duration set to ${data.experimentDuration.replace('_', ' ')}.`;
        if (data.skippedReminders) {
            message += " Reminders were skipped.";
        } else if (data.reminderFrequency === 'none') {
            message += " No reminders will be sent.";
        } else {
            message += ` Reminders scheduled (frequency: ${data.reminderFrequency.replace('_', ' ')}, window: ${data.reminderWindowStartHour}:00-${data.reminderWindowEndHour}:00 based on your local time).`;
        }

        return { success: true, message: message, experimentId: experimentId }; // MODIFIED: Return experimentId

    } catch (error) {
        logger.error("Error writing experiment schedule to Firestore for user:", userId, error);
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
                // ================= Replacement Block Starts Here =================
        // Ensure normalizeLabel and normalizeUnit are defined in the same file or imported.
        // At the top of your functions index with stats.txt, or near normalizeLabel, add:
        // const normalizeUnit = normalizeLabel; // If you're reusing for simplicity

        // --- Output Metric Matching ---
        if (log.output && typeof log.output.label === 'string' && typeof log.output.unit === 'string' &&
            activeExperimentSettings.output && typeof activeExperimentSettings.output.label === 'string' && typeof activeExperimentSettings.output.unit === 'string') {

            const normalizedLogOutputLabel = normalizeLabel(log.output.label);
            const normalizedLogOutputUnit = normalizeUnit(log.output.unit); // Make sure normalizeUnit is defined
            const normalizedSettingsOutputLabel = normalizeLabel(activeExperimentSettings.output.label);
            const normalizedSettingsOutputUnit = normalizeUnit(activeExperimentSettings.output.unit); // Make sure normalizeUnit is defined

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
            // This 'else' means the log.output structure was incomplete or activeExperimentSettings.output was incomplete
            missingMetricInLogCount++; // Count as missing if structure is invalid for robust matching
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
                const normalizedSettingsUnit = normalizeUnit(inputSetting.unit); // Make sure normalizeUnit is defined

                const foundInput = log.inputs && Array.isArray(log.inputs) ?
                    log.inputs.find(inp =>
                        inp && typeof inp.label === 'string' && typeof inp.unit === 'string' &&
                        normalizeLabel(inp.label) === normalizedSettingsLabel &&
                        normalizeUnit(inp.unit) === normalizedSettingsUnit // Make sure normalizeUnit is defined
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
                    // Logic to check for label match with different unit and update missingMetricInLogCount
                    let labelMatchedWithDifferentUnit = false;
                    if (log.inputs && Array.isArray(log.inputs)) {
                        const labelMatchDifferentUnitCheck = log.inputs.find(inp =>
                            inp && typeof inp.label === 'string' && typeof inp.unit === 'string' &&
                            normalizeLabel(inp.label) === normalizedSettingsLabel &&
                            normalizeUnit(inp.unit) !== normalizedSettingsUnit // Make sure normalizeUnit is defined
                        );
                        if (labelMatchDifferentUnitCheck) {
                            logger.info(`[${callingFunction}] Input label "${normalizedSettingsLabel}" matched settings, but units differ. Log: "${labelMatchDifferentUnitCheck.unit}", Settings: "${inputSetting.unit}". Log ID: ${log.id}`);
                            labelMatchedWithDifferentUnit = true;
                        }
                    }
                    // Only increment missingMetricInLogCount if no label match was found at all
                    if (!labelMatchedWithDifferentUnit) {
                        missingMetricInLogCount++;
                        // You can keep or remove the more verbose log about the specific metric not being found
                        // logger.info(`[${callingFunction}] Configured input metric ${settingsOriginalLabel} (normalized: ${normalizedSettingsLabel}/${normalizedSettingsUnit}) not found with matching unit in log ${log.id}.`);
                    }
                }
            }
        });
        // =================  Replacement Block Ends Here  =================
    });
    if (nonNumericEntriesCount > 0) {
        logger.warn(`[${callingFunction}] [calculateAndStorePeriodStats] Found ${nonNumericEntriesCount} non-numeric entries across all logs for user ${userId}, experiment ${experimentId}. These were skipped.`);
    }
    if (missingMetricInLogCount > 0) {
        logger.info(`[${callingFunction}] [calculateAndStorePeriodStats] A total of ${missingMetricInLogCount} instances of configured metrics were not found in individual logs for user ${userId}, experiment ${experimentId}.`);
    }
    Object.keys(metricValues).forEach(key => {
        logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Extracted ${metricValues[key].length} values for metric "${key}" for user ${userId}, experiment ${experimentId}`);
    });

    // Step 4: Calculate Core Statistics (Code from original function, lines 427-441)
    logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Starting core statistics calculation for user ${userId}, experiment ${experimentId}.`);
    const calculatedMetricStats = {};
    const skippedMetrics = [];
    const MINIMUM_DATAPOINTS_FOR_METRIC_STATS = 5;
    for (const labelKey in metricValues) {
        if (Object.prototype.hasOwnProperty.call(metricValues, labelKey)) {
            const values = metricValues[labelKey];
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
                calculatedMetricStats[labelKey] = {
                    label: metricDetail.label,
                    unit: metricDetail.unit,
                    dataPoints: dataPoints,
                    average: parseFloat(mean.toFixed(2)),
                    median: parseFloat(median.toFixed(2)),
                    variationPercentage: parseFloat(variation.toFixed(2))
                };
                logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Calculated stats for metric "${labelKey}": Avg=${mean.toFixed(2)}, Med=${median.toFixed(2)}, Var%=${variation.toFixed(2)}, DP=${dataPoints}. User: ${userId}, Exp: ${experimentId}`);
            }
        }
    }
    if (skippedMetrics.length > 0) {
        logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Total skipped metrics due to insufficient data: ${skippedMetrics.length} for user ${userId}, experiment ${experimentId}. Details:`, skippedMetrics);
    }

    // Step 5: Calculate Correlations (Code from original function, lines 442-478)
    logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Starting correlation calculations for user ${userId}, experiment ${experimentId}.`);
    const correlations = {};
    const MINIMUM_PAIRS_FOR_CORRELATION = 5;
    const outputMetricLabel = activeExperimentSettings.output.label;
    const outputValues = metricValues[outputMetricLabel];
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
                const inputValues = metricValues[inputLabel];

                if (!inputStats || inputStats.dataPoints < MINIMUM_PAIRS_FOR_CORRELATION) {
                    logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Input metric "${inputLabel}" has insufficient data (${inputStats ? inputStats.dataPoints : 0} points) for correlation with output. User: ${userId}, Exp: ${experimentId}`);
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
                let pairedInputValues = [];
                let pairedOutputValues = [];
                const n_pairs = Math.min(inputValues.length, outputValues.length);
                if (n_pairs < MINIMUM_PAIRS_FOR_CORRELATION) {
                    logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Insufficient PAIRS (${n_pairs}) for correlation between "${inputLabel}" and "${outputMetricLabel}" after aligning. User: ${userId}, Exp: ${experimentId}`);
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
                pairedInputValues = inputValues.slice(0, n_pairs);
                pairedOutputValues = outputValues.slice(0, n_pairs);
                // NEW try...catch block for correlation (with p-value)
                try {
                    const coefficient = jStat.corrcoeff(pairedInputValues, pairedOutputValues);
                    let pValue = null; // Initialize pValue

                    if (n_pairs > 2 && Math.abs(coefficient) < 1 && Math.abs(coefficient) > 1e-9) { // Added > 1e-9 to avoid issues with coeff near 0 for tStat
                        const tStat = coefficient * Math.sqrt((n_pairs - 2) / (1 - (coefficient * coefficient)));
                        // pValue for two-tailed test
                        if (isFinite(tStat)) { // Check if tStat is a finite number
                            pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), n_pairs - 2));
                        } else {
                            pValue = 1.0; // If tStat is not finite (e.g. coeff is exactly 1 or -1, or near 0 leading to issues)
                            logger.warn(`[<span class="math-inline">\{callingFunction\}\] \[Correlation\] tStat was not finite for "</span>{inputLabel}" vs "${outputMetricLabel}". Coeff: ${coefficient}, N: ${n_pairs}. Setting pValue to 1.0.`);
                        }
                    } else if (Math.abs(coefficient) >= 1) {
                        pValue = 0.0; // Perfect correlation, typically p-value is considered 0
                    } else {
                        pValue = 1.0; // Not enough pairs or coefficient is trivial, assume not significant
                    }


                    let interpretation = "";
                    const absCoeff = Math.abs(coefficient);
                    let strength = "";

                    if (absCoeff >= 0.7) strength = "🟥very strong";
                    else if (absCoeff >= 0.45) strength = "🟧strong";
                    else if (absCoeff >= 0.3) strength = "🟨moderate";
                    else if (absCoeff >= 0.15) strength = "🟩weak";
                    else strength = "🟦no detectable";

                    const direction = coefficient >= 0 ? "positive" : "negative";

                    const isSignificant = pValue !== null && pValue < 0.05;

                    if (strength === "🟦no detectable") { 
                        interpretation = `There appears to be ${strength} correlation between ${inputLabel} and ${outputMetricLabel}.`;
                    } else if (isSignificant) {
                        interpretation = `You can be 95% confident that there is a ${strength} ${direction} correlation between ${inputLabel} and ${outputMetricLabel}.`;
                    } else {
                        interpretation = `It appears there may be a ${strength} ${direction} correlation between ${inputLabel} and ${outputMetricLabel}. Worth getting more data?`;
                    }

                    correlations[inputLabel] = {
                        label: inputLabel,
                        vsOutputLabel: outputMetricLabel,
                        coefficient: parseFloat(coefficient.toFixed(3)),
                        pValue: pValue !== null && isFinite(pValue) ? parseFloat(pValue.toFixed(3)) : null, // Store p-value, ensure finite
                        interpretation: interpretation,
                        n_pairs: n_pairs,
                        status: "calculated"
                    };
                    // Corrected logger string for HTML display in Firebase logs
                    logger.log(`[<span class="math-inline">\{callingFunction\}\] \[Correlation\] For "</span>{inputLabel}" vs "<span class="math-inline">\{outputMetricLabel\}"\: Coeff\=</span>{coefficient.toFixed(3)}, PVal=<span class="math-inline">\{pValue \!\=\= null && isFinite\(pValue\) ? pValue\.toFixed\(3\) \: 'N/A'\}, N\=</span>{n_pairs}. User: ${userId}, Exp: ${experimentId}`);

                } catch (corrError) {
                    logger.error(`[<span class="math-inline">\{callingFunction\}\] \[calculateAndStorePeriodStats\] Error calculating correlation for "</span>{inputLabel}" vs "${outputMetricLabel}". User: ${userId}, Exp: ${experimentId}`, corrError);
                    correlations[inputLabel] = { // Ensure this matches the structure above if an error occurs
                        label: inputLabel,
                        vsOutputLabel: outputMetricLabel,
                        coefficient: null,
                        pValue: null,
                        interpretation: "Error during calculation.",
                        n_pairs: n_pairs, // n_pairs should be available here from before the try
                        status: "error_during_calculation",
                        error_message: corrError.message
                    };
                }
            }
        }
    }

    // Step 6: Prepare Data Structures for Stratified Analysis (Code from original function, lines 479-493)
    logger.log(`[${callingFunction}] [calculateAndStorePeriodStats] Preparing data for stratified analysis. User: ${userId}, Exp: ${experimentId}`);
    const stratifiedAnalysisPrep = {
        outputMetricLabel: activeExperimentSettings.output.label,
        outputValues: metricValues[activeExperimentSettings.output.label] || [],
        outputStats: {},
        inputMedians: {}
    };
    const outputMetricValuesForStrat = metricValues[activeExperimentSettings.output.label];
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
            const MIN_DATAPOINTS_FOR_GROUP_ANALYSIS = 3; // Minimum data points needed in a group to report an average.
            const IQR_MULTIPLIER = 1.5;
            const pairwiseInteractionResults = {};

            // Get Overall Output Statistics for significance thresholds
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
                            summary: "Combined analysis skipped. Insufficient data or configuration for this pair." // Default summary
                        };

                        if (typeof medianA !== 'number' || typeof medianB !== 'number') {
                            logger.warn(`[${callingFunction}] [PairwiseInteraction] Skipping pair "${labelA}" vs "${labelB}" due to missing median(s). Median A: ${medianA}, Median B: ${medianB}`);
                            pairwiseInteractionResults[pairKey].summary = `Combined analysis for ${labelA} & ${labelB} skipped: One or both input metrics lacked enough data to determine a median.`;
                            continue; 
                        }

                        const valuesA = metricValues[labelA] || [];
                        const valuesB = metricValues[labelB] || [];
                        const outputValuesArray = metricValues[overallOutputLabel] || [];
                        
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
                                // delete group.outputs; // No longer needed as groupsData is temporary for outputs array
                            }
                        }
                        
                        let summaryMsg = "";
                        if (!thresholdsCalculated) {
                            summaryMsg = `Combined analysis for ${labelA} & ${labelB}: Significance thresholds for Output (${overallOutputLabel}) could not be determined (e.g. output metric had too little variation or data). Basic group averages shown if data allows.`;
                        } else {
                            const foundSignificantInteractions = [];
                            if (bestSignificantGroup) {
                                // Use the actual labels from inputASetting and inputBSetting for interpretFirebaseGroupKey
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
                // No explicit summary needed here as no pairs will be added to pairwiseInteractionResults if this condition is met.
            }
            // ============== END: Pairwise Interaction Analysis Logic ==============

    // Step 7: Assemble, Store, and Return Results (Code from original function, lines 494-504)
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

/**
 * Scheduled function to check for ended experiments and trigger statistics calculation.
 * Runs periodically (e.g., every hour).
 */
exports.checkForEndedExperimentsAndTriggerStats = onSchedule("every 1 hours", async (event) => {
    logger.log("checkForEndedExperimentsAndTriggerStats: Scheduled function triggered.", event.scheduleTime);
    const db = admin.firestore();
    const now = admin.firestore.Timestamp.now(); // Current Firestore Timestamp

    try {
        // Query for user documents that have an experimentCurrentSchedule
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

            if (userData.experimentCurrentSchedule &&
                userData.experimentCurrentSchedule.experimentEndTimestamp &&
                userData.experimentCurrentSchedule.experimentEndTimestamp.toDate() <= now.toDate() &&
                (userData.experimentCurrentSchedule.statsProcessed === undefined ||
                 userData.experimentCurrentSchedule.statsProcessed === false)) {

                logger.log(`checkForEndedExperimentsAndTriggerStats: Found ended experiment for user ${userId}, experimentId: ${userData.experimentCurrentSchedule.experimentId}`);
                const schedule = userData.experimentCurrentSchedule;
                const userTag = userData.userTag || `User_${userId}`;

                const experimentId = schedule.experimentId;
                const activeExperimentSettings = schedule.scheduledExperimentSettings;
                const experimentSettingsTimestampInput = schedule.experimentSetAt; // This is a Firestore Timestamp object or compatible
                const experimentEndDateISOInput = schedule.experimentEndTimestamp.toDate().toISOString();

                if (!experimentId) {
                    logger.error(`checkForEndedExperimentsAndTriggerStats: Missing experimentId for user ${userId}. Skipping.`);
                    return; // continue to next user
                }
                if (!activeExperimentSettings) {
                    logger.warn(`checkForEndedExperimentsAndTriggerStats: Missing scheduledExperimentSettings for user ${userId}, experiment ${experimentId}. Stats might be incomplete or fail if called without settings.`);
                    // If settings are absolutely crucial and _calculateAndStorePeriodStatsLogic can't handle their absence,
                    // you might choose to skip here or ensure the logic function has robust defaults/error handling.
                    // For now, we proceed, relying on _calculateAndStorePeriodStatsLogic's validation.
                }
                if (!experimentSettingsTimestampInput) {
                    logger.error(`checkForEndedExperimentsAndTriggerStats: Missing experimentSetAt (as experimentSettingsTimestampInput) for user ${userId}, experiment ${experimentId}. Skipping.`);
                    return; // continue to next user
                }

                // Call the internal helper function directly
                const processingPromise = _calculateAndStorePeriodStatsLogic(
                    userId,
                    userTag,
                    experimentId,
                    experimentSettingsTimestampInput, // Pass the Firestore Timestamp object (or compatible)
                    experimentEndDateISOInput,        // Pass the ISO string
                    activeExperimentSettings,
                    "checkForEndedExperimentsAndTriggerStats" // Indicate calling context
                )
                .then(async (statsResult) => {
                    if (statsResult && statsResult.success) {
                        logger.log(`checkForEndedExperimentsAndTriggerStats: Successfully processed stats (status: ${statsResult.status}) for user ${userId}, experiment ${experimentId}. Stored Doc ID: ${statsResult.experimentId}`);
                        // Update experimentCurrentSchedule to mark as processed
                        await userDoc.ref.update({
                            'experimentCurrentSchedule.statsProcessed': true,
                            'experimentCurrentSchedule.statsDocumentId': statsResult.experimentId, // experimentId is the doc ID
                            'experimentCurrentSchedule.statsCalculationTimestamp': FieldValue.serverTimestamp()
                        });

                        // Notify the bot by writing to pendingStatsNotifications
                        // Only create notification if stats were actually calculated (not just insufficient_data)
                        // or if you want to notify for insufficient_data as well (current logic will notify).
                        const notificationRef = db.collection('pendingStatsNotifications').doc(`${userId}_${experimentId}`);
                        await notificationRef.set({
                            userId: userId,
                            userTag: userTag,
                            experimentId: statsResult.experimentId,
                            statsDocumentId: statsResult.experimentId, // Redundant but consistent with bot listener
                            status: 'ready', // This triggers the bot
                            generatedAt: FieldValue.serverTimestamp(),
                            message: statsResult.message || `Stats report for experiment ${experimentId} is ready (status: ${statsResult.status}).`
                        });
                        logger.log(`checkForEndedExperimentsAndTriggerStats: Notification created for user ${userId}, experiment ${experimentId}.`);
                        processedCount++;
                    } else {
                        // This block handles failures returned by _calculateAndStorePeriodStatsLogic
                        logger.error(`checkForEndedExperimentsAndTriggerStats: Failed to calculate stats for user ${userId}, experiment ${experimentId}. Result:`, statsResult);
                        await userDoc.ref.update({
                            'experimentCurrentSchedule.statsProcessed': 'failed',
                            'experimentCurrentSchedule.statsProcessingError': statsResult?.message || 'Unknown error during stats calculation logic.'
                        });
                    }
                })
                .catch(async (error) => {
                    // This catch block is for unexpected errors thrown by _calculateAndStorePeriodStatsLogic
                    // or during the .then() block's async operations (like Firestore updates).
                    logger.error(`checkForEndedExperimentsAndTriggerStats: Critical error during processing for user ${userId}, experiment ${experimentId}:`, error);
                    try {
                        await userDoc.ref.update({
                            'experimentCurrentSchedule.statsProcessed': 'critical_error',
                            'experimentCurrentSchedule.statsProcessingError': error.message || 'Critical unhandled error during stats calculation/notification.'
                        });
                    } catch (updateError) {
                        logger.error(`checkForEndedExperimentsAndTriggerStats: Failed to update statsProcessed status to critical_error for ${userId}, experiment ${experimentId}`, updateError);
                    }
                });
                promises.push(processingPromise);
            }
        });

        await Promise.all(promises);
        logger.log(`checkForEndedExperimentsAndTriggerStats: Processing complete. ${processedCount} experiments processed.`);
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

function determineMaxReminders(frequencyString) {
    if (frequencyString === 'daily_1' || frequencyString === 'every_other_day') return 1;
    if (frequencyString === 'daily_2') return 2;
    if (frequencyString === 'daily_3') return 3;
    if (frequencyString === 'daily_4') return 4;
    return 0; // Default for 'none' or unknown
}

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
 * Scheduled function to check for and trigger user reminders.
 * Runs periodically (e.g., every 30 minutes).
 */
exports.sendScheduledReminders = onSchedule("every 55 minutes", async (event) => {
    logger.log("sendScheduledReminders: Scheduled function triggered.", event.scheduleTime);
    const db = admin.firestore();
    const now = new Date();
    const currentUTCHour = now.getUTCHours();
    const currentUTCMinute = now.getUTCMinutes();
    const currentUTCDayOfYear = getDayOfYear(now); // [cite: 824]

    try {
        const usersSnapshot = await db.collection('users').get();
        if (usersSnapshot.empty) {
            logger.log("sendScheduledReminders: No users found."); // [cite: 826]
            return null;
        }

        const reminderPromises = [];
        usersSnapshot.forEach(async userDoc => { // Add async here
            const userId = userDoc.id;
            const userData = userDoc.data();

            if (userData.experimentCurrentSchedule &&
                userData.experimentCurrentSchedule.remindersSkipped === false && // [cite: 827]
                userData.experimentCurrentSchedule.reminderFrequency &&
                userData.experimentCurrentSchedule.reminderFrequency !== 'none' && // [cite: 827]
                userData.experimentCurrentSchedule.experimentEndTimestamp &&
                userData.experimentCurrentSchedule.experimentEndTimestamp.toDate() > now) { // [cite: 827]

                const schedule = userData.experimentCurrentSchedule; // [cite: 827]
                
                // --- Step 2: Initialize Daily Tracking Variables ---
                const {
                    reminderWindowStartUTC, // [cite: 828]
                    reminderWindowEndUTC, // [cite: 828]
                    reminderFrequency, // [cite: 828]
                    lastReminderSentDayOfYearUTC, // [cite: 828]
                    remindersSentOnLastDay, // [cite: 829]
                    firstHalfReminderSentForDay: storedFirstHalfSent, // For Step 2 & 3
                    secondHalfReminderSentForDay: storedSecondHalfSent, // For Step 2 & 3
                    lastReminderSentEpochDayUTC // [cite: 835]
                } = schedule;

                if (typeof reminderWindowStartUTC !== 'number' || typeof reminderWindowEndUTC !== 'number') { // [cite: 830]
                    logger.warn(`sendScheduledReminders: User ${userId} has incomplete UTC reminder window settings. Skipping.`); // [cite: 830]
                    return; // to next userDoc
                }

                let actualRemindersSentToday;
                let firstHalfFlagForToday; // Tracks if a reminder has been sent/allocated to first half *today*
                let secondHalfFlagForToday; // Tracks if a reminder has been sent/allocated to second half *today*

                if (lastReminderSentDayOfYearUTC === currentUTCDayOfYear) {
                    actualRemindersSentToday = remindersSentOnLastDay || 0; // [cite: 833]
                    firstHalfFlagForToday = storedFirstHalfSent || false;
                    secondHalfFlagForToday = storedSecondHalfSent || false;
                } else {
                    actualRemindersSentToday = 0;
                    firstHalfFlagForToday = false;
                    secondHalfFlagForToday = false;
                }
                // --- End Step 2 Initialization ---

                const maxRemindersToday = determineMaxReminders(reminderFrequency); // [cite: 831]

                // 1. Limit Check
                if (actualRemindersSentToday >= maxRemindersToday) { // [cite: 834]
                    return; // Daily limit met
                }

                // 2. "Every other day" logic
                if (reminderFrequency === 'every_other_day') { // [cite: 834]
                    const currentEpochDayUTC = Math.floor(now.getTime() / (1000 * 60 * 60 * 24)); // [cite: 834]
                    const lastSentEpochDay = lastReminderSentEpochDayUTC; // From destructuring [cite: 835]

                    if (typeof lastSentEpochDay === 'number') {
                        if (currentEpochDayUTC === lastSentEpochDay) { // [cite: 836]
                            return; // Already sent on this epoch day
                        }
                        if (currentEpochDayUTC - lastSentEpochDay < 2) { // [cite: 837]
                            return; // Sent on the immediately preceding epoch day, so skip today
                        }
                    }
                }

                // 3. Magic Minute Window Hit Check
                let magicMinuteHit = false; // [cite: 838]
                for (const targetMin of MMW_TARGET_MINUTES) { // [cite: 839]
                    if (currentUTCMinute >= (targetMin - MMW_FLEXIBILITY) && currentUTCMinute <= (targetMin + MMW_FLEXIBILITY)) { // [cite: 839]
                        magicMinuteHit = true; // [cite: 839]
                        break;
                    }
                }
                if (!magicMinuteHit) { // [cite: 841]
                    return; // Not a magic minute time
                }

                // --- Step 1 & 3 Integration: Calculate Halves and Determine Current Half ---
                const windowHalves = getReminderWindowHalves(reminderWindowStartUTC, reminderWindowEndUTC);
                const currentHalf = getCurrentWindowHalf(currentUTCHour, windowHalves); // Can be 'first_half', 'second_half', 'outside_window', 'invalid_halves'
                
                if (currentHalf === 'invalid_halves' || currentHalf === 'outside_window') {
                    // logger.log(`User ${userId} is outside window or halves invalid. CurrentHalf: ${currentHalf}`);
                    return; // Not in a valid part of the window
                }
                // --- End Step 1 & 3 Integration ---

                // --- Step 3: Core Eligibility Logic based on Halves ---
                let sendThisReminder = false;

                if (maxRemindersToday === 1) {
                    // Deterministically pick a target half for the day
                    const targetHalfForSingle = ((currentUTCDayOfYear + parseInt(userId.slice(-1), 16)) % 2 === 0) ? 'first_half' : 'second_half';
                    if (currentHalf === targetHalfForSingle && actualRemindersSentToday === 0) {
                        sendThisReminder = true;
                    }
                } else if (maxRemindersToday >= 2) {
                    if (currentHalf === 'first_half' && !firstHalfFlagForToday) {
                        sendThisReminder = true; // Send the first reminder for the first half
                    } else if (currentHalf === 'second_half' && !secondHalfFlagForToday) {
                        sendThisReminder = true; // Send the first reminder for the second half
                    } else if (firstHalfFlagForToday && secondHalfFlagForToday) {
                        // Both halves have had their guaranteed reminder, send any remaining ones
                        if (actualRemindersSentToday < maxRemindersToday) {
                             sendThisReminder = true;
                        }
                    } else if ( (currentHalf === 'first_half' && firstHalfFlagForToday && !secondHalfFlagForToday && (maxRemindersToday - actualRemindersSentToday > 1 )) ||
                                (currentHalf === 'second_half' && secondHalfFlagForToday && !firstHalfFlagForToday && (maxRemindersToday - actualRemindersSentToday > 1 )) ) {
                        // Current half is done, other half is not, and we have enough reminders left to fill both and then some.
                        // This allows filling up more than the guaranteed 1 per half if maxReminders is > 2
                        if (actualRemindersSentToday < maxRemindersToday) {
                            sendThisReminder = true;
                        }
                    } else if ( (currentHalf === 'first_half' && !firstHalfFlagForToday && secondHalfFlagForToday && actualRemindersSentToday < maxRemindersToday) ||
                                (currentHalf === 'second_half' && !secondHalfFlagForToday && firstHalfFlagForToday && actualRemindersSentToday < maxRemindersToday) ){
                        // This case handles if one half is done, current MMW is in the other *undone* half
                        sendThisReminder = true;
                    }
                }
                
                if (!sendThisReminder) {
                    // logger.log(`User ${userId}, Freq: ${reminderFrequency}, SentToday: ${actualRemindersSentToday}/${maxRemindersToday}, CH: ${currentHalf}, FHDone: ${firstHalfFlagForToday}, SHDone: ${secondHalfFlagForToday}. No send.`);
                    return; // Conditions not met to send
                }
                // --- End Step 3 Core Logic ---

                logger.log(`sendScheduledReminders: User ${userId} PASSED ALL CHECKS. Attempting send. Freq: ${reminderFrequency}, SentToday(before): ${actualRemindersSentToday}/${maxRemindersToday}, CurrentHalf: ${currentHalf}, 1stHalfSent: ${firstHalfFlagForToday}, 2ndHalfSent: ${secondHalfFlagForToday}. Time: ${currentUTCHour}:${String(currentUTCMinute).padStart(2,'0')}`);
                

                // --- AI Personalization Step 1: Access settings & prepare input data ---
                let inputsForAI = []; // Initialize as an empty array
                const scheduledSettings = schedule.scheduledExperimentSettings;

                if (genAI && scheduledSettings) { // Only proceed if AI client and settings are available [cite: 39, 44, 849]
                    if (scheduledSettings.input1 && scheduledSettings.input1.label?.trim()) {
                        inputsForAI.push({ 
                            label: scheduledSettings.input1.label, 
                            unit: scheduledSettings.input1.unit || "" 
                        });
                    }
                    if (scheduledSettings.input2 && scheduledSettings.input2.label?.trim()) {
                        inputsForAI.push({ 
                            label: scheduledSettings.input2.label, 
                            unit: scheduledSettings.input2.unit || "" 
                        });
                    }
                    if (scheduledSettings.input3 && scheduledSettings.input3.label?.trim()) {
                        inputsForAI.push({ 
                            label: scheduledSettings.input3.label, 
                            unit: scheduledSettings.input3.unit || "" 
                        });
                    }

                    if (inputsForAI.length > 0) {
                        // For now, just log what we've collected.
                        // In a real scenario, this log might be too verbose for every user,
                        // but it's useful for this step-by-step confirmation.
                        logger.info(`[sendScheduledReminders - AI Step 1] User ${userId}: Prepared inputsForAI:`, JSON.stringify(inputsForAI));
                    } else {
                        // logger.info(`[sendScheduledReminders - AI Step 1] User ${userId}: No configured inputs found in scheduledSettings for AI prompt.`);
                    }
                } else {
                    // logger.info(`[sendScheduledReminders - AI Step 1] User ${userId}: genAI not available or no scheduledSettings. Skipping AI data prep.`);
                }
                // --- End AI Personalization Step 1 ---

                // --- AI Personalization Step 2: Construct LLM Prompt Text with Time Context ---
                let aiPromptText = ""; 

                if (genAI && scheduledSettings && inputsForAI.length > 0) {
                    let timeContextForPrompt = "It's currently a general time for the user.";
                    const userInitialUTCOffsetHours = schedule.initialUTCOffsetHours; // [cite: 420, 421]

                    if (typeof userInitialUTCOffsetHours === 'number') {
                        const userLocalHour = (currentUTCHour - userInitialUTCOffsetHours + 24) % 24;
                        
                        let localTimeOfDayCategory = "";
                        if (userLocalHour >= 5 && userLocalHour < 12) localTimeOfDayCategory = "morning";
                        else if (userLocalHour >= 12 && userLocalHour < 17) localTimeOfDayCategory = "afternoon";
                        else if (userLocalHour >= 17 && userLocalHour < 21) localTimeOfDayCategory = "evening";
                        else localTimeOfDayCategory = "night"; // Covers 21-23 and 0-4

                        // Determine position within their local reminder window
                        const localWindowStart = (schedule.reminderWindowStartUTC - userInitialUTCOffsetHours + 24) % 24;
                        const localWindowEnd = (schedule.reminderWindowEndUTC - userInitialUTCOffsetHours + 24) % 24;
                        const windowDuration = calculateWindowDuration(localWindowStart, localWindowEnd); // Assumes calculateWindowDuration is available

                        let positionInWindow = "in their reminder window";
                        if (windowDuration > 0 && windowDuration <= 24) { // Ensure valid duration
                            let hoursIntoWindow;
                            if (localWindowStart <= userLocalHour) { // Current hour is same day as window start
                                hoursIntoWindow = userLocalHour - localWindowStart;
                            } else { // Current hour is next day (window spanned midnight)
                                hoursIntoWindow = (24 - localWindowStart) + userLocalHour;
                            }

                            if (hoursIntoWindow < windowDuration / 3) positionInWindow = "early in their reminder window";
                            else if (hoursIntoWindow < (windowDuration * 2) / 3) positionInWindow = "midway through their reminder window";
                            else positionInWindow = "nearing the end of their reminder window";
                        }
                        
                        const formatHourForPrompt = (hour24) => {
                            const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
                            const period = hour24 < 12 || hour24 === 24 ? 'AM' : 'PM';
                             if (hour24 === 0) return '12AM (Midnight)';
                             if (hour24 === 12) return '12PM (Noon)';
                            return `${hour12}${period}`;
                        };

                        timeContextForPrompt = `It's currently ${localTimeOfDayCategory} for the user (around ${formatHourForPrompt(userLocalHour)} local time), ` +
                                               `and they are ${positionInWindow} (local window: ${formatHourForPrompt(localWindowStart)} - ${formatHourForPrompt(localWindowEnd)}).`;
                    }

                    const exampleActionsForPrompt = inputsForAI.map(inp => `- '${inp.label}'${inp.unit ? ` (unit: ${inp.unit})` : ''}`).join('\n');
                    let actionReferenceInstruction = "one of their daily habits below.";
                    if (inputsForAI.length === 1) {
                        actionReferenceInstruction = `their daily habit: '${inputsForAI[0].label}'.`;
                    } else if (inputsForAI.length === 2) {
                        actionReferenceInstruction = `their daily habits: '${inputsForAI[0].label}' or '${inputsForAI[1].label}'.`;
                    } else if (inputsForAI.length >= 3) {
                        const allLabels = inputsForAI.map(inp => `'${inp.label}'`).slice(0, 3).join(', ');
                        actionReferenceInstruction = `some of their daily habits, like ${allLabels}.`;
                    }

                    // Using your edited prompt structure and adding time context and instructions
                    aiPromptText = `
                    You are generating a short, personalized reminder message for a user doing self-experiments.
                    The message should be 1-3 sentences and under 200 characters.
                    The tone must be positive, funny, and/or inspiring. It should be memorable.

                    CONTEXT: ${timeContextForPrompt}

                    The user's current daily Habits (inputs) include:
                    ${exampleActionsForPrompt}

                    Your main goal is to encourage the user to find intrinsic joy, curiosity, or immediate, small rewards while performing ${actionReferenceInstruction}.
                    Focus on the experience of the action itself.
                    DO NOT mention their larger, overall goals (deeperProblem) or their progress on main outcome metrics.
                    DO NOT use phrases like "achieve your goals" or "make progress."

                    IMPORTANT TIME CONSIDERATIONS:
                    - Subtly tailor the message to reflect the time context provided above.
                    - If any of the user's actions (e.g., "${inputsForAI.map(i => i.label).join('/')}") seem strongly tied to a specific time of day (e.g., 'Morning Wakeup', 'Bedtime Routine'), ONLY mention them if the user's current local time of day is appropriate. Otherwise, focus on their other, more general actions or frame the reminder generally about doing something rewarding in their day without mentioning the time-specific action.

                    Creatively reference their specific actions. Vary whether you mention one, or multiple of their listed actions.
                    You can draw stylistic inspiration from these examples, but generate something novel and varied:
                    - "What if this ends up being your favorite part of today?"
                    - "There's a tiny reward hiding in this activity. Can you find it?"
                    - "This isn't self-discipline. It's self-discovery."
                    - "Forget the big goals. Make this moment just a little more rewarding."

                    Generate only the reminder message text. 1-3 sentences and under 200 characters.
                    `;
                    logger.info(`[sendScheduledReminders - AI Step 2 REV] User ${userId}: Constructed AI Prompt (Time-Aware):\n${aiPromptText}`);

                } else if (inputsForAI.length === 0 && genAI && scheduledSettings) {
                    // logger.info(`[sendScheduledReminders - AI Step 2 REV] User ${userId}: No inputsForAI, skipping AI prompt construction.`);
                }
                // --- End AI Personalization Step 2 with Time Context ---

                // --- AI Personalization Step 3: Make LLM API Call & Handle Response ---
                let finalReminderMessage = ""; // Will hold the message to be sent
                let usedAiMessage = false;     // Flag to track if AI message was successfully used

                // Condition to attempt AI generation: genAI client is ready, and we have a prompt
                if (genAI && aiPromptText && aiPromptText.trim() !== "") {
                    // logger.info(`[sendScheduledReminders - AI Step 3] User ${userId}: Attempting AI message generation.`); // Optional: can be verbose
                    try {
                        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Or "gemini-1.5-pro"
                        const generationResult = await model.generateContent({
                            contents: [{ role: "user", parts: [{text: aiPromptText}] }],
                            generationConfig: { 
                                ...GEMINI_CONFIG, // Spread global config [cite: 46]
                                temperature: 0.9, // Override temperature as requested
                                // Candidate count can be managed here if needed, but default is 1
                                // maxOutputTokens can also be set if the <200 char in prompt isn't strict enough
                                // For a 200 char message, ~50-70 tokens should be more than enough.
                                // Let's use the prompt for char limit first.
                            }, 
                        });
                        const response = await generationResult.response;
                        const candidateText = response.text()?.trim();

                        if (candidateText && candidateText.length > 0 && candidateText.length <= 200) { // Check length too
                            finalReminderMessage = candidateText;
                            usedAiMessage = true;
                            logger.info(`[sendScheduledReminders - AI Step 3] User ${userId}: AI message GENERATED & USED: "${finalReminderMessage}"`);
                        } else if (candidateText) {
                            logger.warn(`[sendScheduledReminders - AI Step 3] User ${userId}: AI generated text but it was empty or too long (length: ${candidateText.length}). Falling back. Text: "${candidateText}"`);
                        } else {
                            logger.warn(`[sendScheduledReminders - AI Step 3] User ${userId}: AI generation attempt resulted in no candidate text. Falling back.`);
                        }
                    } catch (aiError) {
                        logger.error(`[sendScheduledReminders - AI Step 3] User ${userId}: AI message generation FAILED. Error:`, aiError.message);
                        // Fallback will occur as usedAiMessage is false
                    }
                } else {
                    // logger.info(`[sendScheduledReminders - AI Step 3] User ${userId}: Skipping AI call (genAI not ready or no prompt text).`);
                }

                // Fallback logic: If AI wasn't used (or failed), use the default message system
                if (!usedAiMessage) {
                    const randomDefaultMessage = defaultReminderMessages[Math.floor(Math.random() * defaultReminderMessages.length)];
                    finalReminderMessage = randomDefaultMessage;
                    // Reuse scheduledSettings if already defined, or get it from schedule
                    const currentScheduledSettings = scheduledSettings || schedule.scheduledExperimentSettings; 

                    if (currentScheduledSettings) {
                        const activeInputLabelsForFallback = [];
                        if (currentScheduledSettings.input1?.label?.trim()) activeInputLabelsForFallback.push(currentScheduledSettings.input1.label);
                        if (currentScheduledSettings.input2?.label?.trim()) activeInputLabelsForFallback.push(currentScheduledSettings.input2.label);
                        if (currentScheduledSettings.input3?.label?.trim()) activeInputLabelsForFallback.push(currentScheduledSettings.input3.label);
                        
                        if (activeInputLabelsForFallback.length > 0) {
                            const randomInputLabel = activeInputLabelsForFallback[Math.floor(Math.random() * activeInputLabelsForFallback.length)];
                            finalReminderMessage = `${randomInputLabel}: ${randomDefaultMessage}`;
                        }
                    }
                    logger.info(`[sendScheduledReminders - AI Step 3] User ${userId}: Using FALLBACK message: "${finalReminderMessage}"`);
                }
                // --- End AI Personalization Step 3 ---

                const reminderDocId = db.collection('pendingReminderDMs').doc().id; // [cite: 855]
                
                // --- Step 4: Update Tracking Fields in Firestore Payload ---
                const updatePayload = {
                    'experimentCurrentSchedule.lastReminderSentDayOfYearUTC': currentUTCDayOfYear,
                    'experimentCurrentSchedule.remindersSentOnLastDay': actualRemindersSentToday + 1,
                    // Ensure flags are set to true, not incremented
                    'experimentCurrentSchedule.firstHalfReminderSentForDay': currentHalf === 'first_half' ? true : firstHalfFlagForToday,
                    'experimentCurrentSchedule.secondHalfReminderSentForDay': currentHalf === 'second_half' ? true : secondHalfFlagForToday,
                };
                // If it's a new day, the local flags (firstHalfFlagForToday, secondHalfFlagForToday) were already false.
                // So, if currentHalf is 'first_half', it correctly sets 'experimentCurrentSchedule.firstHalfReminderSentForDay' to true.
                // If currentHalf is 'second_half', it correctly sets 'experimentCurrentSchedule.secondHalfReminderSentForDay' to true.
                // If one was already true from a previous run *today*, it remains true.

                if (lastReminderSentDayOfYearUTC !== currentUTCDayOfYear) {
                    // If it's the first reminder of a new day, explicitly ensure both flags are set according to current send,
                    // and the other is reset (or remains false if not this half).
                    updatePayload['experimentCurrentSchedule.firstHalfReminderSentForDay'] = (currentHalf === 'first_half');
                    updatePayload['experimentCurrentSchedule.secondHalfReminderSentForDay'] = (currentHalf === 'second_half');
                }


                if (reminderFrequency === 'every_other_day') { // [cite: 856]
                    updatePayload['experimentCurrentSchedule.lastReminderSentEpochDayUTC'] = Math.floor(now.getTime() / (1000 * 60 * 60 * 24)); // [cite: 856]
                }
                // --- End Step 4 Payload ---

                const reminderPromise = db.collection('pendingReminderDMs').doc(reminderDocId).set({ // [cite: 857]
                    userId: userId,
                    userTag: userData.userTag || `User_${userId}`, // [cite: 857]
                    messageToSend: finalReminderMessage, 
                    experimentId: schedule.experimentId || null, // [cite: 858]
                    status: 'pending', // [cite: 858]
                    createdAt: admin.firestore.FieldValue.serverTimestamp(), // [cite: 858]
                }).then(() => {
                    logger.log(`sendScheduledReminders: Created pendingReminderDM ${reminderDocId} for user ${userId}.`); // [cite: 859]
                    return userDoc.ref.update(updatePayload); // [cite: 859]
                }).catch(err => {
                    logger.error(`sendScheduledReminders: Failed to write pendingReminderDM or update user doc for ${userId}`, err); // [cite: 859]
                });
                reminderPromises.push(reminderPromise); // [cite: 860]
            }
        });

        await Promise.all(reminderPromises); // [cite: 861, 862]
        logger.log(`sendScheduledReminders: Processing complete. Dispatched ${reminderPromises.length} potential reminders.`); // [cite: 862]
        return null;

    } catch (error) {
        logger.error("sendScheduledReminders: Overall error in scheduled function:", error); // [cite: 863, 864]
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
  logger.log("[fetchOrGenerateAiInsights] Function called. Request data:", request.data);

  // 1. Authentication & Validation
  if (!request.auth) {
    logger.warn("[fetchOrGenerateAiInsights] Unauthenticated access attempt.");
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  const userId = request.auth.uid;
  const userTagForLog = request.auth.token?.name || `User_${userId}`; // For logging

  if (!request.data || !request.data.targetExperimentId) {
    logger.warn(`[fetchOrGenerateAiInsights] Invalid argument: targetExperimentId missing for user ${userId}.`);
    throw new HttpsError('invalid-argument', 'The function must be called with a "targetExperimentId".');
  }
  const targetExperimentId = request.data.targetExperimentId;
  logger.info(`[fetchOrGenerateAiInsights] Processing request for user: ${userId} (${userTagForLog}), targetExperimentId: ${targetExperimentId}`);

  const db = admin.firestore();

  try {
    // 2. Data Fetching
    const targetExperimentStatsDocRef = db.collection('users').doc(userId).collection('experimentStats').doc(targetExperimentId);
    const targetExperimentStatsSnap = await targetExperimentStatsDocRef.get();

    if (!targetExperimentStatsSnap.exists) {
      logger.warn(`[fetchOrGenerateAiInsights] Target experiment stats document not found for user ${userId}, experiment ${targetExperimentId}.`);
      throw new HttpsError('not-found', 'Target experiment statistics not found. Please ensure the experiment has been processed.');
    }
    const targetExperimentStatsData = targetExperimentStatsSnap.data();
    logger.log(`[fetchOrGenerateAiInsights] Successfully fetched targetExperimentStatsData for ${targetExperimentId}.`);

    const userDocRef = db.collection('users').doc(userId);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists || !userDocSnap.data()?.experimentCurrentSchedule) {
      logger.warn(`[fetchOrGenerateAiInsights] User document or experimentCurrentSchedule not found for user ${userId}.`);
      // This could mean the user hasn't set up any experiments or there's a data consistency issue.
      // For caching logic, this is important. If it's missing, we might always regenerate, or handle as an error.
      // For now, let's assume if this is missing, we cannot reliably check cache freshness against global stats, so we might lean towards generation.
      // However, the primary caching key is aiInsightGeneratedAt on the experiment itself.
      // The global stats timestamp is more for invalidating if *other* things have changed globally for the user.
      // Let's proceed but log a warning. The core caching logic below will primarily rely on fields within targetExperimentStatsData.
      logger.warn(`[fetchOrGenerateAiInsights] User document or experimentCurrentSchedule not found for user ${userId}. Proceeding, but global stats timestamp for cache invalidation might be unavailable.`);
    }
    const experimentCurrentSchedule = userDocSnap.data()?.experimentCurrentSchedule;
    const latestGlobalStatsTimestamp = experimentCurrentSchedule?.statsCalculationTimestamp; // This is a Firestore Timestamp

    // 3. Caching Logic Implementation
    const cachedInsightText = targetExperimentStatsData.aiInsightText;
    const cachedInsightGeneratedAt = targetExperimentStatsData.aiInsightGeneratedAt; // This is a Firestore Timestamp

    // Condition to Serve Cache:
    // Serve cache if it exists AND (either no global stats timestamp is available OR the cache is newer than or same as global stats)
    // The primary check is simply if cachedInsightText and cachedInsightGeneratedAt exist.
    // The comparison to latestGlobalStatsTimestamp is a secondary check for invalidation if global stats processing has occurred.
    // If latestGlobalStatsTimestamp is undefined (e.g. experimentCurrentSchedule missing), we can't use it for invalidation.
    // In such a case, if cachedInsightText exists, we might serve it, or decide to always regenerate if global context is critical.
    // For MVP, let's simplify: if cache exists and was generated, and if global stats timestamp exists, compare them.
    // If global stats timestamp doesn't exist, but cache does, we can serve it.
    // If no cache exists, we generate.

    if (cachedInsightText && cachedInsightGeneratedAt) {
        let serveCache = true; // Assume we serve cache if it exists
        if (latestGlobalStatsTimestamp) { // Only if global timestamp exists, compare
            if (cachedInsightGeneratedAt.toMillis() < latestGlobalStatsTimestamp.toMillis()) {
                serveCache = false; // Cache is stale relative to global stats update
                logger.log(`[fetchOrGenerateAiInsights] Cache for experiment ${targetExperimentId} is stale (Generated: ${cachedInsightGeneratedAt.toDate().toISOString()}, Global Stats: ${latestGlobalStatsTimestamp.toDate().toISOString()}). Will regenerate.`);
            }
        }

        if (serveCache) {
            logger.log(`[fetchOrGenerateAiInsights] Serving cached insight for experiment ${targetExperimentId} for user ${userId}.`);
            return { success: true, insightsText: cachedInsightText, source: "cached" };
        }
    }

    // 4. If Generating New Insights (Cache Miss or Stale)
    logger.log(`[fetchOrGenerateAiInsights] Generating new insight for experiment ${targetExperimentId} for user ${userId}.`);

    if (!genAI) {
        logger.error("[fetchOrGenerateAiInsights] Gemini AI client (genAI) is not initialized. Cannot generate insights.");
        throw new HttpsError('internal', "The AI insights service is currently unavailable. Please try again later. (AI client not ready)");
    }

    // 4a. Data Preparation for Prompt
    const activeSettings = targetExperimentStatsData.activeExperimentSettings;
    const deeperProblem = activeSettings?.deeperProblem || "Not specified";
    const experimentEndDateISO = targetExperimentStatsData.experimentEndDateISO || "Unknown"; // ISO String
    const totalLogsProcessed = targetExperimentStatsData.totalLogsInPeriodProcessed || 0;
    // const experimentIdForPrompt = targetExperimentStatsData.experimentId || targetExperimentId; // Removed as per user request
    const expSettingsTimestamp = targetExperimentStatsData.experimentSettingsTimestamp || "Unknown"; // ISO String

    const calculatedMetrics = targetExperimentStatsData.calculatedMetricStats || {};
    const correlationsData = targetExperimentStatsData.correlations || {};
    const pairwiseInteractions = targetExperimentStatsData.pairwiseInteractionResults || {};
    const skippedMetricsData = targetExperimentStatsData.skippedMetrics || [];

    // Fetch User's Overall Streak Data
    const userMainDocSnap = await db.collection('users').doc(userId).get(); // Re-fetch user doc if needed, or use userDocSnap if fresh enough
    const userMainData = userMainDocSnap.data();
    const userOverallStreak = userMainData?.currentStreak || 0;
    const userOverallLongestStreak = userMainData?.longestStreak || 0;

    // Fetch Logs for Notes Summary
    let experimentNotesSummary = "No notes were found for this experiment period.";
    const experimentStartDateForNotes = targetExperimentStatsData.experimentSettingsTimestamp ? new Date(targetExperimentStatsData.experimentSettingsTimestamp) : null;
    const experimentEndDateForNotes = targetExperimentStatsData.experimentEndDateISO ? new Date(targetExperimentStatsData.experimentEndDateISO) : null;

    if (experimentStartDateForNotes && experimentEndDateForNotes && experimentStartDateForNotes < experimentEndDateForNotes) {
        try {
            const logsQuery = db.collection('logs')
                .where('userId', '==', userId)
                .where('timestamp', '>=', experimentStartDateForNotes)
                .where('timestamp', '<=', experimentEndDateForNotes) // Inclusive of end date for logs
                .orderBy('timestamp', 'asc');
            const logsSnapshot = await logsQuery.get();
            if (!logsSnapshot.empty) {
                const notesEntries = [];
                logsSnapshot.forEach(doc => {
                    const log = doc.data();
                    const logDate = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString() : (log.logDate || 'Unknown Date');
                    if (log.notes && typeof log.notes === 'string' && log.notes.trim() !== "") {
                        notesEntries.push(`- On ${logDate}: ${log.notes.trim()}`);
                    }
                });
                if (notesEntries.length > 0) {
                    experimentNotesSummary = "Key notes from this period:\n" + notesEntries.join("\n");
                }
                logger.log(`[fetchOrGenerateAiInsights] Fetched ${notesEntries.length} notes for experiment ${targetExperimentId}.`);
            } else {
                logger.log(`[fetchOrGenerateAiInsights] No logs with notes found for experiment ${targetExperimentId} in period ${experimentStartDateForNotes.toISOString()} to ${experimentEndDateForNotes.toISOString()}.`);
            }
        } catch (notesError) {
            logger.error(`[fetchOrGenerateAiInsights] Error fetching notes for experiment ${targetExperimentId}:`, notesError);
            experimentNotesSummary = "Could not retrieve notes for this period due to an error.";
        }
    } else {
        logger.warn(`[fetchOrGenerateAiInsights] Invalid or missing start/end dates for notes fetching for experiment ${targetExperimentId}. Start: ${experimentStartDateForNotes}, End: ${experimentEndDateForNotes}`);
    }


    const promptData = {
      deeperProblem,
      // experimentIdForPrompt, // Removed
      experimentEndDateISO,
      totalLogsProcessed,
      expSettingsTimestamp,
      calculatedMetrics,
      correlationsData,
      pairwiseInteractions,
      skippedMetricsData,
      userOverallStreak,
      userOverallLongestStreak,
      experimentNotesSummary,
      // MINIMUM_DATAPOINTS_FOR_METRIC_STATS is a global constant, INSIGHTS_PROMPT_TEMPLATE can access it directly or have it passed if preferred.
      // For simplicity, the template can reference the global one defined in this file.
    };
    logger.log(`[fetchOrGenerateAiInsights] Prepared promptData for experiment ${targetExperimentId}. Notes summary length: ${experimentNotesSummary.length}`);

    // 4b. Populate and Call Gemini
    const finalPrompt = INSIGHTS_PROMPT_TEMPLATE(promptData);
    // logger.debug(`[fetchOrGenerateAiInsights] Final prompt for Gemini for experiment ${targetExperimentId}:\n${finalPrompt}`); // Can be very verbose

    let newInsightsText = "";
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); // Or your preferred model
      const generationResult = await model.generateContent({
          contents: [{ role: "user", parts: [{text: finalPrompt}] }],
          generationConfig: GEMINI_CONFIG, // Defined at top of file
      });
      const response = await generationResult.response;
      newInsightsText = response.text();
      logger.log(`[fetchOrGenerateAiInsights] Successfully generated insights from Gemini for experiment ${targetExperimentId}. Text length: ${newInsightsText.length}`);
    } catch (geminiError) {
    // Enhanced logging:
    logger.error(`[fetchOrGenerateAiInsights] Gemini API call failed for experiment ${targetExperimentId}. Full Error Object:`, JSON.stringify(geminiError, Object.getOwnPropertyNames(geminiError)));
    logger.error(`[fetchOrGenerateAiInsights] Gemini API call failed. Error Message: ${geminiError.message}, Status: ${geminiError.status}, Details: ${JSON.stringify(geminiError.details)}`);

    if (geminiError.message && geminiError.message.includes('SAFETY')) {
        logger.warn(`[fetchOrGenerateAiInsights] Gemini content generation blocked due to safety settings for exp ${targetExperimentId}.`);
        return { success: false, message: "The AI couldn't generate insights for this data due to content restrictions. Please review your notes if they contain sensitive topics.", source: "generation_failed_safety" };
    }
    return { success: false, message: "I'm having trouble connecting to the AI to generate your insights at the moment. Please try again later.", source: "generation_failed" };
    }

    if (!newInsightsText || newInsightsText.trim() === "") {
        logger.warn(`[fetchOrGenerateAiInsights] Gemini generated empty insights text for experiment ${targetExperimentId}.`);
        return { success: false, message: "The AI generated an empty response. Please try again later.", source: "generation_empty" };
    }

    // 4c. Store New Insight in Firestore
    await targetExperimentStatsDocRef.update({
      aiInsightText: newInsightsText,
      aiInsightGeneratedAt: FieldValue.serverTimestamp()
    });
    logger.log(`[fetchOrGenerateAiInsights] Successfully stored new insight for experiment ${targetExperimentId} for user ${userId}.`);

    // 4d. Return New Insight
    return { success: true, insightsText: newInsightsText, source: "generated" };

  } catch (error) {
    // Outer Try-Catch for the entire function logic
    logger.error(`[fetchOrGenerateAiInsights] Critical error for user ${userId}, experiment ${targetExperimentId}:`, error);
    if (error instanceof HttpsError) {
      throw error; // Re-throw HttpsError instances directly
    }
    // For other errors, wrap in a generic HttpsError
    throw new HttpsError('internal', `An unexpected error occurred while processing AI insights for experiment ${targetExperimentId}. Details: ${error.message}`, {
        errorDetails: error.toString(), // Include more details for server logs
        userId: userId,
        experimentId: targetExperimentId
    });
  }
});

/**
 * Takes a user's "Deeper Wish" and generates five potential outcome metric labels
 * with suggested unit types and brief explanations using Gemini.
 *
 * Expected request.data: { userWish: string }
 * Returns: { success: true, suggestions: [{label: string, suggestedUnitType: string, briefExplanation: string}, ...] }
 * or { success: false, error: string, details?: any }
 */
exports.generateOutcomeLabelSuggestions = onCall(async (request) => {
  logger.log("[generateOutcomeLabelSuggestions] Function called. Request data:", request.data);

  // 1. Authentication & Validation
  if (!request.auth) {
    logger.warn("[generateOutcomeLabelSuggestions] Unauthenticated access attempt.");
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  const userId = request.auth.uid;

  if (!request.data || !request.data.userWish || typeof request.data.userWish !== 'string' || request.data.userWish.trim() === '') {
    logger.warn(`[generateOutcomeLabelSuggestions] Invalid argument: userWish missing or empty for user ${userId}.`);
    throw new HttpsError('invalid-argument', 'The function must be called with a non-empty "userWish".');
  }
  const userWish = request.data.userWish.trim();
  logger.info(`[generateOutcomeLabelSuggestions] Processing request for user: <span class="math-inline">\{userId\}, wish\: "</span>{userWish}"`);

  // 2. Check if Gemini Client is available
  if (!genAI) {
    logger.error("[generateOutcomeLabelSuggestions] Gemini AI client (genAI) is not initialized. Cannot generate suggestions.");
    throw new HttpsError('internal', "The AI suggestion service is currently unavailable. (AI client not ready)");
  }

  // 3. Construct Prompt for LLM
  const promptText = `
    Based on the user's "Deeper Wish": "${userWish}", your task is to generate five distinct and relevant potential "Outcome Metric Labels" that someone might track daily to see if they are making progress related to their wish.

    For each of the five suggestions, you MUST provide:
    1.  A "label": A clear, concise name for the outcome metric they will track daily (e.g., 'Overall Mood', 'Productive Hours', 'Sleep Quality', 'Feeling of Connection', 'Stress Level'). Max 25 characters.
    2.  A "suggestedUnitType": A very brief (1-3 words) suggested category for how this label might be measured (e.g., 'Rating Scale', 'Hours/Minutes', 'Yes/No', 'Count', 'Qualitative Note'). This type will guide further unit suggestions.
    3.  A "briefExplanation": A short (10-15 words) explanation of why this outcome metric could be relevant to the user's wish.

    The suggestions should be diverse if possible.
    Return ONLY a valid JSON array containing five objects, where each object represents an outcome metric suggestion and strictly follows the structure:
    { "label": "Example Label", "suggestedUnitType": "Example Unit Type", "briefExplanation": "Example explanation." }

    Your entire response should be a JSON array: [suggestion1, suggestion2, suggestion3, suggestion4, suggestion5]
    Do not include any other text or explanation outside of this JSON array. Ensure labels are 45 characters or less.
  `;

  logger.info(`[generateOutcomeLabelSuggestions] Sending prompt to Gemini for user ${userId}.`);

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const generationResult = await model.generateContent({
        contents: [{ role: "user", parts: [{text: promptText}] }],
        generationConfig: {
            ...GEMINI_CONFIG, // Your global Gemini config [cite: 967]
            temperature: 0.75, 
            responseMimeType: "application/json",
        },
    });

    const response = await generationResult.response;
    const responseText = response.text()?.trim();

    if (!responseText) {
        logger.warn(`[generateOutcomeLabelSuggestions] Gemini returned an empty response for user <span class="math-inline">\{userId\}, wish\: "</span>{userWish}".`);
        throw new HttpsError('internal', 'AI failed to generate suggestions (empty response).');
    }

    logger.info(`[generateOutcomeLabelSuggestions] Received raw response from Gemini for user ${userId}. Length: ${responseText.length}.`);

    let suggestions;
    try {
        suggestions = JSON.parse(responseText);
    } catch (parseError) {
        logger.error(`[generateOutcomeLabelSuggestions] Failed to parse Gemini JSON response for user ${userId}. Error: <span class="math-inline">\{parseError\.message\}\. Raw response\: "</span>{responseText}"`);
        throw new HttpsError('internal', `AI returned an invalid format. Could not parse suggestions. Details: ${parseError.message}`);
    }

    if (!Array.isArray(suggestions) || suggestions.length !== 5) {
        logger.error(`[generateOutcomeLabelSuggestions] Parsed response is not an array of 5 elements for user ${userId}. Parsed:`, suggestions);
        throw new HttpsError('internal', 'AI did not return five outcome suggestions as expected.');
    }

    for (const suggestion of suggestions) {
        if (!suggestion.label || !suggestion.suggestedUnitType || !suggestion.briefExplanation ||
            typeof suggestion.label !== 'string' || suggestion.label.length > 45 ||
            typeof suggestion.suggestedUnitType !== 'string' ||
            typeof suggestion.briefExplanation !== 'string') {
            logger.error(`[generateOutcomeLabelSuggestions] One or more suggestions have an invalid structure for user ${userId}. Suggestion:`, suggestion);
            throw new HttpsError('internal', 'AI returned suggestions with an invalid or incomplete structure.');
        }
    }

    logger.info(`[generateOutcomeLabelSuggestions] Successfully generated and parsed ${suggestions.length} outcome suggestions for user ${userId}.`);
    return { success: true, suggestions: suggestions };

  } catch (error) {
    logger.error(`[generateOutcomeLabelSuggestions] Error during Gemini API call or processing for user <span class="math-inline">\{userId\}, wish "</span>{userWish}":`, error);
    if (error instanceof HttpsError) {
        throw error;
    }
    if (error.message && error.message.toLowerCase().includes('safety')) {
        logger.warn(`[generateOutcomeLabelSuggestions] Gemini content generation blocked due to safety settings for user <span class="math-inline">\{userId\}, wish "</span>{userWish}".`);
        throw new HttpsError('resource-exhausted', "The AI couldn't generate suggestions for this wish due to content restrictions. Please try rephrasing your wish or try a different one.");
    }
    throw new HttpsError('internal', `Failed to generate AI suggestions due to a server error. Details: ${error.message}`);
  }
});

// Ensure GEMINI_CONFIG and genAI are initialized as in your functions/index.js file

/**
 * Takes a user's "Deeper Wish" and their chosen "Outcome Label",
 * and generates 3-5 specific unit suggestions for that outcome label using Gemini.
 *
 * Expected request.data: { userWish: string, chosenOutcomeLabel: string, outcomeLabelSuggestedUnitType?: string }
 * Returns: { success: true, unitSuggestions: [{unit: string, unitCategory: string}, ...] }
 * or { success: false, error: string, details?: any }
 */
exports.generateOutcomeUnitSuggestions = onCall(async (request) => {
  logger.log("[generateOutcomeUnitSuggestions] Function called. Request data:", request.data);

  // 1. Authentication & Validation
  if (!request.auth) {
    logger.warn("[generateOutcomeUnitSuggestions] Unauthenticated access attempt.");
    throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
  }
  const userId = request.auth.uid;

  if (!request.data || !request.data.userWish || typeof request.data.userWish !== 'string' || request.data.userWish.trim() === '' ||
      !request.data.chosenOutcomeLabel || typeof request.data.chosenOutcomeLabel !== 'string' || request.data.chosenOutcomeLabel.trim() === '') {
    logger.warn(`[generateOutcomeUnitSuggestions] Invalid argument: userWish or chosenOutcomeLabel missing/empty for user ${userId}.`);
    throw new HttpsError('invalid-argument', 'The function must be called with a non-empty "userWish" and "chosenOutcomeLabel".');
  }
  const userWish = request.data.userWish.trim();
  const chosenOutcomeLabel = request.data.chosenOutcomeLabel.trim();
  // Optional: outcomeLabelSuggestedUnitType for context to the AI
  const outcomeLabelSuggestedUnitType = request.data.outcomeLabelSuggestedUnitType || null;

  logger.info(`[generateOutcomeUnitSuggestions] Processing for user: <span class="math-inline">\{userId\}, wish\: "</span>{userWish}", outcome label: "<span class="math-inline">\{chosenOutcomeLabel\}", suggested unit type context\: "</span>{outcomeLabelSuggestedUnitType}"`);

  // 2. Check if Gemini Client is available
  if (!genAI) {
    logger.error("[generateOutcomeUnitSuggestions] Gemini AI client (genAI) is not initialized. Cannot generate unit suggestions.");
    throw new HttpsError('internal', "The AI suggestion service is currently unavailable. (AI client not ready)");
  }

  // 3. Construct Prompt for LLM
  const suggestedUnitTypeContext = outcomeLabelSuggestedUnitType ? `The user's chosen outcome label ("<span class="math-inline">\{chosenOutcomeLabel\}"\) was initially categorized by an AI as potentially measurable by a '</span>{outcomeLabelSuggestedUnitType}'. Use this as a hint for relevance, but still provide diverse, specific unit suggestions.` : "";

  const promptText = `
    The user has a "Deeper Wish": "<span class="math-inline">\{userWish\}"\. They have chosen to track the "Outcome Metric Label": "{chosenOutcomeLabel}". Your task is to generate 3 to 5 distinct, specific, and practical "Unit/Scale" suggestions for how the user could measure their chosen Outcome Metric Label ("{chosenOutcomeLabel}") daily.
    For each of the unit suggestions, you MUST provide:
    1.  A "unit": A specific, clear string describing the unit or scale (e.g., "1-10 satisfaction scale", "Hours slept", "Completed tasks", "Yes (1) / No (0)", "Energy level (0-10 or Low/Medium/High)"). Max 20 characters.
    2.  A "unitCategory": A very brief (1-3 words) classification of the unit type (e.g., "Scale", "Duration", "Count", "Binary", "Qualitative", "Categorical").

    The unit suggestions should be diverse and appropriate for the given Outcome Label. They should be actionable for daily tracking.
    Prioritize common and easy-to-understand measurement methods.

    Return ONLY a valid JSON array containing 3 to 5 objects, where each object represents a unit suggestion and strictly follows the structure:
    { "unit": "Example Unit/Scale", "unitCategory": "Example Category" }

    Your entire response should be a JSON array. Do not include any other text or explanation outside of this JSON array.
    Ensure the 'unit' strings are 70 characters or less.
  `;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const generationResult = await model.generateContent({
        contents: [{ role: "user", parts: [{text: promptText}] }],
        generationConfig: {
            ...GEMINI_CONFIG,
            temperature: 0.7,
            responseMimeType: "application/json",
        },
    });

    const response = await generationResult.response;
    const responseText = response.text()?.trim();

    if (!responseText) {
        logger.warn(`[generateOutcomeUnitSuggestions] Gemini returned an empty response for user <span class="math-inline">\{userId\}, label\: "</span>{chosenOutcomeLabel}".`);
        throw new HttpsError('internal', 'AI failed to generate unit suggestions (empty response).');
    }

    logger.info(`[generateOutcomeUnitSuggestions] Received raw response from Gemini for user ${userId}. Length: ${responseText.length}.`);

    let unitSuggestions;
    try {
        unitSuggestions = JSON.parse(responseText);
    } catch (parseError) {
        logger.error(`[generateOutcomeUnitSuggestions] Failed to parse Gemini JSON response for user ${userId}. Error: <span class="math-inline">\{parseError\.message\}\. Raw response\: "</span>{responseText}"`);
        throw new HttpsError('internal', `AI returned an invalid format. Could not parse unit suggestions. Details: ${parseError.message}`);
    }

    if (!Array.isArray(unitSuggestions) || unitSuggestions.length < 3 || unitSuggestions.length > 5) {
        logger.error(`[generateOutcomeUnitSuggestions] Parsed response is not an array of 3-5 elements for user ${userId}. Found ${unitSuggestions.length}. Parsed:`, unitSuggestions);
        throw new HttpsError('internal', 'AI did not return 3-5 unit suggestions as expected.');
    }

    for (const suggestion of unitSuggestions) {
        if (!suggestion.unit || !suggestion.unitCategory ||
            typeof suggestion.unit !== 'string' || suggestion.unit.length > 70 ||
            typeof suggestion.unitCategory !== 'string') {
            logger.error(`[generateOutcomeUnitSuggestions] One or more unit suggestions have an invalid structure for user ${userId}. Suggestion:`, suggestion);
            throw new HttpsError('internal', 'AI returned unit suggestions with an invalid or incomplete structure.');
        }
    }

    logger.info(`[generateOutcomeUnitSuggestions] Successfully generated and parsed ${unitSuggestions.length} unit suggestions for user ${userId}.`);
    return { success: true, unitSuggestions: unitSuggestions };

  } catch (error) {
    logger.error(`[generateOutcomeUnitSuggestions] Error during Gemini API call or processing for user <span class="math-inline">\{userId\}, label "</span>{chosenOutcomeLabel}":`, error);
    if (error instanceof HttpsError) {
        throw error;
    }
    if (error.message && error.message.toLowerCase().includes('safety')) {
        logger.warn(`[generateOutcomeUnitSuggestions] Gemini content generation blocked due to safety settings for user <span class="math-inline">\{userId\}, label "</span>{chosenOutcomeLabel}".`);
        throw new HttpsError('resource-exhausted', "The AI couldn't generate unit suggestions due to content restrictions. Please try a different outcome label if this persists.");
    }
    throw new HttpsError('internal', `Failed to generate AI unit suggestions due to a server error. Details: ${error.message}`);
  }
});


// Final blank line below this comment
