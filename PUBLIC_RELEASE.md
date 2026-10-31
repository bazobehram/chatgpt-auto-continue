# Clean-history public release procedure

**Do not change the visibility of this development repository.** Its historical commits contained private deployment details and test evidence. Removing files from the current tree does not remove them from Git history.

## Preconditions
- Release CI fully green, including isolated Chromium and Mission Signal service suites
- An authenticated live Chrome smoke test of Local Only and optional Mission Signal, without uploading any real transcripts
- Review all tracked source files, image assets, GitHub workflows, configuration, author metadata and archive contents
- Verify the GPL-3.0-only license and third-party asset permissions
- Approve the Chrome Web Store permission/privacy disclosures and store listing, if applicable
- Do not package previous `tests/*-results.json`, caches, local secrets, user profiles or private deployment files

## Create a new history (operator-authenticated workstation)
From a **reviewed, clean working tree at a pinned release commit**, copy the tracked source snapshot without its `.git` directory to a new empty directory. Do not use a mirror clone, old tags, or `git push --all` into a public repo.

```bash
# Example on a trusted workstation with an authenticated GitHub CLI:
git -C /path/to/private-source archive <VERIFIED_RELEASE_SHA> | tar -x -C /path/to/clean-export
cd /path/to/clean-export
# Verify filenames and contents before publication.
git init -b main
git add .
git commit -m "Initial GPL-3.0-only public source release"
gh repo create OWNER/NEW_PUBLIC_REPOSITORY --public --source=. --remote=origin --push
```

These are *instructions*, not a claim that publication has happened. Verify `gh auth status` before publishing and ensure the target repository contains exactly one initial commit with no inherited ancestry.

## After publishing
- Confirm no historical private commits or refs exist on the public remote.
- Add a versioned release and source archive from the clean repository.
- Configure issue templates, vulnerability reporting and branch protections.
- Keep internal deployment credentials and private QA evidence outside the public repo.
- Chrome Web Store submission is a separate operation and requires a publisher account and review.

The existing private repository remains the internal development source until a deliberate migration strategy is agreed.
