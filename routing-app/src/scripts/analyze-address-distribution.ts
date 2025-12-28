#!/usr/bin/env tsx

import { ChunkGrid, type BoundingBox, type ChunkCoordinate } from '../lib/coordinateGrid';
import { getAddressBbox, getNumAddresses, getAddressSample } from '../lib/server';
import type { Address } from '../lib/server/db/schema';

// Configuration
const DEFAULT_CHUNK_SIZE_KM = 0.5; // 500m chunks by default
const SAMPLE_PERCENTAGE = 0.01; // all addresses
const CONSISTENT_SEED = 42; // For reproducible results

interface ChunkStats {
	chunkId: number;
	chunkX: number;
	chunkY: number;
	addressCount: number;
	center: { lat: number; lon: number };
}

interface DistributionStats {
	min: number;
	max: number;
	mean: number;
	median: number;
	std: number;
	total: number;
	chunksWithAddresses: number;
	totalChunks: number;
}

class AddressDistributionAnalyzer {
	private chunkGrid!: ChunkGrid; // Initialized in analyze()
	private chunkMap: Map<string, number> = new Map(); // "(x,y)" -> chunkId
	private chunkStats: Map<number, ChunkStats> = new Map(); // chunkId -> stats
	private nextChunkId = 0;

	constructor(private chunkSizeKm: number = DEFAULT_CHUNK_SIZE_KM) {}

	async analyze(): Promise<void> {
		console.log(`🔍 Starting address distribution analysis with ${this.chunkSizeKm}km chunks...`);

		// Step 1: Get bounding box
		console.log('\n📐 Fetching address bounding box...');
		const bbox = await getAddressBbox();
		console.log(
			`Bounding box: lat[${bbox.min_lat.toFixed(6)}, ${bbox.max_lat.toFixed(6)}], lon[${bbox.min_lon.toFixed(6)}, ${bbox.max_lon.toFixed(6)}]`
		);

		// Step 2: Create chunk grid
		console.log(`\n🗺️  Creating ${this.chunkSizeKm}km × ${this.chunkSizeKm}km chunk grid...`);
		const gridBbox: BoundingBox = {
			north: bbox.max_lat,
			south: bbox.min_lat,
			east: bbox.max_lon,
			west: bbox.min_lon
		};

		this.chunkGrid = new ChunkGrid(gridBbox, this.chunkSizeKm);
		const dimensions = this.chunkGrid.getGridDimensions();
		console.log(
			`Grid dimensions: ${dimensions.width} × ${dimensions.height} = ${dimensions.totalChunks} chunks`
		);

		// Step 3: Get total address count
		console.log('\n📊 Fetching total address count...');
		const { count: totalAddresses } = await getNumAddresses();
		console.log(`Total addresses: ${totalAddresses.toLocaleString()}`);

		// Step 4: Calculate sample size and pagination
		const sampleSize = Math.floor(totalAddresses * SAMPLE_PERCENTAGE);
		console.log(
			`Analyzing ${sampleSize.toLocaleString()} addresses (${(SAMPLE_PERCENTAGE * 100).toFixed(1)}%)`
		);

		// Step 5: Iterate through addresses and bin them
		console.log('\n🏠 Binning addresses into chunks...');
		await this.binAddresses(sampleSize);

		// Step 6: Analyze distribution
		console.log('\n📈 Analyzing distribution...');
		const stats = this.calculateDistributionStats();
		this.printDistributionStats(stats);

		// Step 7: Create histogram
		console.log('\n📊 Generating histogram...');
		this.createHistogram(stats);

		console.log('\n✅ Analysis complete!');
	}

