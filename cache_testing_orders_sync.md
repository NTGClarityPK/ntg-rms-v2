# 🧪 Orders/Kitchen Display - Offline/Online Sync Cache Testing Guide

**API Base URL:** `http://192.168.50.50:8001/api/v1`

**Purpose:** Test how order status changes sync when users go offline/online, ensuring data consistency across multiple users in the same tenant.

---

## 🎯 Test Scenario Overview

**The Scenario:**
1. **User A** (Kitchen Staff) goes offline
2. **User A** marks orders as "Preparing" and "Ready" (changes stored locally)
3. **User B** (Waiter/Cashier, online) should NOT see User A's changes yet
4. **User A** comes back online (sync happens)
5. **User B** should now see User A's changes (via SSE or polling)

**What We're Testing:**
- ✅ Offline data persistence (IndexedDB)
- ✅ Optimistic UI updates (local changes visible to User A)
- ✅ Sync behavior when coming back online
- ✅ Multi-user data consistency (User B sees changes after sync)
- ✅ Real-time updates (SSE/polling)

---

## 📋 Prerequisites

### Setup Requirements

1. **Two Browser Windows/Tabs:**
   - **Window 1:** User A (Kitchen Staff) - Will go offline
   - **Window 2:** User B (Waiter/Cashier) - Stays online

2. **Same Tenant:** Both users must be logged in with the same tenant ID

3. **Test Orders:** Have at least 2-3 orders with status "pending" ready for testing

4. **Backend Running:** Backend server must be running and accessible

---

## 🧪 Test 1: Basic Offline/Online Sync Test

### Step 1: Prepare Test Environment

**In Browser Window 1 (User A - Kitchen):**
```javascript
// Open Kitchen Display page
// Navigate to: http://your-app-url/orders/kitchen

// Verify you're online
console.log('🌐 Online Status:', navigator.onLine);
console.log('✅ Ready to start test');
```

**In Browser Window 2 (User B - Orders Page):**
```javascript
// Open Orders page
// Navigate to: http://your-app-url/orders

// Verify you're online
console.log('🌐 Online Status:', navigator.onLine);
console.log('✅ Ready to monitor changes');
```

### Step 2: Get Test Order IDs

**In Browser Window 1 (User A), run this in console:**
```javascript
const token = localStorage.getItem('rms_access_token');
const API_BASE = 'http://192.168.50.50:8001/api/v1';

// Get pending orders
fetch(`${API_BASE}/orders?status=pending&includeItems=true`, {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(res => res.json())
.then(data => {
  const orders = Array.isArray(data) ? data : (data.data || []);
  console.log('📋 Pending Orders:');
  console.table(orders.map(o => ({
    id: o.id,
    orderNumber: o.orderNumber,
    tokenNumber: o.tokenNumber,
    status: o.status,
    orderType: o.orderType
  })));
  
  // Store first order ID for testing
  if (orders.length > 0) {
    window.TEST_ORDER_ID = orders[0].id;
    window.TEST_ORDER_NUMBER = orders[0].orderNumber;
    console.log(`\n✅ Test Order ID: ${window.TEST_ORDER_ID}`);
    console.log(`✅ Test Order Number: ${window.TEST_ORDER_NUMBER}`);
  }
});
```

**Copy the Order ID - you'll need it for the test!**

### Step 3: User A Goes Offline

**In Browser Window 1 (User A):**
1. Open Chrome DevTools (`F12`)
2. Go to **Network** tab
3. Check **"Offline"** checkbox (top toolbar)
4. Browser will show offline icon

**Verify offline status:**
```javascript
console.log('🔴 Offline Status:', navigator.onLine);
console.log('✅ User A is now OFFLINE');
```

### Step 4: User A Makes Changes (Offline)

**In Browser Window 1 (User A), mark order as "Preparing":**

**Option A: Using UI (Recommended)**
1. Find the test order in Kitchen Display
2. Click **"Start Preparing"** button
3. Order should move to "Preparing" column (optimistic update)
4. Note: You may see an error notification, but the UI should update

**Option B: Using Console (For Testing)**
```javascript
const token = localStorage.getItem('rms_access_token');
const API_BASE = 'http://192.168.50.50:8001/api/v1';
const ORDER_ID = window.TEST_ORDER_ID; // From Step 2

console.log('🔄 Attempting to update order status (OFFLINE)...');

// This will fail, but check IndexedDB for queued changes
fetch(`${API_BASE}/orders/${ORDER_ID}/status`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'preparing' })
})
.catch(error => {
  console.log('❌ Network error (expected - we are offline)');
  console.log('💡 Check if change is queued in IndexedDB');
  
  // Check sync queue
  setTimeout(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('RMSDatabase', 8);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    const transaction = db.transaction(['syncQueue'], 'readonly');
    const store = transaction.objectStore('syncQueue');
    const request = store.getAll();
    
    request.onsuccess = () => {
      const pendingChanges = request.result.filter(item => item.status === 'pending');
      console.log(`\n📦 Pending sync changes: ${pendingChanges.length}`);
      console.table(pendingChanges.map(item => ({
        table: item.table,
        recordId: item.recordId,
        status: item.status,
        timestamp: item.timestamp
      })));
    };
  }, 1000);
});
```

