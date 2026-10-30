# ReachInbox Technical Architecture & Interview Deep-Dive

This guide walks through every technical decision, architecture trade-off, edge case handling, and anticipated interview questions.

---

## 1. High-Level Architecture Overview

```
[ Frontend: React + Tailwind + Vite ]
               |
        REST API / JWT
               v
[ Backend: Express.js + TypeScript ]
       |                 |               \
       v                 v                v
 [ PostgreSQL ]       [ Redis ]     [ Elasticsearch ]
 (Persistence)      (BullMQ Queue)    (Fast Search)
                         |
                         v
                [ BullMQ Workers ]
               (Concurrency = 5)
                /        |       \
               v         v        v
         [Ethereal]  [Slack API] [Rate Limiter]
```

### The Ingestion & Scheduling Pipeline
1. **API Ingestion:** A POST request hits `/api/emails/schedule` containing lead recipients parsed from CSV, email template, scheduled start time, and delay interval.
2. **Database First Record:** Each email is written to PostgreSQL with status `SCHEDULED`.
3. **Queue Enqueue:** A delayed BullMQ job is enqueued with unique `jobId: email-<UUID>`.
4. **Elasticsearch Ingestion:** The pending record is indexed into Elasticsearch to ensure instant discoverability.

---

## 2. Core Technical Decisions & Justifications

### Q1: Why BullMQ over Cron Jobs (`node-cron`, `agenda`, OS crontab)?
- **Persistence Across Restarts:** Node-cron runs in process memory (`setInterval`/`setTimeout`). If the server restarts, memory is cleared and scheduled timers are lost. BullMQ schedules jobs using Redis sorted sets (`zset`) with Unix timestamps as scores. If the server crashes, Redis preserves all state.
- **Distributed Concurrency:** With multiple backend instances, cron runs on every server, causing duplicate sends. BullMQ uses Redis atomic locking (`SETNX` / Lua scripts) ensuring each job is processed exactly once across any number of workers.
- **Backoff & Retries:** BullMQ natively handles exponential backoff, dead-letter queues, and job stalls.

### Q2: How is Idempotency Maintained?
- When a job is picked up by a worker:
  1. The worker queries PostgreSQL for the job ID.
  2. If the status is already `SENT`, the job terminates immediately without sending.
  3. Unique BullMQ job IDs prevent duplicate enqueueing of the same database record.

### Q3: How is the Hourly Rate Limit Enforced Under Load (e.g. 1000+ emails)?
- We use an atomic Redis counter: `ratelimit:sender:<senderId>:<hourTimestamp>`.
- Before sending:
  - `await redis.incr(key)` increments the counter.
  - If counter > `MAX_EMAILS_PER_HOUR`:
    - Calculate `retryAfterMs = nextHourTimestamp - currentTimestamp`.
    - Reschedule the job in BullMQ with `delay: retryAfterMs`.
    - Dispatch a Slack alert to the user's connected Slack webhook/channel.
    - No jobs are lost or marked failed.

### Q4: Why Elasticsearch Alongside PostgreSQL?
- Relational databases suffer severe performance degradation with `LIKE %query%` wildcards across large email bodies and subject fields under high volume.
- Elasticsearch provides inverted indexes, stemming, and fuzzy matching with sub-10ms query execution across millions of logs.

---

## 3. Anticipated Interview Questions & Crisp Answers

**Q: What happens if Redis crashes?**
- Redis runs with AOF (Append-Only File) or RDB snapshots enabled.
- On backend recovery, we can run a reconciliation script that scans PostgreSQL for any jobs in `SCHEDULED` status that are not present in BullMQ and re-hydrate the queue.

**Q: How does the worker avoid SMTP connection exhaustion?**
- Concurrency is bounded (default 5 workers).
- Each worker adheres to a minimum delay step (`delayBetweenEmailsMs`, default 2000ms) between sequential dispatches, mimicking real provider throttle envelopes.

**Q: How does Slack OAuth integrate?**
- The user completes Slack OAuth via standard code-to-token exchange. The resulting access token and incoming channel ID are stored against the tenant/user record in PostgreSQL.
- If a user hasn't linked Slack, rate-limit hits execute silently without failing the job pipeline.
