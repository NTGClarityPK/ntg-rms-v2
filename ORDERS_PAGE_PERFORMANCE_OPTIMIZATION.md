# Orders Page Performance Optimization

## Overview

This document explains the performance optimizations implemented to fix the `/orders` endpoint being called excessively (approximately 150+ requests), causing significant performance degradation and slow page loading.

**File:** `frontend/src/app/(dashboard)/orders/page.tsx`

---

## Problem Summary

The orders page was experiencing severe performance issues:
- **150+ API requests** to `/orders` endpoint continuously
- Slow page loading and poor user experience
- Unnecessary server load and bandwidth consumption
- Continuous polling every 5 seconds even when Realtime subscriptions were active

---

## Root Causes Identified

### 1. Duplicate API Calls (Lines 98 & 116)

**Before:**
```typescript
// First call: Get filtered orders
backendOrders = await ordersApi.getOrders(params);

// Second call: Get ALL orders (always executed)
allBackendOrders = await ordersApi.getOrders(allBackendParams);
```

**Problem:** The `loadOrders` function was making **two API calls every time**, even when the second call wasn't necessary. When on the "all" tab, we already had all orders from the first call, making the second call redundant.

**Location:** `frontend/src/app/(dashboard)/orders/page.tsx:98-116`

---

### 2. Redundant useEffect Hooks (Lines 259-267)

**Before:**
```typescript
useEffect(() => {
  loadOrders();
}, [loadOrders]); // Triggers when loadOrders function reference changes

// Reload orders when activeTab changes
useEffect(() => {
  loadOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeTab]); // Redundant - already covered above
```

**Problem:** Two separate `useEffect` hooks were both calling `loadOrders()`. Since `loadOrders` is a `useCallback` that depends on `activeTab`, `selectedBranch`, `selectedOrderType`, and `selectedPaymentStatus`, it gets recreated whenever any of these change, causing the first `useEffect` to fire. Additionally, the second `useEffect` would fire again when `activeTab` changes, leading to **duplicate calls**.

**Location:** `frontend/src/app/(dashboard)/orders/page.tsx:259-267`

---

### 3. Aggressive Polling (Lines 320-324)

**Before:**
```typescript
// Fallback: Poll for changes every 5 seconds if Realtime doesn't work
const pollInterval = setInterval(() => {
  console.log('🔄 Polling for order changes (fallback)...');
  loadOrders(true); // silent = true, no loading state
}, 5000); // Every 5 seconds - TOO AGGRESSIVE!
```

**Problem:** The code was polling the API **every 5 seconds** regardless of whether the Supabase Realtime subscription was working or not. This meant:
- 12 requests per minute
- 720 requests per hour
- Even when Realtime was working perfectly, polling continued unnecessarily

**Location:** `frontend/src/app/(dashboard)/orders/page.tsx:320-324`

---

### 4. Subscription Recreation (Line 333)

**Before:**
```typescript
}, [user?.tenantId, loadOrders]); // loadOrders in dependencies
```

**Problem:** Including `loadOrders` in the dependency array of the Supabase subscription `useEffect` caused the subscription to be **recreated every time `loadOrders` changed**. Since `loadOrders` changes whenever filters change, this led to:
- Multiple subscriptions being created
- Old subscriptions not being properly cleaned up
- Resource leaks and memory issues

**Location:** `frontend/src/app/(dashboard)/orders/page.tsx:333`

---

## Solutions Implemented

### Solution 1: Optimize API Calls (50% Reduction)

**After:**
```typescript
// OPTIMIZATION: Only fetch ALL orders when needed (when not on 'all' tab)
// When on 'all' tab, we already have all orders, so reuse backendOrders
// This reduces API calls by 50% when on the 'all' tab
let allBackendOrders: Order[] = backendOrders;

// Only need to fetch all orders if we're filtering by status
// This is needed to check if IndexedDB orders exist in backend with different statuses
if (status) {
  try {
    const allBackendParams = {
      branchId: selectedBranch || undefined,
      orderType: selectedOrderType as OrderType | undefined,
      paymentStatus: selectedPaymentStatus as PaymentStatus | undefined,
      // No status filter - get all orders
    };
    allBackendOrders = await ordersApi.getOrders(allBackendParams);
  } catch (error: any) {
    console.error('Failed to load all orders from backend for exclusion check:', error);
    allBackendOrders = backendOrders;
  }
}
```

**Benefits:**
- **50% reduction in API calls** when viewing the "all" tab
- Reuses data we already have instead of making redundant requests
- Still fetches all orders when needed (when filtering by status) to properly exclude IndexedDB orders

**Location:** `frontend/src/app/(dashboard)/orders/page.tsx:110-128`

---

### Solution 2: Consolidate Redundant useEffects

**After:**
```typescript
// FIXED: Combined redundant useEffects into one with proper dependencies
// This prevents loadOrders from being called multiple times when dependencies change
useEffect(() => {
  loadOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeTab, selectedBranch, selectedOrderType, selectedPaymentStatus]);
```

**Benefits:**
- **Eliminates duplicate calls** when filters change
- Single source of truth for when to reload orders
- Cleaner, more maintainable code

**Location:** `frontend/src/app/(dashboard)/orders/page.tsx:265-270`

---

### Solution 3: Conditional Polling with Longer Interval

