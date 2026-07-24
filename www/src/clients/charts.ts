// Hydrates the interactive charts (components/chart-viz.ts) where the page
// rendered them, supplying what only the client has: the audio map (serialized
// by the page — mp3 URLs are content-hashed server-side).

import {jsx} from "@b9g/crank/standalone";
import {renderer} from "@b9g/crank/dom";
import {VowelApp, ConsonantApp} from "../components/chart-viz.ts";

const AUDIO: Record<string, string> = (window as any).__CHART_AUDIO || {};

const vEl = document.getElementById("vowel-chart");
if (vEl) renderer.hydrate(jsx`<${VowelApp} audio=${AUDIO} />`, vEl);
const cEl = document.getElementById("consonant-chart");
if (cEl) renderer.hydrate(jsx`<${ConsonantApp} audio=${AUDIO} />`, cEl);
