import { RequestHandler, Router } from 'express';
import { HttpError } from '../errors/httpError';
import { borrowCopy, findBookById, returnCopy } from '../repositories/bookRepository';
import type { BookIdParams } from './books';

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(404, 'Book not found');
  }
  return id;
}

export const getInternalBookHandler: RequestHandler<BookIdParams> = (req, res, next) => {
  try {
    const book = findBookById(parseId(req.params.id));
    if (book === undefined) {
      throw new HttpError(404, 'Book not found');
    }
    res.status(200).json(book);
  } catch (err) {
    next(err);
  }
};

export const borrowCopyHandler: RequestHandler<BookIdParams> = (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (findBookById(id) === undefined) {
      throw new HttpError(404, 'Book not found');
    }
    const book = borrowCopy(id);
    if (book === undefined) {
      throw new HttpError(409, 'No copies available');
    }
    res.status(200).json(book);
  } catch (err) {
    next(err);
  }
};

export const returnCopyHandler: RequestHandler<BookIdParams> = (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (findBookById(id) === undefined) {
      throw new HttpError(404, 'Book not found');
    }
    const book = returnCopy(id);
    if (book === undefined) {
      throw new HttpError(404, 'Book not found');
    }
    res.status(200).json(book);
  } catch (err) {
    next(err);
  }
};

export const internalBooksRouter = Router();

internalBooksRouter.get('/:id', getInternalBookHandler);
internalBooksRouter.post('/:id/borrow', borrowCopyHandler);
internalBooksRouter.post('/:id/return', returnCopyHandler);
