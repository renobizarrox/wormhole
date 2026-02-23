import { Queue, Worker } from 'bullmq';
import { config } from '../config.js';
import { executeWorkflowRun } from './runExecutor.js';

const QUEUE_NAME = 'workflow-runs';
const CONNECTION = config.REDIS_URL
  ? { connection: { url: config.REDIS_URL } }
  : undefined;

let queue: Queue | null = null;
let worker: Worker | null = null;

export function getQueue(): Queue | null {
  if (!config.REDIS_URL) return null;
  if (!queue) {
    queue = new Queue(QUEUE_NAME, CONNECTION as { connection: { url: string } });
  }
  return queue;
}

export async function addWorkflowRunJob(workflowRunId: string): Promise<boolean> {
  const q = getQueue();
  if (!q) return false;
  await q.add('run', { workflowRunId }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
  return true;
}

export function startWorker(log: { info: (o: object, msg: string) => void; error: (o: object, msg: string) => void }): void {
  if (!config.REDIS_URL) return;
  if (worker) return;
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { workflowRunId } = job.data as { workflowRunId: string };
      if (!workflowRunId) throw new Error('Missing workflowRunId');
      await executeWorkflowRun(workflowRunId);
    },
    CONNECTION as { connection: { url: string } }
  );
  worker.on('completed', (job) => log.info({ jobId: job.id, workflowRunId: job.data?.workflowRunId }, 'Workflow run job completed'));
  worker.on('failed', (job, err) => log.error({ jobId: job?.id, workflowRunId: job?.data?.workflowRunId, err }, 'Workflow run job failed'));
  log.info({}, 'Queue worker started');
}

export async function closeQueue(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
