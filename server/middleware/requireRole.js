// Role gate for actions that change financial records or external systems
// (approving an import, saving a match, syncing monday.com). Runs after
// requireAuth, which loads req.adminRole from the database.
export default function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.adminRole || !roles.includes(req.adminRole)) {
      return res.status(403).json({ error: 'Your account cannot perform this action' })
    }
    next()
  }
}
