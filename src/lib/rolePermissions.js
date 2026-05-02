export const ROLES = {
  ADMIN: "admin",
  OPS: "ops",
  VIEWER: "viewer",
};

export const ROLE_ORDER = {
  [ROLES.VIEWER]: 1,
  [ROLES.OPS]: 2,
  [ROLES.ADMIN]: 2,
};

export function normalizeRole(role) {
  const next = String(role || "").toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(ROLE_ORDER, next) ? next : ROLES.VIEWER;
}

export function isAdminRole(role) {
  return normalizeRole(role) === ROLES.ADMIN;
}

export function isOpsRole(role) {
  return normalizeRole(role) === ROLES.OPS;
}

export function isViewerRole(role) {
  return normalizeRole(role) === ROLES.VIEWER;
}

export function isPrivilegedRole(role) {
  const normalized = normalizeRole(role);
  return normalized === ROLES.ADMIN || normalized === ROLES.OPS;
}

export function hasRoleAtLeast(role, minimumRole) {
  if (!minimumRole) return true;
  return (ROLE_ORDER[normalizeRole(role)] || 0) >= (ROLE_ORDER[normalizeRole(minimumRole)] || 0);
}

export function canOperate(role) {
  return isPrivilegedRole(role);
}

export function canOperateFlights(role) { return canOperate(role); }
export function canCreateFlights(role) { return canOperate(role); }
export function canEditFlights(role) { return canOperate(role); }
export function canCancelFlights(role) { return canOperate(role); }
export function canDeleteFlights(role) { return canOperate(role); }
export function canViewManagement(role) { return canOperate(role); }
export function canViewAnalytics(role) { return canOperate(role); }
export function canManageUsers(role) { return canOperate(role); }
