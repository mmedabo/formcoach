"""
Turn DART auto-labels into a MediaPipe Model Maker dataset.

DART (mkturkcan/DART, SAM License) labels images from a text prompt such as
"volleyball" with no training. Its auto_label.py writes one COCO file,
annotations.json, with category ids from 0. Model Maker's
Dataset.from_coco_folder() wants:

    <split>/images/<file>.jpg
    <split>/labels.json          (COCO; category id 0 is reserved for background)

This script copies the labelled images into train/ and validation/ folders,
renumbers categories from 1, and drops images with no boxes (unless --keep-empty).

Usage:
    python make_dataset.py --images frames/ --coco labels_out/annotations.json \
        --out dataset/ --val 0.15
"""

import argparse
import json
import random
import shutil
from pathlib import Path


def build(images_dir, coco_path, out_dir, val_frac, keep_empty, seed):
    coco = json.loads(Path(coco_path).read_text())
    cat_map = {c["id"]: i + 1 for i, c in enumerate(coco["categories"])}
    cats = [{"id": cat_map[c["id"]], "name": c["name"]} for c in coco["categories"]]

    anns_by_img = {}
    for a in coco["annotations"]:
        anns_by_img.setdefault(a["image_id"], []).append(a)

    images = [im for im in coco["images"] if keep_empty or anns_by_img.get(im["id"])]
    random.Random(seed).shuffle(images)
    n_val = max(1, int(len(images) * val_frac))
    splits = {"validation": images[:n_val], "train": images[n_val:]}

    for name, imgs in splits.items():
        img_out = Path(out_dir) / name / "images"
        img_out.mkdir(parents=True, exist_ok=True)
        anns = []
        for im in imgs:
            shutil.copy2(Path(images_dir) / im["file_name"], img_out / im["file_name"])
            for a in anns_by_img.get(im["id"], []):
                anns.append({**a, "id": len(anns) + 1, "category_id": cat_map[a["category_id"]]})
        labels = {"images": imgs, "annotations": anns, "categories": cats}
        (Path(out_dir) / name / "labels.json").write_text(json.dumps(labels))
        print(f"{name}: {len(imgs)} images, {len(anns)} boxes")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="DART COCO labels -> Model Maker dataset")
    ap.add_argument("--images", required=True, help="folder of frames that DART labelled")
    ap.add_argument("--coco", required=True, help="DART annotations.json")
    ap.add_argument("--out", default="dataset", help="output folder")
    ap.add_argument("--val", type=float, default=0.15, help="validation fraction")
    ap.add_argument("--keep-empty", action="store_true", help="keep frames with no ball (negatives)")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    build(args.images, args.coco, args.out, args.val, args.keep_empty, args.seed)