**After:**
```typescript
// FIXED: Conditional polling - only poll if Realtime subscription fails
// This prevents unnecessary API calls when Realtime is working properly
let pollInterval: NodeJS.Timeout | null = null;
let pollTimeout: NodeJS.Timeout | null = null;

// Check subscription status after 10 seconds
// If still not subscribed, start polling as fallback
pollTimeout = setTimeout(() => {
  channel.subscribe((currentStatus) => {
    // Only start polling if subscription definitely failed
    if (currentStatus !== 'SUBSCRIBED' && currentStatus !== 'SUBSCRIBING') {
      console.warn('⚠️ Realtime subscription failed, starting fallback polling (30s interval)');
      pollInterval = setInterval(() => {
        console.log('🔄 Polling for order changes (fallback)...');
        loadOrdersRef.current?.(true); // silent = true, no loading state
      }, 30000); // Increased from 5s to 30s to reduce load
    }
  });
}, 10000); // Wait 10 seconds before checking
```

**Benefits:**
- **No polling when Realtime works** - eliminates 720 requests/hour when Realtime is active
- **6x less aggressive polling** - changed from 5 seconds to 30 seconds interval
- **Conditional activation** - only polls if Realtime subscription fails
- Proper cleanup of timeouts and intervals

**Location:** `frontend/src/app/(dashboard)/orders/page.tsx:323-341`

---

### Solution 4: Use Ref Pattern for Subscription Callback

**After:**
```typescript
// Ref to store the latest loadOrders function for use in subscriptions
// This prevents subscription recreation while ensuring we always use the latest function
const loadOrdersRef = useRef<(silent?: boolean) => Promise<void>>();

// Update ref whenever loadOrders changes
useEffect(() => {
  loadOrdersRef.current = loadOrders;
}, [loadOrders]);

// In subscription callback:
loadOrdersRef.current?.(true); // Always uses latest function

// Dependencies - removed loadOrders:
}, [user?.tenantId]); // Only recreate when tenantId changes
```

**Benefits:**
- **Prevents subscription recreation** - subscription only recreates when `tenantId` changes
- **Always uses latest function** - ref pattern ensures callbacks use the most recent `loadOrders`
- **Reduces resource usage** - no memory leaks from multiple subscriptions

**Location:** 
- Ref declaration: `frontend/src/app/(dashboard)/orders/page.tsx:70-71`
- Ref update: `frontend/src/app/(dashboard)/orders/page.tsx:263-265`
- Usage in subscription: `frontend/src/app/(dashboard)/orders/page.tsx:303, 337`
- Dependencies: `frontend/src/app/(dashboard)/orders/page.tsx:357`

---

## Performance Impact

### Before Optimization:
- **Initial load:** 2 API calls
- **Every filter change:** 2 API calls
- **Polling (every 5s):** 2 API calls every 5 seconds
- **Total in 1 minute:** ~26 requests (2 initial + 2 filter + 24 polling)
- **Total in 10 minutes:** ~242 requests

### After Optimization:
- **Initial load:** 1 API call (on "all" tab) or 2 API calls (on filtered tabs)
- **Every filter change:** 1-2 API calls (depending on tab)
- **Polling:** 0 API calls (when Realtime works) OR 1 API call every 30 seconds (only if Realtime fails)
- **Total in 1 minute (with Realtime):** ~1-2 requests
- **Total in 10 minutes (with Realtime):** ~1-2 requests

### Improvement:
- **~99% reduction** in API calls when Realtime is working
- **~90% reduction** even with polling fallback (30s interval vs 5s)
- **50% reduction** in redundant API calls for duplicate data fetching

---

## Technical Details

### Why These Optimizations Work

1. **Smart Conditional Fetching:** Only fetches all orders when we're on a filtered tab and need to check for status changes in IndexedDB orders.

2. **Proper React Patterns:** Using direct dependencies instead of function references prevents unnecessary effect executions.

3. **Respectful Polling:** Polling is now a true fallback mechanism, only activated when Realtime fails, with a much longer interval to reduce server load.

4. **Ref Pattern for Callbacks:** Using refs for callback functions is a React best practice when you need to avoid recreating subscriptions while still accessing the latest function version.

---

## Testing Recommendations

1. **Monitor Network Tab:**
   - Verify only 1-2 requests on initial load
   - Check that polling doesn't start if Realtime works
   - Confirm polling starts with 30s interval if Realtime fails

2. **Test Filter Changes:**
   - Change tabs (all, pending, preparing, etc.)
   - Change branch filter
   - Change order type filter
   - Change payment status filter
   - Verify each change triggers only necessary API calls

3. **Test Realtime:**
   - Create an order in another browser/tab
   - Verify order appears without manual refresh
   - Verify no polling occurs when Realtime works

4. **Test Offline/Fallback:**
   - Disable Realtime (if possible)
   - Verify polling starts after 10 seconds
   - Verify polling uses 30-second interval

---

## Related Files

- **Main file:** `frontend/src/app/(dashboard)/orders/page.tsx`
- **API client:** `frontend/src/lib/api/orders.ts`
- **Orders API endpoint:** `backend/src/modules/orders/orders.controller.ts`

---

## Migration Notes

No breaking changes were introduced. This is a purely internal optimization that doesn't affect the API contract or user-facing functionality.

---

## Future Improvements

Potential further optimizations:
1. Implement request debouncing for rapid filter changes
2. Add response caching with TTL (Time To Live)
3. Use React Query or SWR for better request management
4. Implement pagination to reduce payload size
5. Consider WebSocket for real-time updates instead of Supabase Realtime

---

**Date:** $(date)
**Author:** Performance Optimization Task
**Version:** 1.0

