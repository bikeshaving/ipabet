// Hydrates the hero demo wherever a page rendered it (the landing page, blog
// posts). Demos come from the component module — identical on both sides by
// construction; `data-still` marks the animation-only variant.
import {jsx} from "@b9g/crank/standalone";
import {renderer} from "@b9g/crank/dom";
import {HeroDemo, DEMOS, DEMO_TEASER} from "../components/hero-demo.ts";

const root = document.getElementById("hero-root");
if (root) {
	const still = root.hasAttribute("data-still");
	renderer.hydrate(
		jsx`<${HeroDemo} demos=${still ? DEMO_TEASER : DEMOS} still=${still} />`,
		root,
	);
}
