<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# If we have point GIS data in postgis / postgres, then what are the fastest way to query the closest N points to a given point? An approximation is perfectly fine, I do not need great circle distance.

Use a GiST index and the KNN `<->` operator, then `ORDER BY` that distance and `LIMIT N`; this is both fast and exact enough while avoiding great‑circle calculations if you stay in planar geometry.[^1_1][^1_2][^1_3]

## Core query pattern

Assuming a table `points(id serial, geom geometry(Point, 3857))` and a query point `:lon`, `:lat` in the same SRID:

```sql
-- 1) Ensure a GiST index exists
CREATE INDEX points_geom_gist ON points USING gist (geom);

-- 2) K nearest neighbors to a given point
SELECT  id,
        geom,
        ST_Distance(geom, ST_SetSRID(ST_MakePoint(:lon, :lat), 3857)) AS dist
FROM    points
ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 3857)
LIMIT   :k;
```

- `geom <-> query_geom` is the KNN distance operator; with a GiST index it performs index-assisted nearest-neighbor search.[^1_2][^1_3][^1_1]
- For `geometry`, `<->` uses bounding-box centroids, so it is already an approximate planar distance and very fast.[^1_4]


## When you want “fast and approximate”

If a rough ordering is acceptable and you do not care about exact distances or great-circle effects:

- Use `geometry` with a projected SRID (e.g., Web Mercator 3857 or a local UTM) instead of `geography`.[^1_1][^1_2]
- Use `<->` in `ORDER BY` and skip a follow-up exact sort; this keeps things purely index-driven and avoids extra computation.[^1_3][^1_2][^1_1]
- Optionally add a coarse bounding box to cut the search space if you always query in a limited area:

```sql
SELECT  id, geom
FROM    points
WHERE   geom && ST_Expand(:query_geom, :radius_meters)
ORDER BY geom <-> :query_geom
LIMIT   :k;
```

The `&&` operator uses the same GiST index and `ST_Expand` gives an approximate search window.[^1_3]

## Things to avoid if you only need approximate

