import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * Thin wrapper around Brevo's transactional email API.
 *
 * Uses the raw HTTPS endpoint rather than `@getbrevo/brevo` so that the
 * SDK's CommonJS + axios dependency chain doesn't affect our ESM/tsx build
 * hot-path. The payload shape is identical to Brevo's documented request
 * body at POST https://api.brevo.com/v3/smtp/email.
 *
 * When BREVO_API_KEY is not configured, all sends are no-ops and return
 * `{ sent: false, reason: 'disabled' }` so callers can degrade gracefully.
 */

export interface BrevoSendParams {
  to: { email: string; name?: string };
  subject: string;
  htmlContent: string;
  textContent?: string;
  tags?: string[];
}

export interface BrevoSendResult {
  sent: boolean;
  messageId?: string;
  reason?: string;
}

class BrevoService {
  get enabled(): boolean {
    return config.brevo.enabled;
  }

  async send(params: BrevoSendParams): Promise<BrevoSendResult> {
    if (!this.enabled) {
      logger.warn({ to: params.to.email }, 'Brevo send skipped — BREVO_API_KEY not configured');
      return { sent: false, reason: 'disabled' };
    }

    const body = {
      sender: {
        email: config.brevo.senderEmail,
        name: config.brevo.senderName,
      },
      to: [params.to],
      subject: params.subject,
      htmlContent: params.htmlContent,
      textContent: params.textContent ?? stripHtml(params.htmlContent),
      ...(params.tags && params.tags.length > 0 ? { tags: params.tags } : {}),
    };

    try {
      const url = new URL('https://api.brevo.com/v3/smtp/email');
      if (url.hostname !== 'api.brevo.com') {
        throw new Error('SSRF protection: Invalid hostname');
      }

      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'api-key': config.brevo.apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.error(
          { status: res.status, body: text, to: params.to.email },
          'Brevo send failed',
        );
        return { sent: false, reason: `http_${res.status}` };
      }

      const data = (await res.json().catch(() => ({}))) as { messageId?: string };
      logger.info({ to: params.to.email, messageId: data.messageId }, 'Brevo email sent');
      return { sent: true, messageId: data.messageId };
    } catch (err) {
      logger.error({ err, to: params.to.email }, 'Brevo send threw');
      return { sent: false, reason: 'exception' };
    }
  }

  /**
   * Send the SoulSeer newsletter welcome email. Safe to call even when
   * Brevo is disabled — it will no-op.
   */
  async sendNewsletterWelcome(email: string): Promise<BrevoSendResult> {
    if (!config.brevo.welcomeEnabled) {
      return { sent: false, reason: 'welcome_disabled' };
    }

    const subject = 'Welcome to SoulSeer ✨';
    const htmlContent = renderWelcomeHtml(email);
    const textContent = renderWelcomeText();

    return this.send({
      to: { email },
      subject,
      htmlContent,
      textContent,
      tags: ['newsletter', 'welcome'],
    });
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderWelcomeHtml(email: string): string {
  const unsubscribeUrl =
    `https://soulseerpsychics.com/unsubscribe?email=${encodeURIComponent(email)}`;
  return `<!DOCTYPE html>
<html>
  <body style="font-family: Georgia, 'Playfair Display', serif; background:#0A0A0F; color:#FFFFFF; padding:32px;">
    <div style="max-width:560px; margin:0 auto; background:#13111A; border:1px solid #D4AF37; border-radius:12px; padding:32px;">
      <h1 style="font-family: 'Alex Brush', cursive; color:#FF69B4; font-size:42px; margin:0 0 16px; text-align:center;">SoulSeer</h1>
      <p style="font-size:18px; line-height:1.6; margin:0 0 16px;">Welcome to the SoulSeer soul tribe ✨</p>
      <p style="font-size:16px; line-height:1.6; margin:0 0 16px;">
        You're now on the list. We'll share new reader announcements, platform updates, and occasional
        wisdom from our community of gifted psychics.
      </p>
      <p style="font-size:16px; line-height:1.6; margin:0 0 24px;">
        Ready to get started? Browse our currently online readers and find the perfect match for your journey.
      </p>
      <div style="text-align:center; margin:24px 0;">
        <a href="https://soulseerpsychics.com/readers"
           style="display:inline-block; background:#FF69B4; color:#0A0A0F; font-weight:bold; padding:12px 24px; border-radius:8px; text-decoration:none;">
          Browse Readers
        </a>
      </div>
      <p style="font-size:12px; color:#999; margin-top:32px; text-align:center;">
        You're receiving this because you subscribed at soulseerpsychics.com.<br>
        <a href="${unsubscribeUrl}" style="color:#D4AF37;">Unsubscribe</a>
      </p>
    </div>
  </body>
</html>`;
}

function renderWelcomeText(): string {
  return `Welcome to the SoulSeer soul tribe ✨

You're now on the list. We'll share new reader announcements, platform updates, and occasional wisdom from our community of gifted psychics.

Browse online readers: https://soulseerpsychics.com/readers

You can unsubscribe at any time from your account settings or the link at the bottom of any newsletter email.`;
}

export const brevoService = new BrevoService();
