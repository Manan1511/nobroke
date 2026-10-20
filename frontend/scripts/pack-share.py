# Packs dist-share/ (from `npm run build:share`) into one self-contained page: dist-share/NoBroke.html.
# Usage: python scripts/pack-share.py   (run from the project folder)
import glob
import os

out_dir = "dist-share"
js = open(glob.glob(os.path.join(out_dir, "assets", "*.js"))[0], encoding="utf-8").read()
css = open(glob.glob(os.path.join(out_dir, "assets", "*.css"))[0], encoding="utf-8").read()
js = js.replace("</script", "<\\/script")
assert "</style" not in css

html = f"""<title>NoBroke</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="NoBroke: split bills, settle through friends. Demo with sample data.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
{css}
</style>
<div id="root"></div>
<script type="module">
{js}
</script>
"""
open(os.path.join(out_dir, "NoBroke.html"), "w", encoding="utf-8").write(html)
print("dist-share/NoBroke.html", round(len(html.encode()) / 1e6, 2), "MB")
