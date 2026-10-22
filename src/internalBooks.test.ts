import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from './app';
import { config } from './config';
import { createBook, findBookById, resetBooks } from './repositories/bookRepository';
import type { Book } from './repositories/bookRepository';

const withServiceKey = { 'x-service-key': config.serviceKey };

function seedBook(totalCopies: number): Book {
  return createBook({
    title: 'Dune',
    author: 'Frank Herbert',
    isbn: 'isbn-1',
    totalCopies,
  });
}

beforeEach(() => {
  resetBooks();
});

describe('GET /internal/books/:id', () => {
  it('returns a book without requiring caller identity', async () => {
    const book = seedBook(2);

    const res = await request(app).get(`/internal/books/${book.id}`).set(withServiceKey);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(book.id);
    expect(res.body.availableCopies).toBe(2);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/internal/books/999').set(withServiceKey);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Book not found');
  });
});

describe('POST /internal/books/:id/borrow', () => {
  it('decrements availableCopies by one', async () => {
    const book = seedBook(2);

    const res = await request(app).post(`/internal/books/${book.id}/borrow`).set(withServiceKey);

    expect(res.status).toBe(200);
    expect(res.body.availableCopies).toBe(1);
    expect(findBookById(book.id)?.availableCopies).toBe(1);
  });

  it('responds 409 when no copies are available and leaves the count at zero', async () => {
    const book = seedBook(1);
    await request(app).post(`/internal/books/${book.id}/borrow`).set(withServiceKey);

    const res = await request(app).post(`/internal/books/${book.id}/borrow`).set(withServiceKey);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('No copies available');
    expect(findBookById(book.id)?.availableCopies).toBe(0);
  });

  it('returns 404 for an unknown book', async () => {
    const res = await request(app).post('/internal/books/999/borrow').set(withServiceKey);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Book not found');
  });
});

describe('POST /internal/books/:id/return', () => {
  it('increments availableCopies by one', async () => {
    const book = seedBook(2);
    await request(app).post(`/internal/books/${book.id}/borrow`).set(withServiceKey);

    const res = await request(app).post(`/internal/books/${book.id}/return`).set(withServiceKey);

    expect(res.status).toBe(200);
    expect(res.body.availableCopies).toBe(2);
    expect(findBookById(book.id)?.availableCopies).toBe(2);
  });

  it('never exceeds totalCopies', async () => {
    const book = seedBook(2);

    const first = await request(app).post(`/internal/books/${book.id}/return`).set(withServiceKey);
    expect(first.status).toBe(200);
    expect(first.body.availableCopies).toBe(2);

    const second = await request(app).post(`/internal/books/${book.id}/return`).set(withServiceKey);
    expect(second.status).toBe(200);
    expect(second.body.availableCopies).toBe(2);
  });

  it('returns 404 for an unknown book', async () => {
    const res = await request(app).post('/internal/books/999/return').set(withServiceKey);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Book not found');
  });
});

describe('internal books service key gate', () => {
  it('rejects a missing service key with 401', async () => {
    const book = seedBook(2);

    const getRes = await request(app).get(`/internal/books/${book.id}`);
    expect(getRes.status).toBe(401);
    expect(getRes.body.error).toBe('Invalid service key');

    const borrowRes = await request(app).post(`/internal/books/${book.id}/borrow`);
    expect(borrowRes.status).toBe(401);
    expect(borrowRes.body.error).toBe('Invalid service key');

    const returnRes = await request(app).post(`/internal/books/${book.id}/return`);
    expect(returnRes.status).toBe(401);
    expect(returnRes.body.error).toBe('Invalid service key');

    expect(findBookById(book.id)?.availableCopies).toBe(2);
  });

  it('rejects a wrong service key with 401', async () => {
    const book = seedBook(2);

    const res = await request(app)
      .get(`/internal/books/${book.id}`)
      .set({ 'x-service-key': 'wrong-key' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid service key');
  });
});
