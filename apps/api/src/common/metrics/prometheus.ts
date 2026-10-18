import {
  Controller,
  Get,
  Header,
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

interface MetricRecord {
  count: number;
  totalDuration: number;
}

// In-memory Prometheus metric accumulators
const requestCounters = new Map<string, number>();
const requestDurations = new Map<string, MetricRecord>();
const bullmqJobDurations = new Map<string, MetricRecord>();
const bullmqWaitingGauges = new Map<string, number>();

/**
 * Records an HTTP request duration and increment counter.
 */
export const recordHttpRequest = (
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number,
) => {
  const normRoute = route || 'unknown';
  const key = `method="${method}",route="${normRoute}",status="${statusCode}"`;

  // Increment counter
  requestCounters.set(key, (requestCounters.get(key) || 0) + 1);

  // Accumulate duration histogram sum/count
  const current = requestDurations.get(key) || { count: 0, totalDuration: 0 };
  current.count++;
  current.totalDuration += durationSeconds;
  requestDurations.set(key, current);
};

/**
 * Records a BullMQ job duration.
 */
export const recordBullMqJob = (queue: string, jobType: string, durationSeconds: number) => {
  const key = `queue="${queue}",job_type="${jobType}"`;
  const current = bullmqJobDurations.get(key) || { count: 0, totalDuration: 0 };
  current.count++;
  current.totalDuration += durationSeconds;
  bullmqJobDurations.set(key, current);
};

/**
 * Updates BullMQ waiting job gauge.
 */
export const updateBullMqWaiting = (queue: string, waitingCount: number) => {
  bullmqWaitingGauges.set(queue, waitingCount);
};

/**
 * NestJS Interceptor that automatically records HTTP request metrics.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const start = process.hrtime();

    return next.handle().pipe(
      tap(() => {
        const diff = process.hrtime(start);
        const durationSeconds = diff[0] + diff[1] / 1e9;
        const route = req.route?.path || req.path;
        recordHttpRequest(req.method, route, res.statusCode, durationSeconds);
      }),
    );
  }
}

/**
 * Prometheus Metrics Controller
 * Exposes /metrics for scrapers (Grafana Alloy / Prometheus)
 */
@Controller('metrics')
export class MetricsController {
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    const lines: string[] = [];

    // 1. Process metrics
    lines.push('# HELP process_uptime_seconds Process uptime in seconds.');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${process.uptime()}`);

    const memoryUsage = process.memoryUsage();
    lines.push('# HELP process_resident_memory_bytes Resident memory size in bytes.');
    lines.push('# TYPE process_resident_memory_bytes gauge');
    lines.push(`process_resident_memory_bytes ${memoryUsage.rss}`);

    lines.push('# HELP process_heap_used_bytes Process heap memory used in bytes.');
    lines.push('# TYPE process_heap_used_bytes gauge');
    lines.push(`process_heap_used_bytes ${memoryUsage.heapUsed}`);

    // 2. HTTP Requests Total
    lines.push('# HELP http_requests_total Total number of HTTP requests made.');
    lines.push('# TYPE http_requests_total counter');
    if (requestCounters.size === 0) {
      lines.push(`http_requests_total{method="GET",route="/health/live",status="200"} 0`);
    } else {
      for (const [labels, count] of requestCounters.entries()) {
        lines.push(`http_requests_total{${labels}} ${count}`);
      }
    }

    // 3. HTTP Request Duration Seconds
    lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds.');
    lines.push('# TYPE http_request_duration_seconds summary');
    for (const [labels, rec] of requestDurations.entries()) {
      lines.push(`http_request_duration_seconds_sum{${labels}} ${rec.totalDuration.toFixed(4)}`);
      lines.push(`http_request_duration_seconds_count{${labels}} ${rec.count}`);
    }

    // 4. BullMQ Job Metrics
    lines.push('# HELP bullmq_job_duration_seconds Duration of processed BullMQ jobs.');
    lines.push('# TYPE bullmq_job_duration_seconds summary');
    for (const [labels, rec] of bullmqJobDurations.entries()) {
      lines.push(`bullmq_job_duration_seconds_sum{${labels}} ${rec.totalDuration.toFixed(4)}`);
      lines.push(`bullmq_job_duration_seconds_count{${labels}} ${rec.count}`);
    }

    lines.push('# HELP bullmq_jobs_waiting Number of waiting jobs in queue.');
    lines.push('# TYPE bullmq_jobs_waiting gauge');
    if (bullmqWaitingGauges.size === 0) {
      lines.push(`bullmq_jobs_waiting{queue="worker-core"} 0`);
    } else {
      for (const [queue, count] of bullmqWaitingGauges.entries()) {
        lines.push(`bullmq_jobs_waiting{queue="${queue}"} ${count}`);
      }
    }

    return lines.join('\n') + '\n';
  }
}
