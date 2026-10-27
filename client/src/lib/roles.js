export const ROLE_HOME = {
  owner: '/owner',
  warden: '/warden',
  student: '/student',
  maintenance: '/maintenance',
};

// Owners land on the dashboard; the property list lives one level down for them.
export const propertiesPath = (role) => (role === 'owner' ? `${ROLE_HOME.owner}/properties` : ROLE_HOME[role]);

// Where a signed-in person belongs: a temporary password has to be replaced before anything else.
export const homeFor = (user) => (user.mustChangePassword ? '/change-password' : ROLE_HOME[user.role]);
