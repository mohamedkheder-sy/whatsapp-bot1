const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    makeInMemoryStore
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const express = require('express');

// إعدادات البوت والسيرفر
const SETTINGS = {
    botName: 'WhatsApp Bot',
    port: process.env.PORT || 3000
};

// إعداد ملف الجلسة
const AUTH_DIR = 'auth_info_baileys';
const app = express();
const log = pino({ level: 'silent' }); // اجعلها 'info' لرؤية تفاصيل أكثر

let restartAttempts = 0;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const sock = makeWASocket({
        logger: log,
        printQRInTerminal: true, // طباعة الباركود في التيرمينال
        auth: state,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false
    });

    // التعامل مع تحديثات الاتصال
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut);
            
            if (shouldReconnect) {
                restartAttempts++;
                // حساب وقت الانتظار بناءً على عدد المحاولات (لمنع التكرار السريع جداً)
                const waitSec = Math.min(60, 2 ** Math.min(restartAttempts, 6));
                console.log(`❌ انقطع الاتصال. إعادة المحاولة بعد ${waitSec} ثانية...`);
                
                setTimeout(() => startBot().catch(e => console.error(e)), waitSec * 1000);
            } else {
                console.log("⚠️ تم تسجيل الخروج من الجهاز (Logged Out). يرجى مسح ملف الجلسة وإعادة مسح الباركود.");
                try { 
                    fs.rmSync(AUTH_DIR, { recursive: true, force: true }); 
                } catch (e) {
                    console.error("خطأ في حذف ملف الجلسة:", e);
                }
                // يمكن إيقاف العملية هنا أو إعادة التشغيل لانتظار مسح جديد
                // process.exit(0); 
            }
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بـ WhatsApp بنجاح!');
            restartAttempts = 0; // تصفير العداد عند النجاح
        }
    });

    // التعامل مع الرسائل القادمة
    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;

            const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();

            // طباعة الرسالة في السجل (اختياري)
            // console.log(`📩 رسالة من ${m.key.remoteJid}: ${text}`);

            if (text === '.بنج') {
                await sock.sendMessage(m.key.remoteJid, { text: '🚀 شغال 100%!' }, { quoted: m });
            }
        } catch (err) {
            console.error("Error handling message:", err);
        }
    });

    // حفظ بيانات الاعتماد عند التحديث
    sock.ev.on('creds.update', saveCreds);

    return sock;
}

// تشغيل السيرفر للحفاظ على البوت نشطاً في Koyeb
app.get('/', (req, res) => {
    res.send(`${SETTINGS.botName} is active and running!`);
});

app.listen(SETTINGS.port, () => {
    console.log(`🌍 Server listening on port ${SETTINGS.port}`);
    // بدء تشغيل البوت
    startBot().catch(err => console.error("Fatal Error starting bot:", err));
});

// التعامل مع الأخطاء غير المتوقعة لمنع توقف البوت
process.on('uncaughtException', (err) => {
    console.error("Uncaught Exception (ignored):", err);
});

process.on('unhandledRejection', (err) => {
    console.error("Unhandled Rejection (ignored):", err);
});