- Do not cast to `geography` and use `ST_Distance` for KNN unless you really need spheroidal accuracy; it is much slower.[^1_5][^1_6]
- Do not compute distance in the `ORDER BY` with `ST_Distance` if `<->` suffices, because that prevents the pure KNN index optimization and adds function cost per row.[^1_2][^1_1]
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_16][^1_17][^1_18][^1_19][^1_20][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://postgis.net/docs/geometry_distance_knn.html

[^1_2]: https://postgis.net/workshops/postgis-intro/knn.html

[^1_3]: https://postgis.net/docs/geometry_distance_box.html

[^1_4]: https://www.alibabacloud.com/blog/597005

[^1_5]: https://stackoverflow.com/questions/5111843/find-n-nearest-neighbors-for-given-point-using-postgis

[^1_6]: https://postgis.net/docs/manual-3.7/es/geometry_distance_knn.html

[^1_7]: https://www.crunchydata.com/blog/a-deep-dive-into-postgis-nearest-neighbor-search

[^1_8]: https://stackoverflow.com/questions/10461179/k-nearest-neighbor-query-in-postgis

[^1_9]: https://www.crunchydata.com/blog/wont-you-be-my-neighbor-quickly-finding-who-is-nearby

[^1_10]: https://www.tigerdata.com/learn/understanding-order-by-in-postgresql-with-examples

[^1_11]: https://neon.com/postgresql/postgresql-tutorial/postgresql-order-by

[^1_12]: https://www.alibabacloud.com/blog/postgresql-nearest-neighbor-query-performance-on-billions-of-geolocation-records_597015

[^1_13]: https://vonng.com/en/pg/knn-optimize/

[^1_14]: https://www.postgresql.org/docs/current/queries-order.html

[^1_15]: https://www.reddit.com/r/MachineLearning/comments/dkwwrt/project_pgann_fast_approximate_nearest_neighbor/

[^1_16]: https://stackoverflow.com/questions/70228619/postgres-order-coordinates-points-in-a-direction

[^1_17]: https://postgis.net/docs/manual-3.4/PostGIS_Special_Functions_Index.html

[^1_18]: https://www.enterprisedb.com/blog/postgresql-12-implementing-k-nearest-neighbor-space-partitioned-generalized-search-tree

[^1_19]: https://www.crunchydata.com/blog/pgvector-performance-for-developers

[^1_20]: https://www.postgresql.org/docs/current/functions-geometry.html


---

# /**

* Gets the closest jobs for an employee by tier, ordered by straight-line distance
* Uses PostGIS ST_DistanceSphere for accurate distance calculation
* Optimized to use spatial indexes efficiently
* 
* Parameters
* -----------
* employeeLocation: Coordinate
*     The employee's current location (lat/lon)
    * tier: number
*     The job tier to filter by
    * limit: number
*     Maximum number of jobs to return (default: 2)
    * 
* Returns
* --------
* Array of jobs ordered by distance (closest first)
*/
export async function getClosestJobsForEmployeeByTier(
employeeLocation: Coordinate,
tier: number,
limit: number = 2
): Promise<Array<InferSelectModel<typeof jobs>>> {
// Create a PostGIS POINT from employee location
// Use ST_DistanceSphere for accurate distance calculation
// The spatial index (GIST) on jobs.location should help with performance
const employeePoint = sql`ST_MakePoint(${employeeLocation.lon}, ${employeeLocation.lat})::geometry`;

const result = await db
.select()
.from(jobs)
.where(eq(jobs.jobTier, tier))
.orderBy(
sql`ST_DistanceSphere(              ST_GeomFromEWKT(${jobs.location}),              ${employeePoint}          ) ASC`
)
.limit(limit);

return result;
}

This is what I'm doing now. Are there good ways to speed this up? The table has like ~300k rows, and this takes ~160ms (in a batch of 8, so ~20ms per call)

The main speed win is to switch from `ST_DistanceSphere` in `ORDER BY` to the KNN `<->` operator on a `geometry` column with a GiST index, optionally combined with a coarse filter (`ST_DWithin` / `&&`) before ordering.[^2_1][^2_2][^2_3][^2_4][^2_5]

## Problem with current query

Your query:

```ts
.orderBy(
  sql`ST_DistanceSphere(
      ST_GeomFromEWKT(${jobs.location}),
      ${employeePoint}
  ) ASC`
)
```

- Forces Postgres to compute `ST_DistanceSphere` for every row that survives the `WHERE` clause, then sort all of them.[^2_6][^2_4]
- Prevents use of the KNN optimization, where the index itself can produce rows in “nearest first” order.[^2_2][^2_3][^2_1]
- Uses spherical distance; for 300k points and 8 concurrent queries, this can easily land around the latency you are seeing.[^2_7][^2_6]

If you only need straight-line / approximate distance, you can safely move to a projected `geometry` and the `<->` operator.

## Recommended pattern (fast KNN)

1. **Make sure `jobs.location` is a `geometry(Point, SRID)`**
    - Use a projected SRID that is reasonable for your region (e.g. a suitable UTM zone, or 3857 if you just need rough meters).[^2_8][^2_3]
2. **Create a GiST index on that geometry:**
```sql
CREATE INDEX IF NOT EXISTS jobs_location_gist
ON jobs
USING gist (location);
```

3. **Use `<->` in `ORDER BY` with `LIMIT` (KNN):**

In SQL:

```sql
SELECT *
FROM jobs
WHERE job_tier = $1
ORDER BY location <-> ST_SetSRID(ST_MakePoint($lon, $lat), <SRID>)
LIMIT $limit;
```

In your TypeScript style:

```ts
const employeePoint = sql`ST_SetSRID(ST_MakePoint(${employeeLocation.lon}, ${employeeLocation.lat}), 3857)`; // or your SRID

const result = await db
  .select()
  .from(jobs)
  .where(eq(jobs.jobTier, tier))
  .orderBy(sql`${jobs.location} <-> ${employeePoint}`)
  .limit(limit);
```

- `<->` on `geometry` is the KNN ordering operator and is index-assisted with a GiST index, so the index returns rows in increasing distance order and the planner usually needs to visit only enough index entries to satisfy `LIMIT`.[^2_9][^2_3][^2_5][^2_1][^2_2]
- This is typically much faster than `ORDER BY ST_DistanceSphere(...)`, especially with concurrent queries.[^2_1][^2_7]


## Optional: add a cheap pre-filter

If you always care only about jobs within some radius R, you can add a range filter that still uses the index and reduces the number of candidates:

```sql
SELECT *
FROM jobs
WHERE job_tier = $1
  AND ST_DWithin(
        location,
        ST_SetSRID(ST_MakePoint($lon, $lat), 3857),
        $radius_meters
      )
ORDER BY location <-> ST_SetSRID(ST_MakePoint($lon, $lat), 3857)
LIMIT $limit;
```

- `ST_DWithin` is index-accelerated and avoids computing distance to the whole table.[^2_10][^2_4]
- Combined with `<->` and `LIMIT`, you get “fast box/range filter” + “fast KNN order”.


## If you truly need spherical distance

If later you need more accurate distances but still want speed:

- Use the KNN query with `<->` to get the top, say, 50 candidates.[^2_2][^2_9][^2_1]
- Wrap it as a subquery and recompute `ST_DistanceSphere` only on those few rows for exact ordering:

```sql
WITH nn AS (
  SELECT *, location <-> :employee_point AS knn_dist
  FROM jobs
  WHERE job_tier = :tier
  ORDER BY knn_dist
  LIMIT :k_candidates
)
SELECT *,
       ST_DistanceSphere(location, :employee_point) AS exact_dist
FROM nn
ORDER BY exact_dist
LIMIT :k;
```

This pattern keeps index-based KNN for the heavy part and uses the expensive spherical distance only on a small candidate set.[^2_9][^2_1][^2_2]
<span style="display:none">[^2_11][^2_12][^2_13][^2_14][^2_15][^2_16][^2_17][^2_18][^2_19][^2_20]</span>

<div align="center">⁂</div>

[^2_1]: https://www.crunchydata.com/blog/a-deep-dive-into-postgis-nearest-neighbor-search

[^2_2]: https://postgis.net/docs/geometry_distance_knn.html

[^2_3]: https://postgis.net/workshops/postgis-intro/knn.html

[^2_4]: https://postgis.net/docs/using_postgis_query.html

[^2_5]: https://postgis.net/docs/geometry_distance_box.html

[^2_6]: https://postgis.net/docs/ST_DistanceSphere.html

[^2_7]: https://stackoverflow.com/questions/75148215/st-distancesphere-very-slow-after-postgres-postgis-upgrade

[^2_8]: https://postgis.net/docs/ST_Distance.html

[^2_9]: http://og.cens.am:8081/opengeo-docs/dataadmin/pgBasics/indx_knn.html

[^2_10]: https://stackoverflow.com/questions/5111843/find-n-nearest-neighbors-for-given-point-using-postgis

[^2_11]: https://postgis.net/docs/PostGIS_Special_Functions_Index.html

[^2_12]: http://blog.cleverelephant.ca/2021/05/indexes-and-queries.html

[^2_13]: https://stackoverflow.com/questions/77204601/optimize-st-distance-sphere-query

[^2_14]: https://www.reddit.com/r/PostgreSQL/comments/1272a67/efficient_post_gis_query_for_returning_nearest/

[^2_15]: https://learn.microsoft.com/en-us/sql/relational-databases/spatial/spatial-indexes-overview?view=sql-server-ver17

[^2_16]: https://www.sqlskills.com/blogs/bobb/how-to-ensure-your-spatial-index-is-being-used/

[^2_17]: https://desktop.arcgis.com/en/arcmap/latest/manage-data/using-sql-with-gdbs/when-are-spatial-indexes-used.htm

[^2_18]: https://www.reddit.com/r/postgis/comments/12kzj79/scaling_select_100_points_closest_to_origin_point/

[^2_19]: https://dohost.us/index.php/2025/11/15/basic-spatial-queries-st_intersects-st_contains-st_distance/

[^2_20]: https://github.com/cockroachdb/cockroach/issues/59721


---

# await db.execute(sql`

    CREATE INDEX IF NOT EXISTS idx_jobs_location_gist 
    ON job USING GIST (ST_GeomFromEWKT(location))
    `);

This is how we now create the index (but we can change this if that makes sense)

Defining the index on `ST_GeomFromEWKT(location)` is not ideal; the usual and faster pattern is to store `location` as a proper `geometry` column and index that column directly.[^3_1][^3_2][^3_3]

## Why this index is suboptimal

Your current index:

```sql
CREATE INDEX IF NOT EXISTS idx_jobs_location_gist 
ON job USING GIST (ST_GeomFromEWKT(location));
```

- Is an **expression index** on `ST_GeomFromEWKT(location)`, not on the underlying column.[^3_4][^3_1]
- Will only be considered if queries use the *exact same* expression in the predicate or `ORDER BY` (textually equivalent).[^3_4]
- Still does not give you KNN `<->` on `jobs.location` unless you also use the same expression in `ORDER BY`, which complicates SQL and may reduce planner willingness to apply KNN optimizations.[^3_5][^3_3]

If `location` is stored as text/EWKT, every query must first build a geometry (CPU cost) and the index cannot be used by simple `<->` on a geometry column.[^3_6][^3_7]

## Recommended schema and index

1. **Change `location` to an actual geometry column**, e.g.:
```sql
ALTER TABLE job
  ADD COLUMN location_geom geometry(Point, 3857);  -- choose appropriate SRID

-- One-time backfill from your EWKT text:
UPDATE job
SET location_geom = ST_GeomFromEWKT(location);
```

2. **Create a straightforward GiST index on the geometry column**:
```sql
CREATE INDEX IF NOT EXISTS idx_jobs_location_gist
ON job
USING GIST (location_geom);
```

This is the canonical PostGIS pattern and is what examples and docs assume.[^3_2][^3_1]

3. **Query with KNN on the geometry column**:
```sql
SELECT *
FROM job
WHERE job_tier = $1
ORDER BY location_geom <-> ST_SetSRID(ST_MakePoint($lon, $lat), 3857)
LIMIT $limit;
```

- This directly uses the GiST index for nearest-neighbor ordering.[^3_3][^3_8][^3_5]


## If you must keep EWKT text

If you cannot yet change the schema, you can at least align index and query:

```sql
CREATE INDEX IF NOT EXISTS idx_jobs_location_gist
ON job
USING GIST (ST_GeomFromEWKT(location));
```

Then, in the query:

```sql
ORDER BY
  ST_GeomFromEWKT(location) <-> ST_SetSRID(ST_MakePoint($lon, $lat), 3857)
```

- This lets the KNN index on the expression participate.[^3_3][^3_4]
- Still worse than a native geometry column (extra parse/construct per row), but better than full-table distance + sort.
<span style="display:none">[^3_10][^3_11][^3_12][^3_13][^3_14][^3_15][^3_16][^3_17][^3_18][^3_19][^3_20][^3_9]</span>

<div align="center">⁂</div>

[^3_1]: https://www.crunchydata.com/blog/the-many-spatial-indexes-of-postgis

[^3_2]: https://postgis.net/docs/manual-3.2/postgis_usage.html

[^3_3]: https://stackoverflow.com/questions/31369847/index-table-with-geometry-column

[^3_4]: http://postgis.net/workshops/postgis-intro/indexing.html

[^3_5]: https://postgis.net/docs/geometry_distance_knn.html

[^3_6]: https://postgis.net/docs/ST_GeomFromEWKT.html

[^3_7]: https://geoalchemy-2.readthedocs.io/en/0.6.1/spatial_functions.html

[^3_8]: https://www.crunchydata.com/blog/a-deep-dive-into-postgis-nearest-neighbor-search

[^3_9]: https://stackoverflow.com/questions/38968349/why-my-postgis-not-use-index-on-geometry-field

[^3_10]: https://github.com/geoalchemy/geoalchemy2/issues/137

[^3_11]: https://www.alibabacloud.com/blog/597192

[^3_12]: https://postgis.net/docs/manual-1.5/ST_GeomFromEWKT.html

[^3_13]: https://www.datacamp.com/doc/postgresql/gist-indexes

[^3_14]: https://postgis.net/docs/PostGIS_Special_Functions_Index.html

[^3_15]: https://www.reddit.com/r/postgis/comments/1bqpy80/how_do_i_optimize_this_nearest_distance_query/

[^3_16]: https://postgis.net/docs/manual-1.5/ch08.html

[^3_17]: https://stackoverflow.com/questions/10461179/k-nearest-neighbor-query-in-postgis

[^3_18]: https://postgis.net/docs/ST_Transform.html

[^3_19]: https://postgis.net/docs/manual-2.3/PostGIS_Special_Functions_Index.html

[^3_20]: https://postgis.net/docs/manual-2.5/PostGIS_Special_Functions_Index.html


---

# No I don't care at all about EWKT, I dont' even know what it means and it's something I set up a long time ago, but I don;t really use it. We just need very fast queries and the best index to support that.

Then the cleanest and fastest approach is:

- Store `location` as a real `geometry(Point, SRID)` column.
- Put a plain GiST index on that column.
- Use `ORDER BY location <-> query_point LIMIT N` for KNN.[^4_1][^4_2][^4_3][^4_4]


## 1. Fix the schema

Add a proper geometry column (example assumes WGS84 4326 – lat/lon – but you can choose a projected SRID if you prefer planar meters):

```sql
ALTER TABLE job
  ADD COLUMN location_geom geometry(Point, 4326);
```

Backfill from your old text/EWKT column:

```sql
UPDATE job
SET location_geom = location::geometry;           -- if column already stores EWKT
-- or, if plain WKT or separate lon/lat:
-- SET location_geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326);
```

You can drop the old column later once everything is migrated.

## 2. Best-practice index

```sql
CREATE INDEX IF NOT EXISTS idx_job_location_geom_gist
ON job
USING GIST (location_geom);
```

This is the standard PostGIS spatial index pattern.[^4_5][^4_3][^4_6]

## 3. Fast nearest-neighbor query

In SQL:

```sql
SELECT  *
FROM    job
WHERE   job_tier = $1
ORDER BY location_geom <-> ST_SetSRID(ST_MakePoint($lon, $lat), 4326)
LIMIT   $limit;
```

In your TypeScript style:

```ts
const employeePoint = sql`
  ST_SetSRID(ST_MakePoint(${employeeLocation.lon}, ${employeeLocation.lat}), 4326)
`;

