import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { HealthStatus, AuditEntry } from '../hooks/useAdmin';
import { PageHeader, Badge, LoadingSpinner } from '../components/ui';

interface Metrics {
  users: { total: number; active24h: number; active7d: number; signupsToday: number };
  notebooks: Record<string, number>;
  twoFactor: { enabled: number; total: number };
}

interface DashboardSummary {
  recentActions: AuditEntry[];
  staleFlags: { key: string; description: string | null; staleAt: string; updatedAt: string }[];
  activeFlights: { id: string; name: string; rolloutPercentage: number; flagCount: number; assignmentCount: number }[];
}

export default function DashboardPage({
  getHealth,
  getMetrics,
  getDashboardSummary,
}: {
  getHealth: () => Promise<HealthStatus>;
  getMetrics: () => Promise<Metrics>;
  getDashboardSummary: () => Promise<DashboardSummary>;
}) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    getHealth().then(setHealth);
    getMetrics().then(setMetrics);
    getDashboardSummary().then(setSummary);
  }, [getHealth, getMetrics, getDashboardSummary]);

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

      {/* Dashboard Summary */}
      {summary && (
        <>
          {/* Recent Admin Actions */}
          <section className="mb-8">
            <h3 className="text-lg font-semibold mb-3">Recent Admin Actions</h3>
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-2">Time</th>
                    <th className="px-4 py-2">User</th>
                    <th className="px-4 py-2">Action</th>
                    <th className="px-4 py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentActions.map((e) => (
                    <tr key={e.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 text-xs text-gray-500 whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2 text-xs">{e.userName || e.userEmail || 'Unknown'}</td>
                      <td className="px-4 py-2 text-xs">{e.action}</td>
                      <td className="px-4 py-2 text-xs text-gray-600 max-w-xs truncate">{JSON.stringify(e.details)}</td>
                    </tr>
                  ))}
                  {summary.recentActions.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-400">No recent actions</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Stale Flags */}
          {summary.staleFlags.length > 0 && (
            <section className="mb-8">
              <h3 className="text-lg font-semibold mb-3">⚠️ Stale Flags</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {summary.staleFlags.map((f) => {
                  const staleMs = Date.now() - new Date(f.staleAt).getTime();
                  const staleDays = Math.floor(staleMs / (1000 * 60 * 60 * 24));
                  return (
                    <div key={f.key} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-sm font-semibold">{f.key}</span>
                        <Badge variant="warning">{staleDays}d stale</Badge>
                      </div>
                      {f.description && <p className="text-xs text-gray-600 mb-2">{f.description}</p>}
                      <Link to="/feature-flags" className="text-xs text-blue-600 hover:underline">View flags →</Link>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Active Flights */}
          {summary.activeFlights.length > 0 && (
            <section className="mb-8">
              <h3 className="text-lg font-semibold mb-3">🛫 Active Flights</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {summary.activeFlights.map((f) => (
                  <div key={f.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="font-semibold mb-1">{f.name}</p>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>Rollout: {f.rolloutPercentage}%</span>
                      <span>Flags: {f.flagCount}</span>
                      <span>Assignments: {f.assignmentCount}</span>
                    </div>
                    <Link to="/flights" className="text-xs text-blue-600 hover:underline mt-2 inline-block">View flights →</Link>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
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
