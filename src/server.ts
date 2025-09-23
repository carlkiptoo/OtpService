import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { OtpStore } from "./services/OtpStore";
import { OtpStrategyFactory, OtpChannel } from "./factories/OtpStrategyFactory";
import { TelegramOtpStrategy } from "./strategies/TelegramOtpStrategy";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const otpStore = new OtpStore(redisUrl, { maxAttempts: 3 });

otpStore.connect().then(() => {
    console.log('[Server] Connected to Redis');
}).catch((error) => {
    console.error('[Server] Error connecting to Redis', error);
    process.exit(1);
});

function asyncHandler(fn: any) {
    return (req: Request, res: Response, next: NextFunction) =>
        Promise.resolve(fn(req, res, next)).catch(next);
}


const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
if (!telegramBotToken) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
}

const telegramOtp = new TelegramOtpStrategy({
    botToken: telegramBotToken,
    otpExpiryMinutes: 5,
    rateLimitPerMinute: 3,
    messageTemplate: `🔐 Your One Time Password is {otp}. It expires in {expiry} minutes.`,
});

app.post('/request-otp', asyncHandler(async (req: Request, res: Response) => {
    const { identifier, channel } = req.body as { identifier: string, channel: OtpChannel };

    console.log(`[OTP Request] Identifier: ${identifier}, Channel: ${channel}`);

    if (!identifier || !channel) {
        return res.status(400).json({ error: 'Missing identifier or channel' });
    }

    const allowedChannels: OtpChannel[] = ['email', 'whatsapp', 'telegram'];
    if (!allowedChannels.includes(channel)) {
        return res.status(400).json({ error: `Invalid channel: ${channel}` });
    }


    if (channel === 'telegram') {
        console.log(`[OTP Request] Checking if ${identifier} is registered...`);
        const registry = await telegramOtp.getUserRegistry();
        console.log(`[OTP Request] Registry contents:`, Array.from(registry.keys()));

        if (!telegramOtp.isUserRegistered(identifier)) {
            return res.status(400).json({
                error: 'User not registered with Telegram bot. Please send /start to the bot first.',
                debug: {
                    identifier: identifier,
                    registeredUsers: Array.from((await telegramOtp.getUserRegistry()).keys()),
                    totalCount: telegramOtp.getRegisteredUserCount()
                }
            });
        }
        console.log(`[OTP Request] ${identifier} is registered ✓`);
    }

    const otp = await otpStore.createOtp(identifier);
    console.log(`[OTP Request] Generated OTP: ${otp.code} for ${identifier}`);

    const strategy = OtpStrategyFactory.create(channel);
    await strategy.sendOtp(identifier, otp.code);

    return res.json({ message: `OTP sent via ${channel}` });
}));

app.post('/verify-otp', asyncHandler(async (req: Request, res: Response) => {
    const { identifier, code } = req.body as { identifier: string, code: string };

    if (!identifier || !code) {
        return res.status(400).json({ error: 'Missing identifier or code' });
    }

    const isValid = await otpStore.verifyOtp(identifier, code);
    if (!isValid) {
        return res.status(401).json({ success: false, message: 'Invalid or Expired OTP' });
    }

    return res.json({ success: true, message: 'OTP verified' });
}));


app.post('/webhook/telegram', (req: Request, res: Response) => {
    console.log('\n=== TELEGRAM WEBHOOK RECEIVED ===');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    try {
        const update = req.body;

        if (update.message) {
            console.log('[Webhook] Message from', update.message.chat.username);
        }


        res.status(200).json({ success: true });


        telegramOtp.registerUser(update);
    } catch (error) {
        console.error('[Webhook] Error:', error);

        res.status(200).json({ success: false });
    }
});


app.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        telegramBot: !!telegramBotToken,
        registeredUsers: telegramOtp.getRegisteredUserCount()
    });
});


app.get('/debug/telegram/webhook-info', asyncHandler(async (req: Request, res: Response) => {
    try {
        console.log('[Debug] Getting webhook info...');
        const url = `https://api.telegram.org/bot${telegramBotToken}/getWebhookInfo`;
        console.log('[Debug] Making request to:', url);

        const response = await fetch(url);
        const data = await response.json();

        console.log('[Debug] Webhook info response:', data);
        res.json(data);
    } catch (error) {
        console.error('[Debug] Error getting webhook info:', error);
        res.status(500).json({ error: 'Failed to get webhook info', details: error });
    }
}));

