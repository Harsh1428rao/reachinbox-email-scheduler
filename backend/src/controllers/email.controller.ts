import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { emailQueue } from '../queues/email.queue';
import { esClient } from '../config/elasticsearch';
import nodemailer from 'nodemailer';

const prisma = new PrismaClient();

export class EmailController {
  public static async scheduleEmails(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { recipientEmails, subject, bodyText, scheduledStartTime, delayBetweenMs } = req.body;

      if (!recipientEmails || !Array.isArray(recipientEmails) || recipientEmails.length === 0) {
        return res.status(400).json({ error: 'Recipients array is required' });
      }

      let sender = await prisma.senderAccount.findFirst({ where: { userId } });
      if (!sender) {
        const testAccount = await nodemailer.createTestAccount();
        sender = await prisma.senderAccount.create({
          data: {
            userId,
            senderEmail: testAccount.user,
            smtpHost: testAccount.smtp.host,
            smtpPort: testAccount.smtp.port,
            smtpUser: testAccount.user,
            smtpPass: testAccount.pass
          }
        });
      }

      const startTime = scheduledStartTime ? new Date(scheduledStartTime).getTime() : Date.now();
      const delayStep = delayBetweenMs ? parseInt(delayBetweenMs, 10) : 2000;
      const createdJobs = [];

      for (let i = 0; i < recipientEmails.length; i++) {
        const targetEmail = recipientEmails[i].trim();
        const calculatedScheduleTime = startTime + i * delayStep;
        const initialDelay = Math.max(0, calculatedScheduleTime - Date.now());

        const dbJob = await prisma.emailJob.create({
          data: {
            userId,
            senderId: sender.id,
            recipientEmail: targetEmail,
            subject,
            bodyText,
            bullJobId: 'pending',
            status: 'SCHEDULED',
            scheduledAt: new Date(calculatedScheduleTime)
          }
        });

        const bullJob = await emailQueue.add(
          'send-email',
          {
            emailJobId: dbJob.id,
            userId,
            senderId: sender.id,
            recipientEmail: targetEmail,
            subject,
            bodyText,
            delayBetweenEmailsMs: delayStep
          },
          {
            delay: initialDelay,
            jobId: `email-${dbJob.id}`
          }
        );

        await prisma.emailJob.update({
          where: { id: dbJob.id },
          data: { bullJobId: String(bullJob.id) }
        });

        await esClient.index({
          index: 'emails',
          id: dbJob.id,
          document: {
            id: dbJob.id,
            userId,
            senderEmail: sender.senderEmail,
            recipientEmail: targetEmail,
            subject,
            bodyText,
            status: 'SCHEDULED',
            scheduledAt: new Date(calculatedScheduleTime),
            sentAt: null
          }
        });

        createdJobs.push(dbJob);
      }

      return res.status(201).json({ message: 'Jobs scheduled successfully', count: createdJobs.length });
    } catch (error: any) {
      console.error(error);
      return res.status(500).json({ error: error.message });
    }
  }

  public static async searchEmails(req: any, res: Response) {
    try {
      const userId = req.user.id;
      const { query, status } = req.query;

      const mustClauses: any[] = [{ term: { userId } }];
      if (status) {
        mustClauses.push({ term: { status } });
      }

      if (query) {
        mustClauses.push({
          multi_match: {
            query: String(query),
            fields: ['recipientEmail', 'subject', 'bodyText']
          }
        });
      }

      const esResult = await esClient.search({
        index: 'emails',
        body: {
          query: { bool: { must: mustClauses } },
          sort: [{ scheduledAt: { order: 'desc' } }],
          size: 100
        }
      });

      const hits = esResult.hits.hits.map((h: any) => h._source);
      return res.json({ data: hits });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }
}