	private async binAddresses(sampleSize: number): Promise<void> {
		const pageSize = 1000; // Process in batches of 1000
		const totalPages = Math.ceil(sampleSize / pageSize);

		console.log(`Processing ${totalPages} pages of ${pageSize} addresses each...`);

		for (let pageNum = 0; pageNum < totalPages; pageNum++) {
			// Calculate how many addresses to request for this page
			const remainingAddresses = sampleSize - pageNum * pageSize;
			const currentPageSize = Math.min(pageSize, remainingAddresses);

			if (currentPageSize <= 0) break;

			console.log(`Processing page ${pageNum + 1}/${totalPages} (${currentPageSize} addresses)...`);

			try {
				const result = await getAddressSample({
					number: sampleSize,
					seed: CONSISTENT_SEED,
					page_size: currentPageSize,
					page_num: pageNum
				});

				// Process each address in this batch
				for (const address of result.addresses) {
					this.processAddress(address);
				}

				// Show progress
				const processedSoFar = (pageNum + 1) * pageSize;
				const progress = Math.min(100, (processedSoFar / sampleSize) * 100);
				console.log(
					`Progress: ${progress.toFixed(1)}% (${Math.min(processedSoFar, sampleSize).toLocaleString()}/${sampleSize.toLocaleString()} addresses)`
				);
			} catch (error) {
				console.error(`Error processing page ${pageNum}:`, error);
				throw error;
			}
		}
	}

	private processAddress(address: Address): void {
		try {
			// Get chunk coordinates for this address
			const chunkCoord = this.chunkGrid.getChunk(address.lat, address.lon);
			const chunkKey = `${chunkCoord.x},${chunkCoord.y}`;

			// Get or create chunk ID
			let chunkId = this.chunkMap.get(chunkKey);
			if (chunkId === undefined) {
				chunkId = this.nextChunkId++;
				this.chunkMap.set(chunkKey, chunkId);

				// Initialize chunk stats
				const center = this.chunkGrid.getChunkCenter(chunkCoord.x, chunkCoord.y);
				this.chunkStats.set(chunkId, {
					chunkId,
					chunkX: chunkCoord.x,
					chunkY: chunkCoord.y,
					addressCount: 0,
					center
				});
			}

			// Increment address count for this chunk
			const stats = this.chunkStats.get(chunkId)!;
			stats.addressCount++;
		} catch (error) {
			console.warn(`Skipping address outside bounding box: lat=${address.lat}, lon=${address.lon}`);
		}
	}

	private calculateDistributionStats(): DistributionStats {
		const addressCounts = Array.from(this.chunkStats.values()).map((stats) => stats.addressCount);

		if (addressCounts.length === 0) {
			throw new Error('No chunks with addresses found');
		}

		// Calculate statistics
		const sorted = addressCounts.sort((a, b) => a - b);
		const total = sorted.reduce((sum, count) => sum + count, 0);
		const chunksWithAddresses = sorted.filter((count) => count > 0).length;
		const totalChunks = this.chunkGrid.getGridDimensions().totalChunks;

		const min = sorted[0];
		const max = sorted[sorted.length - 1];
		const mean = total / sorted.length;
		const median =
			sorted.length % 2 === 0
				? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
				: sorted[Math.floor(sorted.length / 2)];

		// Calculate standard deviation
		const variance =
			sorted.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / sorted.length;
		const std = Math.sqrt(variance);

		return {
			min,
			max,
			mean,
			median,
			std,
			total,
			chunksWithAddresses,
			totalChunks
		};
	}

	private printDistributionStats(stats: DistributionStats): void {
		console.log('\n📊 DISTRIBUTION STATISTICS');
		console.log('════════════════════════════');
		console.log(`Total addresses analyzed: ${stats.total.toLocaleString()}`);
		console.log(`Total chunks in grid: ${stats.totalChunks.toLocaleString()}`);
		console.log(
			`Chunks with addresses: ${stats.chunksWithAddresses.toLocaleString()} (${((stats.chunksWithAddresses / stats.totalChunks) * 100).toFixed(1)}%)`
		);
		console.log(
			`Chunk occupancy rate: ${((stats.chunksWithAddresses / stats.totalChunks) * 100).toFixed(1)}%`
		);
		console.log('');
		console.log('Addresses per chunk (for occupied chunks):');
		console.log(`  Min: ${stats.min}`);
		console.log(`  Max: ${stats.max}`);
		console.log(`  Mean: ${stats.mean.toFixed(2)}`);
		console.log(`  Median: ${stats.median.toFixed(2)}`);
		console.log(`  Std Dev: ${stats.std.toFixed(2)}`);

		// Find and report the top 10 chunks by address count
		const topChunks = Array.from(this.chunkStats.values())
			.sort((a, b) => b.addressCount - a.addressCount)
			.slice(0, 10);

		console.log('\n🏆 TOP 10 CHUNKS BY ADDRESS COUNT:');
		console.log('══════════════════════════════════');
		for (let i = 0; i < topChunks.length; i++) {
			const chunk = topChunks[i];
			console.log(
				`${(i + 1).toString().padStart(2)}. Chunk (${chunk.chunkX.toString().padStart(3)}, ${chunk.chunkY.toString().padStart(3)}): ${chunk.addressCount.toString().padStart(4)} addresses [${chunk.center.lat.toFixed(4)}, ${chunk.center.lon.toFixed(4)}]`
			);
		}
	}

