import { Recipe } from '@/lib/indexeddb/database';
import { db } from '@/lib/indexeddb/database';

/**
 * Repository for Recipe entities
 * 
 * Note: Recipe doesn't have tenantId, so it doesn't extend BaseRepository.
 * Recipes are scoped through their relationship with FoodItems/AddOns and Ingredients.
 * 
 * Provides methods for querying and managing recipes in IndexedDB.
 */
export class RecipesRepository {
  /**
   * Find recipes by food item ID
   * 
   * @param foodItemId - The food item ID
   * @returns Promise resolving to array of recipes
   */
  async findByFoodItemId(foodItemId: string): Promise<Recipe[]> {
    return db.recipes.where('foodItemId').equals(foodItemId).toArray();
  }

  /**
   * Find recipes by add-on ID
   * 
   * @param addOnId - The add-on ID
   * @returns Promise resolving to array of recipes
   */
  async findByAddOnId(addOnId: string): Promise<Recipe[]> {
    return db.recipes.where('addOnId').equals(addOnId).toArray();
  }

  /**
   * Find recipes by ingredient ID
   * 
   * @param ingredientId - The ingredient ID
   * @returns Promise resolving to array of recipes
   */
  async findByIngredientId(ingredientId: string): Promise<Recipe[]> {
    return db.recipes.where('ingredientId').equals(ingredientId).toArray();
  }

  /**
   * Find a recipe by ID
   * 
   * @param id - The recipe ID
   * @returns Promise resolving to the recipe or undefined if not found
   */
  async findById(id: string): Promise<Recipe | undefined> {
    return db.recipes.get(id);
  }

  /**
   * Create a new recipe
   * 
   * @param data - The recipe data
   * @returns Promise resolving to the created recipe
   */
  async create(data: Partial<Recipe> & { id: string }): Promise<Recipe> {
    const newRecipe: Recipe = {
      ...data,
      id: data.id,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    } as Recipe;

    await db.recipes.put(newRecipe);
    return (await db.recipes.get(data.id)) as Recipe;
  }

  /**
   * Update an existing recipe
   * 
   * @param id - The recipe ID
   * @param data - The data to update
   * @returns Promise resolving to the updated recipe
   */
  async update(id: string, data: Partial<Recipe>): Promise<Recipe> {
    const existing = await db.recipes.get(id);
    if (!existing) {
      throw new Error(`Recipe with id ${id} not found`);
    }

    const updatedRecipe = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    } as Recipe;

    await db.recipes.update(id, updatedRecipe);
    return (await db.recipes.get(id)) as Recipe;
  }

  /**
   * Delete a recipe
   * 
   * @param id - The recipe ID
   * @returns Promise resolving when the recipe is deleted
   */
  async delete(id: string): Promise<void> {
    await db.recipes.delete(id);
  }

  /**
   * Bulk insert or update recipes
   * 
   * @param items - Array of recipes to insert/update
   * @returns Promise resolving when all items are processed
   */
  async bulkPut(items: Recipe[]): Promise<void> {
    await db.recipes.bulkPut(items);
  }
}
