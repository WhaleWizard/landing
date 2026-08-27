declare interface RequestInit {
  cf?: {
    cacheEverything?: boolean;
    cacheTtl?: number;
  };
}

declare interface CacheStorage {
  default: Cache;
}

declare interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

declare interface KVNamespace {
  get(key: string, options?: unknown): Promise<string | null>;
  put(key: string, value: string, options?: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Что D1 возвращает после записи.
 *
 * Раньше `run()` был типизирован как `unknown`, и каждое место, которому нужно
 * число изменённых строк, приводило результат к типу вручную — таких приведений
 * набралось больше десятка. Это не только шум: приведение отключает проверку,
 * поэтому опечатка вроде `meta.change` прошла бы молча, а от `meta.changes`
 * зависят условные записи («обновилось ровно ноль строк — значит резервный код
 * уже использовали») и `last_row_id` при создании карточки клиента.
 */
declare interface D1Meta {
  changes?: number;
  last_row_id?: number;
  duration?: number;
  rows_read?: number;
  rows_written?: number;
}

declare interface D1Result<T = unknown> {
  results?: T[];
  success?: boolean;
  meta?: D1Meta;
}

declare interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

declare interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<Array<D1Result<T>>>;
}

declare interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
    contentDisposition?: string;
  };
  customMetadata?: Record<string, string>;
}

declare interface R2Object {
  key: string;
  size: number;
  uploaded: Date | string;
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
    contentDisposition?: string;
  };
  customMetadata?: Record<string, string>;
}

declare interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
}

declare interface R2ListOptions {
  prefix?: string;
  limit?: number;
  cursor?: string;
  include?: Array<'httpMetadata' | 'customMetadata'>;
}

declare interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
}

declare interface R2Bucket {
  put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | Blob | null, options?: R2PutOptions): Promise<unknown>;
  list(options?: R2ListOptions): Promise<R2Objects>;
  delete(key: string): Promise<void>;
  // Нужны для переноса файла между папками: R2 не умеет переименовывать,
  // объект приходится прочитать и записать под новым ключом.
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<R2Object | null>;
}

// HTMLRewriter отдаёт оболочке SPA мета-теги конкретной статьи потоком,
// не собирая HTML в памяти воркера.
declare interface HTMLRewriterElement {
  setAttribute(name: string, value: string): HTMLRewriterElement;
  getAttribute(name: string): string | null;
  setInnerContent(content: string, options?: { html?: boolean }): HTMLRewriterElement;
  append(content: string, options?: { html?: boolean }): HTMLRewriterElement;
  remove(): HTMLRewriterElement;
}

declare interface HTMLRewriterElementHandlers {
  element?(element: HTMLRewriterElement): void | Promise<void>;
}

declare class HTMLRewriter {
  on(selector: string, handlers: HTMLRewriterElementHandlers): HTMLRewriter;
  transform(response: Response): Response;
}

type PagesFunction<Env = unknown> = (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  waitUntil: (promise: Promise<unknown>) => void;
  next: (request?: Request) => Promise<Response>;
  data: Record<string, unknown>;
}) => Response | Promise<Response>;
