# Research protocol and limitations

Height is supplied by the participant; a monocular video does not determine an
absolute scale. Fitted clothing, visible head and feet, a stationary camera and
a slow turn are required by the current pipeline. Confidence reflects agreement
between model estimates and is not a calibrated probability of accuracy.

For private evaluation, copy `data/ground_truth.example.csv` to the ignored
`data/ground_truth.csv`. The example is synthetic and provides no evidence of
accuracy. Use opaque session labels, centimetres and empty cells for missing tape
measurements. Keep recordings under ignored `data/videos/` and derived results
under ignored `out/`, or use a separate access-controlled research directory.

Take repeat tape measurements with a documented protocol and collect a diverse,
sufficient sample before making accuracy claims. `scripts/evaluate.py` compares
private measurements to JSON twins and withholds some verdicts with small samples:

```sh
uv run python scripts/evaluate.py --truth data/ground_truth.csv --twins out/
```

The old internal experiment diary, personal measurements and presentations are
not part of the public source distribution. Current numerical defaults are research
parameters; changing the estimator, camera assumptions or frame reconciliation
requires new evaluation. Reweighting frames does not establish ground-truth accuracy.