const result = await db
  .select()
  .from(jobs)
  .where(eq(jobs.jobTier, tier))
  .orderBy(sql`${jobs.locationGeom} <-> ${employeePoint}`)
  .limit(limit);
```

- `<->` on a `geometry` column with a GiST index gives you index-assisted KNN search, which is the “very fast” pattern you are after.[^4_2][^4_1]


## 4. Optional: project to a metric SRID

If you want distances to behave more like meters and still be approximate:

- Store as `geometry(Point, 3857)` or a local UTM zone instead of 4326.[^4_7][^4_8]
- Everything else (GiST index + `<->`) stays the same; performance is similarly good.
<span style="display:none">[^4_10][^4_11][^4_12][^4_13][^4_14][^4_15][^4_16][^4_17][^4_18][^4_19][^4_20][^4_21][^4_9]</span>

<div align="center">⁂</div>

[^4_1]: https://postgis.net/workshops/postgis-intro/knn.html

[^4_2]: http://og.cens.am:8081/opengeo-docs/dataadmin/pgBasics/indx_knn.html

[^4_3]: https://mapscaping.com/create-a-spatial-index-in-postgis/

[^4_4]: https://www.crunchydata.com/blog/the-many-spatial-indexes-of-postgis

[^4_5]: https://postgis.net/docs/manual-1.3/ch04.html

[^4_6]: https://postgis.net/docs/manual-3.0/ch06.html

[^4_7]: https://atlasgo.io/faq/geometry-type

[^4_8]: https://postgis.net/docs/ST_Transform.html

[^4_9]: https://www.crunchydata.com/blog/a-deep-dive-into-postgis-nearest-neighbor-search

[^4_10]: https://stackoverflow.com/questions/23681934/postgis-how-to-find-n-closest-sets-of-points-to-a-given-set

[^4_11]: https://postgis.net/docs/PostGIS_Special_Functions_Index.html

[^4_12]: https://www.reddit.com/r/PostgreSQL/comments/1272a67/efficient_post_gis_query_for_returning_nearest/

[^4_13]: https://stackoverflow.com/questions/11201898/gist-index-expression-based-on-geography-type-column-problems

[^4_14]: https://postgis.net/docs/manual-dev/it/using_postgis_dbmanagement.html

[^4_15]: https://postgis.net/docs/using_postgis_query.html

[^4_16]: https://stackoverflow.com/questions/23509690/how-to-convert-point-text-to-geometry

[^4_17]: https://www.alibabacloud.com/blog/597005

[^4_18]: https://postgis.net/docs/ST_GeomFromEWKT.html

[^4_19]: https://postgis.net/docs/manual-3.6/es/PostGIS_Special_Functions_Index.html

[^4_20]: https://postgis.net/docs/ST_AsEWKT.html

[^4_21]: http://postgis.net/workshops/postgis-intro/indexing.html


---

# Yeah we use webmercator for everything in this project

Then you are in a perfect spot to make this both simple and very fast: store the point as `geometry(Point, 3857)`, index that column with GiST, and use `<->` for KNN.[^5_1][^5_2][^5_3]

## Table + index setup

```sql
-- Ensure the geometry column is Web Mercator
ALTER TABLE job
  ADD COLUMN location_geom geometry(Point, 3857);

