const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

let browserInstance = null;
let pageInstance = null;

async function resetSession() {
    try {
        if (browserInstance) await browserInstance.close();
    } catch {}
    browserInstance = null;
    pageInstance = null;
}

function getChromePath() {
    const paths = [
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ];
    for (const p of paths) {
        try { if (fs.existsSync(p)) return p; } catch {}
    }
    return null;
}

app.post('/send-code', async (req, res) => {
    const { phone } = req.body;

    try {
        await resetSession();

        const executablePath = getChromePath();
        console.log('Браузер:', executablePath || 'playwright вбудований');

        browserInstance = await chromium.launch({
            headless: true,
            executablePath: executablePath || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const context = await browserInstance.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 }
        });

        pageInstance = await context.newPage();

        console.log('Відкриваємо Telegram Web...');
        await pageInstance.goto('https://web.telegram.org/a/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        console.log('Чекаємо кнопку LOG IN BY PHONE NUMBER...');
        await pageInstance.waitForFunction(() => {
            const all = Array.from(document.querySelectorAll('a, button'));
            return all.some(el =>
                el.textContent.trim().toLowerCase() === 'log in by phone number'
            );
        }, { timeout: 30000 });

        await pageInstance.waitForTimeout(2000);

        const debug1 = await pageInstance.screenshot({ encoding: 'base64' });
        fs.writeFileSync('public/debug1.png', Buffer.from(debug1, 'base64'));

        // Клік по координатах кнопки
        const btnBox = await pageInstance.evaluate(() => {
            const all = Array.from(document.querySelectorAll('a, button'));
            const btn = all.find(el =>
                el.textContent.trim().toLowerCase() === 'log in by phone number'
            );
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        });

        if (btnBox) {
            await pageInstance.mouse.click(btnBox.x, btnBox.y);
            console.log('Клікнуто LOG IN BY PHONE NUMBER');
        } else {
            await pageInstance.locator('text=LOG IN BY PHONE NUMBER').click({ force: true, timeout: 10000 });
        }

        await pageInstance.waitForTimeout(3000);

        const debug2 = await pageInstance.screenshot({ encoding: 'base64' });
        fs.writeFileSync('public/debug2.png', Buffer.from(debug2, 'base64'));

        // Чекаємо появи форми телефону
        console.log('Чекаємо форму телефону...');
        await pageInstance.waitForFunction(() => {
            return document.querySelector('input[type="tel"]') !== null ||
                   document.querySelector('.phone-number-input') !== null;
        }, { timeout: 10000 }).catch(() => console.log('Форма телефону не знайдена через waitForFunction'));

        await pageInstance.waitForTimeout(1000);

        // Закриваємо дропдаун якщо відкритий (натискаємо Escape)
        await pageInstance.keyboard.press('Escape');
        await pageInstance.waitForTimeout(500);

        const debug3 = await pageInstance.screenshot({ encoding: 'base64' });
        fs.writeFileSync('public/debug3.png', Buffer.from(debug3, 'base64'));

        // Шукаємо ТІЛЬКИ поле телефону (type="tel"), не text
        console.log('Шукаємо поле tel...');
        let telInput = null;

        try {
            await pageInstance.waitForSelector('input[type="tel"]', { timeout: 8000, state: 'visible' });
            telInput = await pageInstance.$('input[type="tel"]');
            console.log('Знайдено input[type="tel"]');
        } catch {
            console.log('input[type="tel"] не знайдено');
        }

        // Якщо немає tel, шукаємо поле після country selector (другий input на сторінці)
        if (!telInput) {
            console.log('Шукаємо поле телефону як другий input...');
            const allInputs = await pageInstance.$$('input');
            console.log('Всього inputs:', allInputs.length);

            for (const inp of allInputs) {
                const type = await inp.getAttribute('type');
                const placeholder = await inp.getAttribute('placeholder');
                const id = await inp.getAttribute('id');
                console.log('Input attrs:', { type, placeholder, id });
            }

            // Беремо останній input (поле номера, не country)
            if (allInputs.length >= 2) {
                telInput = allInputs[allInputs.length - 1];
                console.log('Взято останній input як поле телефону');
            } else if (allInputs.length === 1) {
                telInput = allInputs[0];
            }
        }

        if (!telInput) {
            throw new Error('Поле вводу телефону не знайдено');
        }

        // Клікаємо по координатах поля
        const inputBox = await telInput.boundingBox();
        if (inputBox) {
            await pageInstance.mouse.click(
                inputBox.x + inputBox.width / 2,
                inputBox.y + inputBox.height / 2
            );
            console.log('Клікнуто поле телефону');
        }

        await pageInstance.waitForTimeout(500);
        await pageInstance.keyboard.press('Control+A');
        await pageInstance.waitForTimeout(200);
        await pageInstance.keyboard.press('Delete');
        await pageInstance.waitForTimeout(300);

        // Вводимо тільки 9 цифр без коду країни (Telegram сам підставляє +380)
        let phoneToType = phone.replace(/\D/g, '');
        if (phoneToType.startsWith('380')) {
            phoneToType = phoneToType.slice(3); // прибираємо 380
        }

        console.log('Вводимо номер (без коду країни):', phoneToType);
        await pageInstance.keyboard.type(phoneToType, { delay: 150 });
        await pageInstance.waitForTimeout(1000);

        const screenshotBefore = await pageInstance.screenshot({ encoding: 'base64' });
        fs.writeFileSync('public/before.png', Buffer.from(screenshotBefore, 'base64'));

        // Натискаємо NEXT по координатах
        console.log('Натискаємо NEXT...');
        const nextBtnBox = await pageInstance.evaluate(() => {
            const btn = document.querySelector('button[type="submit"]');
            if (!btn) return null;
            const rect = btn.getBoundingClientRect();
            return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        });

        if (nextBtnBox) {
            await pageInstance.mouse.click(nextBtnBox.x, nextBtnBox.y);
            console.log('Натиснуто NEXT по координатах');
        } else {
            await pageInstance.keyboard.press('Enter');
            console.log('Натиснуто Enter як fallback');
        }

        await pageInstance.waitForTimeout(5000);

        const screenshot = await pageInstance.screenshot({ encoding: 'base64' });
        fs.writeFileSync('public/after_send.png', Buffer.from(screenshot, 'base64'));

        res.json({ success: true, screenshot, screenshotBefore });

    } catch (error) {
        console.error('Помилка send-code:', error.message);

        try {
            if (pageInstance) {
                const errShot = await pageInstance.screenshot({ encoding: 'base64' });
                fs.writeFileSync('public/error.png', Buffer.from(errShot, 'base64'));
            }
        } catch {}

        res.json({ success: false, error: error.message });
    }
});

