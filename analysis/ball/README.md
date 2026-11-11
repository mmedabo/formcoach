# Ball detector pipeline (offline)

Goal: a small ball detector that runs in the browser (Game screen), trained
on our own beach footage. No hand labelling.

| Step | Tool | License | Runs on |
|---|---|---|---|
| 1. Pull frames | `../extract_frames.py` | ours | any computer |
| 2. Label "volleyball" automatically | [DART](https://github.com/mkturkcan/DART) `scripts/auto_label.py` (SAM 3) | SAM License (commercial use allowed under its terms) | NVIDIA GPU |
| 3. Build the dataset | `make_dataset.py` | ours | any computer |
| 4. Train + export `ball.tflite` | `train_ball_model.py` (MediaPipe Model Maker) | Apache-2.0 | GPU recommended |
| 5. Ship | copy to `models/ball.tflite`, set `"ball": "ball.tflite"` in `models/models.json` | — | — |

The app does not ship DART or SAM 3. Only the trained `ball.tflite` ships.
Read the SAM License before you use DART; keep a copy with the dataset.

## Commands

```bash
# 1. frames: 1 of every 10, from several clips (sky, sand, near, far, blur)
python ../extract_frames.py clip1.mp4 clip2.mp4 --every 10 --out frames/

# 2. auto-label (in a DART checkout, NVIDIA GPU, see its README for setup)
python scripts/auto_label.py --images-dir /path/to/frames --classes volleyball \
    --checkpoint sam3.pt --format coco --confidence 0.4 -o /path/to/labels_out

# 3. dataset for Model Maker (renumbers categories from 1, 85/15 split)
python make_dataset.py --images frames/ --coco labels_out/annotations.json --out dataset/

# 4. train and export
pip install mediapipe-model-maker
python train_ball_model.py --data dataset/ --epochs 30 --out ball.tflite

# 5. ship: copy the model, then name it in models/models.json
cp exported_model/ball.tflite ../../models/ball.tflite
#    models/models.json → { "ball": "ball.tflite" }
```

## Check the labels before training

Auto-labels are not perfect. Open 50 random frames with their boxes and
remove wrong ones (heads, white hats, sun glare) before step 3. A few hundred
good frames from varied conditions are better than thousands of similar ones.

## Without a trained model

The Game screen uses the generic COCO "sports ball" class of the person
detector. It finds a clear ball against sand or a wall, and misses it against
bright sky and during fast motion blur. The trained model fixes that.
