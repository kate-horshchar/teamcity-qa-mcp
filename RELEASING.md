# Releasing

Semantic versioning. `package.json` is the single source of the version:
the server reads it at startup, and `plugin/.claude-plugin/plugin.json` is
kept equal to it at every release.

## Checklist

1. **Bump the version** (also updates `plugin.json` manually):

   ```bash
   npm pkg set version=X.Y.Z
   # set the same version in plugin/.claude-plugin/plugin.json
   ```

   - MAJOR — breaking changes to tool names, schemas, or behavior
   - MINOR — new tools/features, backward compatible
   - PATCH — fixes only

2. **Update `CHANGELOG.md`**: add an `## [X.Y.Z] — YYYY-MM-DD` section
   (Added / Changed / Fixed) and the compare link at the bottom.

3. **Verify**:

   ```bash
   npm run build && npx vitest run
   npm run build:prompts        # must produce no diff
   npx tsx scripts/smoke-test.ts
   ```

4. **Commit, tag, push**:

   ```bash
   git add -A
   git commit -m "vX.Y.Z: <one-line summary>"
   git tag vX.Y.Z
   git push origin main --tags
   ```

5. **Create the GitHub Release** from the tag, with notes copied from the
   CHANGELOG section:

   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <(notes from CHANGELOG)
   ```

   Optionally attach the Cowork plugin zip: `npm run pack-plugin` and add
   `teamcity-qa.zip` to the release assets.

6. **Publish to npm** (asks for the 2FA passkey):

   ```bash
   npm publish --access public
   ```

## Notes

- The git tag, the GitHub Release, `package.json`, and the CHANGELOG heading
  must all agree on the version.
- Users who installed via `npx -y git+https://…` may have a cached build;
  a version bump plus `npm cache clean --force` on their side guarantees the
  update is picked up.
