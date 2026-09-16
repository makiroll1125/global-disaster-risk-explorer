"""Small synthetic fixtures exercise data semantics; never used as dashboard data."""
import sys
import unittest
from pathlib import Path
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from prepare_data import clean, aggregate, IMPACTS


def record(identifier='2020-0001-USA', **updates):
    row = {'DisNo.': identifier, 'Disaster Group': 'Natural', 'Disaster Type': 'Flood',
           'Country': 'United States of America', 'ISO': 'USA', 'Region': 'Americas',
           'Start Year': 2020, **{key: None for key in IMPACTS}}
    row.update(updates)
    return row


class DataSemantics(unittest.TestCase):
    def test_unknown_zero_and_currency(self):
        df, audit = clean(pd.DataFrame([
            record(**{'Total Deaths': 0, "Total Damage ('000 US$)": 12}),
            record('2020-0002-USA')]), 2000, 2025)
        self.assertEqual(df.deaths.iloc[0], 0)
        self.assertTrue(pd.isna(df.deaths.iloc[1]))
        self.assertEqual(df.damage_usd.iloc[0], 12000)
        self.assertTrue(df.damage_adjusted_usd.isna().all())
        totals = aggregate(df, ['type']).iloc[0]
        self.assertEqual(totals.deaths, 0)
        self.assertEqual(totals.deaths_reported, 1)
        self.assertTrue(pd.isna(totals.damage_adjusted_usd))
        self.assertEqual(audit['unmapped_rows'], 0)

    def test_country_records_and_events(self):
        df, audit = clean(pd.DataFrame([record(), record('2020-0001-CAN', ISO='CAN', Country='Canada')]), 2000, 2025)
        self.assertEqual(len(df), 2)
        self.assertEqual(audit['unique_events'], 1)

    def test_filter_and_invalid_impacts(self):
        df, audit = clean(pd.DataFrame([record(**{'Total Deaths': -4}),
            record('1999-0001-USA', **{'Start Year': 1999}),
            record('2020-0002-USA', **{'Disaster Group': 'Technological'})]), 2000, 2025)
        self.assertEqual(len(df), 1)
        self.assertTrue(pd.isna(df.deaths.iloc[0]))
        self.assertEqual(audit['excluded_rows'], 2)
        self.assertEqual(audit['invalid_numeric_values']['Total Deaths'], 1)

    def test_duplicate_policy(self):
        df, audit = clean(pd.DataFrame([record(), record()]), 2000, 2025)
        self.assertEqual(audit['exact_duplicates_removed'], 1)
        with self.assertRaises(ValueError):
            clean(pd.DataFrame([record(), record(**{'Total Deaths': 3})]), 2000, 2025)

    def test_historical_code_is_not_a_null_map_match(self):
        _, audit = clean(pd.DataFrame([record('2000-0001-SCG', ISO='SCG', Country='Serbia Montenegro')]), 2000, 2025)
        self.assertEqual(audit['unmapped_rows'], 1)


if __name__ == '__main__':
    unittest.main()
