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

// Add this block after your initial require statements

const { initializeApp } = require("firebase/app");
const { getAuth, signInWithCustomToken } = require("firebase/auth");
const { getFunctions, httpsCallable } = require("firebase/functions"); // Ensure this is imported

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
  console.log("🧠 generateInsights received:", JSON.stringify(structuredData, null, 2));
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


const INSIGHTS_PROMPT_TEMPLATE = (data) => {
  // Helper to format a single stats summary for the prompt (No changes needed here)
  const formatSummary = (summary, index) => {
    // Basic check if summary object is valid
    if (!summary || typeof summary !== 'object') return `  Summary ${index + 1}: Not Available\n`;
    const generatedDateObj = summary.summaryGeneratedAt ? new Date(summary.summaryGeneratedAt) : null;
    const generatedDate = generatedDateObj instanceof Date && !isNaN(generatedDateObj) ? generatedDateObj.toLocaleDateString() : 'Unknown Date';
    let text = `  Summary ${index + 1} (Generated: ${generatedDate}):\n`;
    if (summary.priorities && Array.isArray(summary.priorities) && summary.priorities.length > 0) {
      summary.priorities.forEach(p => {
        if (p && typeof p === 'object') {
          const metrics = p.metrics || {};
          text += `    - ${p.label || 'N/A'} (${p.unit || 'N/A'}): Avg ${metrics.average ?? 'N/A'}, Var ${metrics.variation ?? 'N/A'}%\n`;
        }
      });
    } else { text += `    - No priority stats available for this summary.\n`; }
    if (summary.correlations && Array.isArray(summary.correlations) && summary.correlations.length > 0) {
      text += `    - Correlations vs Satisfaction:\n`;
      summary.correlations.forEach(c => {
         if (c && typeof c === 'object') { text += `      * ${c.priority || 'N/A'}: ${c.interpretation || 'N/A'}\n`; }
      });
    }
    return text;
  };

  // Safely access data (No changes needed here)
  const userMetrics = data?.userMetrics || {};
  const periodDays = userMetrics.periodDays || 'Unknown';
  const currentStreak = userMetrics.currentStreak ?? 0;
  const longestStreak = userMetrics.longestStreak ?? 0;
  const notes = data?.notes || [];
  const pastSummaries = data?.pastFourStatsSummaries || [];

  // Construct the prompt with refined instructions
  return `Analyze the user's habit tracking data (last ${periodDays} logs) with a supportive, growth-focused tone. The goal is to provide insights that inspire the user to continue their journey of consistent small actions and encourage thoughtful experimentation with tweaks to make these actions easier and more impactful. Keep the total response concise (under 1890 characters).

Data Overview:
- User Metrics: Current Streak ${currentStreak}, Longest ${longestStreak}
- Period Analyzed: ${periodDays} logs, ending ${new Date().toLocaleDateString()}
- Last 4 Weekly Stats Summaries (Newest First):
${(pastSummaries.length > 0)
  ? pastSummaries.map(formatSummary).join('\n')
  : '  No past stats summaries available.'
}
- Notes from the last ${periodDays} logs:
${(notes.length > 0)
  ? notes.map(n => `  • ${n?.date || 'Unknown Date'}: ${n?.content || ''}`).join('\n')
  : '  No notes available for this period.'
}

// This replaces the part starting "Provide analysis in three sections:"
// in the INSIGHTS_PROMPT_TEMPLATE function in index.js

Provide analysis in three sections:

### 🫂 Challenges & Consistency
Review their journey, focusing on friction points and consistency patterns across the weekly summaries and notes.
- Pinpoint recurring friction points or areas where consistency fluctuates, using both notes and weekly summary data (e.g., high metric variation).
- **If possible, connect these friction points directly to specific phrases or feelings the user expressed in their notes around that time.** (e.g., 'The lower consistency for [Metric X] around [Date] might relate to when you mentioned feeling "[Quote from note]"').
- Notice patterns in their consistency: *When* do they seem most consistent or inconsistent according to the data and notes?
- Where does their effort seem persistent, even if results vary? Validate this effort clearly.
- Acknowledge any struggles mentioned with compassion and normalize their struggles as part of the experimentation process.

### 🌱 Growth Highlights
Highlight evidence of growth, adaptation, and the impact of sustained effort by analyzing patterns across the 4 summaries and notes. Start by celebrating their consistency (mention current streak if known) and the most significant positive trend or achievement observed.
- Are priorities or their measured outcomes (average, variation) trending positively or negatively across the weeks? How has their focus evolved (e.g., changes in tracked priority labels/units visible in summaries)?
- Point out any potentially interesting (even if subtle) connections observed between metric trends and themes found in the notes.
- Look for subtle shifts in language in notes, "hidden wins" (e.g., maintaining effort despite challenges), or emerging positive patterns that signal progress.
- **Also, select 1-2 particularly insightful or representative short quotes directly from the provided 'Notes' that capture a key moment of learning, challenge, or success during this period, and weave them into your analysis where relevant (citing the date if possible).**
- How are their consistent small actions leading to evolution, as seen in the weekly data and reflections?

### 🧪 Experiments & Metaphor
Remember, small, sustainable adjustments often lead to the biggest long-term shifts. Suggest 2-3 small, actionable experiments (tweaks) for the upcoming week, designed to make their current positive actions easier, more consistent, or slightly more impactful, based on the analysis above. Frame these as curious explorations, not fixes. Experiments should aim to:
1. Build on momentum from positive trends or consistent efforts identified in the 'Growth Highlights' section.
2. Directly address the friction points or consistency challenges identified in the 'Challenges' section by suggesting small modifications.
3. **Prioritize suggesting experiments that directly explore questions, ideas, or 'what ifs' explicitly mentioned in the user's recent notes.** (Quote the relevant part of the note briefly if it helps frame the experiment).
4. Focus on *adjustments* to existing routines/habits rather than introducing entirely new, large habits.

**Finally, conclude with a single, concise metaphor *that specifically reflects the key challenge or transformation discussed in this user's analysis*. *If possible, subtly draw inspiration for the metaphor's theme from recurring concepts or tones found in the user's notes.* ** (Examples: "Your journey this month feels like a sculptor refining their work..." or "You've been like a scientist carefully adjusting variables...").

Keep the total response under 1890 characters.`;
};

