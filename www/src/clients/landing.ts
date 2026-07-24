// Hydrates the hero demo wherever a page rendered it (the landing page, blog
// posts). Demos come from the component module — identical on both sides by
// construction; `data-still` marks the animation-only variant.
import {jsx} from "@b9g/crank/standalone";
import {renderer} from "@b9g/crank/dom";
import {HeroDemo, DEMOS} from "../components/hero-demo.ts";

const root = document.getElementById("hero-root");
if (root) {
	renderer.hydrate(
		jsx`<${HeroDemo} demos=${DEMOS} still=${root.hasAttribute("data-still")} />`,
		root,
	);
}
