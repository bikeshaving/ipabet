// Hydrates the hero demo wherever a page rendered it (the landing page, blog
// posts). Demos come from the component module — identical on both sides by
// construction; `data-teaser` picks the short cycle, `data-still` the
// animation-only variant.
import {jsx} from "@b9g/crank/standalone";
import {renderer} from "@b9g/crank/dom";
import {HeroDemo, DEMOS, DEMO_TEASER} from "../components/hero-demo.ts";

const root = document.getElementById("hero-root");
if (root) {
	const still = root.hasAttribute("data-still");
	const demos = root.hasAttribute("data-teaser") ? DEMO_TEASER : DEMOS;
	renderer.hydrate(jsx`<${HeroDemo} demos=${demos} still=${still} />`, root);
}