-- One-time backfill from whatever you have now:
UPDATE job
SET location_geom = ST_Transform(
  ST_SetSRID(ST_MakePoint(lon, lat), 4326), 3857
);
-- or, if you already had a geometry in another SRID, adjust accordingly.

-- Spatial index
CREATE INDEX IF NOT EXISTS idx_job_location_geom_gist
ON job
USING GIST (location_geom);
```

This is the canonical combination for fast spatial search in PostGIS.[^5_2][^5_4][^5_5]

## Fast nearest-jobs query (Web Mercator)

In SQL:

```sql
SELECT  *
FROM    job
WHERE   job_tier = $1
ORDER BY location_geom <-> ST_SetSRID(ST_MakePoint($lon, $lat), 3857)
LIMIT   $limit;
```

In your TypeScript:

```ts
const employeePoint = sql`
  ST_SetSRID(ST_MakePoint(${employeeLocation.lon}, ${employeeLocation.lat}), 3857)
`;

const result = await db
  .select()
  .from(jobs)
  .where(eq(jobs.jobTier, tier))
  .orderBy(sql`${jobs.locationGeom} <-> ${employeePoint}`)
  .limit(limit);
```

- `<->` on `geometry(Point, 3857)` is a planar distance proxy, which matches your “straight-line / approximation is fine” requirement and uses the GiST index for KNN.[^5_6][^5_7][^5_1]


## Optional: radius pre-filter

If you only care within some radius (e.g. 20 km), you can cheaply narrow candidates:

```sql
WHERE job_tier = $1
  AND ST_DWithin(
        location_geom,
        ST_SetSRID(ST_MakePoint($lon, $lat), 3857),
        20000  -- meters in 3857 (approx)
      )
