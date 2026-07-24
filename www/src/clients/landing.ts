// Landing client — hydrates the hero demo (components/hero-demo.ts); the
// attract loop starts at mount.
import {jsx} from "@b9g/crank/standalone";
import {renderer} from "@b9g/crank/dom";
import {HeroDemo} from "../components/hero-demo.ts";

renderer.hydrate(
	jsx`<${HeroDemo} demos=${(window as any).__DEMO ?? []} />`,
	document.getElementById("hero-root")!,
);
