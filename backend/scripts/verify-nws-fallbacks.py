#!/usr/bin/env python3
"""Offline reproduction of the reviewed CSV against a local official NWS shapefile.
Requires GeoPandas (which supplies Shapely/pyproj); never contacts Supabase or NWS.
"""
import argparse
import csv
import hashlib
import math
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shapefile', required=True, type=Path, help='Local z_16ap26.zip or extracted .shp')
    parser.add_argument('--csv', type=Path, default=Path(__file__).resolve().parents[2] / 'docs/architecture/nws-fallback-verification.csv')
    parser.add_argument('--tolerance-m', type=float, default=0.1, help='Distance comparison tolerance; default 0.1 m for one-decimal reviewed values')
    args = parser.parse_args()
    if not args.shapefile.is_file() or not math.isfinite(args.tolerance_m) or args.tolerance_m < 0:
        parser.error('A local shapefile/ZIP and a finite nonnegative tolerance are required')
    try:
        import geopandas as gpd
    except ImportError:
        parser.error('Install the offline GIS dependency: python -m pip install geopandas')
    if args.shapefile.suffix.lower() == '.zip':
        digest = hashlib.sha256(args.shapefile.read_bytes()).hexdigest()
        if digest != '010dc5eab64b6e326c969e252bd016f56a037b0444df8303658707bca4cc7fd8':
            parser.error('ZIP checksum differs from the reviewed official April 16, 2026 release')
    source = 'zip://' + args.shapefile.resolve().as_posix() if args.shapefile.suffix.lower() == '.zip' else str(args.shapefile)
    frame = gpd.read_file(source)
    if frame.crs is None or not {'STATE', 'ZONE'}.issubset(frame.columns):
        parser.error('Expected the official public-zone dataset with CRS, STATE and ZONE fields')
    frame = frame.loc[frame['STATE'].str.strip().eq('PR')].copy()
    frame['zone_id'] = 'PRZ' + frame['ZONE'].astype(str).str.strip().str.zfill(3)
    zones = frame[['zone_id', 'geometry']].dissolve(by='zone_id').to_crs('EPSG:4326')
    if len(zones) != 13 or zones.geometry.is_empty.any() or not zones.geometry.is_valid.all():
        parser.error('Expected all 13 valid Puerto Rico public-zone polygons')
    metric = zones.to_crs('EPSG:32620')
    with args.csv.open(encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != 15 or len({r['drna_station_id'] for r in rows}) != 15:
        parser.error('Expected 15 distinct reviewed stations')
    writer = csv.writer(sys.stdout, lineterminator='\n')
    writer.writerow(['drna_station_id', 'computed_zone', 'inside_polygon', 'nearest_distance_m', 'second_nearest_zone', 'second_nearest_distance_m'])
    failures = []
    for row in rows:
        station = row['drna_station_id']
        latitude, longitude = float(row['latitude']), float(row['longitude'])
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            parser.error('Invalid reviewed coordinates for ' + station)
        point = gpd.GeoSeries(gpd.points_from_xy([longitude], [latitude]), crs='EPSG:4326')
        metric_point = point.to_crs('EPSG:32620').iloc[0]
        ranked = sorted(((float(polygon.distance(metric_point)), zone) for zone, polygon in metric.geometry.items()))
        distance, nearest = ranked[0]
        second_distance, second = ranked[1]
        containing = zones.index[zones.geometry.contains(point.iloc[0])].tolist()
        inside = nearest in containing
        writer.writerow([station, nearest, str(inside).lower(), f'{distance:.1f}', second, f'{second_distance:.1f}'])
        if station == 'RW-1A':
            rounded = gpd.GeoSeries(gpd.points_from_xy([round(longitude, 4)], [round(latitude, 4)]), crs='EPSG:4326')
            boundary = metric.geometry.loc[nearest].boundary
            print(f'RW-1A: exact point inside={inside}, boundary={boundary.distance(metric_point):.2f} m; '
                  f'rounded point inside={zones.geometry.loc[nearest].contains(rounded.iloc[0])}, '
                  f'boundary={boundary.distance(rounded.to_crs("EPSG:32620").iloc[0]):.2f} m.', file=sys.stderr)
        checks = [nearest == row['verified_zone'], second == row['second_nearest_zone'],
                  inside == (row['inside_polygon'].lower() == 'true'), len(containing) <= 1,
                  abs(distance - float(row['nearest_distance_m'])) <= args.tolerance_m + 1e-9,
                  abs(second_distance - float(row['second_nearest_distance_m'])) <= args.tolerance_m + 1e-9]
        if not all(checks):
            failures.append(station)
    if failures:
        print('Verification differs from reviewed CSV: ' + ', '.join(failures), file=sys.stderr)
        return 1
    print(f'PASS: all {len(rows)} station assignments, containment and distances match (tolerance {args.tolerance_m:g} m).', file=sys.stderr)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
