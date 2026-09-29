// /languages client — hydrates the language picker the server rendered.
import {jsx} from "@b9g/crank/standalone";
import {renderer} from "@b9g/crank/dom";
import {LanguagePicker} from "../components/language-picker.ts";

renderer.hydrate(jsx`<${LanguagePicker} />`, document.getElementById("langs-root")!);
