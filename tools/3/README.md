# Penn Planner

An AI-powered planning tool for Wharton MBA students that centralizes academic and recruiting deadlines into a single prioritized to-do list.

## What it does

Wharton students juggle coursework deadlines from **Canvas** and recruiting timelines from **CareerPath** across completely separate platforms — leading to "deadline stacking" where multiple high-stakes commitments converge undetected.

Penn Planner solves this by:

- **Syncing** deadlines from Canvas (assignments, quizzes, exams) and Wharton CareerPath (interviews, applications, case prep) into one place
- **Ranking tasks** using an AI priority engine that weighs deadline urgency, task type (exam > interview > assignment), and competing commitments
- **Recommending work time** for each task (e.g., "Case prep – 45 min")
- **Alerting you** when 3+ deadlines are converging in the next 48 hours
- **Generating a daily AI briefing** powered by Claude that tells you exactly what to focus on

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: SQLite via Prisma
- **AI**: Anthropic Claude (`claude-sonnet-4-6`) for daily briefings

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in the root:

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
DATABASE_URL="file:./dev.db"
```

### 3. Set up the database

```bash
npx prisma migrate dev
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 5. Sync tasks

Click **"Sync Canvas & CareerPath"** on the dashboard to load mock tasks, then click **"Get Briefing"** for your AI-powered daily summary.

## Project Structure

```
app/
├── page.tsx                  # Main dashboard
└── api/
    ├── sync/                 # POST: sync Canvas & CareerPath tasks
    ├── tasks/                # GET/POST tasks
    ├── tasks/[id]/           # PATCH/DELETE individual task
    ├── nudges/               # GET: deadline stacking alerts
    └── summary/              # GET: Claude AI daily briefing
lib/
├── db.ts                     # Prisma client
├── mock-data.ts              # Mock Canvas + CareerPath data
└── priority-engine.ts        # Scoring logic + Claude integration
components/
├── TaskCard.tsx              # Task card with Start / Done actions
└── AddTaskModal.tsx          # Manual task entry form
```

