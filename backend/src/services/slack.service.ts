import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { redisConnection } from '../config/redis';

const prisma = new PrismaClient();

export class SlackService {
  public static async notifyRateLimitHit(userId: string, senderEmail: string, limit: number): Promise<void> {
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user || !user.slackToken || !user.slackChannel) {
        return;
      }

      // Check if we already alerted for this sender during the current hour window
      const currentHourWindow = Math.floor(Date.now() / 3600000);
      const alertKey = `slack:alerted:${senderEmail}:${currentHourWindow}`;
      const alreadyAlerted = await redisConnection.set(alertKey, '1', 'EX', 3600, 'NX');

      if (!alreadyAlerted) {
        return; // Already notified Slack for this hour window
      }

      const text = `⚠️ *Rate Limit Warning - ReachInbox*\nSender Account *${senderEmail}* has reached its hourly threshold of *${limit} emails/hr*.\nPending jobs for this window have been delayed to the next hour.`;

      await axios.post(
        'https://slack.com/api/chat.postMessage',
        {
          channel: user.slackChannel,
          text
        },
        {
          headers: {
            Authorization: `Bearer ${user.slackToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (error: any) {
      console.error('Failed to dispatch Slack alert:', error?.response?.data || error.message);
    }
  }
}