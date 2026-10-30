# ReachInbox Email Job Scheduler & Dispatcher

A production-grade, distributed cold email scheduling system built to handle high throughput, persistence across restarts, intelligent rate limiting, and real-time observability.

## System Tech Stack
- **Backend:** Express.js, TypeScript, BullMQ, Redis, PostgreSQL (Prisma ORM), Nodemailer (Ethereal fake SMTP), Bull-Board UI, Elasticsearch.
- **Frontend:** React 18, TypeScript, Tailwind CSS, PapaParse, Lucide Icons, `@react-oauth/google`.
- **Infrastructure:** Docker Compose (PostgreSQL, Redis, Elasticsearch).

---

## Getting Started

### 1. Prerequisites
- Docker & Docker Compose
- Node.js >= 18
- npm or yarn

### 2. Infrastructure Setup
Spin up PostgreSQL, Redis, and Elasticsearch:
```bash
docker-compose up -d
```

### 3. Backend Setup
```bash
cd backend
cp ../.env.example .env
npm install
npx prisma db push
npm run dev
```
Backend will be live on `http://localhost:5000`
BullMQ Queue Monitoring Dashboard will be live on `http://localhost:5000/admin/queues`

### 4. Frontend Setup
```bash
cd ../frontend
npm install
npm run dev
```
Frontend will be live on `http://localhost:5173`

---

## Core Features & Architecture Highlights

### 1. BullMQ & Redis Delayed Scheduling (No Cron)
- Uses BullMQ delayed jobs backed by Redis sorted sets (`zset`).
- When a sequence is scheduled, jobs are persisted in PostgreSQL first (`SCHEDULED`), then added to Redis with an explicit `delay` parameter.
- **Survives Server Restarts:** Unexecuted jobs stay in Redis memory/disk snapshot. When the backend or worker restarts, BullMQ picks up right where it left off without duplicate sends.

### 2. Sender Throttling & Hourly Rate Limiting
- **Sliding Hour Buckets:** Redis key `ratelimit:sender:<senderId>:<hourIndex>` atomically increments per send.
- When `MAX_EMAILS_PER_HOUR_PER_SENDER` is exceeded:
  - Jobs are NOT dropped or marked failed.
  - The worker calculates the milliseconds until the next clock hour.
  - Jobs are rescheduled for the beginning of the next hour window.
  - A real-time notification is dispatched to the tenant's connected Slack channel.

### 3. Full-Text Search via Elasticsearch
- Scheduled and sent emails are indexed into the `emails` Elasticsearch index.
- Search queries over email subjects, body content, and recipient addresses execute with sub-10ms response times.
