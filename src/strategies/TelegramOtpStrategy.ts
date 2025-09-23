import fetch from 'node-fetch';
import { OtpStrategy } from './OtpStrategy';
import { redis } from '../redisClient';


interface TelegramUser {
    chatId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    registeredAt: Date
}

interface TelegramOtpConfig {
    botToken: string;
    otpExpiryMinutes?: number;
    messageTemplate?: string;
    rateLimitPerMinute?: number;
    maxRetries?: number;
    retryDelayMs?: number;
}

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

export class TelegramOtpStrategy implements OtpStrategy {
    private botToken: string;
    private config: Required<TelegramOtpConfig>;
    private userRegistry: Map<string, TelegramUser> = new Map();
    private rateLimitMap: Map<string, RateLimitEntry> = new Map();

    constructor(config: TelegramOtpConfig) {
        if (!config.botToken) {
            throw new Error('Missing Telegram bot token');
        }
        this.botToken = config.botToken;

        this.config = {
            botToken: config.botToken,
            otpExpiryMinutes: config.otpExpiryMinutes || 5,
            messageTemplate: config.messageTemplate || 'Your One Time Password is {otp}. It expires in {otpExpiryMinutes} minutes',
            rateLimitPerMinute: config.rateLimitPerMinute || 5,
            maxRetries: config.maxRetries || 3,
            retryDelayMs: config.retryDelayMs || 1000,
        };

        this.initializeBot();
    }

    private async initializeBot(): Promise<void> {
        try {
            await this.setupBotCommands();
        } catch (error) {
            console.error('[TelegramOtpStrategy] Error initializing Telegram bot', error);
        }
    }

