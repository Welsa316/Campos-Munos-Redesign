// One way to run several statements as a unit. `db` is a pg Pool (or
// anything with connect()); fn gets the client and its result is returned
// after COMMIT. Any throw rolls back (once) and is rethrown unchanged, so a
// caller's own error classes (a 409 with details) pass straight through.
export async function inTransaction(db, fn) {
  const client = await db.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export default inTransaction
