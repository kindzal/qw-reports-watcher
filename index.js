// index.js
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');
const express = require('express');

// === CONFIGURATION ===
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GOOGLE_WEBHOOK = process.env.GOOGLE_WEBHOOK; // your Apps Script /exec URL
const REPORTS_CHANNEL_NAME = process.env.REPORTS_CHANNEL_NAME; // channel name to watch
const PORT = process.env.PORT || 3000;

// Validation
if (!DISCORD_TOKEN || !GOOGLE_WEBHOOK || !REPORTS_CHANNEL_NAME) {
  console.error("Missing environment variables: DISCORD_TOKEN or GOOGLE_WEBHOOK or REPORTS_CHANNEL_NAME");
  process.exit(1);
}

// === Discord client setup ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

// Regex for Quakeworld URLs
const URL_REGEX = /https:\/\/hub\.quakeworld\.nu\/games\/\?gameId=\d+/g;

// Bot ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/**
 * Shared logic for message create & update
 */
async function handleMessage(message, isEdit = false) {
  try {
    if (!message) return;
    if (message.author?.bot) return;
    if (message.channel?.name !== REPORTS_CHANNEL_NAME) return;

    const text = message.content || '';
    const matches = text.match(URL_REGEX);
    if (!matches || matches.length === 0) return;

    // Deduplicate and limit 10
    const urls = Array.from(new Set(matches)).slice(0, 10);

    console.log(
      `${isEdit ? 'Edit' : 'New'} message: found ${urls.length} URLs from ${message.author.tag}`
    );

    // POST to Google Apps Script endpoint
    const payload = { urls };
    await axios.post(GOOGLE_WEBHOOK, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    // React accordingly
    await message.react(isEdit ? "🔄" : "✅");
    console.log(`Posted URLs to Google Sheet successfully`);
  } catch (err) {
    console.error(
      'Error posting URLs:',
      err?.response?.data || err.message || err
    );

    // Failure reaction (best-effort)
    try {
      await message.react("❌");
    } catch (_) {}
  }
}

// New messages
client.on('messageCreate', async (message) => {
  await handleMessage(message, false);
});

// Edited messages
client.on('messageUpdate', async (oldMessage, newMessage) => {
  // Ignore embed-only or no-op edits
  if (!newMessage?.content) return;
  if (oldMessage?.content === newMessage.content) return;

  await handleMessage(newMessage, true);
});

// Login to Discord
client.login(DISCORD_TOKEN).catch(err => {
  console.error('Discord login failed:', err);
  process.exit(1);
});

// === Minimal HTTP server for uptime ping ===
const app = express();

app.get('/', (req, res) => {
  res.send('Reports Watcher bot is running!');
});

app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT} (UptimeRobot friendly)`);
});
