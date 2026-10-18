"""Reproduce the final report's 2000–2005 versus 2020–2025 comparisons."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PERIODS = {'a': (2000, 2005), 'b': (2020, 2025)}
METRICS = ['records', 'deaths', 'affected', 'damage_adjusted_usd']


def summary(rows, metric, years):
    values = [1 if metric == 'records' else row[metric] for row in rows]
    known = [value for value in values if value is not None]
    total = sum(known) if known or metric == 'records' else None
    return {'total': total, 'annual_average': total / years if total is not None else None,
            'reported_records': len(known), 'records': len(rows),
            'coverage_pct': 100 * len(known) / len(rows) if rows else None}


def main():
    rows = json.loads((ROOT / 'data/processed/disasters.json').read_text(encoding='utf-8'))['records']
    selected = {key: [row for row in rows if start <= row['year'] <= end]
                for key, (start, end) in PERIODS.items()}
    comparisons = {}
    for metric in METRICS:
        pair = {key: summary(selected[key], metric, end - start + 1)
                for key, (start, end) in PERIODS.items()}
        a, b = (pair[key]['annual_average'] for key in ['a', 'b'])
        pair['change_pct'] = 100 * (b / a - 1) if a not in (None, 0) and b is not None else None
        comparisons[metric] = pair
    regions = []
    for region in sorted({row['region'] for row in rows}):
        pair = {key: sum(row['region'] == region for row in selected[key]) / (end - start + 1)
                for key, (start, end) in PERIODS.items()}
        regions.append({'region': region, 'a': pair['a'], 'b': pair['b'],
                        'difference': pair['b'] - pair['a'],
                        'change_pct': 100 * (pair['b'] / pair['a'] - 1) if pair['a'] else None})
    regions.sort(key=lambda row: -row['difference'])
    concentration = {}
    for key, records in selected.items():
        reported = sorted([row for row in records if row['deaths'] is not None], key=lambda row: -row['deaths'])
        concentration[key] = {'top_three_death_record_ids': [row['id'] for row in reported[:3]],
                              'top_three_share_pct': 100 * sum(row['deaths'] for row in reported[:3]) / sum(row['deaths'] for row in reported)}
    output = ROOT / 'data/processed'
    result = {'periods': PERIODS, 'comparisons': comparisons, 'regional_records_per_year': regions,
              'death_concentration': concentration}
    (output / 'period-comparison.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
    with (output / 'period-regions.csv').open('w', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(file, fieldnames=['region', 'a', 'b', 'difference', 'change_pct'])
        writer.writeheader(); writer.writerows(regions)
    print('Wrote period-comparison.json and period-regions.csv')


if __name__ == '__main__':
    main()
