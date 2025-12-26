# Race Condition Fixes for Assign Items Button

## Problem Analysis

The "Assign Items" button was causing 401 errors and unexpected logouts due to:

1. **Heavy Backend Processing**: The `getFoodItems` API makes 500+ database queries per page (5 queries per item × 100 items per page), causing slow responses especially over VPN.

2. **Race Conditions**:
   - Multiple simultaneous clicks could trigger multiple operations
   - Multiple paginated requests in a loop could all get 401 simultaneously
   - Token refresh could time out or hang, causing unnecessary logouts

3. **Timeout Issues**: Refresh endpoint timeouts were causing logouts even when the token was valid.

## Changes Made

### 1. Frontend: `frontend/src/components/menu/MenusPage.tsx`

#### Added Operation Lock (Race Condition Prevention)
- Added `isAssignItemsLoading` state to prevent multiple simultaneous operations
- Button is disabled and shows loading state during operation
- Guards against duplicate clicks

#### Improved Pagination Loop Resilience
- Added retry logic: Up to 3 retries per page on 401 errors
- Added consecutive error tracking to prevent infinite loops
- Added 100ms delay between pages to reduce server load
- Added 1-second exponential backoff on retries (gives time for token refresh)

#### Better Error Handling
- Separated errors: Menu items loading failure doesn't fail the whole operation
- More informative error messages

### 2. Frontend: `frontend/src/lib/api/client.ts`

#### Enhanced Timeout Handling
- Added manual timeout wrapper using `Promise.race` to ensure timeout detection works
- Improved timeout error detection (checks for "Refresh endpoint timeout" message)

#### Prevent Unnecessary Logouts
- **CRITICAL FIX**: Don't logout on timeout/network errors - only logout on actual auth errors (401/403)
- This prevents users from being logged out due to slow VPN/network issues
- Timeout errors now just fail the request, allowing user to retry

#### Better Error Logging
- More detailed error logging for debugging
- Logs include timeout detection, error codes, and response status

## How to Revert

### Revert MenusPage.tsx Changes

1. Remove the `isAssignItemsLoading` state:
```typescript
// Remove this line:
const [isAssignItemsLoading, setIsAssignItemsLoading] = useState(false);
```

2. Restore original `handleAssignItems` function (simpler version without retries and delays)

3. Remove `disabled` and `loading` props from the button

### Revert client.ts Changes

1. Remove the `Promise.race` timeout wrapper - use simple `await refreshClient.post(...)`

2. Change logout logic back to:
```typescript
if (isAuthError) {
  // logout logic
} else {
  processQueue(refreshError as AxiosError, null);
}
```

## Testing

After these changes:
- ✅ Multiple rapid clicks on "Assign Items" are prevented
- ✅ 401 errors during pagination are retried automatically
- ✅ Timeout errors don't cause logout
- ✅ Users can retry operations if network is slow
- ✅ Better error messages for debugging

## Performance Notes

The backend `getFoodItems` endpoint is inherently slow due to:
- Fetching all food items first (line 354)
- Making 5 additional queries per item (variations, labels, add-ons, discounts, menu items)
- This results in 500+ queries per page with 100 items

**Recommendation for future optimization**: Consider:
- Caching frequently accessed data
- Optimizing database queries (joins instead of separate queries)
- Adding database indexes
- Implementing server-side pagination more efficiently

