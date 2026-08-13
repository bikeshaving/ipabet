// Assembles spec/parity-vectors.json from the log the suite appends to.
//
// Run through `bun run vectors`, which clears the log first. Every port replays
// the result, so this is the one place a vector can be lost — hence the log is
// append-only and this step is a plain read.

import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dir, "../..");
const log = path.join(root, "spec/parity-vectors.ndjson");
const out = path.join(root, "spec/parity-vectors.json");

if (!fs.existsSync(log)) {
	console.error(`no ${log} — run the suite with IPABET_DUMP_VECTORS=1 first`);
	process.exit(1);
}

const vectors = fs
	.readFileSync(log, "utf8")
	.split("\n")
	.filter((line) => line.length > 0)
	.map((line) => JSON.parse(line));

fs.writeFileSync(out, JSON.stringify(vectors, null, 1) + "\n");
fs.unlinkSync(log);
console.log(`${vectors.length} vectors → spec/parity-vectors.json`);
