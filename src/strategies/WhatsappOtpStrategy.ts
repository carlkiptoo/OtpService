import fetch from 'node-fetch';

export class WhatsappOtpStrategy {
    private accessToken: string;
    private phoneNumberId: string;
    private templateName: string;
    private languageCode: string;

    constructor(options: {
        accessToken: string;
        phoneNumberId: string;
        templateName?: string;
        languageCode?: string;
    }) {
        if (!options.accessToken || !options.phoneNumberId) {
            throw new Error('[WhatsappOtpStrategy] Missing access token or phone number');
        }

        this.accessToken = options.accessToken;
        this.phoneNumberId = options.phoneNumberId;
        this.templateName = options.templateName || process.env.WHATSAPP_TEMPLATE || 'otp_template';
        this.languageCode = options.languageCode || "en_US";
    }

    async sendOtp(recipient: string, otp: string): Promise<void> {
        const url = `https://graph.facebook.com/v13.0/${this.phoneNumberId}/messages`;

        const payload = {
            messaging_product: "whatsapp",
            to: recipient,
            type: "template",
            template: {
                name: this.templateName,
                language: {code: this.languageCode},
            },
        };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json();
            if (!response.ok) {
             
                console.error("[WhatsappOtpStrategy] Error sending OTP to Whatsapp", data);
                throw new Error('Failed to send OTP via Whatsapp');
            }

            
            console.log(`[WhatsappOtpStrategy] OTP sent successfully to ${recipient}`);
        } catch (error) {
            console.error(`[WhatsappOtpStrategy] Error sending OTP to Whatsapp: ${error}`);
            throw new Error('Failed to send OTP via Whatsapp');
        }
    }
}