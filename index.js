// تعريف مكتبة التشفير بشكل عام لحل مشكلة ReferenceError
global.crypto = require('crypto');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

const SETTINGS = {
    botName: 'WhatsApp Bot',
    port: process.env.PORT || 3000
};

const AUTH_DIR = 'auth_info_baileys';
const app = express();
const log = pino({ level: 'silent' });

let restartAttempts = 0;

// دالة لحذف الجلسة الفاسدة
function clearSession() {
    try {
        if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
            console.log("🗑️ تم حذف ملفات الجلسة القديمة لبدء اتصال نظيف.");
        }
    } catch (e) {
        console.error("خطأ في حذف الجلسة:", e);
    }
}

async function startBot() {
    // جلب أحدث نسخة من واتساب ويب
    const { version } = await fetchLatestBaileysVersion();
    console.log(`نسخة واتساب المستخدمة: v${version.join('.')}`);

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
        version,
        logger: log,
        printQRInTerminal: true, // ضروري لظهور الباركود
        auth: state,
        // استخدام متصفح Ubuntu لضمان التوافق
        browser: Browsers.ubuntu('Chrome'),
        syncFullHistory: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log("⚠️ امسح الباركود بسرعة! (QR Code generated)");
        }

        if (connection === 'close') {
            const reason = lastDisconnect.error?.output?.statusCode;
            console.log(`❌ انقطع الاتصال. السبب: ${reason} | ${lastDisconnect.error}`);

            if (reason === DisconnectReason.loggedOut) {
                console.log("🔒 تم تسجيل الخروج. جاري حذف الجلسة...");
                clearSession();
                startBot();
            } else if (reason === DisconnectReason.badSession) {
                console.log("📂 ملف الجلسة معطوب. جاري الحذف وإعادة التشغيل...");
                clearSession();
                startBot();
            } else {
                // إعادة المحاولة
                restartAttempts++;
                const waitSec = Math.min(60, 2 ** Math.min(restartAttempts, 6));
                console.log(`🔄 إعادة المحاولة بعد ${waitSec} ثانية...`);
                setTimeout(startBot, waitSec * 1000);
            }
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بـ WhatsApp بنجاح! 🚀');
            restartAttempts = 0;
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;
            const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();

            if (text === '.بنج') {
                await sock.sendMessage(m.key.remoteJid, { text: '🚀 البوت شغال وسريع!' }, { quoted: m });
            }
        } catch (err) {
            console.error("خطأ في قراءة الرسالة:", err);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// السيرفر
app.get('/', (req, res) => res.send('Bot is Running'));
app.listen(SETTINGS.port, () => {
    console.log(`🌍 Server running on port ${SETTINGS.port}`);
    
    // في أول تشغيل، سنحذف الجلسة لضمان ظهور الباركود
    if (restartAttempts === 0) clearSession();

    startBot();
});

// منع توقف البوت عند الأخطاء المفاجئة
process.on('uncaughtException', (err) => console.error("Uncaught Exception:", err));
process.on('unhandledRejection', (err) => console.error("Unhandled Rejection:", err));
});

// منع توقف البوت عند الأخطاء المفاجئة
process.on('uncaughtException', (err) => console.error("Uncaught Exception:", err));
process.on('unhandledRejection', (err) => console.error("Unhandled Rejection:", err));
