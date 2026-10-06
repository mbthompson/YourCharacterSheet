# Tools

Development helpers. Neither is needed to run the app, and neither installs anything.

## build-guide-docx.js

Regenerates `The Character Sheet - A Guide to Knowing Yourself.docx` from `The Character Sheet - Guide.md`, keeping the Word document's design. Needs the `docx` npm package installed globally (`npm install -g docx`). Run it whenever the guide changes:

```bash
NODE_PATH="$(npm root -g)" node tools/build-guide-docx.js "The Character Sheet - Guide.md" "The Character Sheet - A Guide to Knowing Yourself.docx"
```

The generator does not handle backtick code spans, so write ".json file" rather than "`.json` file" in the guide.

## test-harness.mjs

Drives the installed Google Chrome headless over the DevTools protocol (no dependencies) against a running copy of the app. Start a static server first (`npx serve -s .` on port 3000), then:

```bash
node tools/test-harness.mjs http://localhost:3000/ /tmp/sheet-tests tests
```

`tests` runs the end-to-end checks (import validation, scoring, the guided path forward and back, saving, accordions, sharing, blanks, no em dashes, no sideways scrolling at 320 to 1024px). `shots` captures desktop, tablet and phone screenshots into the output folder, `shots2` captures the share dialog and blank states, and `print` writes `print.pdf`.
