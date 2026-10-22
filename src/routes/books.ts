import { Request, RequestHandler, Router } from 'express';
import { HttpError } from '../errors/httpError';
import { requireUser } from '../middleware/requireUser';
import {
  createBook,
  deleteBook,
  findBookByIsbn,
  findBookById,
  findBooksByTitleOrAuthor,
  updateBook,
} from '../repositories/bookRepository';
import type { CreateBookInput, UpdateBookInput } from '../repositories/bookRepository';

export interface BookIdParams {
  id: string;
  [key: string]: string;
}

export interface SearchBooksQuery {
  q?: string;
  page?: string;
  pageSize?: string;
}

export interface CreateBookBody {
  title?: unknown;
  author?: unknown;
  isbn?: unknown;
  totalCopies?: unknown;
}

export interface UpdateBookBody {
  title?: unknown;
  author?: unknown;
  isbn?: unknown;
  totalCopies?: unknown;
}

export function requireLibrarian(req: Request): void {
  if (req.user?.role !== 'librarian') {
    throw new HttpError(403, 'Librarian role required');
  }
}

function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    throw new HttpError(404, 'Book not found');
  }
  return id;
}

function parsePositiveInteger(value: string | undefined, field: string, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new HttpError(400, `${field} must be a positive integer`);
  }
  return parsed;
}

export function parsePagination(query: SearchBooksQuery): { page: number; pageSize: number } {
  const page = parsePositiveInteger(query.page, 'page', 1);
  const pageSize = parsePositiveInteger(query.pageSize, 'pageSize', 10);
  if (pageSize > 100) {
    throw new HttpError(400, 'pageSize must not exceed 100');
  }
  return { page, pageSize };
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `${field} is required`);
  }
  return value.trim();
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new HttpError(400, `${field} must be a positive integer`);
  }
  return value;
}

export const listBooksHandler: RequestHandler<
  Record<string, never>,
  unknown,
  unknown,
  SearchBooksQuery
> = (req, res) => {
  res.status(200).json(findBooksByTitleOrAuthor(''));
};

export const searchBooksHandler: RequestHandler<
  Record<string, never>,
  unknown,
  unknown,
  SearchBooksQuery
> = (req, res, next) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const matches = findBooksByTitleOrAuthor(req.query.q ?? '');
    const start = (page - 1) * pageSize;
    res.status(200).json({
      data: matches.slice(start, start + pageSize),
      total: matches.length,
    });
  } catch (err) {
    next(err);
  }
};

export const getBookHandler: RequestHandler<BookIdParams> = (req, res, next) => {
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

export const createBookHandler: RequestHandler<
  Record<string, never>,
  unknown,
  CreateBookBody
> = (req, res, next) => {
  try {
    requireLibrarian(req);
    const body: CreateBookBody = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const input: CreateBookInput = {
      title: requireNonEmptyString(body.title, 'title'),
      author: requireNonEmptyString(body.author, 'author'),
      isbn: requireNonEmptyString(body.isbn, 'isbn'),
      totalCopies: requirePositiveInteger(body.totalCopies, 'totalCopies'),
    };
    if (findBookByIsbn(input.isbn) !== undefined) {
      throw new HttpError(409, 'ISBN already exists');
    }
    res.status(201).json(createBook(input));
  } catch (err) {
    next(err);
  }
};

export const updateBookHandler: RequestHandler<BookIdParams, unknown, UpdateBookBody> = (
  req,
  res,
  next,
) => {
  try {
    requireLibrarian(req);
    const id = parseId(req.params.id);
    if (findBookById(id) === undefined) {
      throw new HttpError(404, 'Book not found');
    }

    const body: UpdateBookBody = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const input: UpdateBookInput = {};

    if (body.title !== undefined) {
      input.title = requireNonEmptyString(body.title, 'title');
    }
    if (body.author !== undefined) {
      input.author = requireNonEmptyString(body.author, 'author');
    }
    if (body.isbn !== undefined) {
      const isbn = requireNonEmptyString(body.isbn, 'isbn');
      if (findBookByIsbn(isbn, id) !== undefined) {
        throw new HttpError(409, 'ISBN already exists');
      }
      input.isbn = isbn;
    }
    if (body.totalCopies !== undefined) {
      input.totalCopies = requirePositiveInteger(body.totalCopies, 'totalCopies');
    }

    const updated = updateBook(id, input);
    if (updated === undefined) {
      throw new HttpError(409, 'Total copies cannot drop below the number of copies on loan');
    }
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
};

export const deleteBookHandler: RequestHandler<BookIdParams> = (req, res, next) => {
  try {
    requireLibrarian(req);
    const id = parseId(req.params.id);
    const book = findBookById(id);
    if (book === undefined) {
      throw new HttpError(404, 'Book not found');
    }
    if (book.totalCopies - book.availableCopies > 0) {
      throw new HttpError(409, 'Cannot delete a book with copies on loan');
    }
    deleteBook(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const booksRouter = Router();

booksRouter.use(requireUser);

booksRouter.get('/', listBooksHandler);
booksRouter.get('/search', searchBooksHandler);
booksRouter.get('/:id', getBookHandler);
booksRouter.post('/', createBookHandler);
booksRouter.patch('/:id', updateBookHandler);
booksRouter.delete('/:id', deleteBookHandler);
