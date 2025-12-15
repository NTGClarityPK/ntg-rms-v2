# Performance Changes Log

This document tracks all performance optimizations made to the application.

---

## 2024 - Kitchen Display Smart Polling Implementation

**Date:** Latest  
**Component:** Kitchen Display Page  
**Files:** 
- `frontend/src/app/(dashboard)/orders/kitchen/page.tsx`
- `frontend/src/lib/hooks/use-kitchen-polling.ts`

### Issue
Kitchen display was not updating automatically when orders were created by other tenant users. Supabase Realtime subscriptions were complex, unreliable, and difficult to debug.

### Root Causes
1. **Supabase Realtime complexity:** Subscription setup required complex async loading, channel management, and error handling
2. **Unreliable updates:** Realtime subscriptions were not consistently triggering callbacks when orders were created
3. **Cross-browser sync issues:** Updates from other users/browsers were not reliably propagating
4. **Difficult debugging:** Realtime subscription failures were hard to diagnose and fix

### Changes Made

#### 1. Smart Polling Hook (New File: `use-kitchen-polling.ts`)
- Created reusable `useKitchenPolling` hook with visibility-aware polling
- Polls every 3 seconds when page is visible, 10 seconds when hidden
- Automatically pauses when tab is hidden or browser goes offline
- Implements exponential backoff error handling (2x, 4x, 8x intervals)
- Prevents concurrent polls with ref-based locking mechanism
- **Impact:** Simple, reliable, and maintainable polling solution

#### 2. Replaced Supabase Realtime (Lines 243-255 in `kitchen/page.tsx`)
- Removed Supabase Realtime subscription code (~68 lines)
- Integrated `useKitchenPolling` hook with existing `loadOrders` function
- Maintained all existing functionality (sound alerts, order detection, status updates)
- **Impact:** Reduced complexity, improved reliability, easier debugging

#### 3. Visibility-Aware Polling
- Uses Page Visibility API to detect when tab is hidden
- Reduces polling frequency from 3s to 10s when page is not visible
- Automatically resumes normal polling when page becomes visible
- **Impact:** 70% reduction in API calls when tab is hidden

#### 4. Error Resilience
- Exponential backoff on network errors (2x, 4x, 8x intervals)
- Automatic recovery when network connection is restored
- Graceful handling of offline scenarios
- **Impact:** Prevents API spam during network issues, automatic recovery

### Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Update Detection | Unreliable (Realtime) | 3 seconds (polling) | 100% reliable |
| API Calls (visible) | 0-20 req/min (unreliable) | 20 req/min (3s interval) | Predictable |
| API Calls (hidden) | 0-20 req/min | 6 req/min (10s interval) | 70% reduction |
| Code Complexity | High (Realtime setup) | Low (simple hook) | ~68 lines removed |
| Debugging | Difficult | Easy (standard HTTP) | Improved |
| Cross-tenant Updates | Unreliable | Reliable (3s delay) | 100% reliable |

### Testing
- ✅ Verify kitchen display updates within 3 seconds when order is created
- ✅ Verify polling pauses when tab is hidden
- ✅ Verify polling resumes when tab becomes visible
- ✅ Verify exponential backoff on network errors
- ✅ Verify automatic recovery when network is restored
- ✅ Verify sound alerts still work for new orders
- ✅ Test cross-browser updates (multiple users same tenant)

---

## 2024 - Orders Page API Optimization

**Date:** Latest  
**Component:** Orders List Page  
**File:** `frontend/src/app/(dashboard)/orders/page.tsx`

### Issue
The `/orders` endpoint was being called excessively (~150+ requests continuously), causing slow page performance.

### Root Causes
1. **Duplicate API calls:** Two requests per load (filtered + all orders) even when unnecessary
2. **Redundant useEffects:** Two separate effects triggering `loadOrders()` simultaneously
3. **Aggressive polling:** 5-second interval polling even when Realtime subscriptions were active
4. **Subscription recreation:** Subscription recreated on every filter change causing memory leaks

### Changes Made

#### 1. Optimized API Calls (Lines 110-128)
- Only fetch "all orders" when filtering by status (not on "all" tab)
- Reuse existing `backendOrders` data when on "all" tab
- **Impact:** 50% reduction in API calls on "all" tab

#### 2. Consolidated useEffects (Lines 265-270)
- Combined two redundant `useEffect` hooks into one
- Use direct dependencies instead of function reference
- **Impact:** Eliminates duplicate calls on filter changes

#### 3. Conditional Polling (Lines 323-341)
- Polling only activates if Realtime subscription fails
- Increased polling interval from 5s to 30s
- Checks subscription status after 10s before starting fallback
- **Impact:** Zero polling requests when Realtime works; 6x less aggressive when it fails

#### 4. Ref Pattern for Subscriptions (Lines 70-71, 263-265, 303, 337, 357)
- Use `useRef` to store latest `loadOrders` function
- Removed `loadOrders` from subscription dependencies
- **Impact:** Prevents subscription recreation on filter changes; eliminates memory leaks

### Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Initial Load | 2 requests | 1-2 requests | 50% (on "all" tab) |
| Polling (when Realtime works) | 12 req/min | 0 req/min | 100% |
| Polling (fallback) | 12 req/min (5s) | 2 req/min (30s) | 83% |
| Filter Changes | 2 requests | 1-2 requests | 50% |
| **10 min total (Realtime active)** | **~242 requests** | **~1-2 requests** | **~99%** |

### Testing
- ✅ Verify only 1-2 requests on initial load
- ✅ Verify no polling when Realtime subscription works
- ✅ Verify polling activates only on Realtime failure (30s interval)
- ✅ Verify filter changes trigger minimal requests
- ✅ Test cross-tab updates via Realtime

---

## Template for Future Changes

### [Date] - [Component Name] Optimization

**Component:** [Component/Page name]  
**File:** `[file path]`

#### Issue
[Brief description of performance issue]

#### Root Causes
1. [Cause 1]
2. [Cause 2]

#### Changes Made
1. **[Change name] (Lines X-Y)**
   - [What was changed]
   - **Impact:** [Quantifiable improvement]

#### Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| [Metric 1] | [Value] | [Value] | [%] |

#### Testing
- ✅ [Test case 1]
- ✅ [Test case 2]

---

