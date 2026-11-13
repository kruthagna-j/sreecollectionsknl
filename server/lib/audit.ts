import { newId, nowIso, type DB } from "../db.js";

export function audit(
  db: DB,
  actorId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {}
): void {
  db.prepare(
    "INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(newId(), actorId, action, entityType, entityId, JSON.stringify(details), nowIso());
}
