import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import { OtpStore } from "./services/OtpStore";
import { OtpStrategyFactory, OtpChannel } from "./factories/OtpStrategyFactory";

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

app.post('/request-otp', asyncHandler(async (req: Request, res: Response) => {
    const {identifier, channel} = req.body as {identifier: string, channel: OtpChannel};

    if(!identifier || !channel) {
        return res.status(400).json({error: 'Missing identifier or channel'});
    }

    const allowedChannels: OtpChannel[] = ['email', 'whatsapp', 'telegram'];
    if (!allowedChannels.includes(channel)) {
        return res.status(400).json({error: `Invalid channel: ${channel}`});
    }

    if (await otpStore.isBlocked(identifier)) {
        return res.status(429).json({error: 'Too many requests'});
    }

    const otp = await otpStore.createOtp(identifier);

    const strategy = OtpStrategyFactory.create(channel);
    await strategy.sendOtp(identifier, otp.code);

    return res.json({message: `OTP SENT VIA ${channel}`});

}))

app.post('/verify-otp', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const {identifier, code} = req.body as {identifier: string, code: string};

    if (!identifier || !code) {
        return res.status(400).json({error: 'Missing identifier or code'});
    }

    const isValid = await otpStore.verifyOtp(identifier, code);
    if (!isValid) {
        return res.status(401).json({success: false, message: 'Invalid or Expired OTP'});
    }

    return res.json({success: true, message: 'OTP verified'});
}))

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(err);
    res.status(500).json({success: false, message: 'Internal Server Error'});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[Server] Listening on port ${PORT}`);
});