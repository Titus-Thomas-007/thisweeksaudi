"""Hero-image extraction shared by the API and the offline baker.

No FastAPI dependency: safe to import from standalone scripts.
"""
import html.parser
import json
import urllib.parse
import urllib.request


class _ImageParser(html.parser.HTMLParser):
    """Best-effort hero image discovery, in priority order:
    og:image/twitter:image meta -> link rel=image_src -> JSON-LD image ->
    largest content <img> (logos/icons skipped)."""
    def __init__(self):
        super().__init__()
        self.meta_image = None
        self.link_image = None
        self.ld_images = []
        self.imgs = []  # (area, width, src)
        self._in_ld = False
        self._ld_buf = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "meta" and not self.meta_image:
            prop = (d.get("property") or d.get("name") or "").lower()
            if prop in ("og:image", "twitter:image") and d.get("content"):
                self.meta_image = d["content"].strip()
        elif tag == "link" and not self.link_image:
            if (d.get("rel") or "").lower() == "image_src" and d.get("href"):
                self.link_image = d["href"].strip()
        elif tag == "script" and (d.get("type") or "").lower() == "application/ld+json":
            self._in_ld = True
            self._ld_buf = []
        elif tag == "img":
            src = (d.get("src") or "").strip()
            if not src or src.startswith("data:"):
                return
            low = src.lower()
            if any(bad in low for bad in ("logo", "icon", "sprite", "avatar", "placeholder", "pixel")):
                return
            try:
                w, h = int(d.get("width") or 0), int(d.get("height") or 0)
            except (TypeError, ValueError):
                w = h = 0
            self.imgs.append((w * h, w, src))

    def handle_data(self, data):
        if self._in_ld:
            self._ld_buf.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._in_ld:
            self._in_ld = False
            try:
                self._extract_ld(json.loads("".join(self._ld_buf)))
            except Exception:
                pass

    def _extract_ld(self, node):
        if isinstance(node, dict):
            img = node.get("image")
            if isinstance(img, str) and img.startswith("http"):
                self.ld_images.append(img)
            elif isinstance(img, list):
                self.ld_images.extend(i for i in img if isinstance(i, str) and i.startswith("http"))
            elif isinstance(img, dict) and isinstance(img.get("url"), str):
                self.ld_images.append(img["url"])
            for v in node.values():
                self._extract_ld(v)
        elif isinstance(node, list):
            for v in node:
                self._extract_ld(v)

    def best(self):
        for cand in (self.meta_image, self.link_image,
                     *(self.ld_images or [])):
            if cand:
                return cand
        big = [(a, s) for a, w, s in self.imgs if a >= 120000 and w >= 400]
        if big:
            big.sort(reverse=True)
            return big[0][1]
        for key in ("banner", "hero", "cover", "og-image", "uploads", "media"):
            for _, _, src in self.imgs:
                if key in src.lower():
                    return src
        return None


def fetch_og_image(url: str) -> str | None:
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0 (compatible; SaudiEventsBot/1.0)"})
        with urllib.request.urlopen(req, timeout=8) as r:
            ctype = r.headers.get("Content-Type", "")
            if "html" not in ctype:
                return None
            raw = r.read(400_000).decode("utf-8", "ignore")
        p = _ImageParser()
        p.feed(raw)
        img = p.best()
        if img:
            return urllib.parse.urljoin(url, img)
    except Exception:
        pass
    return None
