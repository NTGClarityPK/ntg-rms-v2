/**
 * Script to inspect and clean up sync queue
 * 
 * Usage in Browser Console:
 *   1. Open browser console (F12)
 *   2. Copy and paste this entire script
 *   3. Press Enter
 */

(async function() {
  console.log('🔍 Inspecting sync queue...');
  
  try {
    const dbName = 'RMSDatabase';
    const request = indexedDB.open(dbName);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    console.log(`✅ Database opened (version: ${db.version})`);
    
    // Get all sync queue items
    const transaction = db.transaction(['syncQueue'], 'readonly');
    const store = transaction.objectStore('syncQueue');
    const allItems = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    console.log(`\n📊 Total items in sync queue: ${allItems.length}`);
    
    // Group by status
    const byStatus = {};
    allItems.forEach(item => {
      const status = item.status || 'UNKNOWN';
      if (!byStatus[status]) {
        byStatus[status] = [];
      }
      byStatus[status].push(item);
    });
    
    console.log('\n📈 Items by status:');
    Object.keys(byStatus).forEach(status => {
      console.log(`   ${status}: ${byStatus[status].length} items`);
    });
    
    // Show sample items
    console.log('\n📋 Sample items (first 5):');
    allItems.slice(0, 5).forEach((item, index) => {
      console.log(`   ${index + 1}. Table: ${item.table}, Action: ${item.action}, Status: ${item.status}, RecordId: ${item.recordId}`);
      if (item.error) {
        console.log(`      Error: ${item.error}`);
      }
    });
    
    // Count by table
    const byTable = {};
    allItems.forEach(item => {
      const table = item.table || 'UNKNOWN';
      if (!byTable[table]) {
        byTable[table] = 0;
      }
      byTable[table]++;
    });
    
    console.log('\n📊 Items by table:');
    Object.keys(byTable).forEach(table => {
      console.log(`   ${table}: ${byTable[table]} items`);
    });
    
    // Check for stuck items
    const stuckItems = allItems.filter(item => 
      item.status === 'SYNCING' || 
      (item.status === 'SYNCED' && item.timestamp && new Date(item.timestamp) < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    );
    
    if (stuckItems.length > 0) {
      console.log(`\n⚠️ Found ${stuckItems.length} potentially stuck items:`);
      console.log('   - Items with status SYNCING (should be PENDING or FAILED)');
      console.log('   - Items with status SYNCED older than 7 days');
    }
    
    db.close();
    
    console.log('\n💡 Options:');
    console.log('   1. To clear all SYNCED items: run clearSyncedItems()');
    console.log('   2. To reset SYNCING items to PENDING: run resetSyncingItems()');
    console.log('   3. To clear entire sync queue: run clearAllSyncQueue()');
    
    // Helper functions
    window.clearSyncedItems = async function() {
      const confirmation = prompt('Type "CLEAR SYNCED" to remove all SYNCED items:');
      if (confirmation !== 'CLEAR SYNCED') {
        console.log('❌ Cancelled');
        return;
      }
      
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      
      const tx = db.transaction(['syncQueue'], 'readwrite');
      const store = tx.objectStore('syncQueue');
      const index = store.index('status');
      const request = index.openCursor(IDBKeyRange.only('SYNCED'));
      
      let count = 0;
      await new Promise((resolve, reject) => {
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            cursor.delete();
            count++;
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = reject;
      });
      
      db.close();
      console.log(`✅ Cleared ${count} SYNCED items`);
    };
    
    window.resetSyncingItems = async function() {
      const confirmation = prompt('Type "RESET SYNCING" to reset all SYNCING items to PENDING:');
      if (confirmation !== 'RESET SYNCING') {
        console.log('❌ Cancelled');
        return;
      }
      
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      
      const tx = db.transaction(['syncQueue'], 'readwrite');
      const store = tx.objectStore('syncQueue');
      const index = store.index('status');
      const request = index.openCursor(IDBKeyRange.only('SYNCING'));
      
      let count = 0;
      await new Promise((resolve, reject) => {
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            cursor.update({ ...cursor.value, status: 'PENDING' });
            count++;
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = reject;
      });
      
      db.close();
      console.log(`✅ Reset ${count} SYNCING items to PENDING`);
    };
    
    window.clearAllSyncQueue = async function() {
      const confirmation = prompt('Type "CLEAR ALL" to remove ALL sync queue items:');
      if (confirmation !== 'CLEAR ALL') {
        console.log('❌ Cancelled');
        return;
      }
      
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      
      const tx = db.transaction(['syncQueue'], 'readwrite');
      const store = tx.objectStore('syncQueue');
      await new Promise((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
      });
      
      db.close();
      console.log('✅ Cleared entire sync queue');
    };
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
})();

