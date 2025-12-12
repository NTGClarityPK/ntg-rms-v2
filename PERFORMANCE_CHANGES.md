# Performance Changes Log

This document tracks all performance optimizations made to the application.

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

