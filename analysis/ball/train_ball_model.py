"""
Train the in-app ball detector with MediaPipe Model Maker (Apache-2.0).

Input : the dataset/ folder from make_dataset.py (train/ and validation/).
Output: ball.tflite. Copy it to models/ball.tflite in the web app and set
        {"ball": "ball.tflite"} in models/models.json. The Game screen then
        loads it; without it, it uses the generic COCO "sports ball" class.

Needs: pip install mediapipe-model-maker   (TensorFlow; a GPU makes it much faster)

Usage:
    python train_ball_model.py --data dataset/ --epochs 30 --out ball.tflite
"""

import argparse
from pathlib import Path


def train(data_dir, epochs, batch_size, out_path):
    from mediapipe_model_maker import object_detector   # imported here: heavy dependency

    data = Path(data_dir)
    train_data = object_detector.Dataset.from_coco_folder(str(data / "train"), cache_dir=str(data / "cache_train"))
    val_data = object_detector.Dataset.from_coco_folder(str(data / "validation"), cache_dir=str(data / "cache_val"))
    print(f"train: {train_data.size} images, validation: {val_data.size}, labels: {train_data.label_names}")

    options = object_detector.ObjectDetectorOptions(
        supported_model=object_detector.SupportedModels.MOBILENET_MULTI_AVG,   # small enough for phones
        hparams=object_detector.HParams(export_dir="exported_model", epochs=epochs, batch_size=batch_size),
    )
    model = object_detector.ObjectDetector.create(train_data=train_data, validation_data=val_data, options=options)

    loss, coco_metrics = model.evaluate(val_data, batch_size=4)
    print(f"validation loss: {loss}")
    print(f"validation AP: {coco_metrics.get('AP')}, AP50: {coco_metrics.get('AP50')}")

    model.export_model(Path(out_path).name)   # written into exported_model/
    print(f"Exported exported_model/{Path(out_path).name} -> copy it to models/ball.tflite in the web app")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Train the ball detector (MediaPipe Model Maker)")
    ap.add_argument("--data", default="dataset", help="folder from make_dataset.py")
    ap.add_argument("--epochs", type=int, default=30)
    ap.add_argument("--batch-size", type=int, default=8)
    ap.add_argument("--out", default="ball.tflite")
    args = ap.parse_args()
    train(args.data, args.epochs, args.batch_size, args.out)
