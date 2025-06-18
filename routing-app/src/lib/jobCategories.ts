/**
 * Job categories enum for type safety
 */
export enum JobCategory {
    GROCERIES = 0,
    PACKAGES = 1,
    FOOD = 2,
    FURNITURE = 3,
    PEOPLE = 4,
    FRAGILE_GOODS = 5,
    CONSTRUCTION = 6,
    LIQUIDS = 7,
    TOXIC_GOODS = 8
}

/**
 * Category display names
 */
export const CATEGORY_NAMES: Record<JobCategory, string> = {
    [JobCategory.GROCERIES]: 'Groceries',
    [JobCategory.PACKAGES]: 'Packages',
    [JobCategory.FOOD]: 'Food',
    [JobCategory.FURNITURE]: 'Furniture',
    [JobCategory.PEOPLE]: 'People',
    [JobCategory.FRAGILE_GOODS]: 'Fragile Goods',
    [JobCategory.CONSTRUCTION]: 'Construction',
    [JobCategory.LIQUIDS]: 'Liquids',
    [JobCategory.TOXIC_GOODS]: 'Toxic Goods'
};

/**
 * Category icons (Unicode symbols)
 */
export const CATEGORY_ICONS: Record<JobCategory, string> = {
    [JobCategory.GROCERIES]: '🛒',
    [JobCategory.PACKAGES]: '📦',
    [JobCategory.FOOD]: '🍕',
    [JobCategory.FURNITURE]: '🪑',
    [JobCategory.PEOPLE]: '👥',
    [JobCategory.FRAGILE_GOODS]: '⚠️',
    [JobCategory.CONSTRUCTION]: '🏗️',
    [JobCategory.LIQUIDS]: '🧪',
    [JobCategory.TOXIC_GOODS]: '☠️'
};

/**
 * Get category icon for a given category number
 * @param category The category number
 * @returns Unicode icon string
 */
export function getCategoryIcon(category: number | undefined | null): string {
    if (category == null || isNaN(category)) return '❓';
    return CATEGORY_ICONS[category as JobCategory] || '📋';
}

/**
 * Get category name for a given category number
 * @param category The category number
 * @returns Category display name
 */
export function getCategoryName(category: number | undefined | null): string {
    if (category == null || isNaN(category)) return 'Unknown';
    return CATEGORY_NAMES[category as JobCategory] || 'Other';
} 