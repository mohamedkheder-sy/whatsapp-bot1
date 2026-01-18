// تعريف مكتبة التشفير (مهم جداً)
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
// 🟢 تم وضع رقمك هنا
const myPhoneNumber = "201066706529"; 
// =========================================================================

const SETTINGS = {
    botName: 'WhatsApp Bot',
    port: process.env.PORT || 3000
};

const AUTH_DIR = 'auth_info_baileys';
const app = express();
const log = pino({ level: 'silent' });

let restartAttempts = 0;

function clearSession() {
    try {
        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            console.log("🗑️ تم تنظيف الجلسة القديمة.");
        }
    } catch (e) {}
}

async function startBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
        version,
        logger: log,
        printQRInTerminal: false, // ❌ إيقاف الباركود
        mobile: false, 
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false
    });

    // كود طلب الربط (Pairing Code)
    if (!sock.authState.creds.registered) {
        
        // ننتظر 4 ثواني للتأكد من الاتصال
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(myPhoneNumber);
                const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
                
                console.log("\n\n================================================");
                console.log("📞 رمز الربط الخاص بك هو:  👉  " + formattedCode + "  👈");
                console.log("================================================\n");
                console.log("⚠️ اذهب لواتساب في هاتفك -> الأجهزة المرتبطة -> ربط جهاز -> (في الأسفل) الربط برقم الهاتف");
                console.log("✍️ واكتب الرمز الظاهر في الأعلى.");
                
            } catch (err) {
                console.error("❌ فشل طلب رمز الربط (تأكد أن الرقم صحيح ويعمل):", err);
            }
        }, 4000);
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            console.log(`❌ انقطع الاتصال (${reason}). إعادة المحاولة...`);

            if (reason === DisconnectReason.loggedOut) {
                console.log("🔒 تم تسجيل الخروج. جاري حذف الجلسة لطلب كود جديد...");
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
                await sock.sendMessage(m.key.remoteJid, { text: '🚀 البوت يعمل بنجاح!' }, { quoted: m });
            }
        } catch (err) {}
    });

    sock.ev.on('creds.update', saveCreds);
}

app.get('/', (req, res) => res.send('Bot is Running with Pairing Code'));

app.listen(SETTINGS.port, () => {
    console.log(`🌍 Server running on port ${SETTINGS.port}`);
    // حذف الجلسة عند البداية فقط إذا لم نكن متصلين، لضمان طلب الكود
    if (!fs.existsSync(AUTH_DIR)) clearSession();
    startBot();
});