ORDER BY location_geom <-> ST_SetSRID(ST_MakePoint($lon, $lat), 3857)
LIMIT $limit;
```

This keeps the index fully in play and usually drops query times further, especially under concurrency.[^5_8][^5_2]

<div align="center">⁂</div>

[^5_1]: https://postgis.net/workshops/postgis-intro/knn.html

[^5_2]: https://postgis.net/docs/PostGIS_Special_Functions_Index.html

[^5_3]: https://www.crunchydata.com/blog/the-many-spatial-indexes-of-postgis

[^5_4]: http://postgis.net/workshops/postgis-intro/indexing.html

[^5_5]: https://mapscaping.com/create-a-spatial-index-in-postgis/

[^5_6]: https://postgis.net/docs/geometry_distance_knn.html

[^5_7]: http://og.cens.am:8081/opengeo-docs/dataadmin/pgBasics/indx_knn.html

[^5_8]: https://postgis.net/docs/using_postgis_query.html


---

# Right we do want t oonly search withing 5km

Use `ST_DWithin` with a 5 000‑meter radius in the `WHERE` clause, then KNN `<->` in `ORDER BY`, all on your `geometry(Point, 3857)` column.[^6_1][^6_2][^6_3][^6_4]

## SQL pattern for “within 5 km and closest”

Assuming:

- `job.location_geom` is `geometry(Point, 3857)`
- GiST index exists: `CREATE INDEX ... USING gist (location_geom);`

```sql
SELECT  *
FROM    job
WHERE   job_tier = $1
  AND   ST_DWithin(
          location_geom,
          ST_SetSRID(ST_MakePoint($lon, $lat), 3857),
          5000  -- 5 km (meters in Web Mercator)
        )
