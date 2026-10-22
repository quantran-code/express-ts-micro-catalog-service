import { RequestHandler } from 'express';
import { HttpError } from '../errors/httpError';

export interface RequestUser {
  id: number;
  role: string;
  memberId: number | null;
}

export const requireUser: RequestHandler = (req, res, next) => {
  const rawUserId = req.header('x-user-id');
  const role = req.header('x-user-role');
  const userId = rawUserId === undefined ? Number.NaN : Number(rawUserId);

  if (
    rawUserId === undefined ||
    rawUserId.trim() === '' ||
    role === undefined ||
    role.trim() === '' ||
    !Number.isInteger(userId) ||
    userId <= 0
  ) {
    next(new HttpError(401, 'Invalid user identity'));
    return;
  }

  req.user = { id: userId, role, memberId: null };
  next();
};
