// The baked content (gen/content.json, emitted by scripts/bake-content.ts from
// content/*.md) behind its types. Pure data bakes as JSON; the types live here.
import raw from "./gen/content.json";

export interface Doc {
	attributes: {title: string; description?: string};
	body: string;
}
export interface Post {
	slug: string;
	attributes: {title: string; description?: string; date: string; draft?: boolean};
	body: string;
}

export const docs = raw.docs as Record<string, Doc>;
export const posts = raw.posts as Post[];
