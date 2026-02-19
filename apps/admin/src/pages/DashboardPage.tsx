import { useEffect, useState } from 'react';
import type { HealthStatus, Metrics } from '../hooks/useAdmin';

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
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      {/* Health */}
      <section className="mb-8">
        <h3 className="text-lg font-semibold mb-3">System Health</h3>
        {health ? (
          <div className="grid grid-cols-3 gap-4">
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
                  <span
                    className={`w-2 h-2 rounded-full ${
                      svc.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="font-medium capitalize">{name}</span>
                </div>
                {svc.latencyMs != null && (
                  <p className="text-xs text-gray-500">{svc.latencyMs}ms latency</p>
                )}
                {svc.uptimeSeconds != null && (
                  <p className="text-xs text-gray-500">
                    Uptime: {Math.floor(svc.uptimeSeconds / 3600)}h{' '}
                    {Math.floor((svc.uptimeSeconds % 3600) / 60)}m
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">Loading...</p>
        )}
      </section>

      {/* Metrics */}
      {metrics && (
        <section>
          <h3 className="text-lg font-semibold mb-3">Platform Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total Users" value={metrics.users.total} />
            <MetricCard label="Active (7d)" value={metrics.users.active7d} />
            <MetricCard label="Active (30d)" value={metrics.users.active30d} />
            <MetricCard label="Suspended" value={metrics.users.suspended} />
            <MetricCard label="2FA Enabled" value={metrics.twoFactor.enabled} />
            <MetricCard label="Active Sessions" value={metrics.sessions.active} />
            <MetricCard label="Notebooks" value={metrics.notebooks.total} />
            <MetricCard label="Admins" value={metrics.users.admins} />
          </div>

          <h3 className="text-lg font-semibold mt-6 mb-3">Connected Providers</h3>
          <div className="grid grid-cols-3 gap-4">
            <MetricCard label="GitHub" value={metrics.providers.github} />
            <MetricCard label="Microsoft" value={metrics.providers.microsoft} />
            <MetricCard label="Google" value={metrics.providers.google} />
          </div>
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
