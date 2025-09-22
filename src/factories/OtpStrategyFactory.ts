import { OtpStrategy } from '../strategies/OtpStrategy';
import { EmailStrategy } from '../strategies/EmailOtpStrategy';
import { WhatsappOtpStrategy } from '../strategies/WhatsappOtpStrategy';

export type OtpChannel = 'email' | 'whatsapp' | 'telegram';

export class OtpStrategyFactory {
    static create(channel: OtpChannel): OtpStrategy {
        switch (channel) {
            case 'email':
                return new EmailStrategy();
            case "whatsapp":
                return new WhatsappOtpStrategy({
                    accessToken: process.env.WHATSAPP_TOKEN as string,
                    phoneNumberId: process.env.WHATSAPP_PHONE_ID as string,
                    templateName: process.env.WHATSAPP_TEMPLATE || 'otp_template',
                });
            // case 'telegram':
            //     return new TelegramOtpStrategy(process.env.TELEGRAM_BOT_TOKEN);
            default:
                throw new Error(`Invalid OTP channel: ${channel}`);
        }
    }
}