ORDER BY location_geom <-> ST_SetSRID(ST_MakePoint($lon, $lat), 3857)
LIMIT   $limit;
```

- `ST_DWithin` is index-accelerated and first narrows to jobs whose bounding boxes fall within ~5 km of the employee.[^6_2][^6_5][^6_6]
- `ORDER BY location_geom <-> ... LIMIT` then does a KNN using the GiST index to get the nearest within that subset.[^6_7][^6_3][^6_1]
- In SRID 3857, units are meters, so `5000` is “about 5 km”; distortion is modest for such short ranges, especially near mid-latitudes.[^6_8][^6_9][^6_4]


## TypeScript version

```ts
const employeePoint = sql`
  ST_SetSRID(ST_MakePoint(${employeeLocation.lon}, ${employeeLocation.lat}), 3857)
`;

const result = await db
  .select()
  .from(jobs)
  .where(and(
    eq(jobs.jobTier, tier),
    sql`ST_DWithin(${jobs.locationGeom}, ${employeePoint}, 5000)`
  ))
  .orderBy(sql`${jobs.locationGeom} <-> ${employeePoint}`)
  .limit(limit);
```

This pattern is about as fast as you can get with vanilla PostGIS for “closest N within 5 km” on a 300k‑row table.[^6_3][^6_4][^6_10][^6_2]
<span style="display:none">[^6_11][^6_12][^6_13][^6_14][^6_15][^6_16][^6_17][^6_18][^6_19][^6_20]</span>

<div align="center">⁂</div>

[^6_1]: https://postgis.net/docs/geometry_distance_knn.html

[^6_2]: https://postgis.net/docs/ST_DWithin.html

[^6_3]: https://www.postgresonline.com/journal/archives/222-KNN-Gist-for-PostGIS-in-Place.html

[^6_4]: https://postgis.net/docs/ST_Distance.html

[^6_5]: https://blog.rustprooflabs.com/2022/06/h3-indexes-on-postgis-data

[^6_6]: https://leapcell.io/blog/empowering-web-applications-with-geographic-awareness-using-postgis

[^6_7]: http://og.cens.am:8081/opengeo-docs/dataadmin/pgBasics/indx_knn.html

[^6_8]: https://www.esri.com/arcgis-blog/products/arcgis-enterprise/mapping/measuring-distances-and-areas-when-your-map-uses-the-mercator-projection

[^6_9]: https://www.alibabacloud.com/blog/postgis-how-to-calculate-distance-between-coordinates-in-spherical-and-projected-systems_597328

[^6_10]: https://www.alibabacloud.com/blog/spatial-search-geometry-and-gist-combination-outperforms-geohash-and-b-tree_597174

[^6_11]: https://stackoverflow.com/questions/48475337/find-knn-with-a-geometry-data-type-using-postgis-in-postgresql

[^6_12]: https://postgis.net/docs/geometry_distance_box.html

[^6_13]: https://www.reddit.com/r/PostgreSQL/comments/1272a67/efficient_post_gis_query_for_returning_nearest/

[^6_14]: https://stackoverflow.com/questions/44451539/postgresql-postgis-st-dwithin-always-return-true

[^6_15]: https://stackoverflow.com/questions/10461179/k-nearest-neighbor-query-in-postgis

[^6_16]: https://stackoverflow.com/questions/39030232/in-postgis-which-one-is-the-most-accurate-way-to-calculate-distance-between-two

[^6_17]: http://www.postgis.us/Presentations/foss4g_2014_postgis_writing_better_queries.html?print-pdf

[^6_18]: https://postgis.net/docs/manual-3.5/postgis-en.html

[^6_19]: https://postgis.net/docs/manual-2.0/ST_Distance.html

[^6_20]: https://www.crunchydata.com/blog/inside-postgis-calculating-distance

