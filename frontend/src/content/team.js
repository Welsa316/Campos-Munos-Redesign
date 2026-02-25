export const teamMembers = [
  {
    slug: 'juan',
    route: '/el-equipo/juan',
    nameKey: 'equipo.juan.name',
    roleKey: 'equipo.juan.role'
  },
  {
    slug: 'angenette',
    route: '/el-equipo/angenette',
    nameKey: 'equipo.angenette.name',
    roleKey: 'equipo.angenette.role'
  },
  {
    slug: 'diana',
    route: '/el-equipo/diana',
    nameKey: 'equipo.diana.name',
    roleKey: 'equipo.diana.role'
  },
  {
    slug: 'rio',
    route: '/el-equipo/rio',
    nameKey: 'equipo.rio.name',
    roleKey: 'equipo.rio.role'
  }
];

export const teamMembersBySlug = Object.fromEntries(teamMembers.map((m) => [m.slug, m]));

