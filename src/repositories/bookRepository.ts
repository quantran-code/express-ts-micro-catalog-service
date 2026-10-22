export interface Book {
  id: number;
  title: string;
  author: string;
  isbn: string;
  totalCopies: number;
  availableCopies: number;
}

export interface CreateBookInput {
  title: string;
  author: string;
  isbn: string;
  totalCopies: number;
}

export interface UpdateBookInput {
  title?: string;
  author?: string;
  isbn?: string;
  totalCopies?: number;
}

const books: Book[] = [];
let nextId = 1;

export function createBook(input: CreateBookInput): Book {
  const book: Book = {
    id: nextId,
    title: input.title.trim(),
    author: input.author.trim(),
    isbn: input.isbn.trim(),
    totalCopies: input.totalCopies,
    availableCopies: input.totalCopies,
  };
  nextId += 1;
  books.push(book);
  return book;
}

export function findBookById(id: number): Book | undefined {
  return books.find((book) => book.id === id);
}

export function findBookByIsbn(isbn: string, excludeId?: number): Book | undefined {
  const target = isbn.trim();
  return books.find((book) => book.isbn === target && book.id !== excludeId);
}

export function findBooksByTitleOrAuthor(query: string): readonly Book[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === '') {
    return books.slice();
  }
  return books.filter(
    (book) =>
      book.title.toLowerCase().includes(trimmed) || book.author.toLowerCase().includes(trimmed),
  );
}

export function updateBook(id: number, input: UpdateBookInput): Book | undefined {
  const book = findBookById(id);
  if (book === undefined) {
    return undefined;
  }

  if (input.totalCopies !== undefined && input.totalCopies !== book.totalCopies) {
    const copiesOnLoan = book.totalCopies - book.availableCopies;
    const nextAvailableCopies = input.totalCopies - copiesOnLoan;
    if (nextAvailableCopies < 0) {
      return undefined;
    }
    book.totalCopies = input.totalCopies;
    book.availableCopies = nextAvailableCopies;
  }

  if (input.title !== undefined) {
    book.title = input.title.trim();
  }
  if (input.author !== undefined) {
    book.author = input.author.trim();
  }
  if (input.isbn !== undefined) {
    book.isbn = input.isbn.trim();
  }

  return book;
}

export function deleteBook(id: number): boolean {
  const index = books.findIndex((book) => book.id === id);
  if (index === -1) {
    return false;
  }
  books.splice(index, 1);
  return true;
}

export function borrowCopy(id: number): Book | undefined {
  const book = findBookById(id);
  if (book === undefined || book.availableCopies < 1) {
    return undefined;
  }
  book.availableCopies -= 1;
  return book;
}

export function returnCopy(id: number): Book | undefined {
  const book = findBookById(id);
  if (book === undefined) {
    return undefined;
  }
  if (book.availableCopies < book.totalCopies) {
    book.availableCopies += 1;
  }
  return book;
}

export function resetBooks(): void {
  books.length = 0;
  nextId = 1;
}
