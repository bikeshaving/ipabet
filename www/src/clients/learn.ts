// /learn client — hydrates the drill (components/learn-app.ts) onto the frame
// the server rendered; saved progress restores inside the component at mount.
import {jsx} from "@b9g/crank/standalone";
import {renderer} from "@b9g/crank/dom";
import {LearnApp} from "../components/learn-app.ts";

renderer.hydrate(
	jsx`<${LearnApp} lessons=${(window as any).__CURRICULUM} />`,
	document.getElementById("learn-root")!,
);
