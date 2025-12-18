import { useState, useCallback, useMemo } from 'react';
import { PaginationParams, PaginatedResponse, isPaginatedResponse } from '../types/pagination.types';

export interface UsePaginationOptions {
  initialPage?: number;
  initialLimit?: number;
}

export interface UsePaginationReturn<T> {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setTotal: (total: number) => void;
  setTotalPages: (totalPages: number) => void;
  setHasNext: (hasNext: boolean) => void;
  setHasPrev: (hasPrev: boolean) => void;
  paginationParams: PaginationParams;
  extractData: (response: T[] | PaginatedResponse<T>) => T[];
  extractPagination: (response: T[] | PaginatedResponse<T>) => {
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  } | null;
}

export function usePagination<T = any>(options: UsePaginationOptions = {}): UsePaginationReturn<T> {
  const { initialPage = 1, initialLimit = 10 } = options;
  
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);

  const extractData = useCallback((response: T[] | PaginatedResponse<T>): T[] => {
    if (isPaginatedResponse(response)) {
      return response.data;
    }
    return response;
  }, []);

  const extractPagination = useCallback((response: T[] | PaginatedResponse<T>) => {
    if (isPaginatedResponse(response)) {
      const paginationInfo = {
        total: response.pagination.total,
        totalPages: response.pagination.totalPages,
        hasNext: response.pagination.hasNext,
        hasPrev: response.pagination.hasPrev,
      };
      // Update state
      setTotal(paginationInfo.total);
      setTotalPages(paginationInfo.totalPages);
      setHasNext(paginationInfo.hasNext);
      setHasPrev(paginationInfo.hasPrev);
      return paginationInfo;
    }
    return null;
  }, []);

  const paginationParams = useMemo<PaginationParams>(() => ({ page, limit }), [page, limit]);

  return useMemo(() => ({
    page,
    limit,
    total,
    totalPages,
    hasNext,
    hasPrev,
    setPage,
    setLimit,
    setTotal,
    setTotalPages,
    setHasNext,
    setHasPrev,
    paginationParams,
    extractData,
    extractPagination,
  }), [page, limit, total, totalPages, hasNext, hasPrev, paginationParams, extractData, extractPagination]);
}

