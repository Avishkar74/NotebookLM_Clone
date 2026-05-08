export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'INGESTION_FAILED'
  | 'QUERY_FAILED'
  | 'EMBEDDING_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code: AppErrorCode = 'INTERNAL_ERROR',
    public readonly userMessage = 'Something went wrong. Please try again.',
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
