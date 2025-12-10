/**
 * Script to clear all orders from IndexedDB
 * 
 * Usage in Browser Console:
 *   1. Open browser console (F12)
 *   2. Copy and paste this entire script
 *   3. Press Enter
 * 
 * Or navigate to: http://localhost:3000/clear-indexeddb.html
 */

(async function() {
  console.log('🔄 Starting IndexedDB cleanup...');
  console.log('⚠️  WARNING: This will delete ALL data from IndexedDB!');
  
  const confirmation = prompt('Type "DELETE ALL" to confirm deletion:');
  
  if (confirmation !== 'DELETE ALL') {
    console.log('❌ Deletion cancelled.');
    return;
  }
  
  try {
    // Check if IndexedDB is available
    if (!window.indexedDB) {
      throw new Error('IndexedDB is not supported in this browser');
    }

    // Open the database
    const dbName = 'RMSDatabase';
    console.log('1. Opening database...');
    
    // Open without version to use current version (safest approach)
    const request = indexedDB.open(dbName);
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log(`   ✅ Database opened (version: ${request.result.version})`);
        resolve(request.result);
      };
      request.onerror = () => {
        console.error('   ❌ Error opening database:', request.error);
        reject(request.error);
      };
    });
    
    // List of stores to clear
    const storesToClear = [
      { name: 'orders', description: 'Orders' },
      { name: 'orderItems', description: 'Order Items' },
      { name: 'syncQueue', description: 'Sync Queue' },
      { name: 'cart', description: 'Cart Items' }
    ];

    let totalCleared = 0;

    for (const store of storesToClear) {
      try {
        console.log(`2. Clearing ${store.description}...`);
        const transaction = db.transaction([store.name], 'readwrite');
        const objectStore = transaction.objectStore(store.name);
        
        // Get count before clearing
        const countRequest = objectStore.count();
        const count = await new Promise((resolve, reject) => {
          countRequest.onsuccess = () => resolve(countRequest.result);
          countRequest.onerror = () => resolve(0);
        });
        
        // Clear the store
        await new Promise((resolve, reject) => {
          const clearRequest = objectStore.clear();
          clearRequest.onsuccess = () => {
            console.log(`   ✅ ${store.description} cleared (${count} items)`);
            totalCleared += count;
            resolve();
          };
          clearRequest.onerror = () => {
            // Store might not exist, that's okay
            console.log(`   ℹ️ ${store.description} does not exist or already empty`);
            resolve();
          };
        });
      } catch (error) {
        console.warn(`   ⚠️ Error clearing ${store.description}:`, error.message);
      }
    }
    
    db.close();
    
    console.log('\n✅ IndexedDB cleanup completed!');
    console.log(`   Total items cleared: ${totalCleared}`);
    console.log('   All orders, order items, sync queue, and cart items have been removed.');
    console.log('   Please refresh the page to see the changes.');
    
    alert(`✅ Cleanup completed!\n\nTotal items cleared: ${totalCleared}\n\nPlease refresh the page.`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('   Make sure you are running this in the browser console.');
    alert(`❌ Error: ${error.message}\n\nMake sure you are running this in the browser console.`);
  }
})();

