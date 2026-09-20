import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

// In-memory store for 6-digit registration verification codes
interface OtpEntry {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
  verified: boolean;
}

const otpStore = new Map<string, OtpEntry>();

// Disposable email domains list for server-side verification enforcement
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', '10minutemail.com', '10minutemail.net', 'tempmail.com',
  'temp-mail.org', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  'guerrillamailblock.com', 'sharklasers.com', 'grr.la', 'yopmail.com',
  'yopmail.fr', 'yopmail.net', 'throwawaymail.com', 'getnada.com',
  'dispostable.com', 'fakeinbox.com', 'trashmail.com', 'trashmail.net',
  'trashmail.me', 'crazymailing.com', 'mohmal.com', 'generator.email',
  'emailondeck.com', 'burnermail.io', 'maildrop.cc', 'inboxkitten.com',
  'mytemp.email', 'tempr.email', 'discard.email', 'disposablemail.com',
  'tempail.com', 'nada.ltd'
]);

// Helper to configure nodemailer transporter from environment variables
function getMailTransporter() {
  const host = process.env.SMTP_HOST?.trim();
  const port = parseInt(process.env.SMTP_PORT?.trim() || "587", 10);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false,
      },
    });
  }
  return null;
}

/**
 * Builds an anti-spam compliant, high-deliverability plain text verification email.
 * Mirrors the HTML version completely to ensure high text-to-HTML ratio and prevent spam classification.
 */
function buildOtpEmailPlainText(otpCode: string, greetingName: string, cleanEmail: string): string {
  const year = new Date().getFullYear();
  return [
    "MOREX ACCOUNT VERIFICATION",
    "==================================================",
    "",
    `Hello ${greetingName},`,
    "",
    "Thank you for signing up with Morex.",
    "To complete your registration and secure your account, please enter the following 6-digit verification code:",
    "",
    `    VERIFICATION CODE:  ${otpCode}`,
    "",
    "• Valid for 10 minutes",
    "• Single-use only",
    "",
    "SECURITY RECOMMENDATIONS:",
    "- Never share this code with anyone. Morex staff will never ask for your verification code or password.",
    "- If you did not initiate this request, you can safely ignore this email. No account will be created without this passcode.",
    "",
    "==================================================",
    `This automated security notification was sent to ${cleanEmail}.`,
    `Morex Financial Technologies · 100 Bishopsgate, London EC2N 4AG, United Kingdom`,
    `© ${year} Morex. All rights reserved.`
  ].join("\n");
}

/**
 * Builds an anti-spam compliant, responsive table-based HTML email.
 * Avoids non-standard CSS, CSS gradients, or high-risk financial buzzwords ("Arbitrage", "Yield")
 * that trigger SpamAssassin, Microsoft Defender, and Gmail spam filters.
 */