	private createHistogram(stats: DistributionStats): void {
		// Create a simple ASCII histogram
		const addressCounts = Array.from(this.chunkStats.values()).map((stats) => stats.addressCount);
		const sortedCounts = addressCounts.sort((a, b) => a - b);

		// Create bins for histogram
		const binCount = Math.min(20, Math.max(5, Math.floor(Math.sqrt(sortedCounts.length))));
		const binSize = Math.ceil((stats.max - stats.min) / binCount);
		const bins: { min: number; max: number; count: number }[] = [];

		for (let i = 0; i < binCount; i++) {
			const min = stats.min + i * binSize;
			const max = i === binCount - 1 ? stats.max : min + binSize - 1;
			bins.push({ min, max, count: 0 });
		}

		// Fill bins
		for (const count of sortedCounts) {
			const binIndex = Math.min(binCount - 1, Math.floor((count - stats.min) / binSize));
			bins[binIndex].count++;
		}

		console.log('\n📊 HISTOGRAM: Address Count Distribution');
		console.log('════════════════════════════════════════');

		const maxBarLength = 50;
		const maxBinCount = Math.max(...bins.map((bin) => bin.count));

		for (const bin of bins) {
			const barLength = Math.floor((bin.count / maxBinCount) * maxBarLength);
			const bar = '█'.repeat(barLength) + '░'.repeat(maxBarLength - barLength);
			const range = bin.min === bin.max ? `${bin.min}` : `${bin.min}-${bin.max}`;
			console.log(
				`${range.padStart(8)} addresses: ${bar} ${bin.count.toString().padStart(4)} chunks`
			);
		}

		console.log(
			`\nHistogram shows distribution of ${addressCounts.length} chunks that contain addresses.`
		);
		console.log(`Each █ represents ${Math.ceil(maxBinCount / maxBarLength)} chunks.`);
	}

	// Export data for external visualization if needed
	exportData(): { chunkStats: ChunkStats[]; distributionStats: DistributionStats } {
		const chunkStats = Array.from(this.chunkStats.values());
		const distributionStats = this.calculateDistributionStats();
		return { chunkStats, distributionStats };
	}
}

// Main execution
async function main() {
	const args = process.argv.slice(2);
	let chunkSizeKm = DEFAULT_CHUNK_SIZE_KM;

	// Parse command line arguments
	if (args.length > 0) {
		const parsedSize = parseFloat(args[0]);
		if (isNaN(parsedSize) || parsedSize <= 0) {
			console.error('Invalid chunk size. Please provide a positive number in kilometers.');
			process.exit(1);
		}
		chunkSizeKm = parsedSize;
	}

	console.log(`🚀 Address Distribution Analysis Tool`);
	console.log(`Chunk size: ${chunkSizeKm}km × ${chunkSizeKm}km`);
	console.log(`Sample rate: ${(SAMPLE_PERCENTAGE * 100).toFixed(1)}%`);
	console.log(`Random seed: ${CONSISTENT_SEED}`);

	try {
		const analyzer = new AddressDistributionAnalyzer(chunkSizeKm);
		await analyzer.analyze();

		// Optionally export data for further analysis
		// const data = analyzer.exportData();
		// console.log('\n💾 Data exported for further analysis');
	} catch (error) {
		console.error('\n❌ Analysis failed:', error);
		process.exit(1);
	}
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}

export { AddressDistributionAnalyzer };
