import type { Address, Coordinate } from './server/db/schema';
import { db } from './server/db/standalone';
import { sql } from 'drizzle-orm';
import { destination } from '@turf/turf';
import { point } from '@turf/turf';
import { profiledAsync, profiledSync, profiledCount } from './profiling';

/**
 * Get a random address within a square annulus around a center point using PostgreSQL
 * Ultra-optimized version using proper latitude-adjusted longitude conversion
 * @param center Center point of the annulus
 * @param minDistanceKm Minimum distance from center in kilometers
 * @param maxDistanceKm Maximum distance from center in kilometers
 * @returns Random address within the square annulus
 * @throws Error if distances are invalid or no address found
 */
export async function getRandomAddressInAnnulus(
	center: Coordinate,
	minDistanceKm: number,
	maxDistanceKm: number
): Promise<Address> {
	// Validate inputs
	if (minDistanceKm < 0) {
		throw new Error('Minimum distance cannot be negative');
	}
	if (maxDistanceKm <= minDistanceKm) {
		throw new Error('Maximum distance must be greater than minimum distance');
	}

	// Create turf point for center
	const centerPoint = profiledSync('annulus.turf.point', () => point([center.lon, center.lat]));

	// Calculate latitude bounds (constant across longitude)
	const minLatDeg = minDistanceKm / 111.0; // 1 degree latitude ≈ 111 km everywhere
	const maxLatDeg = maxDistanceKm / 111.0;

	// Calculate longitude bounds using turf (accounts for latitude)
	const eastMin = profiledSync('annulus.turf.destination.min', () =>
		destination(centerPoint, minDistanceKm, 90, { units: 'kilometers' })
	);
	const eastMax = profiledSync('annulus.turf.destination.max', () =>
		destination(centerPoint, maxDistanceKm, 90, { units: 'kilometers' })
	);

	// Extract longitude bounds
	const minLonDeg = Math.abs(eastMin.geometry.coordinates[0] - center.lon);
	const maxLonDeg = Math.abs(eastMax.geometry.coordinates[0] - center.lon);

	// Define the square annulus bounds
	const outerBounds = {
		minLat: center.lat - maxLatDeg,
		maxLat: center.lat + maxLatDeg,
		minLon: center.lon - maxLonDeg,
		maxLon: center.lon + maxLonDeg
	};

	const innerBounds = {
		minLat: center.lat - minLatDeg,
		maxLat: center.lat + minLatDeg,
		minLon: center.lon - minLonDeg,
		maxLon: center.lon + minLonDeg
	};

	// Ultra-fast square annulus query
	const result = await profiledAsync('annulus.db.tablesample', async () => {
		return await db.execute(sql`
			SELECT 
				id, street, house_number, postcode, city, location, lat, lon, created_at
			FROM address TABLESAMPLE SYSTEM(5) -- Sample 5% of table for speed
			WHERE 
				-- Outer square bounds
				lat BETWEEN ${outerBounds.minLat} AND ${outerBounds.maxLat}
				AND lon BETWEEN ${outerBounds.minLon} AND ${outerBounds.maxLon}
				-- Exclude inner square (creating the annulus)
				AND NOT (
					lat BETWEEN ${innerBounds.minLat} AND ${innerBounds.maxLat}
					AND lon BETWEEN ${innerBounds.minLon} AND ${innerBounds.maxLon}
				)
			LIMIT 1
		`);
	});

	// If TABLESAMPLE doesn't find anything, fall back to more comprehensive search
	if (result.length === 0) {
		profiledCount('annulus.db.fallback.used', 1);
		const fallbackResult = await profiledAsync('annulus.db.fallback_random', async () => {
			return await db.execute(sql`
				SELECT 
					id, street, house_number, postcode, city, location, lat, lon, created_at
				FROM address 
				WHERE 
					-- Outer square bounds
					lat BETWEEN ${outerBounds.minLat} AND ${outerBounds.maxLat}
					AND lon BETWEEN ${outerBounds.minLon} AND ${outerBounds.maxLon}
					-- Exclude inner square (creating the annulus)
					AND NOT (
						lat BETWEEN ${innerBounds.minLat} AND ${innerBounds.maxLat}
						AND lon BETWEEN ${innerBounds.minLon} AND ${innerBounds.maxLon}
					)
				ORDER BY RANDOM()
				LIMIT 1
			`);
		});

		if (fallbackResult.length === 0) {
			throw new Error(
				`No address found in square annulus: center=(${center.lat}, ${center.lon}), min=${minDistanceKm}km, max=${maxDistanceKm}km`
			);
		}

		const row = fallbackResult[0] as {
			id: string;
			street: string | null;
			house_number: string | null;
			postcode: string | null;
			city: string | null;
			location: string;
			lat: number;
			lon: number;
			created_at: Date;
		};
		return {
			id: row.id,
			street: row.street,
			houseNumber: row.house_number,
			postcode: row.postcode,
			city: row.city,
			location: row.location,
			lat: Number(row.lat),
			lon: Number(row.lon),
			createdAt: row.created_at
		};
	}

	const row = result[0] as {
		id: string;
		street: string | null;
		house_number: string | null;
		postcode: string | null;
		city: string | null;
		location: string;
		lat: number;
		lon: number;
		created_at: Date;
	};
	return {
		id: row.id,
		street: row.street,
		houseNumber: row.house_number,
		postcode: row.postcode,
		city: row.city,
		location: row.location,
		lat: Number(row.lat),
		lon: Number(row.lon),
		createdAt: row.created_at
	};
}
