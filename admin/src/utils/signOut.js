// Sign Out, from any header. logout() resolves false when the server could
// not be reached (useAuth): the person is still signed in there, so the
// page stays where it is (logout has already said so) rather than showing
// the sign-in screen as if it had worked. Tested in admin/test/signOut.test.js.
export async function signOutAndLeave(logout, router) {
  if (!(await logout())) return false
  router.push({ name: 'Login' })
  return true
}
