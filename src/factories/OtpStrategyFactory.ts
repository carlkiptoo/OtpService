import { OtpStrategy } from '../strategies/OtpStrategy';
import { EmailStrategy } from '../strategies/EmailOtpStrategy';


export type OtpChannel = 'email' | 'whatsapp' | 'telegram';

export class OtpStrategyFactory {
    static create(channel: OtpChannel): OtpStrategy {
        switch (channel) {
            case 'email':
                return new EmailStrategy();
            // case 'whatsapp':
            //     return new WhatsappOtpStrategy(process.env.WHATSAPP_PHONE_NUMBER);
            // case 'telegram':
            //     return new TelegramOtpStrategy(process.env.TELEGRAM_BOT_TOKEN);
            default:
                throw new Error(`Invalid OTP channel: ${channel}`);
        }
    }
}