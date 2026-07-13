import {jsx} from "@b9g/crank/jsx-tag";
import {Raw} from "@b9g/crank";

/** Emit `window.<name> = <json>` as an inline bootstrap script, safely escaped
 *  so the serialized data can never break out of the <script> element. Replaces
 *  hand-written `<script>window.__X = ${JSON.stringify(...)}</script>` strings. */
export function SerializeScript({name, value}: {name: string; value: unknown}) {
	const json = JSON.stringify(value).replace(/</g, "\\u003c");
	return jsx`<script><${Raw} value=${`window.${name} = ${json};`} /></script>`;
}
