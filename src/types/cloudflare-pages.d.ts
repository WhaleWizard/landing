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

declare interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<unknown>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
}

declare interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
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

type PagesFunction<Env = unknown> = (context: {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  waitUntil: (promise: Promise<unknown>) => void;
  next: (request?: Request) => Promise<Response>;
  data: Record<string, unknown>;
}) => Response | Promise<Response>;
