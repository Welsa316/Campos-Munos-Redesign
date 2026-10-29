// Audit trail for billing. Details carry ids, counts and statuses only: never
// client names, amounts or message text, which stay in their own tables.
export async function audit(db, { actorId = null, action, entityType, entityId = null, details = {} }) {
  await db.query(
    `INSERT INTO billing_audit_events (actor_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorId, action, entityType, entityId == null ? null : String(entityId), JSON.stringify(details)]
  )
}

export default { audit }
