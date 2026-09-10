import type { RequestHandler } from 'express';

/**
 * Temporary tenant resolver. Task 9 replaces its body with the authenticated
 * session tenant without changing route handlers.
 */
export const attachTenant: RequestHandler = (req, _res, next) => {
  req.tenantId =
    process.env.DEFAULT_TENANT_ID ?? '00000000-0000-0000-0000-000000000001';
  next();
};
