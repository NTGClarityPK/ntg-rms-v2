/**
 * Event system for menu data updates
 * Allows tabs to listen for data changes and refresh accordingly
 */

export type MenuDataEventType = 
  | 'categories-updated'
  | 'food-items-updated'
  | 'add-on-groups-updated'
  | 'variation-groups-updated'
  | 'menus-updated'
  | 'buffets-updated'
  | 'combo-meals-updated';

/**
 * Dispatch an event to notify all menu tabs that data has been updated
 */
export function notifyMenuDataUpdate(eventType: MenuDataEventType) {
  window.dispatchEvent(new CustomEvent(eventType));
}

/**
 * Subscribe to menu data update events
 */
export function onMenuDataUpdate(
  eventType: MenuDataEventType,
  callback: () => void
): () => void {
  window.addEventListener(eventType, callback);
  
  // Return unsubscribe function
  return () => {
    window.removeEventListener(eventType, callback);
  };
}