function buildOtpEmailHtml(otpCode: string, greetingName: string, cleanEmail: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xml:lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Morex Account Verification</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; width: 100% !important; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; -webkit-text-size-adjust: none;">
  <!-- Invisible Preheader snippet for inbox preview -->
  <div style="display: none; font-size: 1px; color: #ffffff; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    Your Morex verification passcode is ${otpCode}. Valid for 10 minutes. &#847; &zwnj; &nbsp; &#8199; &shy; &#847; &zwnj; &nbsp; &#8199; &shy; &#847; &zwnj; &nbsp;
  </div>

  <!-- Outer email container -->
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; margin: 0; padding: 36px 12px; width: 100%;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);">
          
          <!-- Header Banner -->
          <tr>
            <td style="padding: 28px 32px 20px 32px; background-color: #0f172a; text-align: center;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="vertical-align: middle;">
                    <span style="display: inline-block; font-size: 20px; font-weight: 900; letter-spacing: 2px; color: #ffffff; text-transform: uppercase;">
                      MOREX
                    </span>
                  </td>
                  <td style="vertical-align: middle; padding-left: 8px;">
                    <span style="display: inline-block; font-size: 10px; font-weight: 700; color: #d97706; background-color: rgba(217, 119, 6, 0.15); border: 1px solid rgba(217, 119, 6, 0.4); border-radius: 4px; padding: 2px 6px; letter-spacing: 1px; text-transform: uppercase;">
                      SECURITY
                    </span>
                  </td>
                </tr>
              </table>
              <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 11px; font-weight: 500; letter-spacing: 0.5px;">
                Official Identity Verification Service
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 28px 32px;">
              <h1 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: #0f172a; line-height: 1.3;">
                Verify your email address
              </h1>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Hello <strong>${greetingName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Thank you for registering with Morex. To complete your account registration and protect your security, please enter this one-time verification passcode:
              </p>

              <!-- Passcode Box -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center" style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px 16px;">
                    <div style="font-family: 'Courier New', Courier, Consolas, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f172a; line-height: 1.2; text-indent: 8px;">
                      ${otpCode}
                    </div>
                    <div style="margin-top: 8px; font-size: 11px; font-weight: 600; color: #64748b; letter-spacing: 0.5px; text-transform: uppercase;">
                      Expires in 10 minutes &bull; Single-use only
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Security Warning Box -->
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td style="background-color: #f1f5f9; border-left: 3px solid #d97706; padding: 12px 14px; border-radius: 0 6px 6px 0;">
                    <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #475569;">
                      <strong style="color: #0f172a;">Security Notice:</strong> Morex representatives will never contact you asking for your verification code or account password. Never share this code with anyone.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748b;">
                If you did not request this verification code, no action is required and you can safely disregard this email. No account will be activated without this passcode.
              </p>
            </td>
          </tr>

          <!-- Footer Divider -->
          <tr>
            <td style="padding: 0 32px;">
              <div style="border-top: 1px solid #f1f5f9; height: 1px; line-height: 1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px 28px 32px; background-color: #ffffff; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 11px; line-height: 1.5; color: #94a3b8;">
                This automated message was sent to <strong style="color: #64748b;">${cleanEmail}</strong> to confirm your email verification request.
              </p>
              <p style="margin: 0 0 6px 0; font-size: 11px; line-height: 1.5; color: #94a3b8;">
                Morex Financial Technologies &bull; 100 Bishopsgate, London EC2N 4AG, United Kingdom
              </p>
              <p style="margin: 0; font-size: 10px; color: #cbd5e1;">
                &copy; ${year} Morex. All rights reserved. Automated security notification.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Clean up expired OTP entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of otpStore.entries()) {
    if (now > val.expiresAt) {
      otpStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Initialize Google Gen AI client with telemetry user agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase body size limits for base64 image uploads
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // API endpoint for sending 6-digit registration OTP email
  app.post("/api/send-email-otp", async (req, res) => {
    try {
      const { email, displayName } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: "A valid email address is required." });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Email format regex validation
      const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: "Invalid email format. Please check for typos." });
      }

      // Check disposable domains
      const domain = cleanEmail.split('@')[1];
      if (domain && DISPOSABLE_DOMAINS.has(domain)) {
        return res.status(400).json({ 
          error: "Disposable and temporary email addresses are not allowed. Please use your genuine personal or business email." 
        });
      }

      // Rate limit check: at least 30 seconds cooldown between OTP resends
      const existing = otpStore.get(cleanEmail);
      const now = Date.now();
      if (existing && now - existing.lastSentAt < 30 * 1000) {
        const remainingSec = Math.ceil((30 * 1000 - (now - existing.lastSentAt)) / 1000);
        return res.status(429).json({ 
          error: `Please wait ${remainingSec} seconds before requesting a new verification code.` 
        });
      }

      // Use provided 6-digit code or generate a secure new one
      const providedCode = req.body?.code?.toString().trim();
      const otpCode = (providedCode && /^\d{6}$/.test(providedCode))
        ? providedCode
        : Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = now + 10 * 60 * 1000; // 10 minutes expiry

      otpStore.set(cleanEmail, {
        code: otpCode,
        email: cleanEmail,
        expiresAt,
        attempts: 0,
        lastSentAt: now,
        verified: false,
      });

      console.log(`[Morex Security] 6-digit OTP code for ${cleanEmail}: ${otpCode}`);

      // Attempt to send real email via configured SMTP
      const transporter = getMailTransporter();
      if (transporter) {
        const mailUser = (process.env.SMTP_USER || '').trim();
        const mailFromEnv = (process.env.SMTP_FROM || '').trim();
        const replyToEnv = (process.env.SMTP_REPLY_TO || '').trim();

        let fromAddress = mailFromEnv || mailUser || 'security@morex.app';
        let fromDisplayName = 'Morex Security';

        // Cleanly parse name and address if formatted as "Name <email@domain>"
        const nameMatch = fromAddress.match(/^["']?([^"<']+)["']?\s*<([^>]+)>/);
        if (nameMatch) {
          fromDisplayName = nameMatch[1].trim();
          fromAddress = nameMatch[2].trim();
        }

        const replyToAddress = replyToEnv || fromAddress;
        const senderDomain = fromAddress.includes('@') ? fromAddress.split('@')[1] : 'morex.app';
        const messageId = `<morex.otp.${Date.now()}.${Math.random().toString(36).substring(2, 9)}@${senderDomain}>`;

        const greetingName = displayName && typeof displayName === 'string' && displayName.trim() 
          ? displayName.trim() 
          : "Valued Member";

        const textContent = buildOtpEmailPlainText(otpCode, greetingName, cleanEmail);
        const htmlContent = buildOtpEmailHtml(otpCode, greetingName, cleanEmail);

        try {
          await transporter.sendMail({
            from: {
              name: fromDisplayName,
              address: fromAddress,
            },
            to: cleanEmail,
            replyTo: replyToAddress,
            subject: `Your Morex verification code: ${otpCode}`,
            text: textContent,
            html: htmlContent,
            headers: {
              'Message-ID': messageId,
              'Date': new Date().toUTCString(),
              'Auto-Submitted': 'auto-generated',
              'X-Auto-Response-Suppress': 'All',
              'X-Priority': '3',
              'X-Mailer': 'Morex Security Mailer',
              'X-Entity-Ref-ID': `morex-otp-${cleanEmail}-${Date.now()}`,
              'Feedback-ID': `otp:verification:morex`,
            },
          });

          return res.json({
            success: true,
            previewMode: false,
            message: `Verification code sent to ${cleanEmail}`,
          });
        } catch (mailErr: any) {
          console.error("[SMTP Error] Failed to send email via SMTP:", mailErr);
          // Fall back to preview response if SMTP fails
          return res.json({
            success: true,
            previewMode: true,
            previewCode: otpCode,
            message: `Verification code generated for ${cleanEmail} (SMTP unavailable: code is ${otpCode})`,
          });
        }
      }

      // Preview / development mode when no SMTP credentials are configured
      return res.json({
        success: true,
        previewMode: true,
        previewCode: otpCode,
        message: `Verification code sent to ${cleanEmail}`,
      });
    } catch (error: any) {
      console.error("Error sending email OTP:", error);
      res.status(500).json({ error: "Failed to dispatch verification code. Please try again." });
    }
  });

  // API endpoint for verifying 6-digit registration OTP
  app.post("/api/verify-email-otp", (req, res) => {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        return res.status(400).json({ error: "Email and verification code are required." });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanCode = code.toString().trim();

      const entry = otpStore.get(cleanEmail);

      if (!entry) {
        return res.status(400).json({ 
          error: "No active verification code found for this email. Please request a new code." 
        });
      }

      const now = Date.now();
      if (now > entry.expiresAt) {
        otpStore.delete(cleanEmail);
        return res.status(400).json({ 
          error: "Verification code has expired. Please request a new code." 
        });
      }

      if (entry.attempts >= 5) {
        otpStore.delete(cleanEmail);
        return res.status(400).json({ 
          error: "Too many incorrect attempts. Please request a new verification code." 
        });
      }

      if (entry.code !== cleanCode) {
        entry.attempts += 1;
        const attemptsLeft = 5 - entry.attempts;
        return res.status(400).json({ 
          error: `Incorrect verification code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining.` 
        });
      }

      // Verification successful
      entry.verified = true;
      res.json({
        success: true,
        verified: true,
        message: "Email address verified successfully!"
      });
    } catch (error: any) {
      console.error("Error verifying OTP:", error);
      res.status(500).json({ error: "Failed to verify code. Please try again." });
    }
  });

  // API endpoint for validating payment receipt images
  app.post("/api/verify-receipt", async (req, res) => {
    try {
      const { image, type, expectedAmount, expectedSymbol } = req.body;

      if (!image) {
        return res.status(400).json({ error: "No proof image provided" });
      }

      // Extract raw base64 data and mime type from data URI (e.g. data:image/png;base64,...)
      const matches = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      let mimeType = "image/png";
      let base64Data = image;

      if (matches && matches.length === 3) {
        mimeType = matches[1];
        base64Data = matches[2];
      }

      const prompt = `You are an automated risk compliance auditor. Your job is to analyze this uploaded receipt screenshot and verify if it represents a valid, legitimate transaction confirmation.
      
      Auditing Task details:
      - Transaction Category: ${type === "crypto" ? "Cryptocurrency Transfer Proof (Blockchain confirmation, TxHash, wallet success screen)" : "Fiat/P2P Mobile Money Receipt"}
      - Expected Amount to verify: ${expectedAmount || "Any"} ${expectedSymbol || ""}
      
      Look for:
      1. Legitimate platform elements (M-Pesa, MTN, standard bank notification, Binance, TrustWallet, MetaMask, TronScan, etc.).
      2. Status indicating success (e.g., "COMPLETED", "SUCCESS", "APPROVED", "DELIVERED", "TxHash verified", "Transfer Successful").
      3. Signs of fake, empty, placeholder, black, or completely unrelated screenshots (e.g., a photo of a person, animal, random meme, desktop background).
      4. Extracted transaction details (TxHash/RefID, Amount, Currency, and Network).
      
      Analyze the receipt image carefully. Be reasonably forgiving of simple compression, but strict against totally unrelated or empty images.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: [
          {
            inlineData: {
              mimeType,
              data: base64Data
            }
          },
          {
            text: prompt
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isValid: {
                type: Type.BOOLEAN,
                description: "True if this is a genuine transaction confirmation/receipt screenshot, even if there are details missing. False if it is a completely unrelated, blank, black, fake, or corrupted image."
              },
              confidence: {
                type: Type.INTEGER,
                description: "Confidence rating of the analysis from 0 to 100."
              },
              extractedAmount: {
                type: Type.NUMBER,
                description: "The amount found on the receipt. Return null if none is found."
              },
              extractedSymbol: {
                type: Type.STRING,
                description: "The coin symbol or currency symbol (e.g. 'USDT', 'USDC', 'BTC', 'UGX', 'KES') found on the receipt. Return null if none is found."
              },
              extractedTxHash: {
                type: Type.STRING,
                description: "The transaction hash, reference ID, or transaction ID found on the receipt. Return null if none is found."
              },
              extractedNetwork: {
                type: Type.STRING,
                description: "The blockchain network (e.g., TRC20, ERC20, BEP20) or payment operator found. Return null if none."
              },
              reasons: {
                type: Type.STRING,
                description: "A short, professional single-sentence explanation of what was found or why it is marked valid/invalid."
              }
            },
            required: ["isValid", "confidence", "reasons"]
          }
        }
      });

      const responseText = response.text || "{}";
      const result = JSON.parse(responseText.trim());

      res.json(result);
    } catch (error: any) {
      console.error("Error in verify-receipt endpoint:", error);
      res.status(500).json({ 
        error: "Failed to audit the proof image.", 
        details: error.message || error 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
