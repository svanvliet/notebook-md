import { useEffect, useState } from 'react';
import type { HealthStatus } from '../hooks/useAdmin';
import { PageHeader, Badge, LoadingSpinner } from '../components/ui';

interface Metrics {
  users: { total: number; active24h: number; active7d: number; signupsToday: number };
  notebooks: Record<string, number>;
  twoFactor: { enabled: number; total: number };
}

export default function DashboardPage({
  getHealth,
  getMetrics,
}: {
  getHealth: () => Promise<HealthStatus>;
  getMetrics: () => Promise<Metrics>;
}) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    getHealth().then(setHealth);
    getMetrics().then(setMetrics);
  }, [getHealth, getMetrics]);

  return (
    <div className="p-6">
      <PageHeader title="Dashboard" />

      {/* Health */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-3">System Health</h3>
        {health ? (
          <>
            <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
              <span>Status:</span>
              <Badge variant={health.status === 'ok' ? 'success' : 'error'} dot>
                {health.status === 'ok' ? 'All systems operational' : 'Degraded'}
              </Badge>
              {health.uptimeSeconds != null && (
                <span className="ml-2">
                  API uptime: {Math.floor(health.uptimeSeconds / 3600)}h {Math.floor((health.uptimeSeconds % 3600) / 60)}m
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(health.services).map(([name, svc]) => (
                <div
                  key={name}
                  className={`rounded-lg border p-4 ${
                    svc.status === 'ok'
                      ? 'border-green-200 bg-green-50'
                      : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={svc.status === 'ok' ? 'success' : 'error'} dot>
                      <span className="capitalize">{name}</span>
                    </Badge>
                  </div>
                  {svc.latencyMs != null && (
                    <p className="text-xs text-gray-500">{svc.latencyMs}ms latency</p>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <LoadingSpinner fullPage />
        )}
      </section>

      {/* Metrics */}
      {metrics && (
        <section>
          <h3 className="text-lg font-semibold mb-3">Platform Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total Users" value={metrics.users.total} />
            <MetricCard label="Active (24h)" value={metrics.users.active24h} />
            <MetricCard label="Active (7d)" value={metrics.users.active7d} />
            <MetricCard label="Signups Today" value={metrics.users.signupsToday} />
            <MetricCard label="2FA Enabled" value={metrics.twoFactor.enabled} />
            <MetricCard label="Total Notebooks" value={Object.values(metrics.notebooks).reduce((a, b) => a + b, 0)} />
          </div>

          {Object.keys(metrics.notebooks).length > 0 && (
            <>
              <h3 className="text-lg font-semibold mt-6 mb-3">Notebooks by Source</h3>
              <div className="grid grid-cols-3 gap-4">
                {Object.entries(metrics.notebooks).map(([source, count]) => (
                  <MetricCard key={source} label={source} value={count} />
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}
