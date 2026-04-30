export const ROLE_ORDER = { viewer: 1, ops: 2, admin: 3 };

export function normalizeRole(role) {
  const next = String(role || "").toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(ROLE_ORDER, next) ? next : "viewer";
}

export function hasRoleAtLeast(role, minimumRole) {
  if (!minimumRole) return true;
  return (ROLE_ORDER[normalizeRole(role)] || 0) >= (ROLE_ORDER[normalizeRole(minimumRole)] || 0);
}

export function canOperateFlights(role) {
  return hasRoleAtLeast(role, "ops");
}

export function canCreateFlights(role) {
  return hasRoleAtLeast(role, "ops");
}

export function canEditFlights(role) {
  return hasRoleAtLeast(role, "ops");
}

export function canCancelFlights(role) {
  return hasRoleAtLeast(role, "ops");
}

export function canViewAnalytics(role) {
  return hasRoleAtLeast(role, "ops");
}

export function canManageUsers(role) {
  return normalizeRole(role) === "admin";
}

export function canDeleteFlights(role) {
  return normalizeRole(role) === "admin";
}
