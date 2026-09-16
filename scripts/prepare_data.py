"""Clean an original EM-DAT public export and generate reproducible analysis."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
HAZARDS = ['Flood', 'Storm', 'Earthquake', 'Drought', 'Wildfire',
           'Volcanic activity', 'Mass movement (wet)', 'Extreme temperature']
IMPACTS = {'Total Deaths': 'deaths', 'Total Affected': 'affected',
           "Total Damage ('000 US$)": 'damage_usd',
           "Total Damage, Adjusted ('000 US$)": 'damage_adjusted_usd'}


def read_export(path):
    """Find the actual header, including exports with introductory metadata rows."""
    reader = pd.read_excel if path.suffix.lower() in ('.xlsx', '.xls') else pd.read_csv
    options = {} if reader == pd.read_excel else {'encoding': 'utf-8-sig'}
    preview = reader(path, header=None, nrows=30, **options)
    for index, row in preview.iterrows():
        if 'DisNo.' in row.astype(str).str.strip().tolist():
            frame = reader(path, header=int(index), **options)
            frame.columns = [str(c).strip().replace('‘', "'").replace('’', "'") for c in frame.columns]
            return frame
    raise ValueError('Could not find the EM-DAT DisNo. header in the first 30 rows.')


def clean(frame, start, end, all_natural=False):
    required = ['DisNo.', 'Disaster Group', 'Disaster Type', 'Country', 'ISO', 'Region', 'Start Year', *IMPACTS]
    missing = [c for c in required if c not in frame]
    if missing:
        raise ValueError(f'Missing required columns: {missing}')
    df = frame.copy()
    audit = {'source_rows': len(df), 'source_columns': list(df.columns)}
    for col in df.select_dtypes(include=['object', 'str']):
        df[col] = df[col].map(lambda x: x.strip() if isinstance(x, str) else x)
    before = len(df)
    df = df.drop_duplicates()
    audit['exact_duplicates_removed'] = before - len(df)
    if df['DisNo.'].duplicated().any():
        raise ValueError('Conflicting duplicate DisNo. records; resolve these in the source before proceeding.')
    years = pd.to_numeric(df['Start Year'], errors='coerce')
    valid = years.notna() & (years % 1 == 0)
    audit['invalid_start_year_rows'] = int((~valid).sum())
    natural = df['Disaster Group'].str.casefold().eq('natural')
    scope = natural & valid & years.between(start, end)
    if not all_natural:
        scope &= df['Disaster Type'].isin(HAZARDS)
    audit['excluded_rows'] = int((~scope).sum())
    df = df.loc[scope].copy()
    if df.empty:
        raise ValueError('No records match this scope.')
    if df[['ISO', 'Country', 'Disaster Type', 'Region']].isna().any().any():
        raise ValueError('Missing required country, ISO, disaster type or region values.')
    result = df[['DisNo.', 'Country', 'ISO', 'Region', 'Disaster Type']].rename(columns={
        'DisNo.': 'id', 'Country': 'country', 'ISO': 'iso', 'Region': 'region', 'Disaster Type': 'type'})
    result['iso'] = result['iso'].str.upper()
    if not result['iso'].str.fullmatch('[A-Z]{3}').all():
        raise ValueError('Invalid ISO alpha-3 code.')
    result['event_id'] = result['id'].str.replace(r'-[A-Z]{3}$', '', regex=True)
    result['year'] = years.loc[scope].astype(int)
    result['subtype'] = df.get('Disaster Subtype', pd.Series(index=df.index, dtype=object))
    result['event_name'] = df.get('Event Name', pd.Series(index=df.index, dtype=object))
    audit['invalid_numeric_values'] = {}
    for source, target in IMPACTS.items():
        original = df[source].replace(r'^\s*$', pd.NA, regex=True)
        numeric = pd.to_numeric(original, errors='coerce')
        invalid = original.notna() & (numeric.isna() | numeric.lt(0) | numeric.isin([float('inf'), -float('inf')]))
        audit['invalid_numeric_values'][source] = int(invalid.sum())
        result[target] = numeric.mask(invalid) * (1000 if 'damage' in target else 1)
    # Keep incomplete date precision: never invent January 1 for year-only records.
    for source, target in [('Start Month', 'start_month'), ('Start Day', 'start_day'), ('End Year', 'end_year')]:
        result[target] = pd.to_numeric(df.get(source, pd.Series(index=df.index, dtype=float)), errors='coerce')
    iso_data = json.loads((ROOT / 'data/geo/iso3166.json').read_text(encoding='utf-8'))['3166-1']
    codes = {item['alpha_3']: item['numeric'] for item in iso_data}
    result['map_id'] = result['iso'].map(codes)
    topology = json.loads((ROOT / 'data/geo/countries-110m.json').read_text(encoding='utf-8'))
    map_ids = {g['id'] for g in topology['objects']['countries']['geometries'] if g.get('id')}
    unmatched = result.loc[~result['map_id'].isin(map_ids)]
    audit['unmapped_countries'] = unmatched[['iso', 'country']].drop_duplicates().to_dict('records')
    audit['unmapped_rows'] = len(unmatched)
    audit['cleaned_rows'] = len(result)
    audit['unique_events'] = result['event_id'].nunique()
    audit['countries'] = result['iso'].nunique()
    audit['scope'] = {'start_year': start, 'end_year': end, 'types': 'all natural' if all_natural else HAZARDS}
    audit['observed_years'] = [int(result.year.min()), int(result.year.max())]
    audit['source_missing_impact_counts'] = {source: int(frame[source].isna().sum()) for source in IMPACTS}
    audit['source_type_counts'] = frame['Disaster Type'].value_counts().to_dict()
    audit['source_year_counts'] = {str(k): int(v) for k, v in frame['Start Year'].value_counts().sort_index().items()}
    if 'CPI' in df:
        cpi = pd.to_numeric(df['CPI'], errors='coerce')
        bases = sorted(result.loc[cpi.sub(100).abs().lt(.00001), 'year'].unique().tolist())
        audit['adjusted_damage_reference_year'] = bases[0] if len(bases) == 1 else None
    return result.sort_values(['year', 'id']).reset_index(drop=True), audit


def aggregate(df, by):
    grouped = df.groupby(by, dropna=False)
    output = grouped.size().rename('records').to_frame()
    for metric in IMPACTS.values():
        output[metric] = grouped[metric].sum(min_count=1)
        output[metric + '_reported'] = grouped[metric].count()
        output[metric + '_coverage_pct'] = (100 * output[metric + '_reported'] / output.records).round(2)
    return output.reset_index()


def run(args):
    source = Path(args.source).resolve()
    original_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    df, audit = clean(read_export(source), args.start_year, args.end_year, args.all_natural)
    raw = ROOT / 'data/raw' / source.name
    if raw.resolve() != source:
        if raw.exists() and hashlib.sha256(raw.read_bytes()).hexdigest() != original_hash:
            raise ValueError('A different raw export with this name already exists.')
        shutil.copy2(source, raw)
    audit.update({'source_file': raw.name, 'source_sha256': original_hash, 'source_url': 'https://public.emdat.be/'})
    out = ROOT / 'data/processed'
    out.mkdir(parents=True, exist_ok=True)
    df.to_csv(out / 'disasters.csv', index=False)
    records = json.loads(df.to_json(orient='records'))
    (out / 'disasters.json').write_text(json.dumps({'metadata': audit, 'records': records}, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    (out / 'quality-report.json').write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding='utf-8')
    for name, keys in [('by-type', ['type']), ('by-country', ['iso', 'country']), ('by-year', ['year']), ('by-country-year-type', ['iso', 'country', 'year', 'type'])]:
        aggregate(df, keys).to_csv(out / f'{name}.csv', index=False)
    distributions = df[list(IMPACTS.values())].describe(percentiles=[.25, .5, .75, .95, .99]).transpose()
    distributions.to_csv(out / 'impact-distributions.csv', index_label='metric')
    for metric in ['deaths', 'affected', 'damage_adjusted_usd']:
        df.dropna(subset=[metric]).nlargest(20, metric).to_csv(out / f'largest-{metric}.csv', index=False)
    lines = ['# Initial analysis', '', f'Source: `{raw.name}`; SHA-256: `{original_hash}`.', '',
             f'Scope: {args.start_year}–{args.end_year}. {len(df):,} country-disaster records, '
             f'{audit["unique_events"]:,} distinct event identifiers, {audit["countries"]} countries/territories.', '',
             'Counts below refer to country-disaster records, not unique worldwide disasters.', '', '## Reported impact and coverage', '',
             '| Measure | Reported sum | Records reporting | Coverage |', '|---|---:|---:|---:|']
    for metric in IMPACTS.values():
        total = df[metric].sum(min_count=1)
        lines.append(f'| {metric} | {total:,.0f} | {df[metric].count():,} / {len(df):,} | {df[metric].notna().mean():.1%} |')
    for title, keys in [('Disaster types', ['type']), ('Countries', ['iso', 'country']), ('Years', ['year'])]:
        grouped = aggregate(df, keys)
        lines += ['', f'## {title}', '', '| Measure | Largest reported totals (top 5) |', '|---|---|']
        for metric in ['records', 'deaths', 'affected', 'damage_adjusted_usd']:
            leaders = grouped.dropna(subset=[metric]).nlargest(5, metric)
            values = '; '.join(f'{int(r[keys[-1]]) if keys[-1] == "year" else r[keys[-1]]}: {r[metric]:,.0f}' for _, r in leaders.iterrows())
            lines.append(f'| {metric} | {values} |')
    lines += ['', '## Hazard frequency and reporting coverage', '',
              '| Hazard | Records | Deaths coverage | Affected coverage | Adjusted damage coverage |', '|---|---:|---:|---:|---:|']
    for _, r in aggregate(df, ['type']).sort_values('records', ascending=False).iterrows():
        lines.append(f'| {r["type"]} | {r["records"]:,} | {r["deaths_coverage_pct"]:.1f}% | {r["affected_coverage_pct"]:.1f}% | {r["damage_adjusted_usd_coverage_pct"]:.1f}% |')
    lines += ['', '## Distribution of reported impacts per record', '',
              '| Measure | Median | 95th percentile | Maximum |', '|---|---:|---:|---:|']
    for metric, r in distributions.iterrows():
        lines.append(f'| {metric} | {r["50%"]:,.0f} | {r["95%"]:,.0f} | {r["max"]:,.0f} |')
    lines += ['', f'Adjusted damage reference year identified from CPI=100: **{audit.get("adjusted_damage_reference_year", "unverified")}**.', '',
              '**2026 is partial.** Its annual total must not be compared as a complete year with earlier years. Current-year adjusted damage is unavailable in this export.', '',
              'These distributions describe reported values only, not all disasters. Large gaps between medians and maxima motivate a square-root color scale on the map; ranking bars and time-series axes remain linear.']
    lines += ['', '## Interpretation limits', '',
              '- Blank impacts remain null. Sums include reported values only; coverage accompanies each aggregate.',
              '- Total Affected already combines injured, affected and homeless. Repeat impacts across events are not unique people.',
              '- Both damage columns are converted from thousands of USD to USD. Adjusted figures retain the source export’s price basis; nominal values never fill adjusted gaps.',
              '- Totals describe recorded impacts, not future risk, per-capita vulnerability, or a causal climate trend.',
              '- A disaster spanning countries contributes one record per country. All impacts are attributed to its start year.',
              f'- {audit["unmapped_rows"]} records in {len(audit["unmapped_countries"])} countries/territories lack matching map polygons; they remain in charts and totals.',
              '- See quality-report.json for exclusions, duplicate checks, numeric issues and geographic join coverage.', '',
              '## Sources', '',
              '- [EM-DAT public table](https://doc.emdat.be/docs/data-structure-and-content/emdat-public-table/)',
              '- [EM-DAT biases](https://doc.emdat.be/docs/known-issues-and-limitations/specific-biases/)',
              '- [Economic adjustment](https://doc.emdat.be/docs/protocols/economic-adjustment/)']
    (ROOT / 'docs/initial-analysis.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps(audit, indent=2, ensure_ascii=True))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', help='Path to the original public-table CSV or XLSX')
    parser.add_argument('--start-year', type=int, required=True)
    parser.add_argument('--end-year', type=int, required=True)
    parser.add_argument('--all-natural', action='store_true')
    run(parser.parse_args())
