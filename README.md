# FEGA Metadata Playground

Static playground for exploring examples from [`M-casado/fega-metadata-schema`](https://github.com/M-casado/fega-metadata-schema) as JSON-LD/RDF-style graphs and for testing edited examples against a Biovalidator endpoint.

## Local Development

```bash
npm install
git clone https://github.com/M-casado/fega-metadata-schema.git .cache/fega-metadata-schema
npm run generate -- --schema-root .cache/fega-metadata-schema
npm run dev
```

The browser validation default is `http://biovalidator.ega.ebi.ac.uk/validate`. You can enter `http://localhost:3020/validate` in the app when running a local Biovalidator instance.

## Build

```bash
npm run build
```

Generated assets are written to `public/generated/` and are intentionally ignored by Git. GitHub Actions regenerates them before building and deploying the static Pages artifact.