// >>>>> End of replacement block <<<<<


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
            .setTitle('Fuel Your Experiment');

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
          // Defer immediately for better UX
          await interaction.deferReply({ ephemeral: true });

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
              ephemeral: true
            });

          } catch (error) {
            // Catch errors from callFirebaseFunction (auth errors, function execution errors, network errors)
            console.error(`Error executing /leaderboard for user ${interaction.user.id}:`, error);
            await interaction.editReply({
              // Display the error message thrown by callFirebaseFunction or the catch block above
              content: `❌ Could not retrieve leaderboard. ${error.message || 'Please try again later.'}`,
              ephemeral: true
            });
          }
          // --- End of new code ---
          break; // Ensure break statement is present
        } // End case 'leaderboard'

        case 'setweek': {
          let acknowledged = false;

         try {
        const modal = new ModalBuilder()
          .setCustomId('weeklyPriorities')
          .setTitle('Set Weekly Priorities');
      
         const inputLabels = [
        'Input 1 (e.g. "Meditation, minutes")',
        'Input 2 (e.g. "Reading, pages")',
        'Input 3 (e.g. "Walking, steps")'
      ];
      
      for (let i = 1; i <= 3; i++) {
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(`priority${i}`)
              .setLabel(inputLabels[i - 1]) // Use the array for specific examples
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      }
      
        // Add the output field (outside the loop!)
        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('output')
              .setLabel('Output of your next experiment')
              .setPlaceholder('e.g. "Satisfaction, Optimism, progress"')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      
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
          console.log("💡 Reached insights command handler");
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

          if (!result?.data?.priorities) {
            console.error("🧨 Unexpected result structure:", JSON.stringify(result, null, 2));
            await interaction.editReply({
              content: "⚠️ No priorities found in response.",
            });
            return;
          }

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

         console.log("📦 Full result from GAS:", JSON.stringify(result));
         console.log("🎯 generateInsights called with:", JSON.stringify(result.data));
      
      const aiResult = await generateInsights(result.data);
      
      if (!aiResult.success) {
        return await interaction.editReply({
          content: `❌ ${aiResult.error || 'Failed to generate AI insights'}`,
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
                structuredData: result.data,
                aiText: aiResult.insights,
                dataPoints: result.data.userMetrics.dataPoints
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
      const parsedValue = parseFloat(value); // Try converting string to number (allows decimals)
      if (isNaN(parsedValue)) { // Check if the result is Not-a-Number (catches text, empty, spaces)
        // Interaction already deferred earlier in this handler (line 148 assumed)
        return await interaction.editReply({ // Use editReply since interaction is deferred
          content: `❌ Value for Priority ${i} must be a number (e.g., 8, 8.5, 150). You entered: "${value}"`,
          ephemeral: true // Keep ephemeral flag
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