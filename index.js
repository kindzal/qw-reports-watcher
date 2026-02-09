// index.js
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const axios = require('axios');
const express = require('express');

// === CONFIGURATION ===
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GOOGLE_WEBHOOK = process.env.GOOGLE_WEBHOOK;
const REPORTS_CHANNEL_NAME = process.env.REPORTS_CHANNEL_NAME;
const SCHEDULED_GAMES_CHANNEL_NAME = process.env.SCHEDULED_GAMES_CHANNEL_NAME;
const PORT = process.env.PORT || 3000;

if (!DISCORD_TOKEN || !GOOGLE_WEBHOOK || !REPORTS_CHANNEL_NAME) {
  console.error("Missing required environment variables");
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

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

/**
 * Handle Reports Channel (existing behavior)
 */
async function handleReports(message, isEdit) {
  const text = message.content || '';
  const matches = text.match(URL_REGEX);
  if (!matches?.length) return;

  const urls = Array.from(new Set(matches)).slice(0, 10);

  await axios.post(
    `${GOOGLE_WEBHOOK}?action=reports`,
    { urls },
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );

  await message.react(isEdit ? "🔄" : "✅");
}

/**
 * Handle Scheduled Games Channel
 */
async function handleScheduledGame(message, isEdit) {
  const roles = message.mentions.roles;

  // Must mention exactly 2 roles
  if (roles.size < 2) {
    await message.react("⚠️");
    return;
  }

  const roleMentions = roles.map(r => ({
    id: r.id,
    name: r.name
  }));

  const payload = {
    content: message.content,
    roles: roleMentions,
    author: message.author.tag,
    messageId: message.id,
    createdAt: message.createdAt.toISOString(),
    edited: isEdit
  };

  await axios.post(
    `${GOOGLE_WEBHOOK}?action=schedule`,
    payload,
    { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
  );

  await message.react(isEdit ? "🔄" : "📅");
}

/**
 * Shared handler
 */
async function handleMessage(message, isEdit = false) {
  try {
    if (!message || message.author?.bot) return;

    const channelName = message.channel?.name;

    if (channelName === REPORTS_CHANNEL_NAME) {
      await handleReports(message, isEdit);
    }

    if (
      SCHEDULED_GAMES_CHANNEL_NAME &&
      channelName === SCHEDULED_GAMES_CHANNEL_NAME
    ) {
      await handleScheduledGame(message, isEdit);
    }

  } catch (err) {
    console.error(err?.response?.data || err.message || err);
    try { await message.react("❌"); } catch (_) {}
  }
}

// Events
client.on('messageCreate', msg => handleMessage(msg, false));
client.on('messageUpdate', (oldMsg, newMsg) => {
  if (!newMsg?.content || oldMsg?.content === newMsg.content) return;
  handleMessage(newMsg, true);
});

client.login(DISCORD_TOKEN);

// === Minimal HTTP server ===
const app = express();
app.get('/', (_, res) => res.send('Bot running'));
app.listen(PORT, () => {
  console.log(`HTTP server listening on ${PORT}`);
});
