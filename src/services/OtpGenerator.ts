import crypto from 'crypto';

export type OtpCharset = 'digits' | 'alphanumeric';

export interface GeneratedOtp {
    code: string;
    hash: string;
    expiresAt: Date;

}

export class OtpGenerator {
    private readonly length: number;
    private readonly expiryMinutes: number;
    private readonly charset: OtpCharset;
    private readonly allowLeadingZeros: boolean;
    private readonly maxLength = 12;

    constructor(options?: {
        length?: number;
        expiryMinutes?: number;
        charset?: OtpCharset;
        allowLeadingZeros?: boolean;
    }) {
        this.length = options?.length ?? 6;
        this.expiryMinutes = options?.expiryMinutes ?? 5;
        this.charset = options?.charset ?? 'digits';
        this.allowLeadingZeros = options?.allowLeadingZeros ?? true;

        if (this.length <= 0 || this.length > this.maxLength) {
            throw new Error(`Invalid OTP length. Must be between 1 and ${this.maxLength}`);
        }

        if (!process.env.OTP_HASH_SECRET) {
            console.warn("[OtpGenerator] Warning: OTP_HASH_SECRET environment variable is not set. OTP codes will not be secure.");
            (process.env as any).OTP_HASH_SECRET = crypto.randomBytes(32).toString('hex');
        }
    }

    generate(): GeneratedOtp {
        const code = this.charset === 'digits' ? this.generateNumeric() : this.generateAlphanumeric();

        const hash = this.hashOtp(code);
        const expiresAt = new Date(Date.now() + this.expiryMinutes * 60 * 1000);

        return {code, hash, expiresAt};2
    }

    hashOtp(otp: string): string {
        const secret = process.env.OTP_HASH_SECRET!;
        const salt = crypto.randomBytes(16);
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(salt);
        hmac.update(otp);

        const digest = hmac.digest('hex');
        return `${salt.toString('hex')}$${digest}`
    }

    static verifyOtp(plainOtp: string, storedHash: string): boolean {
        try {
            const secret = process.env.OTP_HASH_SECRET;
            if (!secret) {
                console.warn("[OtpGenerator] Warning: OTP_HASH_SECRET environment variable is not set. OTP codes will not be secure.");

                const fallback = crypto.createHash('sha256').update(plainOtp).digest('hex');
                return fallback === storedHash;
            }

            const parts = storedHash.split('$');
            if (parts.length !== 2) return false;
            const [saltHex, expectedHmacHex] = parts;
            const salt = Buffer.from(saltHex, 'hex');

            const hmac = crypto.createHmac('sha256', secret);
            hmac.update(salt);
            hmac.update(plainOtp);

            const computed = Buffer.from(hmac.digest('hex'), 'hex');
            const expected = Buffer.from(expectedHmacHex, 'hex');

            if (computed.length !== expected.length) return false;

            return crypto.timingSafeEqual(computed, expected);
        } catch (error) {
            console.error(`[OtpGenerator] Error verifying OTP: ${error}`);
            return false;
        }
    }

    private generateNumeric(): string {
        const max = BigInt(10) ** BigInt(this.length);

        if (this.length <= 9) {
            const min = this.allowLeadingZeros ? 0 : Math.pow(10, this.length - 1);
            const maxNum = Math.pow(10, this.length) - 1;
            const rand = crypto.randomInt(min, maxNum + 1);
            return rand.toString().padStart(this.length, "0");
        }

        const neededBytes = Math.ceil(Number(this.length * Math.log2(10)) / 8);
        const buf = crypto.randomBytes(neededBytes + 2);
        const num = BigInt('0x' + buf.toString('hex')) % max;
        let str = num.toString(10);

        if (this.allowLeadingZeros) {
            while (str.length < this.length) str = '0' + str

        }
        return str;

    }

    

}