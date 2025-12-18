export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export function isPaginatedResponse<T>(response: T[] | PaginatedResponse<T>): response is PaginatedResponse<T> {
  return typeof response === 'object' && response !== null && 'pagination' in response && 'data' in response;
}

