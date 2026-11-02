import importlib.util
import json
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import yaml
from PIL import Image


class SoftwareSyncTests(unittest.TestCase):
    def test_full_catalog_sync(self):
        spec = importlib.util.spec_from_file_location(
            "software_sync", Path(__file__).with_name("sync-software.py")
        )
        sync = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(sync)
        source = sync.SOURCE_DATA
        catalog = yaml.safe_load(source.read_text(encoding="utf-8"))
        expected = next(s["items"] for s in catalog["sections"] if s["id"] == "apps")
        self.assertIn("killerbench", [app["slug"] for app in expected])
        image = BytesIO()
        Image.new("RGB", (32, 24)).save(image, "PNG")

        def response(url, *, github=False):
            if url.endswith("/releases/latest"):
                repo = url.split("/")[-3]
                data = {"tag_name": "v1.0.0", "published_at": "2026-11-02T16:12:15Z",
                        "assets": [{"name": repo + ".exe", "size": 1048576}]}
            elif "/contents/Strings?" in url:
                data = [{"type": "file", "name": str(i) + ".xaml"} for i in range(20)]
            elif "/contents/Themes?" in url:
                data = [{"type": "file", "name": str(i) + ".xaml"} for i in range(13)]
                data += [{"type": "file", "name": "Instrument.xaml"}]
            elif url.endswith("/CHANGELOG.md"):
                return b"## [1.0.0] - 2026-11-02\n", "text/plain"
            elif url.endswith((".png", ".jpg")):
                return image.getvalue(), "image/png"
            else:
                self.fail("Unexpected network request: " + url)
            return json.dumps(data).encode(), "application/json"

        with tempfile.TemporaryDirectory(prefix="software-sync-check-") as folder:
            root = Path(folder)
            with patch.object(sync, "ROOT", root), \
                    patch.object(sync, "GENERATED_DATA", root / "data/software_generated.yaml"), \
                    patch.object(sync, "GENERATED_SHOTS", root / "screenshots"), \
                    patch.object(sync, "request_bytes", side_effect=response):
                self.assertEqual(sync.main(), 0)
            result = yaml.safe_load((root / "data/software_generated.yaml").read_text(encoding="utf-8"))
            apps = next(s["items"] for s in result["sections"] if s["id"] == "apps")
            self.assertEqual([a["slug"] for a in apps], [a["slug"] for a in expected])
            for app in apps:
                self.assertEqual(len(app["screenshot_paths"]), len(app["screenshot_files"]))
                if app.get("count_xaml", True):
                    self.assertIn("13 themes", app["stats"])
                for index in range(1, app["shots"] + 1):
                    with Image.open(root / "screenshots" / app["slug"] / f"{index}.jpg") as shot:
                        self.assertEqual(shot.size, (32, 24))


if __name__ == "__main__":
    unittest.main()
