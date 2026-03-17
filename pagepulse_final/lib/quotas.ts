export const FREE_LIMIT = 2;
export const PRO_LIMIT = 1000;
export const ENTERPRISE_LIMIT = Infinity;

export const PRO_MONTHLY_PRICE = 19;
export const PRO_ANNUAL_PRICE = 190;
export const ENTERPRISE_MONTHLY_PRICE = 79;
export const ENTERPRISE_ANNUAL_PRICE = 790;

export function getPlanLimit(plan: string): number {
  switch (plan) {
    case "enterprise":
      return ENTERPRISE_LIMIT;
    case "pro":
      return PRO_LIMIT;
    default:
      return FREE_LIMIT;
  }
}
