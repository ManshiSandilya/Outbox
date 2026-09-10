import { prisma } from '../lib/prisma';

/**
 * Sends through the incoming webhook created at installation, falling back to
 * chat.postMessage when an installation is configured with a channel instead.
 * Notification failure is intentionally non-fatal to the email worker.
 */
export async function notifySlack(tenantId: string, message: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      slackAccessToken: true,
      slackWebhookUrl: true,
      slackChannelId: true,
    },
  });

  if (!tenant?.slackAccessToken) {
    return;
  }

  try {
    if (tenant.slackWebhookUrl) {
      const response = await fetch(tenant.slackWebhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: message }),
      });

      if (!response.ok) {
        console.error(`Slack incoming-webhook notification failed: ${response.status}`);
      }
      return;
    }

    if (!tenant.slackChannelId) {
      return;
    }

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tenant.slackAccessToken}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: tenant.slackChannelId, text: message }),
    });
    const result = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) {
      console.error(`Slack chat.postMessage failed: ${result.error ?? response.status}`);
    }
  } catch (error) {
    console.error('Slack notification failed', error);
  }
}
