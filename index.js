import { Client, GatewayIntentBits } from "discord.js";
import fetch from "node-fetch";
import express from "express";

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GOOGLE_WEBHOOK = process.env.GOOGLE_WEBHOOK;
const REPORTS_CHANNEL_NAME = process.env.REPORTS_CHANNEL_NAME;

if (!DISCORD_TOKEN || !GOOGLE_WEBHOOK || !REPORTS_CHANNEL_NAME) {
  console.error("Missing required environment variables");
  process.exit(1);
}

/* -------------------- Discord Client -------------------- */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

/* -------------------- Helpers -------------------- */

function extractValidUrls(text) {
  const regex = /https:\/\/hub\.quakeworld\.nu\/games\/\?gameId=\S+/g;
  return text.match(regex) || [];
}

async function sendUrlsToGoogle(urls) {
  await fetch(GOOGLE_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls }),
  });
}

async function safeReact(message, emoji) {
  try {
    await message.react(emoji);
  } catch (err) {
    console.warn(`Failed to react with ${emoji}:`, err.message);
  }
}

/* -------------------- Core Processing -------------------- */

async function processMessage(message) {
  if (!message) return { ok: false };
  if (message.author?.bot) return { ok: false };
  if (!message.content) return { ok: false };

  if (message.channel?.name !== REPORTS_CHANNEL_NAME) {
    return { ok: false };
  }

  const urls = extractValidUrls(message.content);
  if (urls.length === 0) {
    return { ok: false, reason: "no_urls" };
  }

  await sendUrlsToGoogle(urls);
  return { ok: true, count: urls.length };
}

/* -------------------- Event Handlers -------------------- */

// New messages
client.on("messageCreate", async (message) => {
  try {
    const result = await processMessage(message);
    if (result.ok) {
      await safeReact(message, "✅");
	  console.log(`Posted new URLs to Google Sheet successfully`);
    }
  } catch (err) {
    console.error("messageCreate failed:", err);
    await safeReact(message, "❌");
  }
});

// Message edits
client.on("messageUpdate", async (oldMessage, newMessage) => {
  if (!newMessage?.content) return;
  if (oldMessage?.content === newMessage.content) return;

  try {
    const result = await processMessage(newMessage);
    if (result.ok) {
      await safeReact(newMessage, "🔄");
	  console.log(`Posted updated URLs to Google Sheet successfully`);
    }
  } catch (err) {
    console.error("messageUpdate failed:", err);
    await safeReact(newMessage, "❌");
  }
});

/* -------------------- Login -------------------- */

client.once("ready", () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  console.log(`Watching channel: #${REPORTS_CHANNEL_NAME}`);
});

client.login(DISCORD_TOKEN);

/* -------------------- Keepalive Server -------------------- */

const app = express();
app.get("/", (req, res) => {
  res.send("Quakeworld Reports Watcher is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Keepalive server listening on port ${PORT}`);
});
