import express, { Request, Response, RequestHandler, ErrorRequestHandler } from 'express';
import { HttpError } from './errors/httpError';
import { requireServiceKey } from './middleware/requireServiceKey';
import { resolveRequestId } from './requestId';
import { booksRouter } from './routes/books';
import { internalBooksRouter } from './routes/internalBooks';

const app = express();

app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', service: 'catalog-service' });
});

const serviceKeyGate: RequestHandler = (req, res, next) => {
  if (req.path === '/health') {
    next();
    return;
  }
  requireServiceKey(req, res, next);
};

app.use(serviceKeyGate);

app.use('/books', booksRouter);
app.use('/internal/books', internalBooksRouter);

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: 'Not Found', requestId: resolveRequestId(req) });
};

// eslint-disable-next-line no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const status = err instanceof HttpError ? err.status : 500;
  res
    .status(status)
    .json({ error: err.message || 'Internal Server Error', requestId: resolveRequestId(req) });
};

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
