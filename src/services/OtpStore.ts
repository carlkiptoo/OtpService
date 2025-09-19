import {createClient, RedisClientType} from "redis";
import { OtpGenerator, GeneratedOtp } from "./OtpGenerator";

export interface OtpRecord {
    hash: string;
    expiresAt: string;
    attempts: number;
}

export class OtpStore {
    private client: RedisClientType;
    private generator: OtpGenerator;
    private readonly maxAttempts: number;

    constructor(redisUrl: string, options?: {maxAttempts?: number}) {
        this.client = createClient({url: redisUrl});
        this.generator = new OtpGenerator();
        this.maxAttempts = options?.maxAttempts ?? 3;

        this.client.on('error', () => {
            console.error('[OtpStore] Redis Client Error');
        });
    }

    async connect() {
        if (!this.client.isOpen) {
            await this.client.connect();
        }
    }

    async disconnect() {
        if (this.client.isOpen) {
            await this.client.disconnect();
        }
    }

    async createOtp(identifier: string): Promise<GeneratedOtp> {
        const otp = this.generator.generate();

        const record: OtpRecord = {
            hash: otp.hash,
            expiresAt: otp.expiresAt.toISOString(),
            attempts: 0,
        };

        const ttlSeconds = Math.ceil((otp.expiresAt.getTime() - Date.now()) / 1000);

        const key = this.buildKey(identifier);
        await this.client.set(key, JSON.stringify(record), {EX: ttlSeconds});

        return otp;
    }

    async verifyOtp(identifier: string, submittedCode: string): Promise<boolean> {
        const key = this.buildKey(identifier);
        const raw = await this.client.get(key);
        if (!raw) return false;

        const record: OtpRecord = JSON.parse(raw);

        if (new Date(record.expiresAt).getTime() < Date.now()) {
            await this.client.del(key);
            return false;
        }

        if (record.attempts >= this.maxAttempts) {
            await this.client.del(key);
            return false;
        }

        const isValid = OtpGenerator.verifyOtp(submittedCode, record.hash);

        if (isValid) {
            await this.client.del(key);
            return true;
        } else {
            record.attempts += 1;
            await this.client.set(key, JSON.stringify(record), {
                EX: Math.ceil(
                    (new Date(record.expiresAt).getTime() - Date.now()) / 1000
                ),
            });
            return false;
        }
    }

    async isBlocked(identifier: string): Promise<boolean> {
        const key = this.buildKey(identifier);
        return (await this.client.exists(key)) === 1;
    }

    private buildKey(identifier: string): string {
        return `otp:${identifier}`
    }
}