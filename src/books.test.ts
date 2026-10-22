import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from './app';
import { config } from './config';
import {
  borrowCopy,
  createBook,
  findBookById,
  findBooksByTitleOrAuthor,
  resetBooks,
  returnCopy,
} from './repositories/bookRepository';
import type { Book } from './repositories/bookRepository';

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

function seedBooks(count: number, prefix: string): Book[] {
  const created: Book[] = [];
  for (let i = 1; i <= count; i += 1) {
    created.push(
      createBook({
        title: `${prefix} ${i}`,
        author: 'Frank Herbert',
        isbn: `${prefix}-isbn-${i}`,
        totalCopies: 3,
      }),
    );
  }
  return created;
}

beforeEach(() => {
  resetBooks();
});

describe('GET /books', () => {
  it('returns every book as a bare array', async () => {
    seedBooks(2, 'Dune');

    const res = await request(app).get('/books').set(withLibrarian);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Dune 1');
    expect(res.body[1].title).toBe('Dune 2');
  });

  it('rejects a request without the service key', async () => {
    const res = await request(app).get('/books').set({
      'x-user-id': '1',
      'x-user-role': 'librarian',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid service key');
  });

  it('rejects a request without caller identity', async () => {
    const res = await request(app).get('/books').set({ 'x-service-key': config.serviceKey });

    expect(res.status).toBe(401);
  });
});

describe('GET /books/search', () => {
  it('matches title or author case-insensitively and paginates the matches', async () => {
    seedBooks(12, 'Fantasy');
    seedBooks(3, 'Science');

    const res = await request(app)
      .get('/books/search?q=FANTASY&page=2&pageSize=5')
      .set(withLibrarian);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(12);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.data[0].id).toBe(6);
    expect(res.body.data[4].id).toBe(10);
  });

  it('matches on author', async () => {
    createBook({ title: 'Earthsea', author: 'Ursula Le Guin', isbn: 'a-1', totalCopies: 1 });
    createBook({ title: 'Other', author: 'Someone Else', isbn: 'a-2', totalCopies: 1 });

    const res = await request(app).get('/books/search?q=ursula').set(withLibrarian);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].title).toBe('Earthsea');
  });

  it('matches every book when q is missing or blank', async () => {
    seedBooks(15, 'Dune');

    const withoutQuery = await request(app).get('/books/search').set(withLibrarian);
    expect(withoutQuery.status).toBe(200);
    expect(withoutQuery.body.total).toBe(15);
    expect(withoutQuery.body.data).toHaveLength(10);
    expect(withoutQuery.body.data[0].id).toBe(1);

    const blankQuery = await request(app).get('/books/search?q=%20').set(withLibrarian);
    expect(blankQuery.status).toBe(200);
    expect(blankQuery.body.total).toBe(15);

    const firstPage = await request(app)
      .get('/books/search?page=1&pageSize=10')
      .set(withLibrarian);
    expect(firstPage.body).toEqual(withoutQuery.body);
  });

  it('rejects invalid page and pageSize values with 400', async () => {
    seedBooks(3, 'Dune');

    for (const query of [
      'page=0',
      'page=-1',
      'page=1.5',
      'page=abc',
      'pageSize=0',
      'pageSize=101',
      'pageSize=abc',
    ]) {
      const res = await request(app).get(`/books/search?${query}`).set(withLibrarian);
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
      expect(res.body.data).toBeUndefined();
    }
  });
});

describe('GET /books/:id', () => {
  it('returns a book by id', async () => {
    const [book] = seedBooks(1, 'Dune');

    const res = await request(app).get(`/books/${book.id}`).set(withLibrarian);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(book.id);
    expect(res.body.isbn).toBe('Dune-isbn-1');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/books/999').set(withLibrarian);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Book not found');
  });
});

