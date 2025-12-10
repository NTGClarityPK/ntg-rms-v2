/**
 * Script to clear all SYNCED items from sync queue
 * 
 * Usage in Browser Console:
 *   1. Open browser console (F12)
 *   2. Copy and paste this entire script
 *   3. Press Enter
 */

(async function() {
  const confirmation = prompt('Type "CLEAR SYNCED" to remove all SYNCED items from sync queue:');
  if (confirmation !== 'CLEAR SYNCED') {
    console.log('❌ Cancelled');
    return;
  }
  
  try {
    const dbName = 'RMSDatabase';
    const request = indexedDB.open(dbName);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    console.log(`✅ Database opened (version: ${db.version})`);
    
    const transaction = db.transaction(['syncQueue'], 'readwrite');
    const store = transaction.objectStore('syncQueue');
    
    // Get all items
    const allItems = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    console.log(`📊 Total items in sync queue: ${allItems.length}`);
    
    // Filter SYNCED items
    const syncedItems = allItems.filter(item => item.status === 'SYNCED');
    console.log(`📋 Found ${syncedItems.length} SYNCED items to clear`);
    
    if (syncedItems.length === 0) {
      console.log('✅ No SYNCED items to clear');
      db.close();
      return;
    }
    
    // Delete SYNCED items
    let count = 0;
    for (const item of syncedItems) {
      await new Promise((resolve, reject) => {
        const deleteRequest = store.delete(item.id);
        deleteRequest.onsuccess = () => {
          count++;
          resolve();
        };
        deleteRequest.onerror = () => reject(deleteRequest.error);
      });
    }
    
    db.close();
    
    console.log(`\n✅ Cleared ${count} SYNCED items from sync queue`);
    console.log('   The sync queue is now cleaner. Only PENDING, FAILED, and recent SYNCED items remain.');
    
    alert(`✅ Cleared ${count} SYNCED items from sync queue!`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    alert(`❌ Error: ${error.message}`);
  }
})();