    private async setupBotCommands(): Promise<void> {
        const commands = [
            {
                command: 'start',
                description: 'Register for OTP notifications'
            }
        ];
        const url = `https://api.telegram.org/bot${this.botToken}/setMyCommands`;

        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands })
        });
    }

    private async saveUserToRedis(identifiers: string[], user: TelegramUser): Promise<void> {
        const pipeline = redis.multi();

        pipeline.set(`telegram:user:${user.chatId}`, JSON.stringify(user));

        for (const id of identifiers) {
            pipeline.set(`telegram:identifier:${id}`, user.chatId);
        }

        pipeline.sadd('telegram:identifiers', identifiers);
        await pipeline.exec();
    }

    public async registerUser(update: any): Promise<boolean> {
        try {
            console.log('[TelegramOtpStrategy] Processing update:', JSON.stringify(update, null, 2));

            const message = update.message;
            if (!message || message.text !== "/start") return false;

            const chat = message.chat;
            const user: TelegramUser = {
                chatId: chat.id.toString(),
                username: chat.username,
                firstName: chat.first_name,
                lastName: chat.last_name,
                registeredAt: new Date()
            };

            console.log('[TelegramOtpStrategy] Chat info:', {
                id: chat.id,
                username: chat.username,
                first_name: chat.first_name,
                last_name: chat.last_name
            });

            
            const identifiers = this.createIdentifiers(chat);
            console.log('[TelegramOtpStrategy] Creating identifiers:', identifiers);

            
            identifiers.forEach(identifier => {
                this.userRegistry.set(identifier, user);
                console.log(`[TelegramOtpStrategy] Registered user with identifier: ${identifier}`);
            });

            await this.saveUserToRedis(identifiers, user);

            await this.sendWelcomeMessage(chat.id.toString());
            console.log(`[TelegramOtpStrategy] User registered with ${identifiers.length} identifiers`);
            console.log(`[TelegramOtpStrategy] Current registry size: ${this.userRegistry.size}`);

            return true;

        } catch (error) {
            console.error(`[TelegramOtpStrategy] Error registering user: ${error}`);
            return false;
        }
    }

    private createIdentifiers(chat: any): string[] {
        const identifiers: string[] = [];

        
        identifiers.push(chat.id.toString());

      
        if (chat.username) {
            const username = chat.username.toLowerCase();
            identifiers.push(`@${username}`);
            identifiers.push(username);
        }

        return identifiers;
    }

    private async sendWelcomeMessage(chatId: string): Promise<void> {
        const welcomeText = '✅ Successfully registered for OTP notifications!\n\nYou can now receive one-time passwords through this bot.';
        try {
            await this.sendTelegramMessage(chatId, welcomeText);
        } catch (error) {
            console.error('[TelegramOtpStrategy] Failed to send welcome message:', error);
        }
    }

    private validateAndNormalizeRecipient(recipient: string): string {
        const normalized = recipient.trim().toLowerCase();

        if (/^\d+$/.test(normalized)) {
            return normalized;
        }
        if (/^@?[a-zA-Z0-9_]{3,32}$/.test(normalized)) {
           
            return normalized.startsWith('@') ? normalized : `@${normalized}`;
        }

        throw new Error('Invalid recipient format. Use either chat ID or username');
    }

    private checkRateLimit(chatId: string): boolean {
        const now = Date.now();
        const entry = this.rateLimitMap.get(chatId);

        if (!entry || now >= entry.resetTime) {
            this.rateLimitMap.set(chatId, {
                count: 1,
                resetTime: now + 60000,
            });
            return true;
        }

        if (entry.count >= this.config.rateLimitPerMinute) {
            return false;
        }

        entry.count += 1;
        return true;
    }

    private async resolveChatId(recipient: string): Promise<string> {
        const normalized = this.validateAndNormalizeRecipient(recipient);
        console.log(`[TelegramOtpStrategy] Resolving chatId for: ${recipient} -> ${normalized}`);

        const user = this.userRegistry.get(normalized);
        if (user) {
            return user.chatId;
        }

        const chatId = await redis.get(`telegram:identifier:${normalized}`);
        if (chatId) {
            return chatId;
        }

        throw new Error(`User ${recipient} has not messaged the bot yet. Ask them to /start the bot first.`);
    }

    private formatOtpMessage(otp: string): string {
        return this.config.messageTemplate.replace('{otp}', otp).replace('{otpExpiryMinutes}', this.config.otpExpiryMinutes.toString());
    }

    private async sendTelegramMessage(chatId: string, text: string): Promise<void> {
        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

        const payload = {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Telegram API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async sendWithRetry(chatId: string, message: string): Promise<void> {
        let lastError: Error;

        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                await this.sendTelegramMessage(chatId, message);
                return;
            } catch (error) {
                lastError = error as Error;
                console.warn(`[TelegramOtpStrategy] Attempt ${attempt} failed to send OTP to ${chatId}. Retrying...`, error);

                if (attempt < this.config.maxRetries) {
                    const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
                    await this.sleep(delay);
                }
            }
        }

        throw lastError!;
    }

    async sendOtp(recipient: string, otp: string): Promise<void> {
        try {
            if (!/^[0-9]{4,8}$/.test(otp)) {
                throw new Error('Invalid OTP format');
            }

            const chatId = await this.resolveChatId(recipient);

            if (!this.checkRateLimit(chatId)) {
                throw new Error('Too many requests. Please try again later.');
            }

            const message = this.formatOtpMessage(otp);

            await this.sendWithRetry(chatId, message);
            console.log(`[TelegramOtpStrategy] OTP sent successfully to ${recipient}`);

        } catch (error) {
            console.error(`[TelegramOtpStrategy] Error sending OTP to Telegram: ${error}`);

            if (error instanceof Error) {
                if (error.message.includes('not found') || error.message.includes('Rate limit')) {
                    throw error;
                }
            }
            throw new Error('Failed to send OTP via Telegram');
        }
    }

    public async getUserRegistry(): Promise<Map<string, TelegramUser>> {
        const result = new Map<string, TelegramUser>();

        const identifiers = await redis.smembers('telegram:identifiers');
        for (const id of identifiers) {
            const chatId = await redis.get(`telegram:identifier:${id}`);
            if (chatId) {
                const userJson = await redis.get(`telegram:user:${chatId}`);
                if (userJson) {
                    result.set(id, JSON.parse(userJson));
                }
            }
        }
        return result;
    }

    public async isUserRegistered(recipient: string): Promise<boolean> {
        try {
            const normalized = this.validateAndNormalizeRecipient(recipient);

            if (this.userRegistry.has(normalized)) return true;

            const exists = await redis.exists(`telegram:identifier:${normalized}`);
            return exists === 1;

        } catch (error) {
            console.error(`[TelegramOtpStrategy] Error checking registration:`, error);
            return false;
        }
    }

    public removeUser(recipient: string): boolean {
        const normalized = this.validateAndNormalizeRecipient(recipient);
        return this.userRegistry.delete(normalized);
    }

    public getRegisteredUserCount(): number {
        return this.userRegistry.size;
    }

    public cleanUpRateLimits(): void {
        const now = Date.now();
        for (const [chatId, entry] of this.rateLimitMap.entries()) {
            if (now >= entry.resetTime) {
                this.rateLimitMap.delete(chatId);
            }
        }
    }
}