import { Worker, Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { redisConnection } from '../config/redis';
import { EMAIL_QUEUE_NAME, emailQueue } from './email.queue';
import { PrismaClient } from '@prisma/client';
import { RateLimiterService } from '../services/rateLimiter.service';
import { SlackService } from '../services/slack.service';
import { esClient } from '../config/elasticsearch';

const prisma = new PrismaClient();
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '5', 10);
const GLOBAL_MIN_DELAY_MS = parseInt(process.env.MIN_DELAY_BETWEEN_EMAILS_MS || '2000', 10);
const MAX_EMAILS_PER_HOUR = parseInt(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER || '200', 10);

export const initEmailWorker = () => {
  const worker = new Worker(
    EMAIL_QUEUE_NAME,
    async (job: Job) => {
      const { emailJobId, senderId, userId, recipientEmail, subject, bodyText, delayBetweenEmailsMs } = job.data;

      const currentRecord = await prisma.emailJob.findUnique({
        where: { id: emailJobId },
        include: { sender: true }
      });

      if (!currentRecord || currentRecord.status === 'SENT') {
        return;
      }

      const { allowed, retryAfterMs } = await RateLimiterService.checkAndIncrement(senderId, MAX_EMAILS_PER_HOUR);

      if (!allowed) {
        await SlackService.notifyRateLimitHit(userId, currentRecord.sender.senderEmail, MAX_EMAILS_PER_HOUR);

        await prisma.emailJob.update({
          where: { id: emailJobId },
          data: { status: 'DELAYED_RATE_LIMIT' }
        });

        const newDelay = retryAfterMs;
        const newJob = await emailQueue.add('send-email', job.data, {
          delay: newDelay,
          jobId: `rescheduled-${emailJobId}-${Date.now()}`
        });

        await prisma.emailJob.update({
          where: { id: emailJobId },
          data: {
            bullJobId: String(newJob.id),
            scheduledAt: new Date(Date.now() + newDelay)
          }
        });

        return;
      }

      const requiredDelay = delayBetweenEmailsMs || GLOBAL_MIN_DELAY_MS;
      await new Promise((resolve) => setTimeout(resolve, requiredDelay));

      const transporter = nodemailer.createTransport({
        host: currentRecord.sender.smtpHost,
        port: currentRecord.sender.smtpPort,
        auth: {
          user: currentRecord.sender.smtpUser,
          pass: currentRecord.sender.smtpPass
        }
      });

      const info = await transporter.sendMail({
        from: `"${currentRecord.sender.senderEmail}" <${currentRecord.sender.smtpUser}>`,
        to: recipientEmail,
        subject,
        text: bodyText
      });

      const previewUrl = nodemailer.getTestMessageUrl(info) || null;

      const updated = await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          etherealPreviewUrl: previewUrl ? String(previewUrl) : null
        }
      });

      await esClient.index({
        index: 'emails',
        id: updated.id,
        document: {
          id: updated.id,
          userId: updated.userId,
          senderEmail: currentRecord.sender.senderEmail,
          recipientEmail: updated.recipientEmail,
          subject: updated.subject,
          bodyText: updated.bodyText,
          status: 'SENT',
          scheduledAt: updated.scheduledAt,
          sentAt: updated.sentAt
        }
      });
    },
    {
      connection: redisConnection,
      concurrency: WORKER_CONCURRENCY
    }
  );

  worker.on('failed', async (job, err) => {
    if (job?.data?.emailJobId) {
      await prisma.emailJob.update({
        where: { id: job.data.emailJobId },
        data: { status: 'FAILED', failedReason: err.message }
      });
    }
  });

  return worker;
};
