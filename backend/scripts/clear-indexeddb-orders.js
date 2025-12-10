/**
 * Script to clear orders from IndexedDB in the browser
 * 
 * Usage:
 *   1. Open browser console (F12)
 *   2. Copy and paste this entire script
 *   3. Press Enter
 * 
 * This will clear all orders, order items, and sync queue entries from IndexedDB
 */

(async function() {
  console.log('🔄 Starting IndexedDB cleanup...');
  
  try {
    // Open the database
    const dbName = 'RMSDatabase';
    
    // Open without version to use current version (safest approach)
    const request = indexedDB.open(dbName);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log(`   ✅ Database opened (version: ${request.result.version})`);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
    
    // Clear orders
    console.log('1. Clearing orders...');
    const ordersStore = db.transaction('orders', 'readwrite').objectStore('orders');
    await new Promise((resolve, reject) => {
      const clearRequest = ordersStore.clear();
      clearRequest.onsuccess = () => {
        console.log('   ✅ Orders cleared');
        resolve();
      };
      clearRequest.onerror = () => reject(clearRequest.error);
    });
    
    // Clear order items
    console.log('2. Clearing order items...');
    const orderItemsStore = db.transaction('orderItems', 'readwrite').objectStore('orderItems');
    await new Promise((resolve, reject) => {
      const clearRequest = orderItemsStore.clear();
      clearRequest.onsuccess = () => {
        console.log('   ✅ Order items cleared');
        resolve();
      };
      clearRequest.onerror = () => reject(clearRequest.error);
    });
    
    // Clear sync queue (optional - uncomment if you want to clear sync queue too)
    console.log('3. Clearing sync queue...');
    const syncQueueStore = db.transaction('syncQueue', 'readwrite').objectStore('syncQueue');
    await new Promise((resolve, reject) => {
      const clearRequest = syncQueueStore.clear();
      clearRequest.onsuccess = () => {
        console.log('   ✅ Sync queue cleared');
        resolve();
      };
      clearRequest.onerror = () => reject(clearRequest.error);
    });
    
    db.close();
    
    console.log('\n✅ IndexedDB cleanup completed!');
    console.log('   All orders, order items, and sync queue entries have been removed.');
    console.log('   Please refresh the page to see the changes.');
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Make sure you are running this in the browser console.');
  }
})();

