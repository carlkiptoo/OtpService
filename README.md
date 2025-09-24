# OTP Service 

A modular, multi-channel **One Time Password (OTP) service** built with **Node.js + Redis**. Supports **Email, WhatsApp (Cloud API), and Telegram** as delivery channels.

## Project Structure

```
src/
├── channels/                # Future channel-specific logic
├── factories/
│   └── OtpStrategyFactory.ts # Factory to pick OTP strategy
├── redisClient.ts            # Redis connection
├── server.ts                 # Express server
├── services/
│   ├── OtpGenerator.ts       # Generates OTPs
│   └── OtpStore.ts           # Stores OTPs in Redis
└── strategies/
    ├── EmailOtpStrategy.ts
    ├── OtpStrategy.ts        # Base interface
    ├── TelegramOtpStrategy.ts
    └── WhatsappOtpStrategy.ts
```

## Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/carlkiptoo/OtpService.git
cd OtpService
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment Variables

Create a `.env` file in the root:

```env
# ---------------------------
# Server
# ---------------------------
PORT=3000

# ---------------------------
# Redis
# ---------------------------
REDIS_URL=redis://localhost:6379

# ---------------------------
# OTP
# ---------------------------
OTP_HASH_SECRET=your-secret-key
OTP_EXPIRY_MINUTES=5

# ---------------------------
# Email (SMTP)
# ---------------------------
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-pass
MAIL_FROM="Otp Service <noreply@example.com>"

# ---------------------------
# WhatsApp (Cloud API)
# ---------------------------
WHATSAPP_TOKEN=your-whatsapp-api-token
WHATSAPP_PHONE_ID=your-whatsapp-phone-id
WHATSAPP_TEMPLATE=your-template-name

# ---------------------------
# Telegram
# ---------------------------
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
```

## Running the Service

Start server in development:

```bash
npm run dev
```

Or production:

```bash
npm run build
npm start
```

## API Endpoints

### 1. Request OTP

```
POST /request-otp
```

**Request body:**

```json
{
  "identifier": "@telegram_username_or_email_or_phone", *phone should be in international format*
  "channel": "telegram"
}
```

**Channels:**
- `telegram` → Telegram Bot
- `email` → SMTP Email  
- `whatsapp` → WhatsApp Cloud API

### 2. Verify OTP

```
POST /verify-otp
```

**Request body:**

```json
{
  "identifier": "@telegram_username_or_email_or_phone",
  "code": "123456"
}
```

**Response:**

```json
{ "success": true }
```

## 🧪 Testing

### Telegram

1. Start a chat with your bot in Telegram *Use BotFather*
2. Register the webhook:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=<YOUR_SERVER_URL>/webhook/telegram"
```

3. Send `/start` to your bot, then request an OTP via `POST /request-otp`

### WhatsApp

1. Use WhatsApp Cloud API credentials from Meta for Developers
2. Ensure your template is approved
3. Test with a registered number

### Email

1. Configure SMTP credentials (e.g., Gmail, SendGrid)
2. Call `POST /request-otp` with `"channel": "email"`

## Debug Endpoints

For development and testing:

```bash
# Get webhook info
GET /debug/telegram/webhook-info

# Set webhook URL
POST /debug/telegram/set-webhook

# View registered users
GET /debug/telegram/users

# Check specific user registration
GET /debug/telegram/check/:identifier

# Manual user registration
POST /debug/telegram/manual-register
```

## Features

-  Multi-channel OTP (Telegram, Email, WhatsApp)
-  Redis-backed OTP store with expiry
-  Secure OTP hashing (HMAC + secret)
-  Modular strategy pattern for easy extension
-  Rate limiting and retry logic
-  Comprehensive debug endpoints

##  Roadmap

- [ ] Add SMS support (Twilio, Africa's Talking, etc.)
- [ ] Add rate limiting per user
- [ ] Add resend logic with cooldown
- [ ] Docker containerization
- [ ] Health monitoring and metrics
- [ ] Multi-language template support

##  Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

##  License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

 **Star this repo** if you found it helpful!
