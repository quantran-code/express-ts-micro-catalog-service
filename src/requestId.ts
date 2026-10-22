import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

export function resolveRequestId(req: Request): string {
  const header = req.header('x-request-id');
  if (header !== undefined && header.trim() !== '') {
    return header;
  }
  return randomUUID();
}
