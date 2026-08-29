#!/usr/bin/env python3
"""Build current software data and screenshots from the five app sources."""

from __future__ import annotations

import json
import os
import re
import shutil
import sys
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

import yaml
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DATA = ROOT / "data" / "software.yaml"
GENERATED_DATA = ROOT / "data" / "software_generated.yaml"
GENERATED_SHOTS = ROOT / "static" / "generated" / "software"
GITHUB_API = "https://api.github.com"
USER_AGENT = "thekiller-site software sync"


def request_bytes(url: str, *, github: bool = False) -> tuple[bytes, str]:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if github and token:
        headers["Authorization"] = f"Bearer {token}"
        headers["X-GitHub-Api-Version"] = "2022-11-28"

    try:
        with urlopen(Request(url, headers=headers), timeout=45) as response:
            return response.read(), response.headers.get("Content-Type", "")
    except HTTPError as exc:
        raise RuntimeError(f"{url} returned HTTP {exc.code}") from exc
    except URLError as exc:
        raise RuntimeError(f"Could not retrieve {url}: {exc.reason}") from exc


def request_json(url: str, *, github: bool = False):
    raw, _ = request_bytes(url, github=github)
    return json.loads(raw.decode("utf-8"))


def github_json(path: str):
    return request_json(f"{GITHUB_API}/{path.lstrip('/')}", github=True)


def repository_name(repo_url: str) -> str:
    path = urlparse(repo_url).path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    if path.count("/") != 1:
        raise RuntimeError(f"Unsupported GitHub repository URL: {repo_url}")
    return path


def release_date(repo: str, tag: str, version: str, published_at: str) -> str:
    changelog_url = f"https://raw.githubusercontent.com/{repo}/{quote(tag, safe='')}/CHANGELOG.md"
    try:
        raw, _ = request_bytes(changelog_url)
        changelog = raw.decode("utf-8-sig", errors="replace")
        match = re.search(
            rf"^##\s+\[v?{re.escape(version)}\]\s+-\s+(\d{{4}}-\d{{2}}-\d{{2}})\s*$",
            changelog,
            flags=re.MULTILINE,
        )
        if match:
            return match.group(1)
    except RuntimeError:
        pass
    return published_at[:10]


def count_xaml_files(repo: str, tag: str, directory: str) -> int:
    entries = github_json(
        f"repos/{repo}/contents/{directory}?ref={quote(tag, safe='')}"
    )
    count = sum(
        1
        for entry in entries
        if entry.get("type") == "file" and entry.get("name", "").lower().endswith(".xaml")
    )
    if count < 1:
        raise RuntimeError(f"No XAML files found in {repo}/{directory} at {tag}")
    return count


def update_stat(stats: list[str], pattern: str, replacement: str) -> None:
    matcher = re.compile(pattern, flags=re.IGNORECASE)
    for index, value in enumerate(stats):
        if matcher.fullmatch(str(value).strip()):
            stats[index] = replacement
            return
    stats.append(replacement)


def readable_megabytes(size: int) -> str:
    value = f"{size / (1024 * 1024):.1f}".rstrip("0").rstrip(".")
    return f"~{value} MB exe"


def valid_image(data: bytes, content_type: str) -> bool:
    return (
        content_type.lower().startswith("image/")
        or data.startswith(b"\x89PNG\r\n\x1a\n")
        or data.startswith(b"\xff\xd8\xff")
        or data.startswith(b"RIFF") and data[8:12] == b"WEBP"
    )


def synchronize_app(app: dict) -> None:
    repo = repository_name(app["repo"])
    release = github_json(f"repos/{repo}/releases/latest")
    tag = str(release["tag_name"])
    version = tag[1:] if tag.lower().startswith("v") else tag

    exe_assets = [
        asset
        for asset in release.get("assets", [])
        if str(asset.get("name", "")).lower().endswith(".exe")
    ]
    if not exe_assets:
        raise RuntimeError(f"The latest {repo} release has no EXE asset")
    installer_assets = [
        asset
        for asset in exe_assets
        if "portable" not in str(asset.get("name", "")).lower()
    ]
    if not installer_assets:
        raise RuntimeError(f"The latest {repo} release has no installer EXE asset")
    exe = max(installer_assets, key=lambda asset: int(asset.get("size", 0)))

    languages = count_xaml_files(repo, tag, "Strings")
    themes = count_xaml_files(repo, tag, "Themes")

    app["version"] = version
    app["released"] = release_date(repo, tag, version, str(release["published_at"]))
    stats = [str(value) for value in app.setdefault("stats", [])]
    update_stat(stats, r"\d+\s+languages", f"{languages} languages")
    update_stat(stats, r"\d+\s+themes", f"{themes} themes")
    update_stat(stats, r"~?[\d.]+\s+MB\s+exe", readable_megabytes(int(exe["size"])))
    app["stats"] = stats

    screenshot_files = app.get("screenshot_files")
    if not screenshot_files:
        raise RuntimeError(f"{app['name']} has no screenshot_files list")

    slug = str(app["slug"])
    destination = GENERATED_SHOTS / slug
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True, exist_ok=True)

    generated_paths: list[str] = []
    base_url = str(app["url"]).rstrip("/")
    for index, filename in enumerate(screenshot_files, start=1):
        filename = str(filename).lstrip("/")
        screenshot_url = f"{base_url}/screenshots/{filename}"
        image, content_type = request_bytes(screenshot_url)
        if not valid_image(image, content_type):
            raise RuntimeError(f"{screenshot_url} did not return an image")

        output_name = f"{index}.jpg"
        output_path = destination / output_name
        with Image.open(BytesIO(image)) as source:
            source = source.convert("RGB")
            if source.width > 1600:
                height = round(source.height * (1600 / source.width))
                source = source.resize((1600, height), Image.Resampling.LANCZOS)
            source.save(output_path, "JPEG", quality=84, optimize=True, progressive=True)
        generated_paths.append(
            f"/generated/software/{slug}/{output_name}?v={quote(version, safe='')}"
        )

    app["shots"] = len(generated_paths)
    app["screenshot_paths"] = generated_paths
    print(
        f"{app['name']}: v{version}, {app['released']}, "
        f"{languages} languages, {themes} themes, {len(generated_paths)} screenshots"
    )


def main() -> int:
    with SOURCE_DATA.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle)

    app_sections = [section for section in data.get("sections", []) if section.get("id") == "apps"]
    if len(app_sections) != 1:
        raise RuntimeError("data/software.yaml must contain exactly one apps section")

    apps = app_sections[0].get("items", [])
    if len(apps) != 5:
        raise RuntimeError(f"Expected five Windows apps, found {len(apps)}")

    for app in apps:
        synchronize_app(app)

    GENERATED_DATA.parent.mkdir(parents=True, exist_ok=True)
    with GENERATED_DATA.open("w", encoding="utf-8", newline="\n") as handle:
        yaml.safe_dump(data, handle, sort_keys=False, allow_unicode=True, width=1000)

    print(f"Generated {GENERATED_DATA.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Software synchronization failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
