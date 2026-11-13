import { newId, nowIso } from "../db.js";
export function audit(db, actorId, action, entityType, entityId, details = {}) {
    db.prepare("INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(newId(), actorId, action, entityType, entityId, JSON.stringify(details), nowIso());
}
