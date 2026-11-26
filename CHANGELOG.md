# Changelog

## Upcoming

### 🚀 Enhancement

- Added a Queue History section to the Status page that charts pending jobs per reason, memory held against each QOS's per-user cap, the fair-share factor and the median pending priority over 24 hours, 7 days or 30 days, from the runner's hourly history. ([#231](https://github.com/dandi-compute/dandi-compute-page/pull/231))
- Added a scheduling panel under the Status page's SLURM queue that counts pending jobs per reason, meters running jobs against each QOS's per-user caps, and shows each pending job's priority breakdown, the fair-share factor and the partition and QOS limits. ([#230](https://github.com/dandi-compute/dandi-compute-page/pull/230))
- Added a tag naming each job's pipeline to its card, which filters the dashboard to that pipeline when clicked. ([#223](https://github.com/dandi-compute/dandi-compute-page/pull/223))
- Replaced the dashboard's filter inputs with a single search bar of `key:value` terms and free text that filters as you type, whose suggestions only offer values that jobs in view have. ([#223](https://github.com/dandi-compute/dandi-compute-page/pull/223))
- Added version ranges to the search's `version:` and `codebase:` keys, such as `version:<1.5` or `version:>=1.3 version:<1.5`. ([#223](https://github.com/dandi-compute/dandi-compute-page/pull/223))
- Moved the Queue priorities card from the top of the dashboard to the Status page. ([#223](https://github.com/dandi-compute/dandi-compute-page/pull/223))
- Made the flat view the default and listed it before the tree view. ([#223](https://github.com/dandi-compute/dandi-compute-page/pull/223))
- Showed the Status page's disk snapshot as meters, one per DANDI filesystem and two per quota (space and number of files). ([#224](https://github.com/dandi-compute/dandi-compute-page/pull/224))
- Dropped the unused SCRATCH and POOL quotas from the Status page's disk meters, leaving only the home directory's. ([#225](https://github.com/dandi-compute/dandi-compute-page/pull/225))
- Added a files meter and chip for each DANDI filesystem to the Status page, showing its inode use against its limit when the disk snapshot records them. ([#227](https://github.com/dandi-compute/dandi-compute-page/pull/227))
- Added a Blob heads section to the Status page that shows the usage each partition should have, from simple-s3-backup's partition spec and each head's size in the bucket, and flags heads whose directories are missing or misplaced. Selecting a head projects the partitions with it moved, to plan a change. ([#228](https://github.com/dandi-compute/dandi-compute-page/pull/228))
- Renamed the Status page's headings to SLURM Queue and Disk Usage, dropped the notes under them, and removed the DANDI Archive backup partitions, which the disk snapshot already covers. ([#224](https://github.com/dandi-compute/dandi-compute-page/pull/224))

### 🐛 Bug Fix

- Grouped visualization plots by their full folder, so each probe's quality control plots stay apart and each QC card shows its own probe's plot. ([#229](https://github.com/dandi-compute/dandi-compute-page/pull/229))
- Fixed the home directory's quota report showing as raw text instead of being read, because of its "Last updated" line. ([#224](https://github.com/dandi-compute/dandi-compute-page/pull/224))
