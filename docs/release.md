# Preparing a public source snapshot

Use `python scripts/export_public.py /absolute/path/to/new-snapshot` to create a
source-only directory from the current checkout. The destination must not exist
and must be outside the repository. The exporter uses an allowlist and excludes
Git history, local environment, recordings, private research and generated output.
It writes a SHA-256 manifest alongside the exported directory.

Inspect that manifest and the exported files, run a secret scanner on the snapshot,
then install and run all checks from the snapshot itself. CI exercises the exporter
but a scanner result does not replace review of asset rights and data provenance.

Publish from a new, clean history or explicitly sanitise and verify every old
reference before reusing an existing repository. Do not change an existing private
repository's visibility merely because its latest tree is clean. Keep a private
backup before any history rewrite and review hosting-side PRs and cached references.

The exporter does not initialise Git, upload files, change visibility or deploy.
Publication is a separate operator action after reviewing the exact artifact.
