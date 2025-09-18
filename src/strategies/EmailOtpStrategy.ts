import { OtpStrategy } from './OtpStrategy';
import nodemailer, { Transporter } from 'nodemailer';
import dotenv from 'dotenv';
import SMTPTransport from 'nodemailer/lib/smtp-transport';

dotenv.config();
export class EmailStrategy implements OtpStrategy {
    private transporter: Transporter;

    constructor() {
        if (!process.env.SMTP_HOST || !process.env.SMTP_PORT) {
            throw new Error('Missing SMTP configuration');
        }

        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        } as SMTPTransport.Options);

    }

    async sendOtp(recipient: string, otp: string): Promise<void> {
        if (!recipient.includes('@')) {
            throw new Error('Invalid email address');
        }

        const mailOptions = {
            from: process.env.MAIL_FROM,
            to: recipient,
            subject: "Your One Time Password",
            text: `Your One Time Password is ${otp}. It expires in 5 minutes`,
            html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <h2>Your One Time Password</h2>
            <p><strong>${otp}</strong></p>
            <p>This code will expire in <b>5 Minutes</b>. If you did not request this code, please ignore this email.</p>
            <hr />
            <p style="font-size: small;">If you have any questions, please contact us at <a href="mailto:${process.env.MAIL_FROM}">${process.env.MAIL_FROM}</a></p>
        </div>
        `,
        };

        try {
            await this.transporter.sendMail(mailOptions);
            console.log(`[EmailStrategy] OTP sent successfully to ${recipient}`);
        } catch (error) {
            console.error(`[EmailStrategy] Error sending OTP to ${recipient}: ${error}`);
            throw new Error('Failed to send OTP via email');
        }
    }
}