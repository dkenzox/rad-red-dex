# Radical Red Dexter

A browser-based Pokédex for **Pokémon Radical Red**, focused on making team-building and move choices easier. It shows species, stats, learnsets, type matchups, and extra **offensive coverage tooling** so you can see which move typings answer your defensive weaknesses and how each move type hits the type chart.

## Intention

- **Clarity at a glance:** Filter by name, type, move, or ability; open any species for full detail, learnsets, and evolution context.
- **Coverage planning:** Beyond a simple weakness grid, this fork adds **“Coverage vs threats”** (which move types are super-effective against typings that hit *you* for 2× or more, plus a merged suggestion row) and a collapsible **move type → super-effective** reference for quick comparison when you gain a new move or consider coverage items or abilities.
- **Randomizer-aware play:** Optional save upload (v4.1) still aligns with upstream behavior for ability and learnset randomizers when you use the hosted data.

The goal is not to replace the official dex, but to offer a **practical companion** for Radical Red runs—especially when you are patching holes in your team’s offensive answers to common threats.

## Upstream

Game data and the original app structure come from **[JwowSquared/Radical-Red-Pokedex](https://github.com/JwowSquared/Radical-Red-Pokedex)**. This repository tracks local changes (such as the coverage features above) on top of that baseline. The live site loads `data.js` from that upstream repo unless you change `src/globals.js` to point elsewhere.

## Running locally

This is a static site. From the project root:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. A local server avoids browser restrictions on loading modules or `file://` quirks.

## License

Respect the license and attribution of the upstream **Radical-Red-Pokedex** project; this fork inherits the same data and architectural debt unless you replace or relicense components explicitly.
