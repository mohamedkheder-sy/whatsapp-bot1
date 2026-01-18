/**
 * بوت واتساب متكامل - متوافق مع Replit و Koyeb
 * يتضمن إصلاحات المنفذ (Port 5000) وعنوان السيرفر (0.0.0.0)
 */

const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    makeCacheableSignalKeyStore,
    delay,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require('express');
const fs = require('fs');
const crypto = require("crypto");

global.crypto = crypto;

const app = express();
// التعديل الأول: استخدام منفذ 5000 كخيار افتراضي (مفضل في Replit)
const port = process.env.PORT || 5000; 

const settings = {
    phoneNumber: "201066706529", 
    ownerName: "Mohamed Kheder",
    botName: "My Super Bot"
};

async function startBot() {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        version,
        logger: pino({ level: "silent" }), 
        printQRInTerminal: false, 
        mobile: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"], 
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
        },
        connectTimeoutMs: 60000, 
        keepAliveIntervalMs: 30000,
    });

    if (!sock.authState.creds.registered) {
        console.log("⏳ انتظر 10 ثواني لاستقرار السيرفر...");
        await delay(10000); 
        try {
            const code = await sock.requestPairingCode(settings.phoneNumber);
            console.log(`\n========================================`);
            console.log(`🔥 كود الربط الخاص بك: ${code}`);
            console.log(`========================================\n`);
        } catch (err) {
            console.error('❌ فشل جلب الكود:', err.message);
        }
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason === DisconnectReason.loggedOut) {
                fs.rmSync('./auth_info', { recursive: true, force: true });
                startBot();
            } else {
                startBot(); 
            }
        } else if (connection === 'open') {
            console.log('✅ تم الاتصال بـ WhatsApp بنجاح!');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;

            const text = (m.message.conversation || m.message.extendedTextMessage?.text || "").trim();
            const remoteJid = m.key.remoteJid;

            // أوامر البوت
            if (text === '.اوامر' || text === '.menu') {
                await sock.sendMessage(remoteJid, { text: 'القائمة:\n1. .بنج\n2. .منشن' }, { quoted: m });
            } 
            else if (text === '.بنج') {
                await sock.sendMessage(remoteJid, { text: '🚀 شغال!' }, { quoted: m });
            }
            else if (text === '.منشن' || text === '.الكل') {
                if (remoteJid.endsWith('@g.us')) {
                    const groupMetadata = await sock.groupMetadata(remoteJid);
                    const participants = groupMetadata.participants.map(p => p.id);
                    await sock.sendMessage(remoteJid, {
                        text: '📣 منشن للكل',
                        mentions: participants
                    }, { quoted: m });
                }
            }
        } catch (err) {
            console.error("Error:", err);
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// تشغيل السيرفر
app.get('/', (req, res) => res.send(`Bot Active ✅`));

// التعديل الثاني والأهم: إضافة '0.0.0.0' لكي يرى Replit السيرفر
app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
    startBot();
});
