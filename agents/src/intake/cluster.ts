import type { RawReport } from "../schemas/index.js";

const EARTH_RADIUS_M = 6_371_000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Computes Haversine distance in meters between two lat/lon coordinates.
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export interface ReportCluster {
  centroid: { lat: number; lon: number };
  radius_m: number;
  window: { from: string; to: string };
  reports: RawReport[];
}

/**
 * Clusters raw reports using the spatio-temporal rule:
 * - Haversine distance <= maxDistanceM (default 1000m / 1km)
 * - Time difference <= maxWindowMs (default 1 hour / 3,600,000ms)
 *
 * NOTE: Spatio-temporal haversine clustering threshold (<=1km, <=1h) follows the
 * baseline ingestion rule disclosed in README.md (Section B.4.1 / Section 8).
 */
export function clusterReports(
  reports: RawReport[],
  maxDistanceM = 1000,
  maxWindowMs = 60 * 60 * 1000
): ReportCluster[] {
  if (reports.length === 0) return [];

  const sorted = [...reports].sort(
    (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()
  );

  const clusters: ReportCluster[] = [];

  for (const report of sorted) {
    const reportTime = new Date(report.ts).getTime();
    let matchedCluster: ReportCluster | undefined;

    for (const cluster of clusters) {
      const dist = haversineMeters(
        report.lat,
        report.lon,
        cluster.centroid.lat,
        cluster.centroid.lon
      );
      const startTime = new Date(cluster.window.from).getTime();
      const timeDiff = Math.abs(reportTime - startTime);

      if (dist <= maxDistanceM && timeDiff <= maxWindowMs) {
        matchedCluster = cluster;
        break;
      }
    }

    if (!matchedCluster) {
      clusters.push({
        centroid: { lat: report.lat, lon: report.lon },
        radius_m: 0,
        window: { from: report.ts, to: report.ts },
        reports: [report]
      });
    } else {
      matchedCluster.reports.push(report);
      const n = matchedCluster.reports.length;
      const sumLat = matchedCluster.reports.reduce((acc, r) => acc + r.lat, 0);
      const sumLon = matchedCluster.reports.reduce((acc, r) => acc + r.lon, 0);
      const centroidLat = Number((sumLat / n).toFixed(5));
      const centroidLon = Number((sumLon / n).toFixed(5));

      let maxRadius = 0;
      for (const r of matchedCluster.reports) {
        const d = haversineMeters(centroidLat, centroidLon, r.lat, r.lon);
        if (d > maxRadius) maxRadius = d;
      }

      const timestamps = matchedCluster.reports.map((r) => new Date(r.ts).getTime());
      const minTs = new Date(Math.min(...timestamps)).toISOString();
      const maxTs = new Date(Math.max(...timestamps)).toISOString();

      matchedCluster.centroid = { lat: centroidLat, lon: centroidLon };
      matchedCluster.radius_m = Math.round(maxRadius);
      matchedCluster.window = { from: minTs, to: maxTs };
    }
  }

  return clusters;
}
