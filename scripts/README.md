# Local workflow

`prepare_data.py` is the reproducible acquisition-inspection, cleaning and initial-analysis entry point. Run it from any working directory; all output paths are relative to this repository.

```powershell
python scripts/prepare_data.py data/raw/public_emdat_custom_request_2026-09-15_8a971085-98e9-420a-9513-c44f4dc5eca4.xlsx --start-year 2000 --end-year 2026 --all-natural
```

The source path is relative to the caller's working directory (or can be absolute). The original export is never rewritten. Generated processed outputs and `docs/initial-analysis.md` are replaced on each successful run.

Schema errors, conflicting duplicate record identifiers and empty scopes stop processing with an error. Invalid impact values are counted and retained as null. The quality report provides the audit trail.