**Mark order as "Ready" (if it's already preparing):**
```javascript
const token = localStorage.getItem('rms_access_token');
const API_BASE = 'http://192.168.50.50:8001/api/v1';
const ORDER_ID = window.TEST_ORDER_ID;

fetch(`${API_BASE}/orders/${ORDER_ID}/status`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'ready' })
})
.catch(error => {
  console.log('❌ Network error (expected - we are offline)');
});
```

### Step 5: Verify User B Does NOT See Changes

**In Browser Window 2 (User B - Online):**
```javascript
const token = localStorage.getItem('rms_access_token');
const API_BASE = 'http://192.168.50.50:8001/api/v1';
const ORDER_ID = window.TEST_ORDER_ID; // Same order ID

console.log('👀 User B checking order status (should be OLD status)...');

fetch(`${API_BASE}/orders/${ORDER_ID}`, {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(res => res.json())
.then(data => {
  console.log('📊 Order Status (User B view):', data.status);
  console.log('📊 Order Data:', data);
  
  if (data.status === 'pending') {
    console.log('✅ CORRECT: User B sees OLD status (pending)');
    console.log('✅ User A\'s changes are NOT visible yet (User A is offline)');
  } else {
    console.log('⚠️  WARNING: User B sees updated status');
    console.log('⚠️  This might indicate a sync issue');
  }
});
```

**Expected Result:** User B should see status as "pending" (or whatever it was before User A went offline)

### Step 6: User A Comes Back Online

**In Browser Window 1 (User A):**
1. Go to DevTools → Network tab
2. **Uncheck "Offline"** checkbox
3. Browser will show online icon

**Verify online status:**
```javascript
console.log('🟢 Online Status:', navigator.onLine);
console.log('✅ User A is now ONLINE - Sync should happen automatically');
```

**Check if sync is happening:**
```javascript
// Watch console for sync messages
// You should see messages like:
// "🟢 Online - Starting sync..."
// "📤 Pushing pending changes..."
// "📥 Pulling latest changes..."

// Check sync queue after a few seconds
setTimeout(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('RMSDatabase', 8);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  
  const transaction = db.transaction(['syncQueue'], 'readonly');
  const store = transaction.objectStore('syncQueue');
  const request = store.getAll();
  
  request.onsuccess = () => {
    const pendingChanges = request.result.filter(item => item.status === 'pending');
    const syncedChanges = request.result.filter(item => item.status === 'synced');
    
    console.log(`\n📦 Sync Queue Status:`);
    console.log(`   Pending: ${pendingChanges.length}`);
    console.log(`   Synced: ${syncedChanges.length}`);
    
    if (pendingChanges.length === 0 && syncedChanges.length > 0) {
      console.log('✅ Sync completed successfully!');
    } else if (pendingChanges.length > 0) {
      console.log('⚠️  Some changes still pending sync');
    }
  };
}, 5000); // Wait 5 seconds for sync to complete
```

### Step 7: Verify User B Now Sees Changes

**In Browser Window 2 (User B - Online):**

**Wait 5-10 seconds for sync and SSE/polling to update, then check:**
```javascript
const token = localStorage.getItem('rms_access_token');
const API_BASE = 'http://192.168.50.50:8001/api/v1';
const ORDER_ID = window.TEST_ORDER_ID;

console.log('👀 User B checking order status (should be UPDATED now)...');

fetch(`${API_BASE}/orders/${ORDER_ID}`, {
  headers: { 'Authorization': `Bearer ${token}` }
})
.then(res => res.json())
.then(data => {
  console.log('📊 Order Status (User B view):', data.status);
  console.log('📊 Order Data:', data);
  
  if (data.status === 'preparing' || data.status === 'ready') {
    console.log('✅ SUCCESS: User B sees UPDATED status!');
    console.log('✅ Sync is working correctly!');
  } else {
    console.log('❌ FAIL: User B still sees OLD status');
    console.log('❌ Sync may not be working properly');
  }
});
```

**Expected Result:** User B should now see the updated status ("preparing" or "ready")

---

## 🧪 Test 2: Multiple Status Changes Offline

### Scenario: User A makes multiple status changes while offline

**Step 1: User A goes offline** (same as Test 1, Step 3)

**Step 2: User A makes multiple changes:**
```javascript
const token = localStorage.getItem('rms_access_token');
const API_BASE = 'http://192.168.50.50:8001/api/v1';
const ORDER_ID = window.TEST_ORDER_ID;

// Change 1: Mark as preparing
fetch(`${API_BASE}/orders/${ORDER_ID}/status`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'preparing' })
})
.catch(() => console.log('Change 1 queued (preparing)'));

// Wait 2 seconds
setTimeout(() => {
  // Change 2: Mark as ready
  fetch(`${API_BASE}/orders/${ORDER_ID}/status`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'ready' })
  })
  .catch(() => console.log('Change 2 queued (ready)'));
}, 2000);
```

**Step 3: Check sync queue:**
```javascript
setTimeout(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('RMSDatabase', 8);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  
  const transaction = db.transaction(['syncQueue'], 'readonly');
  const store = transaction.objectStore('syncQueue');
  const request = store.getAll();
  
  request.onsuccess = () => {
    const pendingChanges = request.result.filter(item => 
      item.status === 'pending' && item.table === 'orders'
    );
    console.log(`\n📦 Pending order changes: ${pendingChanges.length}`);
    console.table(pendingChanges);
  };
}, 3000);
```

**Step 4: User A comes online** (same as Test 1, Step 6)

**Step 5: Verify final status:**
```javascript
// After sync completes, check final status
setTimeout(() => {
  const token = localStorage.getItem('rms_access_token');
  const API_BASE = 'http://192.168.50.50:8001/api/v1';
  const ORDER_ID = window.TEST_ORDER_ID;
  
  fetch(`${API_BASE}/orders/${ORDER_ID}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    console.log('📊 Final Order Status:', data.status);
    console.log('✅ Should be "ready" (last change)');
  });
}, 10000); // Wait 10 seconds for sync
```

---

## 🧪 Test 3: Real-time Updates (SSE/Polling)

### Test if User B receives real-time updates

**Setup:**
- User A: Online
- User B: Online, monitoring orders

**Step 1: User B monitors order status:**
```javascript
const token = localStorage.getItem('rms_access_token');
const API_BASE = 'http://192.168.50.50:8001/api/v1';
const ORDER_ID = window.TEST_ORDER_ID;

