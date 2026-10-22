import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from './app';
import { config } from './config';
import { resetBooks } from './repositories/bookRepository';

const withLibrarian = {
  'x-service-key': config.serviceKey,
  'x-user-id': '1',
  'x-user-role': 'librarian',
};

const withMember = {
  'x-service-key': config.serviceKey,
  'x-user-id': '2',
  'x-user-role': 'member',
};

beforeEach(() => {
  resetBooks();
});

describe('requestId on the 404 response', () => {
  it('echoes an incoming x-request-id on an unmatched route', async () => {
    const res = await request(app)
      .get('/nope')
      .set({ ...withLibrarian, 'x-request-id': 'req-abc-123' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not Found', requestId: 'req-abc-123' });
    expect(Object.keys(res.body).sort()).toEqual(['error', 'requestId']);
  });

  it('generates a requestId when the header is absent on an unmatched route', async () => {
    const res = await request(app).get('/nope').set(withLibrarian);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId.trim()).not.toBe('');
    expect(Object.keys(res.body).sort()).toEqual(['error', 'requestId']);
  });

  it('generates a fresh requestId per request', async () => {
    const first = await request(app).get('/nope').set(withLibrarian);
    const second = await request(app).get('/nope').set(withLibrarian);

    expect(first.body.requestId).not.toBe(second.body.requestId);
  });
});

describe('requestId on handler errors', () => {
  it('echoes the incoming request id on a 404 from a route handler', async () => {
    const res = await request(app)
      .get('/books/999')
      .set({ ...withLibrarian, 'x-request-id': 'req-route-1' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Book not found', requestId: 'req-route-1' });
  });

  it('self-generates a requestId on a 409 conflict', async () => {
    await request(app)
      .post('/books')
      .set(withLibrarian)
      .send({ title: 'Dune', author: 'Frank Herbert', isbn: 'abc-1', totalCopies: 1 });

    const res = await request(app)
      .post('/books')
      .set(withLibrarian)
      .send({ title: 'Dune Again', author: 'Frank Herbert', isbn: 'abc-1', totalCopies: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ISBN already exists');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId.trim()).not.toBe('');
  });

  it('echoes the incoming request id on a 403 from the librarian guard', async () => {
    const res = await request(app)
      .post('/books')
      .set({ ...withMember, 'x-request-id': 'req-403' })
      .send({ title: 'Dune', author: 'Frank Herbert', isbn: 'abc-1', totalCopies: 1 });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Librarian role required', requestId: 'req-403' });
  });

  it('self-generates a requestId on a service key rejection', async () => {
    const res = await request(app)
      .get('/books')
      .set({ 'x-user-id': '1', 'x-user-role': 'librarian' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid service key');
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.requestId.trim()).not.toBe('');
  });
});

describe('success responses', () => {
  it('leaves the health payload untouched', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'catalog-service' });
  });

  it('does not add requestId to a book body', async () => {
    await request(app)
      .post('/books')
      .set(withLibrarian)
      .send({ title: 'Dune', author: 'Frank Herbert', isbn: 'abc-1', totalCopies: 1 });

    const res = await request(app).get('/books').set({ ...withLibrarian, 'x-request-id': 'req-1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Dune');
    expect(res.body[0].requestId).toBeUndefined();
  });
});
