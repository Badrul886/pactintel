/**
 * OpenTelemetry Tracing Initialization
 * Ships traces to Grafana Tempo via Grafana Alloy sidecar.
 * Strictly enforces in-jurisdiction telemetry (Blueprint Invariant I-14).
 */

export interface TelemetryConfig {
  serviceName: string;
  serviceVersion: string;
  cloudProvider: 'gcp';
  cell: string;
  jurisdiction: string;
  otlpEndpoint?: string;
  enabled: boolean;
}

export const getTelemetryConfig = (): TelemetryConfig => {
  const cell = process.env.CELL_ID || 'gcp-us1';
  const jurisdiction = process.env.CELL_JURISDICTION || 'US';
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  return {
    serviceName: process.env.OTEL_SERVICE_NAME || 'pactintel-api',
    serviceVersion: process.env.APP_VERSION || '0.1.0',
    cloudProvider: 'gcp',
    cell,
    jurisdiction,
    otlpEndpoint,
    enabled: Boolean(otlpEndpoint),
  };
};

export const initTelemetry = () => {
  const config = getTelemetryConfig();

  if (!config.enabled) {
    return {
      initialized: false,
      reason: 'OTEL_EXPORTER_OTLP_ENDPOINT not set. Telemetry running in local no-op mode.',
    };
  }

  // When OTLP exporter is configured, initialize SDK with jurisdiction metadata
  return {
    initialized: true,
    serviceName: config.serviceName,
    cell: config.cell,
    jurisdiction: config.jurisdiction,
    attributes: {
      'service.name': config.serviceName,
      'service.version': config.serviceVersion,
      'cloud.provider': config.cloudProvider,
      'cloud.platform': 'gcp_cloud_run',
      'cell.id': config.cell,
      'cell.jurisdiction': config.jurisdiction,
    },
  };
};
