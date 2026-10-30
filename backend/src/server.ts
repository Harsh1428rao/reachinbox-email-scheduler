import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { emailQueue } from './queues/email.queue';
import { initEmailWorker } from './queues/email.worker';
import { initElasticsearch } from './config/elasticsearch';
import { EmailController } from './controllers/email.controller';
import { authenticateJwt } from './middleware/auth.middleware';
import axios from 'axios';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

app.use(cors({ origin: '*' }));
app.use(express.json());

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter
});
app.use('/admin/queues', serverAdapter.getRouter());

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google Token' });
    }

    const user = await prisma.user.upsert({
      where: { email: payload.email },
      update: { name: payload.name, avatar: payload.picture },
      create: {
        email: payload.email,
        name: payload.name,
        avatar: payload.picture,
        googleId: payload.sub
      }
    });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'supersecretjwtkey_reachinbox_2026',
      { expiresIn: '7d' }
    );
    return res.json({ token, user });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/slack/oauth', authenticateJwt, async (req: any, res) => {
  try {
    const { code } = req.body;
    const response = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: process.env.SLACK_REDIRECT_URI
      }
    });

    if (!response.data.ok) {
      return res.status(400).json({ error: response.data.error });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        slackToken: response.data.access_token,
        slackChannel: response.data.incoming_webhook?.channel_id || response.data.authed_user?.id
      }
    });

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/emails/schedule', authenticateJwt, EmailController.scheduleEmails);
app.get('/api/emails/search', authenticateJwt, EmailController.searchEmails);

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Bull-Board running on http://localhost:${PORT}/admin/queues`);
  await initElasticsearch();
  initEmailWorker();
});
