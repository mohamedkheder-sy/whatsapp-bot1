global.crypto = require('crypto');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion,
    delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

// =========================================================================
// رقمك المصري
const myPhoneNumber = "201066706529"; 
// =========================================================================

const SETTINGS = {
    botName: 'WhatsApp Bot',
    port: process.env.PORT || 3000
};

const AUTH_DIR = 'auth_info_baileys';
const app = express();
const log = pino({ level: 'silent' });

// دالة لحذف الجلسة القديمة
function clearSession() {
    try {
        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            console.log("🗑️ تم تنظيف الجلسة القديمة...");
        }
    } catch (e) {}
}

async function startBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
        version,
        logger: log,
        printQRInTerminal: false,
        mobile: false, 
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false
    });

    // إذا لم يكن مسجلاً، اطلب الكود
    if (!sock.authState.creds.registered) {
        
        // انتظار 10 ثواني
        console.log("⏳ انتظر 10 ثواني.. جهز هاتفك على شاشة إدخال الرقم...");
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(myPhoneNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
                
                console.log("\n\n================================================");
                console.log("📞 الكود الجديد هو:  👉  " + formattedCode + "  👈");
                console.log("================================================\n");
                
            } catch (err) {
                console.error("❌ فشل طلب الكود:", err);
            }
        }, 10000); 
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                clearSession();
                startBot();
            } else {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بـ WhatsApp بنجاح! 🚀');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;
            const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();
            if (text === '.بنج') {
                await sock.sendMessage(m.key.remoteJid, { text: '🚀 البوت يعمل!' }, { quoted: m });
            }
        } catch (err) {}
    });

    sock.ev.on('creds.update', saveCreds);
}

app.get('/', (req, res) => res.send('Bot is Running'));

app.listen(SETTINGS.port, () => {
    console.log(`🌍 Server running on port ${SETTINGS.port}`);
    // تنظيف الجلسة عند البداية فقط إذا لم نكن متصلين
    if (!fs.existsSync(AUTH_DIR)) clearSession();
    startBot();
});
