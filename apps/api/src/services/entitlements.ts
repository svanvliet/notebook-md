import { query } from '../db/pool.js';

export interface LimitCheck {
  allowed: boolean;
  reason?: string;
  current: number;
  limit: number;
}

export interface PlanEntitlements {
  maxCloudNotebooks: number;
  maxStorageBytes: number;
  maxDocSizeBytes: number;
}

export interface UsageCounters {
  cloudNotebookCount: number;
  cloudStorageBytes: number;
}

export async function getUserPlan(userId: string): Promise<string> {
  const result = await query<{ plan_id: string }>(
    'SELECT plan_id FROM user_plan_subscriptions WHERE user_id = $1 AND is_active = true',
    [userId],
  );
  return result.rows[0]?.plan_id ?? 'free';
}

export async function getEntitlements(userId: string): Promise<PlanEntitlements> {
  const planId = await getUserPlan(userId);
  const result = await query<{ entitlement_key: string; entitlement_value: string }>(
    'SELECT entitlement_key, entitlement_value FROM plan_entitlements WHERE plan_id = $1',
    [planId],
  );

  const map = new Map(result.rows.map(r => [r.entitlement_key, r.entitlement_value]));
  return {
    maxCloudNotebooks: parseInt(map.get('max_cloud_notebooks') ?? '3', 10),
    maxStorageBytes: parseInt(map.get('max_storage_bytes') ?? '524288000', 10),
    maxDocSizeBytes: parseInt(map.get('max_doc_size_bytes') ?? '5242880', 10),
  };
}

export async function getUsage(userId: string): Promise<UsageCounters> {
  const result = await query<{ counter_key: string; counter_value: string }>(
    'SELECT counter_key, counter_value FROM user_usage_counters WHERE user_id = $1',
    [userId],
  );

  const map = new Map(result.rows.map(r => [r.counter_key, BigInt(r.counter_value)]));
  return {
    cloudNotebookCount: Number(map.get('cloud_notebook_count') ?? 0n),
    cloudStorageBytes: Number(map.get('cloud_storage_bytes') ?? 0n),
  };
}

export async function getBannerState(userId: string): Promise<'none' | 'warn_90' | 'exceeded_100'> {
  const entitlements = await getEntitlements(userId);
  const usage = await getUsage(userId);

  const ratio = usage.cloudStorageBytes / entitlements.maxStorageBytes;
  if (ratio >= 1.0) return 'exceeded_100';
  if (ratio >= 0.9) return 'warn_90';
  return 'none';
}

export async function canCreateCloudNotebook(userId: string): Promise<LimitCheck> {
  const entitlements = await getEntitlements(userId);
  const usage = await getUsage(userId);

  return {
    allowed: usage.cloudNotebookCount < entitlements.maxCloudNotebooks,
    reason: usage.cloudNotebookCount >= entitlements.maxCloudNotebooks
      ? `Cloud notebook limit reached (${entitlements.maxCloudNotebooks})`
      : undefined,
    current: usage.cloudNotebookCount,
    limit: entitlements.maxCloudNotebooks,
  };
}

export async function canWriteDocument(userId: string, additionalBytes: number): Promise<LimitCheck> {
  const entitlements = await getEntitlements(userId);
  const usage = await getUsage(userId);

  // V1: soft quota — always allow writes, just report the state
  return {
    allowed: true,
    current: usage.cloudStorageBytes + additionalBytes,
    limit: entitlements.maxStorageBytes,
  };
}

export async function checkDocumentSize(sizeBytes: number): Promise<LimitCheck> {
  const maxDocSize = 5242880; // 5 MB default
  return {
    allowed: true, // V1: soft quota
    current: sizeBytes,
    limit: maxDocSize,
  };
}
