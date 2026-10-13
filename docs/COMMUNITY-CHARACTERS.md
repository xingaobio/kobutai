# Community characters: the weekly update

People can share characters they drew from the extension (Import → My imported characters → **Share with everyone**). There is no Kobutai server: the extension builds a zip and the person sends it to you.

## How a submission reaches you

1. In the share dialog they enter the character's name, how to credit them and (optionally) its genres, and tick the CC BY 4.0 agreement. Nothing can be made without a credit name and that tick.
2. The extension saves `kobutai-<id>.zip` to their Downloads folder:
   - `<id>/pack.json`: library format, `author` = their credit name, `license` = `CC BY 4.0`
   - `<id>/sheet.webp` or `sheet.png`: their sprite sheet (Petdex grid, 8 × 9 cells)
   - `<id>/CREDITS.txt`: name, author, license and the date they agreed
3. They send it one of two ways:
   - **GitHub**: opens a pre-filled issue from `.github/ISSUE_TEMPLATE/character.yml` (label `character`); they drag the zip in.
   - **Email**: opens a pre-written email; they attach the zip. This button only appears when `SUBMIT_EMAIL` in `src/lib/share/submit.ts` is set. Use an address you are happy to publish: it ships inside the extension.

Only characters imported from the person's own files can be shared. Petdex characters belong to their Petdex submitters and have no share button.

## Each week

1. Collect the week's zips (GitHub issues labelled `character`, plus email).
2. Look at each one: is it original or clearly theirs, family-friendly, and does it animate properly? Import the zip's folder in Kobutai (Import → drop `pack.json` + the sheet) to preview it if needed.
3. Add the accepted ones:

   ```bash
   node scripts/add-character.mjs ~/Downloads/kobutai-blobby.zip
   node scripts/add-character.mjs ~/Downloads/kobutai-neko.zip --genres lofi,jpop   # adjust genres
   node scripts/add-character.mjs ~/Downloads/kobutai-star.zip --id star-2          # resolve an id clash
   ```

   The script checks the pack (credit, license, asset names, size under 4 MB), copies it to `library/<id>/`, adds it to `library/index.json` and appends a line to `library/CREDITS.md`.
4. Commit and push to `main`. Every install syncs `library/` from GitHub every 12 hours, so within half a day everyone can draw the new characters. Their album cards show "by <author> · CC BY 4.0".
5. Close the issues with a thank-you.

To remove a character later, delete its folder and its line in `library/index.json`; installs drop it on their next sync.