app.post('/debug/telegram/set-webhook', asyncHandler(async (req: Request, res: Response) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'Missing webhook URL' });
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to set webhook', details: error });
    }
}));

app.get('/debug/telegram/updates', asyncHandler(async (req: Request, res: Response) => {
    try {
        const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/getUpdates`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to get updates', details: error });
    }
}));

app.get('/debug/telegram/users', async (req: Request, res: Response) => {
    const registry = await telegramOtp.getUserRegistry();
    const users = Array.from(registry.entries()).map(([identifier, user]) => ({
        identifier,
        chatId: user.chatId,
        username: user.username,
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        registeredAt: user.registeredAt
    }));

    res.json({
        totalUsers: telegramOtp.getRegisteredUserCount(),
        users,
        rawRegistry: Object.fromEntries(registry)
    });
});

app.get('/debug/telegram/check/:identifier', async (req: Request, res: Response) => {
    const identifier = req.params.identifier;
    const isRegistered = telegramOtp.isUserRegistered(identifier);
    const registry = await telegramOtp.getUserRegistry();

    res.json({
        identifier,
        isRegistered,
        totalRegisteredUsers: telegramOtp.getRegisteredUserCount(),
        allRegisteredIdentifiers: Array.from(registry.keys()),
        debugInfo: {
            normalizedIdentifier: identifier.trim().toLowerCase(),
            registryHasExact: registry.has(identifier),
            registryHasNormalized: registry.has(identifier.trim().toLowerCase())
        }
    });
});


app.post('/debug/telegram/manual-register', async (req: Request, res: Response) => {
    const { chatId, username, firstName, lastName } = req.body;

    if (!chatId) {
        return res.status(400).json({ error: 'chatId is required' });
    }


    const fakeUpdate = {
        message: {
            text: '/start',
            chat: {
                id: parseInt(chatId),
                username: username,
                first_name: firstName || 'Test',
                last_name: lastName || 'User'
            }
        }
    };

    console.log('[Manual Register] Simulating update:', JSON.stringify(fakeUpdate, null, 2));

    const registered = await telegramOtp.registerUser(fakeUpdate);

    res.json({
        registered,
        userCount: telegramOtp.getRegisteredUserCount(),
        registry: Array.from((await telegramOtp.getUserRegistry()).entries())
    });
});


app.post('/debug/telegram/force-register', (req: Request, res: Response) => {
    const { identifier, chatId } = req.body;

    if (!identifier || !chatId) {
        return res.status(400).json({ error: 'Both identifier and chatId are required' });
    }


    const user = {
        chatId: chatId.toString(),
        username: identifier.startsWith('@') ? identifier.substring(1) : undefined,
        firstName: 'Force',
        lastName: 'Registered',
        registeredAt: new Date()
    };


    const registry = telegramOtp.getUserRegistry();


    console.log(`[Force Register] Adding ${identifier} -> ${chatId}`);


    const fakeUpdate = {
        message: {
            text: '/start',
            chat: {
                id: parseInt(chatId),
                username: identifier.startsWith('@') ? identifier.substring(1) : undefined,
                first_name: 'Force',
                last_name: 'Registered'
            }
        }
    };

    const registered = telegramOtp.registerUser(fakeUpdate);

    res.json({
        registered,
        identifier,
        chatId,
        userCount: telegramOtp.getRegisteredUserCount(),
        isNowRegistered: telegramOtp.isUserRegistered(identifier)
    });
});


app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('[Server] Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});


setInterval(() => {
    telegramOtp.cleanUpRateLimits();
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[Server] 🚀 Listening on port ${PORT}`);
    console.log(`[Server] 📡 Webhook URL: http://localhost:${PORT}/webhook/telegram`);
    console.log(`[Server] 🐛 Debug endpoints:`);
    console.log(`  - GET  /debug/telegram/webhook-info`);
    console.log(`  - POST /debug/telegram/set-webhook`);
    console.log(`  - GET  /debug/telegram/updates`);
    console.log(`  - GET  /debug/telegram/users`);
    console.log(`  - GET  /debug/telegram/check/:identifier`);
    console.log(`  - POST /debug/telegram/manual-register`);
    console.log(`  - POST /debug/telegram/force-register`);
});