import {
  MetricsController,
  MetricsInterceptor,
  recordHttpRequest,
  recordBullMqJob,
  updateBullMqWaiting,
} from '../../src/common/metrics/prometheus';
import { of } from 'rxjs';

describe('Observability Metrics (Prometheus /metrics Endpoint & Interceptor)', () => {
  let metricsController: MetricsController;

  beforeEach(() => {
    metricsController = new MetricsController();
  });

  it('exposes Prometheus text/plain formatted metrics with system and HTTP counters', () => {
    recordHttpRequest('GET', '/api/documents', 200, 0.045);
    recordBullMqJob('worker-pdf', 'generate-pdf', 1.25);
    updateBullMqWaiting('worker-pdf', 3);

    const metricsOutput = metricsController.getMetrics();

    expect(metricsOutput).toContain('# HELP process_uptime_seconds');
    expect(metricsOutput).toContain('# TYPE process_uptime_seconds gauge');
    expect(metricsOutput).toContain('# HELP process_resident_memory_bytes');
    expect(metricsOutput).toContain('# HELP http_requests_total');
    expect(metricsOutput).toContain(
      'http_requests_total{method="GET",route="/api/documents",status="200"}',
    );
    expect(metricsOutput).toContain('http_request_duration_seconds_sum');
    expect(metricsOutput).toContain('bullmq_job_duration_seconds');
    expect(metricsOutput).toContain('bullmq_jobs_waiting{queue="worker-pdf"} 3');
  });

  it('MetricsInterceptor records request duration and status upon handler completion', (done) => {
    const interceptor = new MetricsInterceptor();

    const mockRequest: any = {
      method: 'POST',
      route: { path: '/api/documents/:id/send' },
      path: '/api/documents/doc-1/send',
    };

    const mockResponse: any = {
      statusCode: 200,
    };

    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    };

    const mockHandler: any = {
      handle: () => of({ success: true }),
    };

    interceptor.intercept(mockContext, mockHandler).subscribe({
      next: (val) => {
        expect(val).toEqual({ success: true });
      },
      complete: () => {
        const metricsOutput = metricsController.getMetrics();
        expect(metricsOutput).toContain(
          'http_requests_total{method="POST",route="/api/documents/:id/send",status="200"}',
        );
        done();
      },
    });
  });
});
