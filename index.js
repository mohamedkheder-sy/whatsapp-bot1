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
