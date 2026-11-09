# Changelog

## Upcoming

### 🚀 Enhancement

- Added a tag naming each job's pipeline to its card, which filters the dashboard to that pipeline when clicked. ([#223](https://github.com/dandi-compute/dandi-compute-page/pull/223))
- Replaced the dashboard's filter inputs with a single search bar of `key:value` terms and free text that filters as you type, whose suggestions only offer values that jobs in view have. ([#223](https://github.com/dandi-compute/dandi-compute-page/pull/223))
- Added version ranges to the search's `version:` and `codebase:` keys, such as `version:<1.5` or `version:>=1.3 version:<1.5`. ([#223](https://github.com/dandi-compute/dandi-compute-page/pull/223))
- Moved the Queue priorities card from the top of the dashboard to the Status page. ([#223](https://github.com/dandi-compute/dandi-compute-page/pull/223))
- Made the flat view the default and listed it before the tree view. ([#223](https://github.com/dandi-compute/dandi-compute-page/pull/223))
- Showed the Status page's disk snapshot as meters, one per DANDI filesystem and two per quota (space and number of files). ([#224](https://github.com/dandi-compute/dandi-compute-page/pull/224))
- Renamed the Status page's headings to SLURM Queue and Disk Usage, dropped the notes under them, and removed the DANDI Archive backup partitions, which the disk snapshot already covers. ([#224](https://github.com/dandi-compute/dandi-compute-page/pull/224))

### 🐛 Bug Fix

- Fixed the home directory's quota report showing as raw text instead of being read, because of its "Last updated" line. ([#224](https://github.com/dandi-compute/dandi-compute-page/pull/224))