console.log('👀 User B monitoring order status...');

// Check status every 2 seconds
const monitorInterval = setInterval(() => {
  fetch(`${API_BASE}/orders/${ORDER_ID}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    const now = new Date().toLocaleTimeString();
    console.log(`[${now}] Order Status: ${data.status}`);
  });
}, 2000);

// Stop monitoring after 30 seconds
setTimeout(() => {
  clearInterval(monitorInterval);
  console.log('✅ Monitoring stopped');
}, 30000);
```

**Step 2: User A changes order status:**
```javascript
const token = localStorage.getItem('rms_access_token');
const API_BASE = 'http://192.168.50.50:8001/api/v1';
const ORDER_ID = window.TEST_ORDER_ID;

console.log('🔄 User A changing order status...');

fetch(`${API_BASE}/orders/${ORDER_ID}/status`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'preparing' })
})
.then(res => res.json())
.then(data => {
  console.log('✅ Status changed to:', data.status);
  console.log('💡 User B should see this change via SSE/polling');
});
```

**Expected Result:** User B's console should show the status change within a few seconds (via SSE or polling)

---

## 🧪 Test 4: Conflict Resolution

### Test what happens if both users change the same order

**Scenario:**
- User A: Offline, changes order to "preparing"
- User B: Online, changes same order to "ready"
- User A: Comes online

**Step 1: User A goes offline and changes status:**
```javascript
// User A (offline)
const token = localStorage.getItem('rms_access_token');
const API_BASE = 'http://192.168.50.50:8001/api/v1';
const ORDER_ID = window.TEST_ORDER_ID;

fetch(`${API_BASE}/orders/${ORDER_ID}/status`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'preparing' })
})
.catch(() => console.log('User A: Change queued (preparing)'));
```

**Step 2: User B changes same order (online):**
```javascript
// User B (online)
const token = localStorage.getItem('rms_access_token');
const API_BASE = 'http://192.168.50.50:8001/api/v1';
const ORDER_ID = window.TEST_ORDER_ID;

fetch(`${API_BASE}/orders/${ORDER_ID}/status`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'ready' })
})
.then(res => res.json())
.then(data => {
  console.log('User B: Status changed to:', data.status);
});
```

**Step 3: User A comes online:**
```javascript
// After User A comes online, check final status
setTimeout(() => {
  const token = localStorage.getItem('rms_access_token');
  const API_BASE = 'http://192.168.50.50:8001/api/v1';
  const ORDER_ID = window.TEST_ORDER_ID;
  
  fetch(`${API_BASE}/orders/${ORDER_ID}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  .then(res => res.json())
  .then(data => {
    console.log('📊 Final Order Status:', data.status);
    console.log('💡 Should be "ready" (User B\'s change, applied first)');
  });
}, 10000);
```

**Expected Result:** Last write wins, or system handles conflict appropriately

---

## 🛠️ Utility Functions

### Check Sync Queue Status

```javascript
async function checkSyncQueue() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('RMSDatabase', 8);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  
  const transaction = db.transaction(['syncQueue'], 'readonly');
  const store = transaction.objectStore('syncQueue');
  const request = store.getAll();
  
  request.onsuccess = () => {
    const all = request.result;
    const pending = all.filter(item => item.status === 'pending');
    const synced = all.filter(item => item.status === 'synced');
    const failed = all.filter(item => item.status === 'failed');
    
    console.log('\n📦 Sync Queue Status:');
    console.log(`   Total: ${all.length}`);
    console.log(`   Pending: ${pending.length}`);
    console.log(`   Synced: ${synced.length}`);
    console.log(`   Failed: ${failed.length}`);
    
    if (pending.length > 0) {
      console.log('\n⏳ Pending Changes:');
      console.table(pending.map(item => ({
        table: item.table,
        recordId: item.recordId,
        timestamp: item.timestamp
      })));
    }
  };
}

