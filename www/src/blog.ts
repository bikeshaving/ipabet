import {jsx} from "@b9g/crank/jsx-tag";
import {Marked} from "@b9g/crankdown";
import {Layout} from "./layout.ts";
import {components} from "./marked-components.ts";
import {posts, type Post} from "./content.gen.ts";
// @ts-ignore — shovel rewrites these to hashed asset URLs at build time.
import globalCss from "./styles/global.css" with {assetBase: "/assets/"};
// @ts-ignore
import blogCss from "./styles/blog.css" with {assetBase: "/assets/"};

// /blog — dated writing about the project, in first person, where narrative is
// allowed (the reference pages state the design; the archaeology and the
// arguments live here). Each post is a full page of the site, so it can embed
// the live vocabulary — <Combo>, keystroke chips — like any other page.
//
// Posts are the site's half of the planet contract: bikeshaving.org aggregates
// project blogs by consuming nothing but /feed.xml, and a post's canonical URL
// stays here.

const SITE = "https://ipabet.org";

/** Published posts, newest first — drafts render at their URL but are absent
 *  from the index and the feed. */
const published = posts.filter((p) => p.attributes.draft !== true);

function fmtDate(iso: string): string {
	return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
		year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
	});
}

export function BlogIndex() {
	return jsx`
		<${Layout} title="IPAbet blog" desc="Dated writing about IPAbet — design arguments, launch notes, and the archaeology the reference pages leave out." styles=${[globalCss, blogCss]}>
			<main class="blog">
				<h1>IPA<span class="ipa">bet</span> blog</h1>
				<p class="bloglede">The reference pages state the design; this is where the arguments live. <a href="/feed.xml">Atom feed</a> · <a href="/">home</a>.</p>
				${published.length === 0 ? jsx`<p class="bloglede">Nothing published yet.</p>` : null}
				<ul class="postlist">
					${published.map((p) => jsx`
						<li>
							<time datetime=${p.attributes.date}>${fmtDate(p.attributes.date)}</time>
							<a href=${`/blog/${p.slug}`}>${p.attributes.title}</a>
							${p.attributes.description ? jsx`<p>${p.attributes.description}</p>` : null}
						</li>`)}
				</ul>
			</main>
		<//>`;
}

export function BlogPost({post}: {post: Post}) {
	return jsx`
		<${Layout} title=${`${post.attributes.title} — IPAbet blog`} desc=${post.attributes.description ?? ""} styles=${[globalCss, blogCss]}>
			<main class="blog post">
				<p class="crumbs"><a href="/blog">← blog</a></p>
				<h1>${post.attributes.title}</h1>
				<p class="postmeta"><time datetime=${post.attributes.date}>${fmtDate(post.attributes.date)}</time>${
					post.attributes.draft === true ? jsx` · <span class="draft">draft</span>` : null
				}</p>
				<${Marked} markdown=${post.body} components=${components} />
				<footer>
					<a href="/">IPAbet</a>
					<a href="/blog">All posts</a>
					<a href="/feed.xml">Feed</a>
				</footer>
			</main>
		<//>`;
}

export function findPost(slug: string): Post | undefined {
	return posts.find((p) => p.slug === slug);
}

const escapeXml = (s: string) =>
	s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The Atom feed — the entire integration surface the planet consumes. */
export function atomFeed(): string {
	const updated = published.length > 0 ? `${published[0].attributes.date}T00:00:00Z` : "2026-07-17T00:00:00Z";
	const entries = published.map((p) => {
		const url = `${SITE}/blog/${p.slug}`;
		return (
			`\t<entry>\n` +
			`\t\t<title>${escapeXml(p.attributes.title)}</title>\n` +
			`\t\t<link href="${url}"/>\n` +
			`\t\t<id>${url}</id>\n` +
			`\t\t<updated>${p.attributes.date}T00:00:00Z</updated>\n` +
			`\t\t<summary>${escapeXml(p.attributes.description ?? "")}</summary>\n` +
			`\t</entry>`
		);
	}).join("\n");
	return (
		`<?xml version="1.0" encoding="utf-8"?>\n` +
		`<feed xmlns="http://www.w3.org/2005/Atom">\n` +
		`\t<title>IPAbet blog</title>\n` +
		`\t<link href="${SITE}/blog"/>\n` +
		`\t<link rel="self" href="${SITE}/feed.xml"/>\n` +
		`\t<id>${SITE}/blog</id>\n` +
		`\t<updated>${updated}</updated>\n` +
		`\t<author><name>Brian Kim</name></author>\n` +
		(entries ? entries + "\n" : "") +
		`</feed>\n`
	);
}