describe('POST /books', () => {
  it('creates a book with availableCopies equal to totalCopies', async () => {
    const res = await request(app).post('/books').set(withLibrarian).send({
      title: '  Dune  ',
      author: ' Frank Herbert ',
      isbn: ' 978-0441013593 ',
      totalCopies: 4,
    });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Dune');
    expect(res.body.author).toBe('Frank Herbert');
    expect(res.body.isbn).toBe('978-0441013593');
    expect(res.body.totalCopies).toBe(4);
    expect(res.body.availableCopies).toBe(4);
    expect(res.body.id).toBe(1);
  });

  it('rejects a duplicate isbn differing only by surrounding whitespace', async () => {
    createBook({ title: 'Dune', author: 'Frank Herbert', isbn: 'abc-1', totalCopies: 1 });

    const res = await request(app)
      .post('/books')
      .set(withLibrarian)
      .send({ title: 'Dune Again', author: 'Frank Herbert', isbn: '  abc-1  ', totalCopies: 2 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ISBN already exists');
    expect(findBooksByTitleOrAuthor('')).toHaveLength(1);
  });

  it('rejects invalid fields with 400 and creates nothing', async () => {
    const invalidBodies = [
      {},
      { author: 'A', isbn: 'i-1', totalCopies: 1 },
      { title: 'T', isbn: 'i-2', totalCopies: 1 },
      { title: 'T', author: 'A', totalCopies: 1 },
      { title: '   ', author: 'A', isbn: 'i-3', totalCopies: 1 },
      { title: 'T', author: 'A', isbn: 'i-4', totalCopies: 0 },
      { title: 'T', author: 'A', isbn: 'i-5', totalCopies: -2 },
      { title: 'T', author: 'A', isbn: 'i-6', totalCopies: 1.5 },
    ];

    for (const body of invalidBodies) {
      const res = await request(app).post('/books').set(withLibrarian).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toBeTruthy();
    }

    expect(findBooksByTitleOrAuthor('')).toHaveLength(0);
  });

  it('forbids a non-librarian caller', async () => {
    const res = await request(app)
      .post('/books')
      .set(withMember)
      .send({ title: 'Dune', author: 'Frank Herbert', isbn: 'abc-1', totalCopies: 1 });

    expect(res.status).toBe(403);
    expect(findBooksByTitleOrAuthor('')).toHaveLength(0);
  });
});

describe('PATCH /books/:id', () => {
  it('updates only the supplied fields and ignores unknown keys', async () => {
    const [book] = seedBooks(1, 'Dune');

    const res = await request(app)
      .patch(`/books/${book.id}`)
      .set(withLibrarian)
      .send({ title: '  New Title  ', unknownField: 'ignored' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('New Title');
    expect(res.body.author).toBe('Frank Herbert');
    expect(res.body.isbn).toBe('Dune-isbn-1');
    expect(res.body.unknownField).toBeUndefined();
  });

  it('returns the unchanged book for an empty body', async () => {
    const [book] = seedBooks(1, 'Dune');

    const res = await request(app).patch(`/books/${book.id}`).set(withLibrarian).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual(book);
  });

  it('allows a book to keep its own isbn', async () => {
    const [book] = seedBooks(1, 'Dune');

    const res = await request(app)
      .patch(`/books/${book.id}`)
      .set(withLibrarian)
      .send({ isbn: ' Dune-isbn-1 ' });

    expect(res.status).toBe(200);
    expect(res.body.isbn).toBe('Dune-isbn-1');
  });

  it('rejects an isbn already used by another book', async () => {
    seedBooks(2, 'Dune');

    const res = await request(app)
      .patch('/books/2')
      .set(withLibrarian)
      .send({ isbn: 'Dune-isbn-1' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ISBN already exists');
  });

  it('keeps copies on loan constant when totalCopies changes', async () => {
    const [book] = seedBooks(1, 'Dune');
    borrowCopy(book.id);
    borrowCopy(book.id);

    const res = await request(app)
      .patch(`/books/${book.id}`)
      .set(withLibrarian)
      .send({ totalCopies: 5 });

    expect(res.status).toBe(200);
    expect(res.body.totalCopies).toBe(5);
    expect(res.body.availableCopies).toBe(3);
  });

  it('rejects a totalCopies change that would make availableCopies negative', async () => {
    const [book] = seedBooks(1, 'Dune');
    borrowCopy(book.id);
    borrowCopy(book.id);

    const res = await request(app)
      .patch(`/books/${book.id}`)
      .set(withLibrarian)
      .send({ totalCopies: 1 });

    expect(res.status).toBe(409);
    expect(findBookById(book.id)?.totalCopies).toBe(3);
    expect(findBookById(book.id)?.availableCopies).toBe(1);
  });

  it('returns 404 for an unknown book', async () => {
    const res = await request(app)
      .patch('/books/999')
      .set(withLibrarian)
      .send({ title: 'Nope' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Book not found');
  });

  it('forbids a non-librarian caller', async () => {
    const [book] = seedBooks(1, 'Dune');

    const res = await request(app)
      .patch(`/books/${book.id}`)
      .set(withMember)
      .send({ title: 'Changed' });

    expect(res.status).toBe(403);
    expect(findBookById(book.id)?.title).toBe('Dune 1');
  });
});

describe('DELETE /books/:id', () => {
  it('removes a book with no copies on loan', async () => {
    const [book] = seedBooks(1, 'Dune');

    const res = await request(app).delete(`/books/${book.id}`).set(withLibrarian);

    expect(res.status).toBe(204);
    expect(findBookById(book.id)).toBeUndefined();
  });

  it('rejects deleting a book with copies on loan', async () => {
    const [book] = seedBooks(1, 'Dune');
    borrowCopy(book.id);

    const res = await request(app).delete(`/books/${book.id}`).set(withLibrarian);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Cannot delete a book with copies on loan');
    expect(findBookById(book.id)).toBeDefined();
  });

  it('removes a book once every copy is returned', async () => {
    const [book] = seedBooks(1, 'Dune');
    borrowCopy(book.id);
    returnCopy(book.id);

    const res = await request(app).delete(`/books/${book.id}`).set(withLibrarian);

    expect(res.status).toBe(204);
    expect(findBookById(book.id)).toBeUndefined();
  });

  it('returns 404 for an unknown book', async () => {
    const res = await request(app).delete('/books/999').set(withLibrarian);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Book not found');
  });

  it('forbids a non-librarian caller', async () => {
    const [book] = seedBooks(1, 'Dune');

    const res = await request(app).delete(`/books/${book.id}`).set(withMember);

    expect(res.status).toBe(403);
    expect(findBookById(book.id)).toBeDefined();
  });
});
