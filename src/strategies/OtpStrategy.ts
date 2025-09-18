export interface OtpStrategy {
    sendOtp(recipient: string, otp: string): Promise<void>;

    initialize?(): Promise<void>;
}