app.post('/verify-code', async (req, res) => {
    const { code } = req.body;

    try {
        if (!pageInstance) {
            return res.json({ success: false, error: 'Сесія не знайдена. Почніть спочатку.' });
        }

        await pageInstance.waitForTimeout(2000);

        // Шукаємо поле коду — type="tel" або інший числовий input
        let codeInput = null;

        const codeSelectors = [
            'input[type="tel"]',
            'input[autocomplete="one-time-code"]',
            'input[type="number"]',
            'input[placeholder*="code" i]',
            'input[placeholder*="код" i]',
            'input[type="text"]',
            'input',
        ];

        for (const sel of codeSelectors) {
            try {
                await pageInstance.waitForSelector(sel, { timeout: 3000, state: 'visible' });
                const found = await pageInstance.$(sel);
                if (found) {
                    codeInput = found;
                    console.log('Поле коду знайдено:', sel);
                    break;
                }
            } catch {}
        }

        if (codeInput) {
            const box = await codeInput.boundingBox();
            if (box) {
                await pageInstance.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            }
            await pageInstance.waitForTimeout(300);
        } else {
            console.log('Поле коду не знайдено, друкуємо без фокусу...');
        }

        for (const char of code) {
            await pageInstance.keyboard.type(char);
            await pageInstance.waitForTimeout(150 + Math.random() * 100);
        }

        await pageInstance.waitForTimeout(3000);

        const screenshot = await pageInstance.screenshot({ encoding: 'base64' });
        fs.writeFileSync('public/after.png', Buffer.from(screenshot, 'base64'));

        res.json({ success: true, screenshot });

    } catch (error) {
        console.error('Помилка verify-code:', error.message);

        try {
            if (pageInstance) {
                const errShot = await pageInstance.screenshot({ encoding: 'base64' });
                fs.writeFileSync('public/error_verify.png', Buffer.from(errShot, 'base64'));
            }
        } catch {}

        res.json({ success: false, error: error.message });
    }
});

app.listen(3000, () => {
    console.log('Сервер запущено на http://localhost:3000');
});