checkSyncQueue();
```

### Check Order Status in IndexedDB

```javascript
async function checkOrderInIndexedDB(orderId) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('RMSDatabase', 8);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  
  const transaction = db.transaction(['orders'], 'readonly');
  const store = transaction.objectStore('orders');
  const request = store.get(orderId);
  
  request.onsuccess = () => {
    if (request.result) {
      console.log('📦 Order in IndexedDB:');
      console.log('   Status:', request.result.status);
      console.log('   Updated At:', request.result.updatedAt);
      console.log('   Last Synced:', request.result.lastSynced);
    } else {
      console.log('❌ Order not found in IndexedDB');
    }
  };
}

// Usage: checkOrderInIndexedDB('YOUR_ORDER_ID');
```

### Monitor Network Status

```javascript
function monitorNetworkStatus() {
  console.log('🌐 Current Status:', navigator.onLine ? 'ONLINE' : 'OFFLINE');
  
  window.addEventListener('online', () => {
    console.log('🟢 Network Status Changed: ONLINE');
  });
  
  window.addEventListener('offline', () => {
    console.log('🔴 Network Status Changed: OFFLINE');
  });
  
  console.log('✅ Network monitoring active');
}

monitorNetworkStatus();
```

---

## 🎯 Testing Checklist

Copy this to your Excel sheet:

| Test ID | Test Name | User A Status | User B Sees Changes? | After Sync User B Sees? | Status | Notes |
|---------|-----------|---------------|---------------------|------------------------|--------|-------|
| 1.1 | Basic Offline Sync | Offline → Online | ❌ No | ✅ Yes | | |
| 1.2 | Multiple Status Changes | Offline → Online | ❌ No | ✅ Yes (final) | | |
| 2.1 | Real-time Updates (SSE) | Online | ✅ Yes (immediate) | N/A | | |
| 3.1 | Conflict Resolution | Offline → Online | ❌ No | ✅ Yes (resolved) | | |
| 4.1 | Sync Queue Verification | Offline → Online | N/A | N/A | | |

---

## 💡 Tips

1. **Use two different browsers or incognito windows** for User A and User B
2. **Check console logs** - Sync service logs important messages
3. **Wait 5-10 seconds** after User A comes online for sync to complete
4. **Check Network tab** - See actual API calls being made
5. **Check IndexedDB** - Verify data is stored locally when offline
6. **Monitor SSE connection** - Check if real-time updates are working

---

## 🐛 Troubleshooting

### Issue: User B doesn't see changes after sync

**Check:**
1. Is User A actually online? Check `navigator.onLine`
2. Did sync complete? Check sync queue
3. Is SSE/polling working? Check Network tab for SSE connection
4. Are both users using same tenant? Check tenant IDs

### Issue: Changes are lost

**Check:**
1. Sync queue in IndexedDB - are changes queued?
2. Console errors - any sync failures?
3. Network connectivity - is backend accessible?

### Issue: Real-time updates not working

**Check:**
1. SSE connection status - check Network tab
2. Polling fallback - is it active?
3. Backend SSE endpoint - is it working?

---

**Happy Testing! 🚀**

