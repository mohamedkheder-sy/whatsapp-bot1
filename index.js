/**
 * AzharBot - Baileys based WhatsApp bot
 * - Uses useMultiFileAuthState to persist auth in ./auth_info
 * - Supports printing QR in terminal or requesting pairing code
 * - Health endpoint on GET / (default port 8000)
 * - Save credentials automatically
 * - Backoff reconnect on failures
 *
 * Configure via .env file (see .env.example)
 */

require('dotenv').config();
const { 
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  delay,
  fetchLatestBaileysVersion,
  Browsers
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require('express');
const fs = require('fs');
const path = require('path');

const log = pino({ level: process.env.LOG_LEVEL || "info" });

const app = express();
const port = process.env.PORT || 8000;

const SETTINGS = {
  phoneNumber: process.env.PHONE_NUMBER || "",    // مثال: +201066706529 أو 201066706529
  ownerName: process.env.OWNER_NAME || "Owner",
  botName: process.env.BOT_NAME || "AzharBot",
  printQRInTerminal: (process.env.PRINT_QR || "false") === "true", // true => show QR in terminal
  requestPairingCode: (process.env.REQUEST_PAIRING_CODE || "false") === "true" // true => attempt pairing code
};

if (!SETTINGS.phoneNumber) {
  log.warn("PHONE_NUMBER غير مضبوط في .env — إذا أردت استخدام pairing code أو روابط، اضبطه.");
}

// ensure auth_info folder exists or will be created by useMultiFileAuthState
const AUTH_DIR = path.resolve('./auth_info');

// state variables for backoff
let restarting = false;
let restartAttempts = 0;

/**
 * Start the WhatsApp bot socket
 */
async function startBot() {
  try {
    restarting = false;
    restartAttempts = 0;

    const { version } = await fetchLatestBaileysVersion();
    log.info(`Baileys protocol version: ${version.join('.')}`);

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
      version,
      logger: pino({ level: process.env.LOG_LEVEL || "silent" }),
      printQRInTerminal: SETTINGS.printQRInTerminal,
      browser: Browsers.macOS("Safari"),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      connectTimeoutMs: 60000,
      retryRequestDelayMs: 2000,
    });

    // if not registered, optionally request pairing code
    if (!sock.authState?.creds?.registered) {
      // wait a bit to let the socket initialize
      await delay(1500);

      if (SETTINGS.requestPairingCode) {
        try {
          const code = await sock.requestPairingCode(SETTINGS.phoneNumber);
          log.info("========================================");
          log.info(`Pairing CODE: ${code}`);
          log.info("========================================");
          log.info("افتح WhatsApp على الهاتف → Linked devices → Link a device ثم اتبع التعليمات لإدخال الكود.");
        } catch (err) {
          log.warn("طلب pairing code فشل:", err?.message || err);
          log.info("سيتم الاعتماد على QR أو الجلسة المحفوظة auth_info.");
        }
      } else {
        log.info("الجلسة غير مسجلة ولم يتم تفعيل pairing code. إذا أردت عرض QR ضع PRINT_QR=true في .env");
      }
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.reason || 'unknown';
        log.warn("Connection closed:", code);

        // if not logged out, attempt restart with backoff
        const loggedOut = (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) ||
                          (lastDisconnect?.error?.message && lastDisconnect.error.message.includes('logged out'));

        if (!loggedOut) {
          // exponential backoff up to a limit
          restartAttempts++;
          const waitSec = Math.min(60, 2 ** Math.min(restartAttempts, 6));
          log.info(`إعادة الاتصال بعد ${waitSec} ثانية (attempt ${restartAttempts})`);
          restarting = true;
          setTimeout(() => startBot().catch(e => log.error(e)), waitSec * 1000);
        } else {
          log.error("الحساب تم تسجيل خروجه (logged out). يتم حذف ��لجلسة auth_info.");
          try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch (e) {}
        }
      } else if (connection === 'open') {
        log.info('✅ Connected successfully to WhatsApp!');
      }
    });

    // simple message handler
    sock.ev.on('messages.upsert', async ({ messages }) => {
      try {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();

        log.info({ from: m.key.remoteJid, text }, "Incoming message");

        if (text === '.بنج') {
          await sock.sendMessage(m.key.remoteJid, { text: '🚀 شغال 100%!' }, { quoted: m });
          log.info("Replied to .بنج");
        }
      } catch (err) {
        log.error("Error handling message:", err);
      }
    });

    // save creds on update
    sock.ev.on('creds.update', saveCreds);

    // expose socket for later use if needed (not exported here)
    log.info("Bot started and listening for events.");

    return sock;

  } catch (err) {
    log.error("Fatal startBot error:", err);
    // attempt restart with backoff
    restartAttempts++;
    const waitSec = Math.min(60, 2 ** Math.min(restartAttempts, 6));
    log.info(`إعادة محاولة startBot بعد ${waitSec} ثانية`);
    setTimeout(() => startBot().catch(e => log.error(e)), waitSec * 1000);
  }
}

/**
 * Express simple health endpoint and info
 */
app.get('/', (req, res) => {
  res.send(`${SETTINGS.botName} active`);
});

app.listen(port, () => {
  log.info(`HTTP server listening on port ${port}`);
  startBot().catch(err => {
    log.error("startBot initial error:", err);
  });
});

/**
 * Keep process alive on unhandled errors but log them (recommended to monitor)
 */
process.on('uncaughtException', (err) => {
  log.error("Uncaught Exception (ignored):", err);
});
process.on('unhandledRejection', (err) => {
  log.error("Unhandled Rejection (ignored):", err);
});
