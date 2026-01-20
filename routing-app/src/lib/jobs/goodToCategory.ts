import { JobCategory } from './jobCategories';

/**
 * Map a good name to a job category
 * This is a simple mapping that can be improved later
 * 
 * @param good - Good name (e.g., "groceries", "coal", "people")
 * @returns Job category number
 */
export function mapGoodToCategory(good: string): JobCategory {
	// Normalize good name to lowercase for comparison
	const normalizedGood = good.toLowerCase().trim();
	
	// Map goods to categories
	if (normalizedGood.includes('people')) {
		return JobCategory.PEOPLE;
	}
	if (normalizedGood.includes('groceries') || normalizedGood.includes('bulk food')) {
		return JobCategory.GROCERIES;
	}
	if (normalizedGood.includes('food') || normalizedGood.includes('hot')) {
		return JobCategory.FOOD;
	}
	if (normalizedGood.includes('packages')) {
		return JobCategory.PACKAGES;
	}
	if (normalizedGood.includes('fuel') || normalizedGood.includes('liquid')) {
		return JobCategory.LIQUIDS;
	}
	if (normalizedGood.includes('coal') || normalizedGood.includes('ore') || normalizedGood.includes('quarried') || normalizedGood.includes('construction materials')) {
		return JobCategory.CONSTRUCTION;
	}
	if (normalizedGood.includes('chemicals') || normalizedGood.includes('toxic')) {
		return JobCategory.TOXIC_GOODS;
	}
	if (normalizedGood.includes('electronics') || normalizedGood.includes('fragile')) {
		return JobCategory.FRAGILE_GOODS;
	}
	if (normalizedGood.includes('cars') || normalizedGood.includes('furniture')) {
		return JobCategory.FURNITURE;
	}
	
	// Default to packages for unknown goods
	return JobCategory.PACKAGES;
}
