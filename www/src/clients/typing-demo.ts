// Hydrates the typing demo wherever a page rendered it (the landing hero, blog
// posts). The example words ride the data-words marker so both sides resolve
// the same subset from the same module; data-still is the animation-only mode.
import {jsx} from "@b9g/crank/standalone";
import {renderer} from "@b9g/crank/dom";
import {TypingDemo, pickDemos} from "../components/typing-demo.ts";

const root = document.getElementById("typing-demo-root");
if (root) {
	renderer.hydrate(
		jsx`<${TypingDemo}
			demos=${pickDemos(root.getAttribute("data-words"))}
			still=${root.hasAttribute("data-still")} />`,
		root,
	);
